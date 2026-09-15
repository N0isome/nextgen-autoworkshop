import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PoolClient, QueryResultRow } from 'pg';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { ApprovalRequestDto, DeliverDto, EvaluationDto, ReadyDto, ReasonDto, WorkDto } from './dto/service-command.dto';

type Stage = 'RECEIVED' | 'EVALUATED' | 'WORKING' | 'READY' | 'DELIVERED';
type NextAction = { type: string; label: string; enabled: boolean; reason_disabled?: string };
type QueryExecutor = { query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }> };
type ServiceRow = {
  id: string; tenant_id: string; workshop_id: string; customer_id: string; vehicle_id: string; concern: string;
  stage: Stage; status: string; is_paused: boolean; pause_reason: string | null; cancelled_at: string | null;
  cancelled_reason: string | null; work_summary: string | null; internal_note: string | null; ready_at: string | null;
  delivered_at: string | null; delivery_notes: string | null; updated_at: string; created_at: string;
  make?: string; model?: string; model_year?: number | null; plate?: string | null; customer_name?: string;
  has_pending_approval?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

@Injectable()
export class ServicesService {
  constructor(private readonly database: DatabaseService) {}

  async inbox(context: RequestContext, bucket?: string) {
    const stages: Record<string, Stage[]> = { TO_REVIEW: ['RECEIVED'], IN_PROGRESS: ['EVALUATED', 'WORKING'], READY: ['READY'] };
    if (bucket && !stages[bucket]) throw new BadRequestException('bucket debe ser TO_REVIEW, IN_PROGRESS o READY.');
    const values: unknown[] = [context.tenantId, context.workshopId];
    const filter = bucket ? ` AND w.stage = $3` : '';
    if (bucket) values.push(stages[bucket][0]);
    const rows = await this.database.query<ServiceRow>(
      `SELECT w.*, v.make, v.model, v.model_year, v.plate, c.display_name AS customer_name,
        EXISTS (SELECT 1 FROM approval_requests a WHERE a.work_order_id=w.id AND a.status='PENDING') AS has_pending_approval,
        CASE WHEN w.stage='READY' THEN 400
          WHEN EXISTS (SELECT 1 FROM approval_requests a WHERE a.work_order_id=w.id AND a.status IN ('APPROVED','REJECTED') AND a.responded_at >= w.updated_at - interval '24 hours') THEN 300
          WHEN w.stage='RECEIVED' THEN 200 ELSE 100 END AS priority
       FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id
       JOIN customers c ON c.id=w.customer_id
       WHERE w.tenant_id=$1 AND w.workshop_id=$2 AND w.cancelled_at IS NULL AND w.stage <> 'DELIVERED'${filter}
       ORDER BY priority DESC, w.updated_at ASC, w.id ASC`, values);
    const counts = await this.database.query<{ stage: Stage; count: number }>(
      `SELECT stage, count(*)::int AS count FROM work_orders
       WHERE tenant_id=$1 AND workshop_id=$2 AND cancelled_at IS NULL AND stage <> 'DELIVERED' GROUP BY stage`,
      [context.tenantId, context.workshopId],
    );
    const count = Object.fromEntries(['RECEIVED', 'EVALUATED', 'WORKING', 'READY'].map(stage => [stage, 0]));
    for (const item of counts.rows) count[item.stage] = item.count;
    return { generated_at: new Date().toISOString(), counts: { to_review: count.RECEIVED, in_progress: count.EVALUATED + count.WORKING, ready: count.READY }, items: rows.rows.map(row => this.inboxItem(row)) };
  }

  async findOne(context: RequestContext, id: string) {
    return this.readView(this.database, context, id);
  }

  async saveEvaluation(context: RequestContext, id: string, key: string | undefined, dto: EvaluationDto) {
    return this.command(context, key, 'save_evaluation', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (order.stage !== 'RECEIVED' || order.cancelled_at) throw new ConflictException('El servicio no está disponible para registrar evaluación.');
      const session = await client.query<{ id: string }>(`SELECT id FROM diagnostic_sessions WHERE id=$1 AND work_order_id=$2 AND tenant_id=$3 AND workshop_id=$4`, [dto.diagnosticSessionId, id, context.tenantId, context.workshopId]);
      if (!session.rowCount) throw new ConflictException('La sesión de diagnóstico no corresponde a este servicio.');
      const unresolved = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM diagnostic_codes c
        WHERE c.session_id=$1 AND NOT EXISTS (SELECT 1 FROM diagnostic_feedback f WHERE f.diagnostic_session_id=$1 AND f.dtc_code=c.code AND (f.useful=true OR f.manual_solution_saved=true))`, [dto.diagnosticSessionId]);
      if (unresolved.rows[0].count > 0) throw new ConflictException('Hay DTC pendientes de validar antes de cerrar la evaluación.');
      await client.query(`UPDATE work_orders SET stage='EVALUATED', status='DIAGNOSING', updated_at=NOW(), version=version+1 WHERE id=$1`, [id]);
      await this.record(client, context, id, 'Service.Evaluated.v1', { diagnosticSessionId: dto.diagnosticSessionId });
      return this.readView(client, context, id);
    });
  }

  async registerWork(context: RequestContext, id: string, key: string | undefined, dto: WorkDto) {
    return this.command(context, key, 'register_work', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      this.requireWorkingCandidate(order);
      await client.query(`UPDATE work_orders SET stage='WORKING', status='IN_PROGRESS', work_summary=$1, internal_note=$2, updated_at=NOW(), version=version+1 WHERE id=$3`, [dto.workSummary.trim(), dto.internalNote?.trim() || null, id]);
      await this.record(client, context, id, 'Service.WorkRegistered.v1', { workSummary: dto.workSummary.trim() });
      return this.readView(client, context, id);
    });
  }

  async markReady(context: RequestContext, id: string, key: string | undefined, dto: ReadyDto) {
    return this.command(context, key, 'mark_ready', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (order.stage !== 'WORKING' || !order.work_summary?.trim() || order.cancelled_at) throw new ConflictException('Registra el trabajo realizado antes de marcar el vehículo listo.');
      await client.query(`UPDATE work_orders SET stage='READY', status='READY_FOR_DELIVERY', ready_at=NOW(), updated_at=NOW(), version=version+1 WHERE id=$1`, [id]);
      await this.record(client, context, id, 'Service.Ready.v1', { note: dto.note?.trim() || null });
      return this.readView(client, context, id);
    });
  }

  async deliver(context: RequestContext, id: string, key: string | undefined, dto: DeliverDto) {
    return this.command(context, key, 'deliver_service', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (order.stage !== 'READY' || order.cancelled_at) throw new ConflictException('Solo un vehículo listo para retiro puede entregarse.');
      await client.query(`UPDATE work_orders SET stage='DELIVERED', status='CLOSED', delivery_notes=$1, delivered_at=NOW(), updated_at=NOW(), version=version+1 WHERE id=$2`, [dto.deliveryNote?.trim() || null, id]);
      await this.record(client, context, id, 'Service.Delivered.v1', { deliveryNote: dto.deliveryNote?.trim() || null });
      return this.readView(client, context, id);
    });
  }

  async pause(context: RequestContext, id: string, key: string | undefined, dto: ReasonDto) {
    return this.command(context, key, 'pause_service', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (order.cancelled_at || order.stage === 'DELIVERED') throw new ConflictException('Este servicio no puede pausarse.');
      await client.query(`UPDATE work_orders SET is_paused=true, pause_reason=$1, updated_at=NOW(), version=version+1 WHERE id=$2`, [dto.reason.trim(), id]);
      await this.record(client, context, id, 'Service.Paused.v1', { reason: dto.reason.trim(), stage: order.stage });
      return this.readView(client, context, id);
    });
  }

  async resume(context: RequestContext, id: string, key: string | undefined) {
    return this.command(context, key, 'resume_service', { id }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (!order.is_paused || order.cancelled_at) throw new ConflictException('Este servicio no está pausado.');
      await client.query(`UPDATE work_orders SET is_paused=false, pause_reason=NULL, updated_at=NOW(), version=version+1 WHERE id=$1`, [id]);
      await this.record(client, context, id, 'Service.Resumed.v1', { stage: order.stage });
      return this.readView(client, context, id);
    });
  }

  async cancel(context: RequestContext, id: string, key: string | undefined, dto: ReasonDto) {
    return this.command(context, key, 'cancel_service', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (order.cancelled_at || order.stage === 'DELIVERED') throw new ConflictException('Este servicio no puede cancelarse.');
      await client.query(`UPDATE work_orders SET cancelled_at=NOW(), cancelled_reason=$1, is_paused=false, pause_reason=NULL, status='CANCELLED', updated_at=NOW(), version=version+1 WHERE id=$2`, [dto.reason.trim(), id]);
      await this.record(client, context, id, 'Service.Cancelled.v1', { reason: dto.reason.trim(), stage: order.stage });
      return this.readView(client, context, id);
    });
  }

  async reopen(context: RequestContext, id: string, key: string | undefined, dto: ReasonDto) {
    return this.command(context, key, 'reopen_service', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (!order.cancelled_at && !['READY', 'DELIVERED'].includes(order.stage)) throw new ConflictException('Solo se puede reabrir un servicio cancelado, listo o entregado.');
      await client.query(`UPDATE work_orders SET stage='WORKING', status='IN_PROGRESS', cancelled_at=NULL, cancelled_reason=NULL, is_paused=false, pause_reason=NULL, reopened_at=NOW(), updated_at=NOW(), version=version+1 WHERE id=$1`, [id]);
      await this.record(client, context, id, 'Service.Reopened.v1', { reason: dto.reason.trim(), previousStage: order.stage });
      return this.readView(client, context, id);
    });
  }

  async requestApproval(context: RequestContext, id: string, key: string | undefined, dto: ApprovalRequestDto) {
    return this.command(context, key, 'request_approval', { id, ...dto }, async (client) => {
      const order = await this.lockOrder(client, context, id);
      if (!['EVALUATED', 'WORKING'].includes(order.stage) || order.cancelled_at) throw new ConflictException('Solo se puede solicitar aprobación durante la evaluación o el trabajo.');
      try {
        const approvalId = randomUUID();
        await client.query(`INSERT INTO approval_requests (id,tenant_id,workshop_id,work_order_id,description,estimated_amount,requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [approvalId, context.tenantId, context.workshopId, id, dto.description.trim(), dto.estimatedAmount ?? null, context.actorId]);
        await this.record(client, context, id, 'Service.ApprovalRequested.v1', { approvalId, description: dto.description.trim() });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ConflictException('Ya existe una solicitud de aprobación pendiente para este servicio.');
        throw error;
      }
      return this.readView(client, context, id);
    });
  }

  async withdrawApproval(context: RequestContext, id: string, approvalId: string, key: string | undefined, dto: ReasonDto) {
    return this.command(context, key, 'withdraw_approval', { id, approvalId, ...dto }, async (client) => {
      await this.lockOrder(client, context, id);
      const approval = await client.query(`UPDATE approval_requests SET status='WITHDRAWN', responded_at=NOW(), response_reason=$1 WHERE id=$2 AND work_order_id=$3 AND tenant_id=$4 AND workshop_id=$5 AND status='PENDING' RETURNING id`, [dto.reason.trim(), approvalId, id, context.tenantId, context.workshopId]);
      if (!approval.rowCount) throw new ConflictException('No existe una solicitud pendiente que se pueda retirar.');
      await this.record(client, context, id, 'Service.ApprovalWithdrawn.v1', { approvalId, reason: dto.reason.trim() });
      return this.readView(client, context, id);
    });
  }

  private async command<T>(context: RequestContext, key: string | undefined, command: string, payload: unknown, operation: (client: PoolClient) => Promise<T>) {
    if (!key || !UUID.test(key)) throw new BadRequestException('Idempotency-Key debe ser un UUID por intento de acción.');
    const requestHash = createHash('sha256').update(stable({ command, payload })).digest('hex');
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ request_hash: string; response_body: T }>(`SELECT request_hash, response_body FROM idempotency_keys WHERE tenant_id=$1 AND workshop_id=$2 AND idempotency_key=$3 FOR UPDATE`, [context.tenantId, context.workshopId, key]);
      if (existing.rowCount) {
        if (existing.rows[0].request_hash !== requestHash) throw new ConflictException('La Idempotency-Key ya fue usada con otra operación.');
        return existing.rows[0].response_body;
      }
      const response = await operation(client);
      await client.query(`INSERT INTO idempotency_keys (idempotency_key,tenant_id,workshop_id,request_hash,response_body) VALUES ($1,$2,$3,$4,$5::jsonb)`, [key, context.tenantId, context.workshopId, requestHash, JSON.stringify(response)]);
      return response;
    });
  }

  private async lockOrder(client: PoolClient, context: RequestContext, id: string) {
    const result = await client.query<ServiceRow>(`SELECT * FROM work_orders WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3 FOR UPDATE`, [id, context.tenantId, context.workshopId]);
    if (!result.rowCount) throw new NotFoundException('Servicio no encontrado.');
    return result.rows[0];
  }

  private requireWorkingCandidate(order: ServiceRow) {
    if (!['EVALUATED', 'WORKING'].includes(order.stage) || order.cancelled_at || order.is_paused) throw new ConflictException('El servicio debe estar evaluado, activo y disponible para registrar trabajo.');
  }

  private async readView(executor: QueryExecutor, context: RequestContext, id: string) {
    const result = await executor.query<ServiceRow>(`SELECT w.*, v.make, v.model, v.model_year, v.plate, c.display_name AS customer_name,
      EXISTS (SELECT 1 FROM approval_requests a WHERE a.work_order_id=w.id AND a.status='PENDING') AS has_pending_approval
      FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id JOIN customers c ON c.id=w.customer_id
      WHERE w.id=$1 AND w.tenant_id=$2 AND w.workshop_id=$3`, [id, context.tenantId, context.workshopId]);
    if (!result.rowCount) throw new NotFoundException('Servicio no encontrado.');
    const row = result.rows[0];
    const [approvals, timeline] = await Promise.all([
      executor.query(`SELECT id, description, estimated_amount, status, requested_at, responded_at, response_reason FROM approval_requests WHERE work_order_id=$1 ORDER BY requested_at DESC`, [id]),
      executor.query(`SELECT id, event_type, actor_id, occurred_at, payload FROM service_events WHERE work_order_id=$1 ORDER BY occurred_at DESC, id DESC`, [id]),
    ]);
    return {
      service: { id: row.id, concern: row.concern, stage: row.stage, created_at: row.created_at, updated_at: row.updated_at, ready_at: row.ready_at, delivered_at: row.delivered_at },
      vehicle: { id: row.vehicle_id, make: row.make, model: row.model, model_year: row.model_year, plate: row.plate },
      customer: { id: row.customer_id, display_name: row.customer_name },
      flags: { is_paused: row.is_paused, pause_reason: row.pause_reason, has_pending_approval: Boolean(row.has_pending_approval), cancelled_at: row.cancelled_at, cancelled_reason: row.cancelled_reason },
      work: { summary: row.work_summary, internal_note: row.internal_note },
      delivery: { notes: row.delivery_notes },
      next_action: this.nextAction(row),
      approvals: approvals.rows,
      timeline: timeline.rows,
    };
  }

  private inboxItem(row: ServiceRow) {
    return {
      id: row.id, vehicle: { make: row.make, model: row.model, model_year: row.model_year, plate: row.plate }, customer_display_name: row.customer_name,
      stage: row.stage, last_activity_at: row.updated_at, priority: this.priority(row),
      flags: { is_paused: row.is_paused, has_pending_approval: Boolean(row.has_pending_approval) }, next_action: this.nextAction(row),
    };
  }

  private priority(row: ServiceRow) { return row.stage === 'READY' ? 400 : row.stage === 'RECEIVED' ? 200 : 100; }
  private nextAction(row: ServiceRow): NextAction {
    if (row.cancelled_at) return { type: 'NONE', label: 'Servicio cerrado', enabled: false, reason_disabled: row.cancelled_reason || undefined };
    if (row.is_paused) return { type: 'RESUME_SERVICE', label: 'Reanudar servicio', enabled: true };
    if (row.has_pending_approval) return { type: 'WAIT_APPROVAL', label: 'Esperando confirmación del cliente', enabled: false, reason_disabled: 'La aprobación sigue pendiente.' };
    if (row.stage === 'RECEIVED') return { type: 'SAVE_EVALUATION', label: 'Registrar evaluación', enabled: true };
    if (row.stage === 'EVALUATED') return { type: 'REGISTER_WORK', label: 'Registrar trabajo', enabled: true };
    if (row.stage === 'WORKING') return row.work_summary?.trim() ? { type: 'MARK_READY', label: 'Marcar listo para retiro', enabled: true } : { type: 'REGISTER_WORK', label: 'Registrar trabajo', enabled: true };
    if (row.stage === 'READY') return { type: 'DELIVER_SERVICE', label: 'Registrar entrega', enabled: true };
    return { type: 'VIEW_REPORT', label: 'Ver informe', enabled: true };
  }

  private async record(client: PoolClient, context: RequestContext, orderId: string, eventType: string, payload: unknown) {
    const eventId = randomUUID(); const occurredAt = new Date().toISOString(); const payloadJson = JSON.stringify(payload);
    await client.query(`INSERT INTO service_events (id,tenant_id,workshop_id,work_order_id,event_type,actor_id,occurred_at,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [eventId, context.tenantId, context.workshopId, orderId, eventType, context.actorId, occurredAt, payloadJson]);
    const previous = await client.query<{ event_hash: string }>('SELECT event_hash FROM audit_events WHERE tenant_id=$1 ORDER BY occurred_at DESC LIMIT 1', [context.tenantId]);
    const previousHash = previous.rows[0]?.event_hash ?? createHash('sha256').update('GENESIS').digest('hex');
    const eventHash = createHash('sha256').update([previousHash, eventId, eventType, orderId, occurredAt, payloadJson].join('|')).digest('hex');
    await client.query(`INSERT INTO audit_events (id,tenant_id,workshop_id,aggregate_type,aggregate_id,event_type,actor_id,device_id,occurred_at,payload,previous_hash,event_hash) VALUES ($1,$2,$3,'service',$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [eventId, context.tenantId, context.workshopId, orderId, eventType, context.actorId, context.deviceId, occurredAt, payloadJson, previousHash, eventHash]);
    await client.query(`INSERT INTO outbox_events (id,tenant_id,workshop_id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES ($1,$2,$3,'service',$4,$5,$6::jsonb,$7)`, [eventId, context.tenantId, context.workshopId, orderId, eventType, payloadJson, occurredAt]);
  }
}

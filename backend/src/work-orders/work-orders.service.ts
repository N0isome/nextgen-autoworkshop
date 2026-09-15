import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { ALLOWED_TRANSITIONS, WorkOrderStatus } from './work-orders.types';

type WorkOrderRow = { id: string; status: WorkOrderStatus; version: number; [key: string]: unknown };

const ORDER_DETAILS = `SELECT w.*, v.make, v.model, v.model_year, v.plate, v.vin, v.engine,
  c.display_name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
  r.odometer_km, r.fuel_level_percent, r.exterior_condition, r.received_at, r.bay_label, r.notes,
  COALESCE(d.dtc_count,0)::int AS dtc_count, COALESCE(d.critical_count,0)::int AS critical_count
  FROM work_orders w
  JOIN vehicles v ON v.id=w.vehicle_id AND v.tenant_id=w.tenant_id AND v.workshop_id=w.workshop_id
  JOIN customers c ON c.id=w.customer_id AND c.tenant_id=w.tenant_id AND c.workshop_id=w.workshop_id
  LEFT JOIN vehicle_receptions r ON r.work_order_id=w.id AND r.tenant_id=w.tenant_id AND r.workshop_id=w.workshop_id
  LEFT JOIN LATERAL (SELECT count(*) AS dtc_count, count(*) FILTER (WHERE k.severity='critical') AS critical_count
    FROM diagnostic_codes dc LEFT JOIN dtc_knowledge k ON k.code=dc.code
    WHERE dc.session_id=(SELECT s.id FROM diagnostic_sessions s
      WHERE s.work_order_id=w.id AND s.tenant_id=w.tenant_id AND s.workshop_id=w.workshop_id
      ORDER BY s.scanned_at DESC, s.id DESC LIMIT 1)) d ON true`;

@Injectable()
export class WorkOrdersService {
  constructor(private readonly database: DatabaseService) {}

  async create(context: RequestContext, dto: CreateWorkOrderDto) {
    return this.database.transaction(async (client) => {
      const id = randomUUID();
      const workOrder = await client.query<WorkOrderRow>(
        `INSERT INTO work_orders (id, tenant_id, workshop_id, customer_id, vehicle_id, concern, status, public_tracking_token)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7) RETURNING *`,
        [id, context.tenantId, context.workshopId, dto.customerId, dto.vehicleId, dto.concern, this.trackingToken()],
      );
      await this.auditAndOutbox(client, context, 'work_order', id, 'WorkOrder.Created.v1', workOrder.rows[0]);
      return workOrder.rows[0];
    });
  }

  async list(context: RequestContext, offset = 0) {
    const result = await this.database.query<WorkOrderRow>(
      `${ORDER_DETAILS} WHERE w.tenant_id=$1 AND w.workshop_id=$2 ORDER BY w.created_at DESC, w.id DESC LIMIT 100 OFFSET $3`,
      [context.tenantId, context.workshopId, offset],
    );
    return result.rows;
  }

  async findOne(context: RequestContext, id: string) {
    const result = await this.database.query<WorkOrderRow>(
      `${ORDER_DETAILS} WHERE w.id=$1 AND w.tenant_id=$2 AND w.workshop_id=$3`,
      [id, context.tenantId, context.workshopId],
    );
    if (!result.rowCount) throw new NotFoundException('Work order not found');
    const timeline = await this.database.query(`SELECT id, event_type, occurred_at, payload, actor_id
      FROM audit_events WHERE aggregate_id=$1 AND tenant_id=$2 AND workshop_id=$3 ORDER BY occurred_at, id`,
      [id, context.tenantId, context.workshopId]);
    return { ...result.rows[0], timeline: timeline.rows };
  }

  async transition(context: RequestContext, id: string, dto: TransitionWorkOrderDto) {
    return this.database.transaction(async (client) => {
      const existing = await client.query<WorkOrderRow>(
        `SELECT * FROM work_orders WHERE id = $1 AND tenant_id = $2 AND workshop_id = $3 FOR UPDATE`,
        [id, context.tenantId, context.workshopId],
      );
      if (!existing.rowCount) throw new NotFoundException('Work order not found');
      const workOrder = existing.rows[0];
      if (!ALLOWED_TRANSITIONS[workOrder.status].includes(dto.toStatus)) {
        throw new ConflictException(`Transition from ${workOrder.status} to ${dto.toStatus} is not allowed`);
      }
      if (['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY_FOR_DELIVERY', 'CLOSED'].includes(dto.toStatus)) {
        const pending = await client.query<{ count: number }>(`SELECT count(*)::int AS count
          FROM diagnostic_sessions s JOIN diagnostic_codes c ON c.session_id=s.id
          LEFT JOIN LATERAL (SELECT f.useful, f.manual_solution_saved FROM diagnostic_feedback f
            WHERE f.diagnostic_session_id=s.id AND f.dtc_code=c.code AND f.tenant_id=$2 AND f.workshop_id=$3
            ORDER BY f.updated_at DESC, f.id DESC LIMIT 1) feedback ON true
          WHERE s.work_order_id=$1 AND s.tenant_id=$2 AND s.workshop_id=$3
          AND NOT COALESCE(feedback.useful OR feedback.manual_solution_saved, false)`, [id, context.tenantId, context.workshopId]);
        if (pending.rows[0].count > 0) throw new ConflictException('Hay DTC pendientes: valida el diagnóstico o guarda la solución real del taller antes de continuar.');
      }
      const hasDeliveryDetails = Boolean(dto.completedWork?.trim() || dto.deliveryNotes?.trim());
      const isClosing = dto.toStatus === 'CLOSED';
      const updated = await client.query<WorkOrderRow>(
        hasDeliveryDetails
          ? `UPDATE work_orders SET status=$1, version=version+1, updated_at=NOW(),
               completed_work=COALESCE($4, completed_work), delivery_notes=COALESCE($5, delivery_notes),
               delivered_at=CASE WHEN $1='CLOSED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
             WHERE id=$2 AND version=$3 RETURNING *`
          : isClosing
            ? `UPDATE work_orders SET status=$1, version=version+1, updated_at=NOW(), delivered_at=COALESCE(delivered_at, NOW()) WHERE id=$2 AND version=$3 RETURNING *`
            : `UPDATE work_orders SET status=$1, version=version+1, updated_at=NOW() WHERE id=$2 AND version=$3 RETURNING *`,
        hasDeliveryDetails
          ? [dto.toStatus, id, workOrder.version, dto.completedWork?.trim() || null, dto.deliveryNotes?.trim() || null]
          : [dto.toStatus, id, workOrder.version],
      );
      if (!updated.rowCount) throw new ConflictException('Work order was modified concurrently');
      await this.auditAndOutbox(client, context, 'work_order', id, 'WorkOrder.StatusChanged.v1', {
        fromStatus: workOrder.status, toStatus: dto.toStatus, reason: dto.reason ?? null, completedWork: dto.completedWork ?? null, deliveryNotes: dto.deliveryNotes ?? null, version: updated.rows[0].version,
      });
      return updated.rows[0];
    });
  }

  async getPublicLink(context: RequestContext, id: string) {
    return this.database.transaction(async (client) => {
      const order = await client.query<{ public_tracking_token: string | null }>(
        `SELECT public_tracking_token FROM work_orders WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3 FOR UPDATE`,
        [id, context.tenantId, context.workshopId],
      );
      if (!order.rowCount) throw new NotFoundException('Work order not found');
      let token = order.rows[0].public_tracking_token;
      if (!token) {
        token = this.trackingToken();
        await client.query(`UPDATE work_orders SET public_tracking_token=$1, updated_at=NOW() WHERE id=$2`, [token, id]);
      }
      return { token, path: `/estado/${token}` };
    });
  }

  async getPublicStatus(token: string) {
    const result = await this.database.query<{
      status: WorkOrderStatus; updated_at: string; delivered_at: string | null; completed_work: string | null; delivery_notes: string | null;
      make: string; model: string; model_year: number | null; plate: string | null; name: string;
    }>(`SELECT w.status, w.updated_at, w.delivered_at, w.completed_work, w.delivery_notes,
        v.make, v.model, v.model_year, v.plate, ws.name
       FROM work_orders w JOIN vehicles v ON v.id=w.vehicle_id
       JOIN workshops ws ON ws.id=w.workshop_id
       WHERE w.public_tracking_token=$1`, [token]);
    if (!result.rowCount) throw new NotFoundException('Enlace de seguimiento no encontrado');
    const row = result.rows[0];
    return {
      workshop: row.name, vehicle: `${row.make} ${row.model}${row.model_year ? ` ${row.model_year}` : ''}`,
      plate: this.maskPlate(row.plate), stage: this.publicStage(row.status), status: row.status,
      updatedAt: row.updated_at, deliveredAt: row.delivered_at, report: row.status === 'CLOSED' ? {
        completedWork: row.completed_work || 'Trabajo finalizado.', deliveryNotes: row.delivery_notes || null,
      } : null,
    };
  }

  private trackingToken() { return randomBytes(24).toString('base64url'); }
  private maskPlate(value: string | null) { return value && value.length > 3 ? `${value.slice(0, -3)}***` : 'Vehículo registrado'; }
  private publicStage(status: WorkOrderStatus) {
    if (status === 'CLOSED') return 'Entregado';
    if (status === 'READY_FOR_DELIVERY') return 'Listo para entrega';
    if (['IN_PROGRESS', 'QUALITY_CHECK', 'ON_HOLD'].includes(status)) return 'En reparación';
    if (['DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED'].includes(status)) return 'En diagnóstico';
    return 'Ingresado al taller';
  }

  private async auditAndOutbox(
    client: PoolClient,
    context: RequestContext,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: unknown,
  ) {
    const previous = await client.query<{ event_hash: string }>(
      `SELECT event_hash FROM audit_events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [context.tenantId],
    );
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    const previousHash = previous.rows[0]?.event_hash ?? createHash('sha256').update('GENESIS').digest('hex');
    const eventHash = createHash('sha256')
      .update([previousHash, eventId, eventType, aggregateId, occurredAt, payloadJson].join('|'))
      .digest('hex');
    await client.query(
      `INSERT INTO audit_events (id, tenant_id, workshop_id, aggregate_type, aggregate_id, event_type, actor_id, device_id, occurred_at, payload, previous_hash, event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [eventId, context.tenantId, context.workshopId, aggregateType, aggregateId, eventType, context.actorId, context.deviceId, occurredAt, payloadJson, previousHash, eventHash],
    );
    await client.query(
      `INSERT INTO outbox_events (id, tenant_id, workshop_id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [eventId, context.tenantId, context.workshopId, aggregateType, aggregateId, eventType, payloadJson, occurredAt],
    );
  }
}

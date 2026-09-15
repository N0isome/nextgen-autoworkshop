import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';

export function reportPeriod(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400000);
  const span = end.getTime() - start.getTime();
  if (!Number.isFinite(span) || span <= 0 || span > 367 * 86400000) {
    throw new BadRequestException('Selecciona un período válido de hasta un año.');
  }
  return { from: start.toISOString(), to: end.toISOString(), previousFrom: new Date(start.getTime() - span).toISOString() };
}

@Injectable()
export class WorkshopOverviewService {
  constructor(private readonly database: DatabaseService) {}

  async overview(context: RequestContext, from?: string, to?: string) {
    const period = reportPeriod(from, to);
    const scope = [context.tenantId, context.workshopId];
    const [current, previous, workflow, plant, sync, bays, daily] = await Promise.all([
      this.metrics(scope, period.from, period.to),
      this.metrics(scope, period.previousFrom, period.from),
      this.database.query(`SELECT status, count(*)::int AS count,
        avg(EXTRACT(EPOCH FROM (now()-updated_at))/3600)::float AS "averageHours"
        FROM work_orders WHERE tenant_id=$1 AND workshop_id=$2
        AND status NOT IN ('CLOSED','CANCELLED','DRAFT') GROUP BY status`, scope),
      this.database.query(`SELECT status, count(*)::int AS count FROM (
        SELECT DISTINCT ON (vehicle_id) vehicle_id, status FROM work_orders
        WHERE tenant_id=$1 AND workshop_id=$2 AND status NOT IN ('CLOSED','CANCELLED','DRAFT')
        ORDER BY vehicle_id, created_at DESC, id DESC) current_vehicle GROUP BY status`, scope),
      this.database.query(`SELECT count(*) FILTER (WHERE published_at IS NULL)::int AS pending,
        max(published_at) AS "lastPublishedAt" FROM outbox_events WHERE tenant_id=$1 AND workshop_id=$2`, scope),
      this.database.query(`SELECT r.bay_label AS label, count(*)::int AS count FROM vehicle_receptions r
        JOIN work_orders w ON w.id=r.work_order_id AND w.tenant_id=r.tenant_id AND w.workshop_id=r.workshop_id
        WHERE w.tenant_id=$1 AND w.workshop_id=$2 AND w.status NOT IN ('CLOSED','CANCELLED','DRAFT')
        AND r.bay_label IS NOT NULL GROUP BY r.bay_label ORDER BY r.bay_label`, scope),
      this.database.query(`SELECT to_char(scanned_at AT TIME ZONE 'America/Santiago','YYYY-MM-DD') AS date,
        count(*)::int AS count FROM diagnostic_sessions WHERE tenant_id=$1 AND workshop_id=$2
        AND scanned_at >= $3 AND scanned_at < $4 GROUP BY 1 ORDER BY 1`, [...scope, period.from, period.to]),
    ]);
    return { generatedAt: new Date().toISOString(), period, current, previous,
      workflow: workflow.rows, plant: plant.rows, sync: sync.rows[0], bays: bays.rows, dailyDiagnostics: daily.rows };
  }

  private async metrics(scope: string[], from: string, to: string) {
    const result = await this.database.query(`WITH cohort AS (
        SELECT * FROM work_orders WHERE tenant_id=$1 AND workshop_id=$2 AND created_at >= $3 AND created_at < $4
      ), closures AS (
        SELECT * FROM work_orders WHERE tenant_id=$1 AND workshop_id=$2 AND status='CLOSED'
        AND updated_at >= $3 AND updated_at < $4
      ), scans AS (
        SELECT id FROM diagnostic_sessions WHERE tenant_id=$1 AND workshop_id=$2 AND scanned_at >= $3 AND scanned_at < $4
      ) SELECT
        (SELECT count(*)::int FROM cohort) AS received,
        (SELECT count(*)::int FROM closures) AS closed,
        (SELECT avg(EXTRACT(EPOCH FROM (updated_at-created_at))/3600)::float FROM closures) AS "averageCycleHours",
        (SELECT count(*)::int FROM cohort WHERE status<>'CANCELLED') AS eligible,
        (SELECT count(*)::int FROM cohort WHERE status='CLOSED') AS completed,
        (SELECT count(*)::int FROM scans) AS diagnostics,
        (SELECT count(*)::int FROM diagnostic_codes c JOIN scans s ON s.id=c.session_id
          JOIN dtc_knowledge k ON k.code=c.code WHERE k.severity='critical') AS "criticalDtcs"`, [...scope, from, to]);
    return result.rows[0];
  }
}

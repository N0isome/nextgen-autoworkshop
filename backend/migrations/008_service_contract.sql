-- Fase 11.0: progreso lineal separado de condiciones operacionales.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS stage varchar(16);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancelled_reason text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_summary text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS internal_note text;

-- This is deliberately deterministic. A DIAGNOSING order is evaluated only
-- when it has a linked session with codes and every code has resolved feedback.
UPDATE work_orders w
SET stage = CASE
  WHEN w.status = 'CLOSED' THEN 'DELIVERED'
  WHEN w.status = 'READY_FOR_DELIVERY' THEN 'READY'
  WHEN w.status IN ('IN_PROGRESS', 'QUALITY_CHECK') THEN 'WORKING'
  WHEN w.status IN ('WAITING_APPROVAL', 'APPROVED') THEN 'EVALUATED'
  WHEN w.status = 'DIAGNOSING' AND EXISTS (
    SELECT 1 FROM diagnostic_sessions s
    WHERE s.work_order_id = w.id
      AND EXISTS (SELECT 1 FROM diagnostic_codes c WHERE c.session_id = s.id)
      AND NOT EXISTS (
        SELECT 1 FROM diagnostic_codes c
        WHERE c.session_id = s.id
          AND NOT EXISTS (
            SELECT 1 FROM diagnostic_feedback f
            WHERE f.diagnostic_session_id = s.id AND f.dtc_code = c.code
              AND (f.useful = true OR f.manual_solution_saved = true)
          )
      )
  ) THEN 'EVALUATED'
  ELSE 'RECEIVED'
END
WHERE stage IS NULL;

UPDATE work_orders
SET is_paused = true, pause_reason = COALESCE(pause_reason, 'Migrado desde orden en pausa')
WHERE status = 'ON_HOLD';

UPDATE work_orders
SET cancelled_at = COALESCE(cancelled_at, updated_at),
    cancelled_reason = COALESCE(cancelled_reason, 'Migrado desde orden cancelada')
WHERE status = 'CANCELLED';

ALTER TABLE work_orders ALTER COLUMN stage SET NOT NULL;
ALTER TABLE work_orders ALTER COLUMN stage SET DEFAULT 'RECEIVED';
ALTER TABLE work_orders ADD CONSTRAINT work_orders_stage_check CHECK (stage IN ('RECEIVED','EVALUATED','WORKING','READY','DELIVERED'));
CREATE INDEX IF NOT EXISTS work_orders_service_inbox_idx ON work_orders (tenant_id, workshop_id, stage, updated_at);
CREATE INDEX IF NOT EXISTS work_orders_service_ready_idx ON work_orders (tenant_id, workshop_id, ready_at) WHERE cancelled_at IS NULL;

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workshop_id uuid NOT NULL REFERENCES workshops(id),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  description text NOT NULL,
  estimated_amount numeric(12,2),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  response_reason text
);
CREATE UNIQUE INDEX approval_requests_one_pending_idx ON approval_requests (work_order_id) WHERE status = 'PENDING';
CREATE INDEX approval_requests_service_status_idx ON approval_requests (work_order_id, status, requested_at DESC);

CREATE TABLE service_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workshop_id uuid NOT NULL REFERENCES workshops(id),
  work_order_id uuid NOT NULL REFERENCES work_orders(id),
  event_type text NOT NULL,
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX service_events_order_idx ON service_events (work_order_id, occurred_at DESC);

CREATE TABLE idempotency_keys (
  idempotency_key uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workshop_id uuid NOT NULL REFERENCES workshops(id),
  request_hash char(64) NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, workshop_id, idempotency_key)
);

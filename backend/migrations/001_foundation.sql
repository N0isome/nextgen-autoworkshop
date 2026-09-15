CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE work_order_status AS ENUM (
  'DRAFT', 'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS',
  'QUALITY_CHECK', 'READY_FOR_DELIVERY', 'CLOSED', 'ON_HOLD', 'CANCELLED'
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Madrid',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id),
  display_name text NOT NULL, email text, phone text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), customer_id uuid NOT NULL REFERENCES customers(id),
  vin varchar(17), plate varchar(15), make text, model text, model_year smallint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_identity CHECK (vin IS NOT NULL OR plate IS NOT NULL), UNIQUE NULLS NOT DISTINCT (tenant_id, vin), UNIQUE NULLS NOT DISTINCT (tenant_id, plate)
);
CREATE TABLE work_orders (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), customer_id uuid NOT NULL REFERENCES customers(id), vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  concern text NOT NULL, status work_order_status NOT NULL DEFAULT 'DRAFT', version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, event_type text NOT NULL,
  actor_id uuid NOT NULL, device_id text NOT NULL, occurred_at timestamptz NOT NULL, payload jsonb NOT NULL, previous_hash char(64) NOT NULL, event_hash char(64) NOT NULL UNIQUE
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, occurred_at timestamptz NOT NULL, published_at timestamptz, retry_count integer NOT NULL DEFAULT 0
);
CREATE INDEX work_orders_scope_idx ON work_orders (tenant_id, workshop_id, created_at DESC);
CREATE INDEX audit_events_scope_idx ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX outbox_pending_idx ON outbox_events (published_at, occurred_at) WHERE published_at IS NULL;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_work_orders ON work_orders USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

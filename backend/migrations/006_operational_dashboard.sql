-- Additive changes for ticket diagnostics and operational reporting. No historical
-- scan is assigned to an order by guessing: existing sessions remain unlinked.
ALTER TABLE diagnostic_sessions ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id);
CREATE INDEX IF NOT EXISTS diagnostic_sessions_order_idx ON diagnostic_sessions (work_order_id, scanned_at DESC);
ALTER TABLE diagnostic_feedback ADD COLUMN IF NOT EXISTS manual_solution_saved boolean NOT NULL DEFAULT false;
ALTER TABLE vehicle_receptions ADD COLUMN IF NOT EXISTS bay_label varchar(80);
ALTER TABLE vehicle_receptions ADD COLUMN IF NOT EXISTS notes text;

-- Optional VIN/plate values must not reserve a single NULL for the entire tenant.
-- Keep uniqueness for every actual identifier and retain vehicle_identity.
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_tenant_id_vin_key;
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_tenant_id_plate_key;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_vin_present_idx ON vehicles (tenant_id, vin) WHERE vin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_plate_present_idx ON vehicles (tenant_id, plate) WHERE plate IS NOT NULL;

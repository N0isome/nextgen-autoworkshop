ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine text;
CREATE TABLE vehicle_receptions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), work_order_id uuid NOT NULL UNIQUE REFERENCES work_orders(id),
  odometer_km integer NOT NULL CHECK (odometer_km >= 0), fuel_level_percent smallint NOT NULL CHECK (fuel_level_percent BETWEEN 0 AND 100),
  exterior_condition text, received_by uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_receptions_workshop_idx ON vehicle_receptions (workshop_id, received_at DESC);

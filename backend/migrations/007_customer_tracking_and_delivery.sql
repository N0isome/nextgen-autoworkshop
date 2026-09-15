-- A public link is deliberately an unguessable capability, not an order ID.
-- Existing tickets receive a token lazily when the workshop shares their status.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS public_tracking_token varchar(96);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS completed_work text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS delivery_notes text;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_public_tracking_token_idx
  ON work_orders (public_tracking_token) WHERE public_tracking_token IS NOT NULL;

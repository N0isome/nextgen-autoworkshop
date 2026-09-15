CREATE TABLE soluciones_locales_taller (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workshop_id uuid NOT NULL REFERENCES workshops(id),
  make text NOT NULL,
  model text NOT NULL,
  model_year smallint NOT NULL,
  engine text,
  dtc_code varchar(5) NOT NULL,
  failed_component text NOT NULL,
  mechanic_notes text NOT NULL,
  repair_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  attached_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('VERIFIED', 'REVIEW_REQUIRED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  helpful_count integer NOT NULL DEFAULT 0,
  not_helpful_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz
);

CREATE INDEX soluciones_locales_taller_lookup_idx
  ON soluciones_locales_taller (tenant_id, workshop_id, upper(make), upper(model), model_year, dtc_code, verification_status);

CREATE TABLE diagnostic_feedback (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workshop_id uuid NOT NULL REFERENCES workshops(id),
  diagnostic_session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  dtc_code varchar(5) NOT NULL,
  mechanic_id uuid NOT NULL,
  useful boolean NOT NULL,
  local_solution_id uuid REFERENCES soluciones_locales_taller(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagnostic_session_id, dtc_code, mechanic_id)
);

CREATE INDEX diagnostic_feedback_solution_idx ON diagnostic_feedback (local_solution_id);

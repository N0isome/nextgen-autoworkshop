CREATE TABLE public_technical_documents (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), title text NOT NULL, document_type text NOT NULL,
 publisher text NOT NULL, source_url text NOT NULL, make text, model text, year_from smallint, year_to smallint, dtc_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
 public_access_confirmed boolean NOT NULL DEFAULT false, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_documents_scope_idx ON public_technical_documents (tenant_id, workshop_id, make, model);

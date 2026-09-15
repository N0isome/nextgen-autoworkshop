CREATE TABLE dtc_knowledge (
  code varchar(5) PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  generic_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'OBD-II generic',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id), workshop_id uuid NOT NULL REFERENCES workshops(id), vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  source text NOT NULL CHECK (source IN ('OBD2', 'BOSCH', 'LAUNCH', 'ELM327', 'MANUAL')),
  scanner_model text, raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb, scanned_by uuid NOT NULL, scanned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diagnostic_codes (
  session_id uuid NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  code varchar(5) NOT NULL, PRIMARY KEY (session_id, code)
);
CREATE INDEX diagnostic_sessions_vehicle_idx ON diagnostic_sessions (vehicle_id, scanned_at DESC);

INSERT INTO dtc_knowledge (code, title, description, severity, generic_causes, recommended_checks) VALUES
('P0171', 'Sistema demasiado pobre (Banco 1)', 'La ECU detecta exceso de aire o falta de combustible en el banco 1.', 'warning', '["Fuga de vacío","MAF contaminado","Baja presión de combustible","Inyector restringido"]', '["Revisar fugas de admisión","Comparar fuel trims","Medir presión de combustible","Inspeccionar MAF"]'),
('P0300', 'Fallo de encendido aleatorio o múltiple', 'Se detectan fallos de combustión en más de un cilindro o sin patrón definido.', 'critical', '["Bujías o bobinas","Combustible","Fuga de vacío","Compresión insuficiente"]', '["Leer freeze frame","Revisar contador por cilindro","Probar encendido","Medir compresión"]'),
('P0420', 'Eficiencia del catalizador por debajo del umbral (Banco 1)', 'La señal posterior al catalizador no cumple el comportamiento esperado.', 'warning', '["Catalizador degradado","Sonda lambda","Fuga de escape","Fallos de encendido previos"]', '["Verificar DTC asociados","Revisar fugas de escape","Analizar sensores O2","Comprobar misfire"]'),
('P0442', 'Fuga pequeña detectada en sistema EVAP', 'El sistema EVAP no mantiene completamente la presión/vacío esperada.', 'info', '["Tapa de combustible","Manguera EVAP","Válvula de purga","Canister"]', '["Inspeccionar tapa","Prueba de humo EVAP","Revisar mangueras"]'),
('P0128', 'Temperatura de refrigerante inferior a la regulada', 'El motor demora más de lo esperado en alcanzar temperatura de funcionamiento.', 'warning', '["Termostato abierto","Sensor ECT","Nivel bajo de refrigerante"]', '["Comparar ECT con temperatura real","Revisar termostato","Comprobar nivel y fugas"]'),
('P0101', 'Rango/rendimiento del sensor MAF', 'La lectura de masa de aire no es coherente con la condición de funcionamiento.', 'warning', '["MAF sucio","Filtro de aire","Fuga de admisión","Cableado"]', '["Inspeccionar filtro","Revisar admisión","Comparar datos en vivo","Limpiar MAF según fabricante"]')
ON CONFLICT (code) DO NOTHING;

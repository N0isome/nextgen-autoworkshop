# NextGen AutoWorkshop API

Base API para la operación de taller, preparada para un futuro nodo Edge y sincronización Cloud.

## Incluido en esta primera base

- API NestJS estricta (`/v1`).
- PostgreSQL 16 con aislamiento multi-tenant, órdenes de trabajo y cola `outbox`.
- Transacciones ACID: estado de la orden + evento de auditoría + evento de sincronización.
- Cadena SHA-256 de auditoría por tenant.
- Máquina de estados de la orden de trabajo.
- Sesiones de diagnóstico OBD-II, historial por vehículo y catálogo local de DTC genéricos.
- Autenticación temporal exclusiva para desarrollo local. **No debe utilizarse en producción**; será reemplazada por OIDC.

## Arranque local

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:up
npm run start:dev
```

Comprobar salud:

```bash
curl http://localhost:3000/v1/health
```

## Contexto local de pruebas

Los endpoints de órdenes requieren estos encabezados mientras se implementa OIDC:

```text
x-development-token: valor de DEVELOPMENT_TOKEN
x-tenant-id: UUID existente
x-workshop-id: UUID existente
x-actor-id: UUID existente
x-device-id: recepcion-01
```

## Primera configuración y flujo de recepción

Con la API en ejecución, inicializa una sola vez el taller desde una segunda terminal:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/v1/setup/bootstrap -ContentType 'application/json' -Body '{"workshopName":"Mi Taller"}'
```

Guarda `tenantId`, `workshopId` y `actorId`. Úsalos junto con `DEVELOPMENT_TOKEN` como encabezados en las pruebas locales. Después el flujo es:

1. `POST /v1/customers` para registrar al propietario.
2. `POST /v1/vehicles` con su patente/VIN, marca, modelo y motor.
3. `POST /v1/receptions` para abrir la orden de trabajo en estado `RECEIVED` con kilometraje, combustible y síntoma.
4. `POST /v1/diagnostics/sessions` para asociar el escaneo al vehículo y consultar DTC locales.

### Análisis JSON estricto

`POST /v1/diagnostics/analyze` recibe `user_id`, vehículo y un DTC. Devuelve únicamente:

- `error_definition`
- `possible_causes`
- `diagnostic_steps`
- `technical_references`
- `severity_level`

Las referencias se resuelven automáticamente con el catálogo local, portales oficiales del fabricante y fuentes públicas de NHTSA. La consulta externa usa un timeout corto: si internet no está disponible, el diagnóstico local sigue funcionando. NHTSA corresponde principalmente a variantes del mercado estadounidense, por lo que se debe confirmar motor y mercado antes de aplicar un procedimiento.

El endpoint `/v1/technical-documents` permanece como respaldo administrativo para una publicación verificada que no esté disponible en fuentes automáticas. Ya no forma parte del flujo cotidiano del mecánico.

### Conocimiento evolutivo del taller

La migración `005_workshop_knowledge.sql` agrega soluciones reales y feedback por sesión. El orden de resolución es:

1. Solución verificada para marca, modelo, año, motor y DTC en `soluciones_locales_taller`.
2. Catálogo DTC genérico y fuentes oficiales automáticas.
3. Confirmación obligatoria del mecánico mediante `POST /v1/diagnostics/sessions/:sessionId/codes/:code/feedback`.
4. Si no fue útil, `POST /v1/diagnostics/knowledge` con `request_type=alimentacion_manual` guarda la reparación real y emite `LOCAL_SOLUTION_VERIFIED` en la cola `outbox`.

`POST /v1/diagnostics/knowledge` también admite `request_type=diagnostico_inicial` y devuelve `data_source`, `diagnostic_result` y `ui_actions`.

## Próximo corte funcional

1. Endpoints y validaciones para clientes y vehículos.
2. Recepción inteligente con fotos, combustible y firma.
3. Sincronización Edge (`outbox`/`inbox`) e idempotencia HTTP.
4. Sustitución del guard temporal por OIDC, RBAC y permisos por sucursal.

Consulta [la guía de diagnóstico e integraciones](docs/DIAGNOSTICS_AND_INTEGRATIONS.md) para conocer cómo se conectarán escáneres, proveedores técnicos y la futura sincronización Edge.

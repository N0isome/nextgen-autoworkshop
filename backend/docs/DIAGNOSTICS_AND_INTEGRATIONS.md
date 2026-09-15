# Diagnóstico e integraciones

## Enfoque para un solo taller

La aplicación funciona con una sola organización y una sola sucursal configurada. Los campos técnicos `tenant_id` y `workshop_id` se conservan para separar de manera segura tus datos, dispositivos y futuras copias de respaldo; no se mostrará un selector de talleres al usuario.

## Jerarquía evolutiva de conocimiento

1. **Casos propios del taller:** `soluciones_locales_taller` se consulta antes que cualquier catálogo o fuente externa. Cada diagnóstico resuelto registra vehículo, DTC, causa confirmada, reparación y evidencias.
2. **Catálogo OBD-II genérico local:** códigos como P0300, P0171 o P0420. Funciona sin Internet y aporta una orientación cuando todavía no existe experiencia verificada del taller.
3. **Fuentes públicas automáticas:** portales oficiales del fabricante, comunicaciones y campañas públicas aplicables. No se exige al mecánico cargar documentos para iniciar un diagnóstico.
4. **Proveedor técnico licenciado:** adaptador futuro para HaynesPro, Autodata, ALLDATA u otro. Según VIN, marca, modelo, año, motor y DTC puede aportar procedimientos, diagramas, boletines y tiempos. Sus credenciales nunca se guardan en la APK.

La capa 4 requiere contratar un proveedor con API o exportación autorizada. No se debe importar contenido técnico desde sitios sin licencia.

## Flujo de escáner

1. La APK lee placa/VIN y se conecta por Bluetooth/Wi-Fi al escáner.
2. Envía el resultado crudo a `POST /v1/diagnostics/sessions`.
3. El backend normaliza los DTC, guarda la sesión y consulta primero `soluciones_locales_taller`.
4. Si no existe una solución local verificada, usa el catálogo genérico y consulta automáticamente las fuentes públicas disponibles.
5. El técnico debe responder si el diagnóstico fue útil. Una respuesta negativa abre inmediatamente la alimentación manual.
6. La solución comprobada se guarda y pasa a ser la respuesta prioritaria para vehículos equivalentes.

## Sincronización

La primera versión funcionará conectada a una única base PostgreSQL local/cloud. La tabla `outbox_events` ya registra toda operación relevante para preparar la fase Edge.

La sincronización posterior no copiará tablas completas:

- Edge registra cambios localmente y agrega eventos a la outbox.
- El agente envía eventos con ID único y hash al Cloud.
- Cloud confirma (`ACK`) y entrega solo los cambios pendientes.
- Fotos, PDFs y firmas se transfieren por archivo reanudable con hash SHA-256.
- Stock, pagos y firmas usan eventos inmutables; nunca se resuelven con “el último cambio gana”.

## Datos que alimentan la base

| Origen | Datos almacenados |
|---|---|
| Escáner | VIN, DTC, freeze frame, datos en vivo y modelo de escáner. |
| Recepción | Síntoma declarado, fotos, kilometraje y combustible. |
| Técnico | Diagnóstico confirmado, pasos aplicados y horas reales. |
| Inventario | Repuesto, lote, proveedor y consumo. |
| Cierre | Resultado, garantía y retorno del vehículo si corresponde. |

Antes de integrar un escáner específico necesito su marca/modelo y cómo expone datos: Bluetooth ELM327, archivo exportado, red LAN o API del fabricante.

# Flujo de recepción del taller

## Objetivo

Registrar un ingreso completo en menos de dos minutos, manteniendo evidencia suficiente para trabajar, cotizar y entregar el vehículo sin perder contexto.

## Datos mínimos

| Momento | Datos |
|---|---|
| Cliente | Nombre, teléfono y correo opcional. |
| Vehículo | Patente o VIN, marca, modelo, año y motor si se conoce. |
| Recepción | Motivo declarado, kilometraje, combustible y estado exterior. |
| Diagnóstico | Fuente del escáner, modelo de escáner y DTC leídos. |

## Garantías del sistema

- Un vehículo no se asocia a un cliente inexistente.
- Patente/VIN no se duplican dentro del taller.
- La recepción crea inmediatamente una OT `RECEIVED`.
- La recepción, la OT, el evento de auditoría y la outbox se confirman en la misma transacción.
- El siguiente paso será adjuntar fotos y firma de recepción a esta misma OT.

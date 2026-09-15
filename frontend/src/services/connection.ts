import type { ConnectionState, HealthPayload } from '../types';

export const healthIntervals = {
  healthy: 300,
  degraded: 180,
  offline: 600,
} as const;
export const offlineBackoff = [60, 120, 300, 600] as const;

export function healthState(payload: HealthPayload): Extract<ConnectionState, 'healthy' | 'degraded'> {
  return payload.status === 'degraded' || payload.database === 'unavailable' ? 'degraded' : 'healthy';
}

export function nextHealthCheckSeconds(state: ConnectionState, consecutiveOfflineFailures = 0): number | undefined {
  if (state === 'healthy') return healthIntervals.healthy;
  if (state === 'degraded') return healthIntervals.degraded;
  if (state === 'offline') return offlineBackoff[Math.min(Math.max(consecutiveOfflineFailures - 1, 0), offlineBackoff.length - 1)];
  return undefined;
}

export const connectionMessage: Record<Extract<ConnectionState, 'healthy' | 'degraded' | 'offline'>, { title: string; message: string }> = {
  healthy: { title: 'Sistema operativo', message: 'Todos los servicios están disponibles.' },
  degraded: { title: 'Servicios limitados', message: 'La aplicación está funcionando parcialmente. La base de datos no está disponible.' },
  offline: { title: 'Sin conexión', message: 'No es posible comunicarse con la API. Se intentará reconectar automáticamente.' },
};

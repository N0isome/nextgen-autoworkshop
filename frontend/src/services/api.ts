import type { Api, Settings, WorkshopData } from '../types';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiRequestError'; }
}

export const defaultSettings: Settings = {
  apiUrl: 'http://localhost:3000/v1', token: 'local-development-token', tenantId: '', workshopId: '',
  actorId: '00000000-0000-4000-8000-000000000001', deviceId: 'recepcion-web-01', workshopName: 'Taller Ruta 5',
  theme: 'system',
};
export function readSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem('workshop-settings') || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaultSettings;
    const next = { ...defaultSettings, ...stored };
    for (const key of ['apiUrl', 'token', 'tenantId', 'workshopId', 'actorId'] as const) {
      if (typeof next[key] !== 'string') next[key] = defaultSettings[key];
    }
    for (const key of ['deviceId', 'mechanicName', 'workshopName'] as const) {
      if (typeof next[key] !== 'string') delete next[key];
    }
    next.bays = Array.isArray(stored.bays) ? stored.bays.filter((v: unknown): v is string => typeof v === 'string' && Boolean(v.trim())) : [];
    next.theme = ['light', 'dark', 'system'].includes(stored.theme) ? stored.theme : 'system';
    return next;
  } catch { return defaultSettings; }
}
export function createApi(settings: Settings, signal?: AbortSignal): Api {
  return async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const controller = new AbortController();
    const outerSignal = init.signal || signal;
    const abort = () => controller.abort();
    if (outerSignal?.aborted) abort();
    outerSignal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('x-development-token', settings.token);
      headers.set('x-tenant-id', settings.tenantId);
      headers.set('x-workshop-id', settings.workshopId);
      headers.set('x-actor-id', settings.actorId);
      headers.set('x-device-id', settings.deviceId || 'recepcion-web-01');
      const response = await fetch(`${settings.apiUrl.replace(/\/+$/, '')}${path}`, { ...init, headers, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join(' · ') : data.message;
        throw new ApiRequestError(message || 'La operación no se pudo completar (HTTP ' + response.status + ').', response.status);
      }
      return data as T;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error(init.method && init.method !== 'GET'
          ? 'Se perdió la conexión. No se pudo confirmar el guardado; revisa el ticket o el historial antes de reintentar.'
          : 'No se pudo conectar con la API del taller. Verifica que esté iniciada y vuelve a intentar.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      outerSignal?.removeEventListener('abort', abort);
    }
  };
}
export const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
export async function readAll<T extends { id: string }>(api: Api, path: string): Promise<T[]> {
  const values: T[] = [];
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const page = await api<T[]>(`${path}?offset=${offset}`);
    if (!Array.isArray(page)) throw new Error('La API devolvió un formato de lista no reconocido.');
    let added = 0;
    for (const item of page) if (!ids.has(item.id)) { ids.add(item.id); values.push(item); added++; }
    if (page.length < 100) return values;
    if (!added) throw new Error('La API no admite paginación. Instala la actualización del backend para cargar todos los registros.');
  }
}
function cacheKey(settings: Settings) {
  return `workshop-cache-v9:${settings.apiUrl.replace(/\/+$/, '')}:${settings.tenantId}:${settings.workshopId}:${settings.actorId}`;
}
export function readCache(settings: Settings): WorkshopData | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(settings)) || 'null');
    return value && Array.isArray(value.customers) && Array.isArray(value.vehicles) && Array.isArray(value.orders) && value.overview ? value : undefined;
  } catch { return undefined; }
}
export function writeCache(settings: Settings, data: WorkshopData) {
  try { localStorage.setItem(cacheKey(settings), JSON.stringify(data)); } catch { /* A full browser cache must not turn a confirmed write into an error. */ }
}

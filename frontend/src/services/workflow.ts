import type { Status } from '../types';

export const stages: { code: Status; label: string; short: string; color: string; tone: string }[] = [
  { code: 'RECEIVED', label: 'Recibido', short: 'Recepción', color: '#34a853', tone: 'green' },
  { code: 'DIAGNOSING', label: 'En diagnóstico', short: 'Diagnóstico', color: '#2855ff', tone: 'blue' },
  { code: 'WAITING_APPROVAL', label: 'Esperando aprobación', short: 'Por aprobar', color: '#f2a900', tone: 'amber' },
  { code: 'APPROVED', label: 'Aprobado', short: 'Aprobados', color: '#5973ff', tone: 'blue' },
  { code: 'IN_PROGRESS', label: 'En reparación', short: 'Reparación', color: '#eb4c9a', tone: 'pink' },
  { code: 'QUALITY_CHECK', label: 'Control de calidad', short: 'Calidad', color: '#26a3ad', tone: 'teal' },
  { code: 'READY_FOR_DELIVERY', label: 'Listo para entrega', short: 'Para entregar', color: '#237c3a', tone: 'green' },
];
export const labels: Record<Status, string> = { ...Object.fromEntries(stages.map(s => [s.code, s.label])), DRAFT: 'Borrador', CLOSED: 'Cerrado', ON_HOLD: 'En pausa', CANCELLED: 'Cancelado' } as Record<Status, string>;
export const transitions: Record<Status, Status[]> = {
  DRAFT: ['RECEIVED', 'CANCELLED'], RECEIVED: ['DIAGNOSING', 'ON_HOLD', 'CANCELLED'],
  DIAGNOSING: ['WAITING_APPROVAL', 'IN_PROGRESS', 'ON_HOLD'], WAITING_APPROVAL: ['APPROVED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'ON_HOLD'], IN_PROGRESS: ['READY_FOR_DELIVERY', 'QUALITY_CHECK', 'ON_HOLD'], QUALITY_CHECK: ['READY_FOR_DELIVERY', 'IN_PROGRESS'],
  READY_FOR_DELIVERY: ['CLOSED', 'IN_PROGRESS'], CLOSED: [], CANCELLED: [], ON_HOLD: ['DIAGNOSING', 'IN_PROGRESS', 'CANCELLED'],
};
export const operationalStages = [
  { code: 'RECEIVED', label: 'Ingreso' }, { code: 'DIAGNOSING', label: 'Diagnóstico' },
  { code: 'IN_PROGRESS', label: 'Reparación' }, { code: 'READY_FOR_DELIVERY', label: 'Entrega' },
] as const;
export function operationalStage(status: Status): Status {
  if (['DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED'].includes(status)) return 'DIAGNOSING';
  if (['IN_PROGRESS', 'QUALITY_CHECK', 'ON_HOLD'].includes(status)) return 'IN_PROGRESS';
  return status;
}
export function nextAction(status: Status): { toStatus: Status; label: string; needsDelivery?: boolean } | undefined {
  const actions: Partial<Record<Status, { toStatus: Status; label: string; needsDelivery?: boolean }>> = {
    RECEIVED: { toStatus: 'DIAGNOSING', label: 'Iniciar diagnóstico' },
    DIAGNOSING: { toStatus: 'IN_PROGRESS', label: 'Comenzar reparación' },
    WAITING_APPROVAL: { toStatus: 'IN_PROGRESS', label: 'Continuar reparación' },
    APPROVED: { toStatus: 'IN_PROGRESS', label: 'Comenzar reparación' },
    IN_PROGRESS: { toStatus: 'READY_FOR_DELIVERY', label: 'Marcar listo para entrega' },
    QUALITY_CHECK: { toStatus: 'READY_FOR_DELIVERY', label: 'Marcar listo para entrega' },
    READY_FOR_DELIVERY: { toStatus: 'CLOSED', label: 'Confirmar entrega', needsDelivery: true },
  };
  return actions[status];
}
export const operationalLabel = (status: Status) => {
  const simple: Partial<Record<Status, string>> = { RECEIVED: 'Ingreso', DIAGNOSING: 'Diagnóstico', IN_PROGRESS: 'Reparación', READY_FOR_DELIVERY: 'Entrega', CLOSED: 'Entregado' };
  return simple[operationalStage(status)] || labels[status];
};
export const isActive = (status: Status) => !['DRAFT', 'CLOSED', 'CANCELLED'].includes(status);
export const number = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
export function dateTime(value?: string) { return value ? new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin registro'; }
export function duration(hours?: number | null) { return hours == null ? '—' : hours >= 48 ? `${number(hours / 24)} d` : `${number(hours)} h`; }
export function localDate(value = new Date()) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
export function rangeFor(days: number, until: string) {
  const end = new Date(`${until}T00:00:00`); end.setDate(end.getDate() + 1);
  const start = new Date(end); start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: end.toISOString() };
}
export function safeUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

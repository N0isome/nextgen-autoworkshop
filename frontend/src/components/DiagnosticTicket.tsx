import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, ChevronRight, History, LoaderCircle, ScanLine, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Api, DtcResult, ScanHistory, ScanResult, Vehicle, WorkOrder } from '../types';
import { post } from '../services/api';
import { dateTime, number } from '../services/workflow';
import { Badge, Empty, ErrorMessage, Field, Form, Select } from './ui';
import { TechnicalReferences } from './TechnicalReferences';
import { ManualSolutionForm } from './ManualSolutionForm';

type Validation = 'pending' | 'useful' | 'manual' | 'saved';
function initialValidation(codes: DtcResult[]): Record<string, Validation> { return Object.fromEntries(codes.map(c => [c.code, c.feedback?.manual_solution_saved ? 'saved' : c.feedback?.useful ? 'useful' : c.feedback ? 'manual' : 'pending'])); }

export function DiagnosticTicket({ api, vehicles, mechanicId, order, onChanged, onReception }: { api: Api; vehicles: Vehicle[]; mechanicId: string; order?: WorkOrder; onChanged: () => void; onReception: () => void }) {
  const [vehicleId, setVehicleId] = useState(order?.vehicle_id || ''); const [source, setSource] = useState('OBD2'); const [scanner, setScanner] = useState(''); const [codes, setCodes] = useState('');
  const [scan, setScan] = useState<ScanResult>(); const [selectedCode, setSelectedCode] = useState(''); const [validation, setValidation] = useState<Record<string, Validation>>({});
  const [history, setHistory] = useState<ScanHistory[]>([]); const [historyError, setHistoryError] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const vehicle = useMemo(() => {
    if (scan) return { ...vehicles.find(v => v.id === scan.vehicle.id), ...scan.vehicle };
    return vehicles.find(v => v.id === vehicleId);
  }, [scan, vehicles, vehicleId]);
  const active = scan?.codes.find(c => c.code === selectedCode);
  const pending = scan?.codes.filter(c => !['useful', 'saved'].includes(validation[c.code] || 'pending')).length || 0;
  const closedOrder = order && ['CLOSED', 'CANCELLED'].includes(order.status);
  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    if (!vehicleId) return;
    try { const entries = await api<ScanHistory[]>(`/diagnostics/vehicles/${vehicleId}/history`, { signal }); if (!signal?.aborted) { setHistory(entries); setHistoryError(''); } }
    catch (e) { if (!signal?.aborted) setHistoryError((e as Error).message); }
  }, [api, vehicleId]);
  useEffect(() => { setHistory([]); const controller = new AbortController(); void loadHistory(controller.signal); return () => controller.abort(); }, [loadHistory]);
  function displayScan(next: ScanResult) { setScan(next); setSelectedCode(next.codes[0]?.code || ''); setValidation(initialValidation(next.codes)); setError(''); }
  async function openSession(id: string) {
    setBusy(true); setError('');
    try { displayScan(await api<ScanResult>(`/diagnostics/sessions/${id}`)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const validate = useCallback(async (result: DtcResult, useful: boolean) => {
    if (!scan || saving) return;
    setSaving(true); setError('');
    if (!useful) setValidation(v => ({ ...v, [result.code]: 'manual' }));
    try {
      await api(`/diagnostics/sessions/${scan.sessionId}/codes/${encodeURIComponent(result.code)}/feedback`, post({ useful, localSolutionId: result.local_solution_id }));
      setValidation(v => ({ ...v, [result.code]: useful ? 'useful' : 'manual' })); onChanged();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }, [api, onChanged, saving, scan]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (!e.altKey || !active || validation[active.code] !== 'pending' || saving || busy) return;
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable=true]')) return;
      const key = e.key.toLowerCase(); if (key === 'y' || key === 'n') { e.preventDefault(); void validate(active, key === 'y'); }
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [active, validation, saving, busy, validate]);
  if (!vehicles.length && !order) return <section className="card"><Empty title="Primero registra un vehículo" detail="Crea una recepción para asociar el diagnóstico a su orden de trabajo." action={<button className="primary" onClick={onReception}>Nuevo ingreso</button>} /></section>;
  const relevantHistory = order ? history.filter(s => s.work_order_id === order.id) : history;
  return <>
    {order && <div className="diagnostic-order-banner"><span>Orden de trabajo <ChevronRight size={15} /> <strong className="technical">{order.plate || 'Sin patente'}</strong> {order.customer_name}</span><Badge status={order.status} /></div>}
    <section className="card scanner-card"><div className="card-heading"><div><h2><ScanLine size={22} /> Escaneo de diagnóstico</h2><p>Ingresa los códigos leídos por tu escáner. La documentación se consulta automáticamente.</p></div><span className="badge neutral">Ingreso de códigos</span></div>
      {!closedOrder ? <Form onSubmit={async () => {
        const dtcCodes = [...new Set(codes.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean))];
        if (!vehicleId) throw new Error('Selecciona un vehículo.');
        if (!dtcCodes.length || dtcCodes.length > 100 || dtcCodes.some(code => !/^[BCPU][0-9A-F]{4}$/.test(code))) throw new Error('Revisa los códigos. Ejemplo válido: P0300, P0171. Máximo 100 códigos.');
        const next = await api<ScanResult>('/diagnostics/sessions', post({ vehicleId, workOrderId: order?.id, source, scannerModel: scanner.trim() || undefined, dtcCodes }));
        displayScan(next); setCodes(''); onChanged(); void loadHistory();
      }}>
        <Select label="Vehículo" value={vehicleId} onChange={id => { setVehicleId(id); setScan(undefined); }} disabled={Boolean(order) || pending > 0 || busy || saving} required options={[["", "Selecciona un vehículo"], ...vehicles.map(v => [v.id, `${v.plate || 'Sin patente'} · ${v.make} ${v.model}`] as [string, string])]} />
        <Select label="Origen del escaneo" value={source} onChange={setSource} options={[["OBD2", "OBD2"], ["BOSCH", "Bosch"], ["LAUNCH", "Launch"], ["ELM327", "ELM327"], ["MANUAL", "Manual"]]} />
        <Field label="Modelo del escáner (opcional)" value={scanner} onChange={setScanner} minLength={3} maxLength={120} />
        <Field label="Códigos DTC separados por coma" technical value={codes} onChange={setCodes} required placeholder="P0300, P0171" />
        <div className="scanner-submit full">{pending > 0 ? <p>Quedan {pending} DTC por validar en el escaneo abierto.</p> : <p>{order ? 'El escaneo quedará asociado a esta orden.' : 'Escaneo independiente. Abre una orden para asociarlo a un ticket.'}</p>}<button className="primary" disabled={pending > 0 || busy || saving}><ScanLine size={18} /> Analizar y guardar escaneo</button></div>
      </Form> : <p className="notice">La orden está {order.status === 'CLOSED' ? 'cerrada' : 'cancelada'}. Puedes consultar sus escaneos guardados.</p>}
    </section>
    {error && <ErrorMessage>{error}</ErrorMessage>}
    <section className="scan-history"><div className="history-title"><History size={18} /><strong>Historial {order ? 'de esta orden' : 'del vehículo'}</strong>{busy && <LoaderCircle className="spin" size={18} />}</div>
      {historyError && <ErrorMessage>{historyError}</ErrorMessage>}
      <div className="history-options">{relevantHistory.length ? relevantHistory.map(s => <button key={s.id} className={scan?.sessionId === s.id ? 'selected' : ''} disabled={busy || saving} onClick={() => void openSession(s.id)}><span>{dateTime(s.scanned_at)} · {s.source}</span><strong className="technical">{s.codes.join(' · ')}</strong>{!s.work_order_id && <small>Sin orden asociada</small>}</button>) : <p className="small-note">{vehicleId ? 'No hay escaneos guardados para esta selección.' : 'Selecciona un vehículo para ver su historial.'}</p>}</div>
      {order && history.some(s => !s.work_order_id) && <p className="small-note">Este vehículo tiene escaneos anteriores sin orden asociada. Están disponibles en Diagnóstico general.</p>}
    </section>
    {scan && active && vehicle && <>
      <div className="diagnostic-progress"><h2>Resultado del diagnóstico</h2><span className={`badge ${pending ? 'amber' : 'green'}`}>{pending ? `${pending} de ${scan.codes.length} por validar` : 'Todos los DTC validados'}</span></div>
      <div className="diagnostic-layout"><aside className="card vehicle-panel"><span className="section-eyebrow">VEHÍCULO DEL ESCANEO</span><span className="plate-preview technical">{vehicle.plate || 'Sin patente'}</span><h2>{vehicle.make} {vehicle.model}</h2><dl><dt>Año</dt><dd>{vehicle.model_year || 'Sin registro'}</dd><dt>Motor</dt><dd>{vehicle.engine || 'Sin registro'}</dd><dt>VIN</dt><dd className="technical">{vehicle.vin || 'Sin registro'}</dd><dt>Cliente</dt><dd>{order?.customer_name || vehicle.customer_name || 'Sin registro'}</dd>{order && <><dt>Kilometraje de ingreso</dt><dd className="technical">{order.odometer_km == null ? 'Sin registro' : `${number(order.odometer_km)} km`}</dd></>}</dl>
        <div className="dtc-navigation" role="group" aria-label="Códigos del escaneo">{scan.codes.map(c => <button key={c.code} disabled={saving} className={c.code === selectedCode ? 'selected' : ''} onClick={() => setSelectedCode(c.code)}><span className="technical">{c.code}</span>{['useful', 'saved'].includes(validation[c.code]) ? <Check size={17} aria-label="Validado" /> : <span className="pending-label">Pendiente</span>}</button>)}</div>
      </aside>
      <section className="card dtc-panel"><div className="dtc-title"><strong className="dtc-code technical">{active.code}</strong><span className={`badge ${active.severity === 'critical' ? 'red' : active.severity === 'warning' ? 'amber' : 'blue'}`}>{active.severity === 'critical' ? 'Severidad alta' : active.severity === 'warning' ? 'Severidad media' : active.severity === 'info' ? 'Severidad baja' : 'Severidad sin clasificar'}</span></div><span className={`badge ${active.data_source === 'Base de Datos Taller' ? 'green' : 'amber'}`}>{active.data_source || 'IA Genérica / Web'}</span>
        <h2>{active.title}</h2>{active.description && <p className="diagnostic-description">{active.description}</p>}
        <div className="diagnostic-detail"><h3>Causas probables</h3>{active.generic_causes?.length ? <ul>{active.generic_causes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p>Sin causas verificadas en el catálogo.</p>}</div>
        <div className="diagnostic-detail"><h3>Plan de comprobación</h3>{active.recommended_checks?.length ? <ol>{active.recommended_checks.map((c, i) => <li key={i}>{c}</li>)}</ol> : <p>Confirma el procedimiento aplicable en documentación oficial.</p>}</div>
        {validation[active.code] === 'pending' && <div className="validation-actions"><h3>¿Fue útil este diagnóstico?</h3><p>Tu validación es necesaria para continuar la orden.</p><div><button className="positive" disabled={saving || busy} onClick={() => void validate(active, true)}><ThumbsUp size={18} /> Sí, fue útil <kbd>Alt+Y</kbd></button><button className="negative" disabled={saving || busy} onClick={() => void validate(active, false)}><ThumbsDown size={18} /> No, ingresar solución <kbd>Alt+N</kbd></button></div></div>}
        {saving && <p className="saving" role="status"><LoaderCircle className="spin" size={17} /> Guardando validación…</p>}
        {validation[active.code] === 'manual' && <ManualSolutionForm key={`${scan.sessionId}:${active.code}`} api={api} mechanicId={mechanicId} vehicle={vehicle} sessionId={scan.sessionId} code={active.code} disabled={saving || busy} onSaved={() => { setValidation(v => ({ ...v, [active.code]: 'saved' })); onChanged(); }} />}
        {['useful', 'saved'].includes(validation[active.code]) && <p className="confirmed" role="status"><CheckCheck size={20} />{validation[active.code] === 'saved' ? 'Solución verificada guardada en la base del taller.' : 'Diagnóstico validado por el mecánico.'}</p>}
      </section><TechnicalReferences key={`${scan.sessionId}:${active.code}`} references={active.technical_references} files={active.attached_files} /></div>
    </>}
  </>;
}

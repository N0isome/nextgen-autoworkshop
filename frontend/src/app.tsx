import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, RefreshCw, WifiOff, X } from 'lucide-react';
import type { ConnectionState, Customer, HealthPayload, Overview, Settings, Status, Vehicle, View, WorkOrder, WorkshopData } from './types';
import { ApiRequestError, createApi, readAll, readCache, readSettings, writeCache } from './services/api';
import { connectionMessage, healthState, nextHealthCheckSeconds } from './services/connection';
import { dateTime, localDate, rangeFor } from './services/workflow';
import { AppHeader } from './components/AppHeader';
import { Dashboard } from './components/Dashboard';
import { ReceptionForm } from './components/ReceptionForm';
import { VehicleBoard, VehicleRegistry } from './components/VehicleBoard';
import { CustomerDirectory } from './components/CustomerDirectory';
import { DiagnosticTicket } from './components/DiagnosticTicket';
import { WorkOrderTicket } from './components/WorkOrderTicket';
import { SettingsForm } from './components/SettingsForm';
import { PublicOrderStatus } from './components/PublicOrderStatus';

const headings: Record<View, [string, string]> = {
  home: ['Resumen del taller', 'Estado general de vehículos, diagnósticos y órdenes de trabajo.'],
  reception: ['Nuevo ingreso', 'Recibe el vehículo y abre su orden de trabajo.'],
  vehicles: ['Vehículos en taller', 'Cada vehículo y su siguiente paso.'],
  diagnostic: ['Diagnóstico', 'Escanea y define la reparación antes de continuar.'],
  orders: ['Órdenes de trabajo', 'Consulta los tickets y completa solo el siguiente paso.'],
  customers: ['Clientes', 'Contacto e historial de vehículos registrados.'],
  reports: ['Reportes del taller', 'Resultados calculados con las operaciones registradas.'],
  settings: ['Configuración', 'Taller, puestos de trabajo y conexión local.'],
};
function DatabaseRequired({ title }: { title: string }) {
  return <section className="card readonly-card" role="status"><h2>{title}</h2><p>La API está disponible, pero la base de datos no. La información ya cargada se conserva; esta acción se habilitará cuando el servicio vuelva a estar operativo.</p></section>;
}

export function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [view, setView] = useState<View>('home'); const [days, setDays] = useState(30); const [until, setUntil] = useState(localDate()); const [compare, setCompare] = useState(false);
  const [data, setData] = useState<WorkshopData | undefined>(() => readCache(settings));
  const [connection, setConnection] = useState<ConnectionState>('checking'); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [boardStatus, setBoardStatus] = useState(''); const [registry, setRegistry] = useState(false); const [ticketId, setTicketId] = useState(''); const [diagnosticOrder, setDiagnosticOrder] = useState<WorkOrder>(); const [receptionKey, setReceptionKey] = useState(0);
  const request = useRef<AbortController | null>(null); const healthTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined); const refreshRef = useRef<(() => void) | undefined>(undefined); const offlineFailures = useRef(0);
  const api = useMemo(() => createApi(settings), [settings]);
  const publicToken = window.location.pathname.match(/^\/estado\/([A-Za-z0-9_-]{16,})\/?$/)?.[1];
  const configured = Boolean(settings.tenantId && settings.workshopId && settings.actorId && settings.apiUrl);
  const period = useMemo(() => rangeFor(days, until), [days, until]);
  const clearHealthTimer = useCallback(() => {
    if (healthTimer.current !== undefined) window.clearTimeout(healthTimer.current);
    healthTimer.current = undefined;
  }, []);
  const scheduleHealthCheck = useCallback(function schedule(state: ConnectionState, failures: number) {
    const seconds = nextHealthCheckSeconds(state, failures);
    if (!seconds) return;
    clearHealthTimer();
    healthTimer.current = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refreshRef.current?.();
      else schedule(state, failures);
    }, seconds * 1000);
  }, [clearHealthTimer]);
  const refresh = useCallback(async () => {
    clearHealthTimer(); request.current?.abort();
    if (!settings.tenantId || !settings.workshopId) {
      setConnection('unconfigured'); setError(''); setLoading(false); return;
    }
    const controller = new AbortController(); request.current = controller;
    let nextState: ConnectionState = 'offline'; let failures = offlineFailures.current;
    setLoading(true); setError('');
    const client = createApi(settings, controller.signal);
    try {
      const health = await client<HealthPayload>('/health');
      if (controller.signal.aborted) return;
      nextState = healthState(health); setConnection(nextState);
      if (nextState === 'degraded') { offlineFailures.current = 0; failures = 0; return; }
      const [customers, vehicles, orders, overview] = await Promise.all([
        readAll<Customer>(client, '/customers'), readAll<Vehicle>(client, '/vehicles'), readAll<WorkOrder>(client, '/work-orders'),
        client<Overview>(`/work-orders/overview?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`),
      ]);
      if (controller.signal.aborted) return;
      const next = { customers, vehicles, orders, overview, savedAt: new Date().toISOString() };
      setData(next); writeCache(settings, next); offlineFailures.current = 0; failures = 0;
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiRequestError && e.status === 503) {
        nextState = 'degraded'; offlineFailures.current = 0; failures = 0; setConnection(nextState);
      } else {
        nextState = 'offline'; failures = Math.min(offlineFailures.current + 1, 4); offlineFailures.current = failures;
        setConnection(nextState); setError((e as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) { setLoading(false); scheduleHealthCheck(nextState, failures); }
    }
  }, [clearHealthTimer, period, scheduleHealthCheck, settings]);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    setData(readCache(settings)); setConnection('checking'); setError(''); offlineFailures.current = 0; void refresh();
    return () => { clearHealthTimer(); request.current?.abort(); };
  }, [clearHealthTimer, refresh, settings]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible' && healthTimer.current === undefined) void refreshRef.current?.(); };
    document.addEventListener('visibilitychange', onVisibility); return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 8000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = settings.theme === 'system' || !settings.theme ? (media.matches ? 'dark' : 'light') : settings.theme; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [settings.theme]);
  const onChanged = useCallback(() => { void refresh(); }, [refresh]);
  function navigate(next: View) { setView(next); setTicketId(''); if (next === 'diagnostic') setDiagnosticOrder(undefined); }
  function newReception() { setReceptionKey(k => k + 1); navigate('reception'); }
  function filter(status: Status) { setBoardStatus(status); setRegistry(false); navigate('vehicles'); }
  function diagnose(order: WorkOrder) { setDiagnosticOrder(order); setTicketId(''); setView('diagnostic'); }
  function saveSettings(next: Settings) {
    localStorage.setItem('workshop-settings', JSON.stringify(next));
    request.current?.abort(); setSettings(next); setView('home'); setMessage('Configuración guardada.'); setDiagnosticOrder(undefined); setTicketId('');
  }
  function changeTheme(theme: 'light' | 'dark' | 'system') {
    const next = { ...settings, theme };
    localStorage.setItem('workshop-settings', JSON.stringify(next));
    setSettings(next);
    setMessage(theme === 'dark' ? 'Modo oscuro activado.' : theme === 'light' ? 'Modo claro activado.' : 'Apariencia automática activada.');
  }
  const customers = data?.customers || []; const vehicles = data?.vehicles || []; const orders = data?.orders || [];
  const currentOrder = diagnosticOrder ? orders.find(o => o.id === diagnosticOrder.id) || diagnosticOrder : undefined;
  const scope = `${settings.apiUrl}:${settings.tenantId}:${settings.workshopId}:${settings.actorId}`;
  const databaseAvailable = connection === 'healthy';
  const statusInfo = connection === 'healthy' || connection === 'degraded' || connection === 'offline' ? connectionMessage[connection] : undefined;
  if (publicToken) return <div className="app-shell public-shell"><PublicOrderStatus token={publicToken} settings={settings} /></div>;
  return <div className="app-shell"><AppHeader view={view} onNavigate={navigate} settings={settings} connection={connection} busy={loading} overview={data?.overview} onRefresh={onChanged} onThemeChange={changeTheme} />
    <main><div className="workshop-context"><span>{settings.workshopName || 'Taller Ruta 5'}</span><span>Espacio de trabajo</span></div>
      <div className="page-header"><div><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div><div className="page-controls">
        {['home', 'reports'].includes(view) && <><label className="period-control"><span className="sr-only">Período del reporte</span><select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></label><label className="date-control"><span>Hasta</span><input type="date" aria-label="Último día del reporte" value={until} max={localDate()} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setUntil(e.target.value); }} /></label></>}
        {view !== 'reception' && <button className="primary new-ingress" onClick={newReception} disabled={!databaseAvailable} title={databaseAvailable ? undefined : 'Esta acción requiere una base de datos disponible.'}><Plus size={18} /> Nuevo ingreso</button>}
      </div></div>
      {['home', 'reports'].includes(view) && <div className="report-controls"><label className="checkbox-label"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Comparar con el período anterior</label><span>{loading ? (connection === 'checking' ? 'Comprobando conexión…' : 'Actualizando datos…') : data ? `Actualizado ${dateTime(data.savedAt)}` : 'Esperando conexión'}</span></div>}
      {statusInfo && connection !== 'healthy' && <div className={`connection-banner ${connection}`} role="status" aria-live="polite"><WifiOff size={21} /><div><strong>{statusInfo.title}</strong><p>{statusInfo.message}</p>{data ? <p className="connection-detail">Última información disponible: {dateTime(data.savedAt)}. Las operaciones que escriben datos están deshabilitadas.</p> : <p className="connection-detail">Se conservará la información local cuando esté disponible.</p>}{error && <p className="connection-detail">Detalle técnico: {error}</p>}</div><button className="secondary" onClick={onChanged} disabled={loading}><RefreshCw size={17} /> Reintentar ahora</button></div>}
      {data && connection === 'checking' && <p className="notice" role="status">Comprobando la conexión. Datos guardados el {dateTime(data.savedAt)}.</p>}
      {loading && !data && configured && connection === 'checking' ? <div className="skeleton-grid" aria-label="Cargando datos del taller" role="status"><div /><div /><div /><div /></div>
        : <div key={scope} aria-busy={loading}>
          {view === 'settings' ? <SettingsForm initial={settings} onSave={saveSettings} /> : !configured ? <Dashboard overview={undefined} orders={[]} settings={settings} compare={false} onNavigate={navigate} onFilter={filter} onOpen={o => setTicketId(o.id)} /> : <>
            {(view === 'home' || view === 'reports') && <Dashboard overview={data?.overview} orders={orders} settings={settings} compare={compare} onNavigate={navigate} onFilter={filter} onOpen={o => setTicketId(o.id)} reports={view === 'reports'} databaseAvailable={databaseAvailable} />}
            {view === 'reception' && (databaseAvailable ? <ReceptionForm key={receptionKey} api={api} customers={customers} vehicles={vehicles} settings={settings} onRefresh={onChanged} onCreated={id => { setMessage('Recepción y orden de trabajo creadas.'); setTicketId(id); setView('orders'); }} /> : <DatabaseRequired title="No se pueden crear ingresos ahora" />)}
            {view === 'vehicles' && <><div className="subnav" role="group" aria-label="Vista de vehículos"><button className={!registry ? 'active' : ''} aria-pressed={!registry} onClick={() => setRegistry(false)}>En taller</button><button className={registry ? 'active' : ''} aria-pressed={registry} onClick={() => setRegistry(true)}>Registro de vehículos</button></div>{registry ? <VehicleRegistry api={api} vehicles={vehicles} customers={customers} orders={orders} onCreated={() => { onChanged(); setMessage('Vehículo registrado.'); }} onOpen={o => setTicketId(o.id)} canCreate={databaseAvailable} /> : <VehicleBoard orders={orders} initialStatus={boardStatus} onFilter={setBoardStatus} onOpen={o => setTicketId(o.id)} onDiagnose={diagnose} databaseAvailable={databaseAvailable} />}</>}
            {view === 'orders' && <VehicleBoard key="orders" allOrders orders={orders} initialStatus={boardStatus} onFilter={setBoardStatus} onOpen={o => setTicketId(o.id)} onDiagnose={diagnose} databaseAvailable={databaseAvailable} />}
            {view === 'customers' && <CustomerDirectory api={api} customers={customers} vehicles={vehicles} onCreated={() => { onChanged(); setMessage('Cliente registrado.'); }} canCreate={databaseAvailable} />}
            {view === 'diagnostic' && (databaseAvailable ? <DiagnosticTicket key={diagnosticOrder?.id || 'general'} api={api} vehicles={vehicles} mechanicId={settings.actorId} order={currentOrder} onChanged={onChanged} onReception={newReception} /> : <DatabaseRequired title="El diagnóstico requiere la base de datos" />)}
          </>}
        </div>}
      <footer className="app-footer"><span>NextGen AutoWorkshop</span><span>{connection === 'healthy' ? 'Operación local disponible' : connection === 'degraded' ? 'Servicios limitados' : 'Conexión local pendiente'} · {settings.workshopName || 'Taller Ruta 5'}</span></footer>
    </main>
    {ticketId && <WorkOrderTicket key={ticketId} api={api} orderId={ticketId} initial={orders.find(o => o.id === ticketId)} onClose={() => setTicketId('')} onChanged={onChanged} onDiagnose={diagnose} databaseAvailable={databaseAvailable} />}
    {message && <div className="toast" role="status"><Check size={20} /><span>{message}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setMessage('')}><X size={18} /></button></div>}
  </div>;
}

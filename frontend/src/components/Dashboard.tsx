import { Activity, ArrowUpRight, CheckCheck, Clock3, LayoutGrid, Plus, ScanLine } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Overview, Settings, Status, View, WorkOrder } from '../types';
import { dateTime, duration, isActive, labels, number, operationalLabel, operationalStage, operationalStages, stages } from '../services/workflow';
import { Empty, OrderTable } from './ui';

function Change({ value, before, compare, suffix = '' }: { value: number; before: number; compare: boolean; suffix?: string }) {
  if (!compare) return null;
  const change = value - before;
  return <span className="comparison">{change > 0 ? '+' : ''}{number(change)}{suffix} <span>vs. período anterior</span></span>;
}
export function WorkflowChart({ overview, onFilter }: { overview: Overview; onFilter: (status: Status) => void }) {
  const total = overview.workflow.reduce((n, s) => n + s.count, 0);
  const rows = operationalStages; const grouped = rows.map(s => ({ ...s, count: overview.workflow.filter(item => operationalStage(item.status) === s.code).reduce((sum, item) => sum + item.count, 0), averageHours: 0 }));
  const max = Math.max(...grouped.map(s => s.count), 1);
  return <section className="card workflow-card"><div className="card-heading"><div><h2>Flujo de trabajo</h2><p>Órdenes activas por etapa · ahora</p></div><span className="count-label">{number(total)} órdenes</span></div>
    {total ? <div className="workflow-chart" role="group" aria-label="Distribución actual de órdenes por etapa">{grouped.map((s, index) => {
      const count = s.count;
      return <button className="stage-column" key={s.code} onClick={() => onFilter(s.code)} aria-label={`${s.label}: ${count} órdenes. Filtrar.`} title={`${count} órdenes · ${number(count / total * 100)}% del total activo`}>
        <span className="stage-number">{count}</span><span className="bar-track"><span className={`workflow-bar bar-${index % 7}`} style={{ '--bar-height': `${count / max * 100}%` } as CSSProperties} /></span><span className="stage-label">{s.label}</span>
      </button>;
    })}</div> : <Empty title="El próximo ingreso inicia el flujo" detail="El gráfico se completará con las órdenes reales del taller." />}
    <div className="card-footnote"><Activity size={16} /><span>{total ? 'Selecciona una etapa para ver sus órdenes.' : 'Sin órdenes activas registradas.'}</span></div>
  </section>;
}
function PlantCard({ overview }: { overview: Overview }) {
  const total = overview.plant.reduce((n, s) => n + s.count, 0);
  let offset = 0;
  return <section className="card plant-card"><div className="card-heading"><h2>Vehículos en taller</h2><span className="small-label">Ahora</span></div>
    <div className="donut-wrap"><svg className="donut" viewBox="0 0 160 160" role="img" aria-label={`${total} vehículos distintos en planta`}>
      <circle cx="80" cy="80" r="63" fill="none" stroke="#f0f1f4" strokeWidth="14" />
      {overview.plant.map(s => { const length = total ? s.count / total * 100 : 0; const start = offset; offset += length;
        return <circle key={s.status} cx="80" cy="80" r="63" pathLength="100" fill="none" stroke={stages.find(i => i.code === s.status)?.color || '#858b94'} strokeWidth="14" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 80 80)" />;
      })}</svg><div className="donut-value"><b>{number(total)}</b><span>en el taller</span></div></div>
    <div className="plant-legend">{(total ? overview.plant : [{ status: 'RECEIVED' as Status, count: 0 }, { status: 'DIAGNOSING' as Status, count: 0 }, { status: 'IN_PROGRESS' as Status, count: 0 }]).map(s => <div key={s.status}><span><i style={{ background: stages.find(i => i.code === s.status)?.color || '#858b94' }} />{labels[s.status]}</span><b>{s.count}</b></div>)}</div>
  </section>;
}
export function Dashboard({ overview, orders, settings, compare, onNavigate, onFilter, onOpen, reports = false, databaseAvailable = true }: { overview?: Overview; orders: WorkOrder[]; settings: Settings; compare: boolean; onNavigate: (v: View) => void; onFilter: (s: Status) => void; onOpen: (o: WorkOrder) => void; reports?: boolean; databaseAvailable?: boolean }) {
  if (!overview) return <section className="card"><Empty title="Conecta tu taller para comenzar" detail="Conserva los IDs de tu instalación en Configuración. Aquí verás los datos reales de recepciones, órdenes y diagnósticos." action={<button className="primary" onClick={() => onNavigate('settings')}>Abrir configuración <ArrowUpRight size={18} /></button>} /></section>;
  const { current: m, previous: p } = overview;
  const efficiency = m.eligible ? m.completed / m.eligible * 100 : null;
  const previousEfficiency = p.eligible ? p.completed / p.eligible * 100 : null;
  const diagnosticMax = Math.max(...overview.dailyDiagnostics.map(d => d.count), 1);
  return <>
    {!reports && <div className="dashboard-main"><WorkflowChart overview={overview} onFilter={onFilter} /><PlantCard overview={overview} /></div>}
    <div className="metric-grid">
      <section className="card metric-card"><div className="metric-title"><span>Diagnósticos</span><ScanLine size={19} /></div><div className="metric-value">{number(m.diagnostics)}<span>escaneos</span></div><Change value={m.diagnostics} before={p.diagnostics} compare={compare} />
        {overview.dailyDiagnostics.length > 0 && <div className="mini-columns" role="img" aria-label="Escaneos en días con actividad">{overview.dailyDiagnostics.map(d => <span title={`${d.date}: ${d.count} escaneos`} key={d.date} style={{ height: `${Math.max(d.count / diagnosticMax * 100, 4)}%` }} />)}</div>}
        <p className={m.criticalDtcs ? 'metric-alert' : 'metric-note'}>{m.criticalDtcs} DTC de severidad alta detectados</p>
      </section>
      <section className="card metric-card"><div className="metric-title"><span>Tiempo promedio</span><Clock3 size={19} /></div><div className="metric-value">{duration(m.averageCycleHours)}</div><p className="metric-note">Ingreso a cierre de la orden</p>
        {compare && m.averageCycleHours != null && p.averageCycleHours != null && <Change value={m.averageCycleHours} before={p.averageCycleHours} suffix=" h" compare />}
        <div className="metric-bottom"><CheckCheck size={18} /><span>{m.closed ? `${m.closed} órdenes cerradas en el período` : 'Aún no hay cierres en el período'}</span></div>
      </section>
      <section className="card metric-card efficiency-card"><div className="metric-title"><span>Eficiencia del taller</span><ArrowUpRight size={20} /></div><div className="metric-value">{efficiency == null ? '—' : `${number(efficiency)}%`}</div><p>Ingresos del período ya cerrados</p>
        <div className="efficiency-track"><span style={{ width: `${efficiency || 0}%` }} /></div><span className="efficiency-caption">{m.completed} de {m.eligible} órdenes · excluye canceladas</span>
        {compare && efficiency != null && previousEfficiency != null && <Change value={efficiency} before={previousEfficiency} suffix=" pp" compare />}
      </section>
      <section className="card metric-card"><div className="metric-title"><span>Órdenes activas</span><LayoutGrid size={19} /></div><div className="metric-value">{orders.filter(o => isActive(o.status)).length}</div>
        <p className="metric-note">Cada ticket requiere solo el siguiente paso, no actualizaciones constantes.</p>
      </section>
    </div>
    {reports ? <section className="card"><div className="card-heading"><div><h2>Detalle del período</h2><p>{dateTime(overview.period.from)} al {dateTime(overview.period.to)} (fin exclusivo)</p></div></div><div className="table-scroll"><table><thead><tr><th>Indicador</th><th>Período seleccionado</th>{compare && <th>Período anterior</th>}</tr></thead><tbody>{[['Ingresos', m.received, p.received], ['Órdenes cerradas', m.closed, p.closed], ['Escaneos guardados', m.diagnostics, p.diagnostics], ['DTC de severidad alta', m.criticalDtcs, p.criticalDtcs]].map(([label, value, prev]) => <tr key={label}><td>{label}</td><td>{value}</td>{compare && <td>{prev}</td>}</tr>)}</tbody></table></div><p className="card-footnote">La eficiencia refleja el estado actual de las órdenes creadas en cada período. El tiempo promedio usa las órdenes cuyo cierre ocurrió dentro del período. Los DTC se cuentan por escaneo.</p></section>
      : <section className="card recent-card"><div className="card-heading"><div><h2>Últimos ingresos</h2><p>{orders.filter(o => isActive(o.status)).length} órdenes activas en el taller</p></div><button className="text-button" onClick={() => onNavigate('orders')}>Ver todas <ArrowUpRight size={17} /></button></div><OrderTable orders={orders.slice(0, 5)} onOpen={onOpen} /></section>}
    {!reports && <div className="quick-actions"><span>Accesos rápidos</span><button disabled={!databaseAvailable} title={databaseAvailable ? undefined : 'Esta acción requiere una base de datos disponible.'} onClick={() => onNavigate('reception')}><Plus size={18} /> Nuevo ingreso</button><button disabled={!databaseAvailable} title={databaseAvailable ? undefined : 'Esta acción requiere una base de datos disponible.'} onClick={() => onNavigate('diagnostic')}><ScanLine size={18} /> Iniciar escaneo</button><button onClick={() => onFilter('WAITING_APPROVAL')}>Órdenes por aprobar <ArrowUpRight size={16} /></button><button onClick={() => onFilter('READY_FOR_DELIVERY')}>Listos para entrega <ArrowUpRight size={16} /></button></div>}
  </>;
}

import { useState } from 'react';
import { ArrowUpRight, CarFront, LayoutGrid, List, Plus, Search, ScanLine } from 'lucide-react';
import type { Api, Customer, Status, Vehicle, WorkOrder } from '../types';
import { dateTime, isActive, labels, operationalLabel, operationalStage, operationalStages } from '../services/workflow';
import { Badge, Empty, Modal, OrderTable, Select } from './ui';
import { VehicleForm } from './ReceptionForm';

export function VehicleBoard({ orders, initialStatus = '', onFilter, onOpen, onDiagnose, allOrders = false, databaseAvailable = true }: { orders: WorkOrder[]; initialStatus?: string; onFilter: (status: string) => void; onOpen: (o: WorkOrder) => void; onDiagnose: (o: WorkOrder) => void; allOrders?: boolean; databaseAvailable?: boolean }) {
  const [query, setQuery] = useState(''); const [make, setMake] = useState(''); const [date, setDate] = useState('');
  const [layout, setLayout] = useState(allOrders ? 'list' : 'board');
  const base = allOrders ? orders : orders.filter(o => isActive(o.status) || o.status === 'DRAFT');
  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = base.filter(o => (!initialStatus || operationalStage(o.status) === initialStatus || o.status === initialStatus) && (!make || o.make === make) && (!date || new Date(o.created_at).toLocaleDateString('en-CA') === date) && normalize(`${o.plate || ''} ${o.make} ${o.model} ${o.customer_name} ${o.concern}`).includes(normalize(query)));
  const statusCodes = [...operationalStages.map(s => s.code), ...(allOrders ? ['CLOSED', 'CANCELLED'] : [])] as Status[];
  return <>
    <div className="filter-toolbar"><label className="search-input"><Search size={18} /><span className="sr-only">Buscar por patente, vehículo o cliente</span><input placeholder="Patente, vehículo o cliente…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <Select label="Etapa" value={initialStatus} onChange={onFilter} options={[["", "Todas las etapas"], ...operationalStages.map(s => [s.code, s.label] as [string, string]), ...(allOrders ? [["CLOSED", "Entregado"], ["CANCELLED", "Cancelado"]] as [string, string][] : [])]} />
      <Select label="Marca" value={make} onChange={setMake} options={[["", "Todas las marcas"], ...[...new Set(base.map(o => o.make))].sort().map(v => [v, v] as [string, string])]} />
      <label><span>Fecha de ingreso</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="view-toggle" role="group" aria-label="Vista de vehículos"><button className={layout === 'board' ? 'selected' : ''} aria-pressed={layout === 'board'} aria-label="Vista tablero" onClick={() => setLayout('board')}><LayoutGrid size={19} /></button><button className={layout === 'list' ? 'selected' : ''} aria-pressed={layout === 'list'} aria-label="Vista lista" onClick={() => setLayout('list')}><List size={20} /></button></div>
    </div>
    <div className="results-heading"><span>{filtered.length} {filtered.length === 1 ? 'orden' : 'órdenes'}</span>{(query || initialStatus || make || date) && <button className="text-button" onClick={() => { setQuery(''); onFilter(''); setMake(''); setDate(''); }}>Limpiar filtros</button>}</div>
    {layout === 'list' ? <section className="card"><OrderTable orders={filtered} onOpen={onOpen} /></section> : <div className="kanban">{statusCodes.filter(status => !initialStatus || initialStatus === status).filter(status => !['CLOSED', 'CANCELLED'].includes(status) || filtered.some(o => o.status === status)).map(status => {
      const items = filtered.filter(o => operationalStage(o.status) === status || o.status === status);
      return <section className="kanban-column" key={status}><div className="column-heading"><h2>{operationalLabel(status)}</h2><span>{items.length}</span></div>{!items.length ? <p className="empty-column">Sin órdenes en esta etapa</p> : items.map(o => <article className="vehicle-card" key={o.id}>
        <div className="vehicle-card-top"><span className="vehicle-symbol"><CarFront size={22} /></span><button className="icon-button" onClick={() => onOpen(o)} aria-label={`Abrir ticket ${o.plate || o.model}`}><ArrowUpRight size={19} /></button></div>
        <button className="vehicle-link" onClick={() => onOpen(o)}><strong className="technical">{o.plate || 'Sin patente'}</strong><span>{o.make} {o.model} {o.model_year}</span></button>
        <p className="vehicle-owner">{o.customer_name}</p><div className="vehicle-metadata"><span>{operationalLabel(o.status)}</span><span>{dateTime(o.received_at || o.created_at)}</span></div>
        <div className="vehicle-card-footer"><span className={`dtc-count ${o.critical_count ? 'critical' : ''}`}>{o.dtc_count} DTC{o.critical_count > 0 && ' · Alta'}</span><button className="text-button" onClick={() => onDiagnose(o)} disabled={!databaseAvailable} title={databaseAvailable ? undefined : 'El diagnóstico requiere la base de datos.'} aria-label={`Diagnóstico de ${o.plate || o.model}`}><ScanLine size={17} /> Diagnóstico</button></div>
      </article>)}</section>;
    })}</div>}
  </>;
}
export function VehicleRegistry({ api, vehicles, customers, orders, onCreated, onOpen, canCreate = true }: { api: Api; vehicles: Vehicle[]; customers: Customer[]; orders: WorkOrder[]; onCreated: () => void; onOpen: (o: WorkOrder) => void; canCreate?: boolean }) {
  const [query, setQuery] = useState(''); const [creating, setCreating] = useState(false);
  const items = vehicles.filter(v => `${v.plate} ${v.make} ${v.model} ${v.customer_name}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="card"><div className="card-heading"><label className="search-input"><Search size={18} /><span className="sr-only">Buscar vehículo registrado</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar vehículo registrado…" /></label><button className="primary" disabled={!customers.length || !canCreate} title={canCreate ? undefined : 'Esta acción requiere una base de datos disponible.'} onClick={() => setCreating(true)}><Plus size={18} /> Registrar vehículo</button></div>
    {!customers.length && <p className="notice">Primero registra un cliente desde Clientes o crea ambos en Nuevo ingreso.</p>}
    {!items.length ? <Empty title="No hay vehículos para mostrar" /> : <div className="table-scroll"><table><thead><tr><th>Patente</th><th>Vehículo</th><th>Propietario</th><th>Última orden</th></tr></thead><tbody>{items.map(v => { const order = orders.find(o => o.vehicle_id === v.id); return <tr key={v.id}><td className="technical">{v.plate || 'Sin patente'}</td><td>{v.make} {v.model}<span className="cell-detail">{v.model_year} {v.engine}</span></td><td>{v.customer_name || customers.find(c => c.id === v.customer_id)?.display_name}</td><td>{order ? <button className="text-button" onClick={() => onOpen(order)}><Badge status={order.status} /><ArrowUpRight size={16} /></button> : 'Sin ingresos'}</td></tr>; })}</tbody></table></div>}
    {creating && <Modal title="Registrar vehículo" onClose={() => setCreating(false)}><VehicleForm api={api} customers={customers} onCreated={() => { onCreated(); setCreating(false); }} /></Modal>}
  </section>;
}

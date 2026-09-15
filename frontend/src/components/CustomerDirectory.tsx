import { useState } from 'react';
import { Mail, Phone, Plus, Search } from 'lucide-react';
import type { Api, Customer, Vehicle } from '../types';
import { Empty, Modal } from './ui';
import { CustomerForm } from './ReceptionForm';

export function CustomerDirectory({ api, customers, vehicles, onCreated, canCreate = true }: { api: Api; customers: Customer[]; vehicles: Vehicle[]; onCreated: () => void; canCreate?: boolean }) {
  const [query, setQuery] = useState(''); const [creating, setCreating] = useState(false);
  const matches = customers.filter(c => `${c.display_name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="card"><div className="card-heading"><label className="search-input"><Search size={18} /><span className="sr-only">Buscar cliente</span><input placeholder="Nombre, teléfono o correo…" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="primary" disabled={!canCreate} title={canCreate ? undefined : 'Esta acción requiere una base de datos disponible.'} onClick={() => setCreating(true)}><Plus size={18} /> Nuevo cliente</button></div>
    {!matches.length ? <Empty title="No hay clientes para mostrar" detail="Registra un cliente o cambia los términos de búsqueda." /> : <div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Vehículos registrados</th></tr></thead><tbody>{matches.map(c => <tr key={c.id}><td><strong>{c.display_name}</strong></td><td>{c.phone ? <a className="contact-link" href={`tel:${c.phone}`}><Phone size={16} />{c.phone}</a> : 'Sin teléfono'}</td><td>{c.email ? <a className="contact-link" href={`mailto:${c.email}`}><Mail size={16} />{c.email}</a> : 'Sin correo'}</td><td>{vehicles.filter(v => v.customer_id === c.id).length}</td></tr>)}</tbody></table></div>}
    {creating && <Modal title="Nuevo cliente" onClose={() => setCreating(false)}><CustomerForm api={api} onCreated={() => { onCreated(); setCreating(false); }} /></Modal>}
  </section>;
}

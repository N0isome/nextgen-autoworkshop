import { useState } from 'react';
import { ArrowRight, CarFront, Check, ClipboardList, UserRound } from 'lucide-react';
import type { Api, Customer, Settings, Vehicle } from '../types';
import { post } from '../services/api';
import { Field, Form, Select, TextArea } from './ui';

type CustomerDraft = { name: string; phone: string; email: string };
type VehicleDraft = { make: string; model: string; plate: string; vin: string; year: string; engine: string };
const emptyCustomer: CustomerDraft = { name: '', phone: '', email: '' };
const emptyVehicle: VehicleDraft = { make: '', model: '', plate: '', vin: '', year: '', engine: '' };
function CustomerFields({ draft, onChange }: { draft: CustomerDraft; onChange: (v: CustomerDraft) => void }) {
  return <><Field label="Nombre completo" value={draft.name} onChange={name => onChange({ ...draft, name })} required minLength={3} maxLength={160} autoComplete="name" />
    <Field label="Teléfono" value={draft.phone} onChange={phone => onChange({ ...draft, phone })} type="tel" required minLength={7} maxLength={30} placeholder="+56 9 1234 5678" autoComplete="tel" />
    <Field label="Correo (opcional)" value={draft.email} onChange={email => onChange({ ...draft, email })} type="email" autoComplete="email" full /></>;
}
function VehicleFields({ draft, onChange }: { draft: VehicleDraft; onChange: (v: VehicleDraft) => void }) {
  return <><Field label="Patente" technical value={draft.plate} onChange={plate => onChange({ ...draft, plate: plate.toUpperCase() })} required pattern="[A-Za-z0-9\-]{4,15}" maxLength={15} placeholder="ABCD12" />
    <Field label="Marca" value={draft.make} onChange={make => onChange({ ...draft, make })} required minLength={2} maxLength={80} />
    <Field label="Modelo" value={draft.model} onChange={model => onChange({ ...draft, model })} required maxLength={100} />
    <Field label="Año" value={draft.year} onChange={year => onChange({ ...draft, year })} type="number" min={1950} max={2100} step={1} required />
    <Field label="Motor (opcional)" value={draft.engine} onChange={engine => onChange({ ...draft, engine })} maxLength={100} />
    <Field label="VIN (opcional)" technical value={draft.vin} onChange={vin => onChange({ ...draft, vin: vin.toUpperCase() })} minLength={17} maxLength={17} pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}" /></>;
}
const customerBody = (d: CustomerDraft) => ({ displayName: d.name.trim(), phone: d.phone.trim(), email: d.email.trim() || undefined });
const vehicleBody = (d: VehicleDraft, customerId: string) => ({ customerId, make: d.make.trim(), model: d.model.trim(), plate: d.plate.trim(), vin: d.vin.trim() || undefined, modelYear: Number(d.year), engine: d.engine.trim() || undefined });

export function CustomerForm({ api, onCreated }: { api: Api; onCreated: (customer: Customer) => void }) {
  const [draft, setDraft] = useState(emptyCustomer);
  return <Form onSubmit={async () => onCreated(await api<Customer>('/customers', post(customerBody(draft))))}><CustomerFields draft={draft} onChange={setDraft} /><button className="primary full">Registrar cliente <Check size={18} /></button></Form>;
}
export function VehicleForm({ api, customers, onCreated }: { api: Api; customers: Customer[]; onCreated: (vehicle: Vehicle) => void }) {
  const [customerId, setCustomerId] = useState(''); const [draft, setDraft] = useState(emptyVehicle);
  return <Form onSubmit={async () => onCreated(await api<Vehicle>('/vehicles', post(vehicleBody(draft, customerId))))}>
    <Select label="Propietario" value={customerId} onChange={setCustomerId} required full options={[["", "Selecciona un cliente"], ...customers.map(c => [c.id, c.display_name] as [string, string])]} /><VehicleFields draft={draft} onChange={setDraft} />
    <button className="primary full">Registrar vehículo <Check size={18} /></button>
  </Form>;
}
export function ReceptionForm({ api, customers, vehicles, onCreated, onRefresh }: { api: Api; customers: Customer[]; vehicles: Vehicle[]; settings?: Settings; onCreated: (id: string) => void; onRefresh: () => void }) {
  const [customerMode, setCustomerMode] = useState(customers.length ? 'existing' : 'new');
  const [vehicleMode, setVehicleMode] = useState('existing');
  const [customerId, setCustomerId] = useState(''); const [vehicleId, setVehicleId] = useState('');
  const [customerDraft, setCustomerDraft] = useState(emptyCustomer); const [vehicleDraft, setVehicleDraft] = useState(emptyVehicle);
  const [createdCustomer, setCreatedCustomer] = useState<Customer>(); const [createdVehicle, setCreatedVehicle] = useState<Vehicle>();
  const [concern, setConcern] = useState(''); const [notes, setNotes] = useState(''); const [km, setKm] = useState('');
  const [fuel, setFuel] = useState('50'); const [condition, setCondition] = useState('');
  const customerOptions = [...customers, ...(createdCustomer && !customers.some(c => c.id === createdCustomer.id) ? [createdCustomer] : [])];
  const vehicleOptions = [...vehicles, ...(createdVehicle && !vehicles.some(v => v.id === createdVehicle.id) ? [createdVehicle] : [])];
  const eligible = vehicleOptions.filter(v => v.customer_id === customerId);
  const isNewVehicle = customerMode === 'new' || vehicleMode === 'new';
  const selectedVehicle = vehicleOptions.find(v => v.id === vehicleId);
  const customerName = customerMode === 'new' ? customerDraft.name : customerOptions.find(c => c.id === customerId)?.display_name;

  return <div className="reception-layout"><section className="card reception-card"><Form onSubmit={async () => {
    // Existing endpoints are preserved. Keep each confirmed ID if a later step fails,
    // so a corrected submission does not create the customer or vehicle twice.
    let ownerId = customerId;
    if (customerMode === 'new') {
      const customer = await api<Customer>('/customers', post(customerBody(customerDraft)));
      ownerId = customer.id; setCreatedCustomer(customer); setCustomerId(customer.id); setCustomerMode('existing'); setVehicleMode('new');
    }
    let carId = vehicleId;
    if (isNewVehicle) {
      const car = await api<Vehicle>('/vehicles', post(vehicleBody(vehicleDraft, ownerId)));
      carId = car.id; setCreatedVehicle(car); setVehicleId(car.id); setVehicleMode('existing');
    }
    if (!ownerId || !carId) throw new Error('Selecciona el cliente y su vehículo.');
    const reception = await api<{ workOrderId: string }>('/receptions', post({ customerId: ownerId, vehicleId: carId, concern: concern.trim(), odometerKm: Number(km), fuelLevelPercent: Number(fuel), exteriorCondition: condition.trim() || undefined, notes: notes.trim() || undefined }));
    onRefresh(); onCreated(reception.workOrderId);
  }}>
    <div className="form-section-heading full"><span>01</span><h2>Cliente</h2><UserRound size={20} /></div>
    <Select label="Tipo de ingreso" value={customerMode} onChange={mode => { setCustomerMode(mode); setVehicleId(''); }} options={[["existing", "Cliente registrado"], ["new", "Nuevo cliente"]]} full />
    {customerMode === 'new' ? <CustomerFields draft={customerDraft} onChange={setCustomerDraft} /> : <Select label="Cliente" value={customerId} onChange={id => { setCustomerId(id); setVehicleId(''); }} required full options={[["", "Selecciona un cliente"], ...customerOptions.map(c => [c.id, c.display_name] as [string, string])]} />}
    <div className="form-section-heading full"><span>02</span><h2>Vehículo</h2><CarFront size={20} /></div>
    {customerMode !== 'new' && <Select label="Vehículo del cliente" value={vehicleMode} onChange={setVehicleMode} options={[["existing", "Vehículo registrado"], ["new", "Registrar otro vehículo"]]} full />}
    {isNewVehicle ? <VehicleFields draft={vehicleDraft} onChange={setVehicleDraft} /> : <Select label="Vehículo" value={vehicleId} onChange={setVehicleId} required full options={[["", eligible.length ? "Selecciona un vehículo" : "Sin vehículos: selecciona Registrar otro vehículo"], ...eligible.map(v => [v.id, `${v.plate || 'Sin patente'} · ${v.make} ${v.model} ${v.model_year || ''}`] as [string, string])]} />}
    <div className="form-section-heading full"><span>03</span><h2>Motivo y condición de ingreso</h2><ClipboardList size={20} /></div>
    <TextArea label="Síntoma informado por el cliente" value={concern} onChange={setConcern} required minLength={3} placeholder="Describe lo que ocurre y en qué condiciones se presenta." />
    <Field label="Kilometraje" technical value={km} onChange={setKm} type="number" min={0} max={2147483647} step={1} required />
    <label className="full fuel-field"><span>Combustible al ingresar <b>{fuel}%</b></span><input type="range" min="0" max="100" step="5" value={fuel} onChange={e => setFuel(e.target.value)} /><span className="fuel-labels"><small>Vacío</small><small>Medio estanque</small><small>Lleno</small></span></label>
    <TextArea label="Daños visibles (opcional)" value={condition} onChange={setCondition} />
    <TextArea label="Observaciones del ingreso (opcional)" value={notes} onChange={setNotes} />
    <div className="form-submit full"><p>Se creará una recepción asociada a una orden de trabajo.</p><button className="primary">Crear recepción y orden <ArrowRight size={19} /></button></div>
  </Form></section>
    <aside className="card reception-summary"><span className="section-eyebrow">NUEVO INGRESO</span><div className="summary-icon"><CarFront size={40} strokeWidth={1.5} /></div><h2>{isNewVehicle ? `${vehicleDraft.make || 'Tu próximo'} ${vehicleDraft.model || 'vehículo'}` : selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : 'Vehículo por seleccionar'}</h2><span className="plate-preview technical">{isNewVehicle ? vehicleDraft.plate || 'PATENTE' : selectedVehicle?.plate || 'PATENTE'}</span><dl><dt>Cliente</dt><dd>{customerName || 'Por completar'}</dd><dt>Etapa inicial</dt><dd>Ingreso</dd></dl><p>Desde el ticket puedes iniciar el diagnóstico y continuar con acciones simples.</p></aside>
  </div>;
}

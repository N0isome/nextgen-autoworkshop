import { useEffect, useRef, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { AlertCircle, ArrowUpRight, CarFront, LoaderCircle, X } from 'lucide-react';
import type { Status, WorkOrder } from '../types';
import { dateTime, labels, stages } from '../services/workflow';

export function Form({ children, onSubmit, className = '' }: { children: ReactNode; onSubmit: () => Promise<unknown> | unknown; className?: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  return <form className={className} aria-busy={busy} onSubmit={async e => {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await onSubmit(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { lock.current = false; setBusy(false); }
  }}><fieldset disabled={busy} className="form-grid">{children}</fieldset>
    {busy && <p className="saving" role="status"><LoaderCircle className="spin" size={18} /> Guardando…</p>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </form>;
}
export function Field({ label, value, onChange, full, technical, ...props }: { label: string; value: string; onChange: (value: string) => void; full?: boolean; technical?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <label className={full ? 'full' : ''}><span>{label}</span><input {...props} className={technical ? 'technical' : ''} value={value} onChange={e => onChange(e.target.value)} /></label>;
}
export function Select({ label, value, onChange, options, full, required = false, disabled = false }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; full?: boolean; required?: boolean; disabled?: boolean }) {
  return <label className={full ? 'full' : ''}><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)} required={required} disabled={disabled}>{options.map(([v, t]) => <option value={v} key={v}>{t}</option>)}</select></label>;
}
export function TextArea({ label, value, onChange, required, maxLength = 4000, minLength, placeholder }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string }) {
  return <label className="full"><span>{label}</span><textarea value={value} onChange={e => onChange(e.target.value)} required={required} minLength={minLength} maxLength={maxLength} placeholder={placeholder} /></label>;
}
export function ErrorMessage({ children }: { children: ReactNode }) { return <div className="error-message" role="alert"><AlertCircle size={19} /><span>{children}</span></div>; }
export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-icon"><CarFront size={26} /></span><h3>{title}</h3>{detail && <p>{detail}</p>}{action}</div>; }
export function Badge({ status }: { status: Status }) { return <span className={`badge ${stages.find(s => s.code === status)?.tone || 'neutral'}`}>{labels[status] || status}</span>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={21} /></button></div>{children}
  </dialog>;
}
export function OrderTable({ orders, onOpen }: { orders: WorkOrder[]; onOpen: (order: WorkOrder) => void }) {
  if (!orders.length) return <Empty title="No hay órdenes para mostrar" detail="Los ingresos aparecerán aquí al registrarlos." />;
  return <div className="table-scroll"><table><thead><tr><th>Vehículo</th><th>Cliente</th><th>Ingreso</th><th>Estado</th><th><span className="sr-only">Abrir ticket</span></th></tr></thead><tbody>{orders.map(o => <tr key={o.id}>
    <td><strong className="technical">{o.plate || 'Sin patente'}</strong><span className="cell-detail">{o.make} {o.model} {o.model_year}</span></td>
    <td>{o.customer_name}</td><td>{dateTime(o.received_at || o.created_at)}</td><td><Badge status={o.status} /></td>
    <td><button className="icon-button" onClick={() => onOpen(o)} aria-label={`Abrir ticket ${o.plate || o.model}`}><ArrowUpRight size={20} /></button></td>
  </tr>)}</tbody></table></div>;
}

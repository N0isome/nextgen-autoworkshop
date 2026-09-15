import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Link, ScanLine } from 'lucide-react';
import type { Api, Status, WorkOrder } from '../types';
import { post } from '../services/api';
import { dateTime, labels, nextAction, number, transitions } from '../services/workflow';
import { Badge, ErrorMessage, Form, Modal, Select, TextArea } from './ui';

export function WorkOrderTicket({ api, orderId, initial, onClose, onChanged, onDiagnose, databaseAvailable = true }: { api: Api; orderId: string; initial?: WorkOrder; onClose: () => void; onChanged: () => void; onDiagnose: (order: WorkOrder) => void; databaseAvailable?: boolean }) {
  const [order, setOrder] = useState(initial); const [error, setError] = useState(''); const [alternative, setAlternative] = useState(''); const [note, setNote] = useState(''); const [completedWork, setCompletedWork] = useState(''); const [deliveryNotes, setDeliveryNotes] = useState(''); const [loading, setLoading] = useState(true); const [shareMessage, setShareMessage] = useState('');
  useEffect(() => { if (!databaseAvailable) { setLoading(false); setError(''); return; } let current = true; setLoading(true);
    api<WorkOrder>(`/work-orders/${orderId}`).then(o => { if (current) { setOrder(o); setError(''); } }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, databaseAvailable, orderId]);
  async function change(toStatus: Status, delivery = false) {
    if (!order) return;
    const updated = await api<WorkOrder>(`/work-orders/${order.id}/transitions`, post({ toStatus, reason: note.trim() || undefined, completedWork: delivery ? completedWork.trim() || undefined : undefined, deliveryNotes: delivery ? deliveryNotes.trim() || undefined : undefined }));
    setOrder(current => current ? { ...current, ...updated } : current); setAlternative(''); setNote(''); setCompletedWork(''); setDeliveryNotes(''); onChanged();
    try { setOrder(await api<WorkOrder>(`/work-orders/${order.id}`)); } catch { setError('El cambio quedó guardado. Actualiza para volver a cargar la ficha completa.'); }
  }
  async function share() {
    if (!order) return;
    const link = await api<{ path: string }>(`/work-orders/${order.id}/public-link`, post({}));
    const url = `${window.location.origin}${link.path}`;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setShareMessage(`Enlace copiado: ${url}`);
  }
  const action = order && nextAction(order.status);
  const exceptional = order ? (transitions[order.status] || []).filter(s => s !== action?.toStatus && !['QUALITY_CHECK', 'APPROVED'].includes(s)) : [];
  return <Modal title="Ticket de trabajo" wide onClose={onClose}>
    {loading && <p role="status">Cargando ticket…</p>}{error && <ErrorMessage>{error}</ErrorMessage>}
    {order && <><div className="ticket-title"><div><span className="plate-preview technical">{order.plate || 'Sin patente'}</span><h2>{order.make} {order.model} {order.model_year}</h2><p>{order.customer_name}</p></div><Badge status={order.status} /></div>
      <div className="ticket-summary"><div><span>Ingreso</span><strong>{dateTime(order.received_at || order.created_at)}</strong></div><div><span>Kilometraje</span><strong className="technical">{order.odometer_km == null ? 'Sin registro' : `${number(order.odometer_km)} km`}</strong></div><div><span>Combustible</span><strong>{order.fuel_level_percent == null ? 'Sin registro' : `${order.fuel_level_percent}%`}</strong></div></div>
      <div className="ticket-concern"><h3>Motivo del ingreso</h3><p>{order.concern}</p>{order.notes && <><h3>Observaciones</h3><p>{order.notes}</p></>}{order.exterior_condition && <><h3>Daños visibles</h3><p>{order.exterior_condition}</p></>}</div>
      <div className="ticket-actions"><button className="primary" disabled={!databaseAvailable} title={databaseAvailable ? undefined : 'El diagnóstico requiere una base de datos disponible.'} onClick={() => onDiagnose(order)}><ScanLine size={19} /> Abrir diagnóstico</button><button className="secondary" disabled={!databaseAvailable} onClick={() => void share()}><Link size={18} /> Compartir estado</button><span>{order.dtc_count} DTC en el último escaneo asociado</span></div>{shareMessage && <p className="small-note">{shareMessage}</p>}
      {action && <div className="transition-panel simple-flow"><h3>Siguiente paso</h3><p>{action.label}. Solo registra una nota si aporta información útil.</p>{action.needsDelivery && <><TextArea label="Trabajo realizado" value={completedWork} onChange={setCompletedWork} minLength={3} placeholder="Qué se reparó o resolvió." /><TextArea label="Observación de entrega (opcional)" value={deliveryNotes} onChange={setDeliveryNotes} placeholder="Recomendaciones para el cliente." /></>}<TextArea label="Nota de actualización (opcional)" value={note} onChange={setNote} maxLength={1000} placeholder="Solo si hay algo relevante que dejar registrado." /><button className="primary" disabled={!databaseAvailable || loading || (action.needsDelivery && completedWork.trim().length < 3)} onClick={() => void change(action.toStatus, action.needsDelivery)}>{action.needsDelivery ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}{action.label}</button></div>}
      {exceptional.length > 0 && <div className="transition-panel alternative-flow"><h3>Situación excepcional</h3><Form onSubmit={() => { if (!alternative) throw new Error('Selecciona una opción.'); return change(alternative as Status); }}><fieldset disabled={!databaseAvailable}><Select label="Acción excepcional" value={alternative} onChange={setAlternative} options={[["", "Selecciona una opción"], ...exceptional.map(s => [s, labels[s]] as [string, string])]} /><TextArea label="Nota de actualización" value={note} onChange={setNote} required minLength={3} maxLength={1000} /><button className="secondary full" disabled={loading || Boolean(error)}>Guardar <ArrowRight size={18} /></button></fieldset></Form></div>}
      {order.status === 'CLOSED' && <div className="delivery-report"><h3>Informe de entrega</h3><p><b>Trabajo realizado:</b> {order.completed_work || 'Sin detalle registrado.'}</p>{order.delivery_notes && <p><b>Recomendación:</b> {order.delivery_notes}</p>}<p className="small-note">Entregado: {dateTime(order.delivered_at || order.updated_at)}.</p></div>}
      <h3>Historial de la orden</h3><ol className="timeline">{order.timeline?.map(e => <li key={e.id}><div><b>{e.payload.toStatus ? labels[e.payload.toStatus as Status] : e.event_type === 'Vehicle.Received.v1' ? 'Vehículo recibido' : 'Orden creada'}</b><span>{dateTime(e.occurred_at)}</span></div>{e.payload.reason && <p>{e.payload.reason}</p>}</li>)}</ol>
    </>}
  </Modal>;
}

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Wrench } from 'lucide-react';
import type { PublicOrderStatus, Settings } from '../types';
import { dateTime } from '../services/workflow';

export function PublicOrderStatus({ token, settings }: { token: string; settings: Settings }) {
  const [data, setData] = useState<PublicOrderStatus>(); const [error, setError] = useState('');
  useEffect(() => { let active = true; const controller = new AbortController();
    fetch(`${settings.apiUrl.replace(/\/+$/, '')}/public/orders/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || 'No fue posible encontrar este seguimiento.'); return body as PublicOrderStatus; })
      .then(value => { if (active) setData(value); }).catch(e => { if (active && e.name !== 'AbortError') setError(e.message || 'No fue posible cargar el seguimiento.'); });
    return () => { active = false; controller.abort(); };
  }, [settings.apiUrl, token]);
  return <main className="public-page"><section className="public-card">{!data && !error && <p role="status">Cargando seguimiento…</p>}{error && <><Wrench size={34} /><h1>Seguimiento no disponible</h1><p>{error}</p></>}{data && <><div className="public-brand"><Wrench size={22} /><span>{data.workshop}</span></div><span className="section-eyebrow">ESTADO DEL VEHÍCULO</span><h1>{data.vehicle}</h1><p className="public-plate technical">{data.plate}</p><div className="public-stage"><CheckCircle2 size={24} /><div><b>{data.stage}</b><span>Última actualización: {dateTime(data.updatedAt)}</span></div></div>{data.report && <div className="public-report"><h2>Informe de entrega</h2><p><b>Trabajo realizado:</b> {data.report.completedWork}</p>{data.report.deliveryNotes && <p><b>Recomendaciones:</b> {data.report.deliveryNotes}</p>}<p className="small-note"><Clock3 size={14} /> Entregado: {dateTime(data.deliveredAt || data.updatedAt)}</p></div>}<p className="public-note">Este enlace muestra solo el avance necesario para el cliente. Para consultas, contacta al taller.</p></>}</section></main>;
}

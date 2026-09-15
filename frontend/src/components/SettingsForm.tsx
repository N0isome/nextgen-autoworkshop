import { useState } from 'react';
import { Save } from 'lucide-react';
import type { Settings } from '../types';
import { Field, Form, Select } from './ui';

export function SettingsForm({ initial, onSave }: { initial: Settings; onSave: (s: Settings) => void }) {
  const [draft, setDraft] = useState(initial);
  const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  return <section className="card settings-card"><h2>Configuración de este puesto</h2><p className="small-note">Usa los identificadores de tu instalación actual. Se conserva la configuración guardada en este navegador.</p><Form onSubmit={() => {
    const url = new URL(draft.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La dirección de la API debe comenzar con http:// o https://.');
    onSave({ ...draft, apiUrl: draft.apiUrl.trim().replace(/\/+$/, '') });
  }}><div className="form-section-heading full"><span>01</span><h3>Taller y mecánico</h3></div><Field label="Nombre del taller" value={draft.workshopName || ''} onChange={workshopName => setDraft({ ...draft, workshopName })} maxLength={100} /><Field label="Nombre del mecánico" value={draft.mechanicName || ''} onChange={mechanicName => setDraft({ ...draft, mechanicName })} maxLength={100} /><Select label="Apariencia" value={draft.theme || 'system'} onChange={theme => setDraft({ ...draft, theme: theme as Settings['theme'] })} options={[["system", "Según el sistema"], ["light", "Modo claro"], ["dark", "Modo oscuro"]]} />
    <p className="small-note full">Las bahías ya no son parte del flujo diario. Las asignaciones antiguas se conservan en sus tickets.</p>
    <div className="form-section-heading full"><span>02</span><h3>Conexión local</h3></div><Field label="Dirección de la API" type="url" full value={draft.apiUrl} onChange={apiUrl => setDraft({ ...draft, apiUrl })} required /><Field label="Token de desarrollo" type="password" full autoComplete="off" value={draft.token} onChange={token => setDraft({ ...draft, token })} required />
    <Field label="Tenant ID" value={draft.tenantId} onChange={tenantId => setDraft({ ...draft, tenantId })} required pattern={uuid} /><Field label="Workshop ID" value={draft.workshopId} onChange={workshopId => setDraft({ ...draft, workshopId })} required pattern={uuid} />
    <Field label="Actor ID" value={draft.actorId} onChange={actorId => setDraft({ ...draft, actorId })} required pattern={uuid} /><Field label="Identificador del dispositivo" value={draft.deviceId || 'recepcion-web-01'} onChange={deviceId => setDraft({ ...draft, deviceId })} required maxLength={100} />
    <button className="primary full"><Save size={18} /> Guardar configuración</button>
  </Form></section>;
}

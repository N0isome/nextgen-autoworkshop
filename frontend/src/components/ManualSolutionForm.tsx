import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Api, Vehicle } from '../types';
import { post } from '../services/api';
import { safeUrl } from '../services/workflow';
import { Field, Form, TextArea } from './ui';

export function ManualSolutionForm({ api, mechanicId, vehicle, sessionId, code, onSaved, disabled }: { api: Api; mechanicId: string; vehicle: Vehicle; sessionId: string; code: string; onSaved: () => void; disabled: boolean }) {
  const draftKey = `workshop-solution-draft:${sessionId}:${code}`;
  const [draft] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(draftKey) || '{}');
      return Object.fromEntries(['component', 'procedure', 'notes', 'files'].map(key => [key, typeof stored?.[key] === 'string' ? stored[key] : ''])) as Record<string, string>;
    } catch { return {} as Record<string, string>; }
  });
  const [component, setComponent] = useState(draft.component || ''); const [procedure, setProcedure] = useState(draft.procedure || ''); const [notes, setNotes] = useState(draft.notes || ''); const [files, setFiles] = useState(draft.files || '');
  const [year, setYear] = useState(String(vehicle.model_year || ''));
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify({ component, procedure, notes, files })); } catch { /* Browser draft storage can be unavailable. */ } }, [draftKey, component, procedure, notes, files]);
  return <div className="manual-solution"><span className="badge amber">Corrección del diagnóstico</span><h3>Ingresar solución real del taller</h3><p>Registra la reparación comprobada para {vehicle.make} {vehicle.model} · <span className="technical">{code}</span>.</p><Form onSubmit={async () => {
    if (procedure.trim().length < 3) throw new Error('Describe el procedimiento realizado.');
    const urls = files.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
    if (urls.length > 10 || urls.some((url: string) => !safeUrl(url))) throw new Error('Ingresa hasta 10 enlaces completos que comiencen con https:// o http://.');
    const mechanicNotes = `Procedimiento realizado:\n${procedure.trim()}${notes.trim() ? `\n\nNotas del mecánico:\n${notes.trim()}` : ''}`;
    if (mechanicNotes.length > 4000) throw new Error('El procedimiento y las notas no pueden superar los 4.000 caracteres en conjunto.');
    await api('/diagnostics/knowledge', post({ mechanic_id: mechanicId, vehicle: { brand: vehicle.make, model: vehicle.model, year: Number(year), engine: vehicle.engine || undefined }, request_type: 'alimentacion_manual', payload: { dtc_code: code, diagnostic_session_id: sessionId, real_solution_data: { failed_component: component.trim(), mechanic_notes: mechanicNotes, attached_files: urls } } }));
    try { sessionStorage.removeItem(draftKey); } catch { /* The server already confirmed the saved solution. */ }
    onSaved();
  }}><Field label="Año del vehículo" value={year} onChange={setYear} type="number" required min={1950} max={2100} step={1} readOnly={Boolean(vehicle.model_year)} /><Field label="Pieza o componente fallado" value={component} onChange={setComponent} required minLength={2} maxLength={200} /><TextArea label="Procedimiento realizado" value={procedure} onChange={setProcedure} required minLength={3} maxLength={3500} /><TextArea label="Notas del mecánico (opcional)" value={notes} onChange={setNotes} maxLength={1500} /><TextArea label="Enlaces de evidencias o PDF públicos (opcional)" value={files} onChange={setFiles} placeholder="Un enlace por línea" /><button className="primary full" disabled={disabled}><Check size={18} /> Guardar solución verificada</button></Form></div>;
}

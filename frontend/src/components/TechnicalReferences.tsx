import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import type { TechnicalReference } from '../types';
import { safeUrl } from '../services/workflow';

export function TechnicalReferences({ references = [], files = [] }: { references?: TechnicalReference[]; files?: string[] }) {
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return [...references, ...files.map((url, i) => ({ title: `Evidencia del taller ${i + 1}`, type: 'Evidencia', search_query_suggestion: url }))].filter(r => {
      const url = safeUrl(r.search_query_suggestion); if (!url || seen.has(url)) return false; seen.add(url); return true;
    });
  }, [references, files]);
  const pdfs = entries.filter(r => /\.pdf(?:$|[?#])/i.test(r.search_query_suggestion));
  const [selected, setSelected] = useState(''); const [zoom, setZoom] = useState(100);
  const first = pdfs[0]?.search_query_suggestion || '';
  useEffect(() => { setSelected(first); setZoom(100); }, [first]);
  return <aside className="card reference-panel"><div className="card-heading"><h2>Literatura técnica</h2><FileText size={20} /></div><p className="small-note">Fuentes públicas y evidencias del taller</p>
    {selected && safeUrl(selected) ? <><div className="pdf-toolbar"><button className="icon-button" aria-label="Reducir zoom" disabled={zoom <= 50} onClick={() => setZoom(v => v - 25)}><ZoomOut size={18} /></button><span>{zoom}%</span><button className="icon-button" aria-label="Aumentar zoom" disabled={zoom >= 200} onClick={() => setZoom(v => v + 25)}><ZoomIn size={18} /></button><a className="icon-button" href={selected} target="_blank" rel="noreferrer" aria-label="Abrir PDF en otra pestaña"><ExternalLink size={18} /></a></div><iframe title="Documento técnico PDF" key={`${selected}:${zoom}`} src={`${selected.split('#')[0]}#zoom=${zoom}`} referrerPolicy="no-referrer" /><p className="small-note">Si el sitio impide verlo aquí, ábrelo en otra pestaña. El zoom depende del visor de tu navegador.</p></>
      : <div className="pdf-placeholder"><FileText size={29} /><strong>Sin PDF disponible</strong><span>El diagnóstico puede continuar con las fuentes encontradas.</span></div>}
    <ul className="references-list">{entries.map(r => <li key={r.search_query_suggestion}><span>{r.type}</span><a href={safeUrl(r.search_query_suggestion)} target="_blank" rel="noreferrer">{r.title}<ExternalLink size={15} /></a>{/\.pdf(?:$|[?#])/i.test(r.search_query_suggestion) && <button className="secondary" onClick={() => setSelected(r.search_query_suggestion)}>Ver documento</button>}</li>)}</ul>
    {!entries.length && <p className="small-note">No se encontraron fuentes públicas. No es necesario cargar documentos para diagnosticar.</p>}
    <p className="market-note">NHTSA y las referencias de Toyota EE. UU. corresponden al mercado estadounidense. Confirma motor, variante y mercado antes de aplicar un procedimiento.</p>
  </aside>;
}

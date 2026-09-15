import { CloudUpload, Monitor, RefreshCw, Settings2, Sun, Moon, Wrench } from 'lucide-react';
import type { ConnectionState, Overview, Settings, View } from '../types';

const navigation: [View, string][] = [['home', 'Inicio'], ['reception', 'Recepción'], ['vehicles', 'Vehículos'], ['diagnostic', 'Diagnóstico'], ['orders', 'Órdenes'], ['customers', 'Clientes'], ['reports', 'Reportes']];
export function AppHeader({ view, onNavigate, settings, connection, busy, overview, onRefresh, onThemeChange }: { view: View; onNavigate: (v: View) => void; settings: Settings; connection: ConnectionState; busy: boolean; overview?: Overview; onRefresh: () => void; onThemeChange: (theme: 'light' | 'dark' | 'system') => void }) {
  const initials = (settings.mechanicName || 'Mecánico').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return <header className="app-header">
    <button className="brand" onClick={() => onNavigate('home')} aria-label="NextGen AutoWorkshop, ir a Inicio"><span className="brand-symbol"><Wrench size={24} strokeWidth={2.3} /></span><span><b>NextGen<span className="brand-dot">.</span></b><small>AutoWorkshop</small></span></button>
    <nav aria-label="Navegación principal">{navigation.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)} aria-current={view === id ? 'page' : undefined}>{label}</button>)}</nav>
    <div className="header-tools">
      <span className={`connection ${connection}`} title={connection === 'healthy' ? 'API y base de datos locales disponibles.' : connection === 'degraded' ? 'La API responde, pero la base de datos no está disponible.' : 'No se ha confirmado una conexión con la API.'}><span />{busy && connection === 'checking' ? 'Comprobando' : connection === 'healthy' ? 'Sistema operativo' : connection === 'degraded' ? 'Servicios limitados' : connection === 'checking' ? 'Comprobando' : 'Sin conexión'}</span>
      <button className="icon-button" disabled={busy} onClick={onRefresh} aria-label="Actualizar datos"><RefreshCw size={19} className={busy ? 'spin' : ''} /></button>
      <span className="sync-indicator" title={overview ? `${overview.sync.pending} eventos pendientes. El envío a la nube depende del agente de sincronización.` : 'Estado de sincronización no disponible'}><CloudUpload size={19} /><span>{overview?.sync.pending ?? '—'}</span></span>
      <div className="theme-switch" role="group" aria-label="Apariencia">
        <button className={!settings.theme || settings.theme === 'system' ? 'active' : ''} onClick={() => onThemeChange('system')} aria-pressed={!settings.theme || settings.theme === 'system'} title="Seguir la apariencia del sistema"><Monitor size={17} /><span>Auto</span></button>
        <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} aria-pressed={settings.theme === 'light'} title="Usar modo claro"><Sun size={17} /><span>Claro</span></button>
        <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} aria-pressed={settings.theme === 'dark'} title="Usar modo oscuro"><Moon size={17} /><span>Oscuro</span></button>
      </div>
      <button className={`icon-button ${view === 'settings' ? 'selected' : ''}`} onClick={() => onNavigate('settings')} aria-label="Configuración"><Settings2 size={20} /></button>
      <span className="avatar" title={settings.mechanicName || 'Mecánico'} aria-label={settings.mechanicName || 'Mecánico'}>{initials}</span>
    </div>
  </header>;
}

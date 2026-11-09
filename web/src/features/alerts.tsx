import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner, Empty, Failure, Heading, Loading, dateTime } from '../components/ui';
import { stateOf } from '../contracts';
import type { Alert, AlertState, Role, Severity } from '../contracts';
import { api } from '../services/api';
import { useResource } from '../services/useResource';

const states = { active: 'Ativo', acknowledged: 'Reconhecido', resolved: 'Resolvido' } as const;
const severities = { warning: 'Atenção', critical: 'Crítico' } as const;
const labels = {
  temperature_high: 'Temperatura alta', temperature_low: 'Temperatura baixa', humidity_high: 'Umidade alta', humidity_low: 'Umidade baixa',
  current_high: 'Corrente RMS alta', telemetry_stale: 'Telemetria desatualizada', sensor_invalid: 'Sensor inválido',
} as const;

function Acknowledge({ alert, onSaved }: { alert: Alert; onSaved: () => void }) {
  const [open, setOpen] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return <Dialog.Root open={open} onOpenChange={value => {
    if (busy) return;
    setOpen(value);
    setNote('');
    setError(null);
  }}>
    <Dialog.Trigger asChild><button className="button"><ClipboardCheck size={16}/> Reconhecer</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content">
      <Dialog.Close className="icon-button dialog-close" aria-label="Fechar" disabled={busy}><X size={20}/></Dialog.Close>
      <Dialog.Title>Reconhecer alerta</Dialog.Title>
      <Dialog.Description>Registre ciência de “{labels[alert.type]}”. A condição permanece aberta até a resolução.</Dialog.Description>
      <form onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.acknowledge(alert.id, note.trim() || undefined);
          setOpen(false);
          onSaved();
        } catch (failure) {
          setError(failure instanceof Error ? failure : new Error('Falha ao reconhecer alerta.'));
        } finally { setBusy(false); }
      }}>
        <label>Nota de auditoria (opcional)<textarea maxLength={500} rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="Descreva o que foi verificado…"/></label>
        <p className="counter">{note.length}/500 caracteres</p>
        {error && <Failure error={error}/>}
        <div className="dialog-actions"><Dialog.Close asChild><button type="button" className="button" disabled={busy}>Cancelar</button></Dialog.Close><button className="button primary" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar reconhecimento'}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
export function Alerts({ role }: { role: Role }) {
  const [params, setParams] = useSearchParams();
  const deviceId = params.get('device_id') || undefined;
  const [state, setState] = useState<AlertState | ''>(''), [severity, setSeverity] = useState<Severity | ''>('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]), [saved, setSaved] = useState(false);
  const cursor = cursors.at(-1);
  const result = useResource(`alerts:${state}:${deviceId}:${cursor}`, signal => api.alerts({ state: state || undefined, device_id: deviceId, cursor }, signal));
  const devices = useResource('alerts-devices', signal => api.devices(undefined, signal));
  const items = result.data?.items.filter(alert => !severity || severity === alert.severity) ?? [];
  return <>
    <Heading title="Central de alertas" subtitle="Consulte ocorrências e acompanhe o reconhecimento de alertas dos racks."><button className="button" onClick={result.reload}><RefreshCw size={16}/> Atualizar</button></Heading>
    <div className="filter-panel alerts-filters"><label>Estado <select value={state} onChange={event => { setState(event.target.value as AlertState | ''); setCursors([undefined]); }}><option value="">Todos os estados</option>{Object.entries(states).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Gravidade <select value={severity} onChange={event => { setSeverity(event.target.value as Severity | ''); setCursors([undefined]); }}><option value="">Todas as gravidades</option>{Object.entries(severities).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Dispositivo <select value={deviceId ?? ''} onChange={event => { setCursors([undefined]); setParams(event.target.value ? { device_id: event.target.value } : {}); }}><option value="">Todos os dispositivos</option>{deviceId && !devices.data?.items.some(device => device.id === deviceId) && <option value={deviceId}>{deviceId}</option>}{devices.data?.items.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label></div>
    {saved && <Banner tone="green" title="Reconhecimento registrado">O alerta continua aberto até a resolução.</Banner>}
    {result.error && <Failure error={result.error} cached={!!result.data}/>}
    {result.busy && !result.data ? <Loading/> : !items.length ? <Empty title="Nenhum alerta nesta página">Altere os filtros para consultar outras ocorrências.</Empty> : <div className="alert-list">{items.map(alert => {
      const status = stateOf(alert), Icon = status === 'resolved' ? CircleCheck : status === 'acknowledged' ? ClipboardCheck : BellRing;
      return <article className="alert-card" key={alert.id}><div className={'stat-icon ' + (alert.severity === 'critical' ? 'red' : 'amber')}><AlertTriangle size={20}/></div><div className="alert-copy"><div className="alert-badges"><span className={'badge ' + (alert.severity === 'critical' ? 'red' : 'amber')}><AlertTriangle size={13}/>{severities[alert.severity]}</span><span className={'badge ' + (status === 'resolved' ? 'green' : 'slate')}><Icon size={13}/>{states[status]}</span></div><h2>{labels[alert.type]}</h2><p>{alert.message}</p><p><Link to={'/devices/' + encodeURIComponent(alert.device_id)}>{devices.data?.items.find(device => device.id === alert.device_id)?.name ?? alert.device_id}</Link> · Aberto em {dateTime(alert.opened_at)}</p>{alert.acknowledged_at && <p><CheckCircle2 size={14}/> Reconhecido por {alert.acknowledged_by ?? '—'} em {dateTime(alert.acknowledged_at)}{alert.note ? ' · ' + alert.note : ''}</p>}{alert.resolved_at && <p>Resolvido em {dateTime(alert.resolved_at)}</p>}</div>{status === 'active' && role !== 'viewer' && <Acknowledge alert={alert} onSaved={() => { setSaved(true); result.reload(); }}/>}</article>;
    })}</div>}
    {(cursors.length > 1 || result.data?.next_cursor) && <div className="pagination"><span>Página {cursors.length}</span><button className="button" disabled={cursors.length === 1} onClick={() => setCursors(previous => previous.slice(0, -1))}><ChevronLeft size={17}/> Anterior</button><button className="button" disabled={!result.data?.next_cursor} onClick={() => { const next = result.data?.next_cursor; if (next) setCursors(previous => [...previous, next]); }}>Próxima <ChevronRight size={17}/></button></div>}
  </>;
}

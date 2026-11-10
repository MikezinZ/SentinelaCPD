import { ArrowLeft, Droplets, RefreshCw, Save, Thermometer, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Failure, Heading, Loading } from '../components/ui';
import { ApiError, validateLimits } from '../contracts';
import type { Limits } from '../contracts';
import { api } from '../services/api';
import { useResource } from '../services/useResource';

type Field = Exclude<keyof Limits, 'version'>;
const groups = [
  { title: 'Temperatura', icon: Thermometer, tone: 'amber', fields: [['temperature_min', 'Mínima (°C)'], ['temperature_max', 'Máxima (°C)'], ['temperature_hysteresis', 'Histerese (°C)']] },
  { title: 'Umidade', icon: Droplets, tone: 'blue', fields: [['humidity_min', 'Mínima (% UR)'], ['humidity_max', 'Máxima (% UR)'], ['humidity_hysteresis', 'Histerese (p.p.)']] },
  { title: 'Corrente RMS', icon: Zap, tone: 'green', fields: [['current_max', 'Máxima (A)'], ['current_hysteresis', 'Histerese (A)']] },
] as const;
function LimitForm({ id, original, reload }: { id: string; original: Limits; reload: () => void }) {
  const [record, setRecord] = useState(original);
  const [input, setInput] = useState<Partial<Record<Field, string>>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<Error | null>(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const conflict = error instanceof ApiError && error.status === 409;
  function field(name: Field, label: string) {
    return <label key={name}>{label}<input inputMode={name === 'consecutive_samples' ? 'numeric' : 'decimal'} value={input[name] ?? String(record[name] ?? '').replace('.', ',')} aria-invalid={!!fields[name]} aria-describedby={fields[name] ? name + '-error' : undefined} onChange={event => { setSaved(false); setInput(previous => ({ ...previous, [name]: event.target.value })); }} placeholder="Sem limite"/>{fields[name] && <small className="field-error" id={name + '-error'}>{fields[name]}</small>}</label>;
  }
  return <form className="limits-form" noValidate onSubmit={async event => {
    event.preventDefault();
    if (busy || conflict) return;
    setError(null);
    setSaved(false);
    const payload = { ...record };
    for (const [key, raw] of Object.entries(input)) {
      const name = key as Field, value = raw.trim();
      const number = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) ? Number(value.replace(',', '.')) : NaN;
      if (name === 'consecutive_samples') payload[name] = number;
      else payload[name] = value ? number : null;
    }
    const errors = validateLimits(payload);
    setFields(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const updated = await api.saveLimits(id, payload);
      setRecord(updated);
      setInput({});
      setSaved(true);
    } catch (failure) {
      const caught = failure instanceof Error ? failure : new Error('Falha ao salvar os limites.');
      setError(caught);
      if (caught instanceof ApiError && caught.fields) setFields(caught.fields);
    } finally { setBusy(false); }
  }}>
    {conflict ? <Banner title="Conflito de versão · HTTP 409" tone="red">Outra sessão atualizou os limites. Recarregue os dados para continuar. <button type="button" className="button" onClick={reload}><RefreshCw size={15}/> Recarregar limites</button></Banner> : error && <Failure error={error}/>}
    {saved && <Banner title="Limites atualizados" tone="green">Versão {record.version} salva.</Banner>}
    <fieldset disabled={busy || conflict}><legend className="sr-only">Limites de operação</legend>
      {groups.map(({ title, icon: Icon, tone, fields: groupFields }) => <section className="form-panel" key={title}><h2><span className={'stat-icon ' + tone}><Icon size={18}/></span>{title}</h2><div className="form-grid">{groupFields.map(([name, label]) => field(name, label))}</div></section>)}
      <section className="form-panel"><h2>Regra de avaliação</h2><div className="form-grid">{field('consecutive_samples', 'Amostras consecutivas')}</div></section>
    </fieldset>
    <div className="form-footer"><p>Versão {record.version} · Campos vazios desativam os limites opcionais.</p><button className="button primary" disabled={busy || conflict}><Save size={17}/>{busy ? 'Salvando…' : 'Salvar limites'}</button></div>
  </form>;
}
export function DeviceLimits() {
  const { id = '' } = useParams();
  const [revision, setRevision] = useState(0);
  const result = useResource(`limits:${id}:${revision}`, signal => api.limits(id, signal));
  const device = useResource('limits-device:' + id, signal => api.device(id, signal));
  return <><Link className="back" to={'/devices/' + encodeURIComponent(id)}><ArrowLeft size={16}/> Voltar ao dispositivo</Link><Heading title="Limites de operação" subtitle={device.data?.name ?? id}/>{result.error && <><Failure error={result.error}/><button className="button" onClick={result.reload}>Tentar novamente</button></>}{result.busy && !result.data && <Loading/>}{result.data && <LimitForm key={id + ':' + revision} id={id} original={result.data} reload={() => setRevision(previous => previous + 1)}/>}</>;
}

import { Activity, ArrowLeft, ArrowRight, BellRing, ChevronRight, Clock3, Cpu, FlaskConical, LayoutGrid, List, MapPin, Radio, RefreshCw, Search, Server, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Empty, Failure, Heading, Loading, Status, dateTime, fmt, metricDigits, metricIcons, shortTime } from '../components/ui';
import { freshness, metricKeys, metrics, reading } from '../contracts';
import type { Device, Metric, Role } from '../contracts';
import { scenarios } from '../mocks/server';
import type { Scenario } from '../mocks/server';
import { api, useMocks } from '../services/api';
import { useClock, useResource } from '../services/useResource';

export function Demo({ scenario, change }: { scenario: Scenario; change: (value: Scenario) => void }) {
  return <section className="demo-panel"><div className="demo-copy"><div className="demo-icon"><FlaskConical size={20}/></div><div><strong>Modo Demonstração</strong><p>Explore os cenários com dados simulados.</p></div></div><label className="demo-select"><span>Cenário</span><select value={scenario} onChange={event => change(event.target.value as Scenario)}>{Object.entries(scenarios).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></section>;
}
function MetricValue({ device, metric }: { device: Device; metric: Metric }) {
  const value = reading(device.latest, metric);
  return value === null ? <span className="unavailable">Indisponível</span> : <>{fmt(value, metricDigits(metric))} <small>{metrics[metric].unit}</small></>;
}
function RackCard({ device }: { device: Device }) {
  const { id, name, location, latest } = device;
  return <article className="rack-card">
    <div className="rack-top"><div className="rack-symbol"><Server size={20}/></div><Status value={device.freshness}/></div>
    <h3><Link to={'/devices/' + encodeURIComponent(id)}>{name}</Link></h3>
    <div className="rack-location"><MapPin size={14}/>{location}</div>
    <div className="rack-metrics">{metricKeys.map(metric => {
      const Icon = metricIcons[metric];
      return <div key={metric}><span className={'metric-label ' + metric}><Icon size={14}/>{metric === 'current' ? 'Corrente' : metrics[metric].label}</span><strong><MetricValue device={device} metric={metric}/></strong></div>;
    })}</div>
    <div className="rack-footer"><span><Clock3 size={14}/>{latest ? shortTime(latest.sampled_at ?? latest.received_at) : 'Sem amostra'}</span>{device.active_alerts > 0 && <span className="badge red"><BellRing size={12}/>{device.active_alerts} {device.active_alerts === 1 ? 'alerta' : 'alertas'}</span>}<Link aria-label={'Ver detalhes de ' + name} to={'/devices/' + encodeURIComponent(id)}>Detalhes <ArrowRight size={14}/></Link></div>
  </article>;
}
const stats = [
  ['Dispositivos', Server, 'blue', 'Dispositivos cadastrados'],
  ['Leitura recente', Radio, 'green', 'Amostra recebida em até 15 s'],
  ['Sem telemetria recente', Clock3, 'amber', 'Amostra recebida há mais de 15 s'],
  ['Alertas abertos', BellRing, 'red', 'Ativos e reconhecidos'],
] as const;
export function Devices({ scenario, change }: { scenario: Scenario; change: (value: Scenario) => void }) {
  const result = useResource('devices', async signal => {
    const first = await api.devices(undefined, signal);
    const items = [...first.items];
    let cursor = first.next_cursor;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const page = await api.devices(cursor, signal);
      items.push(...page.items);
      cursor = page.next_cursor;
    }
    return { ...first, items };
  }, true);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const now = useClock();
  const devices = result.data?.items.map(device => ({
    ...device,
    freshness: freshness(device, Math.max(0, now - result.at), device.server_time ?? result.data?.server_time),
  })) ?? [];
  const filtered = devices.filter(device => (device.name + ' ' + device.location + ' ' + device.id).toLowerCase().includes(search.trim().toLowerCase()));
  const values = [devices.length, devices.filter(device => device.freshness === 'fresh').length, devices.filter(device => device.freshness === 'stale').length, devices.reduce((sum, device) => sum + device.active_alerts, 0)];
  return <>
    <Heading title="Visão geral" subtitle="Acompanhe a telemetria e a saúde dos racks do seu CPD."><button className="button" onClick={result.reload}><RefreshCw size={16} className={result.busy ? 'spin' : ''}/> Atualizar</button></Heading>
    {useMocks && <Demo scenario={scenario} change={change}/>}
    {result.error && <Failure error={result.error} cached={!!result.data}/>}
    {!result.error && devices.some(device => device.freshness === 'stale') && <Banner title="Dados armazenados — conexão indisponível">Os racks marcados como desatualizados exibem a última amostra registrada.</Banner>}
    <section className="stats-grid" aria-label="Resumo do CPD">{stats.map(([label, Icon, tone, detail], index) => <article className="stat" key={label}><div className="stat-head"><span>{label}</span><div className={'stat-icon ' + tone}><Icon size={18}/></div></div><strong>{result.data ? values[index] : '—'}</strong><small>{detail}</small></article>)}</section>
    <section aria-labelledby="racks-title"><div className="section-bar"><div><h2 id="racks-title">Dispositivos <span className="count">{devices.length}</span></h2><p>Selecione um rack para acessar suas leituras e seu histórico.</p></div><div className="section-actions"><label className="search"><Search size={16}/><input aria-label="Buscar dispositivo" placeholder="Buscar dispositivo…" value={search} onChange={event => setSearch(event.target.value)}/></label><div className="segments" aria-label="Modo de exibição"><button aria-label="Exibir em cartões" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={16}/></button><button aria-label="Exibir em tabela" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={17}/></button></div></div></div>
    {result.busy && !result.data ? <Loading/> : !filtered.length ? <Empty title={search ? 'Nenhum rack encontrado' : 'Nenhum dispositivo disponível'}>{search ? 'Tente outro termo de busca.' : 'Os dispositivos cadastrados aparecem aqui.'}</Empty> : view === 'cards' ? <div className="rack-grid">{filtered.map(device => <RackCard key={device.id} device={device}/>)}</div> :
    <div className="table-wrap"><table><thead><tr><th>Dispositivo</th><th>Localização</th><th>Status</th>{metricKeys.map(metric => <th key={metric}>{metrics[metric].label}</th>)}<th>Última amostra</th><th>Alertas abertos</th></tr></thead><tbody>{filtered.map(device => <tr key={device.id}><td><Link to={'/devices/' + encodeURIComponent(device.id)}>{device.name}</Link></td><td>{device.location}</td><td><Status value={device.freshness}/></td>{metricKeys.map(metric => <td key={metric}><MetricValue device={device} metric={metric}/></td>)}<td>{dateTime(device.latest?.sampled_at ?? device.latest?.received_at)}</td><td>{device.active_alerts}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
export function DeviceDetails({ role }: { role: Role }) {
  const { id = '' } = useParams();
  const url = '/devices/' + encodeURIComponent(id);
  const result = useResource('device:' + id, signal => api.device(id, signal), true);
  const now = useClock();
  const device = result.data;
  const status = device ? freshness(device, Math.max(0, now - result.at)) : 'unknown';
  return <>
    <Link className="back" to="/devices"><ArrowLeft size={16}/> Visão geral</Link>
    <Heading title={device?.name ?? 'Dispositivo'} subtitle={device?.location ?? id}><button className="button" onClick={result.reload}><RefreshCw size={16}/> Atualizar</button></Heading>
    {result.error && <Failure error={result.error} cached={!!device}/>}
    {result.busy && !device && <Loading/>}
    {device && <>
      {!result.error && status === 'stale' && <Banner title="Dados armazenados — conexão indisponível">Última amostra registrada em {dateTime(device.latest?.sampled_at ?? device.latest?.received_at)}.</Banner>}
      {status === 'unknown' && <Banner title="Aguardando primeira leitura" tone="blue"/>}
      <div className="device-meta"><div><Radio size={19}/><span>Status</span><Status value={status}/></div><div><Clock3 size={19}/><span>Última amostra</span><strong>{dateTime(device.latest?.sampled_at ?? device.latest?.received_at)}</strong></div><div><Cpu size={19}/><span>Firmware</span><strong>{device.firmware_version || '—'}</strong></div></div>
      <div className="detail-grid">{metricKeys.map(metric => {
        const Icon = metricIcons[metric], value = reading(device.latest, metric);
        const quality = device.latest?.quality[metric];
        return <article className="stat detail-metric" key={metric}><div className="stat-head"><span>{metrics[metric].label}</span><div className={'stat-icon ' + (metric === 'temperature' ? 'amber' : metric === 'humidity' ? 'blue' : 'green')}><Icon size={20}/></div></div><strong><MetricValue device={device} metric={metric}/></strong><span className={'badge ' + (quality === 'invalid' ? 'red' : value === null ? 'slate' : 'green')}><Activity size={13}/>{quality === 'invalid' ? 'Sensor inválido' : value === null ? 'Sem leitura válida' : 'Sensor OK'}</span></article>;
      })}</div>
      <div className="device-links"><Link className="button primary" to={url + '/history'}><Activity size={17}/> Histórico <ChevronRight size={16}/></Link><Link className="button" to={'/alerts?device_id=' + encodeURIComponent(id)}><BellRing size={17}/> Alertas ({device.active_alerts})</Link>{role === 'admin' && <Link className="button" to={url + '/limits'}><ShieldAlert size={17}/> Configurar limites</Link>}</div>
    </>}
  </>;
}

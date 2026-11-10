import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Empty, Failure, Heading, Loading, dateTime, fmt, metricDigits } from '../components/ui';
import { metricKeys, metrics } from '../contracts';
import type { Metric, ReadingPoint } from '../contracts';
import { api } from '../services/api';
import { useResource } from '../services/useResource';

const ranges = [
  { label: '1 h', bucket: 'raw', duration: 3600000, step: 5000 },
  { label: '24 h', bucket: '1m', duration: 86400000, step: 60000 },
  { label: '7 dias', bucket: '15m', duration: 604800000, step: 900000 },
] as const;
type ChartRow = { time: number; avg: number | null; band: [number, number] | null };
export function chartRows(points: ReadingPoint[], metric: Metric, step: number): ChartRow[] {
  const rows: ChartRow[] = [];
  for (const point of points) {
    const time = Date.parse(point.timestamp), previous = rows.at(-1);
    if (previous && time - previous.time > step * 1.5) rows.push({ time: previous.time + step, avg: null, band: null });
    const value = point[metric];
    rows.push({ time, avg: value?.avg ?? null, band: value ? [value.min, value.max] : null });
  }
  return rows;
}
export function History() {
  const { id = '' } = useParams();
  const [period, setPeriod] = useState(0), [metric, setMetric] = useState<Metric>('temperature');
  const [to, setTo] = useState(Date.now), [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const range = ranges[period], cursor = cursors.at(-1);
  const from = to - range.duration;
  const result = useResource(`history:${id}:${period}:${to}:${cursor}`, signal => api.readings(id, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), bucket: range.bucket, cursor }, signal));
  const device = useResource('history-device:' + id, signal => api.device(id, signal));
  const points = result.data?.points ?? [], rows = chartRows(points, metric, range.step);
  const valid = points.flatMap(point => point[metric] ? [point[metric]] : []);
  const label = metrics[metric], digits = metricDigits(metric);
  const sampleCount = valid.reduce((sum, point) => sum + point.count, 0);
  const stats = sampleCount > 0 ? [Math.min(...valid.map(point => point.min)), valid.reduce((sum, point) => sum + point.avg * point.count, 0) / sampleCount, Math.max(...valid.map(point => point.max))] : null;
  const fullDomain = [cursor ? rows[0]?.time ?? from : from, result.data?.next_cursor ? rows.at(-1)?.time ?? to : to];
  const tick = (time: number) => new Intl.DateTimeFormat('pt-BR', period === 2 ? { day: '2-digit', month: '2-digit', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(time);
  return <>
    <Link className="back" to={'/devices/' + encodeURIComponent(id)}><ArrowLeft size={16}/> Voltar ao dispositivo</Link>
    <Heading title="Histórico de telemetria" subtitle={device.data?.name ?? id}><button className="button" onClick={() => { setTo(Date.now()); setCursors([undefined]); }}><RefreshCw size={16}/> Atualizar período</button></Heading>
    <div className="filter-panel"><div className="segments text-segments" aria-label="Período">{ranges.map((item, index) => <button key={item.bucket} aria-pressed={period === index} onClick={() => { setPeriod(index); setCursors([undefined]); }}>{item.label}</button>)}</div><label>Métrica <select value={metric} onChange={event => setMetric(event.target.value as Metric)}>{metricKeys.map(key => <option key={key} value={key}>{metrics[key].label}</option>)}</select></label></div>
    {result.error && <Failure error={result.error} cached={!!result.data}/>}
    {result.busy && !result.data ? <Loading/> : !stats ? <Empty title="Sem leituras no período">A métrica selecionada não possui amostras válidas nesta página.</Empty> :
    <section className="chart-panel" aria-labelledby="chart-title"><div className="section-bar"><div><h2 id="chart-title">{label.label} ({label.unit})</h2><p>{range.bucket === 'raw' ? 'Amostras individuais' : 'Agregação por ' + (range.bucket === '1m' ? '1 minuto' : '15 minutos')}</p></div><div className="chart-legend"><span><i/> Média</span><span><i/> Faixa mín.–máx.</span></div></div>
      <div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 12, right: 22, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#e4eaf2" vertical={false}/>
        <XAxis type="number" dataKey="time" domain={fullDomain} tickFormatter={tick} tick={{ fill: '#52647b', fontSize: 11 }} minTickGap={36}/>
        <YAxis width={52} domain={['auto', 'auto']} tickFormatter={value => fmt(value, digits)} tick={{ fill: '#52647b', fontSize: 11 }}/>
        <Tooltip labelFormatter={value => dateTime(new Date(Number(value)).toISOString())} formatter={value => Array.isArray(value) ? value.map(item => fmt(Number(item), digits)).join(' a ') + ' ' + label.unit : fmt(Number(value), digits) + ' ' + label.unit}/>
        <Area type="linear" dataKey="band" name="Faixa mín.–máx." fill="#abc8ff" fillOpacity={0.6} stroke="none" connectNulls={false} isAnimationActive={false}/>
        <Line type="linear" dataKey="avg" name="Média" stroke="#215ad4" strokeWidth={2} dot={rows.length < 6} connectNulls={false} isAnimationActive={false}/>
      </ComposedChart></ResponsiveContainer></div>
      <p className="chart-note"><Clock3 size={15}/> As interrupções na linha indicam intervalos sem dados válidos. O gráfico não interpola essas lacunas.</p>
      <dl className="history-summary" aria-label="Resumo numérico da página">{['Mínima', 'Média ponderada', 'Máxima'].map((item, index) => <div key={item}><dt>{item}</dt><dd>{fmt(stats[index], digits)} {label.unit}</dd></div>)}<div><dt>Amostras válidas</dt><dd>{sampleCount.toLocaleString('pt-BR')}</dd></div></dl>
    </section>}
    <div className="pagination"><span>Página {cursors.length} · {points.length} pontos</span><button className="button" disabled={cursors.length === 1} onClick={() => setCursors(previous => previous.slice(0, -1))}><ChevronLeft size={17}/> Anterior</button><button className="button" disabled={!result.data?.next_cursor || result.busy} onClick={() => { const next = result.data?.next_cursor; if (next) setCursors(previous => [...previous, next]); }}>Próxima <ChevronRight size={17}/></button></div>
  </>;
}

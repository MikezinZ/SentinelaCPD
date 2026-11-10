import { Activity, AlertCircle, AlertTriangle, CheckCircle2, CircleMinus, Clock3, HelpCircle, LoaderCircle, Server, Thermometer, Droplets, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Freshness, Metric } from '../contracts';
import { ApiError } from '../contracts';

export const fmt = (value: number, digits = 1) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const dateTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';
export const shortTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(value)) : '—';
export const metricIcons = { temperature: Thermometer, humidity: Droplets, current: Zap };
export const metricDigits = (metric: Metric) => metric === 'current' ? 2 : 1;
const statuses = {
  fresh: ['Recente', CheckCircle2, 'green'], stale: ['Desatualizado', Clock3, 'amber'],
  unknown: ['Sem leitura', HelpCircle, 'slate'], inactive: ['Inativo', CircleMinus, 'slate'],
} as const;
export function Status({ value }: { value: Freshness }) {
  const [label, Icon, tone] = statuses[value];
  return <span className={'badge ' + tone}><Icon size={13} aria-hidden="true"/>{label}</span>;
}
export function Brand({ small = false }: { small?: boolean }) {
  return <div className={'brand ' + (small ? 'brand-small' : '')}><span className="brand-icon"><Activity size={24} strokeWidth={2.4}/></span><span>Sentinela<span>CPD</span><small>MONITORAMENTO DE CPD</small></span></div>;
}
export function Banner({ children, tone = 'amber', title }: { children?: ReactNode; tone?: 'amber' | 'red' | 'green' | 'blue'; title: string }) {
  const Icon = tone === 'green' ? CheckCircle2 : tone === 'red' ? AlertCircle : tone === 'blue' ? HelpCircle : AlertTriangle;
  return <div role={tone === 'green' ? 'status' : 'alert'} className={'banner ' + tone}><Icon size={19}/><div><strong>{title}</strong>{children && <div>{children}</div>}</div></div>;
}
export function Failure({ error, cached = false }: { error: Error; cached?: boolean }) {
  return <Banner title={cached ? 'Dados armazenados — conexão indisponível' : error.message} tone={cached ? 'amber' : 'red'}>
    {cached && error.message}{error instanceof ApiError && <span> HTTP {error.status}{error.requestId ? ' · Solicitação ' + error.requestId : ''}</span>}
  </Banner>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span><Server size={23}/></span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function Loading() {
  return <div className="empty" role="status"><LoaderCircle className="spin" size={23}/>Carregando dados…</div>;
}
export function Heading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-actions">{children}</div>}</div>;
}

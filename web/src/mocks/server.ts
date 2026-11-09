import { ApiError, freshness, metricKeys, stateOf, validateLimits } from '../contracts';
import type { Alert, Bucket, Device, Limits, ReadingPoint, Role, Sample, Session, User } from '../contracts';

export const scenarios = {
  normal: 'CPD operacional', critical: 'Temperatura crítica', stale: 'Telemetria antiga',
  invalid: 'Falha no DHT22', unknown: 'Dispositivo sem leitura', network: 'Falha de rede · HTTP 503',
  conflict: 'Conflito de versão · HTTP 409', empty: 'Sem dispositivos',
  emptyHistory: 'Histórico vazio', expired: 'Sessão expirada',
} as const;
export type Scenario = keyof typeof scenarios;
export const roles: Role[] = ['admin', 'operator', 'viewer'];
const users: Record<Role, User> = {
  admin: { id: 'demo-admin', name: 'Admin CPD', role: 'admin' },
  operator: { id: 'demo-operator', name: 'Operador CPD', role: 'operator' },
  viewer: { id: 'demo-viewer', name: 'Visitante CPD', role: 'viewer' },
};
export const demoPassword = 'Sentinela123';
export const demoEmail = (role: Role) => `${role}@sentinelacpd.demo`;
const baseLimits: Limits = {
  version: 3, temperature_min: 18, temperature_max: 27, humidity_min: 40, humidity_max: 60,
  current_max: 12, consecutive_samples: 3, temperature_hysteresis: 1, humidity_hysteresis: 3, current_hysteresis: 0.5,
};
const racks = [
  ['cpd-01', 'Rack principal', 'Sala CPD · Setor A', 24.3, 48.6, 4.82],
  ['cpd-02', 'Rack de rede', 'Sala CPD · Setor B', 23.8, 51.2, 2.65],
  ['cpd-03', 'Rack de armazenamento', 'Sala CPD · Setor C', 25.1, 46.8, 6.14],
  ['cpd-04', 'Rack de contingência', 'Sala técnica · Setor D', 22.6, 50.4, 0.08],
] as const;
const iso = (time: number) => new Date(time).toISOString();
const bucketMs: Record<Bucket, number> = { raw: 5000, '1m': 60_000, '15m': 900_000 };
let scenario: Scenario = 'normal', changedAt = Date.now(), conflictPending = false;
const activeTokens = new Map<string, { user: User; expires: number }>();
const refreshTokens = new Map<string, { user: User; access: string; expires: number }>();
const limits = new Map<string, Limits>();
const acknowledgments = new Map<string, Pick<Alert, 'acknowledged_at' | 'acknowledged_by' | 'note'>>();
export function setScenario(value: Scenario) {
  scenario = value;
  changedAt = Date.now();
  conflictPending = value === 'conflict';
  if (value === 'expired') {
    activeTokens.clear();
    refreshTokens.clear();
  }
}
function newSession(user: User): Session {
  const access_token = crypto.randomUUID(), refresh_token = crypto.randomUUID();
  activeTokens.set(access_token, { user, expires: Date.now() + 900_000 });
  refreshTokens.set(refresh_token, { user, access: access_token, expires: Date.now() + 604_800_000 });
  return { access_token, refresh_token, expires_in: 900, user };
}
function alerts(): Alert[] {
  const fixture = (id: string, type: Alert['type'], severity: Alert['severity'], message: string, device_id = 'cpd-01'): Alert => ({
    id, device_id, type, severity, message, rule_version: 3, opened_at: iso(changedAt - 180_000),
    acknowledged_at: null, acknowledged_by: null, resolved_at: null, ...acknowledgments.get(id),
  });
  const resolved = { ...fixture('demo-resolved', 'humidity_low', 'warning', 'Umidade retornou à faixa operacional.', 'cpd-03'), resolved_at: iso(changedAt - 60_000) };
  const acknowledged = { ...fixture('demo-ack', 'current_high', 'warning', 'Corrente RMS acima do limite no rack de rede.', 'cpd-02'), acknowledged_at: iso(changedAt - 120_000), acknowledged_by: 'Operador CPD' };
  switch (scenario) {
    case 'critical': return [fixture('demo-critical', 'temperature_high', 'critical', 'Temperatura acima do limite de 27 °C.'), acknowledged, resolved];
    case 'stale': return [fixture('demo-stale', 'telemetry_stale', 'warning', 'Rack principal sem telemetria recente.'), resolved];
    case 'invalid': return [fixture('demo-invalid', 'sensor_invalid', 'warning', 'Sensor DHT22 retornou dados inválidos.'), resolved];
    case 'empty': return [];
    default: return [resolved];
  }
}
function devices(): Device[] {
  if (scenario === 'empty') return [];
  const now = Date.now();
  return racks.map(([id, name, location, temperature, humidity, current], index) => {
    const primary = index === 0;
    const received = primary && scenario === 'stale' ? changedAt - 92_000 : Math.floor(now / 5000) * 5000;
    const invalid = primary && scenario === 'invalid';
    const latest: Sample | null = primary && scenario === 'unknown' ? null : {
      sampled_at: iso(received - 320), received_at: iso(received),
      temperature_c: invalid ? null : primary && scenario === 'critical' ? 30.8 : temperature,
      humidity_pct: invalid ? null : humidity, current_rms_a: current,
      quality: { temperature: invalid ? 'invalid' : 'ok', humidity: invalid ? 'invalid' : 'ok', current: 'ok' },
    };
    const device: Device = {
      id, name, location, enabled: true, firmware_version: '0.2.0', server_time: iso(now),
      stale_after_seconds: 15, latest, freshness: 'fresh',
      active_alerts: alerts().filter(alert => alert.device_id === id && stateOf(alert) !== 'resolved').length,
    };
    return { ...device, freshness: freshness(device) };
  });
}
function page<T>(items: T[], cursor: string | null, limit: number) {
  const offset = cursor ? Number(atob(cursor).replace(/^page:/, '')) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new ApiError(400, 'Cursor inválido.');
  return { items: items.slice(offset, offset + limit), next_cursor: offset + limit < items.length ? btoa(`page:${offset + limit}`) : null };
}
function history(device: Device, query: URLSearchParams) {
  const from = Date.parse(query.get('from') ?? ''), to = Date.parse(query.get('to') ?? '');
  const bucket = query.get('bucket') as Bucket, step = bucketMs[bucket];
  const max = { raw: 3_600_000, '1m': 86_400_000, '15m': 604_800_000 }[bucket];
  if (!step || !Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > max) throw new ApiError(400, 'Período inválido.');
  const points: ReadingPoint[] = [];
  const rack = racks.find(row => row[0] === device.id)!;
  if (device.latest && scenario !== 'emptyHistory') {
    for (let t = Math.ceil(from / step) * step, index = 0; t < to; t += step, index++) {
      if (t > Date.parse(device.latest.received_at) || (index >= Math.floor((to - from) / step * 0.54) && index < Math.floor((to - from) / step * 0.62))) continue;
      const point: ReadingPoint = { timestamp: iso(t), temperature: null, humidity: null, current: null };
      metricKeys.forEach((metric, n) => {
        if (device.latest?.quality[metric] === 'invalid' && index > 0.8 * (to - from) / step) return;
        const base = rack[n + 3] as number;
        const peak = device.id === 'cpd-01' && scenario === 'critical' && metric === 'temperature' && t > to - (to - from) * 0.1 ? 6 : 0;
        const avg = Math.max(0, base + Math.sin(index * 0.035) * (n === 2 ? 0.06 : 1.1) + Math.cos(index * 0.19) * (n === 2 ? 0.015 : 0.32) + peak);
        const spread = bucket === 'raw' ? 0 : n === 2 ? 0.04 : 0.5 + Math.abs(Math.sin(index)) * 0.5;
        point[metric] = { avg, min: Math.max(0, avg - spread), max: avg + spread, count: step / 5000 };
      });
      points.push(point);
    }
  }
  const result = page(points, query.get('cursor'), 500);
  return { points: result.items, next_cursor: result.next_cursor };
}
type MockRequest = { path: string; method: string; body?: unknown; token: string | null; signal: AbortSignal };
export async function mockRequest({ path, method, body, token, signal }: MockRequest): Promise<unknown> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 120);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  const url = new URL(path, 'https://mock.invalid');
  const route = url.pathname;
  if (route === '/auth/login' && method === 'POST') {
    const { email, password } = body as { email: string; password: string };
    const role = roles.find(item => demoEmail(item) === email.trim().toLowerCase());
    if (!role || password !== demoPassword) throw new ApiError(401, 'E-mail ou senha inválidos.');
    if (scenario === 'expired') setScenario('normal');
    return newSession(users[role]);
  }
  if (route === '/auth/refresh' || route === '/auth/logout') {
    const refresh = (body as { refresh_token?: string }).refresh_token ?? '';
    const session = refreshTokens.get(refresh);
    refreshTokens.delete(refresh);
    if (session) activeTokens.delete(session.access);
    if (route.endsWith('logout')) return;
    if (!session || session.expires <= Date.now()) throw new ApiError(401, 'Sessão expirada.');
    return newSession(session.user);
  }
  const session = activeTokens.get(token ?? '');
  if (!session || session.expires <= Date.now()) throw new ApiError(401, 'Sessão expirada.');
  const { user } = session;
  if (route === '/me') return user;
  if (scenario === 'network') throw new ApiError(503, 'Serviço indisponível no momento.');
  const query = url.searchParams;
  if (route === '/devices') return { ...page(devices(), query.get('cursor'), 50), server_time: iso(Date.now()) };
  if (route === '/alerts') {
    return page(alerts().filter(alert => (!query.has('state') || stateOf(alert) === query.get('state'))
      && (!query.has('device_id') || alert.device_id === query.get('device_id'))), query.get('cursor'), 50);
  }
  const ack = route.match(/^\/alerts\/([^/]+)\/ack$/);
  if (ack && method === 'POST') {
    if (user.role === 'viewer') throw new ApiError(403, 'Perfil sem permissão para reconhecer alertas.');
    const alert = alerts().find(item => item.id === decodeURIComponent(ack[1]));
    if (!alert) throw new ApiError(404, 'Alerta não encontrado.');
    if (alert.acknowledged_at) return alert;
    if (stateOf(alert) === 'resolved') throw new ApiError(409, 'O alerta já foi resolvido.');
    const { note } = body as { note?: string };
    if (note && note.length > 500) throw new ApiError(422, 'A nota pode ter até 500 caracteres.');
    const audit = { acknowledged_at: iso(Date.now()), acknowledged_by: user.name, note };
    acknowledgments.set(alert.id, audit);
    return { ...alert, ...audit };
  }
  const [, deviceId, feature] = route.match(/^\/devices\/([^/]+)(?:\/(readings|limits))?$/) ?? [];
  const device = devices().find(item => item.id === decodeURIComponent(deviceId ?? ''));
  if (!device) throw new ApiError(404, 'Dispositivo não encontrado.');
  if (!feature) return device;
  if (feature === 'readings') return history(device, query);
  if (user.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem acessar os limites.');
  const current = limits.get(device.id) ?? baseLimits;
  if (method === 'GET') return current;
  const input = body as Limits;
  if (conflictPending) {
    conflictPending = false;
    limits.set(device.id, { ...current, version: current.version + 1 });
    throw new ApiError(409, 'Os limites foram alterados por outra sessão.');
  }
  if (input.version !== current.version) throw new ApiError(409, 'Os limites foram alterados por outra sessão.');
  const fields = validateLimits(input);
  if (Object.keys(fields).length) throw new ApiError(422, 'Revise os campos.', fields);
  const updated = { ...input, version: current.version + 1 };
  limits.set(device.id, updated);
  return updated;
}

import {
  ApiError,
  freshness,
  metricKeys,
  stateOf,
  validateLimits,
} from '../types/index.ts';
import type {
  Alert,
  Bucket,
  Device,
  Limits,
  ReadingPoint,
  Role,
  Sample,
  Session,
  User,
} from '../types/index.ts';

export const scenarios = {
  power: 'Queda de energia (em bateria)',
  normal: '1. CPD Operacional Normal (fresh)',
  critical: '2. Alerta Ativo de Temperatura Crítica (> 27 °C)',
  stale: '3. Telemetria Antiga (stale > 15s)',
  invalid: '4. Falha de Sensor (DHT22 invalid, Corrente ok)',
  unknown: '5. Dispositivo Novo sem leitura (unknown)',
  network: '6. Falha de Rede · HTTP 503 simulado',
  conflict: '7. Conflito de Versão nos Limites · HTTP 409',
  empty: 'Extra: Sem dispositivos cadastrados',
  emptyHistory: 'Extra: Histórico vazio no período',
  expired: 'Extra: Sessão expirada (forçar refresh/logout)',
} as const;

export type Scenario = keyof typeof scenarios;

export const scenarioDescriptions: Record<Scenario, string> = {
  power: 'POWER_LOSS recebido; dispositivo em bateria e histórico de queda anterior.',
  normal: 'Todos os sensores operando normalmente (quality: ok) e pacotes recentes (<= 15s).',
  critical: 'Rack Principal com temperatura em 30,8 °C (> 27 °C) e alerta crítico ativo.',
  stale: 'Rack Principal sem receber pacotes há mais de 15s. Exibe banner de dados armazenados.',
  invalid: 'Falha física no DHT22 (temp/umidade null e invalid), mantendo Corrente RMS válida.',
  unknown: 'Dispositivo recém-cadastrado aguardando primeira leitura (latest: null).',
  network: 'Simula indisponibilidade do backend retornando erro HTTP 503 em todas as rotas.',
  conflict: 'Simula concorrência otimista (HTTP 409) ao salvar limites operacionais.',
  empty: 'Lista de dispositivos vazia para validação de empty state.',
  emptyHistory: 'Retorna série temporal sem pontos para o período selecionado.',
  expired: 'Invalida tokens ativos para testar expurgo do SecureStore e redirecionamento.',
};

export const roles: Role[] = ['admin', 'operator', 'viewer'];

const users: Record<Role, User> = {
  admin: { id: 'demo-admin', name: 'Admin CPD', role: 'admin' },
  operator: { id: 'demo-operator', name: 'Operador CPD', role: 'operator' },
  viewer: { id: 'demo-viewer', name: 'Visitante CPD', role: 'viewer' },
};

export const demoPassword = 'Sentinela123';
export const demoEmail = (role: Role) => `${role}@sentinelacpd.demo`;

const baseLimits: Limits = {
  version: 3,
  temperature_min: 18,
  temperature_max: 27,
  humidity_min: 40,
  humidity_max: 60,
  current_max: 12,
  consecutive_samples: 3,
  temperature_hysteresis: 1,
  humidity_hysteresis: 3,
  current_hysteresis: 0.5,
};

const racks = [
  ['cpd-01', 'Rack Principal', 'Sala CPD · Setor A', 24.3, 48.6, 4.82, true],
  ['cpd-02', 'Rack de Rede', 'Sala CPD · Setor B', 23.8, 51.2, 2.65, true],
  ['cpd-03', 'Rack de Armazenamento', 'Sala CPD · Setor C', 25.1, 46.8, 6.14, true],
  ['cpd-04', 'Rack de Contingência', 'Sala Técnica · Setor D', 22.6, 50.4, 0.08, true],
] as const;

const iso = (time: number) => new Date(time).toISOString();
const bucketMs: Record<Bucket, number> = { raw: 5000, '1m': 60_000, '15m': 900_000 };

let currentScenario: Scenario = 'normal';
let changedAt = Date.now();
let conflictPending = false;

const activeTokens = new Map<string, { user: User; expires: number }>();
const refreshTokens = new Map<string, { user: User; access: string; expires: number }>();
const limitsStore = new Map<string, Limits>();
const acknowledgments = new Map<
  string,
  Pick<Alert, 'acknowledged_at' | 'acknowledged_by' | 'note'>
>();

type Listener = (scenario: Scenario) => void;
const listeners = new Set<Listener>();

export function getScenario(): Scenario {
  return currentScenario;
}

export function subscribeScenario(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setScenario(value: Scenario) {
  currentScenario = value;
  changedAt = Date.now();
  conflictPending = value === 'conflict';
  if (value === 'expired') {
    activeTokens.clear();
    refreshTokens.clear();
  }
  listeners.forEach((listener) => listener(value));
}

function generateId(): string {
  return (
    'tok_' +
    Math.random().toString(36).substring(2, 11) +
    '_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).substring(2, 9)
  );
}

function encodeCursor(offset: number): string {
  return `cursor_${offset}`;
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  if (cursor.startsWith('cursor_')) {
    const parsed = Number(cursor.replace(/^cursor_/, ''));
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
  }
  try {
    if (typeof atob === 'function') {
      const decoded = atob(cursor);
      const parsed = Number(decoded.replace(/^page:/, ''));
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
    }
  } catch {
    // ignore
  }
  return -1;
}

function newSession(user: User): Session {
  const access_token = generateId();
  const refresh_token = generateId();
  activeTokens.set(access_token, { user, expires: Date.now() + 900_000 });
  refreshTokens.set(refresh_token, {
    user,
    access: access_token,
    expires: Date.now() + 604_800_000,
  });
  return { access_token, refresh_token, expires_in: 900, user };
}

function buildAlerts(): Alert[] {
  const fixture = (
    id: string,
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    device_id = 'cpd-01'
  ): Alert => ({
    id,
    device_id,
    type,
    severity,
    message,
    rule_version: 3,
    opened_at: iso(changedAt - 180_000),
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    ...acknowledgments.get(id),
  });

  const resolved: Alert = {
    ...fixture(
      'demo-resolved',
      'humidity_low',
      'warning',
      'Umidade retornou à faixa operacional (46,8 % UR).',
      'cpd-03'
    ),
    resolved_at: iso(changedAt - 60_000),
  };

  const acknowledged: Alert = {
    ...fixture(
      'demo-ack',
      'current_high',
      'warning',
      'Corrente RMS acima do limite no Rack de Rede.',
      'cpd-02'
    ),
    acknowledged_at: iso(changedAt - 120_000),
    acknowledged_by: 'Operador CPD',
    note: 'Carga redistribuída entre circuitos A e B.',
    ...acknowledgments.get('demo-ack'),
  };

  switch (currentScenario) {
    case 'power': return [fixture('demo-power', 'power_loss', 'critical', 'POWER_LOSS / LAST_GASP recebido do dispositivo.'), fixture('demo-battery', 'battery_low', 'warning', 'Bateria baixa (18%).'), resolved];
    case 'critical':
      return [
        fixture(
          'demo-critical',
          'temperature_high',
          'critical',
          'Temperatura atingiu 30,8 °C (acima do limite máximo de 27,0 °C).',
          'cpd-01'
        ),
        fixture(
          'demo-humidity-high',
          'humidity_high',
          'warning',
          'Umidade relativa próxima ao limite superior no Setor B.',
          'cpd-02'
        ),
        acknowledged,
        resolved,
      ];
    case 'stale':
      return [
        fixture(
          'demo-stale',
          'telemetry_stale',
          'warning',
          'Rack Principal sem telemetria recente há mais de 15 segundos.',
          'cpd-01'
        ),
        acknowledged,
        resolved,
      ];
    case 'invalid':
      return [
        fixture(
          'demo-invalid',
          'sensor_invalid',
          'warning',
          'Sensor DHT22 (GPIO 27) retornou leitura inválida / timeout no barramento.',
          'cpd-01'
        ),
        resolved,
      ];
    case 'empty':
      return [];
    default:
      return [acknowledged, resolved];
  }
}

function buildDevices(): Device[] {
  if (currentScenario === 'empty') return [];
  const now = Date.now();
  const currentAlerts = buildAlerts();

  return racks.map(([id, name, location, temperature, humidity, current, enabled], index) => {
    const primary = index === 0;
    const received =
      primary && currentScenario === 'stale'
        ? changedAt - 92_000
        : Math.floor(now / 5000) * 5000;
    const invalid = primary && currentScenario === 'invalid';

    const latest: Sample | null =
      primary && currentScenario === 'unknown'
        ? null
        : {
            sampled_at: iso(received - 320),
            received_at: iso(received),
            temperature_c: invalid
              ? null
              : primary && currentScenario === 'critical'
                ? 30.8
                : temperature,
            humidity_pct: invalid ? null : humidity,
            current_rms_a: current,
            quality: {
              temperature: invalid ? 'invalid' : 'ok',
              humidity: invalid ? 'invalid' : 'ok',
              current: 'ok',
            },
          };

    const device: Device = {
      id,
      name,
      location,
      enabled,
      firmware_version: '0.2.0-esp32',
      server_time: iso(now),
      power_state: primary && currentScenario === 'power' ? 'battery' : 'mains',
      battery_pct: primary && currentScenario === 'power' ? 18 : null,
      stale_after_seconds: 15,
      latest,
      freshness: 'fresh',
      active_alerts: currentAlerts.filter(
        (alert) => alert.device_id === id && stateOf(alert) !== 'resolved'
      ).length,
    };

    return { ...device, freshness: freshness(device) };
  });
}

function paginate<T>(items: T[], cursor: string | null, limit: number) {
  const offset = decodeCursor(cursor);
  if (offset < 0) throw new ApiError(400, 'Cursor de paginação inválido.');
  return {
    items: items.slice(offset, offset + limit),
    next_cursor: offset + limit < items.length ? encodeCursor(offset + limit) : null,
  };
}

function buildHistory(device: Device, query: Record<string, string | undefined>) {
  const from = Date.parse(query.from ?? '');
  const to = Date.parse(query.to ?? '');
  const bucket = (query.bucket ?? 'raw') as Bucket;
  const step = bucketMs[bucket];
  const maxSpan = { raw: 3_600_000, '1m': 86_400_000, '15m': 604_800_000 }[bucket];

  if (!step || !Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > maxSpan) {
    throw new ApiError(400, 'Período de consulta inválido.');
  }

  const points: ReadingPoint[] = [];
  const rack = racks.find((row) => row[0] === device.id) ?? racks[0];

  if (device.latest && currentScenario !== 'emptyHistory') {
    const totalSteps = Math.floor((to - from) / step);
    const gapStart = Math.floor(totalSteps * 0.54);
    const gapEnd = Math.floor(totalSteps * 0.62);

    for (let t = Math.ceil(from / step) * step, index = 0; t < to; t += step, index++) {
      if (t > Date.parse(device.latest.received_at)) continue;
      // Lacuna intencional de dados (entre 54% e 62% da janela) para provar ausência de interpolação enganosa
      if (index >= gapStart && index < gapEnd) continue;

      const point: ReadingPoint = {
        timestamp: iso(t),
        temperature: null,
        humidity: null,
        current: null,
      };

      metricKeys.forEach((metric, n) => {
        if (device.latest?.quality[metric] === 'invalid' && index > 0.8 * totalSteps) return;
        const base = rack[n + 3] as number;
        const peak =
          device.id === 'cpd-01' &&
          currentScenario === 'critical' &&
          metric === 'temperature' &&
          t > to - (to - from) * 0.15
            ? 6.2
            : 0;
        const avg = Math.max(
          0,
          base +
            Math.sin(index * 0.08) * (n === 2 ? 0.06 : 1.15) +
            Math.cos(index * 0.21) * (n === 2 ? 0.02 : 0.35) +
            peak
        );
        const spread =
          bucket === 'raw'
            ? 0
            : n === 2
              ? 0.05 + Math.abs(Math.sin(index * 0.3)) * 0.08
              : 0.6 + Math.abs(Math.sin(index * 0.25)) * 0.85;

        point[metric] = {
          avg: Number(avg.toFixed(2)),
          min: Number(Math.max(0, avg - spread).toFixed(2)),
          max: Number((avg + spread).toFixed(2)),
          count: Math.max(1, Math.round(step / 5000)),
        };
      });

      points.push(point);
    }
  }

  const result = paginate(points, query.cursor ?? null, 500);
  return { points: result.items, next_cursor: result.next_cursor };
}

function parseUrl(path: string): { pathname: string; params: Record<string, string | undefined> } {
  const [pathname, rawSearch] = path.split('?');
  const params: Record<string, string | undefined> = {};
  if (rawSearch) {
    const searchParams = new URLSearchParams(rawSearch);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }
  return { pathname, params };
}

export type MockRequestOptions = {
  path: string;
  method: string;
  body?: unknown;
  token: string | null;
  signal?: AbortSignal;
};

export async function mockRequest({
  path,
  method,
  body,
  token,
  signal,
}: MockRequestOptions): Promise<unknown> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, 90);
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener('abort', onAbort, { once: true });
    }
  });

  const { pathname: route, params: query } = parseUrl(path);

  if (route === '/auth/login' && method === 'POST') {
    const { email, password } = (body ?? {}) as { email?: string; password?: string };
    const normalized = (email ?? '').trim().toLowerCase();
    const role = roles.find((item) => demoEmail(item) === normalized);
    if (!role || password !== demoPassword) {
      throw new ApiError(401, 'E-mail ou senha inválidos.');
    }
    if (currentScenario === 'expired') {
      setScenario('normal');
    }
    return newSession(users[role]);
  }

  if (route === '/auth/refresh' || route === '/auth/logout') {
    const refresh = ((body ?? {}) as { refresh_token?: string }).refresh_token ?? '';
    const session = refreshTokens.get(refresh);
    refreshTokens.delete(refresh);
    if (session) activeTokens.delete(session.access);
    if (route.endsWith('logout')) return undefined;
    if (!session || session.expires <= Date.now()) {
      throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
    }
    return newSession(session.user);
  }

  const session = activeTokens.get(token ?? '');
  if (!session || session.expires <= Date.now()) {
    throw new ApiError(401, 'Sessão expirada.');
  }
  const { user } = session;

  if (route === '/me') return user;

  if (currentScenario === 'network') {
    throw new ApiError(503, 'Serviço de telemetria temporariamente indisponível (HTTP 503).');
  }

  if (route === '/devices') {
    return {
      ...paginate(buildDevices(), query.cursor ?? null, 50),
      server_time: iso(Date.now()),
    };
  }

  if (route === '/alerts') {
    const filtered = buildAlerts().filter(
      (alert) =>
        (!query.state || stateOf(alert) === query.state) &&
        (!query.device_id || alert.device_id === query.device_id)
    );
    return paginate(filtered, query.cursor ?? null, 50);
  }

  const ackMatch = route.match(/^\/alerts\/([^/]+)\/ack$/);
  if (ackMatch && method === 'POST') {
    if (user.role === 'viewer') {
      throw new ApiError(403, 'Perfil Visualizador não possui permissão para reconhecer alertas.');
    }
    const alertId = decodeURIComponent(ackMatch[1]);
    const alert = buildAlerts().find((item) => item.id === alertId);
    if (!alert) throw new ApiError(404, 'Alerta não encontrado.');
    if (alert.acknowledged_at) return alert;
    if (stateOf(alert) === 'resolved') {
      throw new ApiError(409, 'O alerta já foi resolvido e não pode ser reconhecido.');
    }
    const { note } = (body ?? {}) as { note?: string };
    if (note && note.length > 500) {
      throw new ApiError(422, 'A nota de auditoria pode ter no máximo 500 caracteres.');
    }
    const audit = {
      acknowledged_at: iso(Date.now()),
      acknowledged_by: user.name,
      note: note?.trim() ? note.trim() : undefined,
    };
    acknowledgments.set(alert.id, audit);
    return { ...alert, ...audit };
  }

  const deviceMatch = route.match(/^\/devices\/([^/]+)(?:\/(readings|limits|incidents))?$/);
  if (deviceMatch) {
    const [, rawId, subResource] = deviceMatch;
    const deviceId = decodeURIComponent(rawId);
    const device = buildDevices().find((item) => item.id === deviceId);
    if (!device) throw new ApiError(404, 'Dispositivo não encontrado.');

    if (!subResource) return device;
    if (subResource === 'incidents' && method === 'GET') {
      const items = currentScenario === 'power' && device.id === 'cpd-01' ? [
        { id: 'power-open', type: 'power_loss', status: 'open', started_at: iso(changedAt - 180_000), ended_at: null, duration_s: null },
        { id: 'power-closed', type: 'power_loss', status: 'closed', started_at: iso(changedAt - 86400_000), ended_at: iso(changedAt - 85800_000), duration_s: 600 },
      ] : [];
      return paginate(items, query.cursor ?? null, 50);
    }
    if (subResource === 'readings') return buildHistory(device, query);

    if (user.role !== 'admin') {
      throw new ApiError(403, 'Apenas administradores podem parametrizar limites operacionais.');
    }
    const current = limitsStore.get(device.id) ?? baseLimits;
    if (method === 'GET') return current;

    const input = body as Limits;
    if (conflictPending) {
      conflictPending = false;
      limitsStore.set(device.id, { ...current, version: current.version + 1 });
      throw new ApiError(
        409,
        'Conflito de versão (HTTP 409): Os limites deste nó foram modificados por outro administrador.'
      );
    }
    if (input.version !== current.version) {
      throw new ApiError(
        409,
        'Conflito de versão (HTTP 409): Os limites deste nó foram modificados por outro administrador.'
      );
    }
    const fields = validateLimits(input);
    if (Object.keys(fields).length > 0) {
      throw new ApiError(422, 'Revise os campos inválidos.', fields);
    }
    const updated: Limits = { ...input, version: current.version + 1 };
    limitsStore.set(device.id, updated);
    return updated;
  }

  throw new ApiError(404, `Rota não encontrada: ${route}`);
}

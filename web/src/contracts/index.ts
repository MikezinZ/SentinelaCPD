export type Role = 'viewer' | 'operator' | 'admin';
export type User = { id: string; name: string; role: Role };
export type Session = { access_token: string; refresh_token?: string; expires_in: number; user: User };
export type Freshness = 'fresh' | 'stale' | 'unknown' | 'inactive';
export type Metric = 'temperature' | 'humidity' | 'current';
export type Quality = 'ok' | 'invalid';
export type Sample = {
  sampled_at: string | null; received_at: string;
  temperature_c: number | null; humidity_pct: number | null; current_rms_a: number | null;
  quality: Record<Metric, Quality>;
};
export type Device = {
  id: string; name: string; location: string; enabled: boolean; firmware_version: string;
  freshness: Freshness; stale_after_seconds?: number; server_time?: string; latest: Sample | null;
  power_state: 'mains' | 'battery' | 'unknown';
  battery_pct: number | null;
  active_alerts: number;
};
export type DevicePage = { items: Device[]; next_cursor?: string | null; server_time: string };
export type AlertState = 'active' | 'acknowledged' | 'resolved';
export type Severity = 'warning' | 'critical';
export type AlertType = 'temperature_high' | 'temperature_low' | 'humidity_high' | 'humidity_low' | 'current_high' | 'telemetry_stale' | 'sensor_invalid' | 'power_loss' | 'battery_low';
export type Alert = {
  id: string; device_id: string; type: AlertType; severity: Severity; state?: AlertState;
  opened_at: string; acknowledged_at: string | null; acknowledged_by: string | null;
  resolved_at: string | null; message: string; rule_version: number; note?: string;
};
export type AlertPage = { items: Alert[]; next_cursor?: string | null };
export type Bucket = 'raw' | '1m' | '15m';
export type Stats = { min: number; max: number; avg: number; count: number };
export type ReadingPoint = { timestamp: string } & Record<Metric, Stats | null>;
export type ReadingPage = { points: ReadingPoint[]; next_cursor?: string | null };
export type ReadingQuery = { from: string; to: string; bucket: Bucket; cursor?: string };
export type Limits = {
  version: number; temperature_min: number | null; temperature_max: number | null;
  humidity_min: number | null; humidity_max: number | null; current_max: number | null;
  temperature_hysteresis: number | null; humidity_hysteresis: number | null;
  current_hysteresis: number | null; consecutive_samples: number;
};
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public requestId?: string) { super(message); }
}
export const stateOf = (alert: Alert): AlertState =>
  alert.resolved_at ? 'resolved' : alert.acknowledged_at ? 'acknowledged' : alert.state ?? 'active';
export const metrics = {
  temperature: { label: 'Temperatura', unit: '°C', field: 'temperature_c' },
  humidity: { label: 'Umidade', unit: '% UR', field: 'humidity_pct' },
  current: { label: 'Corrente RMS', unit: 'A', field: 'current_rms_a' },
} as const;
export const metricKeys = Object.keys(metrics) as Metric[];
export function reading(sample: Sample | null, metric: Metric): number | null {
  const value = sample?.[metrics[metric].field];
  return sample?.quality[metric] === 'ok' && typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function freshness(device: Device, elapsed = 0, serverTime = device.server_time): Freshness {
  if (!device.enabled) return 'inactive';
  if (!device.latest) return 'unknown';
  if (!serverTime) return device.freshness;
  const age = Date.parse(serverTime) - Date.parse(device.latest.received_at) + elapsed;
  return device.freshness === 'stale' || age > (device.stale_after_seconds ?? 15) * 1000 ? 'stale' : 'fresh';
}
export function validateLimits(value: Limits): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const sensor of ['temperature', 'humidity'] as const) {
    const min = value[`${sensor}_min`], max = value[`${sensor}_max`], h = value[`${sensor}_hysteresis`];
    if (min !== null && max !== null && min >= max) errors[`${sensor}_max`] = 'Deve ser maior que o mínimo.';
    if (h !== null && (h < 0 || (min !== null && max !== null && h >= max - min))) errors[`${sensor}_hysteresis`] = 'Informe uma histerese não negativa e menor que a faixa.';
  }
  for (const field of ['humidity_min', 'humidity_max'] as const) {
    const amount = value[field];
    if (amount !== null && (amount < 0 || amount > 100)) errors[field] = 'Informe um valor entre 0 e 100.';
  }
  if (value.current_max !== null && value.current_max < 0) errors.current_max = 'Informe um valor não negativo.';
  if ((value.current_hysteresis !== null && value.current_hysteresis < 0) || (value.current_max !== null && value.current_hysteresis === null)) errors.current_hysteresis = 'Informe uma histerese de corrente não negativa.';
  if (!Number.isInteger(value.consecutive_samples) || value.consecutive_samples < 1) errors.consecutive_samples = 'Informe um inteiro positivo.';
  for (const [field, amount] of Object.entries(value)) if (amount !== null && !Number.isFinite(amount)) errors[field] = 'Informe um número válido.';
  return errors;
}

export type EnergyIncident = {
  id: string;
  type: 'power_loss';
  status: 'open' | 'closed';
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
};
export type IncidentPage = { items: EnergyIncident[]; next_cursor?: string | null };
export function powerLabel(device: Device): string {
  const state = device.power_state === 'battery' ? 'Em bateria' : device.power_state === 'mains' ? 'Rede elétrica' : 'Energia desconhecida';
  return state + ' · Bateria ' + (device.battery_pct == null ? 'indisponível' : device.battery_pct + '%');
}

// ---------------------------------------------------------------- administração
export type ManagedUser = { id: string; email: string; name: string; role: Role; active: boolean; created_at: string | null };
export type NewUser = { email: string; name: string; role: Role; password: string };
export type UserChange = Partial<{ name: string; role: Role; active: boolean; password: string }>;
export type DeviceChange = Partial<{ name: string; location: string; enabled: boolean }>;
export type Firmware = {
  id: string; version: string; sequence: number; target: string; size: number; sha256: string;
  notes: string; uploaded_by: string | null; uploaded_at: string | null;
};
export type OtaStatus = 'queued' | 'sent' | 'downloading' | 'installed' | 'success' | 'failed' | 'rejected' | 'rolled_back' | 'timeout';
export type OtaJob = {
  id: string; device_id: string; firmware_id: string; version: string; from_version: string | null;
  status: OtaStatus; detail: string; created_by: string | null; created_at: string | null;
  updated_at: string | null; finished_at: string | null;
};
export const otaFinished = (status: OtaStatus) => ['success', 'failed', 'rejected', 'rolled_back', 'timeout'].includes(status);

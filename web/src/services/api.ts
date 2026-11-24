import { ApiError } from '../contracts';
import type { Alert, AlertPage, AlertState, Device, DeviceChange, DevicePage, Firmware, Limits, ManagedUser, NewUser, OtaJob, ReadingPage, ReadingQuery, Session, User, UserChange } from '../contracts';
import { mockRequest } from '../mocks/server';

export const useMocks = import.meta.env?.VITE_USE_MOCKS === 'true';
export const apiBase = (import.meta.env?.VITE_API_BASE || '/api/v2').replace(/\/$/, '');
const query = (params: Record<string, string | undefined>) => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) result.set(key, value);
  return result.size ? '?' + result.toString() : '';
};
type Transport = <T>(path: string, method: string, body: unknown, token: string | null, signal: AbortSignal) => Promise<T>;
const transport: Transport = async <T>(path: string, method: string, body: unknown, token: string | null, signal: AbortSignal) => {
  if (useMocks) return await mockRequest({ path, method, body, token, signal }) as T;
  const raw = typeof Blob !== 'undefined' && body instanceof Blob;   // upload do firmware (.bin)
  const response = await fetch(apiBase + path, {
    method, credentials: 'include', signal,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : raw ? body as Blob : JSON.stringify(body),
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiError(response.status, envelope?.error?.message ?? `Falha na solicitação (HTTP ${response.status}).`, envelope?.error?.fields, envelope?.request_id);
  }
  return response.status === 204 ? undefined as T : response.json();
};

export function createApi(send: Transport = transport) {
  let access: string | null = null, refreshToken: string | undefined, generation = 0;
  let refreshInFlight: Promise<boolean> | null = null;
  let onExpired = () => {};
  function clear() {
    generation++;
    access = null;
    refreshToken = undefined;
    refreshInFlight = null;
  }
  function apply(session: Session) {
    access = session.access_token;
    refreshToken = session.refresh_token;
  }
  async function call<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, token = access, limit = 10_000): Promise<T> {
    const timeout = AbortSignal.timeout(limit);
    try {
      return await send<T>(path, method, body, token, signal ? AbortSignal.any([signal, timeout]) : timeout);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new ApiError(408, `A solicitação excedeu ${limit / 1000} segundos.`);
      if (error instanceof TypeError) throw new ApiError(503, 'Sem conexão com a API.');
      throw error;
    }
  }
  function renew() {
    if (refreshInFlight) return refreshInFlight;
    const sessionGeneration = generation;
    refreshInFlight = call<Session>('/auth/refresh', 'POST', { refresh_token: refreshToken }, undefined, null)
      .then(session => {
        if (sessionGeneration !== generation) return false;
        apply(session);
        return true;
      })
      .catch(() => {
        if (sessionGeneration === generation) {
          clear();
          onExpired();
        }
        return false;
      })
      .finally(() => { if (sessionGeneration === generation) refreshInFlight = null; });
    return refreshInFlight;
  }
  async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, limit?: number) {
    const sentWith = access, sessionGeneration = generation;
    try {
      return await call<T>(path, method, body, signal, sentWith, limit);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || signal?.aborted || generation !== sessionGeneration) throw error;
      if (access === sentWith && !await renew()) throw error;
      if (generation !== sessionGeneration || signal?.aborted) throw error;
      try {
        return await call<T>(path, method, body, signal, access, limit);
      } catch (retry) {
        if (retry instanceof ApiError && retry.status === 401 && generation === sessionGeneration) {
          clear();
          onExpired();
        }
        throw retry;
      }
    }
  }
  const device = (id: string) => '/devices/' + encodeURIComponent(id);
  async function allIncidents(id: string, signal?: AbortSignal) {
    const items: import('../contracts/index').EnergyIncident[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await request<import('../contracts/index').IncidentPage>(
        device(id) + '/incidents' + query({ cursor }), 'GET', undefined, signal);
      items.push(...page.items);
      cursor = page.next_cursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new ApiError(400, 'Cursor repetido nos incidentes.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  return {
    incidents: allIncidents,
    onExpired(callback: () => void) { onExpired = callback; },
    async login(email: string, password: string) {
      clear();
      const session = await call<Session>('/auth/login', 'POST', { email, password }, undefined, null);
      apply(session);
      return session.user;
    },
    async restore() {
      if (!await renew()) return null;
      return request<User>('/me');
    },
    async logout() {
      const pending = refreshInFlight;
      if (pending) await pending;
      const refresh = refreshToken, token = access;
      clear();
      await call<void>('/auth/logout', 'POST', { refresh_token: refresh }, undefined, token);
    },
    me: () => request<User>('/me'),
    devices: (cursor?: string, signal?: AbortSignal) => request<DevicePage>('/devices' + query({ cursor }), 'GET', undefined, signal),
    device: (id: string, signal?: AbortSignal) => request<Device>(device(id), 'GET', undefined, signal),
    readings: (id: string, params: ReadingQuery, signal?: AbortSignal) => request<ReadingPage>(device(id) + '/readings' + query(params), 'GET', undefined, signal),
    alerts: (params: { state?: AlertState; device_id?: string; cursor?: string }, signal?: AbortSignal) => request<AlertPage>('/alerts' + query(params), 'GET', undefined, signal),
    acknowledge: (id: string, note?: string) => request<Alert>('/alerts/' + encodeURIComponent(id) + '/ack', 'POST', { note }),
    limits: (id: string, signal?: AbortSignal) => request<Limits>(device(id) + '/limits', 'GET', undefined, signal),
    saveLimits: (id: string, limits: Limits) => request<Limits>(device(id) + '/limits', 'PUT', limits),
    // administração (perfil admin)
    users: (signal?: AbortSignal) => request<{ items: ManagedUser[] }>('/users', 'GET', undefined, signal),
    createUser: (user: NewUser) => request<ManagedUser>('/users', 'POST', user),
    updateUser: (id: string, change: UserChange) => request<ManagedUser>('/users/' + encodeURIComponent(id), 'PUT', change),
    linkDevice: (id: string, name: string, location: string) => request<Device>('/devices', 'POST', { id, name, location }),
    updateDevice: (id: string, change: DeviceChange) => request<Device>(device(id), 'PUT', change),
    firmware: (signal?: AbortSignal) => request<{ items: Firmware[] }>('/firmware', 'GET', undefined, signal),
    uploadFirmware: (file: Blob, notes?: string) => request<Firmware>('/firmware' + query({ notes: notes || undefined }), 'POST', file, undefined, 60_000),
    startOta: (deviceId: string, firmwareId: string) => request<OtaJob>(device(deviceId) + '/ota', 'POST', { firmware_id: firmwareId }),
    otaJobs: (deviceId?: string, signal?: AbortSignal) => request<{ items: OtaJob[] }>('/ota/jobs' + query({ device_id: deviceId }), 'GET', undefined, signal),
  };
}
export const api = createApi();

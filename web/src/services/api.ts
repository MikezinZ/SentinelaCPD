import { ApiError } from '../contracts';
import type { Alert, AlertPage, AlertState, Device, DevicePage, Limits, ReadingPage, ReadingQuery, Session, User } from '../contracts';
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
  const response = await fetch(apiBase + path, {
    method, credentials: 'include', signal,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  async function call<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, token = access): Promise<T> {
    const timeout = AbortSignal.timeout(10_000);
    try {
      return await send<T>(path, method, body, token, signal ? AbortSignal.any([signal, timeout]) : timeout);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new ApiError(408, 'A solicitação excedeu 10 segundos.');
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
  async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    const sentWith = access, sessionGeneration = generation;
    try {
      return await call<T>(path, method, body, signal, sentWith);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || signal?.aborted || generation !== sessionGeneration) throw error;
      if (access === sentWith && !await renew()) throw error;
      if (generation !== sessionGeneration || signal?.aborted) throw error;
      try {
        return await call<T>(path, method, body, signal);
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
  return {
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
  };
}
export const api = createApi();

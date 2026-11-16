import { ApiError } from '../types/index.ts';
import type {
  Alert,
  AlertPage,
  AlertState,
  Device,
  DevicePage,
  Limits,
  ReadingPage,
  ReadingQuery,
  Session,
  User,
} from '../types/index.ts';
import { mockRequest } from '../mocks/server.ts';

export const REFRESH_TOKEN_KEY = 'sentinelacpd_refresh_token';

export type SecureStorageLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const envUseMocks =
  typeof process !== 'undefined' && process.env
    ? process.env.EXPO_PUBLIC_USE_MOCKS
    : undefined;

export const useMocks = envUseMocks === undefined ? true : envUseMocks === 'true';

export const apiBase = (
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE) ||
  '/api/v2'
).replace(/\/$/, '');

const buildQuery = (params: Record<string, string | undefined>): string => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      result.set(key, value);
    }
  }
  const str = result.toString();
  return str ? `?${str}` : '';
};

export type Transport = <T>(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
  signal: AbortSignal
) => Promise<T>;

export const defaultTransport: Transport = async <T>(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
  signal: AbortSignal
): Promise<T> => {
  if (useMocks) {
    return (await mockRequest({ path, method, body, token, signal })) as T;
  }
  const response = await fetch(apiBase + path, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      envelope?.error?.message ?? `Falha na solicitação (HTTP ${response.status}).`,
      envelope?.error?.fields,
      envelope?.request_id
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

function createRuntimeStorage(): SecureStorageLike {
  const map = new Map<string, string>();
  let nativeStore: SecureStorageLike | null | undefined;

  async function resolveNative(): Promise<SecureStorageLike | null> {
    if (nativeStore !== undefined) return nativeStore;
    try {
      const mod = await import('./storage');
      nativeStore = mod.defaultSecureStorage;
    } catch {
      nativeStore = null;
    }
    return nativeStore;
  }

  return {
    async getItemAsync(key: string) {
      const store = await resolveNative();
      if (store) {
        const val = await store.getItemAsync(key);
        if (val !== null) return val;
      }
      return map.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      map.set(key, value);
      const store = await resolveNative();
      if (store) await store.setItemAsync(key, value);
    },
    async deleteItemAsync(key: string) {
      map.delete(key);
      const store = await resolveNative();
      if (store) await store.deleteItemAsync(key);
    },
  };
}

export function createApi(
  send: Transport = defaultTransport,
  storage: SecureStorageLike = createRuntimeStorage()
) {
  let accessToken: string | null = null;
  let refreshTokenCache: string | null = null;
  let generation = 0;
  let refreshInFlight: Promise<boolean> | null = null;
  let onExpiredCallback = () => {};

  async function purgeSession() {
    generation++;
    accessToken = null;
    refreshTokenCache = null;
    refreshInFlight = null;
    await storage.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
  }

  async function applySession(session: Session) {
    accessToken = session.access_token;
    if (session.refresh_token) {
      refreshTokenCache = session.refresh_token;
      await storage.setItemAsync(REFRESH_TOKEN_KEY, session.refresh_token).catch(() => {});
    }
  }

  async function callWithTimeout<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    callerSignal?: AbortSignal,
    token: string | null = accessToken
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);

    const onCallerAbort = () => {
      controller.abort(callerSignal?.reason);
    };

    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timer);
        throw callerSignal.reason ?? new Error('Aborted');
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      return await send<T>(path, method, body, token, controller.signal);
    } catch (error) {
      if (callerSignal?.aborted) {
        throw callerSignal.reason ?? error;
      }
      if (timedOut) {
        throw new ApiError(408, 'A solicitação excedeu o tempo limite de 10 segundos.');
      }
      if (error instanceof TypeError) {
        throw new ApiError(503, 'Sem conexão com a API do CPD.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  function renewToken(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;
    const sessionGeneration = generation;

    refreshInFlight = (async () => {
      try {
        const storedRefresh =
          refreshTokenCache ?? (await storage.getItemAsync(REFRESH_TOKEN_KEY));
        if (!storedRefresh) {
          if (sessionGeneration === generation) {
            await purgeSession();
            onExpiredCallback();
          }
          return false;
        }
        const session = await callWithTimeout<Session>(
          '/auth/refresh',
          'POST',
          { refresh_token: storedRefresh },
          undefined,
          null
        );
        if (sessionGeneration !== generation) return false;
        await applySession(session);
        return true;
      } catch {
        if (sessionGeneration === generation) {
          await purgeSession();
          onExpiredCallback();
        }
        return false;
      } finally {
        if (sessionGeneration === generation) {
          refreshInFlight = null;
        }
      }
    })();

    return refreshInFlight;
  }

  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const sentWith = accessToken;
    const sessionGeneration = generation;

    try {
      return await callWithTimeout<T>(path, method, body, signal, sentWith);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        signal?.aborted ||
        generation !== sessionGeneration
      ) {
        throw error;
      }
      // Se outra requisição concorrente já renovou o token, reutiliza; caso contrário, renova
      if (accessToken === sentWith && !(await renewToken())) {
        throw error;
      }
      if (generation !== sessionGeneration || signal?.aborted) {
        throw error;
      }
      try {
        return await callWithTimeout<T>(path, method, body, signal, accessToken);
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          generation === sessionGeneration
        ) {
          await purgeSession();
          onExpiredCallback();
        }
        throw retryError;
      }
    }
  }

  const devicePath = (id: string) => `/devices/${encodeURIComponent(id)}`;

  return {
    onExpired(callback: () => void) {
      onExpiredCallback = callback;
    },
    getAccessToken() {
      return accessToken;
    },
    async login(email: string, password: string): Promise<User> {
      await purgeSession();
      const session = await callWithTimeout<Session>(
        '/auth/login',
        'POST',
        { email, password },
        undefined,
        null
      );
      await applySession(session);
      return session.user;
    },
    async restore(): Promise<User | null> {
      const storedRefresh =
        refreshTokenCache ?? (await storage.getItemAsync(REFRESH_TOKEN_KEY));
      if (!storedRefresh) return null;
      if (!(await renewToken())) return null;
      return request<User>('/me');
    },
    async logout(): Promise<void> {
      const pending = refreshInFlight;
      if (pending) await pending.catch(() => {});
      const refresh =
        refreshTokenCache ?? (await storage.getItemAsync(REFRESH_TOKEN_KEY));
      const token = accessToken;
      await purgeSession();
      await callWithTimeout<void>(
        '/auth/logout',
        'POST',
        { refresh_token: refresh ?? undefined },
        undefined,
        token
      ).catch(() => {});
    },
    me: () => request<User>('/me'),
    devices: (cursor?: string, signal?: AbortSignal) =>
      request<DevicePage>(`/devices${buildQuery({ cursor })}`, 'GET', undefined, signal),
    device: (id: string, signal?: AbortSignal) =>
      request<Device>(devicePath(id), 'GET', undefined, signal),
    readings: (id: string, params: ReadingQuery, signal?: AbortSignal) =>
      request<ReadingPage>(
        `${devicePath(id)}/readings${buildQuery(params)}`,
        'GET',
        undefined,
        signal
      ),
    alerts: (
      params: { state?: AlertState; device_id?: string; cursor?: string },
      signal?: AbortSignal
    ) => request<AlertPage>(`/alerts${buildQuery(params)}`, 'GET', undefined, signal),
    acknowledge: (id: string, note?: string) =>
      request<Alert>(`/alerts/${encodeURIComponent(id)}/ack`, 'POST', { note }),
    limits: (id: string, signal?: AbortSignal) =>
      request<Limits>(`${devicePath(id)}/limits`, 'GET', undefined, signal),
    saveLimits: (id: string, limits: Limits) =>
      request<Limits>(`${devicePath(id)}/limits`, 'PUT', limits),
  };
}

export const api = createApi();


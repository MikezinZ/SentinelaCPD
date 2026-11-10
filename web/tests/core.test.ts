import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, freshness, reading, stateOf } from '../src/contracts';
import { chartRows } from '../src/features/history';
import { demoEmail, demoPassword, mockRequest, setScenario } from '../src/mocks/server';
import { createApi } from '../src/services/api';
import type { Role } from '../src/contracts';

const mockTransport = <T>(path: string, method: string, body: unknown, token: string | null, signal: AbortSignal) =>
  mockRequest({ path, method, body, token, signal }) as Promise<T>;
async function login(role: Role) {
  const api = createApi(mockTransport);
  await api.login(demoEmail(role), demoPassword);
  return api;
}

test('telemetria mantém nulos, qualidade independente e limite de 15 segundos', async () => {
  const api = await login('viewer');
  setScenario('invalid');
  const invalid = await api.device('cpd-01');
  assert.equal(reading(invalid.latest, 'temperature'), null);
  assert.equal(reading(invalid.latest, 'humidity'), null);
  assert.equal(reading(invalid.latest, 'current'), 4.82);
  assert.equal(freshness(invalid, 15_000, invalid.latest?.received_at), 'fresh');
  assert.equal(freshness(invalid, 15_001, invalid.latest?.received_at), 'stale');
  setScenario('stale');
  assert.equal((await api.device('cpd-01')).freshness, 'stale');
  setScenario('unknown');
  assert.equal((await api.device('cpd-01')).latest, null);
  setScenario('network');
  await assert.rejects(api.devices(), (error: ApiError) => error.status === 503);
  setScenario('empty');
  assert.deepEqual((await api.devices()).items, []);
  setScenario('normal');
});

test('mock valida papéis e reconhecimento registra auditoria uma vez', async () => {
  setScenario('critical');
  const viewer = await login('viewer'), operator = await login('operator');
  const { items } = await viewer.alerts({ state: 'active' });
  const id = items[0].id;
  await assert.rejects(viewer.acknowledge(id), (error: ApiError) => error.status === 403);
  await assert.rejects(viewer.limits('cpd-01'), (error: ApiError) => error.status === 403);
  await assert.rejects(operator.acknowledge(id, 'x'.repeat(501)), (error: ApiError) => error.status === 422);
  const alert = await operator.acknowledge(id, 'Verificado');
  assert.equal(stateOf(alert), 'acknowledged');
  assert.equal(alert.note, 'Verificado');
  assert.equal((await operator.acknowledge(id, 'Repetido')).note, 'Verificado');
  assert.equal((await operator.device('cpd-01')).active_alerts, 1);
  setScenario('normal');
});

test('versão de limites exige recarga depois do conflito', async () => {
  const api = await login('admin');
  setScenario('conflict');
  const original = await api.limits('cpd-01');
  await assert.rejects(api.saveLimits('cpd-01', original), (error: ApiError) => error.status === 409);
  const updated = await api.limits('cpd-01');
  assert.equal(updated.version, original.version + 1);
  assert.equal((await api.saveLimits('cpd-01', updated)).version, updated.version + 1);
  setScenario('normal');
});

test('histórico pagina 500 pontos e preserva lacunas e picos', async () => {
  const api = await login('viewer');
  const end = Date.now();
  const query = { from: new Date(end - 86_400_000).toISOString(), to: new Date(end).toISOString(), bucket: '1m' } as const;
  const first = await api.readings('cpd-01', query);
  assert.equal(first.points.length, 500);
  assert.ok(first.next_cursor);
  const second = await api.readings('cpd-01', { ...query, cursor: first.next_cursor });
  assert.ok(second.points[0].timestamp > first.points[499].timestamp);
  assert.ok(chartRows(second.points, 'temperature', 60_000).some(point => point.avg === null));
  assert.ok(first.points[0].temperature!.max > first.points[0].temperature!.avg);
  setScenario('emptyHistory');
  assert.deepEqual((await api.readings('cpd-01', query)).points, []);
  setScenario('normal');
});

test('renovação concorrente usa uma tentativa e expiração limpa a sessão', async () => {
  let refreshCount = 0, expired = 0, stale = true;
  const api = createApi(<T>(path: string, method: string, body: unknown, token: string | null, signal: AbortSignal) => {
    if (path === '/auth/refresh') { refreshCount++; stale = false; }
    if (path === '/me' && stale) return Promise.reject(new ApiError(401, 'Sessão expirada.'));
    return mockTransport<T>(path, method, body, token, signal);
  });
  await api.login(demoEmail('viewer'), demoPassword);
  api.onExpired(() => expired++);
  await Promise.all([api.me(), api.me()]);
  assert.equal(refreshCount, 1);
  setScenario('expired');
  await assert.rejects(api.me(), (error: ApiError) => error.status === 401);
  assert.equal(refreshCount, 2);
  assert.equal(expired, 1);
  setScenario('normal');
});

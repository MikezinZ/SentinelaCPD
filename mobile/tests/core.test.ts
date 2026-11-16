import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiError,
  buildChartPoints,
  freshness,
  reading,
  stateOf,
} from '../types/index.ts';
import {
  demoEmail,
  demoPassword,
  mockRequest,
  setScenario,
} from '../mocks/server.ts';
import {
  REFRESH_TOKEN_KEY,
  createApi,
  type SecureStorageLike,
  type Transport,
} from '../services/api.ts';
import type { Role } from '../types/index.ts';

function createTestStorage(): SecureStorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async getItemAsync(key: string) {
      return store.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      store.set(key, value);
    },
    async deleteItemAsync(key: string) {
      store.delete(key);
    },
  };
}

const mockTransport: Transport = <T>(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
  signal: AbortSignal
) => mockRequest({ path, method, body, token, signal }) as Promise<T>;

async function loginAs(role: Role) {
  const storage = createTestStorage();
  const client = createApi(mockTransport, storage);
  await client.login(demoEmail(role), demoPassword);
  return { client, storage };
}

test('1. Telemetria mantém nulos, qualidade independente por sensor e limite de 15s (freshness)', async () => {
  const { client } = await loginAs('viewer');

  // Cenário 4: Falha no DHT22 (temperature e humidity invalid/null, corrente ok)
  setScenario('invalid');
  const invalidDevice = await client.device('cpd-01');
  assert.equal(reading(invalidDevice.latest, 'temperature'), null);
  assert.equal(reading(invalidDevice.latest, 'humidity'), null);
  assert.equal(reading(invalidDevice.latest, 'current'), 0.10);

  // Limite exato de 15 segundos
  assert.equal(
    freshness(invalidDevice, 15_000, invalidDevice.latest?.received_at),
    'fresh'
  );
  assert.equal(
    freshness(invalidDevice, 15_001, invalidDevice.latest?.received_at),
    'stale'
  );

  // Cenário 3: Telemetria antiga (stale)
  setScenario('stale');
  assert.equal((await client.device('cpd-01')).freshness, 'stale');

  // Cenário 5: Dispositivo sem primeira leitura (unknown)
  setScenario('unknown');
  const unknownDevice = await client.device('cpd-01');
  assert.equal(unknownDevice.latest, null);
  assert.equal(unknownDevice.freshness, 'unknown');

  // Dispositivo inativo
  assert.equal(
    freshness({ ...unknownDevice, enabled: false }),
    'inactive'
  );

  // Cenário 6: Falha de rede HTTP 503
  setScenario('network');
  await assert.rejects(
    client.devices(),
    (error: ApiError) => error.status === 503
  );

  setScenario('normal');
});

test('2. RBAC valida permissões e reconhecimento (ACK) grava auditoria com limite de 500 caracteres', async () => {
  setScenario('critical');
  const { client: viewer } = await loginAs('viewer');
  const { client: operator } = await loginAs('operator');

  const { items } = await viewer.alerts({ state: 'active' });
  const criticalAlertId = items[0].id;

  // Viewer não pode reconhecer alertas nem acessar limites
  await assert.rejects(
    viewer.acknowledge(criticalAlertId),
    (error: ApiError) => error.status === 403
  );
  await assert.rejects(
    viewer.limits('cpd-01'),
    (error: ApiError) => error.status === 403
  );

  // Operator não pode acessar limites, mas pode reconhecer alertas
  await assert.rejects(
    operator.limits('cpd-01'),
    (error: ApiError) => error.status === 403
  );

  // Nota acima de 500 caracteres é rejeitada com HTTP 422
  await assert.rejects(
    operator.acknowledge(criticalAlertId, 'a'.repeat(501)),
    (error: ApiError) => error.status === 422
  );

  const acknowledged = await operator.acknowledge(
    criticalAlertId,
    'Inspeção térmica realizada no Setor A'
  );
  assert.equal(stateOf(acknowledged), 'acknowledged');
  assert.equal(acknowledged.note, 'Inspeção térmica realizada no Setor A');

  setScenario('normal');
});

test('3. Conflito de versão nos limites (HTTP 409) exige recarga antes de salvar', async () => {
  const { client: admin } = await loginAs('admin');
  setScenario('conflict');

  const original = await admin.limits('cpd-01');
  await assert.rejects(
    admin.saveLimits('cpd-01', original),
    (error: ApiError) => error.status === 409
  );

  const reloaded = await admin.limits('cpd-01');
  assert.equal(reloaded.version, original.version + 1);

  const saved = await admin.saveLimits('cpd-01', {
    ...reloaded,
    temperature_max: 26.5,
  });
  assert.equal(saved.version, reloaded.version + 1);
  assert.equal(saved.temperature_max, 26.5);

  setScenario('normal');
});

test('4. Histórico pagina até 500 pontos, preserva faixa Mín/Máx e insere quebra explícita em lacunas', async () => {
  const { client } = await loginAs('viewer');
  const end = Date.now();
  const query = {
    from: new Date(end - 86_400_000).toISOString(),
    to: new Date(end).toISOString(),
    bucket: '1m' as const,
  };

  const firstPage = await client.readings('cpd-01', query);
  assert.equal(firstPage.points.length, 500);
  assert.ok(firstPage.next_cursor);
  assert.ok(
    firstPage.points[0].temperature!.max > firstPage.points[0].temperature!.avg
  );
  assert.ok(
    firstPage.points[0].temperature!.min < firstPage.points[0].temperature!.avg
  );

  const secondPage = await client.readings('cpd-01', {
    ...query,
    cursor: firstPage.next_cursor!,
  });
  assert.ok(secondPage.points[0].timestamp > firstPage.points[499].timestamp);

  const chartSegments = buildChartPoints(
    secondPage.points,
    'temperature',
    60_000
  );
  assert.ok(chartSegments.some((pt) => pt.isGap && pt.avg === null));
});

test('5. Sessão persiste refresh token no SecureStore, deduplica refresh concorrente e expurga na falha', async () => {
  let refreshCount = 0;
  let expiredCalls = 0;
  let force401Once = true;

  const storage = createTestStorage();
  const customClient = createApi(
    <T>(
      path: string,
      method: string,
      body: unknown,
      token: string | null,
      signal: AbortSignal
    ) => {
      if (path === '/auth/refresh') {
        refreshCount++;
        force401Once = false;
      }
      if (path === '/me' && force401Once) {
        return Promise.reject(new ApiError(401, 'Access token expirado.'));
      }
      return mockTransport<T>(path, method, body, token, signal);
    },
    storage
  );

  await customClient.login(demoEmail('viewer'), demoPassword);
  assert.ok(storage.store.get(REFRESH_TOKEN_KEY));

  customClient.onExpired(() => {
    expiredCalls++;
  });

  // Duas chamadas concorrentes com 401 disparam apenas 1 refresh
  await Promise.all([customClient.me(), customClient.me()]);
  assert.equal(refreshCount, 1);
  assert.ok(storage.store.get(REFRESH_TOKEN_KEY));

  // Quando a sessão expira no servidor, o SecureStore é expurgado e onExpired é acionado
  setScenario('expired');
  await assert.rejects(
    customClient.me(),
    (error: ApiError) => error.status === 401
  );
  assert.equal(refreshCount, 2);
  assert.equal(expiredCalls, 1);
  assert.equal(storage.store.get(REFRESH_TOKEN_KEY), undefined);

  setScenario('normal');
});


test('energia explícita e freshness configurável', async () => {
  const { client: api } = await loginAs('viewer');
  setScenario('power');
  try {
    const device = await api.device('cpd-01');
    assert.equal(device.power_state, 'battery');
    assert.equal(device.battery_pct, 18);
    const incidents = await api.incidents(device.id);
    assert.equal(incidents[0].status, 'open');
    assert.equal(incidents[0].duration_s, null);
    assert.equal(incidents[1].duration_s, 600);
    assert.deepEqual(await api.incidents('cpd-02'), []);
    const alerts = await api.alerts({device_id: device.id});
    assert.equal(alerts.items.find(a => a.type === 'power_loss')?.severity, 'critical');
    assert.equal(alerts.items.find(a => a.type === 'battery_low')?.severity, 'warning');
    const server = device.latest!.received_at;
    assert.equal(freshness({...device, stale_after_seconds: 30}, 30000, server), 'fresh');
    assert.equal(freshness({...device, stale_after_seconds: 30}, 30001, server), 'stale');
    assert.equal(freshness({...device, stale_after_seconds: undefined}, 15001, server), 'stale');
  } finally { setScenario('normal'); }
});

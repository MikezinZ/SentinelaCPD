import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, API_TIMEOUT_MS } from "../src/services/apiClient";
import { ApiError } from "../src/services/errors";
import { configureRuntime, scenarios } from "../src/mocks/runtime";
import {
  getStatusCpd,
  getTelemetria,
  getIncidentes,
  getIncidenteDetalhe,
  getDispositivos,
} from "../src/services/cpdService";
import { statusSchema } from "../src/services/apiSchemas";
import {
  isStale,
  nullableNumber,
  duration,
  incidentDuration,
} from "../src/utils/format";
const config = {
  baseUrl: "https://cpd.example/api",
  getApiKey: async () => null,
  useMocks: () => false,
};
test("HTTP: URL, encoding, chave automática e JSON", async () => {
  let target = "";
  let headers: HeadersInit | undefined;
  const client = createApiClient({
    ...config,
    getApiKey: async () => "test-key",
    fetcher: async (input, init) => {
      target = String(input);
      headers = init?.headers;
      return new Response(JSON.stringify({ ok: true }));
    },
  });
  assert.deepEqual(
    await client("telemetria", "/telemetria", {
      dispositivo: "rack / A",
      limite: 2,
    }),
    { ok: true },
  );
  const url = new URL(target);
  assert.equal(url.pathname, "/api/telemetria");
  assert.equal(url.searchParams.get("dispositivo"), "rack / A");
  assert.equal(new Headers(headers).get("X-API-Key"), "test-key");
});
test("HTTP: não envia chave ausente nem id de detalhe como query", async () => {
  const client = createApiClient({
    ...config,
    fetcher: async (input, init) => {
      assert.equal(new Headers(init?.headers).has("X-API-Key"), false);
      assert.equal(new URL(String(input)).search, "");
      return new Response("{}");
    },
  });
  await client("detalhe", "/incidentes/10", { id: 10 });
});
test("HTTP: timeout cobre lookup da chave e fetch mesmo sem cooperação do transporte", async () => {
  assert.equal(API_TIMEOUT_MS, 10000);
  const client = createApiClient({
    ...config,
    timeoutMs: 15,
    fetcher: async () => new Promise<Response>(() => {}),
  });
  await assert.rejects(
    client("status", "/status/cpd"),
    (e: unknown) => e instanceof ApiError && e.kind === "timeout",
  );
  const blockedKey = createApiClient({
    ...config,
    timeoutMs: 15,
    getApiKey: async () => new Promise<string>(() => {}),
  });
  await assert.rejects(
    blockedKey("status", "/status/cpd"),
    (e: unknown) => e instanceof ApiError && e.kind === "timeout",
  );
});
test("HTTP: cancelamento externo interrompe fetch e rejeita imediatamente", async () => {
  let passedSignal: AbortSignal | null | undefined;
  const client = createApiClient({
    ...config,
    fetcher: async (_input, init) => {
      passedSignal = init?.signal;
      return new Promise<Response>(() => {});
    },
  });
  const controller = new AbortController();
  const pending = client("status", "/status", {}, controller.signal);
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(passedSignal?.aborted, true);
  await assert.rejects(client("status", "/status", {}, controller.signal), {
    name: "AbortError",
  });
});
test("HTTP: distingue 503, falha de rede e JSON inválido", async () => {
  await assert.rejects(
    createApiClient({
      ...config,
      fetcher: async () => new Response("", { status: 503 }),
    })("status", "/"),
    (e: unknown) => e instanceof ApiError && e.status === 503,
  );
  await assert.rejects(
    createApiClient({
      ...config,
      fetcher: async () => {
        throw new TypeError("secret transport detail");
      },
    })("status", "/"),
    (e: unknown) =>
      e instanceof ApiError &&
      e.kind === "network" &&
      !e.message.includes("secret"),
  );
  await assert.rejects(
    createApiClient({
      ...config,
      fetcher: async () => new Response("not json"),
    })("status", "/"),
    (e: unknown) => e instanceof ApiError && e.kind === "validation",
  );
});
test("HTTP: mock desvia antes de ler chave ou tocar rede", async () => {
  const client = createApiClient({
    ...config,
    useMocks: () => true,
    getApiKey: async () => {
      throw new Error("não deveria ler chave");
    },
    fetcher: async () => {
      throw new Error("não deveria acessar rede");
    },
    mock: async () => ({ mock: true }),
  });
  assert.deepEqual(await client("status", "/"), { mock: true });
});
test("sete cenários cumprem o contrato e os estados semânticos", async () => {
  for (const scenario of scenarios) {
    configureRuntime({ demo: true, scenario: scenario.id });
    if (scenario.id === "ERRO_503_REDE") {
      await assert.rejects(
        getStatusCpd(),
        (e: unknown) => e instanceof ApiError && e.status === 503,
      );
      continue;
    }
    const data = await getStatusCpd();
    assert.equal(statusSchema.safeParse(data).success, true);
    if (scenario.id === "CPD_NORMAL") {
      assert.equal(data.status_geral, "NORMAL");
      assert.ok(data.dispositivos.every((d) => !isStale(d)));
    }
    if (scenario.id === "ALERTA_TEMPERATURA") {
      assert.equal(data.status_geral, "ALERTA_TEMPERATURA");
      assert.equal(data.dispositivos[0]?.temperatura, 38.5);
      assert.equal(data.dispositivos[0]?.alerta_temperatura, true);
    }
    if (scenario.id === "STALE_DATA")
      assert.ok(data.dispositivos.every((d) => isStale(d)));
    if (scenario.id === "SENSOR_CORRENTE_NULL") {
      assert.equal(data.dispositivos[0]?.corrente, null);
      assert.equal(data.dispositivos[0]?.bateria, null);
    }
    if (scenario.id === "DISPOSITIVO_SEM_DADOS") {
      assert.equal(data.status_geral, "SEM_DADOS");
      assert.deepEqual(data.dispositivos, []);
    }
    if (scenario.id === "INCIDENTE_ABERTO") {
      const incidents = await getIncidentes("ABERTO");
      assert.equal(incidents[0]?.fim, null);
      assert.equal(incidents[0]?.status, "ABERTO");
    }
  }
});
test("serviços: filtro, datas, limite, detalhe e cadastro", async () => {
  configureRuntime({ demo: true, scenario: "INCIDENTE_ABERTO" });
  const closed = await getIncidentes("FECHADO");
  assert.equal(closed.length, 1);
  assert.ok(closed.every((i) => i.status === "FECHADO"));
  const open = await getIncidentes("ABERTO");
  const id = open[0]?.id;
  assert.ok(id);
  const detail = await getIncidenteDetalhe(id);
  assert.equal(detail.id, id);
  assert.ok(Array.isArray(detail.telemetria));
  await assert.rejects(
    getIncidenteDetalhe(9999),
    (e: unknown) => e instanceof ApiError && e.status === 404,
  );
  await assert.rejects(getIncidenteDetalhe(NaN));
  const points = await getTelemetria({ dispositivo: "rack-1", limite: 3 });
  assert.equal(points.length, 3);
  assert.ok(points.every((p) => p.dispositivo_id === "rack-1"));
  const range = await getTelemetria({
    de: "2000-01-01T00:00:00-03:00",
    ate: "2001-01-01T00:00:00-03:00",
  });
  assert.deepEqual(range, []);
  await assert.rejects(getTelemetria({ limite: 0 }));
  await assert.rejects(
    getTelemetria({
      de: "2026-11-11T00:00:00-03:00",
      ate: "2026-11-10T00:00:00-03:00",
    }),
  );
  assert.equal((await getDispositivos()).length, 4);
});
test("renderização: null não vira zero, freshness e duração", () => {
  assert.equal(nullableNumber(null, "A"), "--");
  assert.equal(nullableNumber(0, "A"), "0,0 A");
  assert.equal(duration(125), "2 min 05 s");
  assert.equal(duration(null), "--");
  const base = {
    id: 1,
    dispositivo_id: "rack-1",
    tipo: "ENERGIA",
    status: "ABERTO" as const,
    inicio: "2026-11-10T12:00:00-03:00",
    fim: null,
    duracao_s: null,
  };
  assert.equal(
    incidentDuration(base, Date.parse("2026-11-10T12:02:05-03:00")),
    "2 min 05 s • em andamento",
  );
  assert.equal(
    statusSchema.safeParse({
      status_geral: "INVALID",
      limite_temperatura: 30,
      dispositivos: [],
    }).success,
    false,
  );
});

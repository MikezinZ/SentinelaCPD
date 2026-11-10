import { ApiError, abortError } from "../services/errors";
import { getRuntime } from "./runtime";
import { incidentFixture, statusFixture, telemetryFixture } from "./fixtures";
export type Operation =
  | "status"
  | "telemetria"
  | "incidentes"
  | "detalhe"
  | "dispositivos";
export type Query = Readonly<Record<string, string | number | undefined>>;
export async function mockRequest(
  operation: Operation,
  query: Query,
  signal: AbortSignal,
): Promise<unknown> {
  const runtime = getRuntime();
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const abort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 250);
    signal.addEventListener("abort", abort, { once: true });
  });
  if (runtime.scenario === "ERRO_503_REDE")
    throw new ApiError("API Cloud indisponível. Tente novamente.", 503);
  const status = statusFixture(runtime.scenario, Date.now(), runtime.startedAt);
  const incidents = incidentFixture(runtime.scenario, runtime.startedAt);
  const points = telemetryFixture(
    runtime.scenario,
    Date.now(),
    runtime.startedAt,
  );
  switch (operation) {
    case "status":
      return status;
    case "dispositivos":
      return status.dispositivos.map(({ id, nome, local }) => ({
        id,
        nome,
        local,
      }));
    case "incidentes":
      return incidents.filter(
        (i) => !query.status || i.status === query.status,
      );
    case "detalhe": {
      const item = incidents.find((i) => i.id === query.id);
      if (!item) throw new ApiError("Incidente não encontrado.", 404);
      return {
        ...item,
        telemetria: points.filter(
          (p) =>
            p.dispositivo_id === item.dispositivo_id &&
            Date.parse(p.timestamp) >= Date.parse(item.inicio) &&
            (!item.fim || Date.parse(p.timestamp) <= Date.parse(item.fim)),
        ),
      };
    }
    case "telemetria": {
      const filtered = points
        .filter(
          (p) =>
            (!query.dispositivo || p.dispositivo_id === query.dispositivo) &&
            (!query.de ||
              Date.parse(p.timestamp) >= Date.parse(String(query.de))) &&
            (!query.ate ||
              Date.parse(p.timestamp) <= Date.parse(String(query.ate))),
        )
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      return filtered.slice(-Number(query.limite ?? 100));
    }
  }
}

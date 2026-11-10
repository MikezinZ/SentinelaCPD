import type { Scenario } from "../types/domain";
import type {
  StatusCpdResponse,
  Incidente,
  TelemetriaPonto,
} from "../types/api";
export function isoUtcMinus3(value: number): string {
  return new Date(value - 3 * 3600000).toISOString().replace("Z", "-03:00");
}
export function statusFixture(
  scenario: Scenario,
  now = Date.now(),
  startedAt = now,
): StatusCpdResponse {
  const empty = scenario === "DISPOSITIVO_SEM_DADOS";
  const hot = scenario === "ALERTA_TEMPERATURA";
  const incident = scenario === "INCIDENTE_ABERTO";
  const stale = scenario === "STALE_DATA";
  return {
    status_geral: empty
      ? "SEM_DADOS"
      : hot
        ? "ALERTA_TEMPERATURA"
        : incident
          ? "EM_INCIDENTE"
          : stale
            ? "OFFLINE"
            : "NORMAL",
    limite_temperatura: 30,
    dispositivos: empty
      ? []
      : Array.from({ length: 4 }, (_, i) => ({
          id: `rack-${i + 1}`,
          nome: `Rack A-0${i + 1}`,
          local: `Sala 01 • Corredor ${i < 2 ? "A" : "B"}`,
          estado: incident && i === 0 ? "SEM_ENERGIA" : "NORMAL",
          ultimo_contato: isoUtcMinus3(stale ? startedAt - 60000 : now - 2000),
          temperatura: hot && i === 0 ? 38.5 : 22.4 + i,
          umidade: 45 + i,
          corrente:
            scenario === "SENSOR_CORRENTE_NULL"
              ? null
              : incident && i === 0
                ? 0
                : 2.5 + i * 0.2,
          bateria: scenario === "SENSOR_CORRENTE_NULL" ? null : 95 - i,
          incidentes_abertos: incident && i === 0 ? 1 : 0,
          online: !stale,
          alerta_temperatura: hot && i === 0,
        })),
  };
}
export function incidentFixture(
  scenario: Scenario,
  startedAt = Date.now(),
): Incidente[] {
  if (scenario === "DISPOSITIVO_SEM_DADOS") return [];
  const closed: Incidente = {
    id: 1041,
    dispositivo_id: "rack-2",
    tipo: "QUEDA_ENERGIA",
    status: "FECHADO",
    inicio: isoUtcMinus3(startedAt - 3600000),
    fim: isoUtcMinus3(startedAt - 3480000),
    duracao_s: 120,
  };
  return scenario === "INCIDENTE_ABERTO"
    ? [
        {
          id: 1042,
          dispositivo_id: "rack-1",
          tipo: "QUEDA_ENERGIA",
          status: "ABERTO",
          inicio: isoUtcMinus3(startedAt - 185000),
          fim: null,
          duracao_s: null,
        },
        closed,
      ]
    : [closed];
}
export function telemetryFixture(
  scenario: Scenario,
  now = Date.now(),
  startedAt = now,
): TelemetriaPonto[] {
  return statusFixture(scenario, now, startedAt).dispositivos.flatMap((d) =>
    Array.from({ length: 12 }, (_, i) => ({
      dispositivo_id: d.id,
      timestamp: isoUtcMinus3(Date.parse(d.ultimo_contato) - (11 - i) * 300000),
      temperatura: Number((d.temperatura - (11 - i) * 0.1).toFixed(1)),
      umidade: d.umidade,
      corrente: d.corrente,
      bateria: d.bateria,
    })),
  );
}

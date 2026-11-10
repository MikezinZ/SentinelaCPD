import type { DispositivoStatus, Incidente, StatusGeral } from "../types/api";
export const number = (value: number, digits = 1): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export const nullableNumber = (value: number | null, unit = ""): string =>
  value === null ? "--" : `${number(value)}${unit ? ` ${unit}` : ""}`;
export const dateTime = (value: string): string =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Recife" });
export const statusLabel: Record<StatusGeral, string> = {
  NORMAL: "Normal",
  EM_INCIDENTE: "Em incidente",
  ALERTA_TEMPERATURA: "Alerta de temperatura",
  OFFLINE: "Offline",
  SEM_DADOS: "Sem dados",
};
export function isStale(device: DispositivoStatus, now = Date.now()): boolean {
  const timestamp = Date.parse(device.ultimo_contato);
  return !Number.isFinite(timestamp) || now - timestamp > 15000;
}
export function duration(seconds: number | null): string {
  if (seconds === null) return "--";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}
export function incidentDuration(
  incident: Incidente,
  now = Date.now(),
): string {
  if (incident.status === "ABERTO")
    return `${duration((now - Date.parse(incident.inicio)) / 1000)} • em andamento`;
  return duration(
    incident.duracao_s ??
      (incident.fim
        ? (Date.parse(incident.fim) - Date.parse(incident.inicio)) / 1000
        : null),
  );
}

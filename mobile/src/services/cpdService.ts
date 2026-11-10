import { z } from "zod";
import type {
  StatusCpdResponse,
  TelemetriaQuery,
  TelemetriaPonto,
  Incidente,
  IncidenteDetalhe,
  DispositivoCadastral,
} from "../types/api";
import { apiClient } from "./apiClient";
import {
  statusSchema,
  telemetriaSchema,
  incidenteSchema,
  detalheSchema,
  cadastroSchema,
  querySchema,
} from "./apiSchemas";
import { ApiError } from "./errors";
// Rotas isoladas para adequação ao OpenAPI do ambiente real.
export const endpoints = {
  status: process.env.EXPO_PUBLIC_STATUS_PATH ?? "/status/cpd",
  telemetria: process.env.EXPO_PUBLIC_TELEMETRIA_PATH ?? "/telemetria",
  incidentes: process.env.EXPO_PUBLIC_INCIDENTES_PATH ?? "/incidentes",
  dispositivos: process.env.EXPO_PUBLIC_DISPOSITIVOS_PATH ?? "/dispositivos",
};
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      "Resposta incompatível com o contrato da API.",
      null,
      "validation",
    );
  return result.data;
}
export async function getStatusCpd(
  signal?: AbortSignal,
): Promise<StatusCpdResponse> {
  return parse(
    statusSchema,
    await apiClient("status", endpoints.status, {}, signal),
  );
}
export async function getTelemetria(
  params: TelemetriaQuery,
  signal?: AbortSignal,
): Promise<TelemetriaPonto[]> {
  const checked = querySchema.safeParse(params);
  if (!checked.success)
    throw new ApiError("Filtros de telemetria inválidos.", null, "validation");
  return parse(
    z.array(telemetriaSchema),
    await apiClient(
      "telemetria",
      endpoints.telemetria,
      { ...checked.data },
      signal,
    ),
  );
}
export async function getIncidentes(
  status?: "ABERTO" | "FECHADO",
  signal?: AbortSignal,
): Promise<Incidente[]> {
  return parse(
    z.array(incidenteSchema),
    await apiClient("incidentes", endpoints.incidentes, { status }, signal),
  );
}
export async function getIncidenteDetalhe(
  id: number,
  signal?: AbortSignal,
): Promise<IncidenteDetalhe> {
  if (!Number.isSafeInteger(id) || id < 0)
    throw new ApiError("Identificador inválido.", null, "validation");
  // ID é parâmetro da rota real; query.id é usado somente pelo adaptador de mock.
  return parse(
    detalheSchema,
    await apiClient(
      "detalhe",
      `${endpoints.incidentes.replace(/\/$/, "")}/${id}`,
      { id },
      signal,
    ),
  );
}
export async function getDispositivos(
  signal?: AbortSignal,
): Promise<DispositivoCadastral[]> {
  return parse(
    z.array(cadastroSchema),
    await apiClient("dispositivos", endpoints.dispositivos, {}, signal),
  );
}

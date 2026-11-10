import { z } from "zod";
import type {
  StatusCpdResponse,
  Incidente,
  IncidenteDetalhe,
  TelemetriaPonto,
  DispositivoCadastral,
} from "../types/api";
const date = z.iso.datetime({ offset: true });
const number = z.number().finite();
export const dispositivoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  local: z.string(),
  estado: z.string(),
  ultimo_contato: date,
  temperatura: number,
  umidade: number,
  corrente: number.nullable(),
  bateria: number.nullable(),
  incidentes_abertos: z.number().int().nonnegative(),
  online: z.boolean(),
  alerta_temperatura: z.boolean(),
});
export const statusSchema: z.ZodType<StatusCpdResponse> = z.object({
  status_geral: z.enum([
    "NORMAL",
    "EM_INCIDENTE",
    "ALERTA_TEMPERATURA",
    "OFFLINE",
    "SEM_DADOS",
  ]),
  limite_temperatura: number,
  dispositivos: z.array(dispositivoSchema),
});
export const incidenteSchema: z.ZodType<Incidente> = z.object({
  id: z.number().int().nonnegative(),
  dispositivo_id: z.string(),
  tipo: z.string(),
  status: z.enum(["ABERTO", "FECHADO"]),
  inicio: date,
  fim: date.nullable(),
  duracao_s: number.nonnegative().nullable(),
});
export const telemetriaSchema: z.ZodType<TelemetriaPonto> = z.object({
  dispositivo_id: z.string(),
  timestamp: date,
  temperatura: number,
  umidade: number,
  corrente: number.nullable(),
  bateria: number.nullable(),
});
export const cadastroSchema: z.ZodType<DispositivoCadastral> = z.object({
  id: z.string(),
  nome: z.string(),
  local: z.string(),
});
export const detalheSchema: z.ZodType<IncidenteDetalhe> = z.intersection(
  incidenteSchema,
  z.object({ telemetria: z.array(telemetriaSchema) }),
);
export const querySchema = z
  .object({
    dispositivo: z.string().min(1).optional(),
    de: date.optional(),
    ate: date.optional(),
    limite: z.number().int().positive().optional(),
  })
  .refine(
    (q) => !q.de || !q.ate || Date.parse(q.de) <= Date.parse(q.ate),
    "Data inicial posterior à final.",
  );

export type StatusGeral =
  | "NORMAL"
  | "EM_INCIDENTE"
  | "ALERTA_TEMPERATURA"
  | "OFFLINE"
  | "SEM_DADOS";
export interface DispositivoStatus {
  id: string;
  nome: string;
  local: string;
  estado: string;
  ultimo_contato: string;
  temperatura: number;
  umidade: number;
  corrente: number | null;
  bateria: number | null;
  incidentes_abertos: number;
  online: boolean;
  alerta_temperatura: boolean;
}
export interface StatusCpdResponse {
  status_geral: StatusGeral;
  limite_temperatura: number;
  dispositivos: DispositivoStatus[];
}
export interface Incidente {
  id: number;
  dispositivo_id: string;
  tipo: string;
  status: "ABERTO" | "FECHADO";
  inicio: string;
  fim: string | null;
  duracao_s: number | null;
}
export interface TelemetriaQuery {
  dispositivo?: string;
  de?: string;
  ate?: string;
  limite?: number;
}
// Contratos complementares adotados: validar estes três formatos com o OpenAPI real.
export interface TelemetriaPonto {
  dispositivo_id: string;
  timestamp: string;
  temperatura: number;
  umidade: number;
  corrente: number | null;
  bateria: number | null;
}
export interface DispositivoCadastral {
  id: string;
  nome: string;
  local: string;
}
export interface IncidenteDetalhe extends Incidente {
  telemetria: TelemetriaPonto[];
}

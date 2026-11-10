export type {
  StatusGeral,
  DispositivoStatus,
  StatusCpdResponse,
  Incidente,
  TelemetriaQuery,
  TelemetriaPonto,
  DispositivoCadastral,
  IncidenteDetalhe,
} from "./api";
export type Scenario =
  | "CPD_NORMAL"
  | "ALERTA_TEMPERATURA"
  | "STALE_DATA"
  | "SENSOR_CORRENTE_NULL"
  | "DISPOSITIVO_SEM_DADOS"
  | "ERRO_503_REDE"
  | "INCIDENTE_ABERTO";
export type Severity = "normal" | "warning" | "critical";
export type RootStackParams = {
  Main: undefined;
  Rack: { id: string };
  Incident: { id: number };
};
export type TabParams = {
  Overview: undefined;
  Racks: undefined;
  Incidents: undefined;
  Settings: undefined;
};
export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isRefetching: boolean;
  refetch(): void;
}

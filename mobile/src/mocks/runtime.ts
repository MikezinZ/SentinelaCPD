import type { Scenario } from "../types/domain";
export const scenarios: ReadonlyArray<{ id: Scenario; label: string }> = [
  { id: "CPD_NORMAL", label: "Normal" },
  { id: "ALERTA_TEMPERATURA", label: "Temperatura • 38,5 °C" },
  { id: "STALE_DATA", label: "Dados armazenados • > 15 s" },
  { id: "SENSOR_CORRENTE_NULL", label: "Corrente e bateria indisponíveis" },
  { id: "DISPOSITIVO_SEM_DADOS", label: "Nenhum dispositivo" },
  { id: "ERRO_503_REDE", label: "API indisponível • 503" },
  { id: "INCIDENTE_ABERTO", label: "Queda de energia em andamento" },
];
export const mocksForced = process.env.EXPO_PUBLIC_USE_MOCKS === "true";
export const devMenuEnabled =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_MENU === "true" ||
  mocksForced;
interface Runtime {
  demo: boolean;
  scenario: Scenario;
  revision: number;
  startedAt: number;
}
let state: Runtime = {
  demo: false,
  scenario: "CPD_NORMAL",
  revision: 0,
  startedAt: Date.now(),
};
const listeners = new Set<() => void>();
export const getRuntime = (): Runtime => state;
export const subscribeRuntime = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const usingMocks = (): boolean => mocksForced || state.demo;
export function configureRuntime(
  patch: Partial<Pick<Runtime, "demo" | "scenario">>,
): void {
  state = {
    ...state,
    ...patch,
    revision: state.revision + 1,
    startedAt: Date.now(),
  };
  for (const listener of listeners) listener();
}

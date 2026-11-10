import * as SecureStore from "expo-secure-store";
import { configureRuntime, getRuntime, scenarios } from "../mocks/runtime";
import { API_KEY_STORAGE_KEY } from "./apiClient";
import type { Scenario } from "../types/domain";
const KEY = "sentinela.preferences.v2";
export async function restorePreferences(): Promise<void> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    await SecureStore.deleteItemAsync(KEY);
    return;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "demo" in value &&
    typeof value.demo === "boolean" &&
    "scenario" in value
  ) {
    const scenario = scenarios.find((s) => s.id === value.scenario);
    if (scenario) {
      configureRuntime({ demo: value.demo, scenario: scenario.id });
      return;
    }
  }
  await SecureStore.deleteItemAsync(KEY);
}
export async function updatePreferences(
  demo: boolean,
  scenario: Scenario,
): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ demo, scenario }));
  configureRuntime({ demo, scenario });
}
export async function saveApiKey(key: string): Promise<void> {
  if (key.trim())
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key.trim());
  else await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  const current = getRuntime();
  configureRuntime({ demo: current.demo, scenario: current.scenario });
}

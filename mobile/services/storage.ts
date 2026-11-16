import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const REFRESH_TOKEN_KEY = 'sentinelacpd_refresh_token';
export const DEMO_SCENARIO_KEY = 'sentinelacpd_demo_scenario';

export type SecureStorageAdapter = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const memoryFallback = new Map<string, string>();

export const defaultSecureStorage: SecureStorageAdapter = {
  async getItemAsync(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return memoryFallback.get(key) ?? null;
      }
      const value = await SecureStore.getItemAsync(key);
      return value ?? memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    memoryFallback.set(key, value);
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(key, value);
      }
    } catch {
      // Preserva em memória caso o SecureStore nativo não esteja disponível no ambiente de teste
    }
  },
  async deleteItemAsync(key: string): Promise<void> {
    memoryFallback.delete(key);
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(key);
      }
    } catch {
      // Ignora erro caso chave não exista
    }
  },
};

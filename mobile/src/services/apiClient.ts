import { ApiError, abortError, isAbortError } from "./errors";
import { usingMocks } from "../mocks/runtime";
import { mockRequest, type Operation, type Query } from "../mocks/engine";
export const API_TIMEOUT_MS = 10000;
export const API_KEY_STORAGE_KEY = "sentinela.api-key";
export interface ApiClientOptions {
  baseUrl: string;
  getApiKey(): Promise<string | null>;
  useMocks(): boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  mock?: typeof mockRequest;
}
export function createApiClient(options: ApiClientOptions) {
  return async (
    operation: Operation,
    path: string,
    query: Query = {},
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (signal?.aborted) throw abortError();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const cancellation = new Promise<never>((_, reject) => {
      onAbort = () => {
        reject(abortError());
        controller.abort();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        reject(
          new ApiError("A API não respondeu em 10 segundos.", null, "timeout"),
        );
        controller.abort();
      }, options.timeoutMs ?? API_TIMEOUT_MS);
    });
    const perform = async (): Promise<unknown> => {
      if (options.useMocks())
        return (options.mock ?? mockRequest)(
          operation,
          query,
          controller.signal,
        );
      let url: URL;
      try {
        url = new URL(
          options.baseUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, ""),
        );
      } catch {
        throw new ApiError("URL da API inválida.", null, "configuration");
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new ApiError("URL da API inválida.", null, "configuration");
      for (const [key, value] of Object.entries(query))
        if (value !== undefined && !(operation === "detalhe" && key === "id"))
          url.searchParams.set(key, String(value));
      const key = await options.getApiKey();
      if (controller.signal.aborted) throw abortError();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (key) headers["X-API-Key"] = key;
      const response = await (options.fetcher ?? fetch)(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok)
        throw new ApiError(
          response.status === 503
            ? "API Cloud indisponível. Tente novamente."
            : `Falha na API (HTTP ${response.status}).`,
          response.status,
        );
      try {
        return (await response.json()) as unknown;
      } catch (error: unknown) {
        if (controller.signal.aborted) throw abortError();
        throw new ApiError("Resposta JSON inválida.", null, "validation");
      }
    };
    try {
      return await Promise.race([cancellation, perform()]);
    } catch (error: unknown) {
      if (error instanceof ApiError || isAbortError(error)) throw error;
      throw new ApiError(
        "Não foi possível conectar à API Cloud.",
        null,
        "network",
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  };
}
export const apiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
  useMocks: usingMocks,
  getApiKey: async () => {
    const SecureStore = await import("expo-secure-store");
    return (
      (await SecureStore.getItemAsync(API_KEY_STORAGE_KEY)) ||
      process.env.EXPO_PUBLIC_API_KEY ||
      null
    );
  },
});

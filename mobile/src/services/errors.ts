export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly kind:
      | "http"
      | "network"
      | "timeout"
      | "validation"
      | "configuration" = "http",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function abortError(): Error {
  const error = new Error("Requisição cancelada.");
  error.name = "AbortError";
  return error;
}
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

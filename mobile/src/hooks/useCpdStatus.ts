import type { ApiState } from "../types/domain";
import type { StatusCpdResponse } from "../types/api";
import { getStatusCpd } from "../services/cpdService";
import { useApiQuery } from "./useApiQuery";
export function useCpdStatus(enabled = true): ApiState<StatusCpdResponse> {
  return useApiQuery(getStatusCpd, enabled, 5000);
}

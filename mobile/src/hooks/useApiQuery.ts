import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { getRuntime, subscribeRuntime } from "../mocks/runtime";
import { PollingController, type PollState } from "../utils/PollingController";
import type { ApiState } from "../types/domain";
export function useApiQuery<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  interval = 5000,
): ApiState<T> {
  const runtime = useSyncExternalStore(
    subscribeRuntime,
    getRuntime,
    getRuntime,
  );
  const revision = runtime.revision;
  const empty: PollState<T> = {
    data: null,
    loading: enabled,
    error: null,
    isRefetching: false,
  };
  const [snapshot, setSnapshot] = useState<{
    loader: typeof loader;
    revision: number;
    state: PollState<T>;
  }>({ loader, revision, state: empty });
  const ref = useRef<PollingController<T> | null>(null);
  useEffect(() => {
    const poller = new PollingController(
      loader,
      (state) => setSnapshot({ loader, revision, state }),
      interval,
    );
    ref.current = poller;
    setSnapshot({
      loader,
      revision,
      state: { data: null, loading: enabled, error: null, isRefetching: false },
    });
    poller.setActive(enabled && AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      poller.setActive(enabled && state === "active"),
    );
    return () => {
      subscription.remove();
      poller.dispose();
      if (ref.current === poller) ref.current = null;
    };
  }, [loader, revision, enabled, interval]);
  const refetch = useCallback(() => ref.current?.refetch(), []);
  const state =
    snapshot.revision === revision && snapshot.loader === loader
      ? snapshot.state
      : empty;
  return { ...state, refetch };
}

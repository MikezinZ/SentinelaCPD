import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { subscribeScenario } from '../mocks/server';

type Result<T> = {
  data: T | null;
  error: Error | null;
  busy: boolean;
  refreshing: boolean;
  at: number;
};

const initialState = {
  data: null,
  error: null,
  busy: true,
  refreshing: false,
  at: 0,
};

export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  poll = false
) {
  const [result, setResult] = useState<Result<T> & { key: string }>({
    ...initialState,
    key,
  });
  const [revision, setRevision] = useState(0);
  const manualRefreshRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeScenario(() => {
      setRevision((value) => value + 1);
    });
    return unsubscribe;
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let currentAppState: AppStateStatus = AppState.currentState;

    async function execute() {
      if (disposed || pending) return;
      if (poll && currentAppState !== 'active') return;

      pending = true;
      controller = new AbortController();
      const isManual = manualRefreshRef.current;
      manualRefreshRef.current = false;

      setResult((previous) => {
        const sameKey = previous.key === key;
        return {
          ...(sameKey ? previous : initialState),
          key,
          busy: true,
          refreshing: isManual && sameKey && previous.data !== null,
        };
      });

      try {
        const data = await loadRef.current(controller.signal);
        if (!disposed) {
          setResult({
            key,
            data,
            busy: false,
            refreshing: false,
            error: null,
            at: Date.now(),
          });
        }
        failures = 0;
      } catch (error) {
        failures++;
        if (!disposed && !controller.signal.aborted) {
          setResult((previous) => ({
            ...(previous.key === key ? previous : initialState),
            key,
            busy: false,
            refreshing: false,
            error:
              error instanceof Error
                ? error
                : new Error('Falha na comunicação com o servidor.'),
          }));
        }
      } finally {
        pending = false;
        if (!disposed && poll && currentAppState === 'active') {
          const delay = [5000, 5000, 10000, 30000][Math.min(failures, 3)];
          timer = setTimeout(execute, delay);
        }
      }
    }

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = currentAppState !== 'active';
      currentAppState = nextState;
      if (nextState !== 'active') {
        if (timer) clearTimeout(timer);
        controller?.abort();
      } else if (wasBackground && poll) {
        if (timer) clearTimeout(timer);
        void execute();
      }
    });

    void execute();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      appStateSub.remove();
    };
  }, [key, revision, poll]);

  const reload = useCallback(() => {
    manualRefreshRef.current = true;
    setRevision((value) => value + 1);
  }, []);

  const current = result.key === key ? result : initialState;
  return { ...current, reload };
}

export function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        if (!timer) {
          timer = setInterval(() => setNow(Date.now()), intervalMs);
        }
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}


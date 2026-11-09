import { useEffect, useRef, useState } from 'react';

type Result<T> = { data: T | null; error: Error | null; busy: boolean; at: number };
const initial = { data: null, error: null, busy: true, at: 0 };
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>, poll = false) {
  const [result, setResult] = useState<Result<T> & { key: string }>({ ...initial, key });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("demo:change", refresh);
    return () => window.removeEventListener("demo:change", refresh);
  }, []);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let disposed = false, pending = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>, controller: AbortController;
    async function run() {
      if (disposed || pending || (poll && document.hidden)) return;
      pending = true;
      controller = new AbortController();
      setResult(previous => ({ ...(previous.key === key ? previous : initial), key, busy: true }));
      try {
        const data = await loadRef.current(controller.signal);
        if (!disposed) setResult({ key, data, busy: false, error: null, at: performance.now() });
        failures = 0;
      } catch (error) {
        failures++;
        if (!disposed) setResult(previous => ({ ...(previous.key === key ? previous : initial), key, busy: false, error: error instanceof Error ? error : new Error('Falha na solicitação.') }));
      } finally {
        pending = false;
        if (!disposed && poll && !document.hidden) timer = setTimeout(run, [5000, 5000, 10000, 30000][Math.min(failures, 3)]);
      }
    }
    function visibility() {
      clearTimeout(timer);
      if (!document.hidden) void run();
    }
    void run();
    if (poll) document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [key, revision, poll]);
  return { ...(result.key === key ? result : initial), reload: () => setRevision(value => value + 1) };
}
export function useClock() {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

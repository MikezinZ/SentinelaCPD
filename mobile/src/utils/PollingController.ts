import { isAbortError } from "../services/errors";
export interface PollState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isRefetching: boolean;
}
export interface Scheduler {
  every(callback: () => void, ms: number): () => void;
}
const scheduler: Scheduler = {
  every(callback, ms) {
    const timer = setInterval(callback, ms);
    return () => clearInterval(timer);
  },
};
export class PollingController<T> {
  private state: PollState<T> = {
    data: null,
    loading: false,
    error: null,
    isRefetching: false,
  };
  private controller: AbortController | null = null;
  private generation = 0;
  private active = false;
  private disposed = false;
  private stopTimer: (() => void) | null = null;
  constructor(
    private readonly load: (signal: AbortSignal) => Promise<T>,
    private readonly publish: (state: PollState<T>) => void,
    private readonly interval = 5000,
    private readonly clock: Scheduler = scheduler,
  ) {}
  private update(patch: Partial<PollState<T>>): void {
    this.state = { ...this.state, ...patch };
    this.publish(this.state);
  }
  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      this.refetch();
      this.stopTimer = this.clock.every(this.refetch, this.interval);
    } else {
      this.stopTimer?.();
      this.stopTimer = null;
      this.generation++;
      this.controller?.abort();
      this.controller = null;
      this.update({ loading: false, isRefetching: false });
    }
  }
  refetch = (): void => {
    if (!this.active || this.disposed) return;
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.update({
      loading: this.state.data === null,
      isRefetching: this.state.data !== null,
    });
    void this.load(controller.signal)
      .then((data) => {
        if (generation === this.generation && !this.disposed)
          this.update({ data, error: null });
      })
      .catch((reason: unknown) => {
        if (
          generation === this.generation &&
          !this.disposed &&
          !isAbortError(reason)
        )
          this.update({
            error:
              reason instanceof Error
                ? reason
                : new Error("Falha ao carregar dados."),
          });
      })
      .finally(() => {
        if (generation === this.generation && !this.disposed) {
          this.controller = null;
          this.update({ loading: false, isRefetching: false });
        }
      });
  };
  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.generation++;
    this.stopTimer?.();
    this.stopTimer = null;
    this.controller?.abort();
    this.controller = null;
  }
}

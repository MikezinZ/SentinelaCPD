import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PollingController,
  type PollState,
  type Scheduler,
} from "../src/utils/PollingController";
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function harness() {
  let callback: (() => void) | null = null;
  let stopped = 0;
  const clock: Scheduler = {
    every(fn, ms) {
      assert.equal(ms, 5000);
      callback = fn;
      return () => {
        callback = null;
        stopped++;
      };
    },
  };
  return {
    clock,
    tick: () => callback?.(),
    running: () => callback !== null,
    stopped: () => stopped,
  };
}
test("polling: intervalo para no background, aborta e busca no retorno", async () => {
  const h = harness();
  const signals: AbortSignal[] = [];
  const states: PollState<number>[] = [];
  const poller = new PollingController(
    async (signal) => {
      signals.push(signal);
      return new Promise<number>(() => {});
    },
    (s) => states.push(s),
    5000,
    h.clock,
  );
  poller.setActive(true);
  assert.equal(signals.length, 1);
  assert.equal(h.running(), true);
  h.tick();
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals.length, 2);
  poller.setActive(false);
  assert.equal(h.running(), false);
  assert.equal(signals[1]?.aborted, true);
  h.tick();
  assert.equal(signals.length, 2);
  poller.setActive(true);
  assert.equal(signals.length, 3);
  poller.dispose();
  assert.equal(h.running(), false);
  assert.equal(signals[2]?.aborted, true);
  assert.equal(h.stopped(), 2);
});
test("polling: resposta antiga não sobrescreve resposta nova e refetch preserva dados", async () => {
  const h = harness();
  const resolvers: Array<(n: number) => void> = [];
  let last: PollState<number> = {
    data: null,
    error: null,
    loading: false,
    isRefetching: false,
  };
  const poller = new PollingController(
    async () => new Promise<number>((resolve) => resolvers.push(resolve)),
    (s) => {
      last = s;
    },
    5000,
    h.clock,
  );
  poller.setActive(true);
  assert.equal(last.loading, true);
  poller.refetch();
  resolvers[1]?.(2);
  await flush();
  assert.equal(last.data, 2);
  assert.equal(last.loading, false);
  resolvers[0]?.(1);
  await flush();
  assert.equal(last.data, 2);
  poller.refetch();
  assert.equal(last.isRefetching, true);
  assert.equal(last.data, 2);
  poller.dispose();
  resolvers[2]?.(3);
  await flush();
  assert.equal(last.data, 2);
});
test("polling: erro preserva último sucesso; retry limpa erro", async () => {
  const h = harness();
  let fail = false;
  let last: PollState<number> = {
    data: null,
    error: null,
    loading: false,
    isRefetching: false,
  };
  const poller = new PollingController(
    async () => {
      if (fail) throw new Error("503");
      return 42;
    },
    (s) => {
      last = s;
    },
    5000,
    h.clock,
  );
  poller.setActive(true);
  await flush();
  fail = true;
  h.tick();
  await flush();
  assert.equal(last.data, 42);
  assert.equal(last.error?.message, "503");
  assert.equal(last.isRefetching, false);
  fail = false;
  poller.refetch();
  await flush();
  assert.equal(last.error, null);
  poller.dispose();
});

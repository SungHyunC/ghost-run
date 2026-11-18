// Watchdog SQL executor: wraps a SqlRunner with a timeout and terminate-and-respawn.
// All timing goes through the injected TimerPort; this file reads no clock itself.
import type { SqlExecutor, SqlRequest, SqlResponse, SqlRunner } from './executor';

export interface TimerPort {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const WATCHDOG_STDERR = 'sql statement exceeded the watchdog';

const defaultTimers: TimerPort = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

export function createWatchdogExecutor(opts: {
  spawn: () => SqlRunner;
  timeoutMs?: number;
  timers?: TimerPort;
}): SqlExecutor & { dispose(): void } {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const timers = opts.timers ?? defaultTimers;
  let runner: SqlRunner | null = null;
  let disposed = false;
  let cancelActive: (() => void) | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  function execute(request: SqlRequest): Promise<SqlResponse> {
    if (disposed) return Promise.resolve({ ok: false, stderr: 'sql executor disposed' });
    return new Promise<SqlResponse>((resolve) => {
      let settled = false;
      let handle: unknown;
      const current = runner ?? (runner = opts.spawn());

      const settle = (response: SqlResponse): void => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(handle);
        cancelActive = null;
        resolve(response);
      };
      const abandon = (response: SqlResponse): void => {
        if (settled) return;
        if (runner === current) runner = null;
        try {
          current.terminate();
        } catch {
          // A runner that fails to terminate is already dropped.
        }
        settle(response);
      };

      cancelActive = () => {
        abandon({ ok: false, stderr: 'sql executor disposed' });
      };
      handle = timers.setTimeout(() => {
        abandon({ ok: false, stderr: WATCHDOG_STDERR, watchdog: true });
      }, timeoutMs);

      let pending: Promise<SqlResponse>;
      try {
        pending = current.run(request);
      } catch (e) {
        pending = Promise.reject(e);
      }
      pending.then(
        (response) => {
          settle(response);
        },
        (e: unknown) => {
          if (settled) return;
          if (runner === current) runner = null;
          settle({ ok: false, stderr: `Error: ${e instanceof Error ? e.message : String(e)}` });
        },
      );
    });
  }

  return {
    run(request: SqlRequest): Promise<SqlResponse> {
      const next = tail.then(() => execute(request));
      tail = next.catch(() => undefined);
      return next;
    },
    dispose(): void {
      disposed = true;
      cancelActive?.();
      const r = runner;
      runner = null;
      r?.terminate();
    },
  };
}

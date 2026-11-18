// Shared property-based test configuration (design.md, "PBT configuration").
// GHOST_PBT_MODE=nightly -> 10 000 runs, no time limit.
// Anything else (unset or 'short') -> 100 runs, 60 s limit.
// tsconfig has `types: []`, so `process` is not declared; read it via globalThis.

const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

export const PBT_MODE: 'short' | 'nightly' =
  env?.['GHOST_PBT_MODE'] === 'nightly' ? 'nightly' : 'short';

export const NUM_RUNS: number = PBT_MODE === 'nightly' ? 10_000 : 100;

/** Per-test timeout in ms; undefined means no limit (vitest: pass 0 to disable). */
export const PBT_TIMEOUT: number | undefined =
  PBT_MODE === 'nightly' ? undefined : 60_000;

/**
 * Returns an async function that, every `every` calls, lets the event loop run once.
 * A synchronous property that runs longer than vitest's 60 s RPC timeout otherwise blocks the worker
 * and vitest reports `Timeout calling "onTaskUpdate"`. Use with `fc.asyncProperty`; it changes
 * neither the number of runs nor the generators or assertions.
 */
export function makeYielder(every = 25): () => Promise<void> {
  const timers = globalThis as unknown as {
    setTimeout: (fn: () => void, ms: number) => unknown;
  };
  let calls = 0;
  return async () => {
    calls++;
    if (calls % every === 0) await new Promise<void>((resolve) => timers.setTimeout(resolve, 0));
  };
}

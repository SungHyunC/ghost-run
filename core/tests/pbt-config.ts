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

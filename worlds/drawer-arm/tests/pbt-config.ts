// Shared property-based test configuration for the drawer-arm world.
// GHOST_PBT_MODE=nightly -> 10 000 runs for pure properties, no time limit.
// Anything else (unset or 'short') -> 100 runs, 60 s limit.
// Engine-bound properties use ENGINE_RUNS: a fixed 20 until task 7.7 writes
// tests/pbt-budget.json ({ "shortRuns": <n> }), then that value in a short run.
// tsconfig has `types: []`, so `process` is not declared; read it via globalThis.
import budget from './pbt-budget.json' with { type: 'json' };

const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

export const PBT_MODE: 'short' | 'nightly' =
  env?.['GHOST_PBT_MODE'] === 'nightly' ? 'nightly' : 'short';

export const NUM_RUNS: number = PBT_MODE === 'nightly' ? 10_000 : 100;

/** Per-test timeout in ms; undefined means no limit (vitest: pass 0 to disable). */
export const PBT_TIMEOUT: number | undefined =
  PBT_MODE === 'nightly' ? undefined : 60_000;

/** Short-run example count for engine-bound properties (fixed 20 until measured). */
export const SHORT_RUNS: number =
  typeof budget.shortRuns === 'number' ? budget.shortRuns : 20;

export const ENGINE_RUNS: number = PBT_MODE === 'nightly' ? NUM_RUNS : SHORT_RUNS;

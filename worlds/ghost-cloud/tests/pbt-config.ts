// Shared property-based test configuration.
// GHOST_PBT_MODE=nightly -> 10 000 runs, no time limit.
// Anything else (unset or 'short') -> 100 runs, 60 s limit.
// tsconfig has `types: ["node"]`, but the config reads the environment through globalThis anyway.

const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

export const PBT_MODE: 'short' | 'nightly' =
  env?.['GHOST_PBT_MODE'] === 'nightly' ? 'nightly' : 'short';

export const NUM_RUNS: number = PBT_MODE === 'nightly' ? 10_000 : 100;

/** Per-test timeout in ms; 0 means no limit in vitest. */
export const PBT_TIMEOUT: number = PBT_MODE === 'nightly' ? 0 : 60_000;

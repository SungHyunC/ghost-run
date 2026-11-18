// Shared property-based test configuration for ui (design.md, "PBT configuration").
// Follows core/tests/pbt-config.ts; core test files cannot be imported from this package.
// GHOST_PBT_MODE=nightly -> 10 000 / 500 runs, no time limit. Anything else -> 100 / 25 runs, 60 s limit.
// GHOST_PBT_SEED=<integer> replays a run. tsconfig has `types: []`, so `process` is read via globalThis.

const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

export const PBT_MODE: 'short' | 'nightly' =
  env?.['GHOST_PBT_MODE'] === 'nightly' ? 'nightly' : 'short';

/** Runs for model and static properties. */
export const NUM_RUNS_FULL: number = PBT_MODE === 'nightly' ? 10_000 : 100;

/** Runs for properties that render through the DOM. */
export const NUM_RUNS_DOM: number = PBT_MODE === 'nightly' ? 500 : 25;

/** Per-test timeout in ms; undefined means no limit. */
export const PBT_TIMEOUT: number | undefined = PBT_MODE === 'nightly' ? undefined : 60_000;

function resolveSeed(): number {
  const raw = env?.['GHOST_PBT_SEED'];
  if (raw !== undefined && /^-?\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isSafeInteger(n)) return n | 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

export const PBT_SEED: number = resolveSeed();

// Printed once per module load so a failing run can be replayed with GHOST_PBT_SEED.
console.log(`PBT seed=${PBT_SEED}`);

export type PbtKind = 'full' | 'dom';

export interface PbtParams {
  readonly numRuns: number;
  readonly seed: number;
}

/** fast-check parameters for a property of the given kind. */
export function params(kind: PbtKind = 'full'): PbtParams {
  return { numRuns: kind === 'dom' ? NUM_RUNS_DOM : NUM_RUNS_FULL, seed: PBT_SEED };
}

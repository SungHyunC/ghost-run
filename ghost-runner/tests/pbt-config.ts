// PBT run profiles (tasks.md, Conventions: Run profiles).
// GHOST_PBT_MODE: `save` = 20 runs, `explicit` (default) = 100, `nightly` = 10 000.

export type PbtMode = 'save' | 'explicit' | 'nightly';

const rawMode = process.env['GHOST_PBT_MODE'];

export const PBT_MODE: PbtMode =
  rawMode === 'save' || rawMode === 'nightly' ? rawMode : 'explicit';

const RUNS: Record<PbtMode, number> = { save: 20, explicit: 100, nightly: 10_000 };

export const NUM_RUNS: number = RUNS[PBT_MODE];

/** Whole-run budget on save (ms). */
export const SAVE_RUN_LIMIT_MS = 60_000;

/** fast-check `interruptAfterTimeLimit` for Docker-backed properties on save. */
export const DOCKER_INTERRUPT_MS = 25_000;

/** Docker-backed properties run with a pool of 2 slots. */
export const DOCKER_POOL_SLOTS = 2;

/** Fixture trees for Docker-backed properties have at most this many files. */
export const MAX_FIXTURE_FILES = 50;

/** Per-property fast-check time limit; undefined means unlimited. */
export function interruptAfterTimeLimit(docker: boolean): number | undefined {
  if (PBT_MODE !== 'save') return undefined;
  return docker ? DOCKER_INTERRUPT_MS : SAVE_RUN_LIMIT_MS;
}

/** Vitest per-test timeout in ms; 0 disables the limit. */
export function testTimeoutMs(docker: boolean): number {
  if (PBT_MODE === 'nightly') return 0;
  return docker ? DOCKER_INTERRUPT_MS + 30_000 : SAVE_RUN_LIMIT_MS;
}

/** Options to spread into `fc.assert(prop, pbtParams(docker))`. */
export function pbtParams(docker = false): {
  numRuns: number;
  interruptAfterTimeLimit?: number;
  markInterruptAsFailure: false;
} {
  const limit = interruptAfterTimeLimit(docker);
  return {
    numRuns: NUM_RUNS,
    ...(limit === undefined ? {} : { interruptAfterTimeLimit: limit }),
    markInterruptAsFailure: false,
  };
}

/** `partial` when fewer than 20 examples completed (interrupted run). */
export function isPartial(completedRuns: number): boolean {
  return completedRuns < 20;
}

// Shared property-test configuration for the kiro-integration suite.
// GHOST_PBT_MODE=nightly selects the long run; anything else is the short run.

/** @param {Record<string, string | undefined>} [env] */
export function pbtMode(env = process.env) {
  return env.GHOST_PBT_MODE === 'nightly' ? 'nightly' : 'short';
}

/** @param {Record<string, string | undefined>} [env] */
export function numRunsFor(env = process.env) {
  return pbtMode(env) === 'nightly' ? 10_000 : 100;
}

export const NUM_RUNS = numRunsFor();

/** Per-file timeout in the short run, in milliseconds. */
export const FILE_TIMEOUT_MS = 60_000;

/** fast-check parameters shared by every property test (the seed is printed on failure). */
export const FC_PARAMS = Object.freeze({ numRuns: NUM_RUNS, verbose: 1 });

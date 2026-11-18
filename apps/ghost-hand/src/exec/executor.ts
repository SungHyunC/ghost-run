import type { VariantJob, VariantOutcome } from '@ghost-run/drawer-arm';

export type { VariantJob, VariantOutcome };

/**
 * Runs variant jobs. `run` resolves with one outcome per job, stored at `results[job.index]` (indices are
 * 0..n-1), so neither the finishing order nor the worker count can change the result.
 */
export interface VariantExecutor {
  run(jobs: readonly VariantJob[]): Promise<readonly VariantOutcome[]>;
  dispose(): void;
}

/** An outcome for a job that could not be run at all. */
export function failedOutcome(job: VariantJob, message: string): VariantOutcome {
  return {
    index: job.index,
    params: job.params,
    finalDrawerM: 0,
    monitors: {
      maxContactForceN: 0,
      touched: [],
      jointLimitExceeded: false,
      jointLimitSteps: 0,
      selfCollisionOccurred: false,
      selfCollisionSteps: 0,
    },
    failedSteps: [],
    firstTouch: {},
    trajectoryHash: '',
    engineError: message,
  };
}

/** clamp(hardwareConcurrency - 1, 1, 4); a missing or invalid value counts as 1 core, so one worker. */
export function poolSizeFor(hardwareConcurrency: number | undefined): number {
  const hc = typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency) ? Math.floor(hardwareConcurrency) : 1;
  return Math.min(4, Math.max(1, hc - 1));
}

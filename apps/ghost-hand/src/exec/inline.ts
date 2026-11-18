import { runVariantJob } from '@ghost-run/drawer-arm';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { failedOutcome } from './executor';
import type { VariantExecutor, VariantJob, VariantOutcome } from './executor';

export type RunJob = (world: GhostHandWorld, job: VariantJob) => Promise<VariantOutcome>;

/**
 * Runs the jobs one after another on the calling thread, in a world made by `factory`. The factory must return a
 * world of its own, never the reference world: variant runs release traces and must not touch the live state.
 * The world is created on first use and disposed by `dispose`.
 */
export function createInlineExecutor(
  factory: () => Promise<GhostHandWorld>,
  runJob: RunJob = runVariantJob,
): VariantExecutor {
  let world: Promise<GhostHandWorld> | undefined;
  let disposed = false;
  return {
    async run(jobs) {
      if (disposed) throw new Error('executor disposed');
      world ??= factory();
      const w = await world;
      const results: VariantOutcome[] = [];
      for (const job of jobs) {
        try {
          results[job.index] = await runJob(w, job);
        } catch (error) {
          results[job.index] = failedOutcome(job, error instanceof Error ? error.message : String(error));
        }
      }
      return results;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const pending = world;
      world = undefined;
      if (pending !== undefined) void pending.then((w) => w.dispose(), () => undefined);
    },
  };
}

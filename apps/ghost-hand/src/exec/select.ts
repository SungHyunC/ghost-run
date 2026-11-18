import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { poolSizeFor } from './executor';
import type { VariantExecutor } from './executor';
import { createInlineExecutor } from './inline';
import { createPoolExecutor } from './pool';
import type { WorkerLike } from './pool';

export interface SelectOptions {
  /** Makes a world of its own (never the reference world). */
  readonly factory: () => Promise<GhostHandWorld>;
  /** Starts one sim worker; without it the inline executor is used. */
  readonly spawn?: () => WorkerLike;
  readonly hardwareConcurrency?: number;
  /** Test overrides; the defaults read the environment. */
  readonly hasWorker?: boolean;
  readonly isNode?: boolean;
}

interface EnvView {
  Worker?: unknown;
  process?: { versions?: { node?: string } };
  navigator?: { hardwareConcurrency?: number };
}

/** Pool in a browser with Worker; inline without Worker and always in Node. */
export function createExecutor(options: SelectOptions): VariantExecutor {
  const env = globalThis as unknown as EnvView;
  const isNode = options.isNode ?? env.process?.versions?.node !== undefined;
  const hasWorker = options.hasWorker ?? typeof env.Worker !== 'undefined';
  const inline = createInlineExecutor(options.factory);
  if (isNode || !hasWorker || options.spawn === undefined) return inline;
  const pool = createPoolExecutor({
    size: poolSizeFor(options.hardwareConcurrency ?? env.navigator?.hardwareConcurrency),
    spawn: options.spawn,
    retry: (job) => inline.run([job]).then((r) => r[job.index] ?? r[0]!),
  });
  return {
    run: (jobs) => pool.run(jobs),
    dispose() {
      pool.dispose();
      inline.dispose();
    },
  };
}

import { failedOutcome } from './executor';

const MAX_WORKERS = 4;
import type { VariantExecutor, VariantJob, VariantOutcome } from './executor';

/** The part of a Web Worker that the pool uses. */
export interface WorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface PoolOptions {
  /** Requested worker count; the pool never uses more than 4 (see poolSizeFor in executor.ts) or more than there are jobs. */
  readonly size: number;
  readonly spawn: () => WorkerLike;
  /** Runs one job on the calling thread: the single retry after a worker error or messageerror. */
  readonly retry?: (job: VariantJob) => Promise<VariantOutcome>;
}

/** Wire format of a worker reply. */
export interface WorkerReply {
  readonly outcome: VariantOutcome;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

function call(worker: WorkerLike, job: VariantJob): Promise<VariantOutcome> {
  return new Promise<VariantOutcome>((resolve, reject) => {
    worker.onmessage = (event) => resolve((event.data as WorkerReply).outcome);
    worker.onerror = (event) => reject(new Error(`worker error: ${messageOf(event)}`));
    worker.onmessageerror = () => reject(new Error('worker messageerror'));
    try {
      worker.postMessage({ job });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * A queue served by at most min(size, 4, jobs) workers. Each outcome is written to `results[job.index]`; the
 * order of arrival is never used. A job whose worker fails is retried once inline, then reported with
 * `engineError`.
 */
export function createPoolExecutor(options: PoolOptions): VariantExecutor {
  const live = new Set<WorkerLike>();
  let disposed = false;

  async function retryOnce(job: VariantJob, cause: unknown): Promise<VariantOutcome> {
    if (options.retry === undefined) return failedOutcome(job, messageOf(cause));
    try {
      return await options.retry(job);
    } catch (error) {
      return failedOutcome(job, messageOf(error));
    }
  }

  return {
    async run(jobs) {
      if (disposed) throw new Error('executor disposed');
      const results: VariantOutcome[] = [];
      const queue = [...jobs];
      const lanes = Math.min(Math.max(1, Math.floor(options.size)), MAX_WORKERS, jobs.length);

      const open = (): WorkerLike | undefined => {
        try {
          const w = options.spawn();
          live.add(w);
          return w;
        } catch {
          return undefined;
        }
      };
      const close = (w: WorkerLike): void => {
        live.delete(w);
        try {
          w.terminate();
        } catch {
          // already gone
        }
      };

      const lane = async (): Promise<void> => {
        let worker = open();
        while (worker !== undefined && queue.length > 0) {
          const job = queue.shift() as VariantJob;
          try {
            results[job.index] = await call(worker, job);
          } catch (error) {
            close(worker);
            results[job.index] = await retryOnce(job, error);
            worker = open();
          }
        }
        if (worker !== undefined) close(worker);
      };

      await Promise.all(Array.from({ length: lanes }, lane));
      // Only reached with leftovers when no worker could be started.
      while (queue.length > 0) {
        const job = queue.shift() as VariantJob;
        results[job.index] = await retryOnce(job, new Error('worker could not be started'));
      }
      return results;
    },
    dispose() {
      disposed = true;
      for (const w of live) {
        try {
          w.terminate();
        } catch {
          // ignore
        }
      }
      live.clear();
    },
  };
}

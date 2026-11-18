/**
 * Sim worker: a message loop around runVariantJob. One world per worker, created on the first job and reused
 * (the world keeps no state between jobs). Single-thread build only; no SharedArrayBuffer.
 */
import { createGhostHandWorld, runVariantJob } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantJob } from '@ghost-run/drawer-arm';
import { failedOutcome } from '../exec/executor';

interface WorkerScope {
  onmessage: ((event: { readonly data: { readonly job: VariantJob } }) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
let world: Promise<GhostHandWorld> | undefined;

scope.onmessage = (event) => {
  const { job } = event.data;
  world ??= createGhostHandWorld({ recordFrames: job.recordFrames });
  void world
    .then((w) => runVariantJob(w, job))
    .then((outcome) => {
      const frames = outcome.frames;
      scope.postMessage({ outcome }, frames === undefined ? [] : [frames.buffer as ArrayBuffer]);
    })
    .catch((error: unknown) => {
      world = undefined;
      scope.postMessage({ outcome: failedOutcome(job, error instanceof Error ? error.message : String(error)) });
    });
};

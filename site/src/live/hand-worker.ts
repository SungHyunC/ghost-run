// The Ghost Hand live run, inside a dedicated module worker that the site creates.
// MuJoCo's embind glue builds functions from strings at run time, which the page policy forbids
// ('unsafe-eval' is not allowed). The worker script is served from /assets/, which carries no page
// policy, so the whole run lives here: world creation, runGhostHand, and the fingerprints.
// The page posts the slider values and gets a LiveAnswer back as plain data.

import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import wardsText from '../../../worlds/drawer-arm/wards.yaml?raw';
import variantConfigText from '../../../worlds/drawer-arm/variant-config.json?raw';
import { probeCapabilities } from '../../../apps/ghost-hand/src/capabilities';
import { createExecutor } from '../../../apps/ghost-hand/src/exec/select';
import type { WorkerLike } from '../../../apps/ghost-hand/src/exec/pool';
import { createHandEngine } from './hand';
import type { HandWorkerReply, HandWorkerRequest } from './hand-protocol';
import type { LiveAnswer, LiveEngine } from './types';

interface WorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

const scope = globalThis as unknown as WorkerScope;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const createWorld = (options: { recordFrames: boolean }) => createGhostHandWorld({ recordFrames: options.recordFrames });

let engine: LiveEngine | undefined;

function ensureEngine(): LiveEngine {
  engine ??= createHandEngine({
    createWorld,
    createExecutor: () =>
      createExecutor({
        factory: () => createWorld({ recordFrames: false }),
        spawn: () =>
          new Worker(new URL('../../../apps/ghost-hand/src/worker/sim-worker.ts', import.meta.url), {
            type: 'module',
          }) as unknown as WorkerLike,
      }),
    wardsText,
    variantConfigText,
    capabilities: probeCapabilities(),
  });
  return engine;
}

function reply(id: number, answer: LiveAnswer): void {
  const message: HandWorkerReply = { type: 'answer', id, answer };
  scope.postMessage(message);
}

scope.onmessage = (event) => {
  const request = event.data as HandWorkerRequest;
  if (request.type === 'dispose') {
    engine?.dispose();
    scope.close();
    return;
  }
  const { id, speed, force, distance } = request;
  let live: LiveEngine;
  try {
    live = ensureEngine();
  } catch (error) {
    reply(id, { status: 'failed', cause: 'internal', detail: messageOf(error) });
    return;
  }
  live.run({ world: 'hand', speed, force, distance }).then(
    (answer) => {
      reply(id, answer);
    },
    (error: unknown) => {
      reply(id, { status: 'failed', cause: 'run', detail: messageOf(error) });
    },
  );
};

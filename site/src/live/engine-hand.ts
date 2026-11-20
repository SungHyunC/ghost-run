// Wiring of the Hand chunk: the page-side proxy and the module worker that holds the whole run.
// The worker script is the only place MuJoCo is imported for the landing page. No other file imports
// this module statically.

import { createHandProxy } from './hand-proxy';
import type { HandWorkerLike } from './hand-proxy';
import type { LiveEngine } from './types';

export function createHandEngine(): Promise<LiveEngine> {
  return new Promise((resolve) => {
    resolve(
      createHandProxy({
        spawn: () => new Worker(new URL('./hand-worker.ts', import.meta.url), { type: 'module' }) as unknown as HandWorkerLike,
      }),
    );
  });
}

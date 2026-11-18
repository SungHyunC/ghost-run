import type { Change } from '../../src/index.js';
import type { DeterministicTestAdapter } from '../../verify.js';
import { KeyValueWorld } from './key-value-world.js';
import type { KVAction, KVState } from './key-value-world.js';

/** Runs actions against a live (non-copied) KeyValueWorld and accumulates Changes. */
export const kvTestAdapter: DeterministicTestAdapter<KVState, KVAction> = {
  apply(state, actions) {
    const live = new KeyValueWorld(state);
    const changes: Change[] = [];
    for (const a of actions) {
      changes.push(...live.applyLive(a));
    }
    return changes;
  },
};

import type { Change, Effect, FingerprintResult, Scene, Snapshot, World } from '@ghost-run/core';
import { applyAction } from './apply.js';
import { diffStates } from './diff.js';
import { effectsOutsideAction } from './effects.js';
import { fingerprintState } from './fingerprint.js';
import { createFixture } from './fixture.js';
import { renderScene } from './scene.js';
import type { Action, CloudState } from './types.js';

export interface GhostCloudOptions {
  /** A store to use as Reality. Tests inject one to inspect it. Defaults to the fixed fixture. */
  readonly reality?: CloudState;
}

export type GhostCloudWorld = World<CloudState, Action>;

export function createGhostCloudWorld(options?: GhostCloudOptions): GhostCloudWorld {
  const reality: CloudState = options?.reality ?? createFixture();
  let counter = 0;
  const nextId = (): string => `gc-${++counter}`;

  return {
    async snapshot(): Promise<Snapshot<CloudState>> {
      return { id: nextId(), state: structuredClone(reality), result: { success: true } };
    },

    async step(s: Snapshot<CloudState>, a: Action): Promise<Snapshot<CloudState>> {
      const r = applyAction(s.state, a);
      if (r.ok) return { id: nextId(), state: r.state, result: { success: true } };
      return { id: nextId(), state: structuredClone(s.state), result: { success: false, error: r.error } };
    },

    diff(before: Snapshot<CloudState>, after: Snapshot<CloudState>): Change[] {
      return diffStates(before.state, after.state);
    },

    render(s: Snapshot<CloudState>): Scene {
      return renderScene(s.state);
    },

    fingerprint(): Promise<FingerprintResult> {
      return fingerprintState(reality);
    },

    effectsOutside(a: Action): Effect[] {
      return effectsOutsideAction(a);
    },
  };
}

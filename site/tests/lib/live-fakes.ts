// Shared by the DOM tests of the live section: loaders that fail, and a helper that drains the controller's promises.
import { act } from '@testing-library/react';
import type { RunsFile, WorldId } from '../../src/data/types';
import { PRESETS } from '../../src/live/presets';
import type { LightEngines, LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../../src/live/types';

/** Both chunks fail to load: every run takes the recorded fallback. */
export const failingLoaders: LiveLoaders = {
  light: () => Promise.reject(new Error('no light engine in this test')),
  hand: () => Promise.reject(new Error('no hand engine in this test')),
};

/** Lets the controller's awaited steps finish (microtasks only; fake timers stay untouched). */
export async function drain(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
}

/** Loaders whose engines answer every Preset (and Fixed_Plan) with the committed record, and a typed input as unsupported. */
export function recordedLoaders(runs: RunsFile): { loaders: LiveLoaders; calls: LiveInput[] } {
  const calls: LiveInput[] = [];
  const engine = (world: WorldId): LiveEngine => ({
    world,
    warm: () => Promise.resolve(),
    dispose: () => undefined,
    run: (input) => {
      calls.push(input);
      const w = runs.worlds[world];
      for (const p of PRESETS[world]) {
        const rec = w.presets.find((r) => r.id === p.id);
        if (rec === undefined) continue;
        const plan = input === p.input ? rec.plan : input === p.fix ? rec.fixed : null;
        if (plan !== null) return Promise.resolve<LiveAnswer>({ status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan } });
      }
      return Promise.resolve<LiveAnswer>({ status: 'unsupported', reason: 'command not supported', stepIndexes: [0] });
    },
  });
  const shell = engine('shell');
  const cloud = engine('cloud');
  const hand = engine('hand');
  return {
    calls,
    loaders: {
      light: () => Promise.resolve<LightEngines>({ shell, cloud, dispose: () => undefined }),
      hand: () => Promise.resolve(hand),
    },
  };
}

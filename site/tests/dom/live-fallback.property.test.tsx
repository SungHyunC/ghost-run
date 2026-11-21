import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldId } from '../../src/config';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { useLiveWalkthrough } from '../../src/engine/useLiveWalkthrough';
import { toRecordedWalkRecord } from '../../src/live/classify';
import { PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveEngine, LiveLoaders } from '../../src/live/types';
import { drain } from '../lib/live-fakes';
import { NUM_RUNS } from '../pbt-config';

// Feature: site-live, Property L10: Failure keeps the page working
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

const runs = runsJson as unknown as RunsFile;
const WORLDS: WorldId[] = ['shell', 'hand', 'cloud'];
type Failure = 'load' | 'throw' | 'timeout' | 'internal';
const FAILURES: Failure[] = ['load', 'throw', 'timeout', 'internal'];

/** A scheduler that never fires: the property is about what the page shows, not about timing. */
const idleScheduler: Scheduler = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

function failingEngine(world: WorldId, kind: Failure): LiveEngine & { dispose: ReturnType<typeof vi.fn> } {
  return {
    world,
    warm: () => Promise.resolve(),
    run: (): Promise<LiveAnswer> => {
      if (kind === 'throw') return Promise.reject(new Error('boom'));
      return Promise.resolve({ status: 'failed', cause: kind === 'timeout' ? 'timeout' : 'internal' });
    },
    dispose: vi.fn(),
  };
}

function loadersFor(kind: Failure): LiveLoaders {
  if (kind === 'load') {
    return {
      light: () => Promise.reject(new Error('no light engine')),
      hand: () => Promise.reject(new Error('no hand engine')),
    };
  }
  return {
    light: () =>
      Promise.resolve({ shell: failingEngine('shell', kind), cloud: failingEngine('cloud', kind), dispose: vi.fn() }),
    hand: () => Promise.resolve(failingEngine('hand', kind)),
  };
}

afterEach(() => {
  cleanup();
});

describe('Property L10: failure keeps the page working', () => {
  it('a failed Preset run shows its recorded run with the recorded badge, for every world, failure kind, and Preset', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...WORLDS),
        fc.constantFrom(...FAILURES),
        fc.nat(2),
        async (world, kind, index) => {
          const { result } = renderHook(() =>
            useLiveWalkthrough({ runs, loaders: loadersFor(kind), scheduler: idleScheduler, visibility: { near: false, started: false, active: false } }),
          );
          const list = PRESETS[world];
          const preset = list[index % list.length];
          if (preset === undefined) throw new Error('no Preset');
          act(() => {
            result.current.pickWorld(world);
          });
          await drain();
          act(() => {
            result.current.pickPreset(preset.id);
          });
          await drain();

          const recorded = runs.worlds[world].presets.find((p) => p.id === preset.id);
          if (recorded === undefined) throw new Error('no recorded Preset');
          expect(result.current.displayed).toBe('recorded');
          expect(result.current.message?.kind).toBe('recorded');
          expect(result.current.busy).toBe(false);
          expect(result.current.walk.record).toEqual(toRecordedWalkRecord(runs.worlds[world], recorded));
          expect(result.current.walk.record.source).toBe('recorded');
          cleanup();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a failed run of Visitor_Input shows no run and leaves the box as the visitor left it', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...WORLDS),
        fc.constantFrom(...FAILURES),
        fc.stringMatching(/^[a-z]{3,12}$/),
        fc.record({
          speed: fc.integer({ min: 1, max: 11 }).map((n) => n * 0.05),
          force: fc.integer({ min: 2, max: 40 }),
          distance: fc.integer({ min: 2, max: 25 }).map((n) => n / 100),
        }),
        async (world, kind, word, values) => {
          const { result } = renderHook(() =>
            useLiveWalkthrough({ runs, loaders: loadersFor(kind), scheduler: idleScheduler, visibility: { near: false, started: false, active: false } }),
          );
          act(() => {
            result.current.pickWorld(world);
          });
          await drain();
          // A plan that is not a Preset. Hand values are nudged off the three Presets.
          const typed = `ls ${word}-zz`;
          const sliders = { speed: Math.round(values.speed * 100) / 100, force: values.force, distance: values.distance };
          const isPresetValues = PRESETS.hand.some(
            (p) => p.input.world === 'hand' && p.input.speed === sliders.speed && p.input.force === sliders.force && p.input.distance === sliders.distance,
          );
          if (isPresetValues) sliders.force = sliders.force === 40 ? 39 : sliders.force + 1;
          act(() => {
            if (world === 'hand') result.current.setSliders(sliders);
            else result.current.setText(world === 'cloud' ? `delete ${word}-zz` : typed);
          });
          const recordBefore = result.current.walk.record;
          const textBefore = result.current.text[world === 'hand' ? 'shell' : world];
          const slidersBefore = result.current.sliders;
          act(() => {
            result.current.run();
          });
          await drain();

          expect(result.current.known).toBeNull();
          expect(result.current.message?.kind).toBe('failed');
          expect(result.current.busy).toBe(false);
          expect(result.current.walk.record).toBe(recordBefore);
          expect(result.current.text[world === 'hand' ? 'shell' : world]).toBe(textBefore);
          expect(result.current.sliders).toEqual(slidersBefore);
          // The record on screen is the Preset fallback of the world pick, never a live one.
          expect(result.current.displayed).toBe('recorded');
          cleanup();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('"live" is never displayed when every engine fails', async () => {
    const { result } = renderHook(() =>
      useLiveWalkthrough({ runs, loaders: loadersFor('throw'), scheduler: idleScheduler, visibility: { near: false, started: false, active: false } }),
    );
    for (const world of WORLDS) {
      act(() => {
        result.current.pickWorld(world);
      });
      await drain();
      expect(result.current.displayed).not.toBe('live');
    }
  });
});

// @vitest-environment jsdom
// Feature: site, Property 6 (jump and play agree; the fold case is Property L7 in live-walk.property.test.ts)
// Validates: Requirements 11.4, 11.7, 11.8, 16.3, 16.4
import { act, cleanup, renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import type { WalkRuns, RunsFile } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { settle } from '../../src/engine/script';
import type { WalkState } from '../../src/engine/types';
import { useWalk } from '../../src/engine/useWalk';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const runs = toWalkRuns(runsJson as unknown as RunsFile);

interface Pending {
  id: number;
  ms: number;
  fn: () => void;
}

/** A recording scheduler with a virtual clock: nothing runs until the test advances it. */
function recording() {
  let next = 1;
  const pending = new Map<number, Pending>();
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = next++;
      pending.set(id, { id, ms, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  return {
    scheduler,
    /** Fires, in time order, every pending timer whose delay is at most `upTo`. */
    runUntil(upTo: number) {
      const due = [...pending.values()]
        .filter((p) => p.ms <= upTo)
        .sort((a, b) => a.ms - b.ms || a.id - b.id);
      for (const p of due) {
        if (pending.delete(p.id)) p.fn();
      }
    },
    drain() {
      this.runUntil(Number.POSITIVE_INFINITY);
    },
  };
}

afterEach(() => {
  cleanup();
});

const worldArb = fc.constantFrom('shell' as const, 'hand' as const, 'cloud' as const);
/** The hook view as a plain WalkState (drops the derived `ward` field). */
function asState(view: WalkState & { ward?: unknown }): WalkState {
  const { ward: _w, ...rest } = view;
  void _w;
  return rest;
}

function mount(rec: ReturnType<typeof recording>) {
  return renderHook(() => useWalk({ initial: runs.worlds.shell, scheduler: rec.scheduler }));
}

describe('Property 6: jump and play agree', () => {
  // The case "folding steps 0..n equals playing" moved to live-walk.property.test.ts (Property L7).
  it('settle(world, 4), jump(4) drained, and play drained all give the same state', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const record = runs.worlds[world];

        const recPlay = recording();
        const a = mount(recPlay);
        act(() => {
          a.result.current.controls.show(runs.worlds[world]);
        });
        act(() => {
          recPlay.drain();
        });
        const played = asState(a.result.current.view);
        a.unmount();

        const recJump = recording();
        const b = mount(recJump);
        act(() => {
          b.result.current.controls.show(runs.worlds[world]);
        });
        act(() => {
          b.result.current.controls.jump(4);
        });
        act(() => {
          recJump.drain();
        });
        const jumped = asState(b.result.current.view);
        b.unmount();

        expect(jumped).toEqual(played);
        expect(settle(record, 4)).toEqual(played);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);
});

// @vitest-environment jsdom
// Feature: site, Property 6: Settling equals playing through
// Validates: Requirements 11.4, 11.7, 11.8, 16.3, 16.4
import { act, cleanup, renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { initialState, reduceWalk } from '../../src/engine/reducer';
import type { Scheduler } from '../../src/engine/scheduler';
import { buildScript, settle, STEP_START } from '../../src/engine/script';
import type { WalkState } from '../../src/engine/types';
import { useWalkthrough } from '../../src/engine/useWalkthrough';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const runs = runsJson as unknown as RunsFile;

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
const stepArb = fc.integer({ min: 0, max: 4 });

/** The walk state without the fields that settling and playing legitimately set differently. */
function core(s: WalkState): Omit<WalkState, 'narration' | 'term'> & { term: Omit<WalkState['term'], 'typed'> } {
  const { narration: _n, term, ...rest } = s;
  const { typed: _t, ...termRest } = term;
  void _n;
  void _t;
  return { ...rest, term: termRest };
}

/** The hook view as a plain WalkState (drops the derived `ward` field). */
function asState(view: WalkState & { ward?: unknown }): WalkState {
  const { ward: _w, ...rest } = view;
  void _w;
  return rest;
}

function foldSteps(world: 'shell' | 'hand' | 'cloud', upTo: number): WalkState {
  const record = runs.worlds[world];
  let s = initialState(record);
  for (let k = 0; k <= upTo; k++) {
    for (const { event } of buildScript(record, k)) s = reduceWalk(s, event);
  }
  return s;
}

function mount(rec: ReturnType<typeof recording>) {
  return renderHook(() => useWalkthrough(runs, rec.scheduler, 'pending'));
}

describe('Property 6: settling equals playing through', () => {
  it('folding steps 0..n equals the hook state once step n has fired (narration and typed text aside)', () => {
    fc.assert(
      fc.property(worldArb, stepArb, (world, n) => {
        const record = runs.worlds[world];
        const rec = recording();
        const { result, unmount } = mount(rec);
        act(() => {
          result.current.controls.pickWorld(world);
        });
        const lastAt = Math.max(...buildScript(record, n).map((t) => t.at));
        act(() => {
          rec.runUntil((STEP_START[n] ?? 0) + lastAt);
        });
        const played = asState(result.current.view);
        unmount();
        const folded = foldSteps(world, n);
        expect(core(played)).toEqual(core(folded));
        // settle() differs from the fold only in the narration: that of step n alone.
        expect(core(settle(record, n))).toEqual(core(folded));
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('settle(world, 4), jump(4) drained, and play drained all give the same state', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const record = runs.worlds[world];

        const recPlay = recording();
        const a = mount(recPlay);
        act(() => {
          a.result.current.controls.pickWorld(world);
        });
        act(() => {
          recPlay.drain();
        });
        const played = asState(a.result.current.view);
        a.unmount();

        const recJump = recording();
        const b = mount(recJump);
        act(() => {
          b.result.current.controls.pickWorld(world);
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

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { buildScript, settle, STEP_START } from '../../src/engine/script';
import type { InViewState } from '../../src/engine/useInView';
import { useWalkthrough } from '../../src/engine/useWalkthrough';

const runs = runsJson as unknown as RunsFile;
const shell = runs.worlds.shell;

interface Pending {
  id: number;
  ms: number;
  fn: () => void;
}

/** A recording scheduler: nothing runs until the test fires it; no real waiting. */
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
    pending,
    delays: () => [...pending.values()].map((p) => p.ms).sort((a, b) => a - b),
    /** Fires every pending timer in time order. */
    runAll() {
      const all = [...pending.values()].sort((a, b) => a.ms - b.ms || a.id - b.id);
      for (const p of all) {
        if (pending.delete(p.id)) p.fn();
      }
    },
  };
}

function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_t: string, l: () => void) => listeners.add(l),
      removeEventListener: (_t: string, l: () => void) => listeners.delete(l),
    }),
  });
  return {
    listeners,
    set(v: boolean) {
      matches = v;
      listeners.forEach((l) => {
        l();
      });
    },
  };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

function mount(rec: ReturnType<typeof recording>, initial: InViewState = 'pending') {
  return renderHook(({ inView }: { inView: InViewState }) => useWalkthrough(runs, rec.scheduler, inView), {
    initialProps: { inView: initial },
  });
}

const expectedDelays = (steps: number[], base: number): number[] =>
  steps
    .flatMap((k) => buildScript(shell, k).map((t) => (STEP_START[k] ?? 0) - base + t.at))
    .sort((a, b) => a - b);

describe('useWalkthrough', () => {
  it('schedules nothing on mount and starts at step -1 of the Shell world', () => {
    const rec = recording();
    const { result } = mount(rec);
    expect(rec.pending.size).toBe(0);
    expect(result.current.world).toBe('shell');
    expect(result.current.step).toBe(-1);
    expect(result.current.view.ward.id).toBe(shell.ward.id);
  });

  it('plays the five steps at the table times when first seen, and reaches PASS', () => {
    const rec = recording();
    const { result, rerender } = mount(rec);
    rerender({ inView: 'seen' });
    expect(rec.delays()).toEqual(expectedDelays([0, 1, 2, 3, 4], 0));
    act(() => {
      rec.runAll();
    });
    expect(result.current.step).toBe(4);
    expect(result.current.view.stamp).toBe('PASS');
    expect(result.current.view).toMatchObject({ ...settle(shell, 4) });
  });

  it('does not restart when the section is seen again', () => {
    const rec = recording();
    const { rerender } = mount(rec);
    rerender({ inView: 'seen' });
    const n = rec.pending.size;
    rerender({ inView: 'seen' });
    expect(rec.pending.size).toBe(n);
  });

  it('pickWorld clears the previous run and plays the new world', () => {
    const rec = recording();
    const { result, rerender } = mount(rec);
    rerender({ inView: 'seen' });
    act(() => {
      rec.runAll();
    });
    act(() => {
      result.current.controls.replay();
    });
    const idsBefore = [...rec.pending.keys()];
    act(() => {
      result.current.controls.pickWorld('hand');
    });
    expect(idsBefore.some((id) => rec.pending.has(id))).toBe(false);
    expect(result.current.world).toBe('hand');
    expect(result.current.step).toBe(-1);
    const hand = runs.worlds.hand;
    const want = [0, 1, 2, 3, 4]
      .flatMap((k) => buildScript(hand, k).map((t) => (STEP_START[k] ?? 0) + t.at))
      .sort((a, b) => a - b);
    expect(rec.delays()).toEqual(want);
  });

  it('replay restarts the current world from the reset state', () => {
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.pickWorld('cloud');
    });
    act(() => {
      rec.runAll();
    });
    expect(result.current.view.stamp).toBe('PASS');
    act(() => {
      result.current.controls.replay();
    });
    expect(result.current.world).toBe('cloud');
    expect(result.current.step).toBe(-1);
    expect(result.current.view.stamp).toBe('none');
    expect(rec.pending.size).toBeGreaterThan(0);
  });

  it('jump(3) settles earlier steps and schedules only the events of step 3', () => {
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.pickWorld('shell');
    });
    act(() => {
      result.current.controls.jump(3);
    });
    expect(rec.delays()).toEqual(expectedDelays([3], STEP_START[3] ?? 0));
    expect(result.current.step).toBe(2);
    expect(result.current.view).toMatchObject({ ...settle(shell, 2) });
    act(() => {
      rec.runAll();
    });
    expect(result.current.step).toBe(3);
    expect(result.current.view.stamp).toBe('BLOCKED');
  });

  it('shows the final state with no timer under Reduced_Motion, and jump is instant', () => {
    installMatchMedia(true);
    const rec = recording();
    const { result, rerender } = mount(rec);
    expect(rec.pending.size).toBe(0);
    expect(result.current.view.stamp).toBe('PASS');
    rerender({ inView: 'seen' });
    expect(rec.pending.size).toBe(0);
    act(() => {
      result.current.controls.jump(1);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.step).toBe(1);
    act(() => {
      result.current.controls.pickWorld('hand');
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.world).toBe('hand');
    expect(result.current.step).toBe(4);
  });

  it('cancels timers and shows the final state when Reduced_Motion turns on mid-walk', () => {
    const mm = installMatchMedia(false);
    const rec = recording();
    const { result, rerender } = mount(rec);
    rerender({ inView: 'seen' });
    expect(rec.pending.size).toBeGreaterThan(0);
    act(() => {
      mm.set(true);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.step).toBe(4);
    expect(result.current.view.stamp).toBe('PASS');
  });

  it('shows the final state and schedules nothing when there is no in-view signal', () => {
    const rec = recording();
    const { result } = mount(rec, 'unsupported');
    expect(rec.pending.size).toBe(0);
    expect(result.current.view.stamp).toBe('PASS');
    expect(result.current.step).toBe(4);
  });

  it('leaves zero pending timers and no listeners after unmount', () => {
    const mm = installMatchMedia(false);
    const rec = recording();
    const { rerender, unmount } = mount(rec);
    rerender({ inView: 'seen' });
    expect(rec.pending.size).toBeGreaterThan(0);
    unmount();
    expect(rec.pending.size).toBe(0);
    expect(mm.listeners.size).toBe(0);
  });
});

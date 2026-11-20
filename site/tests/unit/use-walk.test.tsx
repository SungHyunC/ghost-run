// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import type { RunsFile, WorldRecord } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { buildScript, settle, STEP_START } from '../../src/engine/script';
import { useWalk } from '../../src/engine/useWalk';

const runs = toWalkRuns(runsJson as unknown as RunsFile);
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

function mount(rec: ReturnType<typeof recording>, settled = false) {
  return renderHook(() => useWalk({ initial: shell, scheduler: rec.scheduler, settled }));
}

const expectedDelays = (record: WorldRecord, steps: number[], base: number): number[] =>
  steps
    .flatMap((k) => buildScript(record, k).map((t) => (STEP_START[k] ?? 0) - base + t.at))
    .sort((a, b) => a - b);

/** The five Outcomes as records: the three Shell-style recorded ones plus a pass, a warn, and an unsupported one. */
function variants(): Record<string, WorldRecord> {
  const warnPlan = { ...shell.plan, verdict: 'warn' as const };
  return {
    'block-fixed': { ...shell, outcome: 'block-fixed' },
    'block-open': { ...shell, outcome: 'block-open', fixed: null },
    pass: { ...shell, outcome: 'pass', plan: { ...shell.plan, verdict: 'pass' }, fixed: null },
    warn: { ...shell, outcome: 'warn', plan: warnPlan, fixed: null },
    unsupported: { ...shell, outcome: 'unsupported', fixed: null, unsupported: { reason: 'x', known: ['a'] } },
  };
}

describe('useWalk', () => {
  it('schedules nothing on mount and starts at step -1 of the initial record', () => {
    const rec = recording();
    const { result } = mount(rec);
    expect(rec.pending.size).toBe(0);
    expect(result.current.world).toBe('shell');
    expect(result.current.step).toBe(-1);
    expect(result.current.view.ward.id).toBe(shell.ward.id);
  });

  it('show plays the five steps at the table times and reaches PASS', () => {
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.show(shell);
    });
    expect(rec.delays()).toEqual(expectedDelays(shell, [0, 1, 2, 3, 4], 0));
    act(() => {
      rec.runAll();
    });
    expect(result.current.step).toBe(4);
    expect(result.current.view.stamp).toBe('PASS');
    expect(result.current.view).toMatchObject({ ...settle(shell, 4) });
  });

  it('show with each Outcome schedules that record and settles to its final state', () => {
    for (const [name, record] of Object.entries(variants())) {
      const rec = recording();
      const { result, unmount } = mount(rec);
      act(() => {
        result.current.controls.show(record);
      });
      expect(rec.delays(), name).toEqual(expectedDelays(record, [0, 1, 2, 3, 4], 0));
      act(() => {
        rec.runAll();
      });
      expect(result.current.record.outcome).toBe(name);
      expect(result.current.view, name).toMatchObject({ ...settle(record, 4) });
      unmount();
    }
  });

  it('show on another record clears the previous run and plays the new one', () => {
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.show(shell);
    });
    const idsBefore = [...rec.pending.keys()];
    act(() => {
      result.current.controls.show(runs.worlds.hand);
    });
    expect(idsBefore.some((id) => rec.pending.has(id))).toBe(false);
    expect(result.current.world).toBe('hand');
    expect(result.current.step).toBe(-1);
    expect(rec.delays()).toEqual(expectedDelays(runs.worlds.hand, [0, 1, 2, 3, 4], 0));
  });

  it('replay restarts the displayed record from the reset state', () => {
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.show(runs.worlds.cloud);
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
      result.current.controls.show(shell);
    });
    act(() => {
      result.current.controls.jump(3);
    });
    expect(rec.delays()).toEqual(expectedDelays(shell, [3], STEP_START[3] ?? 0));
    expect(result.current.step).toBe(2);
    expect(result.current.view).toMatchObject({ ...settle(shell, 2) });
    act(() => {
      rec.runAll();
    });
    expect(result.current.step).toBe(3);
    expect(result.current.view.stamp).toBe('BLOCKED');
  });

  it('jump on a step the record cannot reach is ignored: no timer changes, no state change', () => {
    const rec = recording();
    const { result } = mount(rec);
    const unsupported = variants()['unsupported']!;
    act(() => {
      result.current.controls.show(unsupported);
    });
    act(() => {
      rec.runAll();
    });
    const before = result.current.view;
    act(() => {
      result.current.controls.jump(2);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.view).toBe(before);
    expect(result.current.view.disabledSteps).toBe(4);
    act(() => {
      result.current.controls.jump(0);
    });
    expect(rec.pending.size).toBeGreaterThan(0);
  });

  it('shows the final state with no timer under Reduced_Motion, and jump is instant', () => {
    installMatchMedia(true);
    const rec = recording();
    const { result } = mount(rec, true);
    expect(rec.pending.size).toBe(0);
    expect(result.current.view.stamp).toBe('PASS');
    act(() => {
      result.current.controls.jump(1);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.step).toBe(1);
    act(() => {
      result.current.controls.show(runs.worlds.hand);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.world).toBe('hand');
    expect(result.current.step).toBe(4);
  });

  it('cancels timers and shows the final state when Reduced_Motion turns on mid-walk', () => {
    const mm = installMatchMedia(false);
    const rec = recording();
    const { result } = mount(rec);
    act(() => {
      result.current.controls.show(shell);
    });
    expect(rec.pending.size).toBeGreaterThan(0);
    act(() => {
      mm.set(true);
    });
    expect(rec.pending.size).toBe(0);
    expect(result.current.step).toBe(4);
    expect(result.current.view.stamp).toBe('PASS');
  });

  it('holds the final state and schedules nothing when settled is set', () => {
    const rec = recording();
    const { result } = mount(rec, true);
    expect(rec.pending.size).toBe(0);
    expect(result.current.view.stamp).toBe('PASS');
    expect(result.current.step).toBe(4);
  });

  it('leaves zero pending timers and no listeners after unmount', () => {
    const mm = installMatchMedia(false);
    const rec = recording();
    const { result, unmount } = mount(rec);
    act(() => {
      result.current.controls.show(shell);
    });
    expect(rec.pending.size).toBeGreaterThan(0);
    unmount();
    expect(rec.pending.size).toBe(0);
    expect(mm.listeners.size).toBe(0);
  });
});

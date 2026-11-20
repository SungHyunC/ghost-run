// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldId } from '../../src/config';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import type { WalkRuns, RunsFile } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { buildScript, STEP_START } from '../../src/engine/script';
import { useWalk } from '../../src/engine/useWalk';

/**
 * **Property 7: Timer hygiene**
 * **Validates: Requirements 11.5, 11.6, 11.7, 16.1, 16.2, 16.5, 16.6**
 */

const runs = toWalkRuns(runsJson as unknown as RunsFile);
const WORLDS: WorldId[] = ['shell', 'hand', 'cloud'];

interface Timer {
  id: number;
  due: number;
  gen: number;
  fn: () => void;
}

/** A virtual-clock scheduler. Each timer is tagged with the run generation that was current when it was set. */
function virtualScheduler() {
  let next = 1;
  let now = 0;
  const pending = new Map<number, Timer>();
  const state = { gen: 0, scheduled: 0, firedStale: 0 };
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = next++;
      state.scheduled++;
      pending.set(id, { id, due: now + ms, gen: state.gen, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  return {
    scheduler,
    pending,
    state,
    now: () => now,
    /** Moves the clock forward and fires due timers in time order. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.values()]
          .filter((t) => t.due <= end)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!due) break;
        pending.delete(due.id);
        now = Math.max(now, due.due);
        if (due.gen !== state.gen) state.firedStale++;
        due.fn();
      }
      now = end;
    },
  };
}

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

type Op =
  | { kind: 'pick'; world: WorldId }
  | { kind: 'replay' }
  | { kind: 'jump'; n: number }
  | { kind: 'advance'; ms: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom(...WORLDS).map((world): Op => ({ kind: 'pick', world })),
  fc.constant<Op>({ kind: 'replay' }),
  fc.integer({ min: 0, max: 4 }).map((n): Op => ({ kind: 'jump', n })),
  fc.integer({ min: 0, max: 7000 }).map((ms): Op => ({ kind: 'advance', ms })),
);

/** Absolute due times of the events a run schedules when started at `startAt`. */
function runDueTimes(world: WorldId, from: number, to: number, startAt: number): number[] {
  const record = runs.worlds[world];
  const base = STEP_START[from] ?? 0;
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    for (const t of buildScript(record, k)) out.push(startAt + (STEP_START[k] ?? 0) - base + t.at);
  }
  return out;
}

describe('Property 7: timer hygiene', () => {
  it('pending timers match the events still to fire; stale runs never fire; zero after drain or unmount', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 12 }), fc.boolean(), (ops, unmountAtEnd) => {
        const vs = virtualScheduler();
        const { result, unmount } = renderHook(() => useWalk({ initial: runs.worlds.shell, scheduler: vs.scheduler }));
        let world: WorldId = 'shell';
        let due: number[] = [];

        // `due` holds the due times of the latest run's events that have not fired yet.
        const check = () => {
          expect(vs.pending.size).toBe(due.length);
          expect(vs.state.firedStale).toBe(0);
        };
        check();

        for (const op of ops) {
          if (op.kind === 'advance') {
            act(() => {
              vs.advance(op.ms);
            });
            due = due.filter((d) => d > vs.now());
          } else {
            vs.state.gen++;
            act(() => {
              const c = result.current.controls;
              if (op.kind === 'pick') c.show(runs.worlds[op.world]);
              else if (op.kind === 'replay') c.replay();
              else c.jump(op.n);
            });
            if (op.kind === 'pick') {
              world = op.world;
              due = runDueTimes(world, 0, 4, vs.now());
            } else if (op.kind === 'replay') {
              due = runDueTimes(world, 0, 4, vs.now());
            } else {
              due = runDueTimes(world, op.n, op.n, vs.now());
            }
          }
          check();
        }

        if (unmountAtEnd) {
          vs.state.gen++;
          unmount();
          expect(vs.pending.size).toBe(0);
          act(() => {
            vs.advance(100_000);
          });
          expect(vs.state.firedStale).toBe(0);
        } else {
          act(() => {
            vs.advance(100_000);
          });
          expect(vs.pending.size).toBe(0);
          expect(vs.state.firedStale).toBe(0);
          unmount();
        }
        cleanup();
      }),
      { numRuns: 60 },
    );
  });

  it('schedules no timer at all under Reduced_Motion, for any control sequence', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 12 }), (ops) => {
        installMatchMedia(true);
        const vs = virtualScheduler();
        const { result, unmount } = renderHook(() => useWalk({ initial: runs.worlds.shell, scheduler: vs.scheduler }));
        for (const op of ops) {
          act(() => {
            const c = result.current.controls;
            if (op.kind === 'pick') c.show(runs.worlds[op.world]);
            else if (op.kind === 'replay') c.replay();
            else if (op.kind === 'jump') c.jump(op.n);
            else vs.advance(op.ms);
          });
          expect(vs.state.scheduled).toBe(0);
          expect(vs.pending.size).toBe(0);
        }
        unmount();
        cleanup();
        Reflect.deleteProperty(window, 'matchMedia');
      }),
      { numRuns: 40 },
    );
  });
});

import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldId } from '../../src/config';
import runsJson from '../../src/data/runs.json';
import type { RunsFile, WorldRecord } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { buildScript, STEP_START } from '../../src/engine/script';
import { useLiveWalkthrough } from '../../src/engine/useLiveWalkthrough';
import { PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../../src/live/types';
import { drain } from '../lib/live-fakes';

/**
 * **Property L9: A superseded run never reaches the page**
 * **Validates: Requirements 10.6, 10.7, 5.9**
 */

const runs = runsJson as unknown as RunsFile;
const WORLDS: WorldId[] = ['shell', 'hand', 'cloud'];
const TYPED = ['git status', 'rm -rf build', 'ls'] as const;

interface Timer {
  due: number;
  fn: () => void;
}

/** A virtual-clock scheduler: the controller and the walk hook never read the real clock. */
function virtualScheduler() {
  let next = 1;
  let now = 0;
  const pending = new Map<number, Timer>();
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = next++;
      pending.set(id, { due: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  return {
    scheduler,
    pending,
    now: () => now,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const hit = [...pending.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (hit === undefined) break;
        pending.delete(hit[0]);
        now = Math.max(now, hit[1].due);
        hit[1].fn();
      }
      now = end;
    },
  };
}

interface Deferred {
  seq: number;
  settle: () => void;
}

/** Engines whose every `run` waits for the test to release it. Each answer carries its call number as a marker. */
function controllableEngines() {
  let seq = 0;
  const waiting: Deferred[] = [];
  const calls: number[] = [];

  const answerFor = (world: WorldId, input: LiveInput, n: number): LiveAnswer => {
    const w = runs.worlds[world];
    for (const p of PRESETS[world]) {
      const rec = w.presets.find((r) => r.id === p.id);
      if (rec === undefined) continue;
      if (input === p.input) return { status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan: { ...rec.plan, message: `#${String(n)}` } } };
      if (input === p.fix && rec.fixed !== null) {
        return { status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan: { ...rec.fixed, message: `#${String(n)}` } } };
      }
    }
    return { status: 'unsupported', reason: `#${String(n)}`, stepIndexes: [0] };
  };

  const engine = (world: WorldId): LiveEngine & { dispose: ReturnType<typeof vi.fn> } => ({
    world,
    warm: () => Promise.resolve(),
    run: (input) =>
      new Promise<LiveAnswer>((resolve) => {
        const n = ++seq;
        calls.push(n);
        waiting.push({ seq: n, settle: () => { resolve(answerFor(world, input, n)); } });
      }),
    dispose: vi.fn(),
  });

  const shell = engine('shell');
  const cloud = engine('cloud');
  const hand = engine('hand');
  const lightDispose = vi.fn();
  const loaders: LiveLoaders = {
    light: vi.fn(() => Promise.resolve({ shell, cloud, dispose: lightDispose })),
    hand: vi.fn(() => Promise.resolve(hand)),
  };
  return { loaders, waiting, calls, lightDispose, handDispose: hand.dispose, light: loaders.light as ReturnType<typeof vi.fn>, handLoad: loaders.hand as ReturnType<typeof vi.fn> };
}

/** The marker of the run a record came from: the call number planted in the engine's answer. */
function markerOf(record: WorldRecord): string | undefined {
  return record.outcome === 'unsupported' ? record.unsupported?.reason : record.plan.message;
}

function dueTimes(record: WorldRecord, from: number, to: number, startAt: number): number[] {
  const base = STEP_START[from] ?? 0;
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    for (const t of buildScript(record, k)) out.push(startAt + (STEP_START[k] ?? 0) - base + t.at);
  }
  return out;
}

type Op =
  | { kind: 'world'; world: WorldId }
  | { kind: 'preset'; i: number }
  | { kind: 'typed'; text: (typeof TYPED)[number] }
  | { kind: 'run' }
  | { kind: 'replay' }
  | { kind: 'jump'; n: number }
  | { kind: 'advance'; ms: number }
  | { kind: 'resolve'; k: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(...WORLDS).map((world): Op => ({ kind: 'world', world })) },
  { weight: 2, arbitrary: fc.nat(5).map((i): Op => ({ kind: 'preset', i })) },
  { weight: 1, arbitrary: fc.constantFrom(...TYPED).map((text): Op => ({ kind: 'typed', text })) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'run' }) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'replay' }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 4 }).map((n): Op => ({ kind: 'jump', n })) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 9000 }).map((ms): Op => ({ kind: 'advance', ms })) },
  { weight: 3, arbitrary: fc.nat(8).map((k): Op => ({ kind: 'resolve', k })) },
);

afterEach(() => {
  cleanup();
});

describe('Property L9: a superseded run never reaches the page', () => {
  it('shows only the latest accepted run, keeps timers equal to the events left, and disposes on unmount', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), fc.boolean(), fc.array(fc.nat(8), { maxLength: 12 }), async (ops, unmountAtEnd, finalOrder) => {
        const vs = virtualScheduler();
        const f = controllableEngines();
        const { result, unmount } = renderHook(() =>
          useLiveWalkthrough({ runs, loaders: f.loaders, scheduler: vs.scheduler, visibility: { near: 'pending', seen: 'pending' } }),
        );
        let latest: string | null = null; // marker of the latest accepted run
        let shown: WorldRecord = result.current.walk.record;
        let due: number[] = [];
        let unmounted = false;

        const settleOne = async (k: number) => {
          const w = f.waiting.splice(k % f.waiting.length, 1)[0];
          if (w === undefined) return;
          act(() => {
            w.settle();
          });
          await drain();
        };

        const check = (afterRun: boolean) => {
          const rec = result.current.walk.record;
          if (rec !== shown) {
            // A record reaches the page only from the latest accepted run.
            if (!unmounted) expect(markerOf(rec)).toBe(latest);
            shown = rec;
            due = dueTimes(rec, 0, 4, vs.now());
          }
          expect(vs.pending.size).toBe(due.length);
          void afterRun;
        };

        // A run is accepted when it makes engine calls: the first new call belongs to it.
        const accept = async (start: () => void) => {
          const before = f.calls.length;
          act(start);
          await drain();
          const first = f.calls[before];
          if (first !== undefined) latest = `#${String(first)}`;
        };

        for (const op of ops) {
          if (op.kind === 'world') await accept(() => { result.current.pickWorld(op.world); });
          else if (op.kind === 'preset') {
            const list = PRESETS[result.current.world];
            const p = list[op.i % list.length];
            if (p !== undefined) await accept(() => { result.current.pickPreset(p.id); });
          } else if (op.kind === 'typed') {
            if (result.current.world !== 'hand') {
              // Typing while a run animates cancels that run: its timers are gone at once.
              const animating = result.current.walk.animating;
              act(() => {
                result.current.setText(op.text);
              });
              if (animating) due = [];
              await accept(() => { result.current.run(); });
            }
          } else if (op.kind === 'run') await accept(() => { result.current.run(); });
          else if (op.kind === 'replay') {
            act(() => {
              result.current.replay();
            });
            due = dueTimes(result.current.walk.record, 0, 4, vs.now());
          } else if (op.kind === 'jump') {
            const rec = result.current.walk.record;
            act(() => {
              result.current.jump(op.n);
            });
            if (!(rec.outcome === 'unsupported' && op.n > 0)) due = dueTimes(rec, op.n, op.n, vs.now());
          } else if (op.kind === 'advance') {
            act(() => {
              vs.advance(op.ms);
            });
            due = due.filter((d) => d > vs.now());
          } else await settleOne(op.k);
          check(false);
          expect(f.lightDispose).not.toHaveBeenCalled();
          expect(f.handDispose).not.toHaveBeenCalled();
        }

        if (unmountAtEnd) {
          unmount();
          unmounted = true;
          expect(vs.pending.size).toBe(0);
          due = [];
          const frozen = result.current.walk.record;
          for (const k of finalOrder) await settleOne(k);
          while (f.waiting.length > 0) await settleOne(0);
          act(() => {
            vs.advance(100_000);
          });
          expect(vs.pending.size).toBe(0);
          expect(result.current.walk.record).toBe(frozen);
          expect(f.lightDispose).toHaveBeenCalledTimes(f.light.mock.calls.length > 0 ? 1 : 0);
          expect(f.handDispose).toHaveBeenCalledTimes(f.handLoad.mock.calls.length > 0 ? 1 : 0);
        } else {
          // Answer every waiting engine call in a generated order, including the Fixed_Plan calls that appear.
          for (const k of finalOrder) {
            await settleOne(k);
            check(true);
          }
          while (f.waiting.length > 0) {
            await settleOne(0);
            check(true);
          }
          if (latest !== null) expect(markerOf(result.current.walk.record)).toBe(latest);
          act(() => {
            vs.advance(100_000);
          });
          expect(vs.pending.size).toBe(0);
          unmount();
          expect(vs.pending.size).toBe(0);
          expect(f.lightDispose).toHaveBeenCalledTimes(f.light.mock.calls.length > 0 ? 1 : 0);
          expect(f.handDispose).toHaveBeenCalledTimes(f.handLoad.mock.calls.length > 0 ? 1 : 0);
        }
        cleanup();
      }),
      { numRuns: 40 },
    );
  });

  it('an older answer that arrives last is dropped (fixed example)', async () => {
    const vs = virtualScheduler();
    const f = controllableEngines();
    const { result } = renderHook(() =>
      useLiveWalkthrough({ runs, loaders: f.loaders, scheduler: vs.scheduler, visibility: { near: 'pending', seen: 'pending' } }),
    );
    act(() => {
      result.current.pickWorld('shell');
    });
    await drain();
    act(() => {
      result.current.pickWorld('cloud');
    });
    await drain();
    expect(f.waiting).toHaveLength(2);
    const [older, newer] = f.waiting;
    act(() => {
      newer?.settle();
    });
    await drain();
    while (f.waiting.length > 1) {
      const w = f.waiting.splice(1, 1)[0];
      act(() => {
        w?.settle();
      });
      await drain();
    }
    expect(result.current.walk.record.id).toBe('cloud');
    const pendingBefore = vs.pending.size;
    act(() => {
      older?.settle();
    });
    await drain();
    expect(result.current.walk.record.id).toBe('cloud');
    expect(vs.pending.size).toBe(pendingBefore);
  });
});

import { act, cleanup, render } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Costumes } from '../../src/components/Costumes';
import { Walkthrough } from '../../src/components/Walkthrough';
import { XRAY_OFF_MS, XRAY_ON_MS } from '../../src/config';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import runsJson from '../../src/data/runs.json';
import type { RunsFile, WorldId } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { PRESETS } from '../../src/live/presets';
import type { LightEngines, LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../../src/live/types';
import { visibility as visibilityOf } from '../lib/page-visibility';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

// Feature: site-pages, Property Pg8: Per-page start happens once and leaving cancels
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 6.4**

const runs = runsJson as unknown as RunsFile;
const FIRST_INPUT = PRESETS.shell[0]?.input;

/** A scheduler that records every timer and fires them only on request. */
interface Recorder extends Scheduler {
  pending: Map<number, { fn: () => void; ms: number }>;
  scheduled: number[];
  fireOldest(): boolean;
}

function recorder(): Recorder {
  let next = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const scheduled: number[] = [];
  return {
    pending,
    scheduled,
    setTimeout(fn, ms) {
      const id = next++;
      scheduled.push(ms);
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    fireOldest() {
      const first = [...pending.entries()][0];
      if (first === undefined) return false;
      pending.delete(first[0]);
      act(() => {
        first[1].fn();
      });
      return true;
    },
  };
}

interface Gate {
  open: boolean;
  waiting: (() => void)[];
}

function fakeEngine(world: WorldId, gate: Gate, calls: LiveInput[]): LiveEngine {
  return {
    world,
    warm: () => Promise.resolve(),
    dispose: () => undefined,
    run: async (input) => {
      calls.push(input);
      if (!gate.open) await new Promise<void>((resolve) => gate.waiting.push(resolve));
      const w = runs.worlds[world];
      for (const p of PRESETS[world]) {
        const rec = w.presets.find((r) => r.id === p.id);
        if (rec === undefined) continue;
        const plan = input === p.input ? rec.plan : input === p.fix ? rec.fixed : null;
        if (plan !== null) return { status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan } } satisfies LiveAnswer;
      }
      return { status: 'unsupported', reason: 'command not supported', stepIndexes: [0] } satisfies LiveAnswer;
    },
  };
}

async function drain(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  });
}

function stubMotion(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

interface Rig {
  container: HTMLElement;
  peek: Recorder;
  walk: Recorder;
  gate: Gate;
  shellCalls: LiveInput[];
  rects: ReturnType<typeof vi.spyOn>;
  show(current: PageId, opened: readonly PageId[]): void;
  unmount(): void;
}

function mount(first: PageId, reduced: boolean): Rig {
  stubMotion(reduced);
  const rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  const peek = recorder();
  const walk = recorder();
  const gate: Gate = { open: false, waiting: [] };
  const shellCalls: LiveInput[] = [];
  const loaders: LiveLoaders = {
    light: () =>
      Promise.resolve<LightEngines>({
        shell: fakeEngine('shell', gate, shellCalls),
        cloud: fakeEngine('cloud', gate, []),
        dispose: () => undefined,
      }),
    hand: () => Promise.resolve(fakeEngine('hand', gate, [])),
  };
  const tree = (current: PageId, opened: readonly PageId[]): ReactElement => {
    const v = visibilityOf(current, opened);
    return (
      <>
        <Sprite />
        <Costumes scheduler={peek} visibility={v} />
        <Walkthrough runs={runs} loaders={loaders} scheduler={walk} visibility={v} />
      </>
    );
  };
  const r = render(tree(first, []));
  return {
    container: r.container,
    peek,
    walk,
    gate,
    shellCalls,
    rects,
    show: (current, opened) => {
      r.rerender(tree(current, opened));
    },
    unmount: () => {
      r.unmount();
    },
  };
}

type Action = { kind: 'open'; page: PageId } | { kind: 'fire'; which: 'peek' | 'walk' } | { kind: 'answer' };

const pageArb = fc.constantFrom(...PAGE_IDS);
const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 5, arbitrary: pageArb.map<Action>((page) => ({ kind: 'open', page })) },
  { weight: 2, arbitrary: fc.constantFrom<'peek' | 'walk'>('peek', 'walk').map<Action>((which) => ({ kind: 'fire', which })) },
  { weight: 1, arbitrary: fc.constant<Action>({ kind: 'answer' }) },
);

const peekTimers = (rig: Rig) => [...rig.peek.pending.values()].filter((t) => t.ms === XRAY_ON_MS || t.ms === XRAY_OFF_MS).length;
const xrayOn = (rig: Rig) => (rig.container.querySelector('#xray') as HTMLInputElement).checked;
const theaterText = (rig: Rig) => rig.container.querySelector('#theater')?.textContent ?? '';
const liveBadgeHidden = (rig: Rig) => (rig.container.querySelector('.live') as HTMLElement).hidden;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Property Pg8: per-page start happens once and leaving cancels', () => {
  it(
    'follows the model over page-opening sequences with reduced motion off',
    async () => {
      await fc.assert(
        fc.asyncProperty(pageArb, fc.array(actionArb, { maxLength: 24 }), async (first, actions) => {
          const rig = mount(first, false);
          try {
            await drain();
            let current: PageId = first;
            const opened = new Set<PageId>([first]);
            // The model of the autoplay.
            let starts = 0;
            let autoplayed = false;
            let answerShown = false;
            let pendingStay = false;
            let snapshot: string | null = null;
            const enterRun = () => {
              if (!autoplayed) {
                starts++;
                autoplayed = true;
                pendingStay = true;
              }
            };
            if (first === 'run') enterRun();
            await drain();

            const check = (rectsBefore: number) => {
              // (a) the peek timers: none before costumes opened, two (on, off) once, never again.
              const peekSets = rig.peek.scheduled.length;
              expect(peekSets).toBe(opened.has('costumes') ? 2 : 0);
              // (b) the autoplay: one call of the first Preset per start, none before run opened.
              expect(rig.shellCalls.filter((c) => c === FIRST_INPUT).length).toBe(starts);
              // (c) leaving costumes clears both timers and leaves the switch off.
              if (current !== 'costumes') {
                expect(peekTimers(rig)).toBe(0);
                expect(xrayOn(rig)).toBe(false);
              }
              if (current !== 'run') {
                // (d) no walk timer, no pending answer shown, the walk stays where it was parked.
                expect(rig.walk.pending.size).toBe(0);
                // (f) no placement is computed while run is not current.
                expect(rig.rects.mock.calls.length).toBe(rectsBefore);
              }
              if (opened.has('run')) expect(liveBadgeHidden(rig)).toBe(!answerShown);
              // (e) the parked state stays until return.
              if (snapshot !== null) expect(theaterText(rig)).toBe(snapshot);
            };

            check(rig.rects.mock.calls.length);
            for (const a of actions) {
              const rectsBefore = rig.rects.mock.calls.length;
              if (a.kind === 'open') {
                const wasRun = current === 'run';
                if (current !== a.page) {
                  current = a.page;
                  opened.add(a.page);
                  act(() => {
                    rig.show(current, [...opened]);
                  });
                  if (a.page === 'run') {
                    const text = snapshot;
                    enterRun();
                    // Returning without a new start shows the parked state.
                    if (starts > 0 && text !== null && !pendingStay) expect(theaterText(rig)).toBe(text);
                    snapshot = null;
                  } else if (wasRun) {
                    pendingStay = false;
                    if (!answerShown) autoplayed = false;
                    snapshot = theaterText(rig);
                  }
                }
              } else if (a.kind === 'fire') {
                if (a.which === 'peek') rig.peek.fireOldest();
                else if (current === 'run') rig.walk.fireOldest();
              } else {
                rig.gate.open = true;
                for (const release of rig.gate.waiting.splice(0)) release();
                await drain();
                rig.gate.open = false;
                if (current === 'run' && pendingStay) {
                  answerShown = true;
                  pendingStay = false;
                }
              }
              await drain();
              if (current === 'run') {
                // Leaving run takes a fresh snapshot at the next leave.
                snapshot = null;
              }
              check(current === 'run' ? Number.POSITIVE_INFINITY : rectsBefore);
            }
          } finally {
            rig.unmount();
            expect(rig.peek.pending.size).toBe(0);
            expect(rig.walk.pending.size).toBe(0);
            cleanup();
            vi.restoreAllMocks();
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'sets no peek timer under reduced motion, whichever pages open',
    async () => {
      await fc.assert(
        fc.asyncProperty(pageArb, fc.array(pageArb, { maxLength: 10 }), async (first, pages) => {
          const rig = mount(first, true);
          try {
            await drain();
            const opened = new Set<PageId>([first]);
            for (const page of pages) {
              opened.add(page);
              act(() => {
                rig.show(page, [...opened]);
              });
              await drain();
              expect(rig.peek.scheduled).toHaveLength(0);
            }
          } finally {
            rig.unmount();
            cleanup();
            vi.restoreAllMocks();
          }
        }),
        { numRuns: Math.min(NUM_RUNS, 40) },
      );
    },
    PBT_TIMEOUT,
  );
});

describe('per-page start examples', () => {
  it('opening costumes sets the two peek timers once; leaving mid-peek clears them with the switch off', async () => {
    const rig = mount('cover', false);
    await drain();
    expect(rig.peek.scheduled).toHaveLength(0);
    act(() => {
      rig.show('costumes', ['costumes']);
    });
    expect(rig.peek.scheduled).toEqual([XRAY_ON_MS, XRAY_OFF_MS]);
    rig.peek.fireOldest();
    expect(xrayOn(rig)).toBe(true);
    act(() => {
      rig.show('make', ['costumes', 'make']);
    });
    expect(peekTimers(rig)).toBe(0);
    expect(xrayOn(rig)).toBe(false);
    act(() => {
      rig.show('costumes', ['costumes', 'make']);
    });
    expect(rig.peek.scheduled).toHaveLength(2);
  });

  it('a load on run autoplays the first Preset once; return does not start it again', async () => {
    const rig = mount('run', false);
    await drain();
    expect(rig.shellCalls.filter((c) => c === FIRST_INPUT)).toHaveLength(1);
    rig.gate.open = true;
    for (const release of rig.gate.waiting.splice(0)) release();
    await drain();
    act(() => {
      rig.show('cover', ['run', 'cover']);
    });
    act(() => {
      rig.show('run', ['run', 'cover']);
    });
    await drain();
    expect(rig.shellCalls.filter((c) => c === FIRST_INPUT)).toHaveLength(1);
  });
});

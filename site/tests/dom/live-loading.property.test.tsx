import { act, cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import type { WorldId } from '../../src/config';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import type { Scheduler } from '../../src/engine/scheduler';
import { useInView } from '../../src/engine/useInView';
import { useLiveWalkthrough, type LiveWalkthrough } from '../../src/engine/useLiveWalkthrough';
import { PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveEngine, LiveLoaders } from '../../src/live/types';
import { drain } from '../lib/live-fakes';
import { NUM_RUNS } from '../pbt-config';

// Feature: site-live, Property L5: Nothing heavy loads before the section is near
// Feature: site-live, Property L6: The Hand engine loads only after Ghost Hand is picked
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6, 10.5**

const runs = runsJson as unknown as RunsFile;

/** A scheduler that never fires: the property is about loading, not about timing. */
const idleScheduler: Scheduler = { setTimeout: () => 0, clearTimeout: () => undefined };

/** A fake IntersectionObserver that lets the test report each observer by its options. */
class FakeObserver {
  static all: FakeObserver[] = [];
  disconnected = false;
  constructor(
    private readonly callback: (entries: { isIntersecting: boolean }[]) => void,
    readonly options: { rootMargin?: string; threshold?: number },
  ) {
    FakeObserver.all.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  report(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
  get isNear() {
    return this.options.rootMargin !== undefined;
  }
}

function reportNear(isIntersecting: boolean) {
  act(() => {
    for (const o of FakeObserver.all) if (o.isNear && !o.disconnected) o.report(isIntersecting);
  });
}

function fakeEngine(world: WorldId): LiveEngine {
  return {
    world,
    warm: () => Promise.resolve(),
    run: (): Promise<LiveAnswer> => Promise.resolve({ status: 'failed', cause: 'internal' }),
    dispose: vi.fn(),
  };
}

function spies() {
  const loaders = {
    light: vi.fn(() => Promise.resolve({ shell: fakeEngine('shell'), cloud: fakeEngine('cloud'), dispose: vi.fn() })),
    hand: vi.fn(() => Promise.resolve(fakeEngine('hand'))),
  } satisfies LiveLoaders;
  const worker = vi.fn();
  const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')));
  vi.stubGlobal('Worker', worker);
  vi.stubGlobal('fetch', fetchSpy);
  return { loaders, worker, fetchSpy };
}

/** Wires the controller to the real `useInView` options the page uses and exposes the controller handle. */
function Harness({ loaders, handle }: { loaders: LiveLoaders; handle: { current: LiveWalkthrough | null } }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref);
  const near = useInView(ref, { rootMargin: '200px 0px', threshold: 0 });
  const live = useLiveWalkthrough({ runs, loaders, scheduler: idleScheduler, visibility: { near, seen } });
  handle.current = live;
  return <section ref={ref} data-world={live.world} />;
}

type Quiet = 'rerender' | 'not-near' | 'resize' | 'hover' | 'slider';
type Light = 'pick-shell' | 'pick-cloud' | 'run' | 'replay' | 'jump' | 'type' | 'slider' | 'preset';

const sliderValues = fc.record({
  speed: fc.integer({ min: 1, max: 11 }).map((n) => n * 0.05),
  force: fc.integer({ min: 2, max: 40 }),
  distance: fc.integer({ min: 2, max: 25 }).map((n) => n / 100),
});

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Property L5: nothing heavy loads before the section is near', () => {
  it('no loader, Worker, or fetch is used before near; then light() once and hand() never', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Quiet>('rerender', 'not-near', 'resize', 'hover', 'slider'), { maxLength: 12 }),
        sliderValues,
        fc.array(fc.constantFrom<Quiet>('rerender', 'resize', 'hover', 'slider'), { maxLength: 6 }),
        async (before, values, after) => {
          FakeObserver.all = [];
          const { loaders, worker, fetchSpy } = spies();
          const handle: { current: LiveWalkthrough | null } = { current: null };
          const view = render(<Harness loaders={loaders} handle={handle} />);

          const apply = (op: Quiet) => {
            if (op === 'rerender') view.rerender(<Harness loaders={loaders} handle={handle} />);
            else if (op === 'not-near') reportNear(false);
            else if (op === 'resize') act(() => void window.dispatchEvent(new Event('resize')));
            else if (op === 'hover') fireEvent.mouseOver(view.container.firstElementChild as Element);
            else act(() => void handle.current?.setSliders(values));
          };

          for (const op of before) apply(op);
          await drain();
          expect(loaders.light).not.toHaveBeenCalled();
          expect(loaders.hand).not.toHaveBeenCalled();
          expect(worker).not.toHaveBeenCalled();
          expect(fetchSpy).not.toHaveBeenCalled();

          reportNear(true);
          await drain();
          expect(loaders.light).toHaveBeenCalledTimes(1);
          expect(loaders.hand).not.toHaveBeenCalled();

          for (const op of after) apply(op);
          await drain();
          expect(loaders.light).toHaveBeenCalledTimes(1);
          expect(loaders.hand).not.toHaveBeenCalled();
          view.unmount();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('without IntersectionObserver no loader is called before the first action, and the recorded final state shows', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { loaders, worker, fetchSpy } = spies();
    const { container } = render(
      <>
        <Sprite />
        <Walkthrough runs={runs} loaders={loaders} scheduler={idleScheduler} />
      </>,
    );
    await drain();
    expect(loaders.light).not.toHaveBeenCalled();
    expect(loaders.hand).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    const badge = container.querySelector('.live') as HTMLElement;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('Recorded run');
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');

    fireEvent.click(container.querySelector('.tab[data-w="shell"]') as Element);
    await drain();
    expect(loaders.light).toHaveBeenCalledTimes(1);
    expect(loaders.hand).not.toHaveBeenCalled();
  });
});

describe('Property L6: the Hand engine loads only after Ghost Hand is picked', () => {
  const lightOp = fc.constantFrom<Light>('pick-shell', 'pick-cloud', 'run', 'replay', 'jump', 'type', 'slider', 'preset');

  it('hand() is never called without a Hand action, and is called once after the first one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(lightOp, { maxLength: 12 }),
        sliderValues,
        fc.array(fc.constantFrom<Light | 'pick-hand'>('pick-hand', 'pick-shell', 'run', 'replay'), { minLength: 1, maxLength: 8 }),
        async (ops, values, afterOps) => {
          FakeObserver.all = [];
          const { loaders } = spies();
          const handle: { current: LiveWalkthrough | null } = { current: null };
          const view = render(<Harness loaders={loaders} handle={handle} />);
          reportNear(true);
          await drain();

          const apply = async (op: Light | 'pick-hand') => {
            const live = handle.current;
            if (live === null) throw new Error('no controller');
            act(() => {
              switch (op) {
                case 'pick-shell':
                  live.pickWorld('shell');
                  break;
                case 'pick-cloud':
                  live.pickWorld('cloud');
                  break;
                case 'pick-hand':
                  live.pickWorld('hand');
                  break;
                case 'run':
                  live.run();
                  break;
                case 'replay':
                  live.replay();
                  break;
                case 'jump':
                  live.jump(2);
                  break;
                case 'type':
                  live.setText('ls');
                  break;
                case 'slider':
                  live.setSliders(values);
                  break;
                case 'preset': {
                  const id = PRESETS[live.world === 'cloud' ? 'cloud' : 'shell'][0]?.id;
                  if (id !== undefined) live.pickPreset(id);
                  break;
                }
              }
            });
            await drain();
          };

          // Slider moves and replays can leave the world on Shell or Cloud only, so a Hand action never happens here.
          for (const op of ops) await apply(op);
          expect(loaders.hand).not.toHaveBeenCalled();
          expect(loaders.light).toHaveBeenCalledTimes(1);

          await apply('pick-hand');
          expect(loaders.hand).toHaveBeenCalledTimes(1);
          for (const op of afterOps) await apply(op);
          expect(loaders.hand).toHaveBeenCalledTimes(1);
          expect(loaders.light).toHaveBeenCalledTimes(1);
          view.unmount();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('running Hand sliders without a tab pick is not possible: the first Hand action is the tab pick', async () => {
    FakeObserver.all = [];
    const { loaders } = spies();
    const handle: { current: LiveWalkthrough | null } = { current: null };
    render(<Harness loaders={loaders} handle={handle} />);
    reportNear(true);
    await drain();
    expect(handle.current?.world).toBe('shell');
    expect(loaders.hand).not.toHaveBeenCalled();
  });
});

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile, WorldId } from '../../src/data/types';
import { useLiveWalkthrough, type LiveVisibility } from '../../src/engine/useLiveWalkthrough';
import { KNOWN_HAND, KNOWN_SHELL } from '../../src/live/input';
import { PRESETS } from '../../src/live/presets';
import type { LightEngines, LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../../src/live/types';
import { drain } from '../lib/live-fakes';
import { visibility as pageVisibility } from '../lib/page-visibility';

const runs = runsJson as unknown as RunsFile;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The answer a Preset (or its Fixed_Plan) gets from a real engine: the committed record of that plan. */
function recordedAnswer(world: WorldId, input: LiveInput): LiveAnswer | null {
  const w = runs.worlds[world];
  for (const p of PRESETS[world]) {
    const rec = w.presets.find((r) => r.id === p.id);
    if (rec === undefined) continue;
    if (input === p.input) return { status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan: rec.plan } };
    if (input === p.fix && rec.fixed !== null) {
      return { status: 'ran', run: { world, ward: w.ward, reality: w.reality, plan: rec.fixed } };
    }
  }
  return null;
}

interface FakeEngine extends LiveEngine {
  calls: LiveInput[];
  /** What a typed input gets. */
  typed: LiveAnswer;
  /** When set, `run` waits for it. */
  gate: Promise<void> | null;
  /** When set, `run` rejects. */
  throws: boolean;
}

function fakeEngine(world: WorldId): FakeEngine {
  const e: FakeEngine = {
    world,
    calls: [],
    typed: { status: 'unsupported', reason: 'command not supported', stepIndexes: [0] },
    gate: null,
    throws: false,
    warm: () => Promise.resolve(),
    run: async (input) => {
      e.calls.push(input);
      if (e.gate !== null) await e.gate;
      if (e.throws) throw new Error('boom');
      return recordedAnswer(world, input) ?? e.typed;
    },
    dispose: vi.fn(),
  };
  return e;
}

function fakeLoaders(opts: { handFailures?: number } = {}) {
  const shell = fakeEngine('shell');
  const cloud = fakeEngine('cloud');
  const hand = fakeEngine('hand');
  const dispose = vi.fn();
  let handFailures = opts.handFailures ?? 0;
  const loaders: LiveLoaders = {
    light: vi.fn(() => Promise.resolve<LightEngines>({ shell, cloud, dispose })),
    hand: vi.fn(() => {
      if (handFailures > 0) {
        handFailures--;
        return Promise.reject(new Error('hand chunk failed'));
      }
      return Promise.resolve(hand);
    }),
  };
  return { loaders, shell, cloud, hand, dispose };
}

/** No page opened: nothing loads and nothing autoplays. */
const visibility: LiveVisibility = { near: false, started: false, active: false };
const RUN: LiveVisibility = { near: true, started: true, active: true };
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function setup(loaders: LiveLoaders) {
  return renderHook(() => useLiveWalkthrough({ runs, loaders, visibility }));
}

function Page({ loaders }: { loaders: LiveLoaders }) {
  return (
    <>
      <Sprite />
      <Walkthrough runs={runs} loaders={loaders} visibility={pageVisibility('cover')} />
    </>
  );
}

const badge = (c: Element) => c.querySelector('.live') as HTMLElement;

describe('defaultLoaders', () => {
  it('imports on every call and keeps no rejection', async () => {
    vi.resetModules();
    let calls = 0;
    vi.doMock('../../src/live/engine-light', () => ({
      createLightEngines: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('load failed')) : Promise.resolve({ shell: {}, cloud: {}, dispose() {} });
      },
    }));
    const { defaultLoaders } = await import('../../src/live/loaders');
    await expect(defaultLoaders.light()).rejects.toThrow('load failed');
    await expect(defaultLoaders.light()).resolves.toBeDefined();
    expect(calls).toBe(2);
    vi.doUnmock('../../src/live/engine-light');
  });
});

describe('useLiveWalkthrough', () => {
  it('runs a Preset live, shows "Live in your browser", then the fixed plan', async () => {
    const f = fakeLoaders();
    const { container } = render(<Page loaders={f.loaders} />);
    expect(badge(container).hidden).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: /Ghost Shell/ }));
    await drain();
    expect(f.shell.calls).toHaveLength(2); // the Preset and its Fixed_Plan
    expect(badge(container).hidden).toBe(false);
    expect(badge(container).textContent).toBe('Live in your browser');
    advance(60000);
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
    expect(f.hand.calls).toHaveLength(0);
    expect(f.loaders.hand).not.toHaveBeenCalled();
  });

  it('a failed engine with a Preset shows the recorded run and "Recorded run"', async () => {
    const f = fakeLoaders();
    f.shell.throws = true;
    const { container } = render(<Page loaders={f.loaders} />);
    fireEvent.click(screen.getByRole('tab', { name: /Ghost Shell/ }));
    await drain();
    expect(badge(container).textContent).toBe('Recorded run');
    expect(container.querySelector('#livenote')?.textContent).toContain('recorded run');
    advance(60000);
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
  });

  it('a failed engine with typed input shows the message and no run', async () => {
    const f = fakeLoaders();
    f.shell.typed = { status: 'failed', cause: 'run' };
    const { result } = setup(f.loaders);
    act(() => {
      result.current.setText('sqlite3 app.db "SELECT 1"');
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(f.shell.calls).toHaveLength(1);
    expect(result.current.displayed).toBe('none');
    expect(result.current.message?.kind).toBe('failed');
    expect(result.current.text.shell).toBe('sqlite3 app.db "SELECT 1"');
    expect(result.current.busy).toBe(false);
  });

  it('a load failure with typed input shows the message and no run', async () => {
    const loaders: LiveLoaders = {
      light: () => Promise.reject(new Error('no')),
      hand: () => Promise.reject(new Error('no')),
    };
    const { result } = setup(loaders);
    act(() => {
      result.current.setText('ls');
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(result.current.displayed).toBe('none');
    expect(result.current.message?.kind).toBe('failed');
    expect(result.current.engines.shell).toBe('failed');
  });

  it('rejected text calls no engine and loads nothing', async () => {
    const f = fakeLoaders();
    const { result } = setup(f.loaders);
    act(() => {
      result.current.setText('   ');
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(result.current.message?.kind).toBe('rejected');
    act(() => {
      result.current.setText('echo \u0007bell');
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(result.current.message?.text).toContain('<U+0007>');
    act(() => {
      result.current.setText('x'.repeat(257));
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(result.current.message?.text).toContain('too long');
    expect(f.shell.calls).toHaveLength(0);
    expect(f.loaders.light).not.toHaveBeenCalled();
    expect(result.current.displayed).toBe('none');
  });

  it('unsupported typed input shows step 1 only, with the command list', async () => {
    const f = fakeLoaders();
    const { result } = setup(f.loaders);
    act(() => {
      result.current.setText('git status');
    });
    act(() => {
      result.current.run();
    });
    await drain();
    const rec = result.current.walk.record;
    expect(rec.outcome).toBe('unsupported');
    expect(rec.fixed).toBeNull();
    expect(rec.unsupported?.known).toEqual([...KNOWN_SHELL]);
    expect(result.current.displayed).toBe('live');
  });

  it('Hand input the engine cannot take lists the slider ranges', async () => {
    const f = fakeLoaders();
    f.hand.typed = { status: 'unsupported', reason: 'the plan is not valid', stepIndexes: [2] };
    const { result } = setup(f.loaders);
    act(() => {
      result.current.pickWorld('hand');
    });
    await drain();
    act(() => {
      result.current.setSliders({ speed: 0.31, force: 11, distance: 0.11 });
    });
    act(() => {
      result.current.run();
    });
    await drain();
    expect(result.current.walk.record.unsupported?.known).toEqual([...KNOWN_HAND]);
  });

  it('Replay calls no engine', async () => {
    const f = fakeLoaders();
    const { result } = setup(f.loaders);
    act(() => {
      result.current.pickWorld('shell');
    });
    await drain();
    const before = f.shell.calls.length;
    act(() => {
      result.current.replay();
    });
    act(() => {
      result.current.jump(2);
    });
    advance(60000);
    await drain();
    expect(f.shell.calls).toHaveLength(before);
    expect(f.loaders.light).toHaveBeenCalledTimes(1);
  });

  it('is busy during a run and not afterwards', async () => {
    const f = fakeLoaders();
    let release = () => {};
    f.shell.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = setup(f.loaders);
    act(() => {
      result.current.pickWorld('shell');
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.message?.kind).toBe('loading');
    await drain();
    expect(result.current.busy).toBe(true);
    release();
    await drain();
    expect(result.current.busy).toBe(false);
    expect(result.current.displayed).toBe('live');
    expect(result.current.message).toBeNull();
  });

  it('a Hand load failure is retried on the next Hand action; Hand loads only from a Hand action', async () => {
    const f = fakeLoaders({ handFailures: 1 });
    const { result } = setup(f.loaders);
    act(() => {
      result.current.pickWorld('shell');
    });
    await drain();
    act(() => {
      result.current.pickWorld('cloud');
    });
    await drain();
    expect(f.loaders.hand).not.toHaveBeenCalled();
    act(() => {
      result.current.pickWorld('hand');
    });
    await drain();
    expect(f.loaders.hand).toHaveBeenCalledTimes(1);
    expect(result.current.engines.hand).toBe('failed');
    expect(result.current.displayed).toBe('recorded');
    act(() => {
      result.current.pickWorld('hand');
    });
    await drain();
    expect(f.loaders.hand).toHaveBeenCalledTimes(2);
    expect(result.current.engines.hand).toBe('ready');
    expect(result.current.displayed).toBe('live');
    act(() => {
      result.current.pickWorld('hand');
    });
    await drain();
    expect(f.loaders.hand).toHaveBeenCalledTimes(2);
  });

  it('a newer run supersedes an older pending one, and unmount disposes the engines', async () => {
    const f = fakeLoaders();
    let release = () => {};
    f.shell.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, unmount } = setup(f.loaders);
    act(() => {
      result.current.pickWorld('shell');
    });
    await drain();
    f.shell.gate = null;
    act(() => {
      result.current.pickWorld('cloud');
    });
    await drain();
    expect(result.current.walk.record.id).toBe('cloud');
    release();
    await drain();
    expect(result.current.walk.record.id).toBe('cloud');
    unmount();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });

  it('near loads the light chunk once and warms it; started plays the first Shell Preset', async () => {
    const f = fakeLoaders();
    const warm = vi.spyOn(f.shell, 'warm');
    const { result, rerender } = renderHook((v: LiveVisibility) => useLiveWalkthrough({ runs, loaders: f.loaders, visibility: v }), {
      initialProps: visibility,
    });
    await drain();
    expect(f.loaders.light).not.toHaveBeenCalled();
    rerender({ near: true, started: false, active: false });
    await drain();
    expect(f.loaders.light).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledTimes(1);
    expect(f.shell.calls).toHaveLength(0);
    rerender(RUN);
    await drain();
    expect(f.shell.calls.length).toBeGreaterThan(0);
    expect(result.current.displayed).toBe('live');
    expect(f.loaders.light).toHaveBeenCalledTimes(1);
  });

  describe('leaving and returning to the Run page', () => {
    const LEFT: LiveVisibility = { near: true, started: true, active: false };
    const mountRun = (f: ReturnType<typeof fakeLoaders>, initial: LiveVisibility = RUN) =>
      renderHook((v: LiveVisibility) => useLiveWalkthrough({ runs, loaders: f.loaders, visibility: v }), { initialProps: initial });

    it('a load on #run starts the autoplay once', async () => {
      const f = fakeLoaders();
      mountRun(f);
      await drain();
      expect(f.shell.calls.length).toBeGreaterThan(0);
      expect(f.shell.calls[0]).toBe(PRESETS.shell[0]?.input);
    });

    it('leaving during a walk parks it, and returning does not autoplay again', async () => {
      const f = fakeLoaders();
      const { result, rerender } = mountRun(f);
      await drain();
      advance(2500);
      const step = result.current.walk.step;
      const calls = f.shell.calls.length;
      expect(result.current.walk.animating).toBe(true);
      rerender(LEFT);
      expect(result.current.walk.animating).toBe(false);
      expect(result.current.busy).toBe(false);
      advance(60000);
      expect(result.current.walk.step).toBe(step);
      expect(vi.getTimerCount()).toBe(0);
      rerender(RUN);
      await drain();
      expect(result.current.walk.step).toBe(step);
      expect(f.shell.calls).toHaveLength(calls);
    });

    it('leaving drops a pending answer', async () => {
      const f = fakeLoaders();
      let release!: () => void;
      f.shell.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { result, rerender } = mountRun(f);
      await drain();
      expect(result.current.busy).toBe(true);
      rerender(LEFT);
      expect(result.current.busy).toBe(false);
      expect(result.current.message).toBeNull();
      release();
      await drain();
      expect(result.current.displayed).toBe('none');
      expect(result.current.walk.animating).toBe(false);
    });

    it('leaving before the first answer resets the autoplay, so it runs on return', async () => {
      const f = fakeLoaders();
      let release!: () => void;
      f.shell.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { result, rerender } = mountRun(f);
      await drain();
      rerender(LEFT);
      f.shell.gate = null;
      release();
      await drain();
      expect(f.shell.calls).toHaveLength(1);
      rerender(RUN);
      await drain();
      expect(f.shell.calls.length).toBeGreaterThan(1);
      expect(result.current.displayed).toBe('live');
    });

    it('Replay works after returning', async () => {
      const f = fakeLoaders();
      const { result, rerender } = mountRun(f);
      await drain();
      advance(2500);
      const calls = f.shell.calls.length;
      rerender(LEFT);
      rerender(RUN);
      act(() => {
        result.current.replay();
      });
      expect(result.current.walk.animating).toBe(true);
      expect(f.shell.calls).toHaveLength(calls);
    });

    it('the Live_Section creates no IntersectionObserver', () => {
      const ctor = vi.fn();
      vi.stubGlobal('IntersectionObserver', ctor);
      render(<Page loaders={fakeLoaders().loaders} />);
      expect(ctor).not.toHaveBeenCalled();
    });
  });
});

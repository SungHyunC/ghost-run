// A live-engine failure is never silent: one console.warn names the world and the cause, and the page keeps its fallback.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import type { LiveEngine, LiveLoaders } from '../../src/live/types';
import { drain, failingLoaders, recordedLoaders } from '../lib/live-fakes';

const runs = runsJson as unknown as RunsFile;

class IdleObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', IdleObserver);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });

describe('live-engine failures', () => {
  it('warns once with the world and the cause when the Hand engine does not load, and shows the recorded run', async () => {
    const loaders: LiveLoaders = { ...failingLoaders, hand: () => Promise.reject(new Error('Worker script failed to load')) };
    const { container } = render(<Walkthrough runs={runs} loaders={loaders} />);
    fireEvent.click(tab('Ghost Hand'));
    await drain();
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toContain('hand');
    expect(text).toContain('load');
    expect(text).toContain('Worker script failed to load');
    expect(container.querySelector('.sec-head .live')?.textContent).toBe('Recorded run');
    expect(container.querySelector('#livenote')?.textContent).toContain('recorded run');
  });

  it('warns with the cause the engine reports, and keeps the fallback', async () => {
    const base = recordedLoaders(runs).loaders;
    const handEngine: LiveEngine = {
      world: 'hand',
      warm: () => Promise.resolve(),
      dispose: () => undefined,
      run: () => Promise.resolve({ status: 'failed', cause: 'run', detail: 'EvalError: Evaluating a string as JavaScript' }),
    };
    const loaders: LiveLoaders = { ...base, hand: () => Promise.resolve(handEngine) };
    const { container } = render(<Walkthrough runs={runs} loaders={loaders} />);
    fireEvent.click(tab('Ghost Hand'));
    await drain();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toMatch(/hand/);
    expect(text).toContain('run');
    expect(text).toContain('EvalError');
    expect(container.querySelector('.sec-head .live')?.textContent).toBe('Recorded run');
  });

  it('does not warn when every engine answers', async () => {
    render(<Walkthrough runs={runs} loaders={recordedLoaders(runs).loaders} />);
    fireEvent.click(tab('Ghost Hand'));
    await drain();
    expect(warn).not.toHaveBeenCalled();
  });
});

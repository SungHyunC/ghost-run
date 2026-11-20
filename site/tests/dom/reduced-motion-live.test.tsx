import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { drain, recordedLoaders } from '../lib/live-fakes';

const runs = runsJson as unknown as RunsFile;
const observers: { cb: IntersectionObserverCallback }[] = [];
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    observers.push({ cb });
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  observers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
});

const q = (c: Element, sel: string) => c.querySelector(sel);

describe('Reduced_Motion with the live section', () => {
  it('shows the recorded final state at load, then the live final state after near, with no timer', async () => {
    const { loaders, calls } = recordedLoaders(runs);
    const { container } = render(
      <>
        <Sprite />
        <Walkthrough runs={runs} loaders={loaders} />
      </>,
    );
    expect(q(container, '.live')?.textContent).toBe('Recorded run');
    expect(q(container, '#stamp')?.textContent).toBe('PASS');
    expect(vi.getTimerCount()).toBe(0);
    expect(calls).toHaveLength(0);

    // The near observer is the second one the section creates.
    act(() => {
      observers[1]?.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await drain();
    expect(calls.length).toBeGreaterThan(0);
    expect(q(container, '.live')?.textContent).toBe('Live in your browser');
    expect(q(container, '#stamp')?.textContent).toBe('PASS');
    expect(q(container, '.live')?.hasAttribute('hidden')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

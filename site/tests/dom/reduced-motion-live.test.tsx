import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { PageId } from '../../src/data/pages';
import type { RunsFile } from '../../src/data/types';
import { drain, recordedLoaders } from '../lib/live-fakes';
import { visibility } from '../lib/page-visibility';

const runs = runsJson as unknown as RunsFile;
beforeEach(() => {
  vi.useFakeTimers();
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
  it('shows the recorded final state at load, then the live final state once near, with no timer', async () => {
    const { loaders, calls } = recordedLoaders(runs);
    const page = (current: PageId) => (
      <>
        <Sprite />
        <Walkthrough runs={runs} loaders={loaders} visibility={visibility(current)} />
      </>
    );
    const { container, rerender } = render(page('cover'));
    expect(q(container, '.live')?.textContent).toBe('Recorded run');
    expect(q(container, '#stamp')?.textContent).toBe('PASS');
    expect(vi.getTimerCount()).toBe(0);
    expect(calls).toHaveLength(0);

    // Opening the Costumes page makes the section near: the first Preset runs once, settled.
    rerender(page('costumes'));
    await drain();
    expect(calls.length).toBeGreaterThan(0);
    expect(q(container, '.live')?.textContent).toBe('Live in your browser');
    expect(q(container, '#stamp')?.textContent).toBe('PASS');
    expect(q(container, '.live')?.hasAttribute('hidden')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

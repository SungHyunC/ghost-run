import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { drain, failingLoaders, recordedLoaders } from '../lib/live-fakes';

const runs = runsJson as unknown as RunsFile;

class IdleObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', IdleObserver);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const badge = (c: Element) => c.querySelector('.live') as HTMLElement;
const page = (loaders = failingLoaders) =>
  render(
    <>
      <Sprite />
      <Walkthrough runs={runs} loaders={loaders} />
    </>,
  );

describe('Live_Badge', () => {
  it('is hidden before any run is displayed', () => {
    const { container } = page();
    expect(badge(container).hidden).toBe(true);
    expect(getComputedStyle(badge(container)).display).toBe('none');
  });

  it('reads "Live in your browser" only for a live run', async () => {
    const { container } = page(recordedLoaders(runs).loaders);
    fireEvent.click(screen.getByRole('tab', { name: /Ghost Shell/ }));
    await drain();
    expect(badge(container).hidden).toBe(false);
    expect(badge(container).textContent).toBe('Live in your browser');
    expect(badge(container).classList.contains('rec')).toBe(false);
  });

  it('reads "Recorded run" with the rec class for the fallback', async () => {
    const { container } = page();
    fireEvent.click(screen.getByRole('tab', { name: /Ghost Shell/ }));
    await drain();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(badge(container).hidden).toBe(false);
    expect(badge(container).textContent).toBe('Recorded run');
    expect(badge(container).classList.contains('rec')).toBe(true);
  });

  it('is in the section head after the heading and carries no live region of its own', () => {
    const { container } = page();
    const head = container.querySelector('.sec-head') as HTMLElement;
    expect([...head.children].map((c) => c.tagName + '.' + c.className)).toEqual(['SPAN.nbadge', 'H2.', 'SPAN.live']);
    expect(badge(container).hasAttribute('aria-live')).toBe(false);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('has the sub-heading of the mockup and no second line under it: the badge carries "in your browser"', () => {
    const { container } = page();
    const subs = [...container.querySelectorAll('.sec-sub')].map((e) => e.textContent);
    expect(subs).toEqual(['Give the ghost a plan. It tries it on a copy first, and only a lit candle lets reality change.']);
    expect(container.querySelector('#sealnote')).toBeNull();
    expect(container.textContent).not.toContain('sends nothing out');
  });
});

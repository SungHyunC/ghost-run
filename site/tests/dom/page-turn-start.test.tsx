import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EFFECT_MS } from '../../src/engine/paging';

// The page-entry starts (X-ray peek, engine preload, Autoplay) wait for the end of the turn.
// Here the turn is real (no reduced motion) and the clock is fake.

const slot = vi.hoisted(() => ({ light: null as null | (() => Promise<unknown>) }));
vi.mock('../../src/live/loaders', () => ({
  defaultLoaders: {
    light: () => (slot.light as () => Promise<unknown>)(),
    hand: () => new Promise<never>(() => undefined),
  },
}));

import { App } from '../../src/App';

const real = { replaceState: window.history.replaceState.bind(window.history) };

beforeEach(() => {
  vi.useFakeTimers();
  real.replaceState(null, '', window.location.pathname + '#recipe');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  slot.light = vi.fn(() => new Promise<never>(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
  real.replaceState(null, '', window.location.pathname);
});

const next = (c: HTMLElement) => fireEvent.click(c.querySelector('#pgNext') as Element);
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('page-entry starts wait for the end of the turn', () => {
  it('preloads the engine and starts the X-ray peek only after the turn has finished', () => {
    const { container } = render(<App />);
    const xray = container.querySelector<HTMLInputElement>('input#xray') as HTMLInputElement;
    next(container); // recipe -> costumes
    expect(container.querySelector('.page.enter-next')?.getAttribute('data-page')).toBe('costumes');
    advance(EFFECT_MS - 1);
    expect(slot.light).not.toHaveBeenCalled();
    advance(1);
    expect(container.querySelector('.enter-next')).toBeNull();
    expect(slot.light).toHaveBeenCalledTimes(1);
    // The peek switches on 1600 ms after the start, so the turn start (not its end) would show it earlier.
    advance(1599);
    expect(xray.checked).toBe(false);
    advance(1);
    expect(xray.checked).toBe(true);
  });

  it('keeps Costumes idle while a turn only passes through it', () => {
    const { container } = render(<App />);
    next(container); // recipe -> costumes, running
    advance(100);
    fireEvent.click(container.querySelectorAll('#pgDots .pg-dot')[4] as Element); // held: make
    advance(EFFECT_MS - 100); // costumes turn ends, the held turn to make starts
    advance(EFFECT_MS);
    expect(container.querySelector('.page.on')?.getAttribute('data-page')).toBe('make');
    // The held turn started at the end of the first one; the intermediate page never settled, and the
    // engine preload that page 3 triggers happens once, after the final turn.
    expect(slot.light).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChromeHeights } from '../../src/engine/useChromeHeights';

let callbacks: (() => void)[] = [];
let observed: Element[] = [];
let disconnected = 0;

class FakeResizeObserver {
  constructor(cb: () => void) {
    callbacks.push(cb);
  }
  observe(el: Element) {
    observed.push(el);
  }
  unobserve() {}
  disconnect() {
    disconnected += 1;
  }
}

const heights = new Map<string, number>();

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  useChromeHeights(ref);
  return (
    <div className="site" ref={ref} data-testid="site">
      <div className="nav" />
      <nav className="pagebar" />
    </div>
  );
}

beforeEach(() => {
  callbacks = [];
  observed = [];
  disconnected = 0;
  heights.set('nav', 60);
  heights.set('pagebar', 73);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.classList.contains('nav') ? heights.get('nav') : this.classList.contains('pagebar') ? heights.get('pagebar') : 0;
    return { height: h ?? 0 } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useChromeHeights', () => {
  it('sets --nav-h and --bar-h from the element heights on mount', () => {
    const { getByTestId } = render(<Probe />);
    const site = getByTestId('site');
    expect(site.style.getPropertyValue('--nav-h')).toBe('60px');
    expect(site.style.getPropertyValue('--bar-h')).toBe('73px');
    expect(observed.map((e) => e.className)).toEqual(['nav', 'pagebar']);
  });

  it('updates both properties when the observer fires', () => {
    const { getByTestId } = render(<Probe />);
    const site = getByTestId('site');
    heights.set('nav', 96.5);
    heights.set('pagebar', 80);
    for (const cb of callbacks) cb();
    expect(site.style.getPropertyValue('--nav-h')).toBe('96.5px');
    expect(site.style.getPropertyValue('--bar-h')).toBe('80px');
  });

  it('disconnects on unmount', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(disconnected).toBe(1);
  });
});

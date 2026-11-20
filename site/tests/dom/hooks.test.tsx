import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultScheduler } from '../../src/engine/scheduler';
import { useInView } from '../../src/engine/useInView';
import { useReducedMotion } from '../../src/engine/useReducedMotion';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
});

function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const add = vi.fn((_t: string, l: () => void) => listeners.add(l));
  const remove = vi.fn((_t: string, l: () => void) => listeners.delete(l));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: add,
      removeEventListener: remove,
    }),
  });
  return {
    add,
    remove,
    listeners,
    set(v: boolean) {
      matches = v;
      listeners.forEach((l) => {
        l();
      });
    },
  };
}

describe('useReducedMotion', () => {
  it('is true when the query matches', () => {
    installMatchMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('is false when the query does not match', () => {
    installMatchMedia(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('follows changes at run time', () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    act(() => {
      mm.set(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      mm.set(false);
    });
    expect(result.current).toBe(false);
  });

  it('is false without matchMedia', () => {
    expect(typeof window.matchMedia).not.toBe('function');
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const mm = installMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mm.listeners.size).toBe(1);
    unmount();
    expect(mm.listeners.size).toBe(0);
    expect(mm.remove).toHaveBeenCalled();
  });
});

class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(
    private readonly cb: (entries: { isIntersecting: boolean }[]) => void,
    readonly options: { threshold: number; rootMargin?: string },
  ) {
    FakeObserver.instances.push(this);
  }
  fire(isIntersecting: boolean) {
    this.cb([{ isIntersecting }]);
  }
}

function Probe({ margin }: { margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useInView(ref, margin === undefined ? {} : { rootMargin: margin, threshold: 0 });
  return <div ref={ref} data-state={state} />;
}

describe('useInView', () => {
  it('fires once with threshold 0.25 and disconnects', () => {
    FakeObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(<Probe />);
    const state = () => container.firstElementChild?.getAttribute('data-state');
    expect(state()).toBe('pending');
    const obs = FakeObserver.instances[0]!;
    expect(obs.options.threshold).toBe(0.25);
    expect(obs.observe).toHaveBeenCalledTimes(1);
    act(() => {
      obs.fire(false);
    });
    expect(state()).toBe('pending');
    expect(obs.disconnect).not.toHaveBeenCalled();
    act(() => {
      obs.fire(true);
    });
    expect(state()).toBe('seen');
    expect(obs.disconnect).toHaveBeenCalled();
    expect(FakeObserver.instances).toHaveLength(1);
  });

  it('passes rootMargin and threshold to the observer and reports once', () => {
    FakeObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { container } = render(<Probe margin="600px 0px" />);
    const obs = FakeObserver.instances[0]!;
    expect(obs.options).toEqual({ threshold: 0, rootMargin: '600px 0px' });
    act(() => {
      obs.fire(true);
    });
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('seen');
    expect(obs.disconnect).toHaveBeenCalledTimes(1);
    expect(obs.options.rootMargin).toBe('600px 0px');
  });

  it('keeps the default options when none are given', () => {
    FakeObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    expect(FakeObserver.instances[0]!.options).toEqual({ threshold: 0.25 });
  });

  it('reports unsupported without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<Probe />);
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('unsupported');
  });
});

describe('defaultScheduler', () => {
  it('schedules and clears through the global timers', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const id = defaultScheduler.setTimeout(fn, 10);
    defaultScheduler.clearTimeout(id);
    vi.advanceTimersByTime(20);
    expect(fn).not.toHaveBeenCalled();
    defaultScheduler.setTimeout(fn, 10);
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

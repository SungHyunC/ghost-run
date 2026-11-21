import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultScheduler } from '../../src/engine/scheduler';
import { useReducedMotion } from '../../src/engine/useReducedMotion';
import { useXrayDemo } from '../../src/engine/useXrayDemo';

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

describe('useXrayDemo', () => {
  function harness(reduced: boolean) {
    vi.useFakeTimers();
    const set = vi.fn();
    const hook = renderHook(
      (p: { started: boolean; active: boolean }) => useXrayDemo(defaultScheduler, reduced, set, p),
      { initialProps: { started: false, active: true } },
    );
    return { set, hook };
  }

  it('takes { started, active }: no timer before started, then on at 1600 and off at 4400', () => {
    const { set, hook } = harness(false);
    vi.advanceTimersByTime(10000);
    expect(set).not.toHaveBeenCalled();
    hook.rerender({ started: true, active: true });
    vi.advanceTimersByTime(1600);
    expect(set).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(2800);
    expect(set).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('cancels with the switch off when active turns false mid-peek, and does not replay', () => {
    const { set, hook } = harness(false);
    hook.rerender({ started: true, active: true });
    vi.advanceTimersByTime(2000);
    hook.rerender({ started: true, active: false });
    expect(set).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
    hook.rerender({ started: true, active: true });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('stops on the returned cancel and sets no timer under reduced motion', () => {
    const a = harness(false);
    a.hook.rerender({ started: true, active: true });
    act(() => {
      a.hook.result.current();
    });
    expect(vi.getTimerCount()).toBe(0);
    a.hook.unmount();
    vi.useRealTimers();
    const b = harness(true);
    b.hook.rerender({ started: true, active: true });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

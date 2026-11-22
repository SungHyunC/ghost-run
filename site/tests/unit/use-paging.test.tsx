// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EFFECT_MS } from '../../src/engine/paging';
import type { Scheduler } from '../../src/engine/scheduler';
import { usePaging } from '../../src/engine/usePaging';
import { fakeHistory, type FakeHistory } from '../lib/page-visibility';

interface Recording {
  scheduler: Scheduler;
  pending: Map<number, () => void>;
  scheduled: number[];
  fire(): void;
}

function recordingScheduler(): Recording {
  let next = 1;
  const pending = new Map<number, () => void>();
  const scheduled: number[] = [];
  return {
    pending,
    scheduled,
    scheduler: {
      setTimeout(fn, ms) {
        const id = next++;
        scheduled.push(ms);
        pending.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      },
    },
    fire() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

interface Fake {
  win: Window;
  history: FakeHistory;
  scrollTo: ReturnType<typeof vi.fn>;
  listeners: () => number;
  setHash(h: string): void;
}

function fakeWindow(startHash = '', opts: { scrollTo?: unknown } = {}): Fake {
  const target = new EventTarget();
  const history = fakeHistory(startHash);
  const scrollTo = vi.fn();
  const loc = { hash: startHash };
  let count = 0;
  const win = {
    addEventListener(type: string, fn: EventListener) {
      count++;
      target.addEventListener(type, fn);
    },
    removeEventListener(type: string, fn: EventListener) {
      count--;
      target.removeEventListener(type, fn);
    },
    dispatchEvent: (e: Event) => target.dispatchEvent(e),
    location: loc,
    history: {
      pushState: (d: unknown, u: string, url: string) => {
        history.pushState(d, u, url);
        loc.hash = url;
      },
      replaceState: (d: unknown, u: string, url: string) => {
        history.replaceState(d, u, url);
        loc.hash = url;
      },
    },
    scrollTo: 'scrollTo' in opts ? opts.scrollTo : scrollTo,
    document,
  } as unknown as Window;
  return {
    win,
    history,
    scrollTo,
    listeners: () => count,
    setHash(h) {
      loc.hash = h;
    },
  };
}

function press(fake: Fake, key: string, target: Element | null, init: Record<string, unknown> = {}) {
  const e = new Event('keydown', { cancelable: true });
  const { defaultPrevented, ...rest } = init;
  Object.assign(e, { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...rest });
  if (defaultPrevented === true) Object.defineProperty(e, 'defaultPrevented', { value: true });
  Object.defineProperty(e, 'target', { value: target });
  act(() => {
    fake.win.dispatchEvent(e);
  });
}

function click(href: string, init: Partial<ReactMouseEvent> = {}) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  const preventDefault = vi.fn();
  const e = {
    button: 0,
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: a,
    preventDefault,
    ...init,
  } as unknown as ReactMouseEvent;
  return { e, preventDefault };
}

function touch(target: Element, x: number, y: number, count = 1): ReactTouchEvent {
  const pts = Array.from({ length: count }, () => ({ clientX: x, clientY: y }));
  return { target, touches: pts, changedTouches: [{ clientX: x, clientY: y }] } as unknown as ReactTouchEvent;
}

/** A touchend: the lifted finger is in changedTouches and no finger remains. */
function lift(target: Element, x: number, y: number): ReactTouchEvent {
  return { target, touches: [], changedTouches: [{ clientX: x, clientY: y }] } as unknown as ReactTouchEvent;
}

function setup(startHash = '', opts: { scrollTo?: unknown } = {}) {
  const fake = fakeWindow(startHash, opts);
  const rec = recordingScheduler();
  const hook = renderHook(() => usePaging({ scheduler: rec.scheduler, win: fake.win }));
  return { fake, rec, ...hook };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

function setReduced(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe('usePaging', () => {
  it('a visitor Turn writes one pushState and starts the effect timer', () => {
    const { fake, rec, result } = setup('#cover');
    act(() => {
      result.current.go('recipe', 'bar');
    });
    expect(fake.history.calls).toEqual([{ kind: 'push', url: '#recipe' }]);
    expect(result.current.state.current).toBe('recipe');
    expect(result.current.state.leaving).toBe('cover');
    expect(rec.scheduled).toEqual([EFFECT_MS]);
    act(() => {
      rec.fire();
    });
    expect(result.current.state.leaving).toBeNull();
  });

  it('a browser hash change turns and writes nothing', () => {
    const { fake, result } = setup('#cover');
    fake.setHash('#make');
    act(() => {
      fake.win.dispatchEvent(new Event('hashchange'));
    });
    expect(result.current.state.current).toBe('make');
    expect(fake.history.calls).toEqual([]);
  });

  it('repairs an unknown hash with replaceState, on load and on a hash change', () => {
    const { fake, result } = setup('#nope');
    expect(result.current.state.current).toBe('cover');
    expect(fake.history.calls).toEqual([{ kind: 'replace', url: '#cover' }]);
    fake.setHash('#zzz');
    act(() => {
      fake.win.dispatchEvent(new Event('hashchange'));
    });
    expect(fake.history.calls).toHaveLength(2);
    expect(fake.history.calls[1]).toEqual({ kind: 'replace', url: '#cover' });
    expect(result.current.state.current).toBe('cover');
  });

  it('does not handle a modified click or a right click', () => {
    const { fake, result } = setup('#cover');
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 2 }]) {
      const c = click('#run', init);
      act(() => {
        result.current.siteProps.onClick(c.e);
      });
      expect(c.preventDefault).not.toHaveBeenCalled();
    }
    expect(result.current.state.current).toBe('cover');
    expect(fake.history.calls).toEqual([]);
  });

  it('the delegated handler turns for the four hrefs and ignores other hrefs', () => {
    const { rec, result } = setup('#cover');
    for (const [href, page] of [
      ['#recipe', 'recipe'],
      ['#costumes', 'costumes'],
      ['#run', 'run'],
      ['#make', 'make'],
    ] as const) {
      const c = click(href);
      act(() => {
        result.current.siteProps.onClick(c.e);
      });
      expect(c.preventDefault).toHaveBeenCalled();
      expect(result.current.state.current).toBe(page);
      act(() => {
        rec.fire();
      });
    }
    for (const href of ['shell/', '#cover', '#p-mirror']) {
      const c = click(href);
      act(() => {
        result.current.siteProps.onClick(c.e);
      });
      expect(c.preventDefault).not.toHaveBeenCalled();
    }
    const home = click('#cover');
    act(() => {
      result.current.onHome(home.e);
    });
    expect(home.preventDefault).toHaveBeenCalled();
    expect(result.current.state.current).toBe('cover');
  });

  it('keys turn, and are ignored for each ignored target and for modified or repeated keys', () => {
    const { fake, rec, result } = setup('#recipe');
    const body = document.createElement('div');
    press(fake, 'ArrowRight', body);
    expect(result.current.state.current).toBe('costumes');
    act(() => {
      rec.fire();
    });
    press(fake, 'ArrowLeft', body);
    expect(result.current.state.current).toBe('recipe');
    act(() => {
      rec.fire();
    });

    const ignored: Element[] = [];
    for (const tag of ['input', 'textarea', 'select']) ignored.push(document.createElement(tag));
    const range = document.createElement('input');
    range.type = 'range';
    ignored.push(range);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    ignored.push(editable);
    for (const role of ['tab', 'slider', 'switch', 'textbox']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      ignored.push(el);
    }
    for (const el of ignored) press(fake, 'ArrowRight', el);
    press(fake, 'ArrowRight', null);
    press(fake, 'ArrowRight', body, { repeat: true });
    press(fake, 'ArrowRight', body, { shiftKey: true });
    press(fake, 'ArrowRight', body, { defaultPrevented: true });
    press(fake, 'x', body);
    expect(result.current.state.current).toBe('recipe');
    expect(fake.history.calls).toHaveLength(2);
  });

  it('a swipe turns; a short, vertical, multi-finger or slider-start touch does not', () => {
    const { result } = setup('#recipe');
    const area = document.createElement('div');
    const { onTouchStart, onTouchEnd } = result.current.pagesProps;
    act(() => {
      onTouchStart(touch(area, 200, 100));
      onTouchEnd(lift(area, 139, 100));
    });
    expect(result.current.state.current).toBe('costumes');
    act(() => {
      onTouchStart(touch(area, 200, 100));
      onTouchEnd(lift(area, 140, 100));
    });
    expect(result.current.state.current).toBe('costumes');
    act(() => {
      onTouchStart(touch(area, 200, 100, 2));
      onTouchEnd(lift(area, 50, 100));
    });
    expect(result.current.state.current).toBe('costumes');
    const slider = document.createElement('input');
    slider.type = 'range';
    act(() => {
      onTouchStart(touch(slider, 200, 100));
      onTouchEnd(lift(slider, 50, 100));
    });
    expect(result.current.state.current).toBe('costumes');
  });

  it('a throwing or missing scrollTo and a throwing history still turn', () => {
    const thrower = () => {
      throw new Error('no scroll');
    };
    const a = setup('#cover', { scrollTo: thrower });
    act(() => {
      a.result.current.go('recipe', 'bar');
    });
    expect(a.result.current.state.current).toBe('recipe');
    cleanup();

    const b = setup('#cover', { scrollTo: undefined });
    act(() => {
      b.result.current.go('recipe', 'bar');
    });
    expect(b.result.current.state.current).toBe('recipe');
    cleanup();

    const c = setup('#cover');
    (c.fake.win.history as { pushState: unknown }).pushState = thrower;
    act(() => {
      c.result.current.go('recipe', 'bar');
    });
    expect(c.result.current.state.current).toBe('recipe');
  });

  it('scrolls to the top at the start of an accepted Turn only', () => {
    const { fake, result } = setup('#cover');
    act(() => {
      result.current.go('cover', 'bar');
    });
    expect(fake.scrollTo).not.toHaveBeenCalled();
    act(() => {
      result.current.go('make', 'bar');
    });
    expect(fake.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('the live text is empty at first and changes once per accepted Turn', () => {
    const { rec, result } = setup('#cover');
    expect(result.current.liveText).toBe('');
    act(() => {
      result.current.go('recipe', 'bar');
    });
    expect(result.current.liveText).toBe("Page 2 of 5: What's in the skeleton?");
    act(() => {
      result.current.go('make', 'bar'); // held during the effect
    });
    expect(result.current.liveText).toBe("Page 2 of 5: What's in the skeleton?");
    act(() => {
      rec.fire();
    });
    expect(result.current.liveText).toBe('Page 5 of 5: Make your own costume');
  });

  it('under reduced motion a Turn is immediate and sets no timer', () => {
    setReduced(true);
    const { rec, result } = setup('#cover');
    act(() => {
      result.current.go('costumes', 'bar');
    });
    expect(result.current.state.current).toBe('costumes');
    expect(result.current.state.leaving).toBeNull();
    expect(rec.scheduled).toEqual([]);
  });

  it('unmount during an effect leaves no timer and no listener', () => {
    const { fake, rec, result, unmount } = setup('#cover');
    expect(fake.listeners()).toBe(2);
    act(() => {
      result.current.go('recipe', 'bar');
    });
    expect(rec.pending.size).toBe(1);
    unmount();
    expect(rec.pending.size).toBe(0);
    expect(fake.listeners()).toBe(0);
  });

  it('keeps the visibility of the old page until the turn has finished', () => {
    const { rec, result } = setup('#recipe');
    expect(result.current.visibility.current).toBe('recipe');
    act(() => {
      result.current.go('costumes', 'bar');
    });
    expect(result.current.state.current).toBe('costumes');
    expect(result.current.visibility.current).toBe('recipe');
    expect(result.current.visibility.opened.costumes).toBe(false);
    act(() => {
      rec.fire();
    });
    expect(result.current.visibility.current).toBe('costumes');
    expect(result.current.visibility.opened.costumes).toBe(true);
  });

  it('leaves the visibility alone for a request for the current page', () => {
    const { result } = setup('#recipe');
    act(() => {
      result.current.go('recipe', 'bar');
    });
    expect(result.current.visibility.current).toBe('recipe');
  });

  it('writes the scroll offset for the leaving page and clears it after the turn', () => {
    const { fake, rec, result } = setup('#recipe');
    const el = document.createElement('div');
    (result.current.pagesProps.ref as { current: HTMLDivElement | null }).current = el;
    Object.assign(fake.win, { scrollY: 240 });
    act(() => {
      result.current.go('costumes', 'bar');
    });
    expect(el.style.getPropertyValue('--turn-dy')).toBe('-240px');
    expect(fake.scrollTo).toHaveBeenCalledTimes(1);
    act(() => {
      rec.fire();
    });
    expect(el.style.getPropertyValue('--turn-dy')).toBe('');
  });
});

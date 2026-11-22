import { act, cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { PAGES, type PageId } from '../../src/data/pages';
import { EFFECT_MS, formatHash } from '../../src/engine/paging';
import { defaultScheduler } from '../../src/engine/scheduler';

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

interface Timers {
  pending: Map<number, () => void>;
  delays: number[];
  fire(): void;
}

let timers: Timers;
let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let scrollSpy: ReturnType<typeof vi.fn>;
let reducedListeners: (() => void)[];
let reducedMatches: boolean;

function setReduced(value: boolean): void {
  reducedMatches = value;
  act(() => {
    for (const l of [...reducedListeners]) l();
  });
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  reducedListeners = [];
  reducedMatches = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return reducedMatches;
      },
      media: query,
      addEventListener: (_t: string, fn: () => void) => reducedListeners.push(fn),
      removeEventListener: (_t: string, fn: () => void) => {
        reducedListeners = reducedListeners.filter((l) => l !== fn);
      },
    }),
  });
  let next = 1;
  timers = {
    pending: new Map(),
    delays: [],
    fire() {
      for (const [id, fn] of [...this.pending]) {
        this.pending.delete(id);
        fn();
      }
    },
  };
  vi.spyOn(defaultScheduler, 'setTimeout').mockImplementation((fn, ms) => {
    const id = next++;
    // Only the Turn effect timer is tracked; the demos of other pages keep their own timers.
    if (ms === EFFECT_MS) {
      timers.delays.push(ms);
      timers.pending.set(id, fn);
    }
    return id;
  });
  vi.spyOn(defaultScheduler, 'clearTimeout').mockImplementation((id) => {
    timers.pending.delete(id);
  });
  window.history.replaceState(null, '', '#');
  pushSpy = vi.spyOn(window.history, 'pushState');
  replaceSpy = vi.spyOn(window.history, 'replaceState');
  scrollSpy = vi.fn();
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: scrollSpy });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
});

function open(hash: string) {
  window.history.replaceState(null, '', hash);
  pushSpy.mockClear();
  replaceSpy.mockClear();
  return render(<App />);
}

const pageEl = (c: Element, id: PageId) => c.querySelector(`#pages [data-page="${id}"]`) as HTMLElement;
const text = (c: Element, sel: string) => c.querySelector(sel)?.textContent;
const effectClasses = (c: Element) => c.querySelectorAll('.enter-next, .enter-back, .leave-next, .leave-back').length;

/** An anchor outside the Book_Pages; a document listener records the click and stops jsdom from navigating. */
function addAnchor(c: Element, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.textContent = href;
  c.querySelector('.site')?.appendChild(a);
  return a;
}

function click(el: Element, init: MouseEventInit = {}): { prevented: boolean } {
  const seen = { prevented: false };
  const h = (e: Event) => {
    seen.prevented = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', h);
  fireEvent.click(el, { bubbles: true, cancelable: true, ...init });
  document.removeEventListener('click', h);
  return seen;
}

describe('page bar texts', () => {
  PAGES.forEach((p, i) => {
    it(`shows the texts, names, and dots on page ${String(i + 1)} (${p.id})`, () => {
      const { container } = open(`#${p.id}`);
      expect(text(container, '#pgCount')).toBe(`${String(i + 1)} / 5`);
      const prev = container.querySelector<HTMLButtonElement>('#pgPrev');
      const next = container.querySelector<HTMLButtonElement>('#pgNext');
      expect(prev?.disabled).toBe(i === 0);
      expect(next?.disabled).toBe(i === 4);
      expect(text(container, '#pgNextTitle')).toBe(i === 4 ? 'The end' : PAGES[i + 1]?.title);
      const dots = [...container.querySelectorAll('#pgDots .pg-dot')];
      expect(dots).toHaveLength(5);
      dots.forEach((d, j) => {
        expect(d.getAttribute('aria-label')).toBe(`Page ${String(j + 1)}: ${PAGES[j]?.title ?? ''}`);
        expect(d.textContent).toBe(PAGES[j]?.label);
        expect(d.classList.contains('on')).toBe(j === i);
        expect(d.getAttribute('aria-current')).toBe(j === i ? 'page' : null);
      });
      expect(container.querySelectorAll('#pgDots [aria-current]')).toHaveLength(1);
      expect(container.querySelector('.page.on')).toBe(pageEl(container, p.id));
      expect(effectClasses(container)).toBe(0);
      expect(timers.pending.size).toBe(0);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  it('opens on the cover and repairs an empty and an unknown hash with replaceState', () => {
    for (const h of ['', '#nope']) {
      const { container, unmount } = open(h);
      expect(container.querySelector('.page.on')).toBe(pageEl(container, 'cover'));
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(replaceSpy).toHaveBeenCalledWith(null, '', formatHash('cover'));
      expect(pushSpy).not.toHaveBeenCalled();
      unmount();
    }
  });
});

describe('turning', () => {
  it('turns for the four in-page hrefs, preventing the default', () => {
    const { container } = open('#cover');
    const targets: [string, PageId][] = [
      ['#recipe', 'recipe'],
      ['#costumes', 'costumes'],
      ['#run', 'run'],
      ['#make', 'make'],
    ];
    for (const [href, id] of targets) {
      const a = addAnchor(container, href);
      const seen = click(a);
      expect(seen.prevented, href).toBe(true);
      act(() => {
        timers.fire();
      });
      expect(container.querySelector('.page.on'), href).toBe(pageEl(container, id));
      expect(replaceSpy).not.toHaveBeenCalled();
      a.remove();
      act(() => {
        window.history.replaceState(null, '', '#cover');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        timers.fire();
      });
      pushSpy.mockClear();
      replaceSpy.mockClear();
    }
  });

  it('turns to the cover for "Home"', async () => {
    const { container } = open('#make');
    const home = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Home'));
    expect(home).toBeDefined();
    const seen = click(home as Element);
    expect(seen.prevented).toBe(true);
    act(() => {
      timers.fire();
    });
    expect(container.querySelector('.page.on')).toBe(pageEl(container, 'cover'));
    expect(pushSpy).toHaveBeenCalledWith(null, '', formatHash('cover'));
  });

  it('leaves a modified click and a right click to the browser', () => {
    const { container } = open('#cover');
    const a = addAnchor(container, '#recipe');
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 2 }]) {
      expect(click(a, init).prevented).toBe(false);
    }
    expect(container.querySelector('.page.on')).toBe(pageEl(container, 'cover'));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('moves the focus to the arriving heading for a hero button', async () => {
    const user = userEvent.setup();
    const { container } = open('#cover');
    const btn = pageEl(container, 'cover').querySelector('a[href="#recipe"]') as HTMLElement;
    await user.click(btn);
    expect(document.activeElement).toBe(pageEl(container, 'recipe').querySelector('h2'));
  });

  it('keeps the focus on the bar button after a bar click', async () => {
    const user = userEvent.setup();
    const { container } = open('#cover');
    const next = container.querySelector<HTMLElement>('#pgNext') as HTMLElement;
    await user.click(next);
    expect(container.querySelector('.page.on')).not.toBeNull();
    expect(document.activeElement).toBe(next);
    const dot = container.querySelectorAll<HTMLElement>('#pgDots .pg-dot')[3] as HTMLElement;
    await user.click(dot);
    expect(document.activeElement).toBe(dot);
  });

  it('leaves the focus alone for a key with the focus outside the pages', async () => {
    const user = userEvent.setup();
    const { container } = open('#cover');
    expect(document.activeElement).toBe(document.body);
    await user.keyboard('{ArrowRight}');
    expect(container.querySelector('.page.enter-next')).toBe(pageEl(container, 'recipe'));
    expect(document.activeElement).toBe(document.body);
  });

  it('moves the focus to the heading for a key with the focus inside the leaving page', async () => {
    const user = userEvent.setup();
    const { container } = open('#cover');
    pageEl(container, 'cover').querySelector<HTMLElement>('a[href="#run"]')?.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(pageEl(container, 'recipe').querySelector('h2'));
  });

  it('scrolls to the top at the start of a Turn, before the effect ends', () => {
    const { container } = open('#cover');
    act(() => {
      fireEvent.click(container.querySelector('#pgNext') as Element);
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    expect(timers.pending.size).toBe(1);
  });

  it('writes one pushState per Turn', () => {
    const { container } = open('#cover');
    fireEvent.click(container.querySelector('#pgNext') as Element);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(null, '', formatHash('recipe'));
  });
});

describe('live regions', () => {
  it('keeps #pgLive empty before the first Turn, then announces the page', () => {
    const { container } = open('#cover');
    const live = container.querySelector('#pgLive');
    expect(live).not.toBeNull();
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toBe('');
    fireEvent.click(container.querySelector('#pgNext') as Element);
    expect(live?.textContent).toBe("Page 2 of 5: What's in the skeleton?");
  });

  it('keeps #sayt the one region of the Live_Section', () => {
    const { container } = open('#run');
    expect(container.querySelectorAll('#run [aria-live], #pages [aria-live]')).toHaveLength(1);
    expect(container.querySelector('#pages #sayt[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('#pgLive')?.closest('#pages')).toBeNull();
  });
});

describe('effects', () => {
  it('marks the leaving page inert during the effect and leaves no class at rest', () => {
    const { container } = open('#cover');
    fireEvent.click(container.querySelector('#pgNext') as Element);
    const leaving = pageEl(container, 'cover');
    const arriving = pageEl(container, 'recipe');
    expect(leaving.classList.contains('leave-next')).toBe(true);
    expect(leaving.hasAttribute('inert')).toBe(true);
    expect(arriving.classList.contains('enter-next')).toBe(true);
    expect(arriving.hasAttribute('inert')).toBe(false);
    expect(timers.delays).toEqual([EFFECT_MS]);
    act(() => {
      timers.fire();
    });
    expect(effectClasses(container)).toBe(0);
    expect(container.querySelectorAll('.page.on')).toHaveLength(1);
    expect(container.querySelectorAll('.page:not([inert])')).toHaveLength(1);
  });

  it('turns at once and sets no timer with reduced motion', () => {
    reducedMatches = true;
    const { container } = open('#cover');
    const next = container.querySelector('#pgNext') as Element;
    fireEvent.click(next);
    fireEvent.click(next);
    expect(timers.delays).toEqual([]);
    expect(effectClasses(container)).toBe(0);
    expect(container.querySelector('.page.on')).toBe(pageEl(container, 'costumes'));
    expect(text(container, '#pgCount')).toBe('3 / 5');
  });

  it('applies a change of the setting from the next Turn', () => {
    const { container } = open('#cover');
    fireEvent.click(container.querySelector('#pgNext') as Element);
    expect(timers.delays).toEqual([EFFECT_MS]);
    setReduced(true);
    expect(effectClasses(container)).toBe(0);
    expect(timers.pending.size).toBe(0);
    fireEvent.click(container.querySelector('#pgNext') as Element);
    expect(timers.delays).toEqual([EFFECT_MS]);
    expect(container.querySelector('.page.on')).toBe(pageEl(container, 'costumes'));
    expect(effectClasses(container)).toBe(0);
    setReduced(false);
    fireEvent.click(container.querySelector('#pgNext') as Element);
    expect(timers.delays).toEqual([EFFECT_MS, EFFECT_MS]);
    expect(effectClasses(container)).toBeGreaterThan(0);
  });
});

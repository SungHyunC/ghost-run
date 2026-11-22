import { act, cleanup, createEvent, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { PAGE_IDS, PAGES, type PageId } from '../../src/data/pages';
import { EFFECT_MS, formatHash, parseHash } from '../../src/engine/paging';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

// Feature: site-pages, Property Pg1 (exactly one page is active and reachable) and Pg2 (hash and page agree)
// **Validates: Requirements 3.3, 3.5, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3**

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

type Source = 'bar' | 'key' | 'swipe' | 'link' | 'hash';

type Action =
  | { kind: 'back' }
  | { kind: 'next' }
  | { kind: 'dot'; to: PageId }
  | { kind: 'key'; key: string }
  | { kind: 'swipe'; dir: -1 | 1 }
  | { kind: 'link'; href: '#recipe' | '#costumes' | '#run' | '#make' | 'home' }
  | { kind: 'hash'; hash: string }
  | { kind: 'end' };

const pageArb = fc.constantFrom(...PAGE_IDS);
const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ kind: 'back' }),
  fc.constant<Action>({ kind: 'next' }),
  pageArb.map<Action>((to) => ({ kind: 'dot', to })),
  fc.constantFrom('ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp').map<Action>((key) => ({ kind: 'key', key })),
  fc.constantFrom<-1 | 1>(-1, 1).map<Action>((dir) => ({ kind: 'swipe', dir })),
  fc.constantFrom('#recipe', '#costumes', '#run', '#make', 'home').map<Action>((href) => ({ kind: 'link', href: href as never })),
  fc
    .oneof(pageArb.map(formatHash), fc.constantFrom('', '#', '#nope', '#Recipe', '#recipe2'))
    .map<Action>((hash) => ({ kind: 'hash', hash })),
  fc.constant<Action>({ kind: 'end' }),
  fc.constant<Action>({ kind: 'end' }),
);

/** An independent model of the Turn rules, written from the requirements. */
interface Model {
  cur: PageId;
  leaving: PageId | null;
  held: { to: PageId; source: Source } | null;
  pushes: number;
  announced: PageId | null;
}

function modelRequest(m: Model, to: PageId, source: Source, reduced: boolean): void {
  if (m.leaving !== null) {
    m.held = { to, source };
    return;
  }
  if (to === m.cur) return;
  accept(m, to, source, reduced);
}

function accept(m: Model, to: PageId, source: Source, reduced: boolean): void {
  if (source !== 'hash') m.pushes++;
  m.announced = to;
  m.leaving = reduced ? null : m.cur;
  m.cur = to;
}

function modelEnd(m: Model, reduced: boolean): void {
  m.leaving = null;
  const held = m.held;
  m.held = null;
  if (held !== null && held.to !== m.cur) accept(m, held.to, held.source, reduced);
}

interface Env {
  pending: Map<number, () => void>;
  scheduled: number;
  calls: { kind: 'push' | 'replace'; url: string }[];
  trustedHashChanges: number;
  setBrowserHash(hash: string): void;
}

const real = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  pushState: window.history.pushState.bind(window.history),
  replaceState: window.history.replaceState.bind(window.history),
};

function installEnv(startHash: string, reduced: boolean): Env {
  const env: Env = {
    pending: new Map(),
    scheduled: 0,
    calls: [],
    trustedHashChanges: 0,
    setBrowserHash(hash) {
      real.replaceState(null, '', hash === '' ? window.location.pathname + window.location.search : hash);
    },
  };
  let next = 1;
  vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === EFFECT_MS) {
      const id = -next++;
      env.scheduled++;
      env.pending.set(id, fn);
      return id;
    }
    return real.setTimeout(fn, ms, ...rest);
  }) as typeof setTimeout);
  vi.stubGlobal('clearTimeout', ((id?: number) => {
    if (typeof id === 'number' && id < 0) env.pending.delete(id);
    else real.clearTimeout(id);
  }) as typeof clearTimeout);
  vi.spyOn(window.history, 'pushState').mockImplementation((_d, _u, url) => {
    env.calls.push({ kind: 'push', url: String(url) });
  });
  vi.spyOn(window.history, 'replaceState').mockImplementation((_d, _u, url) => {
    env.calls.push({ kind: 'replace', url: String(url) });
  });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  env.setBrowserHash(startHash);
  return env;
}

function pageEls(container: HTMLElement): HTMLElement[] {
  return PAGE_IDS.map((id) => container.querySelector<HTMLElement>(`#pages > [data-page="${id}"]`) as HTMLElement);
}

function perform(container: HTMLElement, env: Env, a: Action): { name: PageId | null; source: Source | null } | 'end' | 'none' {
  const q = <T extends Element>(sel: string): T => container.querySelector<T>(sel) as T;
  switch (a.kind) {
    case 'back':
      fireEvent.click(q('#pgPrev'));
      return 'none';
    case 'next':
      fireEvent.click(q('#pgNext'));
      return 'none';
    case 'dot':
      fireEvent.click(container.querySelectorAll('#pgDots .pg-dot')[PAGE_IDS.indexOf(a.to)] as Element);
      return 'none';
    case 'key':
      fireEvent.keyDown(document.body, { key: a.key });
      return 'none';
    case 'swipe': {
      const pages = q('#pages');
      const start = createEvent.touchStart(pages);
      Object.defineProperty(start, 'touches', { value: [{ clientX: 200, clientY: 100 }] });
      fireEvent(pages, start);
      const end = createEvent.touchEnd(pages);
      Object.defineProperty(end, 'touches', { value: [] });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 200 + (a.dir === 1 ? -150 : 150), clientY: 100 }] });
      fireEvent(pages, end);
      return 'none';
    }
    case 'link': {
      let el =
        a.href === 'home'
          ? [...container.querySelectorAll<HTMLAnchorElement>('.nav-links a')].find((x) => x.textContent === 'Home')
          : container.querySelector<HTMLAnchorElement>(`a[href="${a.href}"]`);
      if (el === undefined || el === null) {
        // The page has no anchor for this href (only #recipe, #run, #make exist); add one inside the pages.
        el = document.createElement('a');
        el.setAttribute('href', a.href);
        q('#pages').appendChild(el);
      }
      fireEvent.click(el);
      return 'none';
    }
    case 'hash':
      env.setBrowserHash(a.hash);
      fireEvent(window, new Event('hashchange'));
      return 'none';
    case 'end':
      return 'end';
  }
}

function checkBar(container: HTMLElement, cur: PageId): void {
  const i = PAGE_IDS.indexOf(cur);
  expect(container.querySelector('#pgCount')?.textContent).toBe(`${String(i + 1)} / 5`);
  expect(container.querySelector('#pgNextTitle')?.textContent).toBe(PAGES[i + 1]?.title ?? 'The end');
  expect((container.querySelector('#pgPrev') as HTMLButtonElement).disabled).toBe(i === 0);
  expect((container.querySelector('#pgNext') as HTMLButtonElement).disabled).toBe(i === 4);
  const dots = [...container.querySelectorAll('#pgDots .pg-dot')];
  expect(dots).toHaveLength(5);
  dots.forEach((d, n) => {
    expect(d.getAttribute('aria-current')).toBe(n === i ? 'page' : null);
    expect(d.classList.contains('on')).toBe(n === i);
  });
  expect(container.querySelectorAll('#pgDots [aria-current]')).toHaveLength(1);
}

function checkLive(container: HTMLElement, announced: PageId | null): void {
  const live = container.querySelector('#pgLive') as HTMLElement;
  expect(live.getAttribute('aria-live')).toBe('polite');
  const expected =
    announced === null ? '' : `Page ${String(PAGE_IDS.indexOf(announced) + 1)} of 5: ${PAGES[PAGE_IDS.indexOf(announced)]?.title ?? ''}`;
  expect(live.textContent).toBe(expected);
}

function checkDuringEffect(container: HTMLElement, m: Model): void {
  const els = pageEls(container);
  els.forEach((el, n) => {
    const id = PAGE_IDS[n] as PageId;
    if (id === m.cur) expect(el.hasAttribute('inert')).toBe(false);
    else expect(el.hasAttribute('inert'), id).toBe(true);
    const inLayout = el.className !== 'page';
    expect(inLayout, id).toBe(id === m.cur || id === m.leaving);
  });
}

function checkAtRest(container: HTMLElement, m: Model): void {
  const els = pageEls(container);
  expect(els.filter((el) => !el.hasAttribute('inert'))).toHaveLength(1);
  els.forEach((el, n) => {
    const id = PAGE_IDS[n] as PageId;
    if (id === m.cur) {
      expect(el.hasAttribute('inert')).toBe(false);
      expect(el.className).toBe('page on');
    } else {
      expect(el.hasAttribute('inert'), id).toBe(true);
      expect(el.className, id).toBe('page');
    }
    for (const c of ['leave-next', 'enter-next', 'leave-back', 'enter-back']) expect(el.classList.contains(c)).toBe(false);
  });
  checkBar(container, m.cur);
  checkLive(container, m.announced);
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
  real.replaceState(null, '', window.location.pathname);
});

describe('Pg1 and Pg2: paging through App', () => {
  it(
    'keeps one reachable page, and the hash and the page agree',
    () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.oneof(pageArb.map(formatHash), fc.constantFrom('', '#nope', '#')),
          fc.array(actionArb, { maxLength: 14 }),
          (reduced, startHash, actions) => {
            const env = installEnv(startHash, reduced);
            const hashEvents = (e: Event) => {
              if (e.isTrusted) env.trustedHashChanges++;
            };
            window.addEventListener('hashchange', hashEvents);
            const { container, unmount } = render(<App />);
            try {
              const start = parseHash(startHash) ?? 'cover';
              const m: Model = { cur: start, leaving: null, held: null, pushes: 0, announced: null };
              let browserHash = startHash;
              // The last hash written by the page or observed from the browser, in time order.
              let observed = startHash;
              let seenCalls = 0;
              const sync = () => {
                if (env.calls.length > seenCalls) {
                  observed = (env.calls[env.calls.length - 1] as { url: string }).url;
                  seenCalls = env.calls.length;
                }
              };
              // Take in the mount-time address repair now, so it is not mistaken for a later write.
              sync();
              checkLive(container, null);
              expect(container.querySelector('#pgLive')?.textContent).toBe('');
              checkAtRest(container, m);
              const settle = () => {
                // Fire effect-end events until none is pending (a held Turn starts a new effect).
                for (let guard = 0; guard < 20 && env.pending.size > 0; guard++) {
                  const [id, fn] = [...env.pending][0] as [number, () => void];
                  env.pending.delete(id);
                  act(() => {
                    fn();
                  });
                  modelEnd(m, reduced);
                  sync();
                }
              };
              for (const a of actions) {
                if (a.kind === 'end') {
                  const entry = [...env.pending][0];
                  if (entry !== undefined) {
                    env.pending.delete(entry[0]);
                    act(() => {
                      entry[1]();
                    });
                    modelEnd(m, reduced);
                  }
                } else {
                  switch (a.kind) {
                    case 'back':
                    case 'next': {
                      const i = PAGE_IDS.indexOf(m.cur) + (a.kind === 'next' ? 1 : -1);
                      const to = PAGE_IDS[i];
                      if (to !== undefined) modelRequest(m, to, 'bar', reduced);
                      break;
                    }
                    case 'dot':
                      modelRequest(m, a.to, 'bar', reduced);
                      break;
                    case 'key': {
                      const d = a.key === 'ArrowRight' || a.key === 'PageDown' ? 1 : -1;
                      const to = PAGE_IDS[PAGE_IDS.indexOf(m.cur) + d];
                      if (to !== undefined) modelRequest(m, to, 'key', reduced);
                      break;
                    }
                    case 'swipe': {
                      const to = PAGE_IDS[PAGE_IDS.indexOf(m.cur) + a.dir];
                      if (to !== undefined) modelRequest(m, to, 'swipe', reduced);
                      break;
                    }
                    case 'link':
                      modelRequest(m, a.href === 'home' ? 'cover' : (a.href.slice(1) as PageId), 'link', reduced);
                      break;
                    case 'hash': {
                      browserHash = a.hash;
                      observed = a.hash;
                      const id = parseHash(a.hash);
                      if (id !== null) modelRequest(m, id, 'hash', reduced);
                      else m.held = null;
                      break;
                    }
                  }
                  const outcome = perform(container, env, a);
                  expect(outcome).toBe('none');
                }
                sync();
                // (g) with Reduced_Motion on, no timer is ever set and nothing is leaving.
                if (reduced) {
                  expect(env.scheduled).toBe(0);
                  expect(m.leaving).toBeNull();
                }
                // (b) while an effect runs.
                if (m.leaving !== null) checkDuringEffect(container, m);
                checkBar(container, m.cur);
                checkLive(container, m.announced);
                expect(env.pending.size > 0).toBe(m.leaving !== null);
              }
              settle();
              // (a) to (f): the state after the last effect-end.
              checkAtRest(container, m);
              expect(env.pending.size).toBe(0);
              // Pg2: one pushState per accepted Turn from a visitor; none for a browser hash change.
              expect(env.calls.filter((c) => c.kind === 'push')).toHaveLength(m.pushes);
              for (const c of env.calls) expect(parseHash(c.url)).not.toBeNull();
              // The last hash written or observed names the current page.
              sync();
              expect(observed).toBe(formatHash(m.cur));
              // The page never assigned `location.hash`: the real location holds only what the test set.
              const expectedLoc = browserHash === '' ? '' : browserHash === '#' ? '' : browserHash;
              expect(window.location.hash).toBe(expectedLoc);
              expect(env.trustedHashChanges).toBe(0);
            } finally {
              unmount();
              window.removeEventListener('hashchange', hashEvents);
            }
            // (h) after unmount no timer is pending.
            expect(env.pending.size).toBe(0);
            cleanup();
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
            Reflect.deleteProperty(window, 'matchMedia');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('has a dot press for every ordered pair of pages (enumerated)', () => {
    for (const from of PAGE_IDS) {
      for (const to of PAGE_IDS) {
        const env = installEnv(formatHash(from), true);
        const { container, unmount } = render(<App />);
        fireEvent.click(container.querySelectorAll('#pgDots .pg-dot')[PAGE_IDS.indexOf(to)] as Element);
        const on = pageEls(container).filter((el) => !el.hasAttribute('inert'));
        expect(on.map((el) => el.dataset['page'])).toEqual([to]);
        expect(env.scheduled).toBe(0);
        unmount();
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(window, 'matchMedia');
      }
    }
  });
});

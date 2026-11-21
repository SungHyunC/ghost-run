// The paging hook (design Component 3): runs the pure model of paging.ts and the input rules of
// paging-input.ts against the browser. All timers go through the injected Scheduler.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject, TouchEvent as ReactTouchEvent } from 'react';
import { PAGE_IDS, PAGES, type PageId } from '../data/pages';
import {
  EFFECT_MS,
  formatHash,
  initialState,
  parseHash,
  transition,
  type PageVisibility,
  type PagingEffects,
  type PagingEvent,
  type PagingState,
  type Source,
} from './paging';
import { ignoreKey, ignoreSwipeStart, keyToStep, linkPage, swipeStep, type TouchPoint } from './paging-input';
import { defaultScheduler, type Scheduler } from './scheduler';
import { useReducedMotion } from './useReducedMotion';

export interface UsePagingOptions {
  scheduler?: Scheduler;
  win?: Window;
  doc?: Document;
}

export interface Paging {
  state: PagingState;
  visibility: PageVisibility;
  /** "Page N of 5: <title>"; empty until the first Turn. */
  liveText: string;
  go(to: PageId, source: Source): void;
  step(delta: -1 | 1, source: Source): void;
  siteProps: { onClick(e: ReactMouseEvent): void };
  /** Click handler of the nav link "Home". */
  onHome(e: ReactMouseEvent): void;
  pagesProps: {
    ref: RefObject<HTMLDivElement | null>;
    onTouchStart(e: ReactTouchEvent): void;
    onTouchEnd(e: ReactTouchEvent): void;
    onTouchCancel(e: ReactTouchEvent): void;
  };
}

function plainLeftClick(e: ReactMouseEvent): boolean {
  return e.button === 0 && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

export function usePaging(options: UsePagingOptions = {}): Paging {
  const scheduler = options.scheduler ?? defaultScheduler;
  const win = options.win ?? window;
  const doc = options.doc ?? win.document;
  const reduced = useReducedMotion();

  const init = useRef<ReturnType<typeof initialState> | null>(null);
  init.current ??= initialState(win.location.hash);
  const [state, setState] = useState<PagingState>(init.current.state);
  const stateRef = useRef<PagingState>(init.current.state);
  const [liveText, setLiveText] = useState('');

  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const timerRef = useRef<number | null>(null);
  const focusRef = useRef<PageId | null>(null);
  const linkInPagesRef = useRef(false);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<TouchPoint | null>(null);

  // Latest dispatch for the timer callback and the window listeners, which are attached once.
  const dispatchRef = useRef<(e: PagingEvent) => void>(() => undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      scheduler.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [scheduler]);

  const writeHash = useCallback(
    (kind: 'push' | 'replace', id: PageId) => {
      try {
        if (kind === 'push') win.history.pushState(null, '', formatHash(id));
        else win.history.replaceState(null, '', formatHash(id));
      } catch {
        // A missing or throwing history API is skipped.
      }
    },
    [win],
  );

  const focusWanted = useCallback(
    (source: Source, from: PageId): boolean => {
      if (source === 'link' && linkInPagesRef.current) return true;
      const active = doc.activeElement;
      const leaving = pagesRef.current?.querySelector(`[data-page="${from}"]`) ?? null;
      return active !== null && leaving !== null && leaving.contains(active);
    },
    [doc],
  );

  const runEffects = useCallback(
    (effects: PagingEffects, next: PagingState, wantFocus: boolean) => {
      if (effects.hash !== null) writeHash(effects.hash, next.current);
      if (effects.announce !== null) {
        const n = PAGE_IDS.indexOf(effects.announce);
        setLiveText(`Page ${String(n + 1)} of ${String(PAGE_IDS.length)}: ${PAGES[n]?.title ?? ''}`);
      }
      if (effects.scrollTop) {
        try {
          win.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch {
          // A missing or throwing scrollTo is skipped.
        }
      }
      if (effects.startTimer) {
        clearTimer();
        timerRef.current = scheduler.setTimeout(() => {
          timerRef.current = null;
          dispatchRef.current({ type: 'effect-end', reduced: reducedRef.current });
        }, EFFECT_MS);
      }
      if (wantFocus && effects.announce !== null) focusRef.current = effects.announce;
    },
    [clearTimer, scheduler, win, writeHash],
  );

  const dispatch = useCallback(
    (event: PagingEvent) => {
      const prev = stateRef.current;
      let source: Source | null = null;
      if (event.type === 'request') source = event.source;
      else if (event.type === 'effect-end') source = prev.held?.source ?? null;
      const result = transition(prev, event);
      stateRef.current = result.state;
      if (result.state !== prev) setState(result.state);
      const accepted = result.effects.announce !== null;
      const wantFocus = accepted && source !== null && focusWanted(source, prev.current);
      runEffects(result.effects, result.state, wantFocus);
    },
    [focusWanted, runEffects],
  );
  dispatchRef.current = dispatch;

  const go = useCallback(
    (to: PageId, source: Source) => {
      dispatch({ type: 'request', to, source, reduced: reducedRef.current });
    },
    [dispatch],
  );

  const step = useCallback(
    (delta: -1 | 1, source: Source) => {
      const to = PAGE_IDS[PAGE_IDS.indexOf(stateRef.current.current) + delta];
      if (to !== undefined) go(to, source);
    },
    [go],
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  // Repair an empty or unknown address once after mount.
  useEffect(() => {
    if (init.current?.repairHash === true) writeHash('replace', stateRef.current.current);
  }, [writeHash]);

  // Window listeners: one keydown, one hashchange. Unmount clears the timer and both listeners.
  useEffect(() => {
    const onKey = (ev: Event) => {
      const e = ev as KeyboardEvent;
      const delta = keyToStep(e.key);
      if (delta === 0) return;
      const t = e.target as Element | null;
      const target =
        t === null || typeof t.tagName !== 'string'
          ? null
          : { tagName: t.tagName, isContentEditable: (t as HTMLElement).isContentEditable === true, role: t.getAttribute('role') };
      const ignored = ignoreKey({
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        repeat: e.repeat,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        target,
      });
      if (ignored) return;
      linkInPagesRef.current = false;
      stepRef.current(delta, 'key');
    };
    const onHash = () => {
      const id = parseHash(win.location.hash);
      linkInPagesRef.current = false;
      if (id === null) dispatchRef.current({ type: 'bad-hash' });
      else dispatchRef.current({ type: 'request', to: id, source: 'hash', reduced: reducedRef.current });
    };
    win.addEventListener('keydown', onKey);
    win.addEventListener('hashchange', onHash);
    return () => {
      win.removeEventListener('keydown', onKey);
      win.removeEventListener('hashchange', onHash);
      clearTimer();
    };
  }, [win, clearTimer]);

  // Turning Reduced_Motion on during an effect ends the effect at once.
  useEffect(() => {
    if (reduced && stateRef.current.leaving !== null) {
      clearTimer();
      dispatchRef.current({ type: 'effect-end', reduced: true });
    }
  }, [reduced, clearTimer]);

  // Focus the arriving heading after the state is committed.
  useLayoutEffect(() => {
    const id = focusRef.current;
    if (id === null) return;
    focusRef.current = null;
    const heading = doc.querySelector<HTMLElement>(`#pages [data-page="${id}"] :is(h1, h2)`);
    heading?.focus({ preventScroll: true });
  }, [state, doc]);

  const onClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!plainLeftClick(e)) return;
      const t = e.target as Element | null;
      const anchor = t !== null && typeof t.closest === 'function' ? t.closest('a') : null;
      if (anchor === null) return;
      const id = linkPage(anchor.getAttribute('href'));
      if (id === null) return;
      e.preventDefault();
      linkInPagesRef.current = anchor.closest('#pages') !== null;
      go(id, 'link');
    },
    [go],
  );

  const onHome = useCallback(
    (e: ReactMouseEvent) => {
      if (!plainLeftClick(e)) return;
      e.preventDefault();
      linkInPagesRef.current = false;
      go('cover', 'link');
    },
    [go],
  );

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    const first = e.touches[0];
    const t = e.target as Element | null;
    if (e.touches.length !== 1 || first === undefined || t === null || typeof t.tagName !== 'string') {
      touchStartRef.current = null;
      return;
    }
    const ignore = ignoreSwipeStart({
      tagName: t.tagName,
      role: t.getAttribute('role'),
      insideSlider: t.closest('[role="slider"]') !== null,
    });
    touchStartRef.current = ignore ? null : { x: first.clientX, y: first.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const end = e.changedTouches[0];
      if (start === null || end === undefined || e.touches.length > 0) return;
      const delta = swipeStep(start, { x: end.clientX, y: end.clientY });
      if (delta === 0) return;
      linkInPagesRef.current = false;
      step(delta, 'swipe');
    },
    [step],
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  const visibility = useMemo<PageVisibility>(
    () => ({ current: state.current, opened: state.opened }),
    [state],
  );

  return {
    state,
    visibility,
    liveText,
    go,
    step,
    siteProps: { onClick },
    onHome,
    pagesProps: { ref: pagesRef, onTouchStart, onTouchEnd, onTouchCancel },
  };
}

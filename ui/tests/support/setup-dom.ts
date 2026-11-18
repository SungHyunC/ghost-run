// Setup file of the `dom` project. No jest-dom is installed.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

type Listener = (event: { matches: boolean; media: string }) => void;

const state = { reduced: false };
const listeners = new Map<string, Set<Listener>>();

function matches(query: string): boolean {
  return /prefers-reduced-motion:\s*reduce/.test(query) ? state.reduced : false;
}

/** Drive `(prefers-reduced-motion: reduce)` and notify subscribed listeners. */
export function setReducedMotion(reduced: boolean): void {
  state.reduced = reduced;
  for (const [media, set] of listeners) {
    for (const l of [...set]) l({ matches: matches(media), media });
  }
}

/** Number of live change listeners, for unsubscribe checks. */
export function matchMediaListenerCount(): number {
  let n = 0;
  for (const set of listeners.values()) n += set.size;
  return n;
}

function matchMediaStub(query: string) {
  const mql = {
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addEventListener(type: string, l: Listener) {
      if (type !== 'change') return;
      let set = listeners.get(query);
      if (!set) listeners.set(query, (set = new Set()));
      set.add(l);
    },
    removeEventListener(type: string, l: Listener) {
      if (type === 'change') listeners.get(query)?.delete(l);
    },
    addListener(l: Listener) {
      mql.addEventListener('change', l);
    },
    removeListener(l: Listener) {
      mql.removeEventListener('change', l);
    },
    dispatchEvent() {
      return true;
    },
  };
  return mql;
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: matchMediaStub,
});

afterEach(() => {
  state.reduced = false;
  listeners.clear();
});

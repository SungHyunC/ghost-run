import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const m = media();
  if (m === null || typeof m.addEventListener !== 'function') return () => {};
  m.addEventListener('change', onChange);
  return () => {
    m.removeEventListener('change', onChange);
  };
}

/** True while the user prefers reduced motion. False when `matchMedia` is missing (jsdom, server). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches === true,
    () => false,
  );
}

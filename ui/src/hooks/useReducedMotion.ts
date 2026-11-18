import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const media = getMedia();
  if (media === null || typeof media.addEventListener !== 'function') return () => {};
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return getMedia()?.matches === true;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True while the user prefers reduced motion. False on the server and when `matchMedia` is missing. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Selectors of the two fixed-height parts of the window that the page height subtracts. */
const PARTS = [
  { selector: '.nav', property: '--nav-h' },
  { selector: '.pagebar', property: '--bar-h' },
] as const;

/**
 * Writes the real height of the nav and of the page bar to `--nav-h` and `--bar-h` on the root element,
 * once on mount and again whenever either part changes size. The CSS keeps fixed fallbacks for the first
 * paint and for no-JS, so a page is exactly one window tall (no 1 px scroll) whatever font the system uses.
 */
export function useChromeHeights(rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const elements = PARTS.map((p) => ({ ...p, el: root.querySelector<HTMLElement>(p.selector) }));
    const measure = () => {
      for (const { el, property } of elements) {
        if (el === null) continue;
        const h = el.getBoundingClientRect().height;
        if (h > 0) root.style.setProperty(property, `${String(h)}px`);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }
    const observer = new ResizeObserver(measure);
    for (const { el } of elements) if (el !== null) observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [rootRef]);
}

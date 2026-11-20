import { useEffect, useState, type RefObject } from 'react';

export type InViewState = 'pending' | 'seen' | 'unsupported';

export const IN_VIEW_THRESHOLD = 0.25;

export interface InViewOptions {
  /** Margin around the viewport, as the CSS `margin` syntax; used to report "near" before the element is visible. */
  rootMargin?: string;
  /** Fraction of the element that must be in view; defaults to 25%. */
  threshold?: number;
}

/**
 * Reports 'seen' once the element has been at least `threshold` (default 25%) in view, inside the viewport
 * grown by `rootMargin`, for the first time. The observer disconnects after that first hit. Reports
 * 'unsupported' when `IntersectionObserver` is missing.
 */
export function useInView(ref: RefObject<Element | null>, options: InViewOptions = {}): InViewState {
  const { rootMargin, threshold = IN_VIEW_THRESHOLD } = options;
  const [seen, setSeen] = useState(false);
  const supported = typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    const el = ref.current;
    if (!supported || el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          setSeen(true);
        }
      },
      rootMargin === undefined ? { threshold } : { threshold, rootMargin },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, supported, rootMargin, threshold]);

  if (!supported) return 'unsupported';
  return seen ? 'seen' : 'pending';
}

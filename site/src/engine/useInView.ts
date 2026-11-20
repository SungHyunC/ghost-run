import { useEffect, useState, type RefObject } from 'react';

export type InViewState = 'pending' | 'seen' | 'unsupported';

export const IN_VIEW_THRESHOLD = 0.25;

/**
 * Reports 'seen' once the element has been at least 25% in view for the first time.
 * The observer disconnects after that first hit. Reports 'unsupported' when
 * `IntersectionObserver` is missing.
 */
export function useInView(ref: RefObject<Element | null>): InViewState {
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
      { threshold: IN_VIEW_THRESHOLD },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, supported]);

  if (!supported) return 'unsupported';
  return seen ? 'seen' : 'pending';
}

import { useReducedMotion } from '../../hooks/useReducedMotion';

export type FlameState = 'lit' | 'flickering' | 'out';

/** Decorative candle art. The lit, flickering, and out shapes differ without motion. */
export function FlameArt({ state }: { readonly state: FlameState }) {
  const reduce = useReducedMotion();
  return (
    <svg
      className="gk-candle-art"
      viewBox="0 0 48 72"
      aria-hidden="true"
      focusable="false"
      data-flame={state}
      data-motion={reduce ? 'reduce' : undefined}
    >
      <rect className="gk-candle-body" x="14" y="36" width="20" height="30" rx="3" />
      <path className="gk-candle-body" d="M8 68h32" fill="none" />
      <path className="gk-candle-body" d="M24 36v-5" fill="none" />
      {state === 'out' ? (
        <path className="gk-wisp" d="M24 30c-5-3-5-7 0-10s5-7 0-10" />
      ) : (
        <>
          <g className="gk-flame">
            <path d="M24 6c6 7 9 12 9 17a9 9 0 0 1-18 0c0-5 3-10 9-17z" />
            <path d="M24 16c3 3.5 4.5 6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.5 1.5-5 4.5-8.5z" />
          </g>
          {state === 'flickering' ? (
            <path d="M10 14l5 3M38 14l-5 3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          ) : null}
        </>
      )}
    </svg>
  );
}

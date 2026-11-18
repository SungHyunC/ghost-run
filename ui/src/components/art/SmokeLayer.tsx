import { useReducedMotion } from '../../hooks/useReducedMotion';

/** Decorative smoke behind cell text. Never contains a path or a count. */
export function SmokeLayer() {
  const reduce = useReducedMotion();
  return (
    <svg
      className="gk-smoke"
      viewBox="0 0 96 24"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-motion={reduce ? 'reduce' : undefined}
    >
      <circle cx="14" cy="14" r="8" />
      <circle cx="34" cy="10" r="9" />
      <circle cx="56" cy="14" r="8" />
      <circle cx="76" cy="9" r="7" />
      <circle cx="88" cy="15" r="5" />
    </svg>
  );
}

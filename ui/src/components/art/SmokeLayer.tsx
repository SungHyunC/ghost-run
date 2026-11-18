import { useReducedMotion } from '../../hooks/useReducedMotion';

/** Small, faint decorative smoke in the reserved corner of the cell, outside the text area. Never contains a path or a count. */
export function SmokeLayer() {
  const reduce = useReducedMotion();
  return (
    <svg
      className="gk-smoke"
      viewBox="0 0 40 24"
      preserveAspectRatio="xMaxYMin meet"
      aria-hidden="true"
      focusable="false"
      data-motion={reduce ? 'reduce' : undefined}
    >
      <circle cx="10" cy="15" r="4" />
      <circle cx="20" cy="10" r="5" />
      <circle cx="31" cy="14" r="3.5" />
    </svg>
  );
}

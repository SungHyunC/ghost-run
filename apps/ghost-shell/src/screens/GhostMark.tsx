/** The small ghost of the brand and the empty states. Decorative: hidden from assistive technology. */
export function GhostMark({ className }: { readonly className?: string }) {
  return (
    <svg className={className === undefined ? 'gs-mark' : `gs-mark ${className}`} viewBox="-30 -38 60 72" aria-hidden="true" focusable="false">
      <path
        className="gs-mark-body"
        d="M-24 26 L-24 -6 C-24 -22 -13 -33 0 -33 C13 -33 24 -22 24 -6 L24 26 Q20 33 16 27 Q12 21 8 27 Q4 33 0 27 Q-4 21 -8 27 Q-12 33 -16 27 Q-20 21 -24 26 Z"
      />
      <ellipse cx={-8} cy={-8} rx={3.6} ry={5.2} className="gs-mark-eye" />
      <ellipse cx={8} cy={-8} rx={3.6} ry={5.2} className="gs-mark-eye" />
      <ellipse cx={0} cy={5} rx={3} ry={3.4} className="gs-mark-eye" />
    </svg>
  );
}

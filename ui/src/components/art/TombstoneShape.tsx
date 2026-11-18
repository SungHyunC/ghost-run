/** Decorative tombstone: an arch, a base line, and inscription lines. No cross. */
export function TombstoneShape() {
  return (
    <svg className="gk-tombstone-art" viewBox="0 0 40 52" aria-hidden="true" focusable="false">
      <path d="M6 50V20a14 14 0 0 1 28 0v30z" />
      <path d="M3 50h34" />
      <path d="M13 26h14M13 32h14M13 38h8" />
    </svg>
  );
}

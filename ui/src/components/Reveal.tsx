function count(n: number): string {
  return Number.isFinite(n) && n >= 0 ? String(Math.trunc(n)) : '0';
}

/** `Showing <shown> of <total>` with a native button that reveals the whole list. */
export function Reveal(props: { shown: number; total: number; noun: string; onReveal?: () => void }) {
  const { shown, total, noun, onReveal } = props;
  return (
    <div className="gk-reveal">
      <span className="gk-reveal-text">{`Showing ${count(shown)} of ${count(total)}`}</span>
      <button type="button" className="gk-reveal-button" aria-label={`Show all ${count(total)} ${noun}`} onClick={onReveal}>
        Show all
      </button>
    </div>
  );
}

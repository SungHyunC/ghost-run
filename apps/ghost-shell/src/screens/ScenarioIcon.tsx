/** One picture per scenario for the scenario cards. Decorative: the card text names the scenario. */
export function ScenarioIcon({ id }: { readonly id: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <svg className="gs-sico" viewBox="-16 -16 32 32" aria-hidden="true" focusable="false">
      {id === 1 ? (
        <>
          <ellipse cx={-2} cy={-8} rx={9} ry={3.5} />
          <path d="M-11 -8 V8 A9 3.5 0 0 0 7 8 V-8" />
          <path d="M-11 0 A9 3.5 0 0 0 7 0" />
          <path d="M6 9 L13 9" className="gs-sico-accent" />
        </>
      ) : null}
      {id === 2 ? (
        <>
          <path d="M-12 -7 H-4 L-2 -10 H12 V9 H-12 Z" />
          <path d="M-6 -1 L6 7 M6 -1 L-6 7" className="gs-sico-accent" />
        </>
      ) : null}
      {id === 3 ? (
        <>
          <path d="M-13 0 C-7 -9 7 -9 13 0 C7 9 -7 9 -13 0 Z" />
          <circle cx={0} cy={0} r={4} className="gs-sico-accent" />
        </>
      ) : null}
      {id === 4 ? (
        <>
          <path d="M-5 -12 H5 M-3 -12 V-3 L-10 10 H10 L3 -3 V-12" />
          <path d="M-4 4 L-1 7 L5 1" className="gs-sico-accent" />
        </>
      ) : null}
      {id === 5 ? (
        <>
          <path d="M-11 -5 L0 -11 L11 -5 V7 L0 13 L-11 7 Z" />
          <path d="M-11 -5 L0 1 L11 -5 M0 1 V13" />
          <path d="M8 -12 L12 -8" className="gs-sico-accent" />
        </>
      ) : null}
    </svg>
  );
}

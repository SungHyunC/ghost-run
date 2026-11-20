import type { WalkState } from '../../engine/types';

export interface ActorPos {
  x: number;
  y: number;
  /** True when the move must not animate (first placement, resize, Reduced_Motion). */
  instant: boolean;
}

/** The ghost actor. Decorative: the narration in the speech bar says the same in text. */
export function Actor({ act, term, pos }: { act: WalkState['act']; term: WalkState['term']; pos: ActorPos }) {
  return (
    <div
      className={`actor act-${String(act)}`}
      id="actor"
      aria-hidden="true"
      style={{
        transform: `translate(${String(Math.round(pos.x))}px,${String(Math.round(pos.y))}px)`,
        transition: pos.instant ? 'none' : undefined,
      }}
    >
      <svg className="prop p-wand" viewBox="0 0 30 30">
        <path d="M4 26L20 10" stroke="#ffd36b" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M22 3l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z"
          fill="#ffd36b"
        />
        <circle cx="8" cy="8" r="1.6" fill="#aef5df" />
        <circle cx="27" cy="18" r="1.4" fill="#aef5df" />
        <circle cx="14" cy="3" r="1.2" fill="#fff" />
      </svg>
      <svg className="prop p-glass" viewBox="0 0 30 30">
        <circle cx="17" cy="12" r="8" fill="rgba(174,245,223,.25)" stroke="#ffd36b" strokeWidth="3" />
        <path d="M11 18L3 27" stroke="#ffd36b" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <svg className="prop p-puff" viewBox="0 0 34 22">
        <path d="M2 6h20M6 11h26M2 16h18" stroke="#cfe9ff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <svg className="prop p-cheer" viewBox="0 0 98 40">
        <circle cx="8" cy="20" r="3" fill="#ffd36b" />
        <circle cx="24" cy="6" r="2.5" fill="#9be564" />
        <circle cx="74" cy="6" r="2.5" fill="#ff9ec7" />
        <circle cx="90" cy="20" r="3" fill="#aef5df" />
        <circle cx="50" cy="2" r="2" fill="#fff" />
      </svg>
      <svg className="g" viewBox="0 0 120 130">
        <use href="#boo" />
      </svg>
      <div className={term.visible ? 'term show' : 'term'} id="term">
        {term.visible ? (
          <>
            <span className="pr">$</span> <span className="tt">{term.typed}</span>
            {term.caret ? <span className="caret" /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

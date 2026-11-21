import { PAGES } from '../data/pages';
import type { Paging } from '../engine/usePaging';

/** The Page_Bar and the Page_Live_Region. It reads `state.current`, never `leaving`. */
export function PageBar({ paging }: { paging: Pick<Paging, 'state' | 'liveText' | 'go' | 'step'> }) {
  const { state, liveText, go, step } = paging;
  const index = PAGES.findIndex((p) => p.id === state.current);
  const last = PAGES.length - 1;
  const next = PAGES[index + 1];
  return (
    <>
      <nav className="pagebar" aria-label="Pages">
        <button type="button" className="pg-btn pg-prev" id="pgPrev" disabled={index === 0} onClick={() => step(-1, 'bar')}>
          ‹ Back
        </button>
        <div className="pg-mid">
          <div className="pg-dots" id="pgDots">
            {PAGES.map((p, i) => {
              const on = p.id === state.current;
              return (
                <button
                  type="button"
                  key={p.id}
                  className={on ? 'pg-dot on' : 'pg-dot'}
                  aria-label={`Page ${String(i + 1)}: ${p.title}`}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => {
                    go(p.id, 'bar');
                  }}
                >
                  <i></i>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
          <span className="pg-count" id="pgCount">
            {`${String(index + 1)} / ${String(PAGES.length)}`}
          </span>
        </div>
        <button type="button" className="pg-btn pg-next" id="pgNext" disabled={index === last} onClick={() => step(1, 'bar')}>
          <small>Next</small>
          <b id="pgNextTitle">{next === undefined ? 'The end' : next.title}</b> ›
        </button>
      </nav>
      <div className="sr-only" aria-live="polite" id="pgLive">
        {liveText}
      </div>
    </>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActorAt, WalkView } from '../../engine/types';
import { useReducedMotion } from '../../engine/useReducedMotion';
import { Actor, type ActorPos } from './Actor';
import { PlanBar, SpeechBar, VerdictCard, WardCard } from './Cards';

export interface TheaterProps {
  view: WalkView;
  /** Text of the "go" badge of the Reality pane head (by world). */
  goText: string;
  /** The Reality pane body (`#realb` content). Depends on the recorded scene only. */
  reality: ReactNode;
  /** The Copy pane body (`#copyb` content). */
  copy: ReactNode;
}

interface Box {
  x: number;
  y: number;
  w: number;
}

function rel(theater: HTMLElement, el: HTMLElement | null): Box {
  const a = theater.getBoundingClientRect();
  const r = (el ?? theater).getBoundingClientRect();
  return { x: r.left - a.left, y: r.top - a.top, w: r.width };
}

/** The offsets of design Component 7. */
function place(theater: HTMLElement, at: ActorAt, els: Record<ActorAt, HTMLElement | null>): { x: number; y: number } {
  const b = rel(theater, els[at]);
  switch (at) {
    case 'gutter':
      return { x: b.x + b.w / 2 - 35, y: b.y - 30 };
    case 'copy':
      return { x: b.x + b.w - 74, y: b.y - 40 };
    case 'ward':
      return { x: b.x + b.w - 80, y: b.y - 60 };
    case 'verdict':
      return { x: b.x - 50, y: b.y - 26 };
  }
}

export function Theater({ view, goText, reality, copy }: TheaterProps) {
  const theater = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const copyPane = useRef<HTMLDivElement>(null);
  const ward = useRef<HTMLDivElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pos, setPos] = useState<ActorPos>({ x: 0, y: 0, instant: true });
  const [resizeTick, setResizeTick] = useState(0);
  const resized = useRef(true);

  useEffect(() => {
    const onResize = () => {
      resized.current = true;
      setResizeTick((t) => t + 1);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useLayoutEffect(() => {
    const t = theater.current;
    if (t === null) return;
    const p = place(t, view.actorAt, {
      gutter: gutter.current,
      copy: copyPane.current,
      ward: ward.current,
      verdict: verdict.current,
    });
    const instant = resized.current || reduced;
    resized.current = false;
    setPos({ ...p, instant });
  }, [view.step, view.actorAt, resizeTick, reduced]);

  return (
    <div className={view.beam ? 'theater beam-on' : 'theater'} id="theater" ref={theater}>
      <PlanBar text={view.plan.text} rev={view.plan.rev} />
      <div className="panes">
        <div className="pane real" id="real">
          <div className="pane-h">
            Reality{' '}
            <span className={view.badges.fingerprint ? 'badge fpb show' : 'badge fpb'} id="fpb">
              fingerprint ✓ untouched
            </span>
            <span className={view.badges.go ? 'badge gob show' : 'badge gob'} id="gob" aria-hidden={!view.badges.go}>
              {goText}
            </span>
          </div>
          <div id="realb">{reality}</div>
        </div>
        <div className="gutter" id="gutter" ref={gutter}>
          <svg className="beam" viewBox="0 0 64 40" aria-hidden="true">
            <path d="M4 20H58" />
            <path d="M48 10l12 10-12 10" />
          </svg>
        </div>
        <div className="pane copy" id="copy" ref={copyPane}>
          <div className="pane-h">
            Ghost copy <span className="seal">sealed: nothing leaves</span>
          </div>
          <div
            id="copyb"
            key={view.copyEpoch}
            className={view.materialize ? 'mat' : undefined}
            style={view.copyVisible ? undefined : { visibility: 'hidden' }}
          >
            {copy}
          </div>
        </div>
      </div>
      <div className="judge">
        <WardCard
          wardRef={ward}
          wardId={view.ward.id}
          kindLine={view.ward.kindLine}
          rows={view.checks.rows}
          scan={view.checks.scan}
          tone={view.checks.tone}
          eoShown={view.checks.eoShown}
          effectsOutside={view.ward.effectsOutside}
        />
        <VerdictCard verdictRef={verdict} candleOut={view.candleOut} stamp={view.stamp} note={view.note} />
      </div>
      <Actor act={view.act} term={view.term} pos={pos} />
      <SpeechBar narration={view.narration} />
    </div>
  );
}

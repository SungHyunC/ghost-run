import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActorAt, WalkView } from '../../engine/types';
import { useReducedMotion } from '../../engine/useReducedMotion';
import { Actor, type ActorPos } from './Actor';
import { SpeechBar, VerdictCard, WardCard, wardName } from './Cards';

export interface TheaterProps {
  view: WalkView;
  /** Text of the "go" badge of the Reality pane head (by world). */
  goText: string;
  /** The Reality pane body (`#realb` content). Depends on the recorded scene only. */
  reality: ReactNode;
  /** The Copy pane body (`#copyb` content). */
  copy: ReactNode;
  /** The ward ids that the shown plan violated; the ward card is named after them. Empty: the headline ward. */
  violatedWardIds?: readonly string[];
}

/** A rectangle relative to the Theater's top left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rel(theater: HTMLElement, el: HTMLElement | null): Box {
  const a = theater.getBoundingClientRect();
  const r = (el ?? theater).getBoundingClientRect();
  return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height };
}

/**
 * The Actor's position for each stop (`moveActor` of the Mockup). The Panes now start at the top edge of the
 * Theater, so the speech bubble of the Actor at the Copy pane (`.term`, 6 px below the Actor's top) would leave
 * the Theater: its y is clamped to 0, which puts the bubble top at least 6 px inside.
 */
export function placeActor(at: ActorAt, boxes: Record<ActorAt, Box>): { x: number; y: number } {
  const b = boxes[at];
  switch (at) {
    case 'gutter':
      return { x: b.x + b.w / 2 - 33, y: b.y - 24 };
    case 'copy':
      return { x: b.x + b.w - 70, y: Math.max(b.y - 34, 0) };
    case 'ward':
      return { x: Math.min(b.x + b.w - 80, b.x + 260), y: b.y - 56 };
    case 'verdict':
      return { x: b.x - 56, y: b.y - 16 };
  }
}

export function Theater({ view, goText, reality, copy, violatedWardIds = [] }: TheaterProps) {
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
    const p = placeActor(view.actorAt, {
      gutter: rel(t, gutter.current),
      copy: rel(t, copyPane.current),
      ward: rel(t, ward.current),
      verdict: rel(t, verdict.current),
    });
    const instant = resized.current || reduced;
    resized.current = false;
    setPos({ ...p, instant });
  }, [view.step, view.actorAt, resizeTick, reduced]);

  return (
    <div className={view.beam ? 'theater beam-on' : 'theater'} id="theater" ref={theater}>
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
          wardId={wardName(view.ward.id, violatedWardIds)}
          rows={view.checks.rows}
          scan={view.checks.scan}
          tone={view.checks.tone}
          eoShown={view.checks.eoShown}
          effectsOutside={view.ward.effectsOutside}
        />
        <VerdictCard verdictRef={verdict} candle={view.candle} stamp={view.stamp} />
      </div>
      <Actor act={view.act} term={view.term} pos={pos} />
      <SpeechBar narration={view.narration} step={view.step} />
    </div>
  );
}

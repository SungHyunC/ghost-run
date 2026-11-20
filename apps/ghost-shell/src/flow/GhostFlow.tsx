// The hero diagram: a ghost flies the path a plan takes (plan, copy, ghost run, wards, outcome).
// The SVG is decorative (aria-hidden); the caption under it says the same thing in words.
// Motion: Web Animations on the ghost only, never on text. Reduced motion shows the last step, still.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FLOW_EDGE_APPROVED,
  FLOW_EDGE_FIX,
  FLOW_HEADING,
  FLOW_NODES,
  FLOW_REPLAY_LABEL,
  FLOW_SUMMARY_TEXT,
  FLOW_JUDGE_SUB,
} from '../page-texts';
import {
  DWELL_MS,
  EDGES,
  JUDGE,
  NODES,
  STATIONS,
  VIEW,
  introTour,
  moveDuration,
  pathOf,
  routeOf,
  runTour,
} from './tour';
import type { FlowEdgeId, FlowNodeId, FlowRun, GhostPos, TourStep } from './tour';
import { useReducedMotion } from './useReducedMotion';

export interface GhostFlowProps {
  /** The run to show; the intro tour plays when there is none. */
  readonly run?: FlowRun;
}

interface Play {
  readonly source: FlowRun | undefined;
  readonly tour: readonly TourStep[];
  readonly index: number;
  readonly round: number;
}

const EASE = 'cubic-bezier(0.45, 0.05, 0.3, 1)';

function edgeKind(id: FlowEdgeId): 'ghost' | 'block' | 'warn' | 'pass' {
  if (id === 'judge-out' || id === 'out-plan') return 'block';
  if (id === 'judge-flicker' || id === 'flicker-lit') return 'warn';
  if (id === 'judge-lit') return 'pass';
  return 'ghost';
}

// -- Icons (drawn around the origin, about 48 units wide) -------------------------

function PlanIcon() {
  return (
    <g className="gf-ico">
      <rect x={-22} y={-18} width={44} height={36} rx={7} className="gf-ico-frame" />
      <path d="M-13 -6 L-6 0 L-13 6" className="gf-ico-stroke" />
      <path d="M-2 7 H10" className="gf-ico-stroke" />
    </g>
  );
}

function CopyIcon() {
  return (
    <g className="gf-ico">
      <g className="gf-ico-twin" transform="translate(9 -7)">
        <ellipse cx={0} cy={-11} rx={12} ry={4.5} />
        <path d="M-12 -11 V11 A12 4.5 0 0 0 12 11 V-11" />
      </g>
      <g className="gf-ico-db" transform="translate(-7 4)">
        <ellipse cx={0} cy={-11} rx={12} ry={4.5} />
        <path d="M-12 -11 V11 A12 4.5 0 0 0 12 11 V-11" />
      </g>
    </g>
  );
}

function RowsIcon() {
  return (
    <g className="gf-ico gf-rows">
      <rect x={-20} y={-17} width={40} height={8} rx={3} className="gf-row" />
      <rect x={-20} y={-4} width={40} height={8} rx={3} className="gf-row gf-row-lost" />
      <rect x={-20} y={9} width={40} height={8} rx={3} className="gf-row gf-row-lost" />
      <path d="M14 -2 C20 -8 16 -14 22 -18" className="gf-ico-smoke" />
    </g>
  );
}

function TombIcon() {
  return (
    <g className="gf-ico">
      <path d="M-14 18 V-6 A14 14 0 0 1 14 -6 V18 Z" className="gf-ico-frame" />
      <path d="M-7 -2 H7 M-7 5 H7" className="gf-ico-stroke" />
      <path d="M-20 18 H20" className="gf-ico-stroke" />
    </g>
  );
}

function PersonIcon() {
  return (
    <g className="gf-ico">
      <circle cx={0} cy={-9} r={7} className="gf-ico-frame" />
      <path d="M-14 17 C-14 6 -7 2 0 2 C7 2 14 6 14 17 Z" className="gf-ico-frame" />
      <path d="M15 -15 C15 -20 23 -20 23 -15 C23 -11 19 -11 19 -7 M19 -3 V-2" className="gf-ico-stroke" />
    </g>
  );
}

function RunIcon() {
  return (
    <g className="gf-ico">
      <circle cx={0} cy={0} r={18} className="gf-ico-frame" />
      <path d="M-5 -8 L9 0 L-5 8 Z" className="gf-ico-fill" />
    </g>
  );
}

function CandleIcon() {
  return (
    <g className="gf-candle">
      <path d="M-9 -2 H9 V24 H-9 Z" className="gf-candle-body" />
      <path d="M0 -2 V-7" className="gf-candle-wick" />
      <path d="M0 -26 C7 -17 7 -10 0 -7 C-7 -10 -7 -17 0 -26 Z" className="gf-candle-flame" />
      <path d="M0 -9 C-6 -16 5 -20 -1 -28 C-6 -33 2 -36 -2 -42" className="gf-candle-smoke" />
    </g>
  );
}

const NODE_ICONS: Readonly<Record<Exclude<FlowNodeId, 'judge'>, () => ReactNode>> = {
  plan: PlanIcon,
  copy: CopyIcon,
  ghost: RowsIcon,
  out: TombIcon,
  flicker: PersonIcon,
  lit: RunIcon,
};

// -- The ghost -------------------------------------------------------------------

function GhostSprite() {
  return (
    <g className="gf-sprite">
      <ellipse cx={0} cy={44} rx={18} ry={4} className="gf-ghost-shadow" />
      <ellipse cx={0} cy={0} rx={34} ry={38} className="gf-ghost-glow" filter="url(#gf-blur)" />
      <path
        className="gf-ghost-body"
        d="M-24 26 L-24 -6 C-24 -22 -13 -33 0 -33 C13 -33 24 -22 24 -6 L24 26 Q20 33 16 27 Q12 21 8 27 Q4 33 0 27 Q-4 21 -8 27 Q-12 33 -16 27 Q-20 21 -24 26 Z"
      />
      <g className="gf-ghost-face">
        <ellipse cx={-8} cy={-8} rx={3.6} ry={5.2} className="gf-ghost-eye" />
        <ellipse cx={8} cy={-8} rx={3.6} ry={5.2} className="gf-ghost-eye" />
        <ellipse cx={0} cy={5} rx={3} ry={3.4} className="gf-ghost-mouth" />
      </g>
    </g>
  );
}

// -- Component -------------------------------------------------------------------

export function GhostFlow({ run }: GhostFlowProps) {
  const reduced = useReducedMotion();
  const [play, setPlay] = useState<Play>(() => {
    const tour = run === undefined ? introTour() : runTour(run);
    return { source: run, tour, index: reduced ? tour.length - 1 : 0, round: 0 };
  });

  // A new run replaces the tour (the "state from props" pattern: no effect, no stale frame).
  let current = play;
  if (play.source !== run) {
    const tour = run === undefined ? introTour() : runTour(run);
    current = { source: run, tour, index: reduced ? tour.length - 1 : 0, round: play.round + 1 };
    setPlay(current);
  }
  const lastIndex = current.tour.length - 1;
  const index = reduced ? lastIndex : Math.min(current.index, lastIndex);
  const step = current.tour[index] ?? current.tour[lastIndex];

  const ghostRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);
  const lastPos = useRef<GhostPos>(step?.pos ?? 'plan');
  const [face, setFace] = useState<'left' | 'right'>('right');

  useEffect(() => {
    if (step === undefined) return undefined;
    const from = lastPos.current;
    const points = routeOf(from, step.pos);
    lastPos.current = step.pos;
    const duration = reduced ? 0 : moveDuration(points);
    const first = points[0];
    const last = points[points.length - 1];
    if (first !== undefined && last !== undefined && last.x !== first.x) setFace(last.x < first.x ? 'left' : 'right');

    const ghost = ghostRef.current;
    const sprite = spriteRef.current;
    const animations: Animation[] = [];
    if (duration > 0 && ghost !== null && typeof ghost.animate === 'function') {
      let total = 0;
      const lengths = points.map((p, i) => {
        const prev = points[i - 1];
        if (prev !== undefined) total += Math.hypot(p.x - prev.x, p.y - prev.y);
        return total;
      });
      const frames = points.map((p, i) => ({
        transform: `translate(${p.x}px, ${p.y}px)`,
        offset: total === 0 ? 1 : (lengths[i] ?? 0) / total,
      }));
      animations.push(ghost.animate(frames, { duration, easing: EASE }));
      if (sprite !== null && typeof sprite.animate === 'function') {
        const lean = first !== undefined && last !== undefined && last.x < first.x ? -7 : 7;
        animations.push(
          sprite.animate(
            [
              { transform: 'rotate(0deg) translateY(0px)' },
              { transform: `rotate(${lean}deg) translateY(-4px)`, offset: 0.25 },
              { transform: `rotate(${lean}deg) translateY(-4px)`, offset: 0.75 },
              { transform: 'rotate(0deg) translateY(0px)' },
            ],
            { duration, easing: 'ease-in-out' },
          ),
        );
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!reduced && index < lastIndex) {
      const round = current.round;
      timer = setTimeout(() => {
        setPlay((p) => (p.round === round ? { ...p, index: p.index + 1 } : p));
      }, duration + DWELL_MS);
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const a of animations) a.finish();
    };
    // The effect runs once per shown step of a round.
  }, [current.round, index, lastIndex, reduced, step]);

  if (step === undefined) return null;

  const station = STATIONS[step.pos];
  const visited = new Set<FlowNodeId>();
  for (const s of current.tour.slice(0, index + 1)) visited.add(s.active);

  const nodeState = (id: FlowNodeId): 'active' | 'visited' | 'idle' =>
    step.active === id ? 'active' : visited.has(id) ? 'visited' : 'idle';

  const replay = (): void => {
    setPlay((p) => ({ ...p, index: reduced ? p.tour.length - 1 : 0, round: p.round + 1 }));
  };

  return (
    <figure className="gf" aria-labelledby="gf-heading">
      <div className="gf-head">
        <h2 id="gf-heading" className="gf-heading">
          {FLOW_HEADING}
        </h2>
        <p className="gk-sr-only">{FLOW_SUMMARY_TEXT}</p>
      </div>
      <div className="gf-canvas">
        <svg
          className="gf-svg"
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          aria-hidden="true"
          focusable="false"
          data-candle={step.candle}
          data-outcome={step.outcome ?? 'none'}
          data-copied={step.copied}
          data-damage={step.damage}
        >
          <defs>
            <filter id="gf-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            {(['line', 'ghost', 'block', 'warn', 'pass'] as const).map((k) => (
              <marker
                key={k}
                id={`gf-arrow-${k}`}
                className={`gf-arrow gf-arrow-${k}`}
                viewBox="0 0 10 10"
                refX={9}
                refY={5}
                markerWidth={7}
                markerHeight={7}
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 Z" />
              </marker>
            ))}
          </defs>

          {/* Base edges. */}
          {(Object.keys(EDGES) as FlowEdgeId[]).map((id) => (
            <path key={id} d={pathOf(EDGES[id])} className="gf-edge" data-edge={id} markerEnd="url(#gf-arrow-line)" />
          ))}
          <text x={-6} y={258} className="gf-edge-label">
            {FLOW_EDGE_FIX}
          </text>
          <text x={(NODES.flicker.x + NODES.flicker.w + NODES.lit.x) / 2} y={NODES.lit.y + NODES.lit.h / 2 - 14} className="gf-edge-label" textAnchor="middle">
            {FLOW_EDGE_APPROVED}
          </text>

          {/* Trail of the current pass. */}
          {step.trail.map((id) => {
            const kind = edgeKind(id);
            return (
              <path
                key={`${current.round}-${id}`}
                d={pathOf(EDGES[id])}
                className="gf-trail"
                data-kind={kind}
                pathLength={1}
                markerEnd={`url(#gf-arrow-${kind})`}
              />
            );
          })}

          {/* Nodes. */}
          {(Object.keys(NODES) as (keyof typeof NODES)[]).map((id) => {
            const b = NODES[id];
            const Icon = NODE_ICONS[id];
            const text = FLOW_NODES[id];
            const isOutcome = id === 'out' || id === 'flicker' || id === 'lit';
            const on =
              isOutcome &&
              ((id === 'out' && step.outcome === 'block') ||
                (id === 'flicker' && step.outcome === 'warn') ||
                (id === 'lit' && step.outcome === 'pass'));
            return (
              <g key={id} className="gf-node" data-node={id} data-state={nodeState(id)} data-on={on}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={20} className="gf-node-box" />
                <g transform={`translate(${b.x + 44} ${b.y + b.h / 2})`}>
                  <Icon />
                </g>
                <text x={b.x + 84} y={b.y + b.h / 2 - 4} className="gf-node-title">
                  {text.title}
                </text>
                <text x={b.x + 84} y={b.y + b.h / 2 + 24} className="gf-node-sub">
                  {text.sub}
                </text>
              </g>
            );
          })}

          {/* The judge. */}
          <g className="gf-node gf-judge" data-node="judge" data-state={nodeState('judge')}>
            <path
              d={`M${JUDGE.cx} ${JUDGE.cy - JUDGE.hh} L${JUDGE.cx + JUDGE.hw} ${JUDGE.cy} L${JUDGE.cx} ${JUDGE.cy + JUDGE.hh} L${JUDGE.cx - JUDGE.hw} ${JUDGE.cy} Z`}
              className="gf-node-box"
            />
            <g transform={`translate(${JUDGE.cx - 78} ${JUDGE.cy - 2})`}>
              <CandleIcon />
            </g>
            <text x={JUDGE.cx - 50} y={JUDGE.cy - 4} className="gf-node-title">
              {FLOW_NODES.judge.title}
            </text>
            <text x={JUDGE.cx - 50} y={JUDGE.cy + 23} className="gf-node-sub gf-judge-sub">
              {FLOW_JUDGE_SUB[step.candle]}
            </text>
          </g>

          {/* The ghost. */}
          <g
            ref={ghostRef}
            className="gf-ghost"
            data-face={face}
            data-pos={step.pos}
            transform={`translate(${station.x} ${station.y})`}
          >
            <g ref={spriteRef} className="gf-sprite-wrap">
              <GhostSprite />
            </g>
          </g>
        </svg>
      </div>
      <figcaption className="gf-caption">
        <ol className="gf-dots" aria-hidden="true">
          {current.tour.map((s, i) => (
            <li key={i} data-state={i < index ? 'done' : i === index ? 'now' : 'next'} data-outcome={s.outcome ?? 'none'} />
          ))}
        </ol>
        <p className="gf-caption-text" data-outcome={step.outcome ?? 'none'}>
          {step.caption}
        </p>
        <button type="button" className="gk-button gf-replay" onClick={replay}>
          {FLOW_REPLAY_LABEL}
        </button>
      </figcaption>
    </figure>
  );
}

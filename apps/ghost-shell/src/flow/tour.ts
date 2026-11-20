// Geometry and step script of the ghost flow diagram (the hero animation).
// Pure data: no React, no DOM, no clock. The component plays the steps; reduced motion jumps to the last one.

export type FlowNodeId = 'plan' | 'copy' | 'ghost' | 'judge' | 'out' | 'flicker' | 'lit';
export type FlowEdgeId =
  | 'plan-copy'
  | 'copy-ghost'
  | 'ghost-judge'
  | 'judge-out'
  | 'judge-flicker'
  | 'judge-lit'
  | 'flicker-lit'
  | 'out-plan';
export type FlowOutcome = 'pass' | 'warn' | 'block';
export type CandleLook = 'idle' | 'lit' | 'flickering' | 'out';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// -- Geometry (SVG user units) ------------------------------------------------

export const VIEW = { x: -60, y: -14, w: 1360, h: 650 } as const;
export const NODE_W = 350;
export const NODE_H = 112;
const COL = [205, 645, 1085] as const;
const ROW_TOP = 124;
const ROW_BOTTOM = 524;
export const JUDGE = { cx: 1085, cy: 332, hw: 165, hh: 74 } as const;
export const LOOP_X = -18;

function box(cx: number, cy: number): Box {
  return { x: cx - NODE_W / 2, y: cy - NODE_H / 2, w: NODE_W, h: NODE_H };
}

export const NODES: Readonly<Record<Exclude<FlowNodeId, 'judge'>, Box>> = {
  plan: box(COL[0], ROW_TOP),
  copy: box(COL[1], ROW_TOP),
  ghost: box(COL[2], ROW_TOP),
  out: box(COL[0], ROW_BOTTOM),
  flicker: box(COL[1], ROW_BOTTOM),
  lit: box(COL[2], ROW_BOTTOM),
};

const right = (b: Box): number => b.x + b.w;
const bottom = (b: Box): number => b.y + b.h;
const midY = (b: Box): number => b.y + b.h / 2;
const midX = (b: Box): number => b.x + b.w / 2;

/** Upper-left edge point of the judge diamond at height y (y between top and centre). */
function judgeLeftAt(y: number): number {
  return JUDGE.cx - JUDGE.hw * (1 - (JUDGE.cy - y) / JUDGE.hh);
}

const BLOCK_Y = JUDGE.cy - 38;

/** Edge polylines, each from its source to its target (the arrow head sits at the last point). */
export const EDGES: Readonly<Record<FlowEdgeId, readonly Point[]>> = {
  'plan-copy': [
    { x: right(NODES.plan), y: midY(NODES.plan) },
    { x: NODES.copy.x, y: midY(NODES.copy) },
  ],
  'copy-ghost': [
    { x: right(NODES.copy), y: midY(NODES.copy) },
    { x: NODES.ghost.x, y: midY(NODES.ghost) },
  ],
  'ghost-judge': [
    { x: midX(NODES.ghost), y: bottom(NODES.ghost) },
    { x: JUDGE.cx, y: JUDGE.cy - JUDGE.hh },
  ],
  'judge-out': [
    { x: judgeLeftAt(BLOCK_Y), y: BLOCK_Y },
    { x: midX(NODES.out), y: BLOCK_Y },
    { x: midX(NODES.out), y: NODES.out.y },
  ],
  'judge-flicker': [
    { x: JUDGE.cx - JUDGE.hw, y: JUDGE.cy },
    { x: midX(NODES.flicker), y: JUDGE.cy },
    { x: midX(NODES.flicker), y: NODES.flicker.y },
  ],
  'judge-lit': [
    { x: JUDGE.cx, y: JUDGE.cy + JUDGE.hh },
    { x: midX(NODES.lit), y: NODES.lit.y },
  ],
  'flicker-lit': [
    { x: right(NODES.flicker), y: midY(NODES.flicker) },
    { x: NODES.lit.x, y: midY(NODES.lit) },
  ],
  'out-plan': [
    { x: NODES.out.x, y: midY(NODES.out) },
    { x: LOOP_X, y: midY(NODES.out) },
    { x: LOOP_X, y: midY(NODES.plan) },
    { x: NODES.plan.x, y: midY(NODES.plan) },
  ],
};

export function pathOf(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

// -- Ghost stations ------------------------------------------------------------

export type GhostPos = 'plan' | 'copy' | 'ghost' | 'judge' | 'out' | 'flicker' | 'lit';

const HOVER = 46; // the ghost floats this far above the top edge of a node

export const STATIONS: Readonly<Record<GhostPos, Point>> = {
  plan: { x: midX(NODES.plan), y: NODES.plan.y - HOVER },
  copy: { x: midX(NODES.copy), y: NODES.copy.y - HOVER },
  ghost: { x: midX(NODES.ghost), y: NODES.ghost.y - HOVER },
  judge: { x: JUDGE.cx, y: (bottom(NODES.ghost) + JUDGE.cy - JUDGE.hh) / 2 },
  out: { x: midX(NODES.out), y: NODES.out.y - HOVER },
  flicker: { x: midX(NODES.flicker), y: NODES.flicker.y - HOVER },
  lit: { x: midX(NODES.lit), y: NODES.lit.y - HOVER },
};

/** Bends the ghost flies through between two stations; a pair that is not listed is a straight line. */
const ROUTES: Readonly<Partial<Record<`${GhostPos}>${GhostPos}`, readonly Point[]>>> = {
  'judge>out': [
    { x: judgeLeftAt(BLOCK_Y) - 90, y: BLOCK_Y },
    { x: midX(NODES.out), y: BLOCK_Y },
  ],
  'judge>flicker': [
    { x: JUDGE.cx - JUDGE.hw - 70, y: JUDGE.cy },
    { x: midX(NODES.flicker), y: JUDGE.cy },
  ],
  'out>plan': [
    { x: LOOP_X, y: STATIONS.out.y },
    { x: LOOP_X, y: midY(NODES.plan) - 6 },
  ],
};

/** The points of one move: start, bends, end. */
export function routeOf(from: GhostPos, to: GhostPos): readonly Point[] {
  if (from === to) return [STATIONS[to]];
  return [STATIONS[from], ...(ROUTES[`${from}>${to}`] ?? []), STATIONS[to]];
}

export function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// -- Steps ---------------------------------------------------------------------

export interface TourStep {
  readonly pos: GhostPos;
  /** The node the caption talks about. */
  readonly active: FlowNodeId;
  /** Edges the ghost has travelled in the current pass, drawn as a trail. */
  readonly trail: readonly FlowEdgeId[];
  readonly candle: CandleLook;
  /** The outcome node that is switched on, if any. */
  readonly outcome?: FlowOutcome;
  /** The copy has been made (the foggy twin is drawn in the copy node). */
  readonly copied: boolean;
  /** Something was lost in the copy (the rows in the ghost node dissolve). */
  readonly damage: boolean;
  readonly caption: string;
}

export interface FlowRun {
  readonly verdict: FlowOutcome;
  /** Display-escaped first command of the plan. */
  readonly command: string;
  /** Display-escaped first violation or notice, for example "no-data-loss: would delete 1,206 rows from users". */
  readonly reason?: string;
  /** Number of steps in the plan. */
  readonly stepCount: number;
}

export const CAPTIONS = {
  copy: 'The world is copied: files and the database, inside this page.',
  ghost: 'Its ghost runs the plan on the copy first and records what changed.',
  judgeIdle: 'The wards judge what changed.',
  outBlock: 'Candle out: the command is blocked and the agent gets the reason.',
  loop: 'The agent fixes its plan and sends the ghost again.',
  loopRun: 'Next: fix the plan (Apply fixed plan, where there is one) and run the ghost again.',
  flicker: 'Candle flickers: a side effect outside the copy. A human decides.',
  lit: 'Candle lit: no ward broken. Only now may the real agent run it.',
  litPlayground: 'Candle lit: no ward broken. Only now may the real agent run it (this page stops here).',
} as const;

interface PassInput {
  readonly planCaption: string;
  readonly verdict: FlowOutcome;
  readonly judgeCaption: string;
  readonly endCaption: string;
}

function pass(input: PassInput): TourStep[] {
  const base = { candle: 'idle' as CandleLook, copied: false, damage: false };
  const damage = input.verdict === 'block';
  const steps: TourStep[] = [
    { ...base, pos: 'plan', active: 'plan', trail: [], caption: input.planCaption },
    { ...base, pos: 'copy', active: 'copy', trail: ['plan-copy'], copied: true, caption: CAPTIONS.copy },
    {
      ...base,
      pos: 'ghost',
      active: 'ghost',
      trail: ['plan-copy', 'copy-ghost'],
      copied: true,
      damage,
      caption: CAPTIONS.ghost,
    },
  ];
  const judged: CandleLook = input.verdict === 'block' ? 'out' : input.verdict === 'warn' ? 'flickering' : 'lit';
  const toJudge: FlowEdgeId[] = ['plan-copy', 'copy-ghost', 'ghost-judge'];
  steps.push({
    ...base,
    pos: 'judge',
    active: 'judge',
    trail: toJudge,
    copied: true,
    damage,
    candle: judged,
    caption: input.judgeCaption,
  });
  const end = { ...base, copied: true, damage, candle: judged };
  if (input.verdict === 'block') {
    steps.push({ ...end, pos: 'out', active: 'out', trail: [...toJudge, 'judge-out'], outcome: 'block', caption: input.endCaption });
  } else if (input.verdict === 'warn') {
    steps.push({ ...end, pos: 'flicker', active: 'flicker', trail: [...toJudge, 'judge-flicker'], outcome: 'warn', caption: input.endCaption });
  } else {
    steps.push({ ...end, pos: 'lit', active: 'lit', trail: [...toJudge, 'judge-lit'], outcome: 'pass', caption: input.endCaption });
  }
  return steps;
}

function loopBack(caption: string): TourStep {
  return {
    pos: 'plan',
    active: 'plan',
    trail: ['out-plan'],
    candle: 'out',
    outcome: 'block',
    copied: false,
    damage: false,
    caption,
  };
}

/** The tour played once when the page opens: a blocked plan, the fix, and a lit candle. */
export function introTour(): readonly TourStep[] {
  return [
    ...pass({
      planCaption: 'An agent plans a command: DROP TABLE users.',
      verdict: 'block',
      judgeCaption: 'The wards judge the diff: every user row would be lost.',
      endCaption: CAPTIONS.outBlock,
    }),
    loopBack(CAPTIONS.loop),
    ...pass({
      planCaption: 'The new plan: back up the table, then mark rows as deleted.',
      verdict: 'pass',
      judgeCaption: 'The wards judge the diff: no rows lost.',
      endCaption: CAPTIONS.lit,
    }),
  ];
}

/** The tour of one real run of the page: its first command, its verdict, and its reason. */
export function runTour(run: FlowRun): readonly TourStep[] {
  const more = run.stepCount > 1 ? ` (+${run.stepCount - 1} more)` : '';
  const judgeCaption =
    run.reason !== undefined && run.reason !== ''
      ? `The wards judge the diff: ${run.reason}`
      : run.verdict === 'pass'
        ? 'The wards judge the diff: no ward broken.'
        : CAPTIONS.judgeIdle;
  const endCaption =
    run.verdict === 'block' ? CAPTIONS.outBlock : run.verdict === 'warn' ? CAPTIONS.flicker : CAPTIONS.litPlayground;
  const steps = pass({ planCaption: `The agent plans: ${run.command}${more}`, verdict: run.verdict, judgeCaption, endCaption });
  if (run.verdict === 'block') steps.push(loopBack(CAPTIONS.loopRun));
  return steps;
}

/** How long the ghost takes to fly a route, in milliseconds (0 when it stays). */
export function moveDuration(points: readonly Point[]): number {
  const len = lengthOf(points);
  if (len === 0) return 0;
  return Math.round(Math.min(1700, Math.max(450, len * 1.55)));
}

/** Pause on a station before the next move, in milliseconds. */
export const DWELL_MS = 1100;

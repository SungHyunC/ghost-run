// Example and exhaustive tests of the ghost flow script (src/flow/tour.ts): geometry, routes, and tours.
import { describe, expect, it } from 'vitest';
import {
  CAPTIONS,
  EDGES,
  NODES,
  STATIONS,
  VIEW,
  introTour,
  moveDuration,
  routeOf,
  runTour,
} from '../../src/flow/tour';
import type { FlowEdgeId, GhostPos, TourStep } from '../../src/flow/tour';

const POSITIONS = Object.keys(STATIONS) as GhostPos[];
const inView = (x: number, y: number, margin = 0): boolean =>
  x - margin >= VIEW.x && x + margin <= VIEW.x + VIEW.w && y - margin >= VIEW.y && y + margin <= VIEW.y + VIEW.h;

function checkTour(tour: readonly TourStep[]): void {
  expect(tour.length).toBeGreaterThan(0);
  for (const step of tour) {
    expect(step.caption.length).toBeGreaterThan(0);
    for (const id of step.trail) expect(Object.keys(EDGES)).toContain(id);
  }
}

describe('flow geometry', () => {
  it('keeps every node, edge point, and ghost body inside the view box (the soft glow may spill over)', () => {
    for (const b of Object.values(NODES)) {
      expect(inView(b.x, b.y)).toBe(true);
      expect(inView(b.x + b.w, b.y + b.h)).toBe(true);
    }
    for (const points of Object.values(EDGES)) for (const p of points) expect(inView(p.x, p.y)).toBe(true);
    for (const p of Object.values(STATIONS)) expect(inView(p.x, p.y, 34)).toBe(true);
  });

  it('lays the six boxes out without overlap', () => {
    const boxes = Object.values(NODES);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('routes every pair of stations from the start station to the end station', () => {
    for (const from of POSITIONS) {
      for (const to of POSITIONS) {
        const route = routeOf(from, to);
        expect(route[route.length - 1]).toEqual(STATIONS[to]);
        if (from === to) {
          expect(route).toHaveLength(1);
          expect(moveDuration(route)).toBe(0);
        } else {
          expect(route[0]).toEqual(STATIONS[from]);
          const ms = moveDuration(route);
          expect(ms).toBeGreaterThanOrEqual(450);
          expect(ms).toBeLessThanOrEqual(1700);
        }
      }
    }
  });
});

describe('tours', () => {
  it('the intro shows a block, the loop back to the plan, and ends on a lit candle', () => {
    const tour = introTour();
    checkTour(tour);
    expect(tour[0]?.pos).toBe('plan');
    const outcomes = tour.map((s) => s.outcome);
    expect(outcomes).toContain('block');
    expect(tour.some((s) => s.trail.includes('out-plan'))).toBe(true);
    const last = tour[tour.length - 1];
    expect(last?.pos).toBe('lit');
    expect(last?.outcome).toBe('pass');
    expect(last?.candle).toBe('lit');
  });

  it('a blocked run puts the reason in the judge caption and ends back at the plan', () => {
    const tour = runTour({ verdict: 'block', command: 'rm -rf ./data', reason: 'protect-data: would delete 3 files', stepCount: 1 });
    checkTour(tour);
    expect(tour[0]?.caption).toBe('The agent plans: rm -rf ./data');
    expect(tour.find((s) => s.pos === 'judge')?.caption).toContain('protect-data: would delete 3 files');
    expect(tour.find((s) => s.pos === 'out')?.caption).toBe(CAPTIONS.outBlock);
    const last = tour[tour.length - 1];
    expect(last?.pos).toBe('plan');
    expect(last?.candle).toBe('out');
    expect(last?.caption).toBe(CAPTIONS.loopRun);
  });

  it('a passing run ends on the lit node and says the page stops there', () => {
    const tour = runTour({ verdict: 'pass', command: 'npm test', stepCount: 2 });
    checkTour(tour);
    expect(tour[0]?.caption).toBe('The agent plans: npm test (+1 more)');
    const last = tour[tour.length - 1];
    expect(last?.pos).toBe('lit');
    expect(last?.caption).toBe(CAPTIONS.litPlayground);
    expect(tour.some((s) => s.damage)).toBe(false);
  });

  it('a warn run ends on the flicker node', () => {
    const tour = runTour({ verdict: 'warn', command: 'npm install', reason: 'network: registry.example', stepCount: 1 });
    checkTour(tour);
    const last = tour[tour.length - 1];
    expect(last?.pos).toBe('flicker');
    expect(last?.outcome).toBe('warn');
    expect(last?.candle).toBe('flickering');
  });

  it('trails only grow within a pass and only name edges the ghost can travel', () => {
    for (const tour of [introTour(), runTour({ verdict: 'block', command: 'x', stepCount: 1 })]) {
      let prev: readonly FlowEdgeId[] = [];
      for (const step of tour) {
        const grows = prev.every((id) => step.trail.includes(id));
        const restarts = step.pos === 'plan';
        expect(grows || restarts).toBe(true);
        prev = step.trail;
      }
    }
  });
});

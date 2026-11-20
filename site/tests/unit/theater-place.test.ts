import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { placeActor, type Box } from '../../src/components/walk/Theater';
import type { ActorAt } from '../../src/engine/types';

const AT: ActorAt[] = ['gutter', 'copy', 'ward', 'verdict'];

/** `.term` of the Mockup: right 72 px of the Actor, top 6 px, at least 190 px wide, at most 300 px. */
const TERM = { top: 6, right: 72, minW: 190, maxW: 300, h: 60 };
const ACTOR_W = 66;

/** The bubble rectangle for an Actor at (x, y), for the narrowest and the widest bubble. */
function bubble(x: number, y: number, w: number) {
  const right = x + ACTOR_W - TERM.right;
  return { left: right - w, right, top: y + TERM.top, bottom: y + TERM.top + TERM.h };
}

// Fixed rectangles of a 960 x 560 Theater with the Panes at its top edge (no plan bar).
const THEATER = { w: 960, h: 560 };
const FIXED: Record<ActorAt, Box> = {
  gutter: { x: 440, y: 0, w: 80, h: 300 },
  copy: { x: 500, y: 0, w: 440, h: 300 },
  ward: { x: 20, y: 320, w: 600, h: 90 },
  verdict: { x: 640, y: 320, w: 300, h: 90 },
};

describe('placeActor', () => {
  it('uses the offsets of the Mockup', () => {
    const boxes: Record<ActorAt, Box> = {
      gutter: { x: 100, y: 80, w: 60, h: 200 },
      copy: { x: 200, y: 80, w: 400, h: 200 },
      ward: { x: 10, y: 300, w: 700, h: 80 },
      verdict: { x: 720, y: 300, w: 200, h: 80 },
    };
    expect(placeActor('gutter', boxes)).toEqual({ x: 100 + 30 - 33, y: 80 - 24 });
    expect(placeActor('copy', boxes)).toEqual({ x: 200 + 400 - 70, y: 80 - 34 });
    expect(placeActor('ward', boxes)).toEqual({ x: Math.min(10 + 700 - 80, 10 + 260), y: 300 - 56 });
    expect(placeActor('verdict', boxes)).toEqual({ x: 720 - 56, y: 300 - 16 });
  });

  it('keeps the bubble inside the Theater for every Actor position with the fixed rectangles', () => {
    for (const at of AT) {
      const { x, y } = placeActor(at, FIXED);
      for (const w of [TERM.minW, TERM.maxW]) {
        const b = bubble(x, y, w);
        if (at === 'copy') {
          expect(b.top, `${at} top`).toBeGreaterThanOrEqual(0);
          expect(b.left, `${at} left`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${at} right`).toBeLessThanOrEqual(THEATER.w);
          expect(b.bottom, `${at} bottom`).toBeLessThanOrEqual(THEATER.h);
        }
      }
    }
  });

  it('never puts the Copy-pane bubble above the Theater, whatever the Pane position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 266, max: 600 }),
        (cy, cx, cw) => {
          const { y } = placeActor('copy', { ...FIXED, copy: { x: cx, y: cy, w: cw, h: 300 } });
          expect(y + TERM.top).toBeGreaterThanOrEqual(TERM.top);
          expect(y).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

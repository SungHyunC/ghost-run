// Feature: ghost-hand, Property 1: Plan file round trip and printed form (GH-P1)
// **Validates: Requirements 7.5, 7.8, 7.9, 7.10, 11.1, 11.2**
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import { isHiddenDisplay } from '@ghost-run/ui';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parsePlanFile, printPlanFile } from '../../src/plan/plan-file.js';
import type { PlanFile } from '../../src/plan/plan-file.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const R = WORLD_CONFIG.actionRanges;

// -0 is normalized to 0 by the parser; the generator never yields -0.
const inRange = (range: readonly [number, number]): fc.Arbitrary<number> =>
  fc
    .double({ min: range[0], max: range[1], noNaN: true, noDefaultInfinity: true })
    .map((n) => (n === 0 ? 0 : n));

const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc
    .record({
      target: fc.tuple(inRange(R.target.x), inRange(R.target.y), inRange(R.target.z)),
      speed: inRange(R.speed),
    })
    .map((r) => ({ type: 'reach', target: r.target, speed: r.speed }) as GhostHandAction),
  inRange(R.force).map((force) => ({ type: 'grasp', force }) as GhostHandAction),
  fc
    .record({ distance: inRange(R.distance), speed: inRange(R.speed) })
    .map((r) => ({ type: 'pull', distance: r.distance, speed: r.speed }) as GhostHandAction),
  fc.constant({ type: 'release' } as GhostHandAction),
);

const isSurrogate = (cp: number): boolean => cp >= 0xd800 && cp <= 0xdfff;
const isControl = (cp: number): boolean => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);

const plainCp: fc.Arbitrary<number> = fc
  .oneof(
    fc.integer({ min: 0x20, max: 0x7e }),
    fc.integer({ min: 0xa0, max: 0xd7ff }),
    fc.integer({ min: 0xe000, max: 0x10ffff }),
  )
  .filter((cp) => !isHiddenDisplay(cp) && !isControl(cp) && !isSurrogate(cp));

const anyCp: fc.Arbitrary<number> = fc.oneof(
  plainCp,
  plainCp,
  fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0xe0001, 0xe0041, 0xe007f),
  fc.integer({ min: 0, max: 0x1f }),
  fc.integer({ min: 0x7f, max: 0x9f }),
);

const fromCps = (cps: number[]): string => cps.map((c) => String.fromCodePoint(c)).join('');

const cleanText = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(plainCp, { minLength: min, maxLength: max }).map(fromCps);

const hiddenText = (max: number): fc.Arbitrary<string> =>
  fc.array(anyCp, { minLength: 0, maxLength: max }).map(fromCps);

const planArb: fc.Arbitrary<PlanFile> = fc
  .record({
    name: cleanText(1, 80),
    origin: fc.constantFrom('recorded', 'scripted') as fc.Arbitrary<'recorded' | 'scripted'>,
    actions: fc.array(actionArb, { minLength: 1, maxLength: 50 }),
    note: fc.option(cleanText(0, 500), { nil: undefined }),
    recordedWith: fc.option(cleanText(0, 120), { nil: undefined }),
    revisionOf: fc.option(cleanText(0, 80), { nil: undefined }),
    taskText: fc.option(hiddenText(300), { nil: undefined }),
  })
  .map((r) => ({
    format: 'ghost-hand-plan' as const,
    version: 1 as const,
    name: r.name,
    origin: r.origin,
    actions: r.actions,
    ...(r.note !== undefined ? { note: r.note } : {}),
    ...(r.recordedWith !== undefined ? { recordedWith: r.recordedWith } : {}),
    ...(r.revisionOf !== undefined ? { revisionOf: r.revisionOf } : {}),
    ...(r.taskText !== undefined ? { taskText: r.taskText } : {}),
  }));

describe('Property 1 (GH-P1): Plan file round trip and printed form', () => {
  it(
    'parse(print(plan)) equals plan, printing is idempotent, and the text is printable ASCII',
    () => {
      fc.assert(
        fc.property(planArb, (plan) => {
          const text = printPlanFile(plan);
          const parsed = parsePlanFile(text);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.plan).toEqual(plan);
          expect(printPlanFile(parsed.plan)).toBe(text);
          for (let i = 0; i < text.length; i += 1) {
            const unit = text.charCodeAt(i);
            if (unit > 0x7e) throw new Error(`code unit above 0x7E at index ${String(i)}`);
          }
          for (const ch of text) {
            expect(isHiddenDisplay(ch.codePointAt(0) ?? 0)).toBe(false);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );
});

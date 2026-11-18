import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parsePlanFile } from '../../src/plan/plan-file';
import type { PlanFile } from '../../src/plan/plan-file';
import { printPlanFile } from '../../src/plan/print-plan-file';
import { hasInvalidCharacter } from '../../src/plan/validate-command';
import { isHiddenDisplay } from '../../src/ui-imports';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

// Feature: ghost-shell, Property 1: Plan_File round trip (GS-P1)
// **Validates: Requirements 13.7, 13.8, 13.9**

const isSurrogate = (cp: number): boolean => cp >= 0xd800 && cp <= 0xdfff;

/** A code point that is printable ASCII or non-ASCII, never a control, hidden, or surrogate code point. */
const plainChar = fc
  .oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0x20, max: 0x7e }) },
    { weight: 2, arbitrary: fc.integer({ min: 0xa0, max: 0x2fff }) },
    { weight: 1, arbitrary: fc.integer({ min: 0x3000, max: 0x10ffff }) },
  )
  .filter((cp) => !isSurrogate(cp) && !isHiddenDisplay(cp))
  .map((cp) => String.fromCodePoint(cp));

/** Any code point except a lone surrogate; includes controls and hidden code points. */
const anyChar = fc
  .oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0x00, max: 0x7f }) },
    { weight: 2, arbitrary: fc.integer({ min: 0x80, max: 0xffff }) },
    { weight: 2, arbitrary: fc.integer({ min: 0xe0000, max: 0xe007f }) },
    { weight: 1, arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }) },
  )
  .filter((cp) => !isSurrogate(cp))
  .map((cp) => String.fromCodePoint(cp));

const plainText = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(plainChar, { minLength: min, maxLength: max }).map((a) => a.join(''));
const anyText = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(anyChar, { minLength: min, maxLength: max }).map((a) => a.join(''));

const action = fc.oneof(
  plainText(1, 60).map((command) => ({ command })),
  fc.record({ command: plainText(1, 60), cwd: plainText(0, 20) }),
);

const provenanceRecord = fc.record({
  source: anyText(1, 20),
  kind: fc.constantFrom('file', 'issue', 'web', 'other' as const),
  content: anyText(0, 80),
});

const planArb: fc.Arbitrary<PlanFile> = fc
  .record({
    name: plainText(1, 40),
    origin: fc.constantFrom('recorded', 'scripted' as const),
    actions: fc.array(action, { minLength: 1, maxLength: 50 }),
    note: fc.option(plainText(0, 80), { nil: undefined }),
    extra: fc.oneof(
      fc.record({ provenance: fc.array(provenanceRecord, { maxLength: 5 }) }),
      fc.record({ readings: fc.array(anyText(0, 40), { maxLength: 16 }) }),
      fc.constant({}),
    ),
  })
  .map(({ name, origin, actions, note, extra }) => ({
    format: 'ghost-run-plan' as const,
    version: 1 as const,
    name,
    origin,
    actions,
    ...(note === undefined ? {} : { note }),
    ...extra,
  }));

describe('Property 1: Plan_File round trip (GS-P1)', () => {
  it(
    'parse(print(plan)) equals plan, print is idempotent, and the text is ASCII with no hidden literal',
    () => {
      fc.assert(
        fc.property(planArb, (plan) => {
          // Generator sanity: commands carry no control or hidden code point.
          expect(plan.actions.some((a) => hasInvalidCharacter(a.command))).toBe(false);

          const text = printPlanFile(plan);
          const parsed = parsePlanFile(text);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.plan).toEqual(plan);
          expect(printPlanFile(parsed.plan)).toBe(text);
          for (const ch of text) {
            const cp = ch.codePointAt(0) ?? 0;
            expect(cp <= 0x7e).toBe(true);
            expect(isHiddenDisplay(cp)).toBe(false);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );
});

// Feature: ghost-cloud, Property 14: Pipeline totality and shape
// **Validates: Requirements 12.5, 12.7, 12.8, 12.9**
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseWards } from '@ghost-run/wards-config';
import { parseLine } from '../src/parse.js';
import { runGhostCloudPlan } from '../src/pipeline/run-plan.js';
import { INTERNAL_ERROR_MESSAGE, TRUNCATED_REASON } from '../src/pipeline/texts.js';
import { createGhostCloudWorld } from '../src/world.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { formatAction } from './support/format-action.js';

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

const HIDDEN = [0x200b, 0x200d, 0x2060, 0xfeff, 0x202e, 0x2066, 0xe0041].map((c) => String.fromCodePoint(c));
// Built from code points so that no hidden character is written in this file.
const HIDDEN_RE = new RegExp(`[${HIDDEN.join('')}]`, 'u');

const lineArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.string({ unit: 'binary', maxLength: 60 }) },
  { weight: 2, arbitrary: fc.string({ unit: 'grapheme', maxLength: 60 }) },
  { weight: 3, arbitrary: actionArb.map(formatAction) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(actionArb.map(formatAction), fc.constantFrom(...HIDDEN), fc.nat())
      .map(([l, h, n]) => `${l.slice(0, n % (l.length + 1))}${h}${l.slice(n % (l.length + 1))}`),
  },
);

describe('Property 14: pipeline totality and shape', () => {
  const wardSet = loadWards();

  it('never throws and returns plain, well-formed data', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(lineArb, { maxLength: 80 }), async (plan) => {
        const run = await runGhostCloudPlan(plan, wardSet);
        const kept = Math.min(plan.length, 50);

        expect(run.lines).toHaveLength(kept);
        expect(run.truncatedLines).toBe(plan.length - kept);
        run.lines.forEach((l, i) => {
          const a = parseLine(plan[i] as string);
          expect(l.index).toBe(i);
          expect(l.kind).toBe(a.kind);
          expect(l.unsupported).toBe(a.kind === 'unsupported');
          expect(typeof l.result.ok).toBe('boolean');
          if (l.unsupported) expect(l.result.ok).toBe(false);
          expect(HIDDEN_RE.test(l.line)).toBe(false);
        });
        expect(run.unsupportedSteps).toStrictEqual(run.lines.filter((l) => l.unsupported).map((l) => l.index));
        expect(run.report.snapshots).toHaveLength(kept + 1);
        expect(run.scenes.before['world']).toBe('ghost-cloud');
        expect(run.scenes.after['world']).toBe('ghost-cloud');
        expect(run.scenes.after).toStrictEqual(run.report.snapshots[kept]!.state);

        const cut = run.wardVerdict.notices.filter((n) => n.reason === TRUNCATED_REASON);
        if (plan.length > 50) {
          expect(cut).toHaveLength(1);
          expect(cut[0]?.kind).toBe('unsupported-step');
          expect(run.verdict).not.toBe('pass');
        } else {
          expect(cut).toHaveLength(0);
        }

        expect(Object.keys(run.p1).sort()).toStrictEqual(['after', 'before', 'equal']);
        expect(run.p1.before).toMatch(/^[0-9a-f]{64}$/);
        expect(run.p1.after).toMatch(/^[0-9a-f]{64}$/);

        expect(structuredClone(run)).toStrictEqual(run);
        expect(JSON.parse(JSON.stringify(run))).toStrictEqual(run);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('a plan of 51 valid lines gets the cut-off notice and at least warn', async () => {
    const run = await runGhostCloudPlan(Array.from({ length: 51 }, () => 'aws s3 ls'), wardSet);
    expect(run.truncatedLines).toBe(1);
    expect(run.verdict).toBe('warn');
    expect(run.wardVerdict.notices.some((n) => n.reason === TRUNCATED_REASON && n.stepIndex === 50)).toBe(true);
  });

  it('a broken world factory gives a block run, not a throw', async () => {
    const throwing = await runGhostCloudPlan(['aws s3 ls'], wardSet, {
      worldFactory: () => {
        throw new Error('broken factory');
      },
    });
    expect(throwing.verdict).toBe('block');
    expect(throwing.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(throwing.lines).toStrictEqual([]);
    expect(JSON.parse(JSON.stringify(throwing))).toStrictEqual(throwing);

    const inner = createGhostCloudWorld();
    const brokenStep = await runGhostCloudPlan(['aws s3 ls'], wardSet, {
      worldFactory: () => ({
        ...inner,
        step: () => Promise.reject(new Error('broken step')),
      }),
    });
    expect(brokenStep.verdict).toBe('block');
    expect(brokenStep.message).toBe(INTERNAL_ERROR_MESSAGE);
  });
});

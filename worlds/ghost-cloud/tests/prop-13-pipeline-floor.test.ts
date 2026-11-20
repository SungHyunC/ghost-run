// Feature: ghost-cloud, Property 13: Pipeline floor and notices
// **Validates: Requirements 12.2, 12.4, 12.6, 12.10**
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CLAIM_LOWERED_LINE, CLAIM_LOWERED_UNSUPPORTED_STEP_LINE, WardEngine } from '@ghost-run/core';
import type { Snapshot } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { createFixture } from '../src/fixture.js';
import { runGhostCloudPlan } from '../src/pipeline/run-plan.js';
import { P1_FAILED_TEXT, UNSUPPORTED_STEP_REASON } from '../src/pipeline/texts.js';
import { createGhostCloudWorld } from '../src/world.js';
import type { Action, BucketState, CloudState, StoredObject } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { formatAction } from './support/format-action.js';

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

const UNSUPPORTED_LINES = [
  '',
  'ls -la',
  'aws ec2 describe-instances',
  'aws s3 sync a b',
  'aws s3 ls ; rm -rf x',
  'aws s3 rb s3://Bad_Name',
  'aws s3 cp s3://prod-assets/a.txt local/x.txt',
] as const;

type Item = { readonly line: string; readonly unsupported: boolean };

const supportedItem: fc.Arbitrary<Item> = actionArb.map((a) => ({ line: formatAction(a), unsupported: false }));
const unsupportedItem: fc.Arbitrary<Item> = fc
  .constantFrom(...UNSUPPORTED_LINES)
  .map((line) => ({ line, unsupported: true }));

describe('Property 13: pipeline floor and notices', () => {
  const wardSet = loadWards();

  it('verdict floor, notices, and lowered-claim line', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof({ weight: 3, arbitrary: supportedItem }, { weight: 1, arbitrary: unsupportedItem }), { maxLength: 50 }),
        async (items) => {
          const run = await runGhostCloudPlan(items.map((i) => i.line), wardSet);
          const unsupportedIdx = items.flatMap((it, i) => (it.unsupported ? [i] : []));
          const hasUnsupported = unsupportedIdx.length > 0;

          expect(run.unsupportedSteps).toStrictEqual(unsupportedIdx);
          expect(run.engineVerdict).toStrictEqual(WardEngine.evaluate(run.report, wardSet));

          const engine = run.engineVerdict.verdict;
          const expectedVerdict = engine === 'block' ? 'block' : hasUnsupported ? 'warn' : engine;
          expect(run.wardVerdict.verdict).toBe(expectedVerdict);
          expect(run.verdict).toBe(expectedVerdict);
          expect(run.wardVerdict.violations).toStrictEqual(run.engineVerdict.violations);

          const extra = run.wardVerdict.notices.slice(run.engineVerdict.notices.length);
          expect(run.wardVerdict.notices.slice(0, run.engineVerdict.notices.length)).toStrictEqual(run.engineVerdict.notices);
          expect(extra).toStrictEqual(
            unsupportedIdx.map((stepIndex) => ({ kind: 'unsupported-step', stepIndex, reason: UNSUPPORTED_STEP_REASON })),
          );

          expect(run.message.includes(CLAIM_LOWERED_UNSUPPORTED_STEP_LINE)).toBe(hasUnsupported);
          expect(run.message.includes(CLAIM_LOWERED_LINE)).toBe(false);
          expect(run.message.includes(P1_FAILED_TEXT)).toBe(false);
          expect(run.p1.equal).toBe(true);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('an empty plan passes', async () => {
    const run = await runGhostCloudPlan([], wardSet);
    expect(run.verdict).toBe('pass');
    expect(run.lines).toStrictEqual([]);
  });

  describe('P1 check (D11)', () => {
    type Mut = { buckets: (BucketState & { objects: StoredObject[] })[] };

    it('a world whose step writes into Reality gives block, one P1 notice, and the lowered claim', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 10 }), async (actions) => {
          const reality: CloudState = createFixture();
          const factory = () => {
            const inner = createGhostCloudWorld({ reality });
            let n = 0;
            return {
              ...inner,
              async step(s: Snapshot<CloudState>, a: Action) {
                (reality as unknown as Mut).buckets[0]!.objects.push({ key: `leak-${++n}`, content: 'x' });
                return inner.step(s, a);
              },
            };
          };
          const run = await runGhostCloudPlan(actions.map(formatAction), wardSet, { worldFactory: factory });
          expect(run.verdict).toBe('block');
          expect(run.p1.equal).toBe(false);
          expect(run.p1.before).not.toBe(run.p1.after);
          const p1Notices = run.wardVerdict.notices.filter((n) => n.reason === P1_FAILED_TEXT);
          expect(p1Notices).toHaveLength(1);
          expect(p1Notices[0]?.kind).toBe('observed-event');
          expect(run.message.includes(P1_FAILED_TEXT)).toBe(true);
          expect(run.message.includes(CLAIM_LOWERED_LINE)).toBe(true);
          return true;
        }),
        { numRuns: NUM_RUNS },
      );
    }, PBT_TIMEOUT);

    it('a correct world has equal before and after hashes', async () => {
      const run = await runGhostCloudPlan(['aws s3 rb s3://tmp-build-cache --force'], wardSet);
      expect(run.p1.equal).toBe(true);
      expect(run.p1.before).toBe(run.p1.after);
      expect(run.p1.before).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

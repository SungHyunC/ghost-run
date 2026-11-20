// Feature: ghost-cloud, Property 12: Ward soundness (P5 for supported plans)
// **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 8.1**
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseWards } from '@ghost-run/wards-config';
import { createFixture } from '../src/fixture.js';
import { runGhostCloudPlan } from '../src/pipeline/run-plan.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { formatAction } from './support/format-action.js';
import { referenceEvents } from './support/reference-model.js';

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

describe('Property 12: ward soundness', () => {
  const wardSet = loadWards();

  it('violated ward ids and verdict follow the Reference_Model events', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { maxLength: 30 }), async (actions) => {
        const events = referenceEvents(createFixture(), actions);
        const expected = new Set<string>();
        for (const e of events) {
          if (e.kind === 'file-deleted' && (e.path.split('/')[0] as string).startsWith('prod-')) expected.add('no-bucket-delete');
          if (
            (e.kind === 'file-deleted' || e.kind === 'file-overwritten') &&
            (e.path.startsWith('_acl/prod-') || e.path.startsWith('_public-access-block/prod-'))
          ) {
            expected.add('no-public-bucket');
          }
        }
        const hasEndpoint = actions.some((a) => a.kind !== 'unsupported' && a.endpointUrl !== undefined);

        const run = await runGhostCloudPlan(actions.map(formatAction), wardSet);

        expect(run.unsupportedSteps).toStrictEqual([]);
        const got = new Set(run.wardVerdict.violations.map((v) => v.wardId));
        expect(got).toStrictEqual(expected);
        expect(run.verdict).toBe(expected.size > 0 ? 'block' : hasEndpoint ? 'warn' : 'pass');
        expect(run.p1.equal).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('examples: a protected bucket delete and a public ACL change are each caught', async () => {
    const del = await runGhostCloudPlan(['aws s3 rb s3://prod-logs --force'], wardSet);
    expect(del.verdict).toBe('block');
    expect([...new Set(del.wardVerdict.violations.map((v) => v.wardId))]).toStrictEqual(['no-bucket-delete']);
    const pub = await runGhostCloudPlan(['aws s3api put-bucket-acl --bucket prod-logs --acl public-read'], wardSet);
    expect(pub.verdict).toBe('block');
    expect([...new Set(pub.wardVerdict.violations.map((v) => v.wardId))]).toStrictEqual(['no-public-bucket']);
  });
});

// Feature: ghost-cloud, Property 7: Step purity
// **Validates: Requirements 1.4, 1.5, 1.6, 2.3**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun } from '@ghost-run/core';
import { createGhostCloudWorld } from '../src/world.js';
import type { Action, CloudState } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';

const MISSING = ['no-such-bkt', 'zzz-missing'] as const;
const BAD_KEYS = ['', '/abs', 'a//b', '../x', 'a/..', 'a/../b', '/'] as const;

const wideBucket = fc.constantFrom('prod-assets', 'prod-logs', 'tmp-build-cache', ...MISSING);
const wideKey = fc.constantFrom('index.html', 'a.txt', 'cache/a.txt', ...BAD_KEYS);

const wideActionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 4, arbitrary: actionArb },
  { weight: 1, arbitrary: fc.string({ maxLength: 40 }).map((reason): Action => ({ kind: 'unsupported', line: 'x', reason })) },
  { weight: 1, arbitrary: wideBucket.map((bucket): Action => ({ kind: 'ls', bucket })) },
  { weight: 1, arbitrary: wideBucket.map((bucket): Action => ({ kind: 'mb', bucket })) },
  { weight: 1, arbitrary: fc.tuple(wideBucket, fc.boolean()).map(([bucket, force]): Action => ({ kind: 'rb', bucket, force })) },
  { weight: 2, arbitrary: fc.tuple(wideBucket, wideKey, fc.boolean()).map(([bucket, key, recursive]): Action => ({ kind: 'rm', bucket, key, recursive })) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(wideBucket, wideKey, fc.constantFrom('local/notes.txt', 'local/missing.txt', 'nope'))
      .map(([bucket, key, source]): Action => ({ kind: 'cp', bucket, key, source })),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(wideBucket, wideKey, wideBucket, wideKey)
      .map(([bucket, key, fromBucket, fromKey]): Action => ({ kind: 'cp', bucket, key, fromBucket, fromKey })),
  },
  { weight: 1, arbitrary: wideBucket.map((bucket): Action => ({ kind: 'put-bucket-acl', bucket, acl: 'public-read' })) },
  { weight: 1, arbitrary: wideBucket.map((bucket): Action => ({ kind: 'delete-public-access-block', bucket })) },
);

function bucketExists(s: CloudState, name: string): boolean {
  return s.buckets.some((b) => b.name === name);
}

/** True when the test can tell, without the world, that the action must fail. */
function mustFail(s: CloudState, a: Action): boolean {
  if (a.kind === 'unsupported') return true;
  if (a.kind === 'mb') return bucketExists(s, a.bucket);
  if (a.kind === 'ls') return a.bucket !== undefined && !bucketExists(s, a.bucket);
  if (!bucketExists(s, a.bucket)) return true;
  if (a.kind === 'cp' && a.fromBucket !== undefined && !bucketExists(s, a.fromBucket)) return true;
  if (a.kind === 'cp' && a.source !== undefined && !s.localFiles.some((f) => f.path === a.source)) return true;
  if ((a.kind === 'cp' || (a.kind === 'rm' && !a.recursive)) && (BAD_KEYS as readonly string[]).includes(a.key)) return true;
  return false;
}

describe('Property 7: step purity', () => {
  it('step never throws, never mutates its input, and fails cleanly on invalid actions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { maxLength: 12 }),
        wideActionArb,
        async (prefix, action) => {
          const world = createGhostCloudWorld();
          const start = await world.snapshot();
          const report = await ghostRun(world, start, prefix);
          const snap = report.snapshots[report.snapshots.length - 1]!;
          const stateBefore = structuredClone(snap.state);
          const resultBefore = structuredClone(snap.result);

          const next = await world.step(snap, action);

          expect(snap.state).toStrictEqual(stateBefore);
          expect(snap.result).toStrictEqual(resultBefore);
          expect(next).not.toBe(snap);
          expect(next.state).not.toBe(snap.state);
          expect(next.id).not.toBe(snap.id);
          if (!next.result.success) {
            expect(typeof next.result.error).toBe('string');
            expect(next.state).toStrictEqual(stateBefore);
          }
          if (mustFail(stateBefore, action)) expect(next.result.success).toBe(false);
          if (action.kind === 'unsupported') {
            expect(next.result.success).toBe(false);
            if (!next.result.success) expect(next.result.error.startsWith('unsupported step')).toBe(true);
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('step does not touch Reality', async () => {
    const world = createGhostCloudWorld();
    const before = await world.fingerprint();
    const s = await world.snapshot();
    await world.step(s, { kind: 'rb', bucket: 'prod-assets', force: true });
    expect((await world.fingerprint()).hash).toBe(before.hash);
  });
});

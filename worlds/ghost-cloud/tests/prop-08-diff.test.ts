// Feature: ghost-cloud, Property 8: Diff minimality and order
// **Validates: Requirements 2.4**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun } from '@ghost-run/core';
import type { Change } from '@ghost-run/core';
import { createGhostCloudWorld } from '../src/world.js';
import type { CloudState } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';

function cpCompare(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number) ? -1 : 1;
  }
  return x.length - y.length;
}

/** Flat path map of a state, written in the test. Local files are not part of the diff. */
function flatten(s: CloudState): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of s.buckets) {
    m.set(b.name, '');
    m.set(`_acl/${b.name}`, b.acl);
    if (b.publicAccessBlocked) m.set(`_public-access-block/${b.name}`, 'blocked');
    for (const o of b.objects) m.set(`${b.name}/${o.key}`, o.content);
  }
  return m;
}

function bucketNames(s: CloudState): Set<string> {
  return new Set(s.buckets.map((b) => b.name));
}

/** The bucket an attribute path belongs to, or undefined for a bucket or object path. */
function attributeBucket(path: string): string | undefined {
  for (const p of ['_acl/', '_public-access-block/']) if (path.startsWith(p)) return path.slice(p.length);
  return undefined;
}

describe('Property 8: diff minimality and order', () => {
  it('diff matches the flat-map oracle on any two states of a plan', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 1, maxLength: 20 }),
        fc.nat(),
        fc.nat(),
        async (plan, i, j) => {
          const world = createGhostCloudWorld();
          const report = await ghostRun(world, await world.snapshot(), plan);
          const snaps = report.snapshots;
          const before = snaps[i % snaps.length]!;
          const after = snaps[j % snaps.length]!;
          const beforeCopy = structuredClone(before.state);
          const afterCopy = structuredClone(after.state);

          const changes = world.diff(before, after) as Change[];

          // no mutation of the inputs
          expect(before.state).toStrictEqual(beforeCopy);
          expect(after.state).toStrictEqual(afterCopy);

          // shape, order, no duplicate
          for (const c of changes) expect(Object.keys(c).sort()).toStrictEqual(['kind', 'path']);
          const paths = changes.map((c) => c['path'] as string);
          for (let k = 1; k < paths.length; k++) expect(cpCompare(paths[k - 1]!, paths[k]!)).toBeLessThan(0);

          // exactly the paths that differ
          const fb = flatten(before.state);
          const fa = flatten(after.state);
          const inBoth = (name: string): boolean => bucketNames(before.state).has(name) && bucketNames(after.state).has(name);
          const expected = new Map<string, string>();
          for (const p of new Set([...fb.keys(), ...fa.keys()])) {
            const attr = attributeBucket(p);
            if (attr !== undefined && !inBoth(attr)) continue;
            if (!fb.has(p)) expected.set(p, 'file-created');
            else if (!fa.has(p)) expected.set(p, 'file-deleted');
            else if (fb.get(p) !== fa.get(p)) expected.set(p, 'file-overwritten');
          }
          expect(new Map(changes.map((c) => [c['path'] as string, c.kind]))).toStrictEqual(expected);

          // applying the changes to the flat map of before gives the flat map of after, on the covered paths
          const applied = new Map(fb);
          for (const c of changes) {
            const p = c['path'] as string;
            if (c.kind === 'file-deleted') applied.delete(p);
            else applied.set(p, fa.get(p) as string);
          }
          for (const p of new Set([...applied.keys(), ...fa.keys()])) {
            const attr = attributeBucket(p);
            if (attr !== undefined && !inBoth(attr)) continue;
            expect(applied.get(p)).toBe(fa.get(p));
          }

          // diff of a snapshot with itself is empty
          expect(world.diff(before, before)).toStrictEqual([]);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('a deleted bucket gives changes for the bucket and its objects, not for its attributes', async () => {
    const world = createGhostCloudWorld();
    const s = await world.snapshot();
    const t = await world.step(s, { kind: 'rb', bucket: 'prod-logs', force: true });
    expect(world.diff(s, t).map((c) => c['path'])).toStrictEqual([
      'prod-logs',
      'prod-logs/2026/01/app.log',
      'prod-logs/2026/02/app.log',
    ]);
  });
});

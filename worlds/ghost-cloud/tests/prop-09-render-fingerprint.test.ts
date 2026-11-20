// Feature: ghost-cloud, Property 9: Render purity and fingerprint stability
// **Validates: Requirements 2.5, 2.6**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun } from '@ghost-run/core';
import type { Snapshot } from '@ghost-run/core';
import { createGhostCloudWorld } from '../src/world.js';
import type { BucketState, CloudState } from '../src/types.js';
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

async function fingerprintOf(state: CloudState): Promise<string> {
  return (await createGhostCloudWorld({ reality: structuredClone(state) }).fingerprint()).hash;
}

type MutState = { buckets: (Omit<BucketState, 'objects'> & { acl: string; publicAccessBlocked: boolean; objects: { key: string; content: string }[] })[] };

describe('Property 9: render purity and fingerprint stability', () => {
  it('render is pure, sorted, and JSON-safe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { maxLength: 20 }), async (plan) => {
        const world = createGhostCloudWorld();
        const report = await ghostRun(world, await world.snapshot(), plan);
        const snap = report.snapshots[report.snapshots.length - 1] as Snapshot<CloudState>;
        const copy = structuredClone(snap);
        const a = world.render(snap);
        const b = world.render(snap);
        expect(a).toStrictEqual(b);
        expect(snap).toStrictEqual(copy);
        expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a);
        const buckets = a['buckets'] as { name: string; objects: { key: string }[] }[];
        for (let i = 1; i < buckets.length; i++) expect(cpCompare(buckets[i - 1]!.name, buckets[i]!.name)).toBeLessThan(0);
        for (const bk of buckets) {
          for (let i = 1; i < bk.objects.length; i++) expect(cpCompare(bk.objects[i - 1]!.key, bk.objects[i]!.key)).toBeLessThan(0);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('equal states give equal fingerprints; a one-field change gives a different one', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { maxLength: 20 }), fc.nat(), fc.constantFrom('object', 'drop-object', 'acl', 'block'), async (plan, n, how) => {
        const world = createGhostCloudWorld();
        const report = await ghostRun(world, await world.snapshot(), plan);
        const state = (report.snapshots[report.snapshots.length - 1] as Snapshot<CloudState>).state;
        const base = await fingerprintOf(state);
        expect(await fingerprintOf(structuredClone(state))).toBe(base);

        const changed = structuredClone(state) as unknown as MutState;
        if (changed.buckets.length === 0) return true;
        const bucket = changed.buckets[n % changed.buckets.length]!;
        if (how === 'acl') bucket.acl = bucket.acl === 'private' ? 'public-read' : 'private';
        else if (how === 'block') bucket.publicAccessBlocked = !bucket.publicAccessBlocked;
        else {
          if (bucket.objects.length === 0) return true;
          const idx = n % bucket.objects.length;
          if (how === 'object') bucket.objects[idx]!.content = `${bucket.objects[idx]!.content}!`;
          else bucket.objects.splice(idx, 1);
        }
        expect(await fingerprintOf(changed as unknown as CloudState)).not.toBe(base);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('the fingerprint is a SHA-256 hex hash with a manifest', async () => {
    const fp = await createGhostCloudWorld().fingerprint();
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(fp.manifest).length).toBeGreaterThan(0);
  });
});

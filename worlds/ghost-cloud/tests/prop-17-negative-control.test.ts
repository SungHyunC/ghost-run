// Feature: ghost-cloud, Property 17: Gate catches a broken world
// **Validates: Requirements 3.2, 3.3, 8.1**
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyWorld, VerificationError } from '@ghost-run/core/verify';
import type { Change, Snapshot } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { createFixture } from '../src/fixture.js';
import { createGhostCloudWorld } from '../src/world.js';
import type { GhostCloudWorld } from '../src/world.js';
import type { Action, BucketState, CloudState, StoredObject } from '../src/types.js';
import { PBT_TIMEOUT } from './pbt-config.js';

// Design, Property 17: 100 examples per case in both modes. A failing gate shrinks, and at 10,000
// examples the shrink did not finish in over an hour.
const NEGATIVE_CONTROL_RUNS = 100;
import { actionArb } from './support/arbitraries.js';
import { createReferenceAdapter } from './support/reference-model.js';

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

type Mut = { buckets: (BucketState & { objects: StoredObject[] })[] };

/** Broken on purpose: every step also writes into Reality. */
function brokenReality(): GhostCloudWorld {
  const reality: CloudState = createFixture();
  const inner = createGhostCloudWorld({ reality });
  let n = 0;
  return {
    ...inner,
    async step(s: Snapshot<CloudState>, a: Action) {
      (reality as unknown as Mut).buckets[0]!.objects.push({ key: `leak-${++n}`, content: 'x' });
      return inner.step(s, a);
    },
  };
}

/** Broken on purpose: diff loses its first change. */
function brokenDiff(): GhostCloudWorld {
  const inner = createGhostCloudWorld();
  return {
    ...inner,
    diff(before: Snapshot<CloudState>, after: Snapshot<CloudState>): Change[] {
      return inner.diff(before, after).slice(1);
    },
  };
}

/** Broken on purpose: step mutates its input snapshot. */
function brokenInput(): GhostCloudWorld {
  const inner = createGhostCloudWorld();
  return {
    ...inner,
    async step(s: Snapshot<CloudState>, a: Action) {
      (s.state as unknown as Mut).buckets.push({ name: 'zzz-mutated', acl: 'private', publicAccessBlocked: true, objects: [] });
      return inner.step(s, a);
    },
  };
}

async function gate(world: GhostCloudWorld): Promise<unknown> {
  try {
    await verifyWorld(world, {
      id: 'ghost-cloud',
      deterministic: true,
      wardSet: loadWards(),
      testAdapter: createReferenceAdapter(),
      actionArb,
      numRuns: NEGATIVE_CONTROL_RUNS,
    });
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('Property 17: the gate catches a broken world', () => {
  it('a step that writes to Reality fails P1', async () => {
    const err = await gate(brokenReality());
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).propertyId).toBe('P1');
  }, PBT_TIMEOUT);

  it('a diff that drops a change fails P2', async () => {
    const err = await gate(brokenDiff());
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).propertyId).toBe('P2');
  }, PBT_TIMEOUT);

  it('a step that mutates its input fails P3', async () => {
    const err = await gate(brokenInput());
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).propertyId).toBe('P3');
  }, PBT_TIMEOUT);

  it('the unbroken world passes the same gate', async () => {
    expect(await gate(createGhostCloudWorld())).toBeUndefined();
  }, PBT_TIMEOUT);
});

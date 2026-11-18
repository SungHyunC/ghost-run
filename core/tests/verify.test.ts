import { describe, expect, it } from 'vitest';
import type { FingerprintResult, Snapshot, WardSet } from '../src/index.js';
import { VerificationError, verifyWorld } from '../verify.js';
import type { DeterministicTestAdapter } from '../verify.js';
import { actionArb, KeyValueWorld, kvTestAdapter } from './fixtures/index.js';
import type { KVAction, KVState } from './fixtures/index.js';

const NUM_RUNS = 50;

const pathWardSet: WardSet = {
  wards: [{ id: 'protect-a', kind: 'path', deny: ['delete', 'overwrite'], paths: ['a'] }],
};

/** step() writes into the input snapshot's state (violates the contract; breaks P3). */
class MutatingStepWorld extends KeyValueWorld {
  override async step(s: Snapshot<KVState>, a: KVAction): Promise<Snapshot<KVState>> {
    const next = await super.step(s, a);
    // Mutate the input snapshot in place.
    for (const k of Object.keys(s.state)) delete s.state[k];
    Object.assign(s.state, next.state);
    s.state['__mutated__'] = String(Math.random());
    return next;
  }
}

/** Pure step, but each ghost step leaks into reality's fingerprint (breaks P1 only). */
class LeakyFingerprintWorld extends KeyValueWorld {
  private leaks = 0;

  override async step(s: Snapshot<KVState>, a: KVAction): Promise<Snapshot<KVState>> {
    this.leaks += 1;
    return super.step(s, a);
  }

  override async fingerprint(): Promise<FingerprintResult> {
    const base = await super.fingerprint();
    return { ...base, hash: `${base.hash}:${this.leaks}` };
  }
}

/** Real execution reports nothing, so ghost diff != real diff (breaks P2 only). */
const silentAdapter: DeterministicTestAdapter<KVState, KVAction> = {
  apply: () => [],
};

async function catchError(p: Promise<void>): Promise<VerificationError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VerificationError);
    return e as VerificationError;
  }
  throw new Error('expected verifyWorld to throw');
}

describe('verifyWorld', () => {
  it('fails P3 when step mutates its input snapshot', async () => {
    const err = await catchError(
      verifyWorld(new MutatingStepWorld({ a: '1' }), {
        id: 'mutating',
        deterministic: true,
        testAdapter: kvTestAdapter,
        wardSet: pathWardSet,
        actionArb,
        numRuns: NUM_RUNS,
      }),
    );
    expect(err.propertyId).toBe('P3');
    expect(err.criterionId).toBeTruthy();
    expect(err.counterexample).toBeDefined();
  });

  it('fails P1 when the fingerprint changes after a ghost run', async () => {
    const err = await catchError(
      verifyWorld(new LeakyFingerprintWorld({ a: '1' }), {
        id: 'leaky',
        deterministic: true,
        testAdapter: kvTestAdapter,
        wardSet: pathWardSet,
        actionArb,
        numRuns: NUM_RUNS,
      }),
    );
    expect(err.propertyId).toBe('P1');
    expect(err.criterionId).toBe('8.1');
    expect(err.counterexample).toBeDefined();
  });

  it('passes all checks for a conforming deterministic world with a ward set', async () => {
    await expect(
      verifyWorld(new KeyValueWorld({ a: '1', b: '2' }), {
        id: 'kv',
        deterministic: true,
        testAdapter: kvTestAdapter,
        wardSet: pathWardSet,
        actionArb,
        numRuns: NUM_RUNS,
      }),
    ).resolves.toBeUndefined();
  });

  it('skips P2 when deterministic is false, and fails P2 when it is true', async () => {
    const base = {
      id: 'kv-p2',
      testAdapter: silentAdapter,
      wardSet: pathWardSet,
      actionArb,
      numRuns: NUM_RUNS,
    };

    await expect(
      verifyWorld(new KeyValueWorld(), { ...base, deterministic: false }),
    ).resolves.toBeUndefined();

    const err = await catchError(verifyWorld(new KeyValueWorld(), { ...base, deterministic: true }));
    expect(err.propertyId).toBe('P2');
    expect(err.criterionId).toBe('9.1');
    expect(err.counterexample).toBeDefined();
  });
});

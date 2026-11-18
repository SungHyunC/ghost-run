import fc from 'fast-check';
import type { KVAction, KVState } from './key-value-world.js';

// Small key pool so sets, overwrites and deletes collide often.
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', '__proto__', 'constructor'] as const;

const keyArb: fc.Arbitrary<string> = fc.constantFrom(...KEYS);
const valueArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('', 'x', 'y', 'sk-CANARY-abc123'),
  fc.string({ maxLength: 8 }),
);

/** Initial state of the reference KeyValueWorld (0-6 entries). */
export const worldStateArb: fc.Arbitrary<KVState> = fc
  .array(fc.tuple(keyArb, valueArb), { maxLength: 6 })
  .map((entries) => Object.fromEntries(entries));

/** Valid (and occasionally value-less, hence failing) actions for KeyValueWorld. */
export const actionArb: fc.Arbitrary<KVAction> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ op: fc.constant('set' as const), key: keyArb, value: valueArb }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant('delete' as const), key: keyArb }) },
  {
    weight: 1,
    arbitrary: fc.record({ op: fc.constant('set' as const), key: keyArb }),
  },
);

/** Plans of 1-50 actions. */
export const planArb: fc.Arbitrary<KVAction[]> = fc.array(actionArb, {
  minLength: 1,
  maxLength: 50,
});

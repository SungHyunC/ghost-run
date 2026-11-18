// Feature: ghost-hand, Property 21: Unknown forbidden-contact names are all reported (GH-P21)
// **Validates: Requirements 4.7**
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { Ward, WardSet } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findUnknownContacts } from '../../src/pipeline/unknown-contacts.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const NAMES: readonly string[] = WORLD_CONFIG.contactNames;

const entryArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...NAMES),
  fc.string({ maxLength: 8 }),
  fc.constantFrom('Vase', 'vase ', 'table', ''),
);

const physics = (id: string, forbidden: string[]): Ward => ({
  id,
  kind: 'physics',
  min_success_rate: 0.5,
  max_contact_force_n: 50,
  forbidden_contacts: forbidden,
});

const wardSetArb: fc.Arbitrary<WardSet> = fc
  .array(fc.array(entryArb, { maxLength: 8 }), { maxLength: 4 })
  .chain((lists) =>
    fc.boolean().map((withOther) => ({
      wards: [
        ...(withOther
          ? [{ id: 'p', kind: 'path', deny: ['delete'], paths: ['x'] } as Ward]
          : []),
        ...lists.map((l, i) => physics(`phys-${i}`, l)),
      ],
    })),
  );

function expected(ws: WardSet): string[] {
  const out: string[] = [];
  for (const w of ws.wards) {
    if (w.kind !== 'physics') continue;
    for (const n of w.forbidden_contacts) if (!NAMES.includes(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

describe('Property 21 (GH-P21): Unknown forbidden-contact names are all reported', () => {
  it(
    'reports the exact distinct unknown entries in first-appearance order',
    () => {
      fc.assert(
        fc.property(wardSetArb, (ws) => {
          const got = findUnknownContacts(ws, NAMES);
          expect(got).toEqual(expected(ws));
          expect(new Set(got).size).toBe(got.length);
          expect(got.every((n) => !NAMES.includes(n))).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it(
    'returns an empty list when every entry is a valid Contact_Name',
    () => {
      fc.assert(
        fc.property(fc.array(fc.array(fc.constantFrom(...NAMES), { maxLength: 6 }), { maxLength: 4 }), (lists) => {
          const ws: WardSet = { wards: lists.map((l, i) => physics(`phys-${i}`, l)) };
          expect(findUnknownContacts(ws, NAMES)).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: duplicates across wards are reported once, in first-appearance order', () => {
    const ws: WardSet = { wards: [physics('a', ['zeta', 'vase', 'alpha']), physics('b', ['alpha', 'beta', 'zeta'])] };
    expect(findUnknownContacts(ws, NAMES)).toEqual(['zeta', 'alpha', 'beta']);
  });
});

// Feature: ghost-hand, Property 4: Parser totality and error shape (GH-P5)
// **Validates: Requirements 7.1, 7.2, 7.5, 7.6, 7.7, 7.11**

import { parseVariantConfig } from '@ghost-run/drawer-arm';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parsePlanFile } from '../../src/plan/plan-file.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const PLAN_LIMIT = 1024 * 1024;
const VARIANT_LIMIT = 64 * 1024;

interface AnyError {
  readonly code: unknown;
  readonly message: unknown;
  readonly field: unknown;
}
interface AnyResult {
  readonly ok: boolean;
  readonly errors?: readonly AnyError[];
}

const parsers: ReadonlyArray<readonly [string, (t: string) => AnyResult, number]> = [
  ['parsePlanFile', parsePlanFile as (t: string) => AnyResult, PLAN_LIMIT],
  ['parseVariantConfig', parseVariantConfig as (t: string) => AnyResult, VARIANT_LIMIT],
];

/** Calls the parser; fails the property when it throws or returns a malformed result. */
function checkShape(parse: (t: string) => AnyResult, text: string): AnyResult {
  const r = parse(text);
  expect(typeof r).toBe('object');
  expect(r).not.toBeNull();
  expect(typeof r.ok).toBe('boolean');
  if (!r.ok) {
    expect(Array.isArray(r.errors)).toBe(true);
    expect(r.errors?.length ?? 0).toBeGreaterThan(0);
    for (const e of r.errors ?? []) {
      expect(typeof e.code).toBe('string');
      expect((e.code as string).length).toBeGreaterThan(0);
      expect(typeof e.message).toBe('string');
      expect((e.message as string).length).toBeGreaterThan(0);
      expect(typeof e.field).toBe('string');
    }
  }
  return r;
}

const hostile = (): fc.Arbitrary<string> => {
  const lone = (hex: string): string => `"\\u${hex}"`;
  const hexSurrogate = fc
    .integer({ min: 0xd800, max: 0xdfff })
    .map((n) => lone(n.toString(16)));
  const deep = fc
    .tuple(fc.integer({ min: 1, max: 5000 }), fc.constantFrom('[', '{"a":'))
    .map(([n, open]) => open.repeat(n) + '1' + (open === '[' ? ']' : '}').repeat(n));
  const hugeNumber = fc
    .tuple(fc.constantFrom('1e999', '-1e999', '1e-999', '9'.repeat(400), '-0', '0.1e1'), fc.constantFrom('version', 'defaultCount', 'speed', 'min'))
    .map(([num, key]) => `{"${key}":${num},"actions":[{"type":"pull","distance":${num},"speed":${num}}]}`);
  const lonePair = fc
    .tuple(fc.constantFrom('name', 'note', 'format', 'x'), hexSurrogate)
    .map(([k, v]) => `{"${k}":${v}}`);
  const rawLone = fc
    .constantFrom(0xd800, 0xdbff, 0xdc00, 0xdfff)
    .map((cu) => `"${String.fromCharCode(cu)}"`);
  return fc.oneof(
    fc.string({ unit: 'binary' }),
    fc.jsonValue().map((v) => JSON.stringify(v)),
    fc.jsonValue().map((v) => JSON.stringify(v, null, 2)),
    deep,
    hugeNumber,
    lonePair,
    rawLone,
  );
};

describe('Property 4 (GH-P5): parser totality and error shape', () => {
  for (const [name, parse, limit] of parsers) {
    it(`${name} never throws and every error is well formed`, () => {
      fc.assert(
        fc.property(hostile(), (text) => {
          checkShape(parse, text);
        }),
        { numRuns: NUM_RUNS },
      );
    }, PBT_TIMEOUT);

    it(`${name} returns only input-too-large above its limit`, () => {
      // Sizes are drawn from a few constants to keep the property cheap.
      fc.assert(
        fc.property(
          fc.constantFrom(limit + 1, limit + 2, limit + 100),
          fc.constantFrom(' ', 'x', '\u00e9'),
          (extra, ch) => {
            const unitBytes = ch === '\u00e9' ? 2 : 1;
            const text = ch.repeat(Math.ceil(extra / unitBytes));
            const r = checkShape(parse, text);
            expect(r.ok).toBe(false);
            expect(r.errors?.map((e) => e.code)).toEqual(['input-too-large']);
          },
        ),
        { numRuns: Math.min(NUM_RUNS, 20) },
      );
    }, PBT_TIMEOUT);

    it(`${name} accepts texts exactly at the limit as size-wise valid`, () => {
      const text = '{' + ' '.repeat(limit - 2) + '}';
      expect(text.length).toBe(limit);
      const r = checkShape(parse, text);
      expect(r.errors?.some((e) => e.code === 'input-too-large') ?? false).toBe(false);
    });
  }

  it('counts multi-byte characters in UTF-8 bytes, not code units', () => {
    // 40 000 two-byte characters: 40 000 code units, 80 000 bytes (over 64 KiB).
    const variant = parseVariantConfig(`"${'\u00e9'.repeat(40_000)}"`);
    expect(variant.ok).toBe(false);
    if (!variant.ok) expect(variant.errors.map((e) => e.code)).toEqual(['input-too-large']);
    // 600 000 two-byte characters: under 1 MiB code units, 1.2 MB bytes.
    const plan = parsePlanFile(`"${'\u00e9'.repeat(600_000)}"`);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.errors.map((e) => e.code)).toEqual(['input-too-large']);
  });

  it('handles a lone surrogate written as an escape or as a raw code unit', () => {
    for (const [, parse] of parsers) {
      checkShape(parse, '{"name":"\\ud800"}');
      checkShape(parse, `{"name":"${String.fromCharCode(0xdc00)}"}`);
    }
  });
});

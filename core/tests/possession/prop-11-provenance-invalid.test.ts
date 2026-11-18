// Feature: possession, Property 11: Invalid provenance input is rejected without a partial log
// **Validates: Requirements 8.4, 8.5, 8.6**
//
// Scope: supporting property (error conditions). Claimed everywhere.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseProvenanceLog } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import { asciiReporter, provenanceLog } from './arbitraries.js';

type Variant =
  | 'empty-source'
  | 'bad-kind'
  | 'bad-content'
  | 'extra-field'
  | 'non-object'
  | 'non-array'
  | 'non-json';

interface Case {
  readonly variant: Variant;
  readonly text: string;
  /** Index of the replaced record; undefined for top-level cases. */
  readonly index?: number;
  /** Field the error must name; undefined when none is expected. */
  readonly field?: string;
}

const validKinds = ['file', 'issue', 'web', 'other'];

const badKind: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().filter((s) => !validKinds.includes(s)),
  fc.constantFrom('FILE', 'File', '', 'file ', 'url'),
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
);

const nonString: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 4 }), fc.string({ maxLength: 4 }), { maxKeys: 2 }),
);

const extraKey: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('__proto__', 'extra', 'id', 'timestamp', 'Source', 'constructor'),
  fc.stringMatching(/^[a-z]{1,8}$/).filter((k) => !['source', 'kind', 'content'].includes(k)),
);

const nonObjectElement: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 3 }),
);

const nonArrayTop: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.stringMatching(/^[a-z]{1,5}$/), fc.string({ maxLength: 4 }), { maxKeys: 3 }),
);

const notJson: fc.Arbitrary<string> = fc
  .oneof(
    fc.string(),
    fc.constantFrom('', '[', '{', '[1,', 'undefined', "['a']", '[{"source":}]', 'NaN'),
    fc.json().map((j) => j + ' x'),
  )
  .filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  });

/** A valid log with one record index and a way to replace it with invalid element text. */
const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.array(provenanceLog, { minLength: 1, maxLength: 1 }).map((l) => l[0] ?? []),
    fc.nat(),
    fc.constantFrom<Variant>(
      'empty-source',
      'bad-kind',
      'bad-content',
      'extra-field',
      'non-object',
      'non-array',
      'non-json',
    ),
    badKind,
    nonString,
    extraKey,
    nonObjectElement,
    nonArrayTop,
    notJson,
    fc.string(),
    fc.boolean(),
  )
  .map(([log, pick, variant, kind, content, key, element, top, junk, extraVal, omit]): Case => {
    if (variant === 'non-array') return { variant, text: JSON.stringify(top) };
    if (variant === 'non-json') return { variant, text: junk };

    // Ensure at least one record to replace.
    const base = log.length > 0 ? log : [{ source: 'a.md', kind: 'file' as const, content: 'x' }];
    const index = pick % base.length;
    const rec = base[index] as { source: string; kind: string; content: string };
    const elements = base.map((r) => JSON.stringify(r));
    let field: string | undefined;
    let replaced: string;
    switch (variant) {
      case 'empty-source':
        replaced = JSON.stringify({ source: '', kind: rec.kind, content: rec.content });
        field = 'source';
        break;
      case 'bad-kind':
        replaced = JSON.stringify({ source: rec.source, kind, content: rec.content });
        field = 'kind';
        break;
      case 'bad-content':
        // Omitted content (undefined is dropped by JSON.stringify) or a non-string value.
        replaced = JSON.stringify({
          source: rec.source,
          kind: rec.kind,
          content: omit ? undefined : content,
        });
        field = 'content';
        break;
      case 'extra-field':
        replaced =
          JSON.stringify(rec).slice(0, -1) + ',' + JSON.stringify(key) + ':' + JSON.stringify(extraVal) + '}';
        field = key;
        break;
      default:
        replaced = JSON.stringify(element);
        field = undefined;
    }
    elements[index] = replaced;
    return field === undefined
      ? { variant, text: '[' + elements.join(',') + ']', index }
      : { variant, text: '[' + elements.join(',') + ']', index, field };
  });

describe('Property 11: invalid provenance input is rejected without a partial log', () => {
  it(
    'rejects every invalid variant with a located error and no log',
    () => {
      const stats = createCounter('P11');
      fc.assert(
        fc.property(caseArb, (c) => {
          const result = parseProvenanceLog(c.text);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect('log' in result).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);

          if (c.variant === 'non-json') {
            expect(result.errors[0]?.message.startsWith('invalid JSON')).toBe(true);
            expect(result.errors[0]?.index).toBeUndefined();
          } else if (c.variant === 'non-array') {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]?.index).toBeUndefined();
            expect(result.errors[0]?.message).toContain('array');
          } else {
            // Only the replaced record is invalid, so every error points at it.
            for (const e of result.errors) expect(e.index).toBe(c.index);
            if (c.field === undefined) {
              expect(result.errors.some((e) => e.field === undefined)).toBe(true);
            } else {
              expect(result.errors.some((e) => e.field === c.field)).toBe(true);
            }
          }
          stats.add(c.variant);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      console.log(`P11 runs=${NUM_RUNS}`);
      for (const v of [
        'empty-source',
        'bad-kind',
        'bad-content',
        'extra-field',
        'non-object',
        'non-array',
        'non-json',
      ]) {
        expect(stats.counts[v] ?? 0, `bucket ${v} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT,
  );

  it('fixed example: __proto__ own key is rejected as an unknown field', () => {
    const text = '[{"source":"a.md","kind":"file","content":"x","__proto__":{}}]';
    const r = parseProvenanceLog(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.index === 0 && e.field === '__proto__')).toBe(true);
  });
});

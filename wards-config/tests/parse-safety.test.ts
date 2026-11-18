import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { MAX_INPUT_BYTES, parseWards } from '../src/parse.js';
import { printWards } from '../src/print.js';
import type { ConfigError, ParseResult } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config';
import { wardSetArb } from './fixtures';

const codes = (r: ParseResult): string[] => (r.ok ? [] : r.errors.map((e) => e.code));

/** Shape every result must have: a ParseResult with at most 50 errors plus one too-many-errors. */
function expectWellFormed(r: ParseResult): void {
  expect(typeof r.ok).toBe('boolean');
  if (r.ok) return;
  expect(r.errors.length).toBeGreaterThan(0);
  expect(r.errors.length).toBeLessThanOrEqual(51);
  const tooMany = r.errors.filter((e: ConfigError) => e.code === 'too-many-errors');
  if (r.errors.length === 51) {
    expect(tooMany).toHaveLength(1);
    expect((r.errors[50] as ConfigError).code).toBe('too-many-errors');
  } else {
    expect(tooMany).toHaveLength(0);
  }
}

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

// Hidden characters are written as escapes only.
const HOSTILE_CHARS = ['\u200B', '\u202E', '\u2060', '\uFEFF', '\u2066', '\u0000', '\u0007', '\t', '\r', '\ud800'];

const hostileTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 400 }),
  fc.string({ unit: 'grapheme', maxLength: 200 }),
  fc
    .array(
      fc.oneof(
        fc.constantFrom(
          '&a ', '*a', '<<: ', '!!str ', '!x ', '- ', '? ', ': ', '[', ']', '{', '}', '|', '>', '---', '...', '#',
          '\n', '  ', 'wards:', 'safe_commands:', 'kind: path', '"', "'", '%YAML 1.1\n', ...HOSTILE_CHARS,
        ),
        fc.string({ maxLength: 8 }),
      ),
      { maxLength: 80 },
    )
    .map((xs) => xs.join('')),
);

describe('parseWards totality and safety', () => {
  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'returns a well-formed ParseResult and never throws on random hostile text',
    () => {
      fc.assert(
        fc.property(hostileTextArb, (text) => {
          expectWellFormed(parseWards(text));
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'returns a well-formed ParseResult on truncated and spliced valid documents',
    () => {
      fc.assert(
        fc.property(wardSetArb, fc.nat(100_000), fc.nat(100_000), fc.string({ maxLength: 12 }), (ws, a, b, junk) => {
          const text = printWards(ws);
          const cut = a % (text.length + 1);
          expectWellFormed(parseWards(text.slice(0, cut)));
          const at = b % (text.length + 1);
          expectWellFormed(parseWards(text.slice(0, at) + junk + text.slice(at)));
          expect(parseWards(text).ok).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'reports yaml-feature-unsupported for anchors, aliases, merge keys, and explicit tags',
    () => {
      const featureArb = fc.constantFrom(
        'anchor: &a 1\n',
        'anchor: &a 1\nalias: *a\n',
        'alias_list: [&b 1, *b]\n',
        'merge:\n  <<: {x: 1}\n',
        '<<: {x: 1}\n',
        'tagged: !!str 7\n',
        'tagged: !!map {}\n',
      );
      fc.assert(
        fc.property(wardSetArb, featureArb, fc.boolean(), (ws, feature, atEnd) => {
          const doc = printWards(ws);
          const text = atEnd ? `${doc}${doc.endsWith('\n') ? '' : '\n'}${feature}` : feature + doc;
          const r = parseWards(text);
          expect(r.ok).toBe(false);
          expect(codes(r)).toContain('yaml-feature-unsupported');
          expectWellFormed(r);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'reports yaml-feature-unsupported for nesting deeper than 8, indentation over 64, and long bracket runs',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 9, max: 30 }), fc.integer({ min: 9, max: 200 }), fc.integer({ min: 65, max: 300 }), (blockDepth, flowDepth, indent) => {
          const block = Array.from({ length: blockDepth }, (_, i) => `${'  '.repeat(i)}k${i}:`).join('\n') + ' 1\n';
          const flow = `x: ${'['.repeat(flowDepth)}${']'.repeat(flowDepth)}\n`;
          const deepIndent = `wards:\n${' '.repeat(indent)}- a\n`;
          const seqs = `${'- '.repeat(blockDepth)}1\n`;
          for (const text of [block, flow, deepIndent, seqs]) {
            const r = parseWards(text);
            expect(r.ok).toBe(false);
            expect(codes(r)).toContain('yaml-feature-unsupported');
            expectWellFormed(r);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'reports duplicate-key naming the first line for any repeated key, including safe_commands',
    () => {
      const keyArb = fc.constantFrom('safe_commands', 'wards', 'extra', 'k1');
      fc.assert(
        fc.property(keyArb, fc.nat(20), fc.nat(20), (key, pad, gap) => {
          const lines = [
            ...Array.from({ length: pad }, () => '# filler'),
            `${key}: []`,
            ...Array.from({ length: gap }, () => '# filler'),
            `${key}: []`,
          ];
          const firstLine = pad + 1;
          const secondLine = pad + 1 + gap + 1;
          const r = parseWards(lines.join('\n') + '\n');
          expect(r.ok).toBe(false);
          if (r.ok) return;
          const dup = r.errors.find((e) => e.code === 'duplicate-key');
          expect(dup).toBeDefined();
          expect(dup?.line).toBe(secondLine);
          expect(dup?.message).toContain(`first on line ${firstLine}`);
          expectWellFormed(r);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'returns at most 50 errors plus one too-many-errors, for any number of invalid wards',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 200 }), (n) => {
          const text = 'wards:\n' + '  - kind: bogus\n'.repeat(n);
          const r = parseWards(text);
          expect(r.ok).toBe(false);
          expectWellFormed(r);
          if (n >= 26) {
            // Each bad ward yields at least two errors, so 26 wards exceed 50.
            expect(codes(r).filter((c) => c === 'too-many-errors')).toHaveLength(1);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'returns only input-too-large above 262,144 bytes and parses normally at or below it',
    () => {
      const unitArb = fc.constantFrom(
        { ch: ' ', bytes: 1 },
        { ch: '\u00e9', bytes: 2 },
        { ch: '\u20ac', bytes: 3 },
        { ch: '\u{1F47B}', bytes: 4 },
      );
      fc.assert(
        fc.property(unitArb, fc.integer({ min: 1, max: 40 }), fc.boolean(), (unit, extra, atLimit) => {
          // A comment line padded to an exact UTF-8 size; the document body is `wards: []`.
          const body = 'wards: []\n';
          const target = atLimit ? MAX_INPUT_BYTES : MAX_INPUT_BYTES + extra;
          const room = target - utf8Bytes(body) - 2; // '#' and a trailing newline
          const count = Math.floor(room / unit.bytes);
          let text = `#${unit.ch.repeat(count)}\n${body}`;
          const fill = target - utf8Bytes(text);
          text += fill > 0 ? '#'.repeat(fill) : '';
          expect(utf8Bytes(text)).toBe(target);
          const r = parseWards(text);
          if (atLimit) {
            expect(codes(r)).not.toContain('input-too-large');
            expect(r.ok).toBe(true);
          } else {
            expect(r.ok).toBe(false);
            expect(codes(r)).toEqual(['input-too-large']);
          }
        }),
        { numRuns: Math.min(NUM_RUNS, 100) },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 16: parseWards is total and safe on hostile input
  // **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
  it(
    'handles a 256 KiB safe_commands list without throwing and caps the errors',
    () => {
      fc.assert(
        fc.property(fc.constantFrom('block', 'flow'), fc.constantFrom('ls', 'git status', 'a;b'), (style, entry) => {
          let text: string;
          if (style === 'block') {
            const head = 'safe_commands:\n';
            const item = `  - ${entry}\n`;
            text = head + item.repeat(Math.floor((MAX_INPUT_BYTES - head.length) / item.length));
          } else {
            const item = `${entry}, `;
            text = `safe_commands: [${item.repeat(Math.floor((MAX_INPUT_BYTES - 20) / item.length))}x]\n`;
          }
          expect(utf8Bytes(text)).toBeLessThanOrEqual(MAX_INPUT_BYTES);
          const r = parseWards(text);
          expect(r.ok).toBe(false);
          expectWellFormed(r);
        }),
        { numRuns: Math.min(NUM_RUNS, 20) },
      );
    },
    PBT_TIMEOUT,
  );

  it('smoke: a 262,144-byte input completes within a loose time bound', () => {
    const body = 'wards: []\n';
    const text = body + '#'.repeat(MAX_INPUT_BYTES - body.length);
    expect(utf8Bytes(text)).toBe(MAX_INPUT_BYTES);
    const started = Date.now();
    const r = parseWards(text);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(r.ok).toBe(true);
  });
});

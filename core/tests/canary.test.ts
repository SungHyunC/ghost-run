// Feature: wards, Property 11: Canary extraction bounds
// **Validates: Requirements 9.4, 9.5**

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { extractCanaries, extractCanariesDetailed } from '../src/judge/canary.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

const enc = new TextEncoder();
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// ---- independent oracle (no code under test imported) ----------------------

interface Line {
  readonly kind: 'assign' | 'export' | 'comment' | 'blank';
  readonly key: string;
  readonly value: string;
  readonly quote: '' | "'" | '"';
  readonly indent: string;
  readonly eol: '\n' | '\r\n';
}

function renderLine(l: Line): string {
  switch (l.kind) {
    case 'blank':
      return l.indent;
    case 'comment':
      return `${l.indent}# ${l.key}=${l.value}`;
    case 'export':
      return `${l.indent}export ${l.key}=${l.quote}${l.value}${l.quote}`;
    default:
      return `${l.indent}${l.key}=${l.quote}${l.value}${l.quote}`;
  }
}

function expectedValue(l: Line): string | undefined {
  return l.kind === 'assign' || l.kind === 'export' ? l.value : undefined;
}

function isEnvPath(p: string): boolean {
  const base = p.split(/[/\\]/).pop() ?? '';
  return /^\.env(\..*)?$/i.test(base);
}

interface Expected {
  readonly candidates: string[];
  readonly tooShort: number;
  readonly tooLong: number;
  readonly tooMany: number;
}

function oracle(path: string, text: string, lines: readonly Line[]): Expected {
  const raw: string[] = [text.replace(/[\r\n]+$/, '')];
  if (isEnvPath(path)) {
    for (const l of lines) {
      const v = expectedValue(l);
      if (v !== undefined) raw.push(v);
    }
  }
  let tooShort = 0;
  let tooLong = 0;
  let tooMany = 0;
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const r of raw) {
    const len = enc.encode(r).length;
    if (len < 8) tooShort += 1;
    else if (len > 16384) tooLong += 1;
    else if (seen.has(r)) continue;
    else if (candidates.length >= 256) tooMany += 1;
    else {
      seen.add(r);
      candidates.push(r);
    }
  }
  return { candidates, tooShort, tooLong, tooMany };
}

// ---- generators (canary values only) ---------------------------------------

const alnum = fc.stringMatching(/^[A-Za-z0-9]{0,24}$/);
const keyArb = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/);
const valueArb = fc.oneof(
  alnum,
  alnum.map((s) => `sk-CANARY-abc123${s}`),
  fc.constantFrom('', 'a', 'x1234567', 'sk-CANARY-abc123', 'a'.repeat(16384), 'b'.repeat(16385)),
);
const lineArb: fc.Arbitrary<Line> = fc.record({
  kind: fc.constantFrom('assign', 'export', 'comment', 'blank'),
  key: keyArb,
  value: valueArb,
  quote: fc.constantFrom('', "'", '"'),
  indent: fc.constantFrom('', ' ', '\t'),
  eol: fc.constantFrom('\n', '\r\n'),
});
const smallValueArb = alnum.map((s) => `CANARY${s}`);
const smallLineArb: fc.Arbitrary<Line> = fc.record({
  kind: fc.constantFrom('assign', 'export', 'comment', 'blank'),
  key: keyArb,
  value: smallValueArb,
  quote: fc.constantFrom('', "'", '"'),
  indent: fc.constantFrom('', ' ', '\t'),
  eol: fc.constantFrom('\n', '\r\n'),
});
const pathArb = fc.constantFrom(
  '.env',
  '.env.local',
  '.env.production',
  'app/.env',
  'C:\\proj\\.ENV',
  'secrets.txt',
  'app/.envrc',
  'env',
  'app/.environment',
);
const trailerArb = fc.constantFrom('', '\n', '\r\n', '\n\n', '\r\n\r\n');

function build(lines: readonly Line[], trailer: string): string {
  return lines.map((l, i) => renderLine(l) + (i < lines.length - 1 ? l.eol : '')).join('') + trailer;
}

function check(path: string, lines: readonly Line[], trailer: string): void {
  const text = build(lines, trailer);
  const bytes = enc.encode(text);
  const got = extractCanariesDetailed(path, bytes);
  const exp = oracle(path, text, lines);

  // bounds, distinctness, cap
  expect(got.candidates.length).toBeLessThanOrEqual(256);
  for (const c of got.candidates) {
    expect(c.length).toBeGreaterThanOrEqual(8);
    expect(c.length).toBeLessThanOrEqual(16384);
  }
  expect(new Set(got.candidates.map(hex)).size).toBe(got.candidates.length);

  // exact candidates (first occurrence kept, in order) and discard counters
  expect(got.candidates.map((c) => new TextDecoder().decode(c))).toEqual(exp.candidates);
  expect(got.discarded).toEqual({ tooShort: exp.tooShort, tooLong: exp.tooLong, tooMany: exp.tooMany });
  expect(extractCanaries(path, bytes).length).toBe(got.candidates.length);

  // every in-range generated value is a candidate (when not cut by the cap)
  if (isEnvPath(path) && exp.tooMany === 0) {
    const have = new Set(got.candidates.map((c) => new TextDecoder().decode(c)));
    for (const l of lines) {
      const v = expectedValue(l);
      if (v !== undefined && v.length >= 8 && v.length <= 16384) expect(have.has(v)).toBe(true);
    }
  }
}

describe('canary extraction', () => {
  it(
    'Property 11: bounds, distinctness, counters and .env parsing (mixed sizes)',
    () => {
      fc.assert(
        fc.property(pathArb, fc.array(lineArb, { maxLength: 8 }), trailerArb, check),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it(
    'Property 11: more than 256 distinct values are capped and counted as tooMany',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom('.env', '.env.local'),
          fc.array(smallLineArb, { minLength: 0, maxLength: 20 }),
          fc.integer({ min: 250, max: 300 }),
          (path, extra, n) => {
            const many: Line[] = Array.from({ length: n }, (_, i) => ({
              kind: 'assign',
              key: `K${i}`,
              value: `CANARY-${String(i).padStart(4, '0')}`,
              quote: '',
              indent: '',
              eol: '\n',
            }));
            check(path, [...many, ...extra], '\n');
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it(
    'Property 11: arbitrary bytes and paths never violate bounds',
    () => {
      fc.assert(
        fc.property(fc.string(), fc.uint8Array({ maxLength: 600 }), (p, bytes) => {
          const r = extractCanariesDetailed(p, bytes);
          expect(r.candidates.length).toBeLessThanOrEqual(256);
          for (const c of r.candidates) {
            expect(c.length).toBeGreaterThanOrEqual(8);
            expect(c.length).toBeLessThanOrEqual(16384);
          }
          expect(new Set(r.candidates.map(hex)).size).toBe(r.candidates.length);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('parses quoted, exported and CRLF .env lines and skips comments/blanks', () => {
    const text = [
      '# API=sk-CANARY-comment1',
      '',
      'TOKEN="sk-CANARY-abc123"',
      "export OTHER='sk-CANARY-single'",
      'SHORT=abc',
    ].join('\r\n') + '\r\n';
    const r = extractCanariesDetailed('proj/.env.local', enc.encode(text));
    const got = r.candidates.map((c) => new TextDecoder().decode(c));
    expect(got).toContain('sk-CANARY-abc123');
    expect(got).toContain('sk-CANARY-single');
    expect(got.some((g) => g.includes('comment1') && !g.includes('\n'))).toBe(false);
    expect(r.discarded.tooShort).toBe(1);
  });
});

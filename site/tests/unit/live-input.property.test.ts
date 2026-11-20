// Feature: site-live, Property L3: Input reaches the engine escaped and limited (engine side)
// **Validates: Requirements 9.1, 9.2, 9.3**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isHiddenDisplay } from '@ghost-run/ui';
import { ECHO_LIMIT, TEXT_LIMIT, echo, normalizeText } from '../../src/live/input';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const cp = (n: number): string => String.fromCodePoint(n);

function isControl(c: number): boolean {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f);
}

function isBad(c: number): boolean {
  return isControl(c) || isHiddenDisplay(c);
}

const plain = fc.string({ unit: 'grapheme-ascii', maxLength: 40 });
const special = fc
  .constantFrom(
    0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x7f, 0x85, 0x9f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a,
    0x202e, 0x2066, 0x2069, 0xe0001, 0xe0041, 0xe007f,
  )
  .map(cp);
const markup = fc.constantFrom('<img src=x onerror=alert(1)>', '"><script>', '&amp;', 'javascript:x', '{{x}}');
const pair = fc.constantFrom(cp(0x1f47b), cp(0x1f56f), cp(0x10ffff));
const spaces = fc.constantFrom('', ' ', '  ');
const filler = fc.integer({ min: 0, max: TEXT_LIMIT + 40 }).map((n) => 'a'.repeat(n));

const piece = fc.oneof({ weight: 4, arbitrary: plain }, special, markup, pair, filler);
const text = fc
  .tuple(spaces, fc.array(piece, { maxLength: 6 }), spaces)
  .map(([a, parts, b]) => `${a}${parts.join('')}${b}`);
const anyString = fc.oneof(text, fc.string({ unit: 'binary', maxLength: 300 }), fc.string({ unit: 'grapheme', maxLength: 300 }));

const cfg = { numRuns: NUM_RUNS };

function trimSpaces(s: string): string {
  return s.replace(/^ +/, '').replace(/ +$/, '');
}

describe('Property L3: normalizeText (engine side)', () => {
  it('accepts only a trimmed, limited, clean text and returns it unchanged apart from the trim', () => {
    fc.assert(
      fc.property(anyString, (raw) => {
        const r = normalizeText(raw);
        const trimmed = trimSpaces(raw);
        const points = Array.from(trimmed);
        const bad = points.some((ch) => isBad(ch.codePointAt(0) ?? 0)) || /[\ud800-\udfff]/u.test(trimmed.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''));
        const shouldAccept = points.length > 0 && points.length <= TEXT_LIMIT && !bad;
        expect(r.ok).toBe(shouldAccept);
        if (r.ok) {
          expect(r.text).toBe(trimmed);
          const out = Array.from(r.text);
          expect(out.length).toBeLessThanOrEqual(TEXT_LIMIT);
          for (const ch of out) expect(isBad(ch.codePointAt(0) ?? 0)).toBe(false);
        }
      }),
      cfg,
    );
  }, PBT_TIMEOUT || undefined);
});

describe('Property L3: echo', () => {
  it('shows no control or hidden code point and at most 80 code points before the ellipsis', () => {
    fc.assert(
      fc.property(anyString, (raw) => {
        const out = echo(raw);
        for (const ch of out) expect(isBad(ch.codePointAt(0) ?? 0)).toBe(false);
        const points = Array.from(out);
        if (points.length > ECHO_LIMIT) {
          expect(points[points.length - 1]).toBe('\u2026');
          expect(points.length - 1).toBeLessThanOrEqual(ECHO_LIMIT);
        }
        expect(points.length).toBeLessThanOrEqual(ECHO_LIMIT + 1);
      }),
      cfg,
    );
  }, PBT_TIMEOUT || undefined);
});

// Feature: ui-kit, Property 3: No hidden characters (model leg, escaper)
// **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.7, 14.6**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { compact, detail, escapeForDisplay } from '../../src/model/escape';
import { dirtyString } from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Category = 'tag' | 'zero-width' | 'zwj-between-emoji' | 'bidi' | 'control' | 'surrogate';
const CATEGORIES: readonly Category[] = [
  'tag',
  'zero-width',
  'zwj-between-emoji',
  'bidi',
  'control',
  'surrogate',
];

/** Independent oracle: the category of a code point of the input, or undefined when it is shown as is. */
function categoryOf(cp: number): Category | undefined {
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'tag';
  if ((cp >= 0x200b && cp <= 0x200d) || cp === 0x2060 || cp === 0xfeff) return 'zero-width';
  if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) return 'bidi';
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return 'control';
  if (cp >= 0xd800 && cp <= 0xdfff) return 'surrogate';
  return undefined;
}

function hex(cp: number): string {
  return `<U+${cp.toString(16).toUpperCase().padStart(4, '0')}>`;
}

/** Expected display tokens, one per input code point. */
function expectedTokens(s: string, keepNewline: boolean): string[] {
  return Array.from(s, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    if (keepNewline && cp === 0x0a) return ch;
    return categoryOf(cp) === undefined ? ch : hex(cp);
  });
}

const cpLen = (s: string): number => Array.from(s).length;
const isHexToken = (t: string): boolean => /^<U\+[0-9A-F]{4,}>$/.test(t);

/** Code point length of the escaped text, counting each token's characters. */
function lengthOf(tokens: readonly string[]): number {
  return tokens.reduce((n, t) => n + (isHexToken(t) ? t.length : 1), 0);
}

function record(counter: ReturnType<typeof createCounter>, s: string): void {
  const chars = Array.from(s);
  const seen = new Set<Category>();
  chars.forEach((ch, i) => {
    const cp = ch.codePointAt(0) ?? 0;
    const cat = categoryOf(cp);
    if (cat === undefined) return;
    if (cp === 0x200d) {
      const prev = chars[i - 1]?.codePointAt(0) ?? 0;
      const next = chars[i + 1]?.codePointAt(0) ?? 0;
      if (prev >= 0x2000 && next >= 0x2000) seen.add('zwj-between-emoji');
    }
    seen.add(cat);
  });
  if (seen.size === 0) counter.add('none');
  for (const c of seen) counter.add(c);
}

const longDirty = dirtyString(fc.string({ minLength: 100, maxLength: 260 }));
/** Strings whose escaped length sits around the 4,096 limit. */
const nearDetailLimit = fc
  .tuple(fc.integer({ min: 4080, max: 4110 }), dirtyString(fc.constant('')))
  .map(([n, dirt]) => 'a'.repeat(n) + dirt);

describe('UI-P3 escaper (model leg)', () => {
  it('UI-P3: escapeForDisplay replaces exactly the hidden code points and is idempotent', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P3 escape');
    fc.assert(
      fc.property(dirtyString(), (s) => {
        record(counter, s);
        const out = escapeForDisplay(s);
        expect(out).toBe(expectedTokens(s, false).join(''));
        for (const ch of out) expect(categoryOf(ch.codePointAt(0) ?? 0)).toBeUndefined();
        expect(escapeForDisplay(out)).toBe(out);
        const kept = escapeForDisplay(s, { keepNewline: true });
        expect(kept).toBe(expectedTokens(s, true).join(''));
        expect(escapeForDisplay(kept, { keepNewline: true })).toBe(kept);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [...CATEGORIES, 'none']);
  }, PBT_TIMEOUT);

  it('UI-P3: compact stays within 120 code points and never cuts a token', () => {
    const counter = createCounter('UI-P3 compact');
    fc.assert(
      fc.property(fc.oneof(dirtyString(), longDirty), (s) => {
        const tokens = expectedTokens(s, false);
        const full = tokens.join('');
        const total = lengthOf(tokens);
        const out = compact(s);
        expect(cpLen(out)).toBeLessThanOrEqual(120);
        if (total <= 120) {
          counter.add('short');
          expect(out).toBe(full);
          return;
        }
        counter.add('long');
        expect(out.endsWith('...')).toBe(true);
        const prefix = out.slice(0, -3);
        expect(full.startsWith(prefix)).toBe(true);
        expect(cpLen(prefix)).toBeLessThanOrEqual(117);
        // The prefix ends on a token boundary and is the longest such prefix within 117.
        let used = 0;
        let boundary = 0;
        let nextLen = 0;
        for (const t of tokens) {
          const len = isHexToken(t) ? t.length : 1;
          if (used + len > 117) {
            nextLen = len;
            break;
          }
          used += len;
          boundary += t.length;
        }
        expect(prefix).toBe(full.slice(0, boundary));
        expect(used + nextLen).toBeGreaterThan(117);
        if (used === 117) counter.add('exact-117');
        else counter.add('backed-off');
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, ['short', 'long']);
  }, PBT_TIMEOUT);

  it('UI-P3: detail appends [truncated] exactly above 4,096 code points', () => {
    const counter = createCounter('UI-P3 detail');
    fc.assert(
      fc.property(fc.oneof(nearDetailLimit, dirtyString()), (s) => {
        const tokens = expectedTokens(s, true);
        const full = tokens.join('');
        const total = lengthOf(tokens);
        const out = detail(s);
        if (total <= 4096) {
          counter.add('whole');
          expect(out).toBe(full);
          return;
        }
        counter.add('truncated');
        expect(out.endsWith('[truncated]')).toBe(true);
        const prefix = out.slice(0, -'[truncated]'.length);
        expect(full.startsWith(prefix)).toBe(true);
        expect(cpLen(prefix)).toBeLessThanOrEqual(4096);
        // The prefix ends on a token boundary and is the longest such prefix within 4,096.
        // A hex token can be 8 (<U+XXXX>) or 9 (<U+XXXXX>) code points, so no fixed lower bound.
        let used = 0;
        let boundary = 0;
        let nextLen = 0;
        for (const t of tokens) {
          const len = isHexToken(t) ? t.length : 1;
          if (used + len > 4096) {
            nextLen = len;
            break;
          }
          used += len;
          boundary += t.length;
        }
        expect(prefix).toBe(full.slice(0, boundary));
        expect(used + nextLen).toBeGreaterThan(4096);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, ['whole', 'truncated']);
  }, PBT_TIMEOUT);

  it('UI-P3: examples with escapes', () => {
    expect(escapeForDisplay('a\u200Db')).toBe('a<U+200D>b');
    expect(escapeForDisplay('\u{1F600}\u200D\u{1F468}')).toBe('\u{1F600}<U+200D>\u{1F468}');
    expect(escapeForDisplay('\u{E0041}')).toBe('<U+E0041>');
    expect(escapeForDisplay('x\uD800y')).toBe('x<U+D800>y');
    expect(escapeForDisplay('\u0007\u007F\u009F')).toBe('<U+0007><U+007F><U+009F>');
    expect(escapeForDisplay('\u00E9\uAC00')).toBe('\u00E9\uAC00');
    expect(compact('a'.repeat(121))).toBe('a'.repeat(117) + '...');
    // A token that would straddle code point 117 is dropped whole.
    expect(compact('a'.repeat(115) + '\u200B' + 'b'.repeat(10))).toBe('a'.repeat(115) + '...');
    expect(detail('a'.repeat(4096))).toBe('a'.repeat(4096));
    expect(detail('a'.repeat(4097))).toBe('a'.repeat(4096) + '[truncated]');
  });

  it('UI-P3 regression: detail drops a 9-code-point tag token whole at the 4,096 limit', () => {
    // Shrunk counterexample of GHOST_PBT_SEED=7: 4,080 'a', U+202A, U+E0000.
    // Escaped length 4,080 + 8 + 9 = 4,097, so the 9-code-point token is dropped and the prefix is 4,088.
    const s = 'a'.repeat(4080) + '\u202A' + '\u{E0000}';
    expect(detail(s)).toBe('a'.repeat(4080) + '<U+202A>' + '[truncated]');
  });
});

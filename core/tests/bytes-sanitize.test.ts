import { describe, expect, it } from 'vitest';
import { base64Encode, compareCodePoints, utf8Encode } from '../src/judge/bytes.js';
import { hasHiddenChar, sanitizeText } from '../src/judge/sanitize.js';

const cpLen = (s: string): number => Array.from(s).length;

describe('judge/bytes', () => {
  // **Validates: Requirements 5.4, 8.6**
  describe('compareCodePoints', () => {
    it('orders an astral character after U+FFFD (UTF-16 order would put it before)', () => {
      const astral = '\u{1F600}'; // UTF-16 starts with 0xD83D, below 0xFFFD
      const fffd = '\uFFFD';
      expect(astral < fffd).toBe(true); // documents the default JS order
      expect(compareCodePoints(astral, fffd)).toBeGreaterThan(0);
      expect(compareCodePoints(fffd, astral)).toBeLessThan(0);
    });

    it('orders by code point, prefix first, and returns 0 for equal strings', () => {
      expect(compareCodePoints('a', 'b')).toBeLessThan(0);
      expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0);
      expect(compareCodePoints('a', 'ab')).toBeLessThan(0);
      expect(compareCodePoints('', '')).toBe(0);
      expect(compareCodePoints('x\u{10000}', 'x\u{10000}')).toBe(0);
    });

    it('treats a lone surrogate as U+FFFD', () => {
      expect(compareCodePoints('\uD800', '\uFFFD')).toBe(0);
      expect(compareCodePoints('\uDC00', '\u{10000}')).toBeLessThan(0);
    });
  });

  describe('utf8Encode', () => {
    it('encodes 1-, 2-, 3- and 4-byte code points', () => {
      expect(Array.from(utf8Encode('A'))).toEqual([0x41]);
      expect(Array.from(utf8Encode('\u00E9'))).toEqual([0xc3, 0xa9]);
      expect(Array.from(utf8Encode('\u20AC'))).toEqual([0xe2, 0x82, 0xac]);
      expect(Array.from(utf8Encode('\u{1F600}'))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    });

    it('encodes lone surrogates as U+FFFD bytes (EF BF BD)', () => {
      expect(Array.from(utf8Encode('\uD800'))).toEqual([0xef, 0xbf, 0xbd]);
      expect(Array.from(utf8Encode('\uDC00'))).toEqual([0xef, 0xbf, 0xbd]);
      expect(Array.from(utf8Encode('a\uD800b'))).toEqual([0x61, 0xef, 0xbf, 0xbd, 0x62]);
    });
  });

  describe('base64Encode', () => {
    const enc = (s: string): string => base64Encode(Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0))));
    it('matches the RFC 4648 test vectors', () => {
      expect(enc('')).toBe('');
      expect(enc('f')).toBe('Zg==');
      expect(enc('fo')).toBe('Zm8=');
      expect(enc('foo')).toBe('Zm9v');
      expect(enc('foob')).toBe('Zm9vYg==');
      expect(enc('fooba')).toBe('Zm9vYmE=');
      expect(enc('foobar')).toBe('Zm9vYmFy');
    });

    it('uses + and / for indexes 62 and 63', () => {
      expect(base64Encode(Uint8Array.from([0xfb, 0xff]))).toBe('+/8=');
    });
  });
});

describe('judge/sanitize', () => {
  // **Validates: Requirements 17.7**
  describe('sanitizeText', () => {
    it('replaces a newline with \\u{A}', () => {
      expect(sanitizeText('a\nb')).toBe('a\\u{A}b');
    });

    it('replaces U+200B, a bidi control and a tag character with upper-case escapes', () => {
      expect(sanitizeText('x\u200By')).toBe('x\\u{200B}y');
      expect(sanitizeText('x\u202Ey')).toBe('x\\u{202E}y');
      expect(sanitizeText('x\u{E0041}y')).toBe('x\\u{E0041}y');
    });

    it('leaves ordinary text, Hangul, emoji and combining marks unchanged', () => {
      const s = 'hello \uD55C\uAE00 \u{1F600} e\u0301';
      expect(sanitizeText(s)).toBe(s);
    });

    it('truncates a 200-character value to 117 code points plus "..."', () => {
      const out = sanitizeText('a'.repeat(200));
      expect(out).toBe('a'.repeat(117) + '...');
      expect(cpLen(out)).toBe(120);
    });

    it('counts code points, not UTF-16 units, when truncating', () => {
      const out = sanitizeText('\u{1F600}'.repeat(200));
      expect(out).toBe('\u{1F600}'.repeat(117) + '...');
    });

    it('does not truncate values that fit within the maximum', () => {
      expect(sanitizeText('a'.repeat(120))).toBe('a'.repeat(120));
      expect(sanitizeText('a'.repeat(118))).toBe('a'.repeat(118));
    });

    it('never splits an escape at the truncation point', () => {
      // 116 plain characters, then an escape that would straddle the 117 limit.
      const out = sanitizeText('a'.repeat(116) + '\u200B' + 'b'.repeat(50));
      expect(out).toBe('a'.repeat(116) + '...');
      // Escape fits exactly when it ends at 117.
      const fits = sanitizeText('a'.repeat(109) + '\u200B' + 'b'.repeat(50));
      expect(fits).toBe('a'.repeat(109) + '\\u{200B}' + '...');
      expect(cpLen(fits)).toBe(120);
    });

    it('honours a custom maximum', () => {
      expect(sanitizeText('abcdefghij', 8)).toBe('abcde...');
    });
  });

  describe('hasHiddenChar', () => {
    it('is true for control, zero-width, bidi, BOM, word-joiner and tag characters', () => {
      for (const s of ['\u0000', '\n', '\u007F', '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u202A', '\u202E', '\u2066', '\u2069', '\u{E0000}', '\u{E007F}']) {
        expect(hasHiddenChar(`ab${s}cd`)).toBe(true);
      }
    });

    it('is false for ordinary text, Hangul, emoji and combining marks', () => {
      expect(hasHiddenChar('')).toBe(false);
      expect(hasHiddenChar('plain text/path.txt')).toBe(false);
      expect(hasHiddenChar('\uD55C\uAE00')).toBe(false);
      expect(hasHiddenChar('\u{1F600}\u{1F468}\u{1F3FD}')).toBe(false);
      expect(hasHiddenChar('e\u0301')).toBe(false);
      expect(hasHiddenChar('\u2061\u2065\u202F\u{E0080}')).toBe(false);
    });
  });
});

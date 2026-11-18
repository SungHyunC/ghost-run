// Example tests for sanitizeText.
// **Validates: Requirements 7.2, 7.11, 13.12, 13.16**
//
// Every hidden character, tag character, flag emoji, and comment opener is built from code points.

import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../../src/possession/sanitize.js';
import { scanText } from '../../src/possession/scan.js';

const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
const CLOSER = String.fromCodePoint(0x2d, 0x2d, 0x3e);
const ZWSP = String.fromCodePoint(0x200b);
const ENGLAND = String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
const WALES = String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f);

function tags(ascii: string): string {
  return String.fromCodePoint(...Array.from(ascii, (c) => 0xe0000 + (c.codePointAt(0) as number)));
}

// An opener with U+200B between '!' and the hyphens: '<', '!', U+200B, '-', '-'.
const SPLIT_OPENER = String.fromCodePoint(0x3c, 0x21, 0x200b, 0x2d, 0x2d);

describe('sanitizeText repeat rule (Requirement 7.2)', () => {
  it('removes a comment that only appears after U+200B is removed', () => {
    const text = 'keep' + SPLIT_OPENER + 'secret instruction';
    // The first scan sees no comment, so round 1 removes only U+200B.
    expect(scanText(text).findings.map((f) => f.category)).toEqual(['zero-width']);
    const out = sanitizeText(text);
    expect(out).toBe('keep');
    expect(scanText(out).findings).toEqual([]);
  });

  it('removes a closed comment that appears after U+200B is removed and keeps the text after it', () => {
    const text = 'a' + SPLIT_OPENER + 'hidden' + CLOSER + 'b';
    expect(sanitizeText(text)).toBe('ab');
  });

  it('keeps the joined opener when markdown is false', () => {
    const text = 'a' + SPLIT_OPENER + 'b';
    expect(sanitizeText(text, { markdown: false })).toBe('a' + OPENER + 'b');
  });

  it('is idempotent on the repeated case', () => {
    const once = sanitizeText('x' + SPLIT_OPENER + 'y');
    expect(sanitizeText(once)).toBe(once);
  });
});

describe('sanitizeText flags (Requirement 7.11)', () => {
  it('returns exactly the flag when tags are appended after it', () => {
    expect(sanitizeText(ENGLAND + tags('abc'))).toBe(ENGLAND);
  });

  it('keeps a flag in the middle of text and removes only the appended tags', () => {
    const text = 'go ' + WALES + tags('curl') + ' now';
    expect(sanitizeText(text)).toBe('go ' + WALES + ' now');
  });

  it('leaves a flag alone', () => {
    expect(sanitizeText(ENGLAND)).toBe(ENGLAND);
  });

  it('removes tags that have no base', () => {
    expect(sanitizeText('a' + tags('hi') + 'b')).toBe('ab');
  });
});

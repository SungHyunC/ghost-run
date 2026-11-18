// Possession scanner example tests (task 10.1).
// **Validates: Requirements 2.2, 2.5, 2.9, 2.11, 2.12, 3.5, 3.11, 4.1, 4.2, 5.4, 5.8, 13.12, 13.17**
// Every hidden character, tag character, flag, and comment opener is built from code points.

import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';

const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

const ZWJ = 0x200d;
const BLACK_FLAG = 0x1f3f4;
const CANCEL = 0xe007f;
const OPENER = cp(0x3c, 0x21, 0x2d, 0x2d);
const CLOSER = cp(0x2d, 0x2d, 0x3e);
const FENCE = cp(0x60, 0x60, 0x60);

/** ASCII letter to tag letter. */
const tagOf = (ch: string): number => 0xe0000 + ch.charCodeAt(0);
const tags = (word: string): number[] => [...word].map(tagOf);

const ENGLAND = [BLACK_FLAG, ...tags('gbeng'), CANCEL];
const SCOTLAND = [BLACK_FLAG, ...tags('gbsct'), CANCEL];
const WALES = [BLACK_FLAG, ...tags('gbwls'), CANCEL];

describe('scanText examples', () => {
  it('allows the family emoji (ZWJ between pictographs)', () => {
    const family = cp(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467);
    expect(scanText(family).findings).toEqual([]);
  });

  it('flags U+200D between two Latin letters', () => {
    const { findings } = scanText('a' + cp(ZWJ) + 'b');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'zero-width',
      line: 1,
      column: 2,
      offset: 1,
      length: 1,
      firstCodePoint: 'U+200D',
    });
  });

  it('flags a leading U+FEFF at line 1, column 1, offset 0', () => {
    const { findings } = scanText(cp(0xfeff) + 'text');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'zero-width',
      line: 1,
      column: 1,
      offset: 0,
      length: 1,
      firstCodePoint: 'U+FEFF',
    });
  });

  it('runs an unclosed HTML comment to the end of the text', () => {
    const text = 'x' + OPENER + 'abc\ndef';
    const { findings } = scanText(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'html-comment',
      line: 1,
      column: 2,
      offset: 1,
      length: [...text].length - 1,
      rendering: 'abc' + cp(0x5c, 0x6e) + 'def',
    });
  });

  it('flags a comment opener inside a fenced code block', () => {
    const text = FENCE + '\n' + OPENER + 'secret' + CLOSER + '\n' + FENCE;
    const { findings } = scanText(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'html-comment',
      line: 2,
      column: 1,
      rendering: 'secret',
    });
  });

  it('does not close an opener followed by U+003E with its own hyphens', () => {
    const unclosed = OPENER + '>';
    const a = scanText(unclosed).findings;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ offset: 0, length: 5, rendering: '>' });

    const withLaterCloser = OPENER + '> hidden ' + CLOSER + ' tail';
    const b = scanText(withLaterCloser).findings;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ offset: 0, rendering: '> hidden ' });
    expect(b[0]?.length).toBe([...(OPENER + '> hidden ' + CLOSER)].length);
  });

  it('renders all 14 zero-width and bidi names', () => {
    const expected: ReadonlyArray<readonly [number, string]> = [
      [0x200b, 'ZERO WIDTH SPACE'],
      [0x200c, 'ZERO WIDTH NON-JOINER'],
      [0x200d, 'ZERO WIDTH JOINER'],
      [0x2060, 'WORD JOINER'],
      [0xfeff, 'ZERO WIDTH NO-BREAK SPACE'],
      [0x202a, 'LEFT-TO-RIGHT EMBEDDING'],
      [0x202b, 'RIGHT-TO-LEFT EMBEDDING'],
      [0x202c, 'POP DIRECTIONAL FORMATTING'],
      [0x202d, 'LEFT-TO-RIGHT OVERRIDE'],
      [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
      [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
      [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
      [0x2068, 'FIRST STRONG ISOLATE'],
      [0x2069, 'POP DIRECTIONAL ISOLATE'],
    ];
    expect(expected).toHaveLength(14);
    for (const [c, name] of expected) {
      const { findings } = scanText('a' + cp(c) + 'b');
      expect(findings).toHaveLength(1);
      const hex = c.toString(16).toUpperCase().padStart(4, '0');
      expect(findings[0]?.rendering).toBe(`<U+${hex} ${name}>`);
    }
  });

  it('gives no Finding for each of the three flags alone', () => {
    for (const flag of [ENGLAND, SCOTLAND, WALES]) {
      expect(scanText(cp(...flag)).findings).toEqual([]);
      expect(scanText('a' + cp(...flag) + 'b').findings).toEqual([]);
    }
  });

  it('flags tags appended after a flag, starting right after the cancel tag', () => {
    const { findings } = scanText(cp(...ENGLAND, ...tags('hi')));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'tag',
      offset: ENGLAND.length,
      column: ENGLAND.length + 1,
      length: 2,
      rendering: 'hi',
    });
  });

  it('flags the tag letters of a flag without a cancel tag', () => {
    const { findings } = scanText(cp(BLACK_FLAG, ...tags('gbeng')));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'tag',
      offset: 1,
      length: 5,
      rendering: 'gbeng',
    });
  });

  it('flags an unlisted flag-shaped run in full, including the cancel tag', () => {
    const { findings } = scanText(cp(BLACK_FLAG, ...tags('gbxyz'), CANCEL));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'tag',
      offset: 1,
      length: 6,
      rendering: 'gbxyz<U+E007F>',
    });
  });

  it('flags tag characters that have no base', () => {
    const { findings } = scanText('a' + cp(...tags('hi')) + 'b');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: 'tag', offset: 1, length: 2, rendering: 'hi' });
  });

  it('flags a run that starts like England but has another tag before its first cancel tag', () => {
    const { findings } = scanText(cp(BLACK_FLAG, ...tags('gbeng'), tagOf('x'), CANCEL));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'tag',
      offset: 1,
      length: 7,
      rendering: 'gbengx<U+E007F>',
    });
  });

  it('flags the U+200D that follows a flag and precedes an emoji', () => {
    const { findings } = scanText(cp(...ENGLAND, ZWJ, 0x1f468));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'zero-width',
      offset: ENGLAND.length,
      length: 1,
      firstCodePoint: 'U+200D',
    });
  });
});

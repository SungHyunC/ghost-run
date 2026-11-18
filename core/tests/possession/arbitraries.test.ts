// Checks for the shared possession test infrastructure (arbitraries.ts).
// Hex lists are written out by hand here, independent of the generated table.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RGI_TAG_SEQUENCES } from '../../src/possession/tag-sequence-table.generated.js';
import {
  OPENER,
  asciiReporter,
  flagSequenceCodePoints,
  ordinaryNoEmoji,
  ordinaryText,
  refFlaggedTagIndices,
  refPosition,
  tagRunCase,
  toCodePoints,
} from './arbitraries.js';

// Glossary values: England (gbeng), Scotland (gbsct), Wales (gbwls).
const ENGLAND = [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
const SCOTLAND = [0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f];
const WALES = [0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f];

describe('possession test infrastructure', () => {
  it('hard-coded glossary flag lists equal the generated table entries', () => {
    expect(RGI_TAG_SEQUENCES.map((e) => [...e])).toEqual([ENGLAND, SCOTLAND, WALES]);
  });

  it('flagSequenceCodePoints only yields the three glossary flags', () => {
    fc.assert(
      fc.property(flagSequenceCodePoints, (cps) => {
        expect([ENGLAND, SCOTLAND, WALES]).toContainEqual([...cps]);
      }),
      { numRuns: 20 },
    );
  });

  it('tag oracle agrees with the expected class carried by every tagRunCase', () => {
    fc.assert(
      fc.property(tagRunCase, (c) => {
        const flagged = refFlaggedTagIndices(c.codePoints);
        const tagCount = c.codePoints.filter((x) => x >= 0xe0000 && x <= 0xe007f).length;
        expect(flagged.size).toBe(c.expected === 'flagged' ? tagCount : 0);
      }),
      { numRuns: 200 },
    );
  });

  it('ordinary text generators contain no opener and no emoji base in the no-emoji variant', () => {
    fc.assert(
      fc.property(ordinaryText, ordinaryNoEmoji, (a, b) => {
        expect(a.includes(OPENER)).toBe(false);
        expect(b.includes(OPENER)).toBe(false);
        expect(toCodePoints(b).some((c) => c === 0x1f3f4 || c >= 0x1f000)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('refPosition counts CRLF as one break and a lone CR as a break', () => {
    const text = 'ab' + String.fromCharCode(0x0d, 0x0a) + 'c' + String.fromCharCode(0x0d) + 'd';
    expect(refPosition(text, 0)).toEqual({ line: 1, column: 1 });
    expect(refPosition(text, 4)).toEqual({ line: 2, column: 1 });
    expect(refPosition(text, 6)).toEqual({ line: 3, column: 1 });
  });

  it('asciiReporter spells non-ASCII characters in the failure message', () => {
    const bad = String.fromCodePoint(0x200b);
    let message = '';
    try {
      fc.assert(
        fc.property(fc.constant(bad), () => false),
        { reporter: asciiReporter },
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('U+200B');
    expect(message.includes(bad)).toBe(false);
    expect(/^[\x20-\x7e\n]*$/.test(message)).toBe(true);
  });
});

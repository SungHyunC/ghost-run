import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMOJI_DATA_SOURCE_SHA256,
  EMOJI_DATA_SOURCE_URL,
  EMOJI_DATA_UNICODE_VERSION,
  EXTENDED_PICTOGRAPHIC_RANGES,
  EXTENDED_PICTOGRAPHIC_TABLE_SHA256,
} from '../src/possession/emoji-table.generated.js';
import { isExtendedPictographic } from '../src/possession/emoji.js';
import { scanText } from '../src/possession/scan.js';

const ranges = EXTENDED_PICTOGRAPHIC_RANGES;
const pin = JSON.parse(
  readFileSync(new URL('../scripts/emoji-data.pin.json', import.meta.url), 'utf8'),
) as {
  unicodeVersion: string;
  emojiData: { url: string; sha256: string };
};
const generatedSource = readFileSync(
  new URL('../src/possession/emoji-table.generated.ts', import.meta.url),
  'utf8',
);

describe('Extended_Pictographic table structure (Requirements 4.4, 4.6)', () => {
  it('has an even length and every value within 0..0x10FFFF', () => {
    expect(ranges.length % 2).toBe(0);
    expect(ranges.length).toBeGreaterThan(0);
    for (const v of ranges) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0x10ffff);
    }
  });

  it('is ascending, non-overlapping and merged (gap of at least one code point)', () => {
    for (let i = 0; i < ranges.length; i += 2) {
      const lo = ranges[i] as number;
      const hi = ranges[i + 1] as number;
      expect(lo).toBeLessThanOrEqual(hi);
      if (i >= 2) {
        const prevHi = ranges[i - 1] as number;
        expect(lo).toBeGreaterThan(prevHi + 1);
      }
    }
  });

  it('matches the SHA-256 of the canonical range text', () => {
    let text = '';
    for (let i = 0; i < ranges.length; i += 2) {
      text += (ranges[i] as number).toString(16) + '-' + (ranges[i + 1] as number).toString(16) + '\n';
    }
    const digest = createHash('sha256').update(text).digest('hex');
    expect(digest).toBe(EXTENDED_PICTOGRAPHIC_TABLE_SHA256);
  });
});

describe('Extended_Pictographic spot checks (Requirement 4.4)', () => {
  const inside = [0xa9, 0x2764, 0x1f468, 0x1f469, 0x1f466, 0x1f525, 0x1f3f4];
  const outside = [
    0x23, 0x41, 0xac00, 0x1f1e6, 0x200d, 0xfe0f, 0xe007f,
    ...Array.from({ length: 10 }, (_, i) => 0x30 + i),
    ...Array.from({ length: 5 }, (_, i) => 0x1f3fb + i),
  ];

  it.each(inside)('U+%s is inside', (cp) => {
    expect(isExtendedPictographic(cp)).toBe(true);
  });

  it.each(outside)('U+%s is outside', (cp) => {
    expect(isExtendedPictographic(cp)).toBe(false);
  });
});

describe('version constants and pin file (Requirements 4.6, 4.7)', () => {
  it('agree with scripts/emoji-data.pin.json', () => {
    expect(EMOJI_DATA_UNICODE_VERSION).toBe('16.0.0');
    expect(EMOJI_DATA_UNICODE_VERSION).toBe(pin.unicodeVersion);
    expect(EMOJI_DATA_SOURCE_URL).toBe(pin.emojiData.url);
    expect(EMOJI_DATA_SOURCE_SHA256).toBe(pin.emojiData.sha256);
    expect(EMOJI_DATA_SOURCE_URL).toContain('/' + EMOJI_DATA_UNICODE_VERSION + '/');
  });
});

describe('generated file is plain ASCII (Requirement 14.2)', () => {
  it('contains only U+0009, U+000A and U+0020..U+007E', () => {
    for (let i = 0; i < generatedSource.length; i++) {
      const c = generatedSource.charCodeAt(i);
      const ok = c === 0x09 || c === 0x0a || (c >= 0x20 && c <= 0x7e);
      if (!ok) throw new Error('unexpected code unit ' + c.toString(16) + ' at index ' + i);
    }
  });

  it('is clean under scanText', () => {
    expect(scanText(generatedSource).findings).toEqual([]);
  });
});

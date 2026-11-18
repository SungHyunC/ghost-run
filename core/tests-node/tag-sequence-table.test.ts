// Structural checks of the generated RGI tag-sequence table
// (Requirements 2.9, 2.10, 4.6, 4.7, 14.2).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RGI_TAG_SEQUENCES,
  RGI_TAG_SEQUENCES_TABLE_SHA256,
  TAG_SEQUENCE_EMOJI_VERSION,
  TAG_SEQUENCE_SOURCE_SHA256,
  TAG_SEQUENCE_SOURCE_URL,
  TAG_SEQUENCE_UNICODE_VERSION,
} from '../src/possession/tag-sequence-table.generated.js';
import { MAX_SEQ_UNITS, TAG_SEQUENCE_STRINGS } from '../src/possession/tag-sequence.js';

const generatedPath = fileURLToPath(
  new URL('../src/possession/tag-sequence-table.generated.ts', import.meta.url),
);
const pinPath = fileURLToPath(new URL('../scripts/emoji-data.pin.json', import.meta.url));

// Independently hard-coded: England, Scotland, Wales.
const EXPECTED: readonly (readonly number[])[] = [
  [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f],
  [0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f],
  [0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f],
];

function compareSeq(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  }
  return a.length - b.length;
}

describe('RGI tag-sequence table', () => {
  it('every entry has the required structure', () => {
    for (const seq of RGI_TAG_SEQUENCES) {
      expect(seq.length).toBeGreaterThanOrEqual(3);
      expect(seq[0]).toBe(0x1f3f4);
      expect(seq[seq.length - 1]).toBe(0xe007f);
      const inner = seq.slice(1, -1);
      expect(inner.length).toBeGreaterThanOrEqual(1);
      for (const cp of inner) {
        expect(cp).toBeGreaterThanOrEqual(0xe0020);
        expect(cp).toBeLessThanOrEqual(0xe007e);
      }
    }
  });

  it('is strictly ascending and unique', () => {
    for (let i = 1; i < RGI_TAG_SEQUENCES.length; i++) {
      expect(
        compareSeq(RGI_TAG_SEQUENCES[i - 1] as number[], RGI_TAG_SEQUENCES[i] as number[]),
      ).toBeLessThan(0);
    }
  });

  it('matches the SHA-256 of the canonical sequence text', () => {
    const hex = (n: number): string => n.toString(16).toUpperCase();
    const lower = (n: number): string => n.toString(16);
    const canonical = (fmt: (n: number) => string): string =>
      RGI_TAG_SEQUENCES.map((s) => s.map(fmt).join(' ') + '\n').join('');
    const digest = (t: string): string => createHash('sha256').update(t).digest('hex');
    // The generator hashes lowercase hex; uppercase is accepted only if the generator changes.
    const actual = digest(canonical(lower));
    expect(actual === RGI_TAG_SEQUENCES_TABLE_SHA256 || digest(canonical(hex)) === RGI_TAG_SEQUENCES_TABLE_SHA256).toBe(true);
    expect(RGI_TAG_SEQUENCES_TABLE_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has exactly England, Scotland, and Wales', () => {
    expect(RGI_TAG_SEQUENCES.map((s) => [...s])).toEqual(EXPECTED.map((s) => [...s]));
  });

  it('version constants, URLs, and pin file agree', () => {
    const pin = JSON.parse(readFileSync(pinPath, 'utf8')) as {
      unicodeVersion: string;
      emojiVersion: string;
      emojiSequences: { url: string; sha256: string };
    };
    expect(TAG_SEQUENCE_UNICODE_VERSION).toBe('16.0.0');
    expect(TAG_SEQUENCE_EMOJI_VERSION).toBe('16.0');
    expect(TAG_SEQUENCE_UNICODE_VERSION.startsWith(TAG_SEQUENCE_EMOJI_VERSION + '.')).toBe(true);
    expect(pin.unicodeVersion).toBe(TAG_SEQUENCE_UNICODE_VERSION);
    expect(pin.emojiVersion).toBe(TAG_SEQUENCE_EMOJI_VERSION);
    expect(TAG_SEQUENCE_SOURCE_URL).toBe(
      'https://www.unicode.org/Public/emoji/16.0/emoji-sequences.txt',
    );
    expect(pin.emojiSequences.url).toBe(TAG_SEQUENCE_SOURCE_URL);
    expect(pin.emojiSequences.sha256).toBe(TAG_SEQUENCE_SOURCE_SHA256);
  });

  it('derived constants match the table', () => {
    expect([...TAG_SEQUENCE_STRINGS].sort()).toEqual(
      RGI_TAG_SEQUENCES.map((s) => String.fromCodePoint(...s)).sort(),
    );
    expect(TAG_SEQUENCE_STRINGS.size).toBe(RGI_TAG_SEQUENCES.length);
    // Every entry here is 7 code points: 1 astral base + 6 astral tags = 14 units.
    const units = RGI_TAG_SEQUENCES.map((s) => s.reduce((n, cp) => n + (cp > 0xffff ? 2 : 1), 0));
    expect(MAX_SEQ_UNITS).toBe(Math.max(...units));
  });

  it('generated file contains only printable ASCII and LF', () => {
    const text = readFileSync(generatedPath, 'utf8');
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      expect(c === 0x0a || (c >= 0x20 && c <= 0x7e)).toBe(true);
    }
  });
});

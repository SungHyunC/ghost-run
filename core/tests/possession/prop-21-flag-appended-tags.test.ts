// Feature: possession, Property 21: Tags appended after a flag are flagged and the flag is not
// **Validates: Requirements 2.12, 3.11, 13.14, 13.17**
// Scope: P7, positive direction for tags that follow a flag. Claimed everywhere.
// Not claimed: any text analysis of what the decoded tags say.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import {
  appendedTags,
  asciiReporter,
  flagSequenceCodePoints,
  insertAt,
  insertionPoint,
  ordinaryNoEmoji,
  toCodePoints,
} from './arbitraries.js';

const counters = {
  total: 0,
  asciiTags: 0,
  withCancelTag: 0,
  nonAsciiTags: 0,
  insertAtStart: 0,
  insertAtEnd: 0,
  insertMiddle: 0,
  singleTag: 0,
  multiTag: 0,
};

// appendedTags alone only rarely contains the cancel tag (U+E007F); add a weighted variant
// that always ends with it so the counter below is reached on every seed.
const tagsWithCancel: fc.Arbitrary<number[]> = fc.oneof(
  { weight: 3, arbitrary: appendedTags },
  { weight: 1, arbitrary: appendedTags.map((t) => [...t, 0xe007f]) },
);

const scenario = fc
  .tuple(ordinaryNoEmoji, flagSequenceCodePoints, tagsWithCancel)
  .chain(([text, seq, tags]) =>
    insertionPoint(text).map((pos) => ({ text, seq, tags, pos })),
  );

function check(text: string, pos: number, seq: readonly number[], tags: readonly number[]): void {
  const flag = String.fromCodePoint(...seq);
  const appended = String.fromCodePoint(...tags);
  const input = insertAt(text, pos, flag + appended);
  const findings = scanText(input).findings;
  const seqStart = pos;
  const seqEnd = pos + seq.length; // exclusive
  const tagEnd = seqEnd + tags.length;

  for (const f of findings) {
    // no Finding covers any code point of the table sequence
    expect(f.offset + f.length <= seqStart || f.offset >= seqEnd).toBe(true);
  }
  // every appended tag is covered by a tag Finding
  for (let i = seqEnd; i < tagEnd; i++) {
    expect(findings.some((f) => f.category === 'tag' && f.offset <= i && i < f.offset + f.length)).toBe(true);
  }
  const first = findings.find((f) => f.offset + f.length > seqEnd);
  expect(first).toBeDefined();
  expect(first?.offset).toBe(seqEnd);
  expect(first?.category).toBe('tag');
  if (tags.every((c) => c >= 0xe0020 && c <= 0xe007e)) {
    const decoded = tags.map((c) => String.fromCharCode(c - 0xe0000)).join('');
    expect(first?.rendering).toBe(decoded);
  }
}

describe('Property 21: tags appended after a flag are flagged and the flag is not', () => {
  it(
    'appended tags are flagged from the first one on, the listed sequence is left alone',
    () => {
      fc.assert(
        fc.property(scenario, ({ text, seq, tags, pos }) => {
          counters.total++;
          if (tags.every((c) => c >= 0xe0020 && c <= 0xe007e)) counters.asciiTags++;
          else counters.nonAsciiTags++;
          if (tags.includes(0xe007f)) counters.withCancelTag++;
          const len = toCodePoints(text).length;
          if (pos === 0) counters.insertAtStart++;
          if (pos === len) counters.insertAtEnd++;
          if (pos > 0 && pos < len) counters.insertMiddle++;
          if (tags.length === 1) counters.singleTag++;
          else counters.multiTag++;
          check(text, pos, seq, tags);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: a listed sequence followed by one appended letter tag', () => {
    const seq = [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
    const input = String.fromCodePoint(...seq, 0xe0061);
    const findings = scanText(input).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.offset).toBe(7);
    expect(findings[0]?.length).toBe(1);
    expect(findings[0]?.rendering).toBe('a');
  });

  it('non-vacuity: every input class was generated', () => {
    expect(counters.total).toBeGreaterThan(0);
    expect(counters.asciiTags).toBeGreaterThan(0);
    expect(counters.nonAsciiTags).toBeGreaterThan(0);
    expect(counters.withCancelTag).toBeGreaterThan(0);
    expect(counters.insertAtStart).toBeGreaterThan(0);
    expect(counters.insertAtEnd).toBeGreaterThan(0);
    expect(counters.insertMiddle).toBeGreaterThan(0);
    expect(counters.singleTag).toBeGreaterThan(0);
    expect(counters.multiTag).toBeGreaterThan(0);
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine, type RunEnv } from '../src/shell/interpret.js';
import {
  ACTION_COMMAND_BUDGET,
  ENTRIES_MAX,
  FILE_MAX,
  OUTPUT_MAX,
  TOTAL_MAX,
} from '../src/shell/limits.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import { StateFs } from '../src/vfs/mutable-fs.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each failure prints the fast-check seed and the shrunk counterexample (fc.assert report).

const MARKER = '[truncated]';
const enc = new TextEncoder();
const dec = new TextDecoder();

const makeEnv = (entries: Record<string, Entry>) => makeTestEnv(entries);

const file = (bytes: Uint8Array): Entry => ({ kind: 'file', bytes });
const filler = (size: number): Uint8Array => new Uint8Array(size).fill(0x61);

/** Cheap comparable snapshot: path, kind, byte length, and a rolling checksum of each file. */
function snap(fs: StateFs): string {
  const parts: string[] = [];
  const state = fs.toState();
  for (const [path, entry] of Object.entries(state.entries)) {
    if (entry.kind === 'dir') {
      parts.push(`${path}:d`);
      continue;
    }
    let sum = 0;
    for (let i = 0; i < entry.bytes.byteLength; i += 97) sum = (sum * 31 + (entry.bytes[i] as number)) | 0;
    parts.push(`${path}:f:${entry.bytes.byteLength}:${sum}`);
  }
  return parts.join('|');
}

/** Cuts text at `max` code points the way the spec words it. */
function refTruncate(text: string): string {
  const points = Array.from(text);
  return points.length <= OUTPUT_MAX ? text : points.slice(0, OUTPUT_MAX).join('') + MARKER;
}

const arbChar = fc.constantFrom('a', 'Z', '7', '\u00e9', '\u4e2d', '\u{1F600}', '\n', ' ');
// Lengths cluster around the 4,096 boundary, with some far larger texts.
const arbLength = fc.oneof(
  { arbitrary: fc.integer({ min: OUTPUT_MAX - 5, max: OUTPUT_MAX + 5 }), weight: 4 },
  { arbitrary: fc.integer({ min: 0, max: 3 * OUTPUT_MAX }), weight: 2 },
);

describe('Property 21: Limits and output truncation', () => {
  it(
    'stdout and stderr are cut at 4,096 code points followed by [truncated]; shorter output is unchanged',
    async () => {
      // Feature: ghost-shell, Property 21: Limits and output truncation
      // **Validates: Requirements 4.1, 5.11**
      await fc.assert(
        fc.asyncProperty(
          arbLength,
          fc.array(arbChar, { minLength: 1, maxLength: 8 }),
          fc.integer({ min: 1, max: 4090 }),
          async (length, alphabet, nameLength) => {
            let content = '';
            for (let i = 0; content.length < length * 2 && Array.from(content).length < length; i++) {
              content += alphabet[i % alphabet.length];
            }
            const { env } = makeEnv({ 'big.txt': file(enc.encode(content)) });

            const out = await runLine('cat big.txt', env);
            expect(out.exitCode).toBe(0);
            expect(out.stdout).toBe(refTruncate(content));
            if (Array.from(content).length > OUTPUT_MAX) {
              expect(Array.from(out.stdout)).toHaveLength(OUTPUT_MAX + Array.from(MARKER).length);
              expect(out.stdout.endsWith(MARKER)).toBe(true);
            } else {
              expect(out.stdout.endsWith(MARKER) && !content.endsWith(MARKER)).toBe(false);
            }

            // stderr: a missing file with a long name.
            const name = 'm'.repeat(nameLength);
            const err = await runLine(`cat ${name}`, env);
            expect(err.exitCode).toBe(1);
            const points = Array.from(err.stderr);
            if (err.stderr.endsWith(MARKER)) {
              expect(points).toHaveLength(OUTPUT_MAX + Array.from(MARKER).length);
            } else {
              expect(points.length).toBeLessThanOrEqual(OUTPUT_MAX);
            }
            expect(err.stderr.includes(name) || err.stderr.endsWith(MARKER)).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a line that would push the project past 2,000 entries fails with exit 1 and leaves the state as it was',
    async () => {
      // Feature: ghost-shell, Property 21: Limits and output truncation
      // **Validates: Requirements 4.1, 5.11**
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: ENTRIES_MAX - 12, max: ENTRIES_MAX }),
          fc.integer({ min: 1, max: 14 }),
          async (existing, added) => {
            const entries: Record<string, Entry> = {};
            for (let i = 0; i < existing; i++) entries[`e${i}`] = file(new Uint8Array(0));
            const { fs, env } = makeEnv(entries);
            const before = snap(fs);
            const names = Array.from({ length: added }, (_, i) => `n${i}`).join(' ');

            // mkdir first, so a rollback must also undo the earlier command of the line.
            const r = await runLine(`mkdir newdir; touch ${names}`, env);
            const total = existing + 1 + added;
            if (total > ENTRIES_MAX) {
              expect(r.exitCode).toBe(1);
              expect(r.stderr).toContain('limit exceeded');
              expect(r.stderr).toContain('entries');
              expect(snap(fs)).toBe(before);
            } else {
              expect(r.exitCode).toBe(0);
              expect(Object.keys(fs.toState().entries)).toHaveLength(total);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a write past 1 MiB for one file fails with exit 1 and leaves the state as it was',
    async () => {
      // Feature: ghost-shell, Property 21: Limits and output truncation
      // **Validates: Requirements 4.1, 5.11**
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 300 }),
          fc.integer({ min: 0, max: 300 }),
          async (room, textLength) => {
            const size = FILE_MAX - room;
            const { fs, env } = makeEnv({ 'log.txt': file(filler(size)) });
            const before = snap(fs);

            const r = await runLine(`echo ${'b'.repeat(textLength)} >> log.txt`, env);
            const appended = textLength + 1; // echo adds a newline
            if (size + appended > FILE_MAX) {
              expect(r.exitCode).toBe(1);
              expect(r.stderr).toContain('limit exceeded');
              expect(r.stderr).toContain('file-size');
              expect(snap(fs)).toBe(before);
            } else {
              expect(r.exitCode).toBe(0);
              const e = fs.get('log.txt');
              expect(e?.kind === 'file' ? e.bytes.byteLength : -1).toBe(size + appended);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a write past 16 MiB in total fails with exit 1 and leaves the state as it was',
    async () => {
      // Feature: ghost-shell, Property 21: Limits and output truncation
      // **Validates: Requirements 4.1, 5.11**
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 2000 }),
          async (roomA, roomB, textLength) => {
            const entries: Record<string, Entry> = {};
            for (let i = 0; i < 14; i++) entries[`full${i}`] = file(filler(FILE_MAX));
            entries['a.bin'] = file(filler(FILE_MAX - roomA));
            entries['b.bin'] = file(filler(FILE_MAX - roomB));
            const { fs, env } = makeEnv(entries);
            const before = snap(fs);
            const used = 14 * FILE_MAX + (FILE_MAX - roomA) + (FILE_MAX - roomB);
            expect(used).toBeLessThanOrEqual(TOTAL_MAX);

            const r = await runLine(`echo ${'c'.repeat(textLength)} > c.txt`, env);
            const written = textLength + 1;
            if (used + written > TOTAL_MAX) {
              expect(r.exitCode).toBe(1);
              expect(r.stderr).toContain('limit exceeded');
              expect(r.stderr).toContain('total-size');
              expect(snap(fs)).toBe(before);
            } else {
              expect(r.exitCode).toBe(0);
              const e = fs.get('c.txt');
              expect(e?.kind === 'file' ? dec.decode(e.bytes) : '<none>').toBe(
                `${'c'.repeat(textLength)}\n`,
              );
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('example: exactly 2,000 entries is allowed, 2,001 is refused', async () => {
    const entries: Record<string, Entry> = {};
    for (let i = 0; i < ENTRIES_MAX - 1; i++) entries[`e${i}`] = file(new Uint8Array(0));
    const { fs, env } = makeEnv(entries);
    expect((await runLine('touch one', env)).exitCode).toBe(0);
    const r = await runLine('touch two', env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe('limit exceeded: entries');
    expect(Object.keys(fs.toState().entries)).toHaveLength(ENTRIES_MAX);
  });
});

// Feature: kiro-integration, Property 5: Provenance and stats round trip
// **Validates: Requirements 12.3, 13.3, 13.6, 13.7, 13.8, 13.12**
import { parseProvenanceLog, serializeProvenanceLog } from '@ghost-run/core';
import fc from 'fast-check';
import fsp from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { appendLine, readLines, sessionPaths } from '../lib/store/ghost-store.mjs';
import { appendProvenance, readProvenance } from '../lib/store/provenance.mjs';
import { STATS_KINDS, statsLine, summarizeStats } from '../lib/store/stats.mjs';
import { makeTempStore } from './fixtures/index.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS, NUM_RUNS } from './pbt-config.mjs';

/** @type {{ cleanup: () => void }[]} */
const temps = [];
afterEach(() => {
  for (const t of temps.splice(0)) t.cleanup();
});
function temp() {
  const t = makeTempStore();
  temps.push(t);
  return t;
}

// Hidden code points are built from numbers only, never written literally.
const HIDDEN = [
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
  0x2068, 0x2069, 0xe0001, 0xe0041, 0xe007f,
];
const plainCp = fc.oneof(
  fc.integer({ min: 0x20, max: 0x7e }),
  fc.integer({ min: 0xa0, max: 0xd7ff }),
  fc.integer({ min: 0xe000, max: 0xfffd }),
  fc.integer({ min: 0x1f300, max: 0x1f64f }),
  fc.constantFrom(0x0a, 0x0d, 0x09, 0x22, 0x5c, 0x2028, 0x2029),
);
const cpString = fc
  .array(fc.oneof({ weight: 3, arbitrary: plainCp }, { weight: 1, arbitrary: fc.constantFrom(...HIDDEN) }), {
    maxLength: 40,
  })
  .map((cps) => String.fromCodePoint(...cps));

const recordArb = fc.record({
  source: cpString.filter((s) => s.length > 0),
  kind: fc.constantFrom('file', 'issue', 'web', 'other'),
  content: cpString,
});

const KEYS = ['commandsSeen', 'commandsGhosted', 'commandsBlocked', 'commandsWarned', 'commandsSafeSkipped', 'commandsTrusted', 'commandsExecuted'];
/** @type {Record<string, string>} */
const KIND_TO_KEY = {
  seen: 'commandsSeen',
  ghosted: 'commandsGhosted',
  blocked: 'commandsBlocked',
  warned: 'commandsWarned',
  'safe-skip': 'commandsSafeSkipped',
  trusted: 'commandsTrusted',
  executed: 'commandsExecuted',
};

const CORRUPT_LINES = ['', '{', 'not json', '[]', 'null', '{"kind":"seen"}', '{"kind":"seen","at":"yesterday"}', '{"kind":"bogus","at":"2026-01-01T00:00:00Z"}', '"seen"'];
const eventArb = fc.oneof(
  fc.record({ good: fc.constant(true), kind: fc.constantFrom(...STATS_KINDS), ms: fc.integer({ min: 0, max: 4_000_000_000_000 }) }),
  fc.record({ good: fc.constant(false), text: fc.constantFrom(...CORRUPT_LINES) }),
);

const sessionArb = fc.stringMatching(/^[a-z0-9]{1,12}$/);

describe('Property 5: provenance and stats round trip', { timeout: FILE_TIMEOUT_MS }, () => {
  it('summarizeStats counts each kind exactly and skips corrupt lines', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        /** @type {string[]} */
        const lines = [];
        /** @type {Record<string, number>} */
        const expected = Object.fromEntries(KEYS.map((k) => [k, 0]));
        for (const e of events) {
          if (e.good) {
            lines.push(statsLine(/** @type {any} */ (e.kind), e.ms));
            const key = KIND_TO_KEY[e.kind];
            if (key) expected[key]++;
          } else lines.push(/** @type {string} */ (e.text));
        }
        const s = summarizeStats(lines);
        expect(s).toEqual(expected);
        expect(s.commandsSeen).toBe(events.filter((e) => e.good && e.kind === 'seen').length);
      }),
      FC_PARAMS,
    );
  });

  it('appended records read back, and serialize/parse is a fixed point', async () => {
    await fc.assert(
      fc.asyncProperty(sessionArb, fc.array(recordArb, { maxLength: 8 }), async (key, records) => {
        const t = temp();
        for (const r of records) expect(await appendProvenance(t.dir, key, r)).toEqual({ ok: true });
        const text = await fsp.readFile(sessionPaths(t.dir, key).provenance, 'utf8').catch(() => '');
        const { lines } = readLines(text);
        expect(lines.length).toBe(records.length);
        for (const line of lines) {
          const parsed = parseProvenanceLog(`[${line}]`);
          expect(parsed.ok).toBe(true);
        }
        const { log, corrupt } = await readProvenance(t.dir, key);
        expect(corrupt).toBe(0);
        expect(log).toEqual(records);
        const again = parseProvenanceLog(serializeProvenanceLog(log));
        expect(again).toEqual({ ok: true, log });
        t.cleanup();
      }),
      FC_PARAMS,
    );
  });

  it('corrupt lines mixed into the file are counted, survivors still round trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof(recordArb.map((r) => ({ r })), fc.constantFrom('{', 'garbage', '{"source":"","kind":"file","content":""}', '{"a":1}').map((bad) => ({ bad }))), { maxLength: 10 }),
        async (items) => {
          const t = temp();
          const file = sessionPaths(t.dir, 'mixed').provenance;
          const good = [];
          let bad = 0;
          for (const it of items) {
            if ('r' in it) {
              expect(await appendProvenance(t.dir, 'mixed', it.r)).toEqual({ ok: true });
              good.push(it.r);
            } else {
              expect(await appendLine(file, it.bad)).toEqual({ ok: true });
              bad++;
            }
          }
          const { log, corrupt } = await readProvenance(t.dir, 'mixed');
          expect(log).toEqual(good);
          expect(corrupt).toBe(bad);
          expect(parseProvenanceLog(serializeProvenanceLog(log))).toEqual({ ok: true, log });
          t.cleanup();
        },
      ),
      FC_PARAMS,
    );
  });

  it('concurrent appenders to one file: every line parses or is counted corrupt, parseable count equals appends', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.array(fc.oneof(recordArb.map((r) => ({ r })), fc.constant({ bad: 'oops' })), { minLength: 1, maxLength: 6 }), { minLength: 2, maxLength: 6 }),
        async (writers) => {
          const t = temp();
          const file = sessionPaths(t.dir, 'conc').provenance;
          const statsFile = `${t.dir}/.ghost-run/stats.jsonl`;
          let goodCount = 0;
          let badCount = 0;
          let seen = 0;
          await Promise.all(
            writers.map(async (w, wi) => {
              for (const it of w) {
                if ('r' in it) {
                  goodCount++;
                  await appendProvenance(t.dir, 'conc', it.r);
                } else {
                  badCount++;
                  await appendLine(file, it.bad);
                }
                seen++;
                await appendLine(statsFile, statsLine('seen', wi * 1000 + seen));
              }
            }),
          );
          const text = await fsp.readFile(file, 'utf8');
          const { lines, corrupt } = readLines(text);
          expect(corrupt).toBe(0);
          let parseable = 0;
          let unparseable = 0;
          for (const line of lines) {
            const p = parseProvenanceLog(`[${line}]`);
            if (p.ok && p.log.length === 1) parseable++;
            else unparseable++;
          }
          expect(parseable).toBe(goodCount);
          expect(unparseable).toBe(badCount);
          const read = await readProvenance(t.dir, 'conc');
          expect(read.log.length).toBe(goodCount);
          expect(read.corrupt).toBe(badCount);
          const stats = readLines(await fsp.readFile(statsFile, 'utf8'));
          expect(stats.corrupt).toBe(0);
          expect(summarizeStats(stats.lines).commandsSeen).toBe(goodCount + badCount);
          t.cleanup();
        },
      ),
      { ...FC_PARAMS, numRuns: Math.min(NUM_RUNS, 100) },
    );
  });
});

describe('regression examples', () => {
  it('hidden code points survive the store round trip', async () => {
    const t = temp();
    const content = `a${String.fromCodePoint(0x200b, 0xe0041, 0x202e)}b\n"\\`;
    const rec = { source: 'doc', kind: 'file', content };
    await appendProvenance(t.dir, 'k', rec);
    expect((await readProvenance(t.dir, 'k')).log).toEqual([rec]);
  });
});

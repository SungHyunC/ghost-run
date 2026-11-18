// Feature: kiro-integration, Property 4: No secret on disk or output
// **Validates: Requirements 3.9, 5.7, 12.5, 12.6, 12.7, 14.4**
//
// Store level: canaries placed in a command, a path, a reason, a tool response,
// a Grave_Entry-shaped object, and a Run_Record-shaped object, each in raw,
// base64, base64url, hex, and percent-encoded form. After storeWrite,
// appendProvenance, writeRunRecord, and the output formatters that exist so
// far (formatStatsTable through finish), no canary byte sequence is in any file
// of the temporary Ghost_Store, STDOUT, or STDERR, and the serialized
// Run_Record has no `secretValues` entry and no payload byte.
// Gate formatters (decision lines, ask JSON, block message) belong to later
// tasks; tasks 8.9 and 14.8 cover them end to end.
import fc from 'fast-check';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInspector } from '@ghost-run/core';
import { finish } from '../lib/hook-io.mjs';
import { storePaths, storeWrite } from '../lib/store/ghost-store.mjs';
import { appendProvenance } from '../lib/store/provenance.mjs';
import { writeRunRecord } from '../lib/store/runs.mjs';
import { formatStatsTable, statsLine, summarizeStats } from '../lib/store/stats.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS } from './pbt-config.mjs';
import { canaryArb, makeTempStore } from './fixtures/index.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

const b64 = (/** @type {Buffer} */ b) => b.toString('base64');
const b64url = (/** @type {Buffer} */ b) => b.toString('base64url');

/** The six text forms of a canary (percent-encoded: standard and every byte escaped). */
function encodings(/** @type {string} */ canary) {
  const buf = Buffer.from(canary, 'utf8');
  let allPct = '';
  for (const byte of buf) allPct += `%${byte.toString(16).padStart(2, '0')}`;
  return {
    raw: canary,
    base64: b64(buf),
    base64url: b64url(buf),
    hex: buf.toString('hex'),
    percent: encodeURIComponent(canary),
    percentAll: allPct,
  };
}

/** Every spelling that must not appear in an output (padding variants and hex case included). */
function forbiddenForms(/** @type {string} */ canary) {
  const e = encodings(canary);
  return [
    ...new Set([
      e.raw,
      e.base64,
      e.base64.replace(/=+$/, ''),
      e.base64url,
      e.base64url.replace(/=+$/, ''),
      e.hex,
      e.hex.toUpperCase(),
      e.percent,
      e.percentAll,
      e.percentAll.toUpperCase(),
    ]),
  ];
}

/** @param {string} dir @returns {string[]} */
function allFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...allFiles(p));
    else out.push(p);
  }
  return out;
}

const formArb = fc.constantFrom('raw', 'base64', 'base64url', 'hex', 'percent', 'percentAll');
const affixArb = fc.string({ unit: fc.constantFrom(...' abcxyz=:/.'.split('')), maxLength: 6 });

/** One placement: a canary spelled in one form, with harmless text around it. */
const placementArb = fc
  .tuple(canaryArb, formArb, affixArb, affixArb)
  .map(([canary, form, pre, post]) => ({ canary, text: `${pre}${encodings(canary)[form]}${post}` }));

const SLOTS = ['command', 'path', 'reason', 'response', 'grave', 'run'];

/** One canary shared by all six slots, each slot with its own form. */
const scenarioArb = canaryArb.chain((canary) =>
  fc.record({
    canary: fc.constant(canary),
    slots: fc.record(
      Object.fromEntries(
        SLOTS.map((s) => [
          s,
          fc.tuple(formArb, affixArb, affixArb).map(([form, pre, post]) => `${pre}${encodings(canary)[form]}${post}`),
        ]),
      ),
    ),
    extra: fc.array(placementArb, { maxLength: 2 }),
  }),
);

/** @param {string} runId @param {Record<string, string>} s */
function runRecordShaped(runId, s) {
  return /** @type {any} */ ({
    schemaVersion: 1,
    runId,
    status: 'completed',
    verdict: 'block',
    isolation: { mode: 'docker' },
    phases: [],
    notices: [s.run, s.reason],
    diagnostics: [{ kind: 'note', detail: s.command }],
    copy: { cloned: true, location: `/box/${s.path}` },
    report: { snapshots: [{ id: 's0', result: 'ok', state: { rootPath: `/box/${s.path}`, entries: [] } }] },
    // Entries that must never reach the serialized record.
    secretValues: { '.env': s.run },
    payloads: { e1: s.response },
  });
}

/**
 * Run all store writers and the existing formatters for one scenario.
 * @param {{ canary: string, slots: Record<string, string>, extra: { canary: string, text: string }[] }} sc
 */
async function exercise(sc) {
  const t = makeTempStore();
  /** @type {string[]} */
  const out = [];
  const so = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  const se = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  try {
    const canaries = [sc.canary, ...sc.extra.map((x) => x.canary)];
    const bytes = canaries.map((c) => new TextEncoder().encode(c));
    const s = sc.slots;
    const paths = storePaths(t.dir);

    // storeWrite: a Grave_Entry-shaped line, and a line with the other slots.
    const grave = { id: 'g-run-1', command: s.command, path: s.path, reason: s.reason, response: s.response, note: s.grave };
    expect((await storeWrite(paths.graveyard, JSON.stringify(grave), bytes)).ok).toBe(true);
    const more = { extra: sc.extra.map((x) => x.text) };
    expect((await storeWrite(paths.graveyard, JSON.stringify(more), bytes)).ok).toBe(true);

    // appendProvenance: path as source, tool response and others as content.
    for (const content of [s.response, s.command, s.reason, s.grave, ...sc.extra.map((x) => x.text)]) {
      const r = await appendProvenance(t.dir, 'sess-1', { source: s.path, kind: 'other', content }, bytes);
      expect(r.ok).toBe(true);
    }

    // writeRunRecord: Run_Record-shaped object, with secretValues and payloads entries.
    const w = await writeRunRecord(t.dir, runRecordShaped('run-1', s), bytes);
    expect(w.ok).toBe(true);

    // Output formatters that exist: the stats table, printed through finish.
    const lines = [statsLine('seen'), statsLine('blocked'), JSON.stringify(grave), s.command];
    const table = formatStatsTable(summarizeStats(lines));
    await new Promise((resolve) => {
      finish(
        { exit: 0, stdout: `${table}\n`, stderr: '' },
        {
          stdout: (text, cb) => {
            process.stdout.write(text);
            cb();
          },
          stderr: (text, cb) => {
            process.stderr.write(text);
            cb();
          },
          exit: () => resolve(undefined),
        },
      );
    });

    // Checks.
    /** @type {Map<string, Buffer>} */
    const contents = new Map(allFiles(t.dir).map((f) => [f, readFileSync(f)]));
    contents.set('<captured output>', Buffer.from(out.join(''), 'utf8'));
    for (const [name, data] of contents) {
      for (const canary of canaries) {
        for (const form of forbiddenForms(canary)) {
          expect(data.includes(Buffer.from(form, 'utf8')), `${name} contains a canary form`).toBe(false);
        }
      }
      const hits = createInspector(new Map([[name, new Uint8Array(data)]])).hits(bytes);
      expect(hits.size, `${name}: inspector hit`).toBe(0);
    }

    const record = readFileSync(join(paths.runs, 'run-1.json'), 'utf8');
    expect(record).not.toContain('secretValues');
    expect(record).not.toContain('payloads');
    expect(record).not.toContain('"e1":');
  } finally {
    so.mockRestore();
    se.mockRestore();
    t.cleanup();
  }
}

describe('Property 4: no secret on disk or output [no-docker]', () => {
  it(
    'no canary form reaches the Ghost_Store, STDOUT, or STDERR; the Run_Record has no secretValues or payload',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (sc) => {
          await exercise(sc);
        }),
        FC_PARAMS,
      );
    },
    FILE_TIMEOUT_MS,
  );

  // Fixed regression: the shrunk counterexample of the first run. A Run_Record-shaped
  // object with secretValues and payloads entries kept both entries (redacted, but present).
  it('regression: secretValues and payloads entries never reach the Run_Record', async () => {
    const canary = 'sk-CANARY-A';
    const slots = Object.fromEntries(SLOTS.map((s) => [s, canary]));
    await exercise({ canary, slots, extra: [] });
  });
});

// Feature: kiro-integration, Property 16: Store caps
// **Validates: Requirements 12.8, 13.1**
//
// Where the counting lives: the Ghost_Store refuses a record over 1 MiB
// (appendLine: `too-large`, nothing written). The Stats_Event
// `provenance-skipped` is appended by the caller (ghost-log, task 4.8), through
// statsLine (stats.mjs). This file tests the store level: the refusal, no bytes
// written, and the skip event written as a valid stats line that
// summarizeStats counts as no other kind. The caller itself is tested with 4.8.
import fc from 'fast-check';
import { mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { STORE_CAPS } from '../gate-config.mjs';
import { appendLine, enforceCaps, sessionPaths, storePaths } from '../lib/store/ghost-store.mjs';
import { appendProvenance } from '../lib/store/provenance.mjs';
import { statsLine, summarizeStats } from '../lib/store/stats.mjs';
import { FC_PARAMS } from './pbt-config.mjs';
import { makeTempStore } from './fixtures/index.mjs';

const CAPS = Object.freeze({ sessions: 3, runs: 4, graveyardLines: 5, provenancePerSession: 4 });
const SESSION_NAMES = ['s0', 's1', 's2', 's3', 's4', 's5'];
const RECORD_MAX = STORE_CAPS.recordBytes;

/** @type {{ cleanup: () => void }[]} */
const temps = [];
afterEach(() => {
  while (temps.length > 0) temps.pop()?.cleanup();
});

/** Line sizes (bytes, without terminator) around the 1 MiB bound. */
const sizeArb = fc.constantFrom(RECORD_MAX - 1, RECORD_MAX, RECORD_MAX + 1, RECORD_MAX + 4096);

const opArb = fc.oneof(
  { weight: 3, arbitrary: fc.record({ t: fc.constant('session'), s: fc.constantFrom(...SESSION_NAMES) }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('run') }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('grave') }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('prov'), s: fc.constantFrom(...SESSION_NAMES) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('big'), size: sizeArb, s: fc.constantFrom(...SESSION_NAMES) }) },
);

const BASE_SEC = 1_700_000_000;

/**
 * Run a sequence of operations against a temporary store with a model, and
 * check the caps and the oldest-first rule after every step.
 * @param {readonly Record<string, any>[]} ops
 */
async function runSequence(ops) {
  const t = makeTempStore();
  temps.push(t);
  const root = t.dir;
  const paths = storePaths(root);
  let clock = 0; // strictly increasing mtime source (seconds)
  let counter = 0;
  /** @type {string[]} session names, oldest first */
  let sessions = [];
  /** @type {Map<string, number[]>} */
  const prov = new Map();
  /** @type {Map<string, number>} */
  const born = new Map();
  /** @type {number[]} run ids, oldest first */
  let runs = [];
  /** @type {number[]} */
  let grave = [];
  let skipped = 0;

  const stamp = (/** @type {string} */ p) => {
    clock += 1000;
    utimesSync(p, BASE_SEC + clock, BASE_SEC + clock);
    return BASE_SEC + clock;
  };

  for (const op of ops) {
    if (op.t === 'session') {
      if (!sessions.includes(op.s)) {
        const dir = sessionPaths(root, op.s).dir;
        mkdirSync(dir, { recursive: true });
        sessions.push(op.s);
        prov.set(op.s, []);
        born.set(op.s, stamp(dir));
      }
    } else if (op.t === 'run') {
      const id = counter++;
      mkdirSync(paths.runs, { recursive: true });
      const f = join(paths.runs, `r${String(id).padStart(4, '0')}.json`);
      writeFileSync(f, '{}');
      stamp(f);
      runs.push(id);
    } else if (op.t === 'grave') {
      const id = counter++;
      const r = await appendLine(paths.graveyard, JSON.stringify({ n: id }));
      expect(r.ok).toBe(true);
      grave.push(id);
    } else if (op.t === 'prov') {
      if (sessions.includes(op.s)) {
        const id = counter++;
        const r = await appendLine(sessionPaths(root, op.s).provenance, JSON.stringify({ n: id }));
        expect(r.ok).toBe(true);
        prov.get(op.s)?.push(id);
        // Creating the file touches the folder; restore its creation time.
        const at = /** @type {number} */ (born.get(op.s));
        utimesSync(sessionPaths(root, op.s).dir, at, at);
      }
    } else if (op.t === 'big') {
      const file = op.size > RECORD_MAX ? sessionPaths(root, op.s).provenance : join(paths.dir, 'scratch.jsonl');
      const before = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
      const r = await appendLine(file, 'x'.repeat(op.size));
      if (op.size > RECORD_MAX) {
        expect(r).toEqual({ ok: false, failure: 'too-large' });
        const after = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
        expect(after.equals(before)).toBe(true);
        // The caller counts the skip with the stats line.
        expect((await appendLine(paths.stats, statsLine('provenance-skipped', 0))).ok).toBe(true);
        skipped++;
      } else {
        // At the bound or under it: written (outside every capped file).
        expect(r.ok).toBe(true);
        rmSync(file, { force: true });
      }
    }

    const res = await enforceCaps(root, CAPS);
    expect(res.ok).toBe(true);

    // Model: the oldest go first.
    if (sessions.length > CAPS.sessions) {
      for (const gone of sessions.slice(0, sessions.length - CAPS.sessions)) prov.delete(gone);
      sessions = sessions.slice(sessions.length - CAPS.sessions);
    }
    if (runs.length > CAPS.runs) runs = runs.slice(runs.length - CAPS.runs);
    if (grave.length > CAPS.graveyardLines) grave = grave.slice(grave.length - CAPS.graveyardLines);
    for (const [name, list] of prov) {
      if (list.length > CAPS.provenancePerSession) prov.set(name, list.slice(list.length - CAPS.provenancePerSession));
    }

    // Caps hold on disk, and the survivors are exactly the newest items.
    const onDisk = existsSync(paths.sessions) ? readdirSync(paths.sessions).sort() : [];
    expect(onDisk.length).toBeLessThanOrEqual(CAPS.sessions);
    expect(onDisk).toEqual([...sessions].sort());
    const runFiles = existsSync(paths.runs) ? readdirSync(paths.runs).filter((n) => n.endsWith('.json')).sort() : [];
    expect(runFiles).toEqual(runs.map((id) => `r${String(id).padStart(4, '0')}.json`));
    expect(runFiles.length).toBeLessThanOrEqual(CAPS.runs);
    const graveLines = existsSync(paths.graveyard)
      ? readFileSync(paths.graveyard, 'utf8').split('\n').filter((l) => l !== '')
      : [];
    expect(graveLines.length).toBeLessThanOrEqual(CAPS.graveyardLines);
    expect(graveLines.map((l) => JSON.parse(l).n)).toEqual(grave);
    for (const name of sessions) {
      const pf = sessionPaths(root, name).provenance;
      const lines = existsSync(pf) ? readFileSync(pf, 'utf8').split('\n').filter((l) => l !== '') : [];
      expect(lines.length).toBeLessThanOrEqual(CAPS.provenancePerSession);
      expect(lines.map((l) => JSON.parse(l).n)).toEqual(prov.get(name));
    }
  }

  // Every over-1 MiB refusal left one provenance-skipped stats line, and no other counter moved.
  const statsText = existsSync(paths.stats) ? readFileSync(paths.stats, 'utf8') : '';
  const statLines = statsText.split('\n').filter((l) => l !== '');
  expect(statLines.filter((l) => JSON.parse(l).kind === 'provenance-skipped')).toHaveLength(skipped);
  expect(Object.values(summarizeStats(statLines)).every((n) => n === 0)).toBe(true);
}

describe('Property 16: store caps [no-docker]', () => {
  it('caps hold after every step and the oldest item goes first', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), async (ops) => {
        await runSequence(ops);
      }),
      FC_PARAMS,
    );
  });

  it('a record over 1 MiB through appendProvenance is not written', async () => {
    const t = makeTempStore();
    temps.push(t);
    const big = { source: 'a.txt', kind: 'file', content: 'y'.repeat(RECORD_MAX + 10) };
    const r = await appendProvenance(t.dir, 'k1', big);
    expect(r.ok).toBe(false);
    expect(existsSync(sessionPaths(t.dir, 'k1').provenance)).toBe(false);
  });
});

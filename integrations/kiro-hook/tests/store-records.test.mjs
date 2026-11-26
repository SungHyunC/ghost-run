// Example tests for stats, provenance, and run records (task 4.3).
import { readFileSync, existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { readLines, sessionPaths, storePaths } from '../lib/store/ghost-store.mjs';
import { appendProvenance, readProvenance } from '../lib/store/provenance.mjs';
import { readRunRecord, writeRunRecord } from '../lib/store/runs.mjs';
import { formatStatsTable, STATS_KINDS, statsLine, summarizeStats } from '../lib/store/stats.mjs';
import { makeTempStore } from './fixtures/index.mjs';

/** @type {{ cleanup: () => void }[]} */
const temps = [];
function temp() {
  const t = makeTempStore();
  temps.push(t);
  return t;
}
afterEach(() => {
  for (const t of temps.splice(0)) t.cleanup();
});

const CANARY = 'sk-CANARY-abc123XYZ';

describe('stats', () => {
  it('writes the fixed line format for every token', () => {
    const at = new Date(Date.UTC(2026, 10, 30, 1, 2, 3, 456));
    for (const kind of STATS_KINDS) {
      expect(statsLine(/** @type {any} */ (kind), () => at)).toBe(`{"kind":"${kind}","at":"2026-11-30T01:02:03Z"}`);
    }
  });

  it('rejects an unknown token', () => {
    expect(() => statsLine(/** @type {any} */ ('rm -rf /'), new Date(0))).toThrow();
  });

  it('counts events and ignores corrupt lines', () => {
    const at = new Date(0);
    const lines = [
      statsLine('seen', at),
      statsLine('seen', at),
      statsLine('ghosted', at),
      statsLine('blocked', at),
      statsLine('warned', at),
      statsLine('safe-skip', at),
      statsLine('trusted', at),
      statsLine('executed', at),
      statsLine('passed', at),
      statsLine('provenance-skipped', at),
      '{"kind":"seen"',
      'not json',
      '{"kind":"seen","at":"yesterday"}',
    ];
    expect(summarizeStats(lines)).toEqual({
      commandsSeen: 2,
      commandsGhosted: 1,
      commandsBlocked: 1,
      commandsWarned: 1,
      commandsSafeSkipped: 1,
      commandsTrusted: 1,
      commandsExecuted: 1,
    });
    expect(formatStatsTable(summarizeStats(lines))).toContain('Commands seen');
  });
});

describe('provenance', () => {
  it('appends valid records and reads them back', async () => {
    const t = temp();
    const rec = { source: 'README.md', kind: 'file', content: 'hello' };
    expect((await appendProvenance(t.dir, 's1', rec)).ok).toBe(true);
    const file = sessionPaths(t.dir, 's1').provenance;
    expect(readFileSync(file, 'utf8')).toBe('{"source":"README.md","kind":"file","content":"hello"}\n');
    expect(await readProvenance(t.dir, 's1')).toEqual({ log: [rec], corrupt: 0 });
  });

  it('writes nothing for a record that does not parse', async () => {
    const t = temp();
    const bad = [
      { source: '', kind: 'file', content: 'x' },
      { source: 'a', kind: 'nope', content: 'x' },
      { source: 'a', kind: 'file', content: 1 },
      { source: 'a', kind: 'file', content: 'x', at: '2026-01-01' },
      null,
    ];
    for (const r of bad) expect((await appendProvenance(t.dir, 's1', r)).ok).toBe(false);
    expect(existsSync(sessionPaths(t.dir, 's1').provenance)).toBe(false);
  });

  it('redacts canaries before writing', async () => {
    const t = temp();
    const rec = { source: 'a.txt', kind: 'file', content: `key ${CANARY}` };
    await appendProvenance(t.dir, 's1', rec, [new TextEncoder().encode(CANARY)]);
    const text = readFileSync(sessionPaths(t.dir, 's1').provenance, 'utf8');
    expect(text).not.toContain(CANARY);
    expect(text).toContain('[redacted]');
  });

  it('skips and counts corrupt lines', async () => {
    const t = temp();
    await appendProvenance(t.dir, 's1', { source: 'a', kind: 'web', content: 'x' });
    const { appendLine } = await import('../lib/store/ghost-store.mjs');
    await appendLine(sessionPaths(t.dir, 's1').provenance, '{"source":"a"');
    await appendLine(sessionPaths(t.dir, 's1').provenance, '{"source":"b","kind":"other","content":"y","extra":1}');
    await appendProvenance(t.dir, 's1', { source: 'c', kind: 'other', content: 'z' });
    const r = await readProvenance(t.dir, 's1');
    expect(r.log.map((x) => x.source)).toEqual(['a', 'c']);
    expect(r.corrupt).toBe(2);
    expect(readLines('').lines).toEqual([]);
  });

  it('reads a missing session as empty', async () => {
    const t = temp();
    expect(await readProvenance(t.dir, 'none')).toEqual({ log: [], corrupt: 0 });
  });
});

/** @param {string} runId */
function fakeResult(runId) {
  return /** @type {any} */ ({
    schemaVersion: 1,
    runId,
    status: 'completed',
    verdict: 'pass',
    isolation: { mode: 'docker' },
    phases: [],
    report: {
      snapshots: [{ id: 's0', result: 'ok', state: { rootPath: '/box/copy', entries: [] } }],
    },
  });
}

describe('run records', () => {
  it('writes a record and reads it by Run_Id and by Grave_Id', async () => {
    const t = temp();
    const w = await writeRunRecord(t.dir, fakeResult('run-1'));
    expect(w).toEqual({ ok: true, runId: 'run-1' });
    expect(existsSync(`${storePaths(t.dir).runs}/run-1.json`)).toBe(true);
    const a = await readRunRecord(t.dir, 'run-1');
    const b = await readRunRecord(t.dir, 'g-run-1');
    expect(a?.runId).toBe('run-1');
    expect(b).toEqual(a);
  });

  it('returns null for unknown or invalid ids and refuses an unsafe Run_Id', async () => {
    const t = temp();
    expect(await readRunRecord(t.dir, 'missing')).toBeNull();
    expect(await readRunRecord(t.dir, '../etc/passwd')).toBeNull();
    expect(await writeRunRecord(t.dir, fakeResult('../x'))).toEqual({ ok: false, failure: 'path-invalid' });
  });

  it('redacts canaries from the record', async () => {
    const t = temp();
    const r = fakeResult('run-2');
    r.report.snapshots[0].state.rootPath = `/box/${CANARY}`;
    await writeRunRecord(t.dir, r, [new TextEncoder().encode(CANARY)]);
    const text = readFileSync(`${storePaths(t.dir).runs}/run-2.json`, 'utf8');
    expect(text).not.toContain(CANARY);
  });
});

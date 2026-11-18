// Feature: ghost-runner, Property 2: Diff algebra
// Validates: Requirements 2.5, 11.5, 11.6, 11.7, 11.8, 11.9, 11.11, 11.12, 11.14, 12.2, 12.3, 12.8
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import type { Change } from '@ghost-run/core';
import { diff, diffDiagnostics, type DiffState } from '../src/fs/differ.js';
import { compareBytes, type ManifestEntry } from '../src/fs/manifest.js';
import type { SqliteState } from '../src/fs/sqlite.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const counts: Record<string, number> = {};
const bump = (k: string): void => {
  counts[k] = (counts[k] ?? 0) + 1;
};
afterAll(() => {
  console.log(
    `Property 2 runs executed: ${JSON.stringify(counts)} (mode=${PBT_MODE}, numRuns=${NUM_RUNS})`,
  );
});

const ALLOWED = ['file-created', 'file-overwritten', 'file-deleted', 'symlink-changed', 'sql-row-count'];

const PATHS = ['a', 'a/b', 'a/b/c.db', 'a/d', 'b', 'b/x.txt', 'c.db', 'é', 'z/y', 'app.db'];
const TABLES = ['users', 'orders', 'log'];

const entryArb = (path: string): fc.Arbitrary<ManifestEntry> =>
  fc
    .record({
      type: fc.constantFrom('file', 'file', 'dir', 'symlink', 'other'),
      size: fc.integer({ min: 0, max: 3 }),
      mode: fc.constantFrom(0o644, 0o755, 0o600),
      hash: fc.constantFrom('h1', 'h2'),
      target: fc.constantFrom('t1', 't2'),
    })
    .map(({ type, size, mode, hash, target }) => ({
      path,
      type,
      size,
      mode,
      mtimeNs: '1',
      ctimeNs: '1',
      ...(type === 'symlink' ? { target } : {}),
      ...(type === 'file' ? { hash } : {}),
    }));

const countsArb = fc.oneof(
  { weight: 5, arbitrary: fc.dictionary(fc.constantFrom(...TABLES), fc.integer({ min: 0, max: 3 })) },
  { weight: 1, arbitrary: fc.constant('unreadable' as const) },
);

const stateArb: fc.Arbitrary<DiffState> = fc
  .tuple(
    fc.tuple(...PATHS.map((p) => fc.option(entryArb(p), { nil: undefined }))),
    fc.dictionary(fc.constantFrom(...PATHS), countsArb),
  )
  .map(([es, sqlite]) => ({
    entries: es.filter((e): e is ManifestEntry => e !== undefined),
    sqlite: sqlite as SqliteState,
  }));

/** Nudge `b` towards `a` so that equal and near-equal pairs are frequent. */
const pairArb = fc
  .tuple(stateArb, stateArb, fc.boolean())
  .map(([a, b, near]): [DiffState, DiffState] => {
    if (!near) return [a, b];
    const entries = a.entries.map((e) => (e.path.length % 2 === 0 ? e : (b.entries.find((x) => x.path === e.path) ?? e)));
    return [a, { entries, sqlite: a.sqlite }];
  });

const sortKey = (c: Change): [string, string, string] => [String(c['path']), c.kind, String(c['table'] ?? '')];
const cmp = (x: Change, y: Change): number => {
  const [a, b] = [sortKey(x), sortKey(y)];
  return compareBytes(a[0], b[0]) || compareBytes(a[1], b[1]) || compareBytes(a[2], b[2]);
};

const sameContent = (a: ManifestEntry, b: ManifestEntry): boolean =>
  a.size === b.size && (a.hash === undefined || b.hash === undefined || a.hash === b.hash);

describe('Property 2: Diff algebra', () => {
  it('diff(a, a) is empty and no diagnostics are produced', () => {
    fc.assert(
      fc.property(stateArb, (a) => {
        bump('identity');
        expect(diff(a, a)).toEqual([]);
        expect(diffDiagnostics(a, a, 0).filter((d) => d.name === 'mode-changed')).toEqual([]);
      }),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('emits only allowed kinds, sorted by path then kind, deterministically', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        bump('kinds-sorted');
        const d = diff(a, b);
        for (const c of d) expect(ALLOWED).toContain(c.kind);
        for (let i = 1; i < d.length; i++) expect(cmp(d[i - 1] as Change, d[i] as Change)).toBeLessThanOrEqual(0);
        expect(diff(a, b)).toEqual(d);
      }),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('created paths of diff(a,b) equal deleted paths of diff(b,a); removed entries are deleted', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        bump('symmetry');
        const created = diff(a, b).filter((c) => c.kind === 'file-created').map((c) => String(c['path']));
        const deleted = diff(b, a).filter((c) => c.kind === 'file-deleted').map((c) => String(c['path']));
        expect(created).toEqual(deleted);
        const bp = new Set(b.entries.map((e) => e.path));
        const del = new Set(diff(a, b).filter((c) => c.kind === 'file-deleted').map((c) => String(c['path'])));
        for (const e of a.entries) if (!bp.has(e.path)) expect(del.has(e.path)).toBe(true);
      }),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('classifies per-path changes: overwritten, symlink-changed, mode-only is a Diagnostic', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        bump('classification');
        const d = diff(a, b);
        const diags = diffDiagnostics(a, b, 7);
        const bm = new Map(b.entries.map((e) => [e.path, e]));
        for (const ea of a.entries) {
          const eb = bm.get(ea.path);
          if (eb === undefined || eb.type !== ea.type) continue;
          const at = d.filter((c) => c['path'] === ea.path && c.kind !== 'sql-row-count');
          const modeDiags = diags.filter((x) => x.name === 'mode-changed' && x.path === ea.path);
          if (ea.type === 'file') {
            if (!sameContent(ea, eb)) {
              expect(at.map((c) => c.kind)).toEqual(['file-overwritten']);
              expect(modeDiags).toEqual([]);
            } else {
              expect(at).toEqual([]);
              expect(modeDiags.length).toBe(ea.mode === eb.mode ? 0 : 1);
            }
          } else if (ea.type === 'symlink') {
            expect(at.map((c) => c.kind)).toEqual(ea.target === eb.target ? [] : ['symlink-changed']);
            expect(modeDiags).toEqual([]);
          } else {
            expect(at).toEqual([]);
            expect(modeDiags.length).toBe(ea.mode === eb.mode ? 0 : 1);
          }
          if (modeDiags.length === 1) {
            const m = modeDiags[0]!;
            expect(m.stepIndex).toBe(7);
            expect(m.detail).toEqual({ modeBefore: ea.mode, modeAfter: eb.mode });
          }
        }
      }),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('sql-row-count: one Change per differing table, dropped only when the table is gone; unreadable is a Diagnostic', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        bump('sql');
        const d = diff(a, b);
        const diags = diffDiagnostics(a, b, 3);
        const afterPaths = new Set(b.entries.map((e) => e.path));
        const sqlChanges = d.filter((c) => c.kind === 'sql-row-count');
        const expected: Change[] = [];
        for (const path of new Set([...Object.keys(a.sqlite), ...Object.keys(b.sqlite)])) {
          const bc = a.sqlite[path];
          const ac = Object.hasOwn(b.sqlite, path) ? b.sqlite[path] : afterPaths.has(path) ? undefined : {};
          if (ac === undefined || ac === 'unreadable' || bc === 'unreadable') {
            expect(sqlChanges.filter((c) => c['path'] === path)).toEqual([]);
            continue;
          }
          const bt = bc ?? {};
          for (const table of new Set([...Object.keys(bt), ...Object.keys(ac)])) {
            const inB = table in bt;
            const inA = table in ac;
            const rb = bt[table] ?? 0;
            const ra = ac[table] ?? 0;
            if (inB && !inA) expected.push({ kind: 'sql-row-count', path, table, rowsBefore: rb, rowsAfter: 0, dropped: true });
            else if (rb !== ra || !inB) expected.push({ kind: 'sql-row-count', path, table, rowsBefore: rb, rowsAfter: ra });
          }
        }
        expect([...sqlChanges].sort(cmp)).toEqual(expected.sort(cmp));
        for (const c of sqlChanges) {
          if (c['dropped'] === true) expect(c['rowsAfter']).toBe(0);
          else expect('dropped' in c).toBe(false);
        }
        // Unreadable: at most one Diagnostic per path, never a sql-row-count Change.
        const unreadDiags = diags.filter((x) => x.name === 'sqlite-unreadable');
        expect(new Set(unreadDiags.map((x) => x.path)).size).toBe(unreadDiags.length);
        for (const x of unreadDiags) {
          expect(b.sqlite[x.path ?? '']).toBe('unreadable');
          expect(x.stepIndex).toBe(3);
        }
        for (const [path, c] of Object.entries(b.sqlite)) {
          if (c === 'unreadable' && a.sqlite[path] !== 'unreadable') {
            expect(unreadDiags.some((x) => x.path === path)).toBe(true);
          }
        }
      }),
      pbtParams(),
    );
  }, testTimeoutMs(false));
});

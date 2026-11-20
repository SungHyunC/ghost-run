// Example and property tests of the mirror stage model (src/stage/stage-model.ts).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Change, ObservedEvent } from '@ghost-run/core';
import { NUM_RUNS } from '../pbt-config';
import { barsFor, barsLeft, buildStage } from '../../src/stage/stage-model';

const before = {
  project: 'demo',
  files: [
    { path: '.env', type: 'file', size: 25 },
    { path: 'app.db', type: 'file', size: 57344 },
    { path: 'data', type: 'directory', size: 0 },
    { path: 'data/a.csv', type: 'file', size: 23 },
  ],
  databases: [{ path: 'app.db', tables: [{ name: 'users', rows: 1206 }, { name: 'orders', rows: 3 }] }],
};

describe('buildStage', () => {
  it('marks a dropped table and keeps the other table as it was', () => {
    const after = { ...before, databases: [{ path: 'app.db', tables: [{ name: 'orders', rows: 3 }] }] };
    const changes: Change[] = [
      { kind: 'file-overwritten', path: 'app.db' },
      { kind: 'sql-row-count', path: 'app.db', table: 'users', rowsBefore: 1206, rowsAfter: 0, dropped: true },
    ];
    const m = buildStage({ before, after, changes, events: [], effects: [] });
    expect(m.tables).toEqual([
      { database: 'app.db', name: 'users', before: 1206, after: 0, dropped: true },
      { database: 'app.db', name: 'orders', before: 3, after: 3, dropped: false },
    ]);
    expect(m.entries.find((e) => e.path === 'app.db')).toMatchObject({ status: 'changed', database: true });
    expect(m.egress).toEqual([]);
    expect(m.differences).toBe(2);
  });

  it('marks deleted paths, keeps them in the picture, and nests them by depth', () => {
    const after = { ...before, files: before.files.filter((f) => !f.path.startsWith('data')) };
    const changes: Change[] = [
      { kind: 'file-deleted', path: 'data' },
      { kind: 'file-deleted', path: 'data/a.csv' },
    ];
    const m = buildStage({ before, after, changes, events: [], effects: [] });
    expect(m.entries.map((e) => [e.path, e.status, e.depth])).toEqual([
      ['.env', 'same', 0],
      ['app.db', 'same', 0],
      ['data', 'deleted', 0],
      ['data/a.csv', 'deleted', 1],
    ]);
  });

  it('links a network attempt to the secret read in the same step', () => {
    const events: ObservedEvent[] = [
      { kind: 'secret-read', path: '.env', stepIndex: 0 },
      { kind: 'network-attempt', destination: 'setup-check.example:443', stepIndex: 0, eventId: 'evt-1' },
    ];
    const m = buildStage({
      before,
      after: before,
      changes: [],
      events,
      effects: [{ kind: 'network', destination: 'https://setup-check.example' }],
    });
    expect(m.egress).toEqual([{ destination: 'setup-check.example:443', secrets: ['.env'] }]);
    expect(m.entries.find((e) => e.path === '.env')?.secretRead).toBe(true);
  });

  it('falls back to the effects when no network attempt was observed', () => {
    const m = buildStage({
      before,
      after: before,
      changes: [],
      events: [],
      effects: [{ kind: 'network', destination: 'https://registry.example' }],
    });
    expect(m.egress).toEqual([{ destination: 'https://registry.example', secrets: [] }]);
  });

  it('shows a file the plan created only in the copy', () => {
    const after = { ...before, files: [...before.files, { path: 'app.db.bak', type: 'file', size: 57344 }] };
    const m = buildStage({ before, after, changes: [{ kind: 'file-created', path: 'app.db.bak' }], events: [], effects: [] });
    expect(m.entries.find((e) => e.path === 'app.db.bak')).toMatchObject({ status: 'created', inReality: false });
  });

  it('reads nothing from a scene of another shape', () => {
    const m = buildStage({ before: 'x', after: null, changes: [], events: [], effects: [] });
    expect(m).toEqual({ entries: [], tables: [], egress: [], differences: 0 });
  });

  it('lists every path of both scenes exactly once, in path order', () => {
    const pathArb = fc.stringMatching(/^[a-z]{1,4}(\/[a-z]{1,4}){0,2}$/);
    fc.assert(
      fc.property(fc.uniqueArray(pathArb, { maxLength: 12 }), fc.uniqueArray(pathArb, { maxLength: 12 }), (a, b) => {
        const scene = (paths: string[]) => ({ files: paths.map((p) => ({ path: p, type: 'file', size: 1 })) });
        const m = buildStage({ before: scene(a), after: scene(b), changes: [], events: [], effects: [] });
        const paths = m.entries.map((e) => e.path);
        expect(paths).toEqual([...new Set([...a, ...b])].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
        for (const e of m.entries) {
          if (a.includes(e.path) && !b.includes(e.path)) expect(e.status).toBe('deleted');
          if (!a.includes(e.path)) expect(e.status).toBe('created');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('row bars', () => {
  it('uses one bar per row up to eight', () => {
    expect([0, 1, 3, 8, 1206].map(barsFor)).toEqual([0, 1, 3, 8, 8]);
  });

  it('keeps bars in proportion and at least one while a row is left', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 5000 }), (before, after) => {
        const left = barsLeft(before, after);
        if (after === 0) expect(left).toBe(0);
        else expect(left).toBeGreaterThanOrEqual(1);
        expect(left).toBeLessThanOrEqual(8);
        if (after <= before) expect(left).toBeLessThanOrEqual(barsFor(before));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

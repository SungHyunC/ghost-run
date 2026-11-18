import { describe, expect, it } from 'vitest';
import { diffStates } from '../src/vfs/diff.js';
import { fingerprintState } from '../src/vfs/fingerprint.js';
import { LimitError, StateFs } from '../src/vfs/mutable-fs.js';
import { renderScene } from '../src/vfs/scene.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import './support/setup.js';

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);
const file = (b: Uint8Array, tables?: Record<string, number>): Entry =>
  tables === undefined ? { kind: 'file', bytes: b } : { kind: 'file', bytes: b, tables };
const st = (entries: Record<string, Entry>): PlaygroundState => ({ entries });

describe('StateFs', () => {
  const base = st({
    a: { kind: 'dir' },
    'a/x.txt': file(bytes(1)),
    'a/b': { kind: 'dir' },
    'a/b/y.txt': file(bytes(2, 3)),
    'z.txt': file(bytes(4)),
  });

  it('lists, walks, and reads in code-point order', () => {
    const fs = new StateFs(base);
    expect(fs.list('')).toEqual(['a', 'z.txt']);
    expect(fs.list('a')).toEqual(['b', 'x.txt']);
    expect(fs.walk('a')).toEqual(['a', 'a/b', 'a/b/y.txt', 'a/x.txt']);
    expect(fs.get('')).toEqual({ kind: 'dir' });
    expect(fs.get('nope')).toBeUndefined();
  });

  it('does not share bytes with the input state or with get()', () => {
    const fs = new StateFs(base);
    const got = fs.get('z.txt');
    if (got?.kind === 'file') got.bytes[0] = 99;
    fs.putFile('z.txt', bytes(7));
    expect((base.entries['z.txt'] as { bytes: Uint8Array }).bytes[0]).toBe(4);
    expect(fs.get('z.txt')).toEqual(file(bytes(7)));
  });

  it('removes a directory with its descendants and rolls back', () => {
    const fs = new StateFs(base);
    const m = fs.mark();
    fs.remove('a');
    fs.putFile('new.txt', bytes(1));
    expect(fs.walk('a')).toEqual([]);
    fs.rollback(m);
    expect(fs.toState()).toEqual(base);
  });

  it('enforces the entry, file and total limits', () => {
    const many: Record<string, Entry> = {};
    for (let i = 0; i < 2000; i++) many[`f${i}`] = { kind: 'dir' };
    const fs = new StateFs(st(many));
    expect(() => fs.putDir('extra')).toThrow(LimitError);
    fs.putDir('f1');
    expect(() => new StateFs(st({})).putFile('big', new Uint8Array(1024 * 1024 + 1))).toThrow(
      /file-size/,
    );
    const fat = new StateFs(st({}));
    for (let i = 0; i < 16; i++) fat.putFile(`b${i}`, new Uint8Array(1024 * 1024));
    expect(() => fat.putFile('b16', new Uint8Array(1))).toThrow(/total-size/);
    fat.putFile('b0', new Uint8Array(1));
    fat.putFile('b16', new Uint8Array(1));
  });
});

describe('diffStates', () => {
  it('reports created, deleted, overwritten, and ignores equal bytes', () => {
    const before = st({ d: { kind: 'dir' }, 'd/f': file(bytes(1)), same: file(bytes(5)) });
    const after = st({ 'd/f': file(bytes(1, 2)), same: file(bytes(5)), n: file(bytes()) });
    expect(diffStates(before, after)).toEqual([
      { kind: 'file-deleted', path: 'd', entryType: 'directory' },
      { kind: 'file-overwritten', path: 'd/f', sizeBefore: 1, sizeAfter: 2 },
      { kind: 'file-created', path: 'n', entryType: 'file' },
    ]);
  });

  it('treats a directory-to-file swap as created then deleted at one path', () => {
    const out = diffStates(st({ p: { kind: 'dir' } }), st({ p: file(bytes(1)) }));
    expect(out).toEqual([
      { kind: 'file-created', path: 'p', entryType: 'file' },
      { kind: 'file-deleted', path: 'p', entryType: 'directory' },
    ]);
  });

  it('emits sql-row-count only for a database present on both sides', () => {
    const before = st({
      'db.db': file(bytes(1), { users: 10, logs: 3, gone: 2 }),
      'old.db': file(bytes(1), { t: 5 }),
    });
    const after = st({
      'db.db': file(bytes(2), { users: 4, logs: 3, fresh: 9 }),
      'moved.db': file(bytes(1), { t: 5 }),
    });
    const out = diffStates(before, after);
    expect(out.filter((c) => c.kind === 'sql-row-count')).toEqual([
      { kind: 'sql-row-count', path: 'db.db', table: 'gone', rowsBefore: 2, rowsAfter: 0, dropped: true },
      { kind: 'sql-row-count', path: 'db.db', table: 'users', rowsBefore: 10, rowsAfter: 4 },
    ]);
    expect(out.map((c) => c.kind)).not.toContain('symlink-changed');
  });

  it('is empty for equal states', () => {
    const s = st({ a: file(bytes(1), { t: 1 }) });
    expect(diffStates(s, structuredClone(s))).toEqual([]);
  });
});

describe('renderScene', () => {
  it('lists files and tables without content', () => {
    const scene = renderScene(
      st({ b: file(bytes(1, 2)), a: { kind: 'dir' }, 'x.db': file(bytes(1), { t: 2, a: 1 }) }),
      'proj',
    );
    expect(scene).toEqual({
      project: 'proj',
      files: [
        { path: 'a', type: 'directory', size: 0 },
        { path: 'b', type: 'file', size: 2 },
        { path: 'x.db', type: 'file', size: 1 },
      ],
      databases: [
        {
          path: 'x.db',
          tables: [
            { name: 'a', rows: 1 },
            { name: 't', rows: 2 },
          ],
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
  });
});

describe('fingerprintState', () => {
  it('is stable, and changes with one byte', async () => {
    const s = st({ d: { kind: 'dir' }, 'd/f': file(bytes(1, 2)) });
    const a = await fingerprintState(s);
    const b = await fingerprintState(structuredClone(s));
    const c = await fingerprintState(st({ d: { kind: 'dir' }, 'd/f': file(bytes(1, 3)) }));
    expect(a).toEqual(b);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(a.manifest)).toEqual(['d', 'd/f']);
    expect(c.hash).not.toBe(a.hash);
  });
});

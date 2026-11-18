import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffStates } from '../src/vfs/diff.js';
import { JournalFs } from '../src/vfs/journal-fs.js';
import { StateFs } from '../src/vfs/mutable-fs.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import './support/setup.js';

const read = (name: string): string =>
  readFileSync(new URL(`../src/vfs/${name}`, import.meta.url), 'utf8');
const importsOf = (src: string): string[] =>
  [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);
const file = (b: Uint8Array, tables?: Record<string, number>): Entry =>
  tables === undefined ? { kind: 'file', bytes: b } : { kind: 'file', bytes: b, tables };
const base: PlaygroundState = {
  entries: {
    d: { kind: 'dir' },
    'd/a.txt': file(bytes(1)),
    'd/sub': { kind: 'dir' },
    'd/sub/b.txt': file(bytes(2, 3)),
    'app.db': file(bytes(9), { users: 5, logs: 2 }),
    'keep.txt': file(bytes(4)),
  },
};

type Script = (fs: StateFs | JournalFs) => void;

function expectSame(script: Script): void {
  const state = new StateFs(base);
  script(state);
  const journal = new JournalFs(base);
  script(journal);
  expect(journal.changes()).toEqual(diffStates(base, state.toState()));
}

describe('journal independence', () => {
  it('journal-fs.ts and diff.ts do not import each other', () => {
    const journalImports = importsOf(read('journal-fs.ts'));
    const diffImports = importsOf(read('diff.ts'));
    expect(journalImports.some((i) => /(^|\/)diff(\.js)?$/.test(i))).toBe(false);
    expect(diffImports.some((i) => /journal-fs(\.js)?$/.test(i))).toBe(false);
    expect(read('journal-fs.ts')).not.toContain('diffStates');
  });

  it('create', () => expectSame((fs) => fs.putFile('new.txt', bytes(1, 2))));
  it('overwrite', () => expectSame((fs) => fs.putFile('keep.txt', bytes(7, 7))));
  it('overwrite with identical bytes is no change', () =>
    expectSame((fs) => fs.putFile('keep.txt', bytes(4))));
  it('delete', () => expectSame((fs) => fs.remove('keep.txt')));
  it('move', () =>
    expectSame((fs) => {
      fs.putFile('moved.txt', bytes(4));
      fs.remove('keep.txt');
    }));
  it('directory delete', () => expectSame((fs) => fs.remove('d')));
  it('delete then recreate with the same content is no change', () =>
    expectSame((fs) => {
      fs.remove('keep.txt');
      fs.putFile('keep.txt', bytes(4));
    }));
  it('file replaced by a directory', () =>
    expectSame((fs) => {
      fs.remove('keep.txt');
      fs.putDir('keep.txt');
    }));
  it('row-count change and dropped table', () =>
    expectSame((fs) => fs.putFile('app.db', bytes(8), { users: 3 })));

  it('rollback truncates the operation list', () => {
    const journal = new JournalFs(base);
    journal.putFile('x.txt', bytes(1));
    const mark = journal.mark();
    journal.remove('d');
    journal.putFile('y.txt', bytes(2));
    journal.rollback(mark);
    expect(journal.operations()).toHaveLength(1);
    expect(journal.get('d')).toEqual({ kind: 'dir' });
    expect(journal.get('y.txt')).toBeUndefined();
    expect(journal.changes()).toEqual([{ kind: 'file-created', path: 'x.txt', entryType: 'file' }]);
  });
});

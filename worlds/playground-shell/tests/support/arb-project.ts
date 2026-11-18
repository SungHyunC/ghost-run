import fc from 'fast-check';
import type { Entry, VirtualPath, VirtualProject } from '../../src/state.js';

const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,5}$/);

/** One path-argument segment, including the awkward ones. */
const argSegment = fc.oneof(
  { weight: 4, arbitrary: segment },
  { weight: 1, arbitrary: fc.constant('.') },
  { weight: 1, arbitrary: fc.constant('..') },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.constant('~') },
);

/** Path arguments: optional leading '/', segments joined by '/'. */
export const arbPathArg: fc.Arbitrary<string> = fc
  .tuple(fc.boolean(), fc.array(argSegment, { maxLength: 6 }))
  .map(([abs, segs]) => (abs ? '/' : '') + segs.join('/'));

/** Canonical virtual paths (no '.', '..', or empty segments). '' is the root. */
export const arbVirtualPath: fc.Arbitrary<VirtualPath> = fc
  .array(segment, { maxLength: 4 })
  .map((segs) => segs.join('/'));

const arbBytes = fc.uint8Array({ maxLength: 16 });
const arbTables = fc.dictionary(segment, fc.nat({ max: 50 }), { maxKeys: 3 });

/** Projects: directories, files with small bytes, and at most one database entry. */
export const arbVirtualProject: fc.Arbitrary<VirtualProject> = fc
  .record({
    dirs: fc.uniqueArray(fc.array(segment, { minLength: 1, maxLength: 3 }), {
      maxLength: 5,
      selector: (s) => s.join('/'),
    }),
    files: fc.array(fc.tuple(fc.nat({ max: 5 }), segment, arbBytes), { maxLength: 8 }),
    db: fc.option(fc.tuple(segment, arbTables), { nil: undefined }),
    name: segment,
  })
  .map(({ dirs, files, db, name }) => {
    const entries: Record<VirtualPath, Entry> = {};
    const dirPaths: string[] = [''];
    for (const segs of dirs) {
      for (let i = 1; i <= segs.length; i++) {
        const p = segs.slice(0, i).join('/');
        entries[p] = { kind: 'dir' };
        if (!dirPaths.includes(p)) dirPaths.push(p);
      }
    }
    const put = (parent: string, leaf: string, entry: Entry): void => {
      const path = parent === '' ? leaf : `${parent}/${leaf}`;
      if (entries[path] === undefined) entries[path] = entry;
    };
    for (const [pick, leaf, bytes] of files) {
      put(dirPaths[pick % dirPaths.length] as string, `${leaf}.txt`, { kind: 'file', bytes });
    }
    if (db !== undefined) {
      put('', `${db[0]}.db`, { kind: 'file', bytes: new Uint8Array([83, 81, 76]), tables: db[1] });
    }
    return { name, entries };
  });

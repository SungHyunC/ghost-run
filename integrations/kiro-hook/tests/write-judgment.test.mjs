import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELF_PROTECT_NOTICE } from '../lib/gate/self-protect.mjs';
import {
  HIDDEN_TEXT_NOTICE,
  TOO_LARGE_NOTICE,
  createNodeFsView,
  judgeWrite,
} from '../lib/gate/write-judgment.mjs';

const ROOT = '/ws';
/** @type {import('@ghost-run/core').WardSet} */
const wardSet = {
  wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**', '.env'] }],
};

/**
 * In-memory tree. Values: string (file), { dir: true }, { link: '<abs target>' }.
 * @param {Record<string, any>} nodes
 */
function memFs(nodes) {
  /** @type {Map<string, any>} */
  const tree = new Map(Object.entries({ '/ws': { dir: true }, ...nodes }));
  /** @param {string} p */
  const resolveLinks = (p) => {
    const parts = p.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length; i++) {
      cur = `${cur}/${parts[i]}`;
      const n = tree.get(cur);
      if (n && typeof n === 'object' && 'link' in n) {
        return resolveLinks([n.link, ...parts.slice(i + 1)].join('/'));
      }
    }
    return cur === '' ? '/' : cur;
  };
  /** @param {any} n */
  const stat = (n) => ({
    isSymbolicLink: () => typeof n === 'object' && 'link' in n,
    isDirectory: () => typeof n === 'object' && 'dir' in n,
    size: typeof n === 'string' ? n.length : 0,
  });
  return {
    /** @param {string} p */
    async lstat(p) {
      const i = p.lastIndexOf('/');
      const parent = i <= 0 ? '/' : p.slice(0, i);
      const real = parent === '/' ? p : `${resolveLinks(parent)}${p.slice(i)}`;
      const n = tree.get(real);
      return n === undefined ? null : stat(n);
    },
    /** @param {string} p */
    async realpath(p) {
      const r = resolveLinks(p);
      return tree.has(r) ? r : null;
    },
    /** @param {string} p */
    async readdir(p) {
      const dir = resolveLinks(p);
      const prefix = dir === '/' ? '/' : `${dir}/`;
      return [...tree.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}

/**
 * @param {string} toolName
 * @param {string[]} targets
 * @param {string[]} [texts]
 * @returns {[import('../lib/event.mjs').Classification, import('../lib/gate/write-judgment.mjs').WriteContext]}
 */
const call = (toolName, targets, texts = []) => [
  { class: 'write', targets, texts },
  { root: ROOT, wardSet, toolName },
];

describe('judgeWrite', () => {
  const fs = memFs({
    '/ws/src': { dir: true },
    '/ws/src/a.ts': 'abc',
    '/ws/data': { dir: true },
    '/ws/data/x.db': 'zz',
    '/ws/link': { link: '/ws/data' },
    '/ws/.kiro': { dir: true },
    '/ws/d3': { dir: true },
    '/ws/d3/a': 'a',
    '/ws/d3/b': 'b',
    '/ws/d3/c': 'c',
  });

  it('create gives file-created and pass', async () => {
    const [c, x] = call('fs_write', ['src/new.ts'], ['x']);
    const r = await judgeWrite(c, x, fs);
    expect(r.verdict).toBe('pass');
    expect(r.changes).toEqual([{ kind: 'file-created', path: 'src/new.ts' }]);
  });

  it('overwrite gives file-overwritten with sizes', async () => {
    const [c, x] = call('fs_write', ['src/a.ts'], ['hello']);
    const r = await judgeWrite(c, x, fs);
    expect(r.changes).toEqual([{ kind: 'file-overwritten', path: 'src/a.ts', sizeBefore: 3, sizeAfter: 5 }]);
    expect(r.verdict).toBe('pass');
  });

  it('delete of a protected file blocks, for every spelling', async () => {
    for (const t of ['data/x.db', './data/../data/x.db', 'data//x.db', 'DATA/x.db', '/ws/data/x.db']) {
      const [c, x] = call('delete_file', [t]);
      expect((await judgeWrite(c, x, fs)).verdict, t).toBe('block');
    }
  });

  it('delete of a directory with 3 entries gives 4 deletions', async () => {
    const [c, x] = call('delete_file', ['d3']);
    const r = await judgeWrite(c, x, fs);
    expect(r.changes.map((ch) => ch['path']).sort()).toEqual(['d3', 'd3/a', 'd3/b', 'd3/c']);
    expect(r.verdict).toBe('pass');
  });

  it('a directory with 10,001 entries gives warn with the notice', async () => {
    /** @type {Record<string, any>} */
    const nodes = { '/ws/big': { dir: true } };
    for (let i = 0; i <= 10_000; i++) nodes[`/ws/big/f${i}`] = 'x';
    const [c, x] = call('delete_file', ['big']);
    const r = await judgeWrite(c, x, memFs(nodes));
    expect(r.verdict).toBe('warn');
    expect(r.notices).toContain(TOO_LARGE_NOTICE);
  });

  it('a directory with exactly 10,000 entries is enumerated fully', async () => {
    /** @type {Record<string, any>} */
    const nodes = { '/ws/big': { dir: true } };
    for (let i = 0; i < 10_000; i++) nodes[`/ws/big/f${i}`] = 'x';
    const [c, x] = call('delete_file', ['big']);
    const r = await judgeWrite(c, x, memFs(nodes));
    expect(r.verdict).toBe('pass');
    expect(r.changes).toHaveLength(10_001);
  });

  it('a path outside the workspace warns with a file-write effect and skips wards', async () => {
    const [c, x] = call('fs_write', ['../elsewhere/data/x', '/other/hosts.test']);
    const r = await judgeWrite(c, x, fs);
    expect(r.verdict).toBe('warn');
    expect(r.changes).toEqual([]);
    expect(r.report?.effectsOutside[0]?.map((e) => e.kind)).toEqual(['file-write', 'file-write']);
  });

  it('a write through a link to data/ is judged on the real path', async () => {
    const [c, x] = call('fs_write', ['link/x.db'], ['n']);
    const r = await judgeWrite(c, x, fs);
    expect(r.verdict).toBe('block');
    expect(r.changes.map((ch) => ch['path']).sort()).toEqual(['data/x.db', 'link/x.db']);
  });

  it('a missing file behind a link to data/ is judged against the real path', async () => {
    const [c, x] = call('delete_file', ['link/missing']);
    expect((await judgeWrite(c, x, fs)).verdict).toBe('block');
  });

  it('a .kiro write with a hidden character warns without printing it', async () => {
    const [c, x] = call('fs_write', ['.kiro/steering/a.md'], ['ok\u200Bhidden']);
    const r = await judgeWrite(c, x, fs);
    expect(r.verdict).toBe('warn');
    expect(r.notices).toEqual([HIDDEN_TEXT_NOTICE]);
    const [c2, x2] = call('fs_write', ['.kiro/steering/a.md'], ['plain']);
    expect((await judgeWrite(c2, x2, fs)).verdict).toBe('pass');
  });

  it('a Self_Protected_Path gives warn with the notice; the Wards_File too', async () => {
    const [c, x] = call('fs_write', ['integrations/kiro-hook/lib/a.mjs'], ['x']);
    const r = await judgeWrite(c, x, fs);
    expect(r.verdict).toBe('warn');
    expect(r.notices).toEqual([SELF_PROTECT_NOTICE]);
    const w = await judgeWrite(
      { class: 'write', targets: ['conf/w.yaml'], texts: [] },
      { root: ROOT, wardSet, toolName: 'fs_write', wardsFile: '/ws/conf/w.yaml' },
      fs,
    );
    expect(w.verdict).toBe('warn');
  });

  it('the strictest target wins', async () => {
    const [c, x] = call('fs_write', ['src/new.ts', 'data/x.db']);
    expect((await judgeWrite(c, x, fs)).verdict).toBe('block');
  });

  it('a read-only code call passes; a deny classification does not', async () => {
    const ro = await judgeWrite({ class: 'read-only', targets: [], texts: [] }, { root: ROOT, wardSet, toolName: 'code' }, fs);
    expect(ro.verdict).toBe('pass');
    const d = await judgeWrite({ class: 'deny', targets: [], texts: [] }, { root: ROOT, wardSet, toolName: 'x' }, fs);
    expect(d.verdict).toBe('block');
  });
});

describe('createNodeFsView', () => {
  it('reads a real temporary tree and returns null for missing paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wj-'));
    try {
      await mkdir(join(dir, 'd'));
      await writeFile(join(dir, 'd', 'f'), 'abc');
      await symlink(join(dir, 'd'), join(dir, 'l'));
      const v = createNodeFsView();
      expect((await v.lstat(join(dir, 'l')))?.isSymbolicLink()).toBe(true);
      expect(await v.lstat(join(dir, 'nope'))).toBeNull();
      expect(await v.realpath(join(dir, 'nope'))).toBeNull();
      expect(await v.readdir(join(dir, 'd'))).toEqual(['f']);
      const r = await judgeWrite(
        { class: 'write', targets: ['l/f'], texts: ['x'] },
        {
          root: dir,
          wardSet: { wards: [{ id: 'p', kind: 'path', deny: ['overwrite'], paths: ['d/**'] }] },
          toolName: 'fs_write',
        },
        v,
      );
      expect(r.verdict).toBe('block');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

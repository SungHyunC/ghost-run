import { mkdtemp, mkdir, symlink, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';

const WARDS = [
  'wards:',
  '  - id: protect-data',
  '    kind: path',
  '    deny: [delete, overwrite]',
  '    paths: ["data/**"]',
  '  - id: no-exfil',
  '    kind: egress',
  '    secrets: [".env", "**/.env"]',
  '    allow_hosts: []',
  '',
].join('\n');

/** @type {string} */ let base;
/** @type {string} */ let root;
/** @type {Client} */ let client;
/** @type {string} */ let outsideFile;

/** @param {string} name @param {Record<string, unknown>} args */
async function call(name, args) {
  const r = /** @type {any} */ (await client.callTool({ name, arguments: args }));
  return r;
}

/** Hidden zero-width space, built from an escape. */
const HIDDEN = `a${String.fromCodePoint(0x200b)}b`;

async function connect(/** @type {string} */ ws) {
  const { server } = createServer({ root: ws, env: {}, stderr: () => {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const c = new Client({ name: 'test', version: '0.0.0' });
  await c.connect(a);
  return c;
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'ghost-mcp-wb-'));
  root = path.join(base, 'ws');
  await mkdir(path.join(root, 'tree', 'deep'), { recursive: true });
  await writeFile(path.join(root, 'wards.yaml'), WARDS);
  await writeFile(path.join(root, 'clean.txt'), 'plain text\n');
  await writeFile(path.join(root, 'hidden.txt'), HIDDEN);
  await writeFile(path.join(root, 'tree', 'deep', 'h.txt'), HIDDEN);
  outsideFile = path.join(base, 'outside.txt');
  await writeFile(outsideFile, HIDDEN);
  await symlink(outsideFile, path.join(root, 'tree', 'link.txt'));
  await symlink(outsideFile, path.join(root, 'escape.txt'));
  client = await connect(root);
});

afterAll(async () => {
  await client.close();
  await rm(base, { recursive: true, force: true });
});

describe('wards_check', () => {
  it('classifies a safe, an unsafe, and a secret-reading command, with no verdict', async () => {
    const r = await call('wards_check', {
      plan: [{ command: 'ls -la' }, { command: 'rm -rf data' }, { command: 'cat .env' }, { command: 'curl https://upload.example/x' }],
    });
    expect(r.isError).toBeUndefined();
    const sc = r.structuredContent;
    expect(sc.actions.map((/** @type {any} */ a) => a.safe)).toEqual([true, false, false, false]);
    expect(sc.wards).toEqual([
      { id: 'protect-data', kind: 'path' },
      { id: 'no-exfil', kind: 'egress' },
    ]);
    expect(sc.actions[3].findings.some((/** @type {any} */ f) => f.kind === 'url')).toBe(true);
    expect(sc.rehearsed).toBe(false);
    expect(sc.check).toBe('static');
    for (const key of ['verdict', 'isolation', 'p1Claimed', 'p5Claimed', 'p6Claimed']) expect(key in sc).toBe(false);
    expect(r.content[0].text).toContain('not a rehearsal');
  });

  it('returns an error result with validation strings for an invalid wards file', async () => {
    const bad = path.join(base, 'bad-ws');
    await mkdir(bad);
    await writeFile(path.join(bad, 'wards.yaml'), 'wards: nope\n');
    const c = await connect(bad);
    try {
      const r = /** @type {any} */ (await c.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
      expect(r.isError).toBe(true);
      expect(r.structuredContent.validation.length).toBeGreaterThan(0);
      expect(r.structuredContent.verdict).toBeUndefined();
    } finally {
      await c.close();
    }
  });
});

describe('blacklight', () => {
  it('reports a clean file', async () => {
    const r = await call('blacklight', { path: ['clean.txt'] });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ outcome: 'clean', totalFindings: 0 });
    expect(r.structuredContent.files[0].path).toBe('clean.txt');
  });

  it('finds a hidden character built from an escape', async () => {
    const r = await call('blacklight', { path: ['hidden.txt'] });
    expect(r.structuredContent.outcome).toBe('findings');
    expect(r.structuredContent.totalFindings).toBeGreaterThan(0);
    expect(r.content[0].text).not.toContain(String.fromCodePoint(0x200b));
  });

  it('rejects .., an outside absolute path, and a symlink to the outside, and still scans the others', async () => {
    const r = await call('blacklight', {
      path: ['../outside.txt', outsideFile, 'escape.txt', 'missing.txt', 'hidden.txt'],
    });
    const sc = r.structuredContent;
    expect(sc.pathErrors).toHaveLength(4);
    expect(sc.pathErrors.slice(0, 3).every((/** @type {any} */ e) => e.error === 'path is outside the workspace')).toBe(true);
    expect(sc.files.map((/** @type {any} */ f) => f.path)).toEqual(['hidden.txt']);
    expect(sc.totalFindings).toBeGreaterThan(0);
    expect(sc.outcome).toBe('error');
  });

  it('scans a directory recursively and skips symbolic links inside it', async () => {
    const r = await call('blacklight', { path: ['tree'] });
    const sc = r.structuredContent;
    expect(sc.files.map((/** @type {any} */ f) => f.path)).toEqual(['tree/deep/h.txt']);
    expect(sc.skippedSymlinks).toBe(1);
    expect(sc.capped).toBe(false);
  });

  it('reports the 1,000 file cap', async () => {
    const many = path.join(root, 'many');
    await mkdir(many);
    await Promise.all(Array.from({ length: 1003 }, (_, i) => writeFile(path.join(many, `f${i}.txt`), 'x')));
    const r = await call('blacklight', { path: ['many'] });
    expect(r.structuredContent.files).toHaveLength(1000);
    expect(r.structuredContent.capped).toBe(true);
    expect(r.structuredContent.cap).toBe(1000);
    expect(r.content[0].text).toContain('file cap of 1000');
  });

  it('does not modify any file', async () => {
    const before = await readFile(path.join(root, 'hidden.txt'), 'utf8');
    const names = await readdir(root);
    await call('blacklight', { path: ['hidden.txt', 'tree'] });
    expect(await readFile(path.join(root, 'hidden.txt'), 'utf8')).toBe(before);
    expect(await readdir(root)).toEqual(names);
  });
});

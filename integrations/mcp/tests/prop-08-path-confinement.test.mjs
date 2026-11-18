// Feature: kiro-integration, Property 8: Path confinement (task 14.7, KI-P8). No Docker needed [no-docker].
// **Validates: Requirements 19.9, 19.10, 19.11**
// The blacklight tool runs against a temporary workspace that holds symbolic links to outside paths.
// A file-system spy (a vi.mock wrapper around node:fs/promises) records every readFile and open call.
// Hidden code points are built from code points only; none appear literally in this file.
import fc from 'fast-check';
import { mkdtemp, mkdir, rm, symlink, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';

/** @type {{ readFile: string[], open: string[] }} */
const spy = vi.hoisted(() => ({ readFile: [], open: [] }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = /** @type {typeof import('node:fs/promises')} */ (await importOriginal());
  const wrapped = {
    ...actual,
    readFile: (/** @type {any} */ p, /** @type {any[]} */ ...rest) => {
      spy.readFile.push(String(p));
      return /** @type {any} */ (actual.readFile)(p, ...rest);
    },
    open: (/** @type {any} */ p, /** @type {any[]} */ ...rest) => {
      spy.open.push(String(p));
      return /** @type {any} */ (actual.open)(p, ...rest);
    },
  };
  return { ...wrapped, default: wrapped };
});


const NUM_RUNS = process.env.GHOST_PBT_MODE === 'nightly' ? 10_000 : 100;
const FC_PARAMS = Object.freeze({ numRuns: NUM_RUNS, verbose: 1 });
const HIDDEN = `a${String.fromCodePoint(0x200b)}b`;

/** @type {string} */ let base;
/** @type {string} */ let root;
/** @type {string} */ let realRoot;
/** @type {Client} */ let client;
let executed = 0;

beforeAll(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), 'ghost-mcp-p8-')));
  root = path.join(base, 'ws');
  const outside = path.join(base, 'outside');
  await mkdir(path.join(root, 'sub', 'deep'), { recursive: true });
  await mkdir(path.join(outside, 'dir'), { recursive: true });
  await writeFile(path.join(root, 'in-clean.txt'), 'plain\n');
  await writeFile(path.join(root, 'in-hidden.txt'), HIDDEN);
  await writeFile(path.join(root, 'sub', 'deep', 'in-deep.txt'), HIDDEN);
  await writeFile(path.join(outside, 'secret.txt'), HIDDEN);
  await writeFile(path.join(outside, 'dir', 'inner.txt'), HIDDEN);
  // Symbolic links to outside paths: file, directory, a link chain, a link inside a scanned directory,
  // and a link that points back inside the root.
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'link-file'));
  await symlink(path.join(outside, 'dir'), path.join(root, 'link-dir'));
  await symlink(path.join(root, 'link-file'), path.join(root, 'link-chain'));
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'sub', 'link-inner'));
  await symlink(path.join(root, 'in-hidden.txt'), path.join(root, 'link-inside'));
  realRoot = await realpath(root);

  const { server } = createServer({ root, env: {}, stderr: () => {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(a);
});

afterAll(async () => {
  await client.close();
  await rm(base, { recursive: true, force: true });
});

/** @param {string} p */
const isInside = (p) => p === realRoot || p.startsWith(realRoot + path.sep);

/** Known inside entries: each one must be scanned, whatever else is in the same call. */
const insideEntry = fc.constantFrom(
  { p: 'in-hidden.txt', scanned: ['in-hidden.txt'] },
  { p: 'in-clean.txt', scanned: ['in-clean.txt'] },
  { p: './sub/../in-hidden.txt', scanned: ['in-hidden.txt'] },
  { p: path.join(path.sep, 'placeholder'), scanned: ['in-hidden.txt'], absolute: 'in-hidden.txt' },
  { p: 'link-inside', scanned: ['in-hidden.txt'] },
  { p: 'sub', scanned: ['sub/deep/in-deep.txt'] },
);

const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
/** Known outside or unusable entries: each one must be refused and must never be read. */
const badEntry = fc.oneof(
  fc.constantFrom(
    '',
    'link-file',
    'link-dir',
    'link-dir/inner.txt',
    'link-chain',
    'sub/link-inner',
    '..',
    '../outside/secret.txt',
    '../outside/dir/inner.txt',
    'sub/../../outside/secret.txt',
    'missing-file.txt',
    'sub/missing/../../../outside/secret.txt',
    'a\0b',
  ),
  fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => `${'../'.repeat(s.length)}${s.join('/')}`),
  fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => `/${s.join('/')}`),
  fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => `${s.join('/')}.nonexistent`),
  fc.constantFrom('outside/secret.txt', 'outside/dir', '../outside').map((rel) => path.join(base, rel)),
);

/** @param {{ p: string, scanned: readonly string[], absolute?: string }} e */
const resolveInside = (e) => (e.absolute === undefined ? e : { ...e, p: path.join(root, e.absolute) });

const arg = fc.oneof(
  insideEntry.map((e) => ({ kind: /** @type {const} */ ('inside'), entry: resolveInside(e) })),
  badEntry.map((p) => ({ kind: /** @type {const} */ ('bad'), p })),
);

describe('Property 8: Path confinement (KI-P8)', { timeout: 120_000 }, () => {
  it('never reads a real path outside the root, and still scans the other paths of the same call', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arg, { minLength: 1, maxLength: 8 }), async (items) => {
        spy.readFile.length = 0;
        spy.open.length = 0;
        const paths = items.map((i) => (i.kind === 'inside' ? i.entry.p : i.p));
        const r = /** @type {any} */ (await client.callTool({ name: 'blacklight', arguments: { path: paths } }));
        executed += 1;

        // Every readFile and open call received a path whose real path is inside the root.
        const calls = [...spy.readFile, ...spy.open];
        for (const p of calls) {
          const real = await realpath(p);
          expect(isInside(real), `read of ${p} resolves to ${real}`).toBe(true);
        }

        const sc = r.structuredContent;
        const scannedPaths = sc.files.map((/** @type {{ path: string }} */ f) => f.path);
        // Outside files never appear among the scanned files (the refused path itself is echoed only as an error).
        for (const f of sc.files) expect(f.path.startsWith('..') || path.isAbsolute(f.path)).toBe(false);

        // Every inside entry of the call is scanned, even when other entries were refused.
        const expected = new Set(items.flatMap((i) => (i.kind === 'inside' ? i.entry.scanned : [])));
        expect(new Set(scannedPaths)).toEqual(expected);
        expect(scannedPaths.length).toBe(expected.size);

        // Every refused entry yields a per-path error, and no outside path is scanned.
        const bad = items.filter((i) => i.kind === 'bad');
        expect(sc.pathErrors.length).toBe(bad.length);
        for (const e of sc.pathErrors) expect(typeof e.error).toBe('string');
        if (bad.length > 0) expect(sc.outcome).toBe('error');
      }),
      FC_PARAMS,
    );
  });

  it('rejects an empty or non-string path list entry and reads nothing', async () => {
    spy.readFile.length = 0;
    spy.open.length = 0;
    const r = /** @type {any} */ (await client.callTool({ name: 'blacklight', arguments: { path: ['', '..'] } }));
    expect(r.structuredContent.pathErrors.length).toBe(2);
    expect(spy.readFile).toEqual([]);
    expect(spy.open).toEqual([]);
  });

  it('reports the number of runs executed per property', () => {
    console.log(`KI-P8 runs executed: ${executed} (numRuns=${FC_PARAMS.numRuns})`);
    expect(executed).toBeGreaterThanOrEqual(FC_PARAMS.numRuns);
  });
});

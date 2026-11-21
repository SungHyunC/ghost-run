// Properties 22 and 23: the `workspace` input never moves a server that has its own root, and the file
// system root, the home folder, and the server's own folder are always refused. Sources are injected: no
// Kiro host, no Docker. Temporary folders only.
// **Property 22: The workspace input never moves a rooted server**
// **Property 23: Root, home folder, and own folder are always refused**
// **Validates: Requirements 18.15, 18.16, 18.17, 18.18**
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';
import { WORKSPACE_ENV, WORKSPACE_MISMATCH_MESSAGE, WORKSPACE_REFUSALS, createWorkspaceResolver } from '../src/workspace.mjs';

const NUM_RUNS = process.env['GHOST_PBT_MODE'] === 'nightly' ? 10_000 : 100;
const FC_PARAMS = { numRuns: NUM_RUNS, verbose: 1 };
const TOOL_RUNS = Math.min(NUM_RUNS, 30);

/** @type {string} */ let base;
/** @type {string} */ let ownDir;
/** @type {string} */ let home;
/** @type {string[]} */ let projects;
/** @type {string} */ let homeLink;
/** @type {string} */ let ownLink;
/** @type {any[]} */ const runnerCalls = [];

beforeAll(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), 'ghost-mcp-prop22-')));
  ownDir = path.join(base, 'power');
  home = path.join(base, 'home');
  projects = [path.join(base, 'p0'), path.join(base, 'p1'), path.join(base, 'p2')];
  for (const d of [ownDir, home, ...projects]) await mkdir(d);
  await mkdir(path.join(home, 'sub'));
  await writeFile(path.join(base, 'plain.txt'), 'x');
  homeLink = path.join(base, 'home-link');
  ownLink = path.join(base, 'own-link');
  await symlink(home, homeLink);
  await symlink(ownDir, ownLink);
});
afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A server whose root comes from the given source, or from none. */
function build(/** @type {'roots' | 'env' | 'cwd' | 'none'} */ kind, /** @type {string} */ rootDir) {
  return createWorkspaceResolver({
    env: kind === 'env' ? { [WORKSPACE_ENV]: rootDir } : { PWD: projects[2] },
    cwd: () => (kind === 'cwd' ? rootDir : ownDir),
    ownDir,
    home: () => home,
    ...(kind === 'roots' ? { getRoots: async () => [rootDir] } : {}),
  });
}

const junk = fc.oneof(
  fc.constantFrom('', '.', '..', 'rel/path', 'p0', '/', '/nonexistent-ghost-dir', path.join(tmpdir(), 'nope')),
  fc.string({ maxLength: 40 }),
);

describe('Property 22: the workspace input never moves a rooted server', () => {
  it('the root is the root without the input, or the call is refused with the mismatch error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('roots', 'env', 'cwd'),
        fc.integer({ min: 0, max: 1 }),
        fc.oneof(fc.constantFrom(...projects, home, ownDir, base), junk),
        async (kind, which, input) => {
          const rootDir = projects[which];
          const without = await build(kind, rootDir).resolve();
          const withInput = await build(kind, rootDir).resolve(input);
          expect(without).toMatchObject({ ok: true, root: rootDir });
          if (withInput.ok) {
            expect(withInput.root).toBe(rootDir);
            expect(await realpath(input)).toBe(rootDir);
          } else {
            expect(withInput.error).toBe(WORKSPACE_MISMATCH_MESSAGE);
          }
        },
      ),
      FC_PARAMS,
    );
  });

  it('a tool call on a rooted server runs on its own root or returns the mismatch error, and never on the input', async () => {
    const root = projects[0];
    const { server } = createServer({
      env: {},
      workspace: { cwd: () => root, ownDir, home: () => home },
      deps: { runPlan: async (/** @type {any} */ _p, /** @type {any} */ o) => { runnerCalls.push(o); throw new Error('no run'); } },
      stderr: () => undefined,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'prop-22', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('wards_check', 'blacklight'), fc.oneof(fc.constantFrom(...projects, home, ownDir), junk), async (name, input) => {
          const args = name === 'wards_check' ? { plan: [{ command: 'ls' }] } : { path: ['.'] };
          const r = /** @type {any} */ (await client.callTool({ name, arguments: { ...args, workspace: input } }));
          if (r.isError === true) {
            expect(r.content[0].text).toMatch(/workspace/);
          } else {
            expect(r.structuredContent.workspaceRoot).toBe(root);
            expect(path.resolve(input)).toBe(root);
          }
        }),
        { ...FC_PARAMS, numRuns: TOOL_RUNS },
      );
      expect(runnerCalls).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

describe('Property 23: root, home folder, and own folder are always refused', () => {
  const spell = (/** @type {string} */ p) => fc.constantFrom(p, `${p}/`, `${p}//`, `${p}/.`, `${p}/./`, path.join(p, 'sub', '..'));
  const makeRefused = () => fc.oneof(
    fc.tuple(spell('/'), fc.constant(WORKSPACE_REFUSALS.isRoot)),
    fc.tuple(fc.constantFrom('/..', '/./', '//', '/tmp/..'), fc.constant(WORKSPACE_REFUSALS.isRoot)),
    fc.tuple(fc.oneof(spell(home), fc.constant(homeLink), fc.constant(`${homeLink}/`)), fc.constant(WORKSPACE_REFUSALS.isHome)),
    fc.tuple(fc.oneof(spell(ownDir), fc.constant(ownLink), fc.constant(`${ownLink}/`)), fc.constant(WORKSPACE_REFUSALS.isOwn)),
  );

  it('a server with no root refuses each of them with its reason', async () => {
    const refused = makeRefused();
    await fc.assert(
      fc.asyncProperty(refused, async ([value, error]) => {
        const r = await build('none', ownDir).resolve(value);
        expect(r).toEqual({ ok: false, error });
      }),
      FC_PARAMS,
    );
  });

  it('a tool call on a server with no root refuses them, with no runner call and no write', async () => {
    const refused = makeRefused();
    /** @type {any[]} */
    const calls = [];
    const { server } = createServer({
      env: {},
      workspace: { cwd: () => ownDir, ownDir, home: () => home },
      deps: { runPlan: async (/** @type {any} */ p) => { calls.push(p); throw new Error('no run'); } },
      stderr: () => undefined,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'prop-23', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      await fc.assert(
        fc.asyncProperty(refused, fc.constantFrom('ghost_run', 'wards_check', 'blacklight'), async ([value, error], name) => {
          const args = name === 'blacklight' ? { path: ['.'] } : { plan: [{ command: 'ls' }] };
          const r = /** @type {any} */ (await client.callTool({ name, arguments: { ...args, workspace: value } }));
          expect(r.isError).toBe(true);
          expect(r.content[0].text).toBe(error);
        }),
        { ...FC_PARAMS, numRuns: TOOL_RUNS },
      );
      expect(calls).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

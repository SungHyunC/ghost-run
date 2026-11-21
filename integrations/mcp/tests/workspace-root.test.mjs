// Workspace root resolution (kiro-integration Requirement 18, criterion 6) and the default wards (criterion 7).
// Every source is injected: no host, no Docker. Temporary folders only; canary-free.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';
import { DEFAULT_WARDS_YAML } from '../src/default-wards.mjs';
import { DEFAULT_WARDS_NOTICE } from '../src/wards-source.mjs';
import { ROOT_UNKNOWN_MESSAGE, WORKSPACE_ENV, WORKSPACE_MISMATCH_MESSAGE, WORKSPACE_REFUSALS, createWorkspaceResolver, localRoots, ownFolderOf } from '../src/workspace.mjs';

/** @type {string} */ let base;
/** @type {string} */ let projectA;
/** @type {string} */ let projectB;
/** @type {string} */ let ownDir;

beforeAll(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), 'ghost-mcp-root-')));
  projectA = path.join(base, 'a');
  projectB = path.join(base, 'b');
  ownDir = path.join(base, 'power');
  for (const d of [projectA, projectB, ownDir]) await mkdir(d);
});
afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

/** @param {Partial<import('../src/workspace.mjs').WorkspaceSources>} s */
const resolver = (s) => createWorkspaceResolver({ env: {}, cwd: () => ownDir, ownDir, ...s });

describe('resolution order', () => {
  it('prefers MCP roots over the environment and the cwd', async () => {
    const r = resolver({ env: { [WORKSPACE_ENV]: projectB }, cwd: () => projectB, getRoots: async () => [projectA] });
    expect(await r.resolve()).toEqual({ ok: true, root: projectA, source: 'roots' });
  });
  it('uses GHOST_RUN_WORKSPACE when set to an absolute existing folder', async () => {
    expect(await resolver({ env: { [WORKSPACE_ENV]: projectA }, cwd: () => projectB }).resolve()).toMatchObject({ root: projectA, source: 'env' });
  });
  it('ignores GHOST_RUN_WORKSPACE that is relative or missing', async () => {
    for (const v of ['rel/path', path.join(base, 'missing'), '']) {
      expect(await resolver({ env: { [WORKSPACE_ENV]: v }, cwd: () => projectB }).resolve()).toMatchObject({ root: projectB, source: 'cwd' });
    }
  });
  it('uses the working directory unless it is the server own folder', async () => {
    expect(await resolver({ cwd: () => projectA }).resolve()).toMatchObject({ root: projectA, source: 'cwd' });
    expect(await resolver({ cwd: () => ownDir, env: { PWD: projectB } }).resolve()).toEqual({ ok: false, error: ROOT_UNKNOWN_MESSAGE });
  });
  it('compares real paths: a symbolic-link spelling of the own folder is still the own folder', async () => {
    const { symlink } = await import('node:fs/promises');
    const link = path.join(base, 'power-link');
    await symlink(ownDir, link);
    expect(await resolver({ cwd: () => link }).resolve()).toEqual({ ok: false, error: ROOT_UNKNOWN_MESSAGE });
  });
  it('has no PWD source: whatever PWD holds, only the own folder gives no root', async () => {
    for (const PWD of [ownDir, projectA, 'rel', path.join(base, 'missing'), undefined]) {
      expect(await resolver({ env: { PWD } }).resolve()).toEqual({ ok: false, error: ROOT_UNKNOWN_MESSAGE });
    }
  });
  it('skips a failing or empty roots answer and caches the roots until invalidated', async () => {
    let n = 0;
    let answer = [projectA];
    const r = resolver({ cwd: () => projectB, getRoots: async () => { n += 1; return answer; } });
    expect((await r.resolve()).ok && (await r.resolve())).toMatchObject({ root: projectA });
    expect(n).toBe(1);
    answer = [projectB];
    expect(await r.resolve()).toMatchObject({ root: projectA });
    r.invalidate();
    expect(await r.resolve()).toMatchObject({ root: projectB, source: 'roots' });
    const failing = resolver({ cwd: () => projectB, getRoots: async () => { throw new Error('no'); } });
    expect(await failing.resolve()).toMatchObject({ root: projectB, source: 'cwd' });
  });
});

describe('the workspace input', () => {
  const home = () => projectB;
  it('is used only when roots, the environment and the cwd give no root', async () => {
    expect(await resolver({ home }).resolve(projectA)).toEqual({ ok: true, root: projectA, source: 'workspace' });
    expect(await resolver({ home, cwd: () => projectA }).resolve(projectA)).toMatchObject({ source: 'cwd' });
  });
  it('returns the mismatch error and no root when a root exists and the real path differs', async () => {
    const bad = { ok: false, error: WORKSPACE_MISMATCH_MESSAGE };
    expect(await resolver({ home, cwd: () => projectA }).resolve(projectB)).toEqual(bad);
    expect(await resolver({ home, env: { [WORKSPACE_ENV]: projectA } }).resolve(projectB)).toEqual(bad);
    expect(await resolver({ home, getRoots: async () => [projectA] }).resolve('rel')).toEqual(bad);
  });
  it('names the reason for every refusal', async () => {
    const { symlink } = await import('node:fs/promises');
    const homeLink = path.join(base, 'home-link');
    await symlink(projectB, homeLink);
    const file = path.join(base, 'file.txt');
    await writeFile(file, 'x');
    const cases = [
      ['rel/dir', WORKSPACE_REFUSALS.notAbsolute],
      [path.join(base, 'missing'), WORKSPACE_REFUSALS.notFolder],
      [file, WORKSPACE_REFUSALS.notFolder],
      ['/', WORKSPACE_REFUSALS.isRoot],
      [projectB, WORKSPACE_REFUSALS.isHome],
      [`${projectB}/./`, WORKSPACE_REFUSALS.isHome],
      [path.join(projectB, 'a', '..'), WORKSPACE_REFUSALS.isHome],
      [homeLink, WORKSPACE_REFUSALS.isHome],
      [ownDir, WORKSPACE_REFUSALS.isOwn],
    ];
    for (const [value, error] of cases) expect(await resolver({ home }).resolve(value), String(value)).toEqual({ ok: false, error });
  });
  it('accepts a folder below the home folder', async () => {
    const sub = path.join(projectB, 'sub');
    await mkdir(sub, { recursive: true });
    expect(await resolver({ home }).resolve(sub)).toEqual({ ok: true, root: sub, source: 'workspace' });
  });
});

describe('own folder and file roots', () => {
  it('maps the bundle folder (server/) and the source folder (src/) to their parent', () => {
    expect(ownFolderOf(pathToFileURL('/x/power/server/ghost-run-mcp.mjs').href)).toBe('/x/power');
    expect(ownFolderOf(pathToFileURL('/x/mcp/src/workspace.mjs').href)).toBe('/x/mcp');
    expect(ownFolderOf(pathToFileURL('/x/other/file.mjs').href)).toBe('/x/other');
  });
  it('keeps only file:// roots', () => {
    expect(localRoots([{ uri: pathToFileURL('/a/b').href }, { uri: 'https://example.test/x' }, { uri: 'file://other.example/x' }])).toEqual(['/a/b']);
  });
});

/**
 * @param {{ roots?: string[], workspace: Partial<import('../src/workspace.mjs').WorkspaceSources>, deps?: Record<string, any> }} o
 */
async function connect(o) {
  const { server } = createServer({ env: o.workspace.env ?? {}, workspace: o.workspace, deps: o.deps ?? {}, stderr: () => undefined });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: o.roots ? { roots: { listChanged: true } } : {} });
  let current = o.roots ?? [];
  if (o.roots) {
    client.setRequestHandler((await import('@modelcontextprotocol/sdk/types.js')).ListRootsRequestSchema, async () => ({
      roots: current.map((p) => ({ uri: pathToFileURL(p).href })),
    }));
  }
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    setRoots: async (/** @type {string[]} */ next) => { current = next; await client.sendRootsListChanged(); await new Promise((r) => setTimeout(r, 20)); },
  };
}

describe('over the protocol', () => {
  it('uses the first file root and names it once as a notice line, then follows roots/list_changed', async () => {
    await writeFile(path.join(projectA, 'wards.yaml'), 'wards:\n  - id: only-a\n    kind: path\n    deny: [delete]\n    paths: ["x/**"]\n');
    const { client, setRoots } = await connect({ roots: [projectA], workspace: { cwd: () => ownDir, ownDir } });
    const first = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
    expect(first.isError).toBeUndefined();
    expect(first.structuredContent.workspaceRoot).toBe(projectA);
    expect(first.content[0].text.split('\n')[0]).toBe(`Workspace root: ${projectA}`);
    expect(first.content[0].text.split(`Workspace root:`).length).toBe(2);
    expect(first.structuredContent.wards).toEqual([{ id: 'only-a', kind: 'path' }]);
    await setRoots([projectB]);
    const second = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
    expect(second.structuredContent.workspaceRoot).toBe(projectB);
  });

  it('returns the root-unknown error from every tool and does nothing else', async () => {
    /** @type {number[]} */
    const calls = [];
    const { client } = await connect({
      workspace: { cwd: () => ownDir, ownDir, env: {} },
      deps: { runPlan: async () => { calls.push(1); throw new Error('must not run'); } },
    });
    const inputs = {
      ghost_run: { plan: [{ command: 'ls' }] },
      ghost_diff: { id: 'abc' },
      ghost_trace: { id: 'abc' },
      wards_check: { plan: [{ command: 'ls' }] },
      blacklight: { path: ['.'] },
    };
    for (const [name, args] of Object.entries(inputs)) {
      const r = /** @type {any} */ (await client.callTool({ name, arguments: args }));
      expect(r.isError, name).toBe(true);
      expect(r.content[0].text, name).toBe(ROOT_UNKNOWN_MESSAGE);
    }
    expect(calls).toEqual([]);
  });

  it('does not write into the server own folder', async () => {
    const { client } = await connect({ workspace: { cwd: () => ownDir, ownDir, env: {} }, deps: { runPlan: async () => { throw new Error('x'); } } });
    await client.callTool({ name: 'ghost_run', arguments: { plan: [{ command: 'ls' }] } });
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(ownDir)).toEqual([]);
  });
});

describe('default wards (criterion 18.6 and the MCP default)', () => {
  it('equals apps/ghost-shell/wards.yaml byte for byte', async () => {
    const file = await readFile(new URL('../../../apps/ghost-shell/wards.yaml', import.meta.url), 'utf8');
    expect(DEFAULT_WARDS_YAML).toBe(file);
  });

  it('wards_check uses the default and adds the notice when the project has no wards file', async () => {
    const bare = path.join(base, 'bare');
    await mkdir(bare);
    const { client } = await connect({ workspace: { cwd: () => bare, ownDir, env: {} } });
    const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.wards.map((/** @type {any} */ w) => w.id)).toEqual(['protect-data', 'no-data-loss', 'no-secret-egress']);
    expect(r.structuredContent.notices).toEqual([DEFAULT_WARDS_NOTICE]);
    expect(r.content[0].text).toContain(DEFAULT_WARDS_NOTICE);
  });

  it('ghost_run rehearses with the default wards and adds the notice', async () => {
    const bare = path.join(base, 'bare-run');
    await mkdir(bare);
    /** @type {any[]} */
    const seen = [];
    const result = {
      runId: 'run-d_1', verdict: 'pass', status: 'ok', rehearsed: true, exitCodes: [0],
      isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
      wardVerdict: { verdict: 'pass', violations: [], notices: [] },
      report: { snapshots: [], changes: [[]], effectsOutside: [[]], observedEvents: [], variantResults: [] },
    };
    const { client } = await connect({
      workspace: { cwd: () => bare, ownDir, env: {} },
      deps: { runPlan: async (/** @type {any} */ _plan, /** @type {any} */ opts) => { seen.push(opts); return { result, payloads: new Map() }; }, findBoxDir: () => undefined },
    });
    const r = /** @type {any} */ (await client.callTool({ name: 'ghost_run', arguments: { plan: [{ command: 'ls' }] } }));
    expect(r.isError).toBeUndefined();
    expect(seen[0].original).toBe(bare);
    expect(seen[0].wardSet.wards.map((/** @type {any} */ w) => w.id)).toEqual(['protect-data', 'no-data-loss', 'no-secret-egress']);
    expect(r.structuredContent.notices).toEqual([DEFAULT_WARDS_NOTICE]);
  });

  it('an existing but invalid wards file still fails closed, with no default and no notice', async () => {
    const bad = path.join(base, 'bad');
    await mkdir(bad);
    await writeFile(path.join(bad, 'wards.yaml'), 'wards: [not valid\n');
    const { client } = await connect({ workspace: { cwd: () => bad, ownDir, env: {} } });
    for (const name of ['wards_check', 'ghost_run']) {
      const args = { plan: [{ command: 'ls' }] };
      const r = /** @type {any} */ (await client.callTool({ name, arguments: args }));
      expect(r.isError, name).toBe(true);
      expect(r.structuredContent.notices, name).toBeUndefined();
      expect(r.content[0].text, name).not.toContain(DEFAULT_WARDS_NOTICE);
    }
  });

  it('a project wards file wins over the default', async () => {
    const own = path.join(base, 'own-wards');
    await mkdir(own);
    await writeFile(path.join(own, 'wards.yaml'), 'wards:\n  - id: mine\n    kind: path\n    deny: [delete]\n    paths: ["x/**"]\n');
    const { client } = await connect({ workspace: { cwd: () => own, ownDir, env: {} } });
    const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
    expect(r.structuredContent.wards).toEqual([{ id: 'mine', kind: 'path' }]);
    expect(r.structuredContent.notices).toBeUndefined();
  });
});


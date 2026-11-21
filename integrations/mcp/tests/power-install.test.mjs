// The reported failure: an installed power's server starts in the power's own folder. The bundle is copied
// to a fake install folder, started there, and must work on the project named by the `workspace` input or GHOST_RUN_WORKSPACE.
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DEFAULT_WARDS_NOTICE } from '../src/wards-source.mjs';
import { ROOT_UNKNOWN_MESSAGE, WORKSPACE_MISMATCH_MESSAGE, WORKSPACE_REFUSALS } from '../src/workspace.mjs';

const BUNDLE = fileURLToPath(new URL('../../power/server/ghost-run-mcp.mjs', import.meta.url));
/** @type {string[]} */
const dirs = [];
afterAll(async () => {
  while (dirs.length > 0) await rm(String(dirs.pop()), { recursive: true, force: true });
});

/** @param {Record<string, string>} env */
async function start(env) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'ghost-power-install-')));
  dirs.push(base);
  const power = path.join(base, 'installed', 'ghost-run');
  const project = path.join(base, 'project');
  await mkdir(path.join(power, 'server'), { recursive: true });
  await mkdir(project);
  await cp(BUNDLE, path.join(power, 'server', 'ghost-run-mcp.mjs'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['server/ghost-run-mcp.mjs'],
    cwd: power,
    env: { PATH: process.env['PATH'] ?? '', ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.replace('<project>', project)])) },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'install-test', version: '0.0.0' });
  await client.connect(transport);
  return { client, project, power };
}

describe('bundle started in its install folder', () => {
  it('works on the project named by the workspace input, with the default wards', async () => {
    const { client, project } = await start({});
    try {
      const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }], workspace: project } }));
      expect(r.isError).toBeUndefined();
      expect(r.structuredContent.workspaceRoot).toBe(project);
      expect(r.structuredContent.notices).toEqual([DEFAULT_WARDS_NOTICE]);
      expect(r.structuredContent.wards.map((/** @type {any} */ w) => w.id)).toEqual(['protect-data', 'no-data-loss', 'no-secret-egress']);
    } finally {
      await client.close();
    }
  });

  it('ignores PWD: the launch folder of the host is not the project', async () => {
    const { client, project } = await start({ PWD: '<project>' });
    try {
      const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toBe(ROOT_UNKNOWN_MESSAGE);
      const ok = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }], workspace: project } }));
      expect(ok.structuredContent.workspaceRoot).toBe(project);
    } finally {
      await client.close();
    }
  });

  it('prefers GHOST_RUN_WORKSPACE, and refuses a workspace input that names another folder', async () => {
    const { client, project, power } = await start({ GHOST_RUN_WORKSPACE: '<project>' });
    try {
      const r = /** @type {any} */ (await client.callTool({ name: 'blacklight', arguments: { path: ['.'] } }));
      expect(r.structuredContent.workspaceRoot).toBe(project);
      const same = /** @type {any} */ (await client.callTool({ name: 'blacklight', arguments: { path: ['.'], workspace: project } }));
      expect(same.structuredContent.workspaceRoot).toBe(project);
      const other = /** @type {any} */ (await client.callTool({ name: 'blacklight', arguments: { path: ['.'], workspace: power } }));
      expect(other.isError).toBe(true);
      expect(other.content[0].text).toBe(WORKSPACE_MISMATCH_MESSAGE);
    } finally {
      await client.close();
    }
  });

  it('refuses the own folder and the file system root as workspace', async () => {
    const { client, power } = await start({});
    try {
      for (const [workspace, error] of [[power, WORKSPACE_REFUSALS.isOwn], ['/', WORKSPACE_REFUSALS.isRoot]]) {
        const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }], workspace } }));
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toBe(error);
      }
    } finally {
      await client.close();
    }
  });

  it('refuses to work on its own folder when no project is known', async () => {
    const { client } = await start({});
    try {
      const r = /** @type {any} */ (await client.callTool({ name: 'wards_check', arguments: { plan: [{ command: 'ls' }] } }));
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toBe(ROOT_UNKNOWN_MESSAGE);
    } finally {
      await client.close();
    }
  });
});

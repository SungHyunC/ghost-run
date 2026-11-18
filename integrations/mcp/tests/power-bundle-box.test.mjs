// The committed bundle, started from its own folder, must find the box folder from the workspace and run
// ghost_run in the Docker box (kiro-integration criterion 19.16). The bundle has no box/ folder next to it, so
// this fails when the lookup from the workspace is missing. A temporary workspace holds a copy of the box
// sources at ghost-runner/box. Reports `skipped (docker unavailable)` when Docker or the box image is missing.
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const BUNDLE = path.join(REPO, 'integrations', 'power', 'server', 'ghost-run-mcp.mjs');
const BOX_SRC = path.join(REPO, 'ghost-runner', 'box');

/** @param {string[]} args */
function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 20_000 });
  return { ok: r.error === undefined && r.status === 0, out: r.stdout ?? '' };
}
const dockerAvailable =
  docker(['version', '--format', '{{.Server.Version}}']).ok && docker(['image', 'ls', '-q', 'ghost-run/box']).out.trim() !== '';
if (!dockerAvailable) console.info('power bundle box test: skipped (docker unavailable)');

const labeled = () => docker(['ps', '-a', '-q', '--filter', 'label=ghost-run.run-id']).out.split(/\s+/).filter(Boolean);
const volumes = () => docker(['volume', 'ls', '-q']).out.split(/\s+/).filter(Boolean);
const containersBefore = new Set(dockerAvailable ? labeled() : []);
const volumesBefore = new Set(dockerAvailable ? volumes() : []);
/** @type {string[]} */
const dirs = [];

afterAll(async () => {
  while (dirs.length > 0) await rm(String(dirs.pop()), { recursive: true, force: true });
  if (!dockerAvailable) return;
  const mine = labeled().filter((id) => !containersBefore.has(id));
  if (mine.length > 0) docker(['rm', '-f', '-v', ...mine]);
});

describe('power bundle with the real box', () => {
  it.skipIf(!dockerAvailable)('runs ghost_run in docker-box when the box folder is only reachable from the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ghost-run-bundle-'));
    dirs.push(root);
    await cp(BOX_SRC, path.join(root, 'ghost-runner', 'box'), { recursive: true });
    await writeFile(
      path.join(root, 'wards.yaml'),
      ['wards:', '  - id: protect-data', '    kind: path', '    deny: [delete, overwrite]', '    paths: ["data/**"]', ''].join('\n'),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BUNDLE],
      cwd: root,
      env: { PATH: process.env['PATH'] ?? '' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'bundle-box-test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const r = /** @type {any} */ (await client.callTool({ name: 'ghost_run', arguments: { plan: [{ command: 'ls' }] } }));
      expect(r.isError).toBeUndefined();
      expect(r.structuredContent).toMatchObject({ rehearsed: true, isolation: { mode: 'docker-box', p1Claimed: true } });
    } finally {
      await client.close();
    }
    expect(labeled().filter((id) => !containersBefore.has(id))).toEqual([]);
    expect(volumes().filter((v) => !volumesBefore.has(v))).toEqual([]);
  }, 90_000);

  it.skipIf(dockerAvailable)('skipped (docker unavailable)', () => {
    expect(dockerAvailable).toBe(false);
  });
});

// Stdio integration test of the MCP server (task 14.8): the real bin runs as a child process and the SDK
// client talks to it over StdioClientTransport. A tee wrapper outside the transport records every byte the
// server writes to STDOUT. Canary secrets and reserved domains only. The temp workspace is deleted afterwards.
// **Validates: Requirements 18.1, 18.3, 18.10, 19.12, 23.3**
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN = fileURLToPath(new URL('../bin/ghost-run-mcp.mjs', import.meta.url));
const CANARY = 'sk-CANARY-stdio-abc123';
const HIDDEN = `a${String.fromCodePoint(0x200b)}b`;
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

// Forwards stdin to the real server and copies its STDOUT both to our STDOUT and to a spy file.
const TEE = `
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
const spy = createWriteStream(process.argv[3]);
const child = spawn(process.execPath, [process.argv[2]], { stdio: ['pipe', 'pipe', 'inherit'], cwd: process.cwd() });
process.stdin.pipe(child.stdin);
child.stdout.on('data', (d) => { spy.write(d); process.stdout.write(d); });
child.on('exit', (code) => { spy.end(() => process.exit(code ?? 0)); });
process.stdin.on('end', () => child.stdin.end());
`;

/** @type {string} */ let base;
/** @type {string} */ let root;
/** @type {string} */ let spyFile;
/** @type {Client} */ let client;
/** @type {StdioClientTransport} */ let transport;
let stderrText = '';
/** @type {unknown[]} */
const transportErrors = [];
/** @type {Record<string, any>} */
const seen = {};

/** @param {string} name @param {Record<string, unknown>} args */
const call = async (name, args) => /** @type {any} */ (await client.callTool({ name, arguments: args }));

/** Remove fields that legitimately differ between equal calls (ids, timestamps). */
const stable = (/** @type {unknown} */ v) =>
  JSON.stringify(v, (k, x) => (/^(id|runId|.*At|timestamp|time)$/.test(k) ? undefined : x));

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'ghost-mcp-stdio-'));
  root = path.join(base, 'ws');
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'wards.yaml'), WARDS);
  await writeFile(path.join(root, '.env'), `API_KEY=${CANARY}\n`);
  await writeFile(path.join(root, 'clean.txt'), 'plain text\n');
  await writeFile(path.join(root, 'hidden.txt'), `${HIDDEN} ${CANARY}\n`);
  const tee = path.join(base, 'tee.mjs');
  spyFile = path.join(base, 'stdout.spy');
  await writeFile(tee, TEE);
  transport = new StdioClientTransport({ command: process.execPath, args: [tee, BIN, spyFile], cwd: root, stderr: 'pipe' });
  transport.stderr?.on('data', (d) => { stderrText += String(d); });
  transport.onerror = (e) => { transportErrors.push(e); };
  client = new Client({ name: 'stdio-test', version: '0.0.0' });
  await client.connect(transport);
}, 60_000);

afterAll(async () => {
  await client?.close();
  await rm(base, { recursive: true, force: true });
});

describe('MCP server over stdio', () => {
  it('lists exactly the five tools', async () => {
    const { tools } = await client.listTools();
    seen['tools'] = tools.map((t) => t.name);
    expect(seen['tools']).toEqual(['ghost_run', 'ghost_diff', 'ghost_trace', 'wards_check', 'blacklight']);
  });

  it('wards_check answers a static check without Docker', async () => {
    const r = await call('wards_check', { plan: [{ command: 'ls -la' }, { command: 'rm -rf data' }, { command: 'cat .env' }] });
    seen['wards'] = r;
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ check: 'static', rehearsed: false });
    expect(r.structuredContent.wards).toEqual([
      { id: 'protect-data', kind: 'path' },
      { id: 'no-exfil', kind: 'egress' },
    ]);
    expect(r.structuredContent.actions.map((/** @type {any} */ a) => a.safe)).toEqual([true, false, false]);
    expect('verdict' in r.structuredContent).toBe(false);
  });

  it('blacklight finds the hidden character in the workspace file', async () => {
    const r = await call('blacklight', { path: ['hidden.txt', 'clean.txt'] });
    seen['blacklight'] = r;
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.outcome).toBe('findings');
    expect(r.structuredContent.totalFindings).toBeGreaterThan(0);
  });

  it('rejects a path outside the workspace', async () => {
    const r = await call('blacklight', { path: ['../outside'] });
    expect(r.structuredContent.pathErrors).toHaveLength(1);
  });

  it('gives equal results for equal inputs, except ids and timestamps', async () => {
    const plan = { plan: [{ command: 'ls' }, { command: 'rm -rf data' }] };
    expect(stable(await call('wards_check', plan))).toBe(stable(await call('wards_check', plan)));
    const scan = { path: ['hidden.txt', 'clean.txt'] };
    expect(stable(await call('blacklight', scan))).toBe(stable(await call('blacklight', scan)));
  });

  it('keeps every canary out of results, STDOUT, and STDERR', async () => {
    const everything = JSON.stringify([seen['wards'], seen['blacklight']]);
    expect(everything).not.toContain(CANARY);
    expect(stderrText).not.toContain(CANARY);
    expect(await readFile(spyFile, 'utf8')).not.toContain(CANARY);
  });

  it('writes protocol messages only to STDOUT', async () => {
    expect(transportErrors).toEqual([]);
    const raw = await readFile(spyFile, 'utf8');
    const lines = raw.split('\n').filter((l) => l !== '');
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
      expect('id' in parsed || 'method' in parsed).toBe(true);
    }
    expect(stderrText).toContain('[ghost-run-mcp] ready');
  });
});

// --- ghost_run: needs the Docker box ----------------------------------------------------------
const dockerCmd = (/** @type {string[]} */ args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 20_000 });
const dockerAvailable =
  dockerCmd(['version', '--format', '{{.Server.Version}}']).status === 0 &&
  (dockerCmd(['image', 'ls', '-q', 'ghost-run/box']).stdout ?? '').trim() !== '';
if (!dockerAvailable) console.info('ghost_run stdio test: skipped (docker unavailable)');

// A real-box run is not repeated here: ghost-tools.test.mjs diffs the global container list while it runs,
// so a second Docker run in a parallel test file would make that check flaky. It covers the real box.
describe('ghost_run over stdio', () => {
  it.skipIf(dockerAvailable)('skipped (docker unavailable)', () => {
    expect(dockerAvailable).toBe(false);
  });
});

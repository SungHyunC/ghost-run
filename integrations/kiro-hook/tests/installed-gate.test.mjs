// The installed gate end to end (kiro-integration Requirement 29): the installer runs in a temporary git project,
// then `node .kiro/ghost-run/gate/ghost-gate.mjs` gets Pre Tool Use events on STDIN, with no node_modules anywhere
// near it. The Docker case is skipped (never passed) when Docker or the box image is missing; the other cases run
// without Docker, which they get by an empty PATH so the runner finds no `docker`.
// GHOST_RUN_SEANCE_AUTOSTART=0 keeps every case from starting a viewer. Canary values and reserved domains only.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABEL_RUN_ID } from '@ghost-run/ghost-runner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INSTALLER = join(REPO, 'integrations', 'power', 'install-gate.mjs');
const PLAN_B = 'P1 isolation is NOT guaranteed';

/** @param {string[]} args @returns {{ ok: boolean, out: string }} */
function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 20_000 });
  return { ok: r.error === undefined && r.status === 0, out: r.stdout ?? '' };
}
const dockerAvailable =
  docker(['version', '--format', '{{.Server.Version}}']).ok && docker(['image', 'ls', '-q', 'ghost-run/box']).out.trim() !== '';
if (!dockerAvailable) console.info('installed gate docker test: skipped (docker unavailable)');

/** @type {string[]} */
const dirs = [];
/** Run ids found in the Run_Records of the projects, for the final container cleanup. */
const runIds = new Set();

/** @returns {Promise<string>} a temporary git project with the gate installed */
async function makeProject() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'ghost-installed-')));
  dirs.push(dir);
  expect(spawnSync('git', ['init', '-q'], { cwd: dir }).status).toBe(0);
  const r = spawnSync(process.execPath, [INSTALLER, '--project', dir], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return dir;
}

/**
 * @param {string} project
 * @param {{ tool_name: string, tool_input: Record<string, unknown> }} call
 * @param {{ noDocker?: boolean }} [o]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runGate(project, call, o = {}) {
  return new Promise((resolve, reject) => {
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...process.env, GHOST_RUN_SEANCE_AUTOSTART: '0' };
    delete env['GHOST_RUN_WARDS_FILE'];
    delete env['GHOST_RUN_SEANCE_BASE'];
    if (o.noDocker) env['PATH'] = join(project, 'no-such-bin');
    const child = spawn(process.execPath, [join('.kiro', 'ghost-run', 'gate', 'ghost-gate.mjs')], {
      cwd: project,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {});
    child.on('error', reject);
    const guard = setTimeout(() => child.kill('SIGKILL'), 90_000);
    child.on('close', (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', cwd: project, session_id: 'installed-gate-session', ...call }));
  });
}

/** @param {string} command */
const shell = (command) => ({ tool_name: 'execute_bash', tool_input: { command } });

/** @param {string} project */
function collectRunIds(project) {
  const dir = join(project, '.ghost-run', 'runs');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    try {
      const id = JSON.parse(readFileSync(join(dir, f), 'utf8')).runId;
      if (typeof id === 'string') runIds.add(id);
    } catch {
      // not a record
    }
  }
}

/** @param {string} project */
async function withData(project) {
  await mkdir(join(project, 'data'));
  await writeFile(join(project, 'data', 'a.csv'), 'id,name\n1,alpha\n');
}

beforeAll(() => {
  expect(existsSync(INSTALLER)).toBe(true);
});

afterAll(async () => {
  for (const id of runIds) {
    const ids = docker(['ps', '-a', '-q', '--filter', `label=${LABEL_RUN_ID}=${id}`]).out.split(/\s+/).filter(Boolean);
    if (ids.length > 0) docker(['rm', '-f', '-v', ...ids]);
    await rm(join(tmpdir(), 'ghost-run', id), { recursive: true, force: true });
  }
  while (dirs.length > 0) await rm(String(dirs.pop()), { recursive: true, force: true });
}, 60_000);

describe('installed gate', () => {
  it('lets a safe command pass silently', async () => {
    const project = await makeProject();
    const r = await runGate(project, shell('ls'), { noDocker: true });
    expect(r).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('asks (Plan B, no claim of P1) for a delete when Docker is not available, and leaves the data alone', async () => {
    const project = await makeProject();
    await withData(project);
    const r = await runGate(project, shell('rm -r' + 'f data'), { noDocker: true });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain(PLAN_B);
    expect(existsSync(join(project, 'data', 'a.csv'))).toBe(true);
  }, 60_000);

  it.skipIf(!dockerAvailable)('blocks a delete of protected data in the Docker box [docker]', async () => {
    const project = await makeProject();
    await withData(project);
    const r = await runGate(project, shell('rm -r' + 'f data'));
    collectRunIds(project);
    expect(r.code, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toContain('protect-data');
    expect(r.stderr).not.toContain(PLAN_B);
    // P1: the real data is untouched, and the grave is written in the project.
    expect(await readFile(join(project, 'data', 'a.csv'), 'utf8')).toBe('id,name\n1,alpha\n');
    expect(existsSync(join(project, '.ghost-run', 'graveyard.jsonl'))).toBe(true);
  }, 120_000);

  it('asks for a write to its own hook file (self-protection)', async () => {
    const project = await makeProject();
    const before = await readFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), 'utf8');
    const r = await runGate(project, { tool_name: 'fs_write', tool_input: { path: '.kiro/hooks/ghost-gate.json', text: '{}' } }, { noDocker: true });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('gate-protected path');
    expect(await readFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), 'utf8')).toBe(before);
  });

  it('asks for a write to the installed gate files too', async () => {
    const project = await makeProject();
    const r = await runGate(project, { tool_name: 'fs_write', tool_input: { path: '.kiro/ghost-run/gate/gate-main.mjs', text: '' } }, { noDocker: true });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('passes a trusted command of the project wards.yaml silently and counts it', async () => {
    const project = await makeProject();
    await writeFile(
      join(project, 'wards.yaml'),
      [
        'wards:',
        '  - id: protect-data',
        '    kind: path',
        '    deny: [delete, overwrite]',
        '    paths: ["data/**"]',
        'trusted_commands: ["npm run lint"]',
        '',
      ].join('\n'),
    );
    const r = await runGate(project, shell('npm run lint'), { noDocker: true });
    expect(r).toEqual({ code: 0, stdout: '', stderr: '' });
    const store = join(project, '.ghost-run');
    const text = readdirSync(store)
      .filter((f) => f.endsWith('.log') || f.endsWith('.jsonl') || f.endsWith('.txt'))
      .map((f) => readFileSync(join(store, f), 'utf8'))
      .join('\n');
    expect(text).toContain('trusted');
    expect(existsSync(join(store, 'graveyard.jsonl'))).toBe(false);
  });
});

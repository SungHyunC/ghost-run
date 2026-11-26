// The installer integrations/power/install-gate.mjs (kiro-integration Requirement 29), run as a real process
// against temporary projects (each one a git repository). Never against this repository.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWards } from '@ghost-run/wards-config';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const POWER = join(REPO, 'integrations', 'power');
const INSTALLER = join(POWER, 'install-gate.mjs');

/** @type {string[]} */
const dirs = [];
afterEach(async () => {
  while (dirs.length > 0) await rm(String(dirs.pop()), { recursive: true, force: true });
});

/** @returns {Promise<string>} a temporary project that is a git repository */
async function makeProject() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'ghost-install-')));
  dirs.push(dir);
  const r = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  expect(r.status).toBe(0);
  return dir;
}

/**
 * @param {string[]} args
 * @param {string} [cwd]
 * @param {string} [installer]
 */
function run(args, cwd = tmpdir(), installer = INSTALLER) {
  const r = spawnSync(process.execPath, [installer, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * @param {string} root
 * @returns {string[]} every file below root (relative, sorted), `.git` excluded
 */
function tree(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (d === root && name === '.git') continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full.slice(root.length + 1));
    }
  };
  walk(root);
  return out.sort();
}

/** @param {string} root */
const manifestOf = (root) => JSON.parse(readFileSync(join(root, '.kiro', 'ghost-run', 'manifest.json'), 'utf8'));

describe('install-gate', () => {
  it('writes the gate, the box sources, the hook files, the wards, the gitignore line, and a manifest', async () => {
    const project = await makeProject();
    const r = run(['--project', project]);
    expect(r.code, r.stderr).toBe(0);

    for (const name of ['ghost-gate.mjs', 'gate-main.mjs', 'docker-warmup.mjs', 'seance.mjs']) {
      expect(readFileSync(join(project, '.kiro', 'ghost-run', 'gate', name)).equals(readFileSync(join(POWER, 'gate', name)))).toBe(true);
    }
    // The box sources are byte-identical, so the image tag is the same as for ghost-runner/box.
    for (const rel of ['Dockerfile', 'BASE_DIGEST', 'build.mjs', 'recorder/rec.mjs', 'recorder/ghost-step.sh']) {
      expect(readFileSync(join(project, '.kiro', 'ghost-run', 'box', rel)).equals(readFileSync(join(REPO, 'ghost-runner', 'box', rel)))).toBe(true);
    }
    expect(statSync(join(project, '.kiro', 'ghost-run', 'box', 'recorder', 'ghost-step.sh')).mode & 0o111).not.toBe(0);

    const gate = JSON.parse(await readFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), 'utf8'));
    expect(gate.version).toBe('v1');
    expect(gate.hooks.map((/** @type {any} */ h) => [h.trigger, h.matcher, h.action, h.timeout, h.enabled])).toEqual([
      ['PreToolUse', 'shell', { type: 'command', command: 'node .kiro/ghost-run/gate/ghost-gate.mjs' }, 60, true],
      ['PreToolUse', 'write', { type: 'command', command: 'node .kiro/ghost-run/gate/ghost-gate.mjs' }, 60, true],
    ]);
    const warm = JSON.parse(await readFile(join(project, '.kiro', 'hooks', 'docker-warmup.json'), 'utf8'));
    expect(warm.hooks).toHaveLength(1);
    expect(warm.hooks[0]).toMatchObject({
      trigger: 'PreToolUse',
      matcher: 'shell',
      action: { type: 'command', command: 'node .kiro/ghost-run/gate/docker-warmup.mjs' },
      timeout: 5,
      enabled: true,
    });

    // The default wards parse, equal the Ghost Shell wards, and carry a commented trusted_commands example.
    const wardsText = await readFile(join(project, 'wards.yaml'), 'utf8');
    const parsed = parseWards(wardsText);
    const shell = parseWards(readFileSync(join(REPO, 'apps', 'ghost-shell', 'wards.yaml'), 'utf8'));
    expect(parsed.ok && shell.ok).toBe(true);
    if (parsed.ok && shell.ok) {
      expect(parsed.wardSet).toEqual(shell.wardSet);
      expect(parsed.safeCommands).toEqual(shell.safeCommands);
      expect(parsed.trustedCommands ?? []).toEqual([]);
    }
    expect(wardsText).toMatch(/^# trusted_commands: \[/m);

    expect((await readFile(join(project, '.gitignore'), 'utf8')).split('\n')).toContain('.ghost-run/');

    const manifest = manifestOf(project);
    const listed = manifest.files.map((/** @type {{ path: string }} */ f) => f.path);
    expect([...listed, '.kiro/ghost-run/manifest.json', '.gitignore'].sort()).toEqual(tree(project));
    expect(r.stdout).toContain('.kiro/ghost-run/box/build.mjs');
    expect(r.stdout).toContain('Plan B');
    expect(r.stdout).toContain('"enabled" to false');
    expect(r.stdout).toContain('--uninstall');
  });

  it('keeps the wards file of the project and appends to an existing .gitignore', async () => {
    const project = await makeProject();
    await writeFile(join(project, 'wards.yaml'), 'wards: []\n');
    await writeFile(join(project, '.gitignore'), 'node_modules/');
    expect(run(['--project', project]).code).toBe(0);
    expect(await readFile(join(project, 'wards.yaml'), 'utf8')).toBe('wards: []\n');
    expect(await readFile(join(project, '.gitignore'), 'utf8')).toBe('node_modules/\n.ghost-run/\n');
    expect(manifestOf(project).files.map((/** @type {{ path: string }} */ f) => f.path)).not.toContain('wards.yaml');

    // A project whose wards sit at apps/ghost-shell/wards.yaml has a wards file too.
    const other = await makeProject();
    await mkdir(join(other, 'apps', 'ghost-shell'), { recursive: true });
    await writeFile(join(other, 'apps', 'ghost-shell', 'wards.yaml'), 'wards: []\n');
    expect(run(['--project', other]).code).toBe(0);
    expect(existsSync(join(other, 'wards.yaml'))).toBe(false);
  });

  it('does not add the gitignore line twice', async () => {
    const project = await makeProject();
    await writeFile(join(project, '.gitignore'), '.ghost-run/\n');
    expect(run(['--project', project]).code).toBe(0);
    expect(await readFile(join(project, '.gitignore'), 'utf8')).toBe('.ghost-run/\n');
    expect(manifestOf(project).gitignore).toEqual({ created: false, added: false });
  });

  it('defaults to the current folder', async () => {
    const project = await makeProject();
    const r = run([], project);
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(join(project, '.kiro', 'ghost-run', 'manifest.json'))).toBe(true);
  });

  it('refuses to overwrite without --force and changes nothing', async () => {
    const project = await makeProject();
    await mkdir(join(project, '.kiro', 'hooks'), { recursive: true });
    await writeFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), '{"mine":true}\n');
    const before = tree(project);
    const r = run(['--project', project]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('.kiro/hooks/ghost-gate.json');
    expect(r.stderr).toContain('--force');
    expect(tree(project)).toEqual(before);
    expect(await readFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), 'utf8')).toBe('{"mine":true}\n');

    expect(run(['--project', project, '--force']).code).toBe(0);
    expect(JSON.parse(await readFile(join(project, '.kiro', 'hooks', 'ghost-gate.json'), 'utf8')).hooks).toHaveLength(2);
  });

  it('refuses a second install without --force', async () => {
    const project = await makeProject();
    expect(run(['--project', project]).code).toBe(0);
    const before = tree(project);
    const manifestBefore = await readFile(join(project, '.kiro', 'ghost-run', 'manifest.json'), 'utf8');
    const r = run(['--project', project]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('manifest.json');
    expect(tree(project)).toEqual(before);
    expect(await readFile(join(project, '.kiro', 'ghost-run', 'manifest.json'), 'utf8')).toBe(manifestBefore);
  });

  it('--force re-installs idempotently: same files, same manifest, one gitignore line, wards still ours', async () => {
    const project = await makeProject();
    expect(run(['--project', project]).code).toBe(0);
    const files = tree(project);
    const manifest = await readFile(join(project, '.kiro', 'ghost-run', 'manifest.json'), 'utf8');
    const gitignore = await readFile(join(project, '.gitignore'), 'utf8');
    const second = run(['--project', project, '--force']);
    expect(second.code, second.stderr).toBe(0);
    expect(tree(project)).toEqual(files);
    expect(await readFile(join(project, '.kiro', 'ghost-run', 'manifest.json'), 'utf8')).toBe(manifest);
    expect(await readFile(join(project, '.gitignore'), 'utf8')).toBe(gitignore);
  });

  it('--uninstall removes exactly the manifest files and leaves everything else', async () => {
    const project = await makeProject();
    await mkdir(join(project, 'src'));
    await writeFile(join(project, 'src', 'app.js'), 'x\n');
    await mkdir(join(project, '.kiro', 'hooks'), { recursive: true });
    await writeFile(join(project, '.kiro', 'hooks', 'mine.json'), '{}\n');
    await writeFile(join(project, '.gitignore'), 'node_modules/\n');
    const before = new Map(tree(project).map((f) => [f, readFileSync(join(project, f), 'utf8')]));
    expect(run(['--project', project]).code).toBe(0);
    // Data of the gate itself (graveyard, statistics) is not in the manifest and stays.
    await mkdir(join(project, '.ghost-run'));
    await writeFile(join(project, '.ghost-run', 'graveyard.jsonl'), '{}\n');

    const r = run(['--project', project, '--uninstall']);
    expect(r.code, r.stderr).toBe(0);
    const after = tree(project).filter((f) => !f.startsWith('.ghost-run/'));
    expect(after).toEqual([...before.keys()].sort());
    for (const [f, text] of before) expect(readFileSync(join(project, f), 'utf8'), f).toBe(text);
    expect(existsSync(join(project, '.ghost-run', 'graveyard.jsonl'))).toBe(true);
    expect(existsSync(join(project, '.kiro', 'ghost-run'))).toBe(false);
    expect(existsSync(join(project, 'wards.yaml'))).toBe(false);
  });

  it('--uninstall removes the folders it created, and the .gitignore it created', async () => {
    const project = await makeProject();
    expect(run(['--project', project]).code).toBe(0);
    expect(run(['--project', project, '--uninstall']).code).toBe(0);
    expect(tree(project)).toEqual([]);
    expect(existsSync(join(project, '.kiro'))).toBe(false);
  });

  it('--uninstall keeps a file the user changed after the install, until --force', async () => {
    const project = await makeProject();
    expect(run(['--project', project]).code).toBe(0);
    await writeFile(join(project, 'wards.yaml'), 'wards: []\n');
    const r = run(['--project', project, '--uninstall']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('wards.yaml');
    expect(await readFile(join(project, 'wards.yaml'), 'utf8')).toBe('wards: []\n');
    expect(existsSync(join(project, '.kiro', 'ghost-run', 'manifest.json'))).toBe(true);
    expect(run(['--project', project, '--uninstall', '--force']).code).toBe(0);
    expect(tree(project)).toEqual([]);
  });

  it('--uninstall without a manifest exits 1 and changes nothing', async () => {
    const project = await makeProject();
    await writeFile(join(project, 'wards.yaml'), 'wards: []\n');
    const r = run(['--project', project, '--uninstall']);
    expect(r.code).toBe(1);
    expect(tree(project)).toEqual(['wards.yaml']);
  });

  it('--uninstall refuses a manifest that lists a path outside .kiro/ and wards.yaml', async () => {
    const project = await makeProject();
    expect(run(['--project', project]).code).toBe(0);
    await writeFile(join(project, 'victim.txt'), 'keep\n');
    const m = manifestOf(project);
    m.files.push({ path: '../victim.txt', sha256: 'x' }, { path: 'victim.txt', sha256: 'x' });
    await writeFile(join(project, '.kiro', 'ghost-run', 'manifest.json'), JSON.stringify(m));
    const r = run(['--project', project, '--uninstall']);
    expect(r.code).toBe(1);
    expect(existsSync(join(project, 'victim.txt'))).toBe(true);
    expect(existsSync(join(project, '.kiro', 'ghost-run', 'gate', 'ghost-gate.mjs'))).toBe(true);
  });

  it('rejects a missing project folder, unknown arguments, and a missing --project value', async () => {
    expect(run(['--project', join(tmpdir(), 'ghost-install-does-not-exist')]).code).toBe(1);
    expect(run(['--nope']).code).toBe(1);
    expect(run(['--project']).code).toBe(1);
    const help = run(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('--uninstall');
  });

  it('refuses to install into the repository that holds the installer', async () => {
    const r = run(['--project', REPO]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('refusing');
    // The same check holds for a copy of the power folder placed in a project.
    const project = await makeProject();
    await cp(POWER, join(project, 'integrations', 'power'), { recursive: true });
    const copy = run(['--project', project], tmpdir(), join(project, 'integrations', 'power', 'install-gate.mjs'));
    expect(copy.code).toBe(1);
    expect(existsSync(join(project, '.kiro'))).toBe(false);
  });
});

// Unit and process tests of world-scaffold (task 12.1, 12.3). [no-docker]
// Scaffolded files live only in temporary folders outside the repository.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWards } from '@ghost-run/wards-config';
import { describe, expect, it } from 'vitest';
import { scaffoldWorld } from '../lib/scaffold/scaffold.mjs';
import { RECORD_NAME } from '../lib/scaffold/run.mjs';
import { SCAFFOLD_FILES, renderTemplates } from '../lib/scaffold/templates.mjs';
import { makeTempStore } from './fixtures/index.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const HOOK_DIR = join(HERE, '..');
const REPO = join(HOOK_DIR, '..', '..');
const SCRIPT = join(HOOK_DIR, 'world-scaffold.mjs');

/**
 * Run the hook script with one event on STDIN.
 * @param {string} cwd
 * @param {Record<string, unknown>} event
 */
function runHook(cwd, event) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - started };
}

describe('templates', () => {
  const texts = renderTemplates('demo-world');
  it('contain only ASCII, no HTML comment opener, no URL', () => {
    for (const [file, text] of Object.entries(texts)) {
      expect(/^[\x09\x0a\x20-\x7e]*$/.test(text), file).toBe(true);
      expect(text.includes('<' + '!--'), file).toBe(false);
      expect(/https?:\/\//.test(text), file).toBe(false);
    }
  });
  it('cover exactly the scaffold file list', () => {
    expect(Object.keys(texts).sort()).toEqual([...SCAFFOLD_FILES].sort());
  });
  it('world.config.ts has the shape of the existing worlds and deterministic: false', () => {
    const own = texts['world.config.ts'];
    for (const world of ['playground-shell', 'drawer-arm']) {
      const real = readFileSync(join(REPO, 'worlds', world, 'world.config.ts'), 'utf8');
      for (const key of ['id', 'deterministic', 'wardsFile', 'create']) {
        expect(real, `${world} ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
        expect(own, `scaffold ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
      }
      expect(real).toMatch(/export default/);
    }
    expect(own).toMatch(/export default/);
    expect(own).toContain('deterministic: false');
    expect(own).toContain("wardsFile: './wards.yaml'");
  });
  it('wards.yaml parses like the one of drawer-arm (ok: true)', () => {
    expect(parseWards(texts['wards.yaml']).ok).toBe(true);
    const real = readFileSync(join(REPO, 'worlds', 'drawer-arm', 'wards.yaml'), 'utf8');
    expect(parseWards(real).ok).toBe(true);
  });
  it('contract.test.ts calls verifyWorld with a placeholder actionArb that names the world', () => {
    const t = texts['tests/contract.test.ts'];
    expect(t).toContain('verifyWorld');
    expect(t).toContain('define actionArb for demo-world');
    expect(t).toContain('deterministic: false');
  });
  it('README.md lists the six functions and P2 as not claimed', () => {
    const t = texts['README.md'];
    for (const fn of ['snapshot', 'step', 'diff', 'render', 'fingerprint', 'effectsOutside']) {
      expect(t).toContain(`\`${fn}(`);
    }
    expect(t).toMatch(/\| P2 \| Not claimed/);
  });
});

describe('scaffoldWorld', () => {
  it('names the rule for an invalid name and creates nothing', async () => {
    const tmp = makeTempStore();
    try {
      const r = await scaffoldWorld(tmp.dir, 'worlds/Bad_Name/a.ts');
      expect(r.status).toBe('invalid-name');
      expect(r.message).toContain('^[a-z][a-z0-9-]{0,63}$');
      expect(r.created).toEqual([]);
    } finally {
      tmp.cleanup();
    }
  });
  it('ignores paths outside worlds/<name>/', async () => {
    const tmp = makeTempStore();
    try {
      for (const p of ['core/src/a.ts', 'worlds/a.ts', null]) {
        expect((await scaffoldWorld(tmp.dir, p)).status).toBe('ignored');
      }
    } finally {
      tmp.cleanup();
    }
  });
});

describe('world-scaffold process', () => {
  it('scaffolds on PostFileCreate, writes the record, and is a no-op afterwards', () => {
    const tmp = makeTempStore();
    try {
      mkdirSync(join(tmp.dir, 'worlds', 'demo-world'), { recursive: true });
      const agentFile = join(tmp.dir, 'worlds', 'demo-world', 'notes.md');
      writeFileSync(agentFile, 'agent file');
      const create = { hook_event_name: 'PostFileCreate', cwd: tmp.dir, file_path: agentFile };

      const first = runHook(tmp.dir, create);
      expect(first.status).toBe(0);
      expect(first.ms).toBeLessThan(5_000);
      expect(first.stdout).toContain('next step: implement the six functions, then save to run contract-pbt');
      for (const f of SCAFFOLD_FILES) {
        expect(readFileSync(join(tmp.dir, 'worlds', 'demo-world', f), 'utf8').length).toBeGreaterThan(0);
      }
      const recordPath = join(tmp.dir, '.ghost-run', RECORD_NAME);
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      expect(record.status).toBe('created');
      expect(record.created).toEqual([...SCAFFOLD_FILES]);
      expect(readFileSync(agentFile, 'utf8')).toBe('agent file');

      // The create event of a generated file, then a following save event: no-ops.
      const generated = join(tmp.dir, 'worlds', 'demo-world', 'wards.yaml');
      const second = runHook(tmp.dir, { ...create, file_path: generated });
      expect(second.status).toBe(0);
      expect(second.stdout).toContain('Nothing to do');
      const save = runHook(tmp.dir, { ...create, hook_event_name: 'PostFileSave' });
      expect(save.status).toBe(0);
      expect(save.stdout).toBe('');
      expect(JSON.parse(readFileSync(recordPath, 'utf8'))).toEqual(record);
    } finally {
      tmp.cleanup();
    }
  });

  it('exits 0 and prints nothing for invalid JSON, empty STDIN, and a path outside worlds/', () => {
    const tmp = makeTempStore();
    try {
      const bad = spawnSync(process.execPath, [SCRIPT], { cwd: tmp.dir, input: '{nope', encoding: 'utf8' });
      expect([bad.status, bad.stdout]).toEqual([0, '']);
      const empty = spawnSync(process.execPath, [SCRIPT], { cwd: tmp.dir, input: '', encoding: 'utf8' });
      expect([empty.status, empty.stdout]).toEqual([0, '']);
      const other = runHook(tmp.dir, { hook_event_name: 'PostFileCreate', file_path: join(tmp.dir, 'a.ts') });
      expect([other.status, other.stdout]).toEqual([0, '']);
    } finally {
      tmp.cleanup();
    }
  });
  // Regression: a host path through a symbolic link (macOS /tmp) must still scaffold.
  it('scaffolds when file_path goes through a symbolic link to the workspace folder', () => {
    const tmp = makeTempStore();
    const alias = `${tmp.dir}-alias`;
    try {
      mkdirSync(join(tmp.dir, 'worlds', 'linked-root'), { recursive: true });
      writeFileSync(join(tmp.dir, 'worlds', 'linked-root', 'notes.md'), 'x');
      symlinkSync(tmp.dir, alias);
      const r = runHook(tmp.dir, {
        hook_event_name: 'PostFileCreate',
        file_path: join(alias, 'worlds', 'linked-root', 'notes.md'),
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('created');
      expect(readFileSync(join(tmp.dir, 'worlds', 'linked-root', 'wards.yaml'), 'utf8')).toContain('wards: []');
    } finally {
      rmSync(alias, { force: true });
      tmp.cleanup();
    }
  });
});

describe('.kiro/hooks/world-scaffold.json', () => {
  const file = JSON.parse(readFileSync(join(REPO, '.kiro', 'hooks', 'world-scaffold.json'), 'utf8'));
  it('has one disabled PostFileCreate entry with timeout 10', () => {
    expect(file.version).toBe('v1');
    expect(file.hooks).toHaveLength(1);
    const h = file.hooks[0];
    expect(h.trigger).toBe('PostFileCreate');
    expect(h.matcher).toBe('(^|/)worlds/[^/]+/');
    expect(h.action).toEqual({ type: 'command', command: 'node integrations/kiro-hook/world-scaffold.mjs' });
    expect(h.timeout).toBe(10);
    expect(h.enabled).toBe(false);
  });
});

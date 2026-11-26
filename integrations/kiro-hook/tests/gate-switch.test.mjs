import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '..', 'gate-switch.mjs');
const FILES = ['ghost-gate.json', 'docker-warmup.json'];

/** @param {string} name @param {string} matcher @param {string} script @param {number} timeout */
const entry = (name, matcher, script, timeout) => `    {
      "name": "${name}",
      "trigger": "PreToolUse",
      "matcher": "${matcher}",
      "action": { "type": "command", "command": "node integrations/kiro-hook/${script}" },
      "timeout": ${timeout},
      "enabled": false
    }`;
/** @param {string[]} entries */
const file = (entries) => `{\n  "version": "v1",\n  "hooks": [\n${entries.join(',\n')}\n  ]\n}\n`;

// The tests only ever touch a temporary folder, never the real .kiro/hooks.
/** @type {Record<string, string>} */
const SEED = {
  'ghost-gate.json': file([
    entry('a', 'shell', 'ghost-gate.mjs', 60),
    entry('b', 'write', 'ghost-gate.mjs', 60),
  ]),
  'docker-warmup.json': file([entry('w', 'shell', 'docker-warmup.mjs', 5)]),
};

/** @type {string} */
let dir = '';
/** @param {...string} args */
const run = (...args) =>
  spawnSync(process.execPath, [script, ...args, `--hooks-dir=${dir}`], { encoding: 'utf8' });
/** @param {string} n */
const read = (n) => readFileSync(join(dir, n), 'utf8');
/** @param {string} n */
const enabledOf = (n) => JSON.parse(read(n)).hooks.map((/** @type {{enabled: boolean}} */ h) => h.enabled);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gate-switch-'));
  for (const n of FILES) writeFileSync(join(dir, n), SEED[n]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('gate-switch', () => {
  it('on flips every entry in both files and changes only the enabled values', () => {
    const r = run('on');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Before:');
    expect(r.stdout).toContain('After:');
    expect(enabledOf('ghost-gate.json')).toEqual([true, true]);
    expect(enabledOf('docker-warmup.json')).toEqual([true]);
    for (const n of FILES) {
      expect(read(n)).toBe(SEED[n].replaceAll('"enabled": false', '"enabled": true'));
    }
  });

  it('off restores the original bytes and is idempotent', () => {
    run('on');
    expect(run('off').status).toBe(0);
    for (const n of FILES) expect(read(n)).toBe(SEED[n]);
    const again = run('off');
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('Nothing changed');
    for (const n of FILES) expect(read(n)).toBe(SEED[n]);
  });

  it('on twice leaves the files identical', () => {
    run('on');
    const first = FILES.map(read);
    expect(run('on').stdout).toContain('Already on');
    expect(FILES.map(read)).toEqual(first);
  });

  it('status prints the state and writes nothing', () => {
    const r = run('status');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('off, off');
    for (const n of FILES) expect(read(n)).toBe(SEED[n]);
  });

  it('refuses when a file is missing, and changes nothing', () => {
    rmSync(join(dir, 'docker-warmup.json'));
    const r = run('on');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/docker-warmup\.json.*missing/);
    expect(read('ghost-gate.json')).toBe(SEED['ghost-gate.json']);
  });

  it('refuses malformed JSON and a wrong entry shape, and changes nothing', () => {
    writeFileSync(join(dir, 'docker-warmup.json'), '{ not json');
    let r = run('on');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not valid JSON');
    expect(read('ghost-gate.json')).toBe(SEED['ghost-gate.json']);

    writeFileSync(join(dir, 'docker-warmup.json'), SEED['docker-warmup.json']);
    writeFileSync(join(dir, 'ghost-gate.json'), '{"version":"v1","hooks":[{"enabled":"yes"}]}');
    r = run('on');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('malformed');
    expect(read('docker-warmup.json')).toBe(SEED['docker-warmup.json']);
  });

  it('rejects an unknown mode', () => {
    expect(run('sideways').status).toBe(1);
  });
});

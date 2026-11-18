// Example and process tests of blacklight-steering (task 13.3). [no-docker]
// Hidden characters are built from escapes. Files live in temporary folders outside the repository.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listKiroFiles, runBlacklightHook } from '../lib/blacklight/run.mjs';
import { makeTempStore } from './fixtures/index.mjs';

const HOOK_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCRIPT = join(HOOK_DIR, 'blacklight-steering.mjs');
const LAST = ['.ghost-run', 'blacklight', 'last.txt'];

/** @param {string} cwd @param {string[]} args @param {unknown} event */
function runHook(cwd, event, args = []) {
  const started = performance.now();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: Math.round(performance.now() - started) };
}

/** @param {string} dir @param {string} rel @param {string} text */
function put(dir, rel, text) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text, 'utf8');
  return abs;
}

describe('blacklight-steering process', () => {
  it('reports findings for a .kiro markdown file with a hidden character: exit 1, STDOUT, STDERR, last.txt', () => {
    const tmp = makeTempStore();
    try {
      put(tmp.dir, '.kiro/steering/rule.md', 'be\u200Bnice\n');
      const r = runHook(tmp.dir, { hook_event_name: 'PostFileSave', file_path: '.kiro/steering/rule.md' });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('.kiro/steering/rule.md:1:3 zero-width');
      expect(r.stdout).toContain('outcome=findings findings=1 files=1');
      expect(r.stderr).toBe(r.stdout);
      expect(readFileSync(join(tmp.dir, ...LAST), 'utf8')).toBe(r.stdout);
      expect(/^[\n\x20-\x7e]*$/.test(r.stdout)).toBe(true);
      expect(r.ms).toBeLessThan(5000);
    } finally {
      tmp.cleanup();
    }
  });

  it('accepts an absolute path from the host', () => {
    const tmp = makeTempStore();
    try {
      const abs = put(tmp.dir, '.kiro/specs/x/design.md', 'a\u202Eb\n');
      const r = runHook(tmp.dir, { file_path: abs });
      expect(r.status).toBe(1);
    } finally {
      tmp.cleanup();
    }
  });

  it('is clean for an ordinary file: exit 0, STDERR empty, last.txt written', () => {
    const tmp = makeTempStore();
    try {
      put(tmp.dir, '.kiro/steering/ok.md', 'plain text\n');
      const r = runHook(tmp.dir, { file_path: '.kiro/steering/ok.md' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('outcome=clean findings=0 files=1\n');
      expect(r.stderr).toBe('');
      expect(readFileSync(join(tmp.dir, ...LAST), 'utf8')).toBe(r.stdout);
    } finally {
      tmp.cleanup();
    }
  });

  it('ignores a path outside .kiro/, bad JSON, and a missing path: exit 0, no output, no last.txt', () => {
    const tmp = makeTempStore();
    try {
      put(tmp.dir, 'src/a.md', 'a\u200Bb\n');
      for (const event of [{ file_path: 'src/a.md' }, { file_path: '../.kiro/x.md' }, {}, { file_path: 'x.kiro/a.md' }]) {
        const r = runHook(tmp.dir, event);
        expect(r.status).toBe(0);
        expect(r.stdout + r.stderr).toBe('');
      }
      const bad = spawnSync(process.execPath, [SCRIPT], { cwd: tmp.dir, input: 'not json', encoding: 'utf8' });
      expect(bad.status).toBe(0);
      expect(existsSync(join(tmp.dir, ...LAST))).toBe(false);
    } finally {
      tmp.cleanup();
    }
  });

  it('exits 2 with an error line for a saved file that cannot be read', () => {
    const tmp = makeTempStore();
    try {
      const r = runHook(tmp.dir, { file_path: '.kiro/missing.md' });
      expect(r.status).toBe(2);
      expect(r.stdout).toContain('outcome=error');
    } finally {
      tmp.cleanup();
    }
  });

  it('--all scans every regular file under .kiro/ (the pnpm blacklight script)', () => {
    const tmp = makeTempStore();
    try {
      put(tmp.dir, '.kiro/a.md', 'fine\n');
      put(tmp.dir, '.kiro/sub/b.md', 'x\u2066y\n');
      const r = runHook(tmp.dir, {}, ['--all']);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('.kiro/sub/b.md:1:2 bidi');
      expect(r.stdout).toContain('files=2');
    } finally {
      tmp.cleanup();
    }
  });
});

describe('blacklight-steering in process', () => {
  it('does not modify the scanned file', async () => {
    const tmp = makeTempStore();
    try {
      const abs = put(tmp.dir, '.kiro/hooks/h.json', '{"a":"b\u200Bc"}');
      const before = readFileSync(abs);
      await runBlacklightHook(JSON.stringify({ file_path: '.kiro/hooks/h.json' }), tmp.dir);
      expect(readFileSync(abs).equals(before)).toBe(true);
      expect(await listKiroFiles(tmp.dir)).toEqual(['.kiro/hooks/h.json']);
    } finally {
      tmp.cleanup();
    }
  });
});

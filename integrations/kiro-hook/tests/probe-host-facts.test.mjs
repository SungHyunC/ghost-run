import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'probe-host-facts.mjs');
const CANARY = 'sk-CANARY-probe-abc123';
const STDOUT_MARKER = 'GHOST-PROBE-STDOUT-MARKER';
const ALLOWED_KEYS = new Set([
  'hook_event_name',
  'fields',
  'toolInputFields',
  'toolName',
  'paths',
  'objectFields',
  'tool_input_digest',
  'denyTest',
  'askTest',
  'stdoutTest',
  'timeoutTest',
  // Emitted by the timeout modes in addition to timeoutTest.
  'phase',
  'at',
]);

/** @type {string[]} */
const tempDirs = [];

function makeCwd() {
  const dir = mkdtempSync(join(tmpdir(), 'ghost-probe-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} cwd
 * @param {string} stdin
 * @param {string[]} [args]
 */
function run(cwd, stdin, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, input: stdin, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** @param {string} cwd */
function eventsPath(cwd) {
  return join(cwd, '.ghost-run', 'probe', 'events.jsonl');
}

/** @param {string} cwd */
function readRecords(cwd) {
  return readFileSync(eventsPath(cwd), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('probe-host-facts', () => {
  it('records only the allowed keys and never the canary text', () => {
    const cwd = makeCwd();
    const event = {
      hook_event_name: 'PostToolUse',
      tool_name: 'fs_write',
      tool_input: { path: 'a/b.txt', text: CANARY, command: CANARY, old_str: CANARY },
      tool_response: { output: CANARY },
      content: CANARY,
      cwd: '/somewhere',
    };
    const r = run(cwd, JSON.stringify(event));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const raw = readFileSync(eventsPath(cwd), 'utf8');
    expect(raw).not.toContain(CANARY);
    const [rec] = readRecords(cwd);
    for (const key of Object.keys(rec)) expect(ALLOWED_KEYS.has(key)).toBe(true);
    expect(rec.hook_event_name).toBe('PostToolUse');
    expect(rec.toolName).toBe('fs_write');
    expect(rec.paths).toEqual(['a/b.txt']);
    expect(rec.objectFields).toEqual(['tool_response']);
    expect(rec.toolInputFields).toEqual(['command', 'old_str', 'path', 'text']);
  });

  it('digest holds only len and the sha256 of the value', () => {
    const cwd = makeCwd();
    const r = run(
      cwd,
      JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: CANARY } }),
    );
    expect(r.status).toBe(0);
    const [rec] = readRecords(cwd);
    expect(Object.keys(rec)).not.toContain('objectFields');
    const entry = rec.tool_input_digest.command;
    expect(Object.keys(entry).sort()).toEqual(['len', 'sha256']);
    expect(entry.len).toBe(CANARY.length);
    expect(entry.sha256).toBe(createHash('sha256').update(CANARY, 'utf8').digest('hex'));
  });

  it('records a path outside the workspace as <outside>', () => {
    const cwd = makeCwd();
    run(
      cwd,
      JSON.stringify({
        hook_event_name: 'PostFileSave',
        path: '/etc/passwd',
        targetFile: '../../elsewhere/x.txt',
        file_path: 'inside/ok.txt',
      }),
    );
    const [rec] = readRecords(cwd);
    expect(rec.paths).toEqual(['<outside>', 'inside/ok.txt']);
    expect(JSON.stringify(rec)).not.toContain('/etc/passwd');
  });

  it('never records a content-like top-level field as a path', () => {
    const cwd = makeCwd();
    run(
      cwd,
      JSON.stringify({
        hook_event_name: 'PostFileSave',
        file_content: CANARY,
        path: 'a/p.txt',
        targetFile: 'b/t.txt',
        file_path: 'c/f.txt',
        long_path: 'x'.repeat(2000),
        other_file: 'line1\n' + CANARY,
      }),
    );
    const raw = readFileSync(eventsPath(cwd), 'utf8');
    expect(raw).not.toContain(CANARY);
    const [rec] = readRecords(cwd);
    expect(rec.paths).toEqual(['a/p.txt', 'b/t.txt', 'c/f.txt']);
    expect(rec.fields).toContain('file_content');
  });

  it('exits 0 and prints nothing for invalid JSON and empty STDIN', () => {
    for (const input of ['{not json', '', 'null', '[1,2]']) {
      const cwd = makeCwd();
      const r = run(cwd, input);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    }
  });

  it('exits 0 and prints nothing when the store folder is unwritable', () => {
    const cwd = makeCwd();
    // A regular file where the folder .ghost-run must be makes mkdir fail.
    writeFileSync(join(cwd, '.ghost-run'), 'not a folder');
    const r = run(cwd, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'shell' }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(existsSync(eventsPath(cwd))).toBe(false);
  });

  it('--stdout-test prints exactly the marker line and records stdoutTest', () => {
    const cwd = makeCwd();
    const r = run(cwd, JSON.stringify({ hook_event_name: 'PostFileSave', path: 'x.txt' }), ['--stdout-test']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(STDOUT_MARKER + '\n');
    expect(readRecords(cwd)[0].stdoutTest).toBe('printed');
  });

  it('prints nothing in the default, deny, and ask modes for ordinary commands', () => {
    const event = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: 'ls' } });
    for (const args of [[], ['--deny-test'], ['--ask-test']]) {
      const r = run(makeCwd(), event, args);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    }
  });

  it('--deny-test exits 2 only for the fixed command', () => {
    const cwd = makeCwd();
    const mk = (/** @type {string} */ command) =>
      JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command } });
    const denied = run(cwd, mk('echo ghost-run-block-probe'), ['--deny-test']);
    expect(denied.status).toBe(2);
    expect(denied.stdout).toBe('');
    const other = run(cwd, mk('echo hello'), ['--deny-test']);
    expect(other.status).toBe(0);
    const records = readRecords(cwd);
    expect(records[0].denyTest).toBe('denied');
    expect(records[1].denyTest).toBeUndefined();
    expect(readFileSync(eventsPath(cwd), 'utf8')).not.toContain('ghost-run-block-probe');
  });

  it('--ask-test prints the ask JSON only for the fixed command', () => {
    const cwd = makeCwd();
    const mk = (/** @type {string} */ command) =>
      JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command } });
    const asked = run(cwd, mk('echo ghost-run-ask-probe'), ['--ask-test']);
    expect(asked.status).toBe(0);
    expect(JSON.parse(asked.stdout)).toEqual({
      hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'probe: ask test' },
    });
    expect(readRecords(cwd)[0].askTest).toBe('asked');
  });

  it.each(['entry', 'action'])('--timeout-test=%s writes start and end lines', (placement) => {
    const cwd = makeCwd();
    const r = run(cwd, JSON.stringify({ hook_event_name: 'PostFileSave', path: 'probe-scratch/a.txt' }), [
      `--timeout-test=${placement}`,
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const records = readRecords(cwd);
    expect(records.map((x) => x.phase)).toEqual(['start', 'end']);
    expect(records.every((x) => x.timeoutTest === placement)).toBe(true);
    expect(records[1].at - records[0].at).toBeGreaterThanOrEqual(2500);
  });
});

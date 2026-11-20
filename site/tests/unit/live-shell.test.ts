// Ghost Shell adapter, run in Node with the inline SQL executor.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { SqlExecutor } from '@ghost-run/playground-shell';
import { beforeAll, describe, expect, it } from 'vitest';
import { createShellEngine } from '../../src/live/shell';
import { FIXED, PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveEngine, LiveRun } from '../../src/live/types';

const ROOT = resolve(__dirname, '../../..');
const wardsText = readFileSync(resolve(ROOT, 'apps/ghost-shell/wards.yaml'), 'utf8');

let sql: SqlExecutor;
let engine: LiveEngine;

beforeAll(async () => {
  sql = await initInlineSql();
  engine = createShellEngine({ sql, wardsText });
});

const shell = (...actions: string[]) => engine.run({ world: 'shell', actions });

function ran(a: LiveAnswer): LiveRun {
  if (a.status !== 'ran') throw new Error(`expected ran, got ${a.status}`);
  return a.run;
}

const preset = (id: string) => {
  const p = PRESETS.shell.find((x) => x.id === id);
  if (!p || p.input.world !== 'shell') throw new Error(id);
  return p;
};
const fixedOf = (id: string) => {
  const f = FIXED[id];
  if (!f || f.world !== 'shell') throw new Error(id);
  return f;
};

describe('Ghost Shell adapter', () => {
  it('blocks DROP TABLE users with 1,206 rows lost and an equal fingerprint', async () => {
    const p = preset('shell-drop-users');
    const run = ran(await engine.run(p.input));
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.violatedWardIds).toContain('no-data-loss');
    expect(run.plan.facts['rowsLost']).toBe(1206);
    expect(run.plan.checks[0]).toMatchObject({ label: 'rows lost, at most 0', ok: false });
    expect(run.plan.p1.equal).toBe(true);
    expect(run.ward).toEqual({ id: 'no-data-loss', kind: 'sql', line: 'kind: sql \u00B7 tables: users, orders' });
  });

  it('passes the fixed plan with 0 rows lost', async () => {
    const run = ran(await engine.run(fixedOf('shell-drop-users')));
    expect(run.plan.verdict).toBe('pass');
    expect(run.plan.facts['rowsLost']).toBe(0);
    expect(run.plan.copyAfter).toMatchObject({ kind: 'shell', tables: [{ name: 'users', state: 'soft' }, { name: 'orders', state: 'intact' }] });
  });

  it('blocks rm -rf ./data ./build by protect-data and adds the extra chip', async () => {
    const run = ran(await engine.run(preset('shell-rm-data-build').input));
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.violatedWardIds).toContain('protect-data');
    expect(run.plan.checks).toHaveLength(2);
    expect(run.plan.checks[1]).toMatchObject({ label: 'protect-data', ok: false });
    expect(run.plan.facts['entriesGone']).toBe(2);
    const entries = run.plan.copyAfter.kind === 'shell' ? (run.plan.copyAfter.entries ?? []) : [];
    expect(entries.filter((e) => e.state === 'gone').map((e) => e.name)).toEqual(['build', 'data']);
  });

  it('passes the fixed rm plan', async () => {
    const run = ran(await engine.run(fixedOf('shell-rm-data-build')));
    expect(run.plan.verdict).toBe('pass');
    expect(run.plan.p1.equal).toBe(true);
  });

  it('passes npm test', async () => {
    const run = ran(await engine.run(preset('shell-npm-test').input));
    expect(run.plan.verdict).toBe('pass');
    expect(run.plan.facts).toMatchObject({ rowsLost: 0, entriesGone: 0, entriesNew: 0, networkAttempts: 0 });
  });

  it('warns on curl to a reserved host and names the destination', async () => {
    const run = ran(await shell('curl http://registry.example/x'));
    expect(run.plan.verdict).toBe('warn');
    expect(run.plan.effectsOutside.join(' ')).toContain('registry.example');
  });

  it('answers unsupported with a fixed reason and no echo of the input', async () => {
    for (const line of ['git status', 'echo $(echo SECRETWORD)', 'zzfoo --token=SECRETWORD']) {
      const a = await shell(line);
      expect(a.status).toBe('unsupported');
      if (a.status === 'unsupported') {
        expect(a.reason).not.toContain('SECRETWORD');
        expect(a.reason).not.toContain('zzfoo');
        expect(a.reason).not.toContain('git');
        expect(a.stepIndexes).toEqual([0]);
      }
    }
  });

  it('answers unsupported when the SQL watchdog fires', async () => {
    const watchdog: SqlExecutor = {
      async run(req) {
        if (req.sql.includes('WATCH')) return { ok: false, stderr: 'sql statement exceeded the watchdog', watchdog: true } as never;
        return sql.run(req);
      },
    };
    const e = createShellEngine({ sql: watchdog, wardsText });
    const a = await e.run({ world: 'shell', actions: ['sqlite3 app.db "SELECT WATCH"'] });
    expect(a.status).toBe('unsupported');
  });

  it('rejects an empty plan and fails for a broken wards file', async () => {
    expect(await engine.run({ world: 'shell', actions: [] })).toEqual({ status: 'rejected', problem: 'empty' });
    const bad = createShellEngine({ sql, wardsText: 'not: [valid' });
    expect(await bad.run({ world: 'shell', actions: ['ls'] })).toEqual({ status: 'failed', cause: 'internal' });
  });

  it('lists the visible entries in the reality scene and never the .env value', async () => {
    const run = ran(await shell('ls'));
    expect(run.reality.kind).toBe('shell');
    if (run.reality.kind === 'shell') {
      expect((run.reality.entries ?? []).map((e) => e.name)).toEqual(['app.db', 'build', 'data', 'package.json', 'README.md']);
      expect(run.reality.tables).toEqual([
        { name: 'users', rows: 1206 },
        { name: 'orders', rows: 3 },
      ]);
    }
    expect(JSON.stringify(run)).not.toContain('sk-CANARY');
    expect(JSON.stringify(run)).not.toContain('.env');
  });

  it('runs serially and survives an executor that throws', async () => {
    const boom: SqlExecutor = { run: () => Promise.reject(new Error('boom')) };
    const e = createShellEngine({ sql: boom, wardsText });
    expect(await e.run({ world: 'shell', actions: ['ls'] })).toEqual({ status: 'failed', cause: 'run' });
    const [a, b] = await Promise.all([shell('ls'), shell('ls')]);
    expect(a.status).toBe('ran');
    expect(b.status).toBe('ran');
  });
});

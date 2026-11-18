import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { compilePathSet, renderMessage } from '@ghost-run/core';
import type { Change, WardSet } from '@ghost-run/core';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor, PlaygroundAction, VirtualProject } from '@ghost-run/playground-shell';
import { parseWards } from '@ghost-run/wards-config';
import type { PlaygroundRun } from '../../src/pipeline/run-playground';
import { runPlayground } from '../../src/pipeline/run-playground';
import { buildProject } from '../../src/scenarios/project';
import { SCENARIOS } from '../../src/scenarios/scenarios';
import type { Scenario } from '../../src/scenarios/scenarios';

const here = dirname(fileURLToPath(import.meta.url));
const parsed = parseWards(readFileSync(resolve(here, '../../wards.yaml'), 'utf8'));
if (!parsed.ok) throw new Error('the Default_Wards_File does not parse');
const wardSet: WardSet = parsed.wardSet;

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});

function scenario(id: number): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (s === undefined) throw new Error(`scenario ${id} missing`);
  return s;
}

async function run(plan: readonly PlaygroundAction[], s?: Scenario): Promise<PlaygroundRun> {
  const project: VirtualProject = await buildProject(sql);
  return runPlayground({
    project,
    plan,
    wardSet,
    sql,
    ...(s?.provenance === undefined ? {} : { provenance: s.provenance }),
  });
}

const allChanges = (r: PlaygroundRun): Change[] => r.report.changes.flat();

/** Paths of `file-deleted` Changes matched by the paths of the named path ward (the same PathSet). */
function deletedUnder(r: PlaygroundRun, wardId: string): string[] {
  const ward = wardSet.wards.find((w) => w.id === wardId);
  if (ward === undefined || ward.kind !== 'path') throw new Error(`no path ward ${wardId}`);
  const set = compilePathSet(ward.paths, { caseSensitive: true });
  return allChanges(r)
    .filter((c) => c.kind === 'file-deleted' && typeof c.path === 'string')
    .map((c) => c.path as string)
    .filter((p) => set.test(p).matched);
}

const wardClaims = (r: PlaygroundRun) => ({ p5: r.claims.p5Claimed, p6: r.claims.p6Claimed });

describe('Scenario 1: drop the users table', () => {
  it('blocks by no-data-loss with the row-loss reason and the rendered message', async () => {
    const r = await run(scenario(1).plan);
    expect(r.verdict).toBe('block');
    expect(r.wardVerdict.violations[0]).toMatchObject({
      wardId: 'no-data-loss',
      reason: 'would delete 1,206 rows from users',
    });
    expect(r.claims.p5Claimed).toBe(true);
    expect(r.claims.p6Claimed).toBe(true);
    expect(r.message).toBe(renderMessage(r.wardVerdict, { wardCount: 3, claims: { p5: true, p6: true } }));
  });

  it('passes the fixed plan', async () => {
    const fixed = scenario(1).fixedPlan;
    if (fixed === undefined) throw new Error('fixed plan missing');
    expect((await run(fixed)).verdict).toBe('pass');
  });
});

describe('Scenario 2: remove data and build', () => {
  it('blocks by protect-data with one violation per deleted path under data/', async () => {
    const r = await run(scenario(2).plan);
    expect(r.verdict).toBe('block');
    expect(r.wardVerdict.violations.length).toBeGreaterThan(0);
    expect(r.wardVerdict.violations.every((v) => v.wardId === 'protect-data')).toBe(true);
    const deleted = deletedUnder(r, 'protect-data');
    expect(deleted.length).toBeGreaterThan(0);
    expect(deleted.every((p) => p === 'data' || p.startsWith('data/'))).toBe(true);
    expect(r.wardVerdict.violations).toHaveLength(deleted.length);
    expect(new Set(r.wardVerdict.violations.map((v) => v.reason))).toEqual(
      new Set(deleted.map((p) => `would delete protected path ${p}`)),
    );
    expect(r.wardVerdict.violations.some((v) => v.reason.includes('build'))).toBe(false);
    expect(allChanges(r).some((c) => c.kind === 'file-deleted' && c.path === 'build/out.js')).toBe(true);
  });

  it('passes the fixed plan', async () => {
    const fixed = scenario(2).fixedPlan;
    if (fixed === undefined) throw new Error('fixed plan missing');
    expect((await run(fixed)).verdict).toBe('pass');
  });
});

describe('Scenario 3: possession by README', () => {
  it('blocks by no-secret-egress on behavior and on content', async () => {
    const s = scenario(3);
    const r = await run(s.plan, s);
    expect(r.verdict).toBe('block');
    const v = r.wardVerdict.violations;
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.wardId === 'no-secret-egress')).toBe(true);
    expect(r.report.observedEvents).toContainEqual(expect.objectContaining({ kind: 'secret-read', path: '.env' }));
    expect(r.report.observedEvents).toContainEqual(
      expect.objectContaining({ kind: 'network-attempt', destination: 'setup-check.example:443', stepIndex: 0 }),
    );
    expect(v.some((x) => x.reason.includes('setup-check.example:443 at step 0'))).toBe(true);
    expect(v.some((x) => x.reason.includes('secret file .env') && x.reason.includes('(encoding: raw)'))).toBe(true);
  });
});

describe('Scenarios 4 and 5', () => {
  it('Scenario 4 passes with no Change, no event, and no notice', async () => {
    const r = await run(scenario(4).plan);
    expect(r.verdict).toBe('pass');
    expect(allChanges(r)).toEqual([]);
    expect(r.report.observedEvents).toEqual([]);
    expect(r.wardVerdict.notices).toEqual([]);
  });

  it('Scenario 5 blocks by protect-data with the Changes of `rm -rf data`', async () => {
    const r = await run(scenario(5).plan);
    const direct = await run([{ command: 'rm -rf data' }]);
    expect(r.verdict).toBe('block');
    expect(r.wardVerdict.violations.length).toBeGreaterThan(0);
    expect(r.wardVerdict.violations.every((v) => v.wardId === 'protect-data')).toBe(true);
    expect(r.report.changes).toEqual(direct.report.changes);
    expect(r.wardVerdict.violations).toHaveLength(deletedUnder(r, 'protect-data').length);
  });
});

describe('determinism and timing', () => {
  it.each([1, 2, 3, 4, 5])('Scenario %i run twice gives equal report, verdict, and message', async (id) => {
    const s = scenario(id);
    const a = await run(s.plan, s);
    const b = await run(s.plan, s);
    expect(b.report).toEqual(a.report);
    expect(b.wardVerdict).toEqual(a.wardVerdict);
    expect(b.verdict).toBe(a.verdict);
    expect(b.message).toBe(a.message);
    expect(wardClaims(b)).toEqual(wardClaims(a));
  });

  it('runs a Scenario under 1.0 s and a 50-command plan under 2.0 s', async () => {
    const s = scenario(2);
    const project = await buildProject(sql);
    const t0 = performance.now();
    await runPlayground({ project, plan: s.plan, wardSet, sql });
    const scenarioMs = performance.now() - t0;

    const cmds = ['ls', 'pwd', 'cat package.json', 'cat README.md', 'ls data'];
    const plan: PlaygroundAction[] = Array.from({ length: 50 }, (_, i) => ({ command: cmds[i % cmds.length] as string }));
    const project2 = await buildProject(sql);
    const t1 = performance.now();
    const r = await runPlayground({ project: project2, plan, wardSet, sql });
    const planMs = performance.now() - t1;

    console.log(`[timing] scenario 2 run: ${scenarioMs.toFixed(1)} ms; 50-command plan: ${planMs.toFixed(1)} ms`);
    expect(r.unsupportedSteps).toEqual([]);
    expect(scenarioMs).toBeLessThan(1000);
    expect(planMs).toBeLessThan(2000);
  });
});

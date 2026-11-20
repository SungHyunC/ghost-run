// Env-gated measurement of the six demo runs (skipped unless GHOST_SITE_RUNS_OUT is set). Run it through
// scripts/record-runs.mjs. It runs the demo plan and the fixed plan of each world through the real world
// package and the app pipeline, in Node, and writes the Runs_File text to GHOST_SITE_RUNS_OUT.
// It reads no clock, no random source, and no network. It never reads the shell fixture's .env.
/// <reference path="../../worlds/playground-shell/src/sql-js.d.ts" />
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWards } from '@ghost-run/wards-config';
import type { Effect, GhostReport, Scene, Ward, WardSet, WardVerdict } from '@ghost-run/core';
import { createGhostHandWorld, parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import { runGhostCloudPlan } from '@ghost-run/ghost-cloud';
import { createPlaygroundWorld, initInlineSql } from '@ghost-run/playground-shell';
import type { PlaygroundAction, VirtualProject } from '@ghost-run/playground-shell';
import { describe, expect, it } from 'vitest';
import { probeCapabilities } from '../../apps/ghost-hand/src/capabilities';
import { createInlineExecutor } from '../../apps/ghost-hand/src/exec/inline';
import { parsePlanFile as parseHandPlan } from '../../apps/ghost-hand/src/plan/plan-file';
import { runGhostHand } from '../../apps/ghost-hand/src/pipeline/run';
import { runPlayground } from '../../apps/ghost-shell/src/pipeline/run-playground';
import { parsePlanFile as parseShellPlan } from '../../apps/ghost-shell/src/plan/plan-file';
import { buildProject } from '../../apps/ghost-shell/src/scenarios/project';
import { formatCount, formatForce, formatRate } from '../src/engine/format';
import type {
  CheckRow,
  CopyScene,
  HandVariantParams,
  PlanRecord,
  RealityScene,
  RunsFile,
  WorldRecord,
} from '../src/data/types';
import { tileLabel } from './lib/tile-label';

const OUT = process.env['GHOST_SITE_RUNS_OUT'];

const repo = new URL('../../', import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8');

/** The joint-limit sentence of the physics ward (core/src/wards.ts); the fallback when no structured field exists. */
const JOINT_LIMIT_PATTERN = /joint limit exceeded in variant (variant-[0-9]+)/g;

type Role = 'plan' | 'fixed';

function loadWards(rel: string): WardSet {
  const parsed = parseWards(read(rel));
  if (!parsed.ok) throw new Error(`${rel} does not parse`);
  return parsed.wardSet;
}

function wardOf<K extends Ward['kind']>(set: WardSet, id: string, kind: K): Extract<Ward, { kind: K }> {
  const ward = set.wards.find((w) => w.id === id);
  if (ward === undefined || ward.kind !== kind) throw new Error(`ward ${id} of kind ${kind} not found`);
  return ward as Extract<Ward, { kind: K }>;
}

/** The record script exits non-zero when a run gives an unexpected verdict or a changed reality. */
function expectRun(world: string, role: Role, verdict: string, p1Equal: boolean): void {
  const want = role === 'plan' ? 'block' : 'pass';
  if (verdict !== want) throw new Error(`${world} ${role}: expected verdict ${want}, got ${verdict}`);
  if (!p1Equal) throw new Error(`${world} ${role}: the fingerprint of reality changed during the ghost run`);
}

function violatedIds(verdict: WardVerdict): string[] {
  return [...new Set(verdict.violations.map((v) => v.wardId))].sort();
}

/** Destinations of effects that leave the copy, sorted and unique. */
function destinations(effects: readonly (readonly Effect[])[], report: Pick<GhostReport<unknown>, 'observedEvents'>): string[] {
  const out = new Set<string>();
  for (const step of effects) for (const e of step) out.add(e.destination);
  for (const ev of report.observedEvents) {
    if (ev.kind === 'network-attempt' && ev.destination !== undefined) out.add(ev.destination);
  }
  return [...out].sort();
}

// ---- Shell -----------------------------------------------------------------------------------------

interface ShellScene {
  files: { path: string; type: string }[];
  databases: { path: string; tables: { name: string; rows: number }[] }[];
}

const asShellScene = (s: Scene): ShellScene => s as unknown as ShellScene;

const SHELL_SHOWN_FILES = ['app.db', 'app.db.bak', 'package.json', 'data'];

function shellFiles(scene: ShellScene): string[] {
  const present = new Set(scene.files.map((f) => f.path));
  return SHELL_SHOWN_FILES.filter((p) => present.has(p)).map((p) => (p === 'data' ? 'data/' : p));
}

function shellTableRows(scene: ShellScene, db: string): Map<string, number> {
  const rows = new Map<string, number>();
  for (const d of scene.databases) {
    if (d.path !== db) continue;
    for (const t of d.tables) rows.set(t.name, t.rows);
  }
  return rows;
}

async function recordShell(): Promise<WorldRecord> {
  const wardSet = loadWards('apps/ghost-shell/wards.yaml');
  const ward = wardOf(wardSet, 'no-data-loss', 'sql');
  const sql = await initInlineSql();

  const planOf = (file: string): { commands: string[]; actions: readonly PlaygroundAction[] } => {
    const parsed = parseShellPlan(read(`apps/ghost-shell/plans/${file}`));
    if (!parsed.ok) throw new Error(`${file} invalid: ${JSON.stringify(parsed.errors)}`);
    return { commands: parsed.plan.actions.map((a) => a.command), actions: parsed.plan.actions };
  };

  let reality: RealityScene | undefined;

  const one = async (file: string, role: Role): Promise<PlanRecord> => {
    const { commands, actions } = planOf(file);
    const project: VirtualProject = await buildProject(sql);
    // The pipeline calls fingerprint() before and after the ghost run; the wrapper keeps both hashes.
    const hashes: string[] = [];
    const run = await runPlayground({
      project,
      plan: actions,
      wardSet,
      sql,
      worldFactory: (p, o) => {
        const world = createPlaygroundWorld(p, o);
        return {
          ...world,
          fingerprint: async () => {
            const fp = await world.fingerprint();
            hashes.push(fp.hash);
            return fp;
          },
        };
      },
    });
    const before = hashes[0];
    const after = hashes[hashes.length - 1];
    if (before === undefined || after === undefined || hashes.length < 2) throw new Error('shell: fingerprints missing');
    const p1 = { equal: before === after, before, after };
    expectRun('shell', role, run.verdict, p1.equal);

    const first = run.report.snapshots[0];
    const last = run.report.snapshots[run.report.snapshots.length - 1];
    if (first === undefined || last === undefined) throw new Error('shell: snapshots missing');
    const sceneBefore = asShellScene(first.state);
    const sceneAfter = asShellScene(last.state);
    const rowsBefore = shellTableRows(sceneBefore, 'app.db');
    const rowsAfter = shellTableRows(sceneAfter, 'app.db');

    if (reality === undefined) {
      reality = {
        kind: 'shell',
        root: 'project/',
        tables: ward.tables.flatMap((name) => {
          const rows = rowsBefore.get(name);
          return rows === undefined ? [] : [{ name, rows }];
        }),
        files: shellFiles(sceneBefore),
      };
    }

    // A table that keeps its rows but is the target of an UPDATE is a soft delete ("deleted_at = 1").
    const update = /UPDATE\s+(\w+)\s+SET\s+([^;"']+)/i.exec(commands.join(' '));
    type ShellTable = Extract<CopyScene, { kind: 'shell' }>['tables'][number];
    const tables = ward.tables.flatMap((name): ShellTable[] => {
      const was = rowsBefore.get(name);
      if (was === undefined) return [];
      const now = rowsAfter.get(name);
      if (now === undefined) return [{ name, rows: 0, state: 'dropped' }];
      if (update?.[1] === name) return [{ name, rows: now, state: 'soft', note: (update[2] ?? '').trim() }];
      return [{ name, rows: now, state: 'intact' }];
    });

    let rowsLost = 0;
    const lostByTable: string[] = [];
    for (const name of ward.tables) {
      const was = rowsBefore.get(name) ?? 0;
      const lost = Math.max(0, was - (rowsAfter.get(name) ?? 0));
      rowsLost += lost;
      if (lost > 0) lostByTable.push(`${formatCount(lost)} from ${name}`);
    }
    const checks: CheckRow[] = [
      {
        label: `rows lost, at most ${ward.max_rows_lost}`,
        measured: lostByTable.length > 0 ? lostByTable.join(', ') : '0',
        ok: rowsLost <= ward.max_rows_lost,
      },
    ];

    return {
      commands,
      display: commands.join(' && '),
      verdict: run.verdict,
      violatedWardIds: violatedIds(run.wardVerdict),
      checks,
      effectsOutside: destinations(run.report.effectsOutside, run.report),
      p1,
      copyAfter: { kind: 'shell', tables, files: shellFiles(sceneAfter) },
      facts: { rowsLost },
      message: run.message,
    };
  };

  const plan = await one('scenario-1.json', 'plan');
  const fixed = await one('scenario-1-fixed.json', 'fixed');
  if (reality === undefined) throw new Error('shell: reality missing');
  return {
    id: 'shell',
    ward: { id: ward.id, kind: 'sql', line: `kind: sql \u00B7 tables: ${ward.tables.join(', ')}` },
    reality,
    plan,
    fixed,
  };
}

// ---- Hand ------------------------------------------------------------------------------------------

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

async function recordHand(): Promise<WorldRecord> {
  const wardSet = loadWards('worlds/drawer-arm/wards.yaml');
  const ward = wardOf(wardSet, 'gentle-hands', 'physics');
  const cfg = parseVariantConfig(read('worlds/drawer-arm/variant-config.json'));
  if (!cfg.ok) throw new Error('variant-config.json invalid');
  const seed = cfg.config.defaultSeed;
  const count = cfg.config.defaultCount;
  if (seed !== 42 || count !== 8) throw new Error(`variant-config.json: expected seed 42 and 8 variants, got ${seed} and ${count}`);
  const caps = probeCapabilities();

  const one = async (file: string, role: Role): Promise<PlanRecord> => {
    const parsed = parseHandPlan(read(`apps/ghost-hand/plans/${file}`));
    if (!parsed.ok) throw new Error(`${file} invalid: ${JSON.stringify(parsed.errors)}`);
    const actions: readonly GhostHandAction[] = parsed.plan.actions;
    const world = await createGhostHandWorld({ recordFrames: true });
    const executor = createInlineExecutor(() => createGhostHandWorld());
    try {
      const run = await runGhostHand({
        plan: actions,
        wardSet,
        variantConfig: cfg.config,
        seed,
        variantCount: count,
        world,
        executor,
        evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
        planOrigin: parsed.plan.origin,
      });
      expectRun('hand', role, run.verdict, run.p1.equal);

      const base = run.rows[0];
      if (base === undefined || base.id !== 'base') throw new Error('hand: base row missing');
      const variants = run.rows.slice(1);
      if (variants.length !== count || run.variantResults.length !== count) throw new Error('hand: variant count mismatch');

      // Joint-limit variants: the structured field of the variant results; the sentence of the ward
      // violation is the fallback, and the run fails when the text names a joint limit but no id is found.
      const structured = run.variantResults.filter((v) => v.jointLimitExceeded === true).map((v) => v.variantId);
      const reasons = run.wardVerdict.violations.map((v) => v.reason);
      const fromText = reasons.flatMap((r) => [...r.matchAll(JOINT_LIMIT_PATTERN)].map((m) => m[1] ?? ''));
      const mentions = reasons.some((r) => r.includes('joint limit'));
      let jointIds = [...new Set(structured)].sort();
      if (jointIds.length === 0) jointIds = [...new Set(fromText)].sort();
      if (mentions && jointIds.length === 0) throw new Error('hand: the verdict names a joint limit but no variant id was found');
      if (structured.length > 0 && fromText.length > 0 && structured.slice().sort().join() !== [...new Set(fromText)].sort().join()) {
        throw new Error('hand: structured joint-limit variants differ from the verdict text');
      }

      const tiles = variants.map((row, i) => {
        const result = run.variantResults[i];
        if (result === undefined) throw new Error('hand: variant result missing');
        const [hx, hy, hz] = row.params.handleOffsetM;
        const params: HandVariantParams = {
          drawerFrictionN: row.params.drawerFrictionN,
          drawerMassKg: row.params.drawerMassKg,
          handleOffsetM: [hx, hy, hz],
          sensorNoiseM: row.params.sensorNoiseM,
          commandDelaySteps: row.params.commandDelaySteps,
        };
        return {
          id: row.id,
          label: tileLabel(params),
          outcome: result.success ? ('passed' as const) : ('failed' as const),
          jointLimit: jointIds.includes(row.id),
          params,
        };
      });

      const succeeded = run.variantResults.filter((v) => v.success).length;
      const maxForceN = Math.max(...run.variantResults.map((v) => v.contactForceN ?? 0));
      const vaseVariants = variants.filter((r) => r.vaseTouched).length;
      const rate = succeeded / count;
      const checks: CheckRow[] = [
        {
          label: `success, at least ${Math.round(ward.min_success_rate * 100)}%`,
          measured: formatRate(succeeded, count),
          ok: rate >= ward.min_success_rate,
        },
        {
          label: `contact force, at most ${ward.max_contact_force_n} N`,
          measured: formatForce(maxForceN),
          ok: maxForceN <= ward.max_contact_force_n,
        },
        {
          label: `never touch the ${ward.forbidden_contacts.join(', ')}`,
          measured: vaseVariants === 0 ? 'untouched' : 'touched',
          ok: vaseVariants === 0,
        },
      ];

      const effects = destinations([actions.flatMap((a) => world.effectsOutside(a))], { observedEvents: [] });
      const copyAfter: CopyScene = { kind: 'hand', tiles };
      return {
        commands: [parsed.plan.name],
        display: parsed.plan.name,
        verdict: run.verdict,
        violatedWardIds: violatedIds(run.wardVerdict),
        checks,
        effectsOutside: effects,
        p1: { equal: run.p1.equal, before: run.p1.before, after: run.p1.after },
        copyAfter,
        facts: {
          drawerOpeningM: round(base.drawerDisplacementM, 4),
          jointLimitVariants: jointIds.join(','),
          maxForceN: round(maxForceN, 2),
          succeeded,
          total: count,
          vaseTouched: vaseVariants,
        },
        message: run.message,
      };
    } finally {
      executor.dispose();
      world.dispose();
    }
  };

  const plan = await one('first.plan.json', 'plan');
  const fixed = await one('revised.plan.json', 'fixed');
  return {
    id: 'hand',
    ward: { id: ward.id, kind: 'physics', line: 'kind: physics' },
    reality: { kind: 'hand', label: 'the real arm' },
    plan,
    fixed,
  };
}

// ---- Cloud -----------------------------------------------------------------------------------------

interface CloudBucket {
  name: string;
  protected: boolean;
  objects: { key: string }[];
}

const cloudBuckets = (s: Scene): { name: string; objects: string[]; protected: boolean }[] =>
  ((s as unknown as { buckets: CloudBucket[] }).buckets).map((b) => ({
    name: b.name,
    objects: b.objects.map((o) => o.key),
    protected: b.protected,
  }));

async function recordCloud(): Promise<WorldRecord> {
  const wardSet = loadWards('worlds/ghost-cloud/wards.yaml');
  const ward = wardOf(wardSet, 'no-bucket-delete', 'path');
  const pattern = ward.paths[0] ?? '';
  let reality: RealityScene | undefined;

  const one = async (file: string, role: Role): Promise<PlanRecord> => {
    const lines = read(`worlds/ghost-cloud/demo/${file}`)
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
    const run = await runGhostCloudPlan(lines, wardSet);
    expectRun('cloud', role, run.verdict, run.p1.equal);

    const before = cloudBuckets(run.scenes.before);
    const after = cloudBuckets(run.scenes.after);
    reality ??= { kind: 'cloud', buckets: before };
    const kept = new Set(after.map((b) => b.name));
    const removed = before.filter((b) => !kept.has(b.name));
    const removedProtected = removed.some((b) => b.protected);
    const names = removed.map((b) => b.name).join(', ');
    const checks: CheckRow[] = [
      {
        label: `never delete ${pattern}`,
        measured: removedProtected ? `${names} deleted` : `${names} is not ${pattern}`,
        ok: !removedProtected,
      },
    ];
    return {
      commands: lines,
      display: lines.join(' && '),
      verdict: run.verdict,
      violatedWardIds: violatedIds(run.wardVerdict),
      checks,
      effectsOutside: destinations(run.report.effectsOutside, run.report),
      p1: { equal: run.p1.equal, before: run.p1.before, after: run.p1.after },
      copyAfter: { kind: 'cloud', buckets: after },
      facts: {
        bucketsRemoved: removed.length,
        objectsRemoved: removed.reduce((n, b) => n + b.objects.length, 0),
        removedBuckets: removed.map((b) => b.name).join(','),
      },
      message: run.message,
    };
  };

  const plan = await one('01-delete-protected-bucket.txt', 'plan');
  const fixed = await one('03-delete-temporary-bucket.txt', 'fixed');
  if (reality === undefined) throw new Error('cloud: reality missing');
  return {
    id: 'cloud',
    ward: { id: ward.id, kind: 'path', line: `kind: path \u00B7 deny ${ward.deny.join(', ')} on ${ward.paths.join(', ')}` },
    reality,
    plan,
    fixed,
  };
}

describe.skipIf(OUT === undefined)('record-runs', () => {
  it('records the six demo runs', async () => {
    const shell = await recordShell();
    const hand = await recordHand();
    const cloud = await recordCloud();
    const file: RunsFile = {
      format: 'ghost-site-runs',
      version: 1,
      seed: 42,
      variantCount: 8,
      worlds: { shell, hand, cloud },
    };
    writeFileSync(OUT as string, JSON.stringify(file));
    expect(file.worlds.hand.plan.copyAfter.kind).toBe('hand');
  });
});

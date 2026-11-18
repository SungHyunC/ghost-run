// Demo scenario tests (task 11.6) on the pure pipeline in Node: real MuJoCo, inline executor, default seed and
// count of variant-config.json, the shipped Wards_File. No number of failed or passed variants is stored here;
// every count is derived from the results of the run.
import { readFileSync } from 'node:fs';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import type { Verdict, Ward, WardSet } from '@ghost-run/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeCapabilities } from '../../src/capabilities';
import { createInlineExecutor } from '../../src/exec/inline';
import { parsePlanFile } from '../../src/plan/plan-file';
import type { PlanFile } from '../../src/plan/plan-file';
import { runGhostHand } from '../../src/pipeline/run';
import type { GhostRun } from '../../src/pipeline/types';

const worldDir = new URL('../../../../worlds/drawer-arm/', import.meta.url);
const plansDir = new URL('../../plans/', import.meta.url);

/** The demo scenarios are defined by their Plan_Files (no scenario table exists in src yet). */
const SCENARIO_FILES = { first: 'first.plan.json', revised: 'revised.plan.json' } as const;

const RANK: Record<Verdict, number> = { pass: 0, warn: 1, block: 2 };

type PhysicsWard = Extract<Ward, { kind: 'physics' }>;

function loadPlan(file: string): PlanFile {
  const parsed = parsePlanFile(readFileSync(new URL(file, plansDir), 'utf8'));
  if (!parsed.ok) throw new Error(`${file} invalid: ${JSON.stringify(parsed.errors)}`);
  return parsed.plan;
}

function physicsWard(set: WardSet): PhysicsWard {
  const w = set.wards.find((x): x is PhysicsWard => x.kind === 'physics' && x.id === 'gentle-hands');
  if (w === undefined) throw new Error('gentle-hands ward missing');
  return w;
}

let wardSet: WardSet;
let variantConfig: VariantConfig;
let world: GhostHandWorld;
let executor: ReturnType<typeof createInlineExecutor>;
let firstPlan: PlanFile;
let revisedPlan: PlanFile;
let first: GhostRun;
let revised: GhostRun;

async function runPlan(plan: PlanFile, set: WardSet = wardSet): Promise<GhostRun> {
  return runGhostHand({
    plan: plan.actions,
    wardSet: set,
    variantConfig,
    seed: variantConfig.defaultSeed,
    variantCount: variantConfig.defaultCount,
    world,
    executor,
    evidence: { selfCheck: { state: 'pending' }, capabilities: probeCapabilities() },
    planOrigin: plan.origin,
  });
}

const maxForceOf = (run: GhostRun): number => Math.max(...run.variantResults.map((v) => v.contactForceN ?? 0));
const failedCount = (run: GhostRun): number => run.variantResults.filter((v) => !v.success).length;

beforeAll(async () => {
  const w = parseWards(readFileSync(new URL('wards.yaml', worldDir), 'utf8'));
  if (!w.ok) throw new Error('wards.yaml invalid');
  wardSet = w.wardSet;
  const c = parseVariantConfig(readFileSync(new URL('variant-config.json', worldDir), 'utf8'));
  if (!c.ok) throw new Error('variant-config.json invalid');
  variantConfig = c.config;
  firstPlan = loadPlan(SCENARIO_FILES.first);
  revisedPlan = loadPlan(SCENARIO_FILES.revised);
  world = await createGhostHandWorld({ recordFrames: true });
  executor = createInlineExecutor(() => createGhostHandWorld());
  first = await runPlan(firstPlan);
  revised = await runPlan(revisedPlan);
}, 600_000);

afterAll(async () => {
  await executor?.dispose();
  world?.dispose();
});

describe('demo scenarios', () => {
  it('runs the default count of variants for both plans', () => {
    expect(first.variantResults).toHaveLength(variantConfig.defaultCount);
    expect(revised.variantResults).toHaveLength(variantConfig.defaultCount);
    expect(first.p1.equal).toBe(true);
    expect(revised.p1.equal).toBe(true);
  });

  it('first plan: block, message names gentle-hands, at least one failed variant', () => {
    expect(first.verdict).toBe('block');
    expect(first.message).toContain('gentle-hands');
    expect(failedCount(first)).toBeGreaterThanOrEqual(1);
    expect(first.variantResults.filter((v) => v.success).length + failedCount(first)).toBe(first.variantResults.length);
  });

  it('revised plan: pass, every variant succeeds, max contact force within the ward limit', () => {
    const limit = physicsWard(wardSet).max_contact_force_n;
    expect(revised.verdict).toBe('pass');
    expect(failedCount(revised)).toBe(0);
    expect(revised.variantResults.every((v) => v.success)).toBe(true);
    expect(maxForceOf(revised)).toBeLessThanOrEqual(limit);
  });

  it('both plans open the drawer in the Base_World', () => {
    for (const run of [first, revised]) {
      const base = run.rows[0];
      expect(base?.id).toBe('base');
      expect(base?.drawerDisplacementM).toBeGreaterThanOrEqual(WORLD_CONFIG.targetOpeningM);
    }
  });

  it('the Plan of each scenario equals the actions of its Plan_File', () => {
    for (const file of Object.values(SCENARIO_FILES)) {
      const plan = loadPlan(file);
      const reparsed = parsePlanFile(readFileSync(new URL(file, plansDir), 'utf8'));
      expect(reparsed.ok && reparsed.plan.actions).toEqual(plan.actions);
      expect(plan.actions.length).toBeGreaterThan(0);
    }
    expect(firstPlan.actions).not.toEqual(revisedPlan.actions);
  });

  it('the revised file names the first plan in revisionOf', () => {
    expect(revisedPlan.revisionOf).toBe(firstPlan.name);
    expect(firstPlan.revisionOf).toBeUndefined();
  });

  it('P4 direction: a stricter ward (threshold below the measured maximum) never lowers the verdict', async () => {
    const measured = maxForceOf(revised);
    expect(measured).toBeGreaterThan(0);
    const stricterThreshold = measured / 2; // derived from the measured values
    const stricter: WardSet = {
      wards: wardSet.wards.map((w) =>
        w.kind === 'physics' && w.id === 'gentle-hands' ? { ...w, max_contact_force_n: stricterThreshold } : w,
      ),
    };
    expect(physicsWard(stricter).max_contact_force_n).toBeLessThan(measured);
    const original = physicsWard(wardSet).max_contact_force_n;
    expect(physicsWard(stricter).max_contact_force_n).toBeLessThan(original);

    const strict = await runPlan(revisedPlan, stricter);
    expect(RANK[strict.verdict]).toBeGreaterThanOrEqual(RANK[revised.verdict]);
    expect(RANK[strict.verdict]).toBeGreaterThanOrEqual(0);
    expect(wardSet).not.toBe(stricter); // the original WardSet is not mutated
    expect(physicsWard(wardSet).max_contact_force_n).toBe(original);
  }, 300_000);
});

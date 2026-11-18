// Env-gated measurement of the two demo plans (skipped unless GHOST_DEMO_OUT is set). Run it through
// scripts/measure-demo.mjs. It uses the pure pipeline (runGhostHand) with the default seed and count of
// variant-config.json, the shipped Wards_File, and the inline executor, all in Node.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig, STATIC_LAYOUT, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { describe, expect, it } from 'vitest';
import { probeCapabilities } from '../src/capabilities';
import { createInlineExecutor } from '../src/exec/inline';
import { parsePlanFile } from '../src/plan/plan-file';
import { runGhostHand } from '../src/pipeline/run';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const OUT = env['GHOST_DEMO_OUT'];

const worldDir = new URL('../../../worlds/drawer-arm/', import.meta.url);
const plansDir = new URL('../plans/', import.meta.url);
const caps = probeCapabilities();

describe.skipIf(OUT === undefined)('measure-demo', () => {
  it('runs both demo plans', async () => {
    const wards = parseWards(readFileSync(new URL('wards.yaml', worldDir), 'utf8'));
    if (!wards.ok) throw new Error('wards.yaml invalid');
    const cfg = parseVariantConfig(readFileSync(new URL('variant-config.json', worldDir), 'utf8'));
    if (!cfg.ok) throw new Error('variant-config.json invalid');
    const maxForce = wards.wardSet.wards.flatMap((w) => (w.kind === 'physics' ? [w.max_contact_force_n] : []));

    const out: Record<string, unknown> = { seed: cfg.config.defaultSeed, count: cfg.config.defaultCount, maxContactForceLimitN: maxForce };
    for (const file of ['first.plan.json', 'revised.plan.json']) {
      const parsed = parsePlanFile(readFileSync(new URL(file, plansDir), 'utf8'));
      if (!parsed.ok) throw new Error(`${file} invalid: ${JSON.stringify(parsed.errors)}`);
      const world: GhostHandWorld = await createGhostHandWorld({ recordFrames: true });
      const executor = createInlineExecutor(() => createGhostHandWorld());
      try {
        const run = await runGhostHand({
          plan: parsed.plan.actions,
          wardSet: wards.wardSet,
          variantConfig: cfg.config,
          seed: cfg.config.defaultSeed,
          variantCount: cfg.config.defaultCount,
          world,
          executor,
          evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
          planOrigin: parsed.plan.origin,
        });
        const base = run.rows[0];
        out[parsed.plan.name] = {
          verdict: run.verdict,
          message: run.message,
          baseDrawerM: base?.drawerDisplacementM,
          baseSuccess: base?.status,
          baseMaxForceN: base?.maxContactForceN,
          variants: run.rows.slice(1).map((r) => ({
            id: r.id,
            params: r.params,
            drawerM: r.drawerDisplacementM,
            maxForceN: r.maxContactForceN,
            touched: r.touched,
            status: r.status,
            failedSteps: r.failedSteps,
          })),
          failed: run.variantResults.filter((v) => !v.success).length,
          passed: run.variantResults.filter((v) => v.success).length,
          maxContactForceN: Math.max(...run.variantResults.map((v) => v.contactForceN)),
          violations: run.wardVerdict.violations?.map((v) => v.wardId) ?? null,
        };
      } finally {
        await executor.dispose();
        world.dispose();
      }
    }
    out['targetOpeningM'] = WORLD_CONFIG.targetOpeningM;
    out['drawerQposIndex'] = STATIC_LAYOUT.drawerQposIndex;
    writeFileSync(OUT as string, JSON.stringify(out, null, 2));
    expect(out).toBeTruthy();
  });
});

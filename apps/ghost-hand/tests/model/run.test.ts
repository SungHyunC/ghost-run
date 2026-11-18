// Unit tests of runGhostHand (task 11.1) against the real world and engine; only the executor is varied.
import { readFileSync } from 'node:fs';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig, REFERENCE_PLAN } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import type { WardSet } from '@ghost-run/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities';
import { createInlineExecutor } from '../../src/exec/inline';
import { failedOutcome } from '../../src/exec/executor';
import type { VariantExecutor } from '../../src/exec/executor';
import { GhostHandRunError, runGhostHand } from '../../src/pipeline/run';
import type { RunInput } from '../../src/pipeline/types';
import { P1_FAILURE_TEXT } from '../../src/texts';

const dir = new URL('../../../../worlds/drawer-arm/', import.meta.url);
const wardsText = readFileSync(new URL('wards.yaml', dir), 'utf8');
const configText = readFileSync(new URL('variant-config.json', dir), 'utf8');

const caps: Capabilities = { jointSelfWard: false, claimsOptional: true, bannerNotApplicable: false };
const PLAN: readonly GhostHandAction[] = REFERENCE_PLAN.slice(0, 1);

let world: GhostHandWorld;
let wardSet: WardSet;
let variantConfig: VariantConfig;

beforeAll(async () => {
  const w = parseWards(wardsText);
  if (!w.ok) throw new Error('wards.yaml invalid');
  wardSet = w.wardSet;
  const c = parseVariantConfig(configText);
  if (!c.ok) throw new Error('variant-config.json invalid');
  variantConfig = c.config;
  world = await createGhostHandWorld({ recordFrames: true });
}, 120_000);

afterAll(() => world?.dispose());

function input(executor: VariantExecutor, over: Partial<RunInput> = {}): RunInput {
  return {
    plan: PLAN,
    wardSet,
    variantConfig,
    seed: 42,
    variantCount: 3,
    world,
    executor,
    evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
    ...over,
  };
}

/** Stub executor: no engine work, finishing order reversed. */
const stub: VariantExecutor = {
  run: (jobs) => Promise.resolve([...jobs].reverse().map((j) => failedOutcome(j, '')).sort((a, b) => a.index - b.index)),
  dispose: () => undefined,
};

describe('runGhostHand', () => {
  it('rejects an invalid action before any engine call', async () => {
    const calls: string[] = [];
    const spy = new Proxy(world, {
      get(t, p, r) {
        calls.push(String(p));
        return Reflect.get(t, p, r) as unknown;
      },
    });
    const bad = [{ type: 'grasp', force: 1e6 }] as unknown as readonly GhostHandAction[];
    await expect(runGhostHand(input(stub, { plan: bad, world: spy }))).rejects.toBeInstanceOf(GhostHandRunError);
    expect(calls).toEqual([]);
  });

  it('returns one result per variant in ascending order, base row first, and equal fingerprints', async () => {
    const run = await runGhostHand(input(stub, { variantCount: 4 }));
    expect(run.variantResults.map((r) => r.variantId)).toEqual(['variant-0', 'variant-1', 'variant-2', 'variant-3']);
    expect(run.rows.map((r) => r.id)).toEqual(['base', 'variant-0', 'variant-1', 'variant-2', 'variant-3']);
    expect(run.p1.equal).toBe(true);
    expect(run.claims.p1Claimed).toBe(true);
    expect(run.claims.p5Claimed).toBe(false);
    expect(run.claims.p6Claimed).toBe(false);
    expect(run.overlay.variants).toHaveLength(4);
    expect(run.unknownContactNames).toEqual([]);
    expect(run.engineVerdict.verdict).toBe('block'); // engine-error variants are unsuccessful
  });

  it('runs real variants on the inline executor and leaves reality unchanged', async () => {
    const exec = createInlineExecutor(() => createGhostHandWorld({ recordFrames: true }));
    try {
      const run = await runGhostHand(input(exec, { variantCount: 2 }));
      expect(run.variantResults).toHaveLength(2);
      expect(run.p1.before).toBe(run.p1.after);
      expect(run.overlay.base.frames.length).toBeGreaterThan(0);
      expect(run.message.length).toBeGreaterThan(0);
    } finally {
      exec.dispose();
    }
  }, 120_000);

  it('uses the fixed P1 text and block when the fingerprints differ', async () => {
    let n = 0;
    const flaky = new Proxy(world, {
      get(t, p, r) {
        if (p === 'fingerprint') return () => Promise.resolve({ hash: `h${n++}`, manifest: {} });
        const v = Reflect.get(t, p, r) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
    const run = await runGhostHand(input(stub, { world: flaky }));
    expect(run.p1.equal).toBe(false);
    expect(run.verdict).toBe('block');
    expect(run.message).toBe(P1_FAILURE_TEXT);
    expect(run.claims.p1Claimed).toBe(false);
  });
});

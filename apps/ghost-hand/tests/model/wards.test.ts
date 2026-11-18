// Task 11.4: the Wards_File and the Variant_Config text, the notice for a WardSet without a physics ward,
// the unknown-contact text, and the absence of a wards editor.
// Numbers are read from the files; none is hard-coded here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig, REFERENCE_PLAN } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import type { Ward, WardSet } from '@ghost-run/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities';
import { failedOutcome } from '../../src/exec/executor';
import type { VariantExecutor } from '../../src/exec/executor';
import { runGhostHand } from '../../src/pipeline/run';
import type { RunInput } from '../../src/pipeline/types';
import { NO_PHYSICS_WARD_TEXT, unknownWardEntryText } from '../../src/texts';
import bundledWards from '../../../../worlds/drawer-arm/wards.yaml?raw';
import bundledVariantConfig from '../../../../worlds/drawer-arm/variant-config.json?raw';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const worldDir = fileURLToPath(new URL('../../../../worlds/drawer-arm/', import.meta.url));
const wardsBytes = readFileSync(join(worldDir, 'wards.yaml'), 'utf8');
const configBytes = readFileSync(join(worldDir, 'variant-config.json'), 'utf8');

const caps: Capabilities = { jointSelfWard: false, claimsOptional: true, bannerNotApplicable: false };

/** Stub executor: no engine work. */
const stub: VariantExecutor = {
  run: (jobs) => Promise.resolve(jobs.map((j) => failedOutcome(j, ''))),
  dispose: () => undefined,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-node' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function physicsWards(set: WardSet): Extract<Ward, { kind: 'physics' }>[] {
  return set.wards.filter((w): w is Extract<Ward, { kind: 'physics' }> => w.kind === 'physics');
}

describe('Wards_File of the drawer-arm world', () => {
  it('parses with ok: true and holds exactly one physics ward gentle-hands', () => {
    const r = parseWards(wardsBytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wardSet.wards).toHaveLength(1);
    expect(r.wardSet.wards.some((w) => w.kind === 'path' || w.kind === 'sql' || w.kind === 'egress')).toBe(false);
    const [ward] = physicsWards(r.wardSet);
    expect(ward?.id).toBe('gentle-hands');
    expect(ward?.forbidden_contacts).toContain('vase');
  });

  it('declares thresholds equal to the numbers written in the file', () => {
    const r = parseWards(wardsBytes);
    if (!r.ok) throw new Error('wards.yaml invalid');
    const ward = physicsWards(r.wardSet)[0];
    const rate = /min_success_rate:\s*([0-9.]+)/.exec(wardsBytes)?.[1];
    const force = /max_contact_force_n:\s*([0-9.]+)/.exec(wardsBytes)?.[1];
    expect(rate).toBeDefined();
    expect(force).toBeDefined();
    expect(ward?.min_success_rate).toBe(Number(rate));
    expect(ward?.max_contact_force_n).toBe(Number(force));
    expect(ward?.min_success_rate).toBeGreaterThan(0);
    expect(ward?.min_success_rate).toBeLessThanOrEqual(1);
    expect(ward?.max_contact_force_n).toBeGreaterThan(0);
  });

  it('bundles ?raw text equal to the file bytes, for the wards file and the Variant_Config', () => {
    expect(bundledWards).toBe(wardsBytes);
    expect(bundledVariantConfig).toBe(configBytes);
    expect(parseVariantConfig(bundledVariantConfig).ok).toBe(true);
  });

  it('has exactly one canonical wards file for Ghost Hand', () => {
    const isWards = (p: string): boolean => /(^|[\\/])([^\\/]*\.)?wards\.ya?ml$/i.test(p);
    expect(walk(worldDir).filter(isWards)).toEqual([join(worldDir, 'wards.yaml')]);
    expect(walk(appDir).filter(isWards)).toEqual([]);
  });

  it('offers no wards editor in the app sources', () => {
    const sources = walk(join(appDir, 'src')).filter((p) => /\.(ts|tsx)$/.test(p));
    const editorHints = /<textarea|contentEditable|contenteditable|printWards|wardsEditor|WardsEditor/;
    const offenders = sources.filter((p) => editorHints.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('runs with a different WardSet', () => {
  let world: GhostHandWorld;
  let variantConfig: VariantConfig;
  let fileWard: Extract<Ward, { kind: 'physics' }>;

  beforeAll(async () => {
    const c = parseVariantConfig(configBytes);
    if (!c.ok) throw new Error('variant-config.json invalid');
    variantConfig = c.config;
    const w = parseWards(wardsBytes);
    if (!w.ok) throw new Error('wards.yaml invalid');
    fileWard = physicsWards(w.wardSet)[0] as Extract<Ward, { kind: 'physics' }>;
    world = await createGhostHandWorld({ recordFrames: true });
  }, 120_000);

  afterAll(() => world?.dispose());

  function input(wardSet: WardSet): RunInput {
    return {
      plan: REFERENCE_PLAN.slice(0, 1),
      wardSet,
      variantConfig,
      seed: 42,
      variantCount: 2,
      world,
      executor: stub,
      evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
    };
  }

  it('still runs and produces the notice when the WardSet has no physics ward', async () => {
    const run = await runGhostHand(input({ wards: [] }));
    expect(run.variantResults).toHaveLength(2);
    expect(run.rows[0]?.id).toBe('base');
    expect(run.p1.equal).toBe(true);
    expect(run.notices).toContain(NO_PHYSICS_WARD_TEXT);
  });

  it('does not produce the no-physics notice when the file ward is present', async () => {
    const run = await runGhostHand(input({ wards: [fileWard] }));
    expect(run.notices).not.toContain(NO_PHYSICS_WARD_TEXT);
    expect(run.unknownContactNames).toEqual([]);
  });

  it('reports a forbidden_contacts entry that matches no body with the fixed text', async () => {
    const name = 'no-such-body';
    const ward = { ...fileWard, forbidden_contacts: [...fileWard.forbidden_contacts, name] };
    const run = await runGhostHand(input({ wards: [ward] }));
    expect(run.variantResults).toHaveLength(2);
    expect(run.unknownContactNames).toEqual([name]);
    expect(run.unknownContactNames.map(unknownWardEntryText)).toEqual([`Ward entry "${name}" matches no body in this world.`]);
  });
});

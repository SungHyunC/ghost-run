import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tileLabel } from '../../src/live/derive/tile-label';
import type { PlanRecord, PresetRecord, RunsFile } from '../../src/data/types';

const text = readFileSync(new URL('../../src/data/runs.json', import.meta.url), 'utf8');
const runs = JSON.parse(text) as RunsFile;
const worlds = Object.values(runs.worlds);
const presets = worlds.flatMap((w) => w.presets);
const records: PlanRecord[] = presets.flatMap((p) => (p.fixed === null ? [p.plan] : [p.plan, p.fixed]));
const preset = (id: string): PresetRecord => {
  const found = presets.find((p) => p.id === id);
  if (found === undefined) throw new Error(`Preset ${id} missing`);
  return found;
};
const fixedOf = (id: string): PlanRecord => {
  const f = preset(id).fixed;
  if (f === null) throw new Error(`Preset ${id} has no Fixed_Plan`);
  return f;
};

const PRESET_IDS = {
  shell: ['shell-drop-users', 'shell-rm-data-build', 'shell-npm-test'],
  hand: ['hand-fast-pull', 'hand-slow-pull', 'hand-strong-grip'],
  cloud: ['cloud-delete-prod', 'cloud-make-public', 'cloud-delete-tmp'],
};
const BLOCKING = ['shell-drop-users', 'shell-rm-data-build', 'hand-fast-pull', 'cloud-delete-prod'];

const MOCKUP_LABELS = [
  'friction \u00D70.41',
  'handle 5.5 mm',
  'delay 5 steps',
  'friction \u00D71.68',
  'mass \u00D71.76',
  'delay 3 steps',
  'friction \u00D70.30',
  'mass \u00D70.66',
];

function checkSorted(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkSorted(v, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    expect(keys, path).toEqual([...keys].sort());
    for (const k of keys) checkSorted((value as Record<string, unknown>)[k], `${path}.${k}`);
  }
}

describe('runs.json shape', () => {
  it('has the format, version, seed, and variant count', () => {
    expect(runs.format).toBe('ghost-site-runs');
    expect(runs.version).toBe(2);
    expect(runs.seed).toBe(42);
    expect(runs.variantCount).toBe(8);
    expect(Object.keys(runs.worlds)).toEqual(['cloud', 'hand', 'shell']);
  });

  it('holds the nine Presets in the order of Requirement 8 and the four Fixed_Plans', () => {
    for (const w of worlds) expect(w.presets.map((p) => p.id)).toEqual(PRESET_IDS[w.id]);
    expect(presets.filter((p) => p.fixed !== null).map((p) => p.id).sort()).toEqual([...BLOCKING].sort());
    expect(records).toHaveLength(13);
  });

  it('blocks the named Presets, passes their Fixed_Plans, and keeps reality equal in every run', () => {
    for (const id of BLOCKING) {
      expect(preset(id).plan.verdict, id).toBe('block');
      expect(fixedOf(id).verdict, id).toBe('pass');
      expect(fixedOf(id).violatedWardIds, id).toEqual([]);
    }
    for (const w of worlds) {
      expect(preset(PRESET_IDS[w.id][0] as string).plan.violatedWardIds).toContain(w.ward.id);
    }
    for (const r of records) {
      expect(r.p1.equal).toBe(true);
      expect(Object.keys(r.p1).sort()).toEqual(['after', 'before', 'equal']);
      expect(r.p1.before).toMatch(/^[0-9a-f]{16,}$/);
      expect(r.p1.after).toBe(r.p1.before);
    }
  });

  it('has sorted keys, no absolute path, and no timestamp', () => {
    checkSorted(runs, 'runs');
    expect(text).not.toMatch(/\/Users\/|\/home\/|\/tmp\/|\/var\/|[A-Za-z]:\\\\/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('holds the measured Ghost Shell values', () => {
    const plan = preset('shell-drop-users').plan;
    expect(plan.facts['rowsLost']).toBe(1206);
    expect(fixedOf('shell-drop-users').facts['rowsLost']).toBe(0);
    expect(plan.message).toContain('would delete 1,206 rows from users');
    expect(preset('shell-rm-data-build').plan.violatedWardIds).toEqual(['protect-data']);
  });

  it('holds the measured Ghost Hand values', () => {
    const plan = preset('hand-fast-pull').plan;
    const fixed = fixedOf('hand-fast-pull');
    expect(plan.facts).toMatchObject({ succeeded: 7, total: 8, maxForceN: 27.53, vaseTouched: 0, drawerOpeningM: 0.1216 });
    expect(fixed.facts).toMatchObject({ succeeded: 8, total: 8, maxForceN: 29.24, vaseTouched: 0 });
    // The joint-limit report of variant-6 adds the fourth chip (site-live Requirement 12).
    expect(plan.checks.map((c) => c.measured)).toEqual([
      '7 of 8 = 88%',
      '27.5 N',
      'untouched',
      'joint limit exceeded in 1 of 8 variants',
    ]);
    expect(fixed.checks.map((c) => c.measured)).toEqual(['8 of 8 = 100%', '29.2 N', 'untouched']);
    expect(plan.message).toContain('joint limit exceeded in variant variant-6');
    expect(plan.facts['jointLimitVariants']).toBe('variant-6');
    expect(plan.display).toBe('grip 20 N, pull 0.2 m at 0.6 m/s');
  });

  it('holds the measured Ghost Cloud values', () => {
    expect(preset('cloud-delete-prod').plan.facts).toMatchObject({ removedBuckets: 'prod-assets', objectsRemoved: 3 });
    expect(fixedOf('cloud-delete-prod').facts['removedBuckets']).toBe('tmp-build-cache');
  });

  it('records eight Hand variants whose labels follow tileLabel and match the Mockup', () => {
    const plan = preset('hand-fast-pull').plan;
    const fixed = fixedOf('hand-fast-pull');
    expect(fixed.copyAfter.kind).toBe('hand');
    if (plan.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    const tiles = plan.copyAfter.tiles;
    expect(tiles.map((t) => t.id)).toEqual(Array.from({ length: 8 }, (_, i) => `variant-${i}`));
    for (const t of tiles) {
      expect(t.params.handleOffsetM).toHaveLength(3);
      expect(typeof t.params.drawerFrictionN).toBe('number');
      expect(typeof t.params.drawerMassKg).toBe('number');
      expect(typeof t.params.sensorNoiseM).toBe('number');
      expect(typeof t.params.commandDelaySteps).toBe('number');
      expect(t.label).toBe(tileLabel(t.params));
    }
    expect(tiles.map((t) => t.label)).toEqual(MOCKUP_LABELS);
    expect(tiles.filter((t) => t.outcome === 'failed').map((t) => t.id)).toEqual(['variant-3']);
    expect(tiles.filter((t) => t.jointLimit).map((t) => t.id)).toEqual(['variant-6']);
    if (fixed.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    expect(fixed.copyAfter.tiles.every((t) => t.outcome === 'passed')).toBe(true);
  });
});

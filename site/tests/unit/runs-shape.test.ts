import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tileLabel } from '../../scripts/lib/tile-label';
import type { PlanRecord, RunsFile, WorldRecord } from '../../src/data/types';

const text = readFileSync(new URL('../../src/data/runs.json', import.meta.url), 'utf8');
const runs = JSON.parse(text) as RunsFile;
const worlds = Object.values(runs.worlds) as WorldRecord[];
const records: PlanRecord[] = worlds.flatMap((w) => [w.plan, w.fixed]);

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
    expect(runs.version).toBe(1);
    expect(runs.seed).toBe(42);
    expect(runs.variantCount).toBe(8);
    expect(Object.keys(runs.worlds)).toEqual(['cloud', 'hand', 'shell']);
    expect(records).toHaveLength(6);
  });

  it('blocks each plan and passes each fixed plan with equal fingerprints', () => {
    for (const w of worlds) {
      expect(w.plan.verdict).toBe('block');
      expect(w.plan.violatedWardIds).toEqual([w.ward.id]);
      expect(w.fixed.verdict).toBe('pass');
      expect(w.fixed.violatedWardIds).toEqual([]);
    }
    for (const r of records) {
      expect(r.p1.equal).toBe(true);
      expect(Object.keys(r.p1).sort()).toEqual(['after', 'before', 'equal']);
      expect(r.p1.before).toMatch(/^[0-9a-f]{16,}$/);
      expect(r.p1.after).toBe(r.p1.before);
      expect(r.effectsOutside).toEqual([]);
    }
  });

  it('has sorted keys, no absolute path, and no timestamp', () => {
    checkSorted(runs, 'runs');
    expect(text).not.toMatch(/\/Users\/|\/home\/|\/tmp\/|\/var\/|[A-Za-z]:\\\\/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('holds the measured Ghost Shell values', () => {
    const { shell } = runs.worlds;
    expect(shell.plan.facts['rowsLost']).toBe(1206);
    expect(shell.fixed.facts['rowsLost']).toBe(0);
    expect(shell.plan.message).toContain('would delete 1,206 rows from users');
  });

  it('holds the measured Ghost Hand values', () => {
    const { hand } = runs.worlds;
    expect(hand.plan.facts).toMatchObject({ succeeded: 7, total: 8, maxForceN: 27.53, vaseTouched: 0, drawerOpeningM: 0.1216 });
    expect(hand.fixed.facts).toMatchObject({ succeeded: 8, total: 8, maxForceN: 29.24, vaseTouched: 0 });
    expect(hand.plan.checks.map((c) => c.measured)).toEqual(['7 of 8 = 88%', '27.5 N', 'untouched']);
    expect(hand.fixed.checks.map((c) => c.measured)).toEqual(['8 of 8 = 100%', '29.2 N', 'untouched']);
    expect(hand.plan.message).toContain('joint limit exceeded in variant variant-6');
    expect(hand.plan.facts['jointLimitVariants']).toBe('variant-6');
  });

  it('holds the measured Ghost Cloud values', () => {
    const { cloud } = runs.worlds;
    expect(cloud.plan.facts).toMatchObject({ removedBuckets: 'prod-assets', objectsRemoved: 3 });
    expect(cloud.fixed.facts['removedBuckets']).toBe('tmp-build-cache');
  });

  it('records eight Hand variants whose labels follow tileLabel and match the Mockup', () => {
    const { hand } = runs.worlds;
    for (const role of [hand.plan, hand.fixed]) {
      expect(role.copyAfter.kind).toBe('hand');
    }
    if (hand.plan.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    const tiles = hand.plan.copyAfter.tiles;
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
    if (hand.fixed.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    expect(hand.fixed.copyAfter.tiles.every((t) => t.outcome === 'passed')).toBe(true);
  });
});

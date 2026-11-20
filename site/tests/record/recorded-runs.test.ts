// Gated test (project `record`, started by `pnpm test:record`): a fresh Record_Script run must be
// byte-equal to the committed runs.json. Slow: it runs the real worlds, including MuJoCo.
// Feature: site, Property 3: Recorded runs equal a fresh run
// **Validates: Requirements 10.1, 10.2, 10.3, 10.6, 10.7, 10.8, 12.3**
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVariantConfig, sampleVariant } from '@ghost-run/drawer-arm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tileLabel } from '../../scripts/lib/tile-label';
import type { RunsFile } from '../../src/data/types';

const SITE_DIR = fileURLToPath(new URL('../../', import.meta.url));
const COMMITTED = join(SITE_DIR, 'src', 'data', 'runs.json');

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

let tmp = '';
let freshText = '';
let fresh: RunsFile;

beforeAll(() => {
  tmp = mkdtempSync(join(os.tmpdir(), 'ghost-site-recorded-'));
  const out = join(tmp, 'runs.json');
  const r = spawnSync('node', ['scripts/record-runs.mjs', '--out', out], { cwd: SITE_DIR, encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(out)) {
    throw new Error(`record-runs failed (${r.status}): ${r.stdout}\n${r.stderr}`);
  }
  freshText = readFileSync(out, 'utf8');
  fresh = JSON.parse(freshText) as RunsFile;
}, 600_000);

afterAll(() => {
  if (tmp !== '') rmSync(tmp, { recursive: true, force: true });
});

describe('recorded runs equal a fresh run', () => {
  it('is byte-equal to the committed runs.json', () => {
    expect(freshText).toBe(readFileSync(COMMITTED, 'utf8'));
  });

  it('gives block for each plan and pass for each fixed plan with an unchanged reality', () => {
    for (const w of Object.values(fresh.worlds)) {
      expect(w.plan.verdict).toBe('block');
      expect(w.plan.violatedWardIds).toEqual([w.ward.id]);
      expect(w.fixed.verdict).toBe('pass');
      expect(w.plan.p1.equal).toBe(true);
      expect(w.fixed.p1.equal).toBe(true);
      expect(w.plan.effectsOutside).toEqual([]);
      expect(w.fixed.effectsOutside).toEqual([]);
    }
  });

  it('holds the values of Requirement 10, criterion 3', () => {
    const { shell, hand, cloud } = fresh.worlds;
    expect(shell.ward.id).toBe('no-data-loss');
    expect(shell.plan.facts['rowsLost']).toBe(1206);
    expect(shell.fixed.facts['rowsLost']).toBe(0);
    expect(shell.plan.message).toContain('would delete 1,206 rows from users');

    expect(hand.ward.id).toBe('gentle-hands');
    expect(hand.plan.facts).toMatchObject({ succeeded: 7, total: 8, maxForceN: 27.53, vaseTouched: 0, drawerOpeningM: 0.1216 });
    expect(hand.fixed.facts).toMatchObject({ succeeded: 8, total: 8, maxForceN: 29.24, vaseTouched: 0 });
    expect(hand.plan.message).toContain('joint limit exceeded in variant variant-6');
    if (hand.plan.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    const tiles = hand.plan.copyAfter.tiles;
    expect(tiles.filter((t) => t.outcome === 'failed').map((t) => t.id)).toEqual(['variant-3']);
    expect(tiles.filter((t) => t.jointLimit).map((t) => t.id)).toEqual(['variant-6']);

    expect(cloud.ward.id).toBe('no-bucket-delete');
    expect(cloud.plan.facts).toMatchObject({ removedBuckets: 'prod-assets', objectsRemoved: 3 });
    expect(cloud.fixed.facts['removedBuckets']).toBe('tmp-build-cache');
  });

  it('gives the eight Mockup tile labels for seed 42 and the real sampleVariant', () => {
    const parsed = parseVariantConfig(readFileSync(join(SITE_DIR, '..', 'worlds', 'drawer-arm', 'variant-config.json'), 'utf8'));
    if (!parsed.ok) throw new Error('variant-config.json invalid');
    const labels = Array.from({ length: 8 }, (_, i) => tileLabel(sampleVariant(42, i, parsed.config)));
    expect(labels).toEqual(MOCKUP_LABELS);
    if (fresh.worlds.hand.plan.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    expect(fresh.worlds.hand.plan.copyAfter.tiles.map((t) => t.label)).toEqual(MOCKUP_LABELS);
  });
});

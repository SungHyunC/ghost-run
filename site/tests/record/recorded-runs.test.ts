// Gated test (project `record`, started by `pnpm test:record`): a fresh Record_Script run must be
// byte-equal to the committed runs.json. Slow: it runs the real worlds, including MuJoCo.
// Feature: site, Property 3: Recorded runs equal a fresh run
// **Validates: Requirements 10.1, 10.2, 10.3, 10.6, 10.7, 10.8, 12.3**
// Updated for Runs_File version 2 (site-live Requirement 11).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVariantConfig, sampleVariant } from '@ghost-run/drawer-arm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tileLabel } from '../../src/live/derive/tile-label';
import type { PlanRecord, PresetRecord, RunsFile } from '../../src/data/types';

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
  it('is a version 2 Runs_File with the nine Presets in order', () => {
    expect(fresh.format).toBe('ghost-site-runs');
    expect(fresh.version).toBe(2);
    expect(fresh.worlds.shell.presets.map((p) => p.id)).toEqual(['shell-drop-users', 'shell-rm-data-build', 'shell-npm-test']);
    expect(fresh.worlds.hand.presets.map((p) => p.id)).toEqual(['hand-fast-pull', 'hand-slow-pull', 'hand-strong-grip']);
    expect(fresh.worlds.cloud.presets.map((p) => p.id)).toEqual(['cloud-delete-prod', 'cloud-make-public', 'cloud-delete-tmp']);
  });

  it('is byte-equal to the committed runs.json', () => {
    expect(freshText).toBe(readFileSync(COMMITTED, 'utf8'));
  });

  it('gives block for the named Presets and pass for their Fixed_Plans with an unchanged reality', () => {
    const presets = Object.values(fresh.worlds).flatMap((w) => w.presets);
    const named = ['shell-drop-users', 'shell-rm-data-build', 'hand-fast-pull', 'cloud-delete-prod'];
    for (const id of named) {
      const p = presets.find((x) => x.id === id);
      expect(p?.plan.verdict, id).toBe('block');
      expect(p?.fixed?.verdict, id).toBe('pass');
    }
    for (const p of presets) {
      expect(p.plan.p1.equal, p.id).toBe(true);
      if (p.fixed !== null) expect(p.fixed.p1.equal, p.id).toBe(true);
    }
  });

  it('holds the values of Requirement 11, criterion 6', () => {
    const { shell, hand, cloud } = fresh.worlds;
    const get = (list: PresetRecord[], id: string): { plan: PlanRecord; fixed: PlanRecord } => {
      const p = list.find((x) => x.id === id);
      if (p === undefined || p.fixed === null) throw new Error(`${id} has no Fixed_Plan`);
      return { plan: p.plan, fixed: p.fixed };
    };
    const s = get(shell.presets, 'shell-drop-users');
    expect(shell.ward.id).toBe('no-data-loss');
    expect(s.plan.facts['rowsLost']).toBe(1206);
    expect(s.fixed.facts['rowsLost']).toBe(0);
    expect(s.plan.message).toContain('would delete 1,206 rows from users');

    const h = get(hand.presets, 'hand-fast-pull');
    expect(hand.ward.id).toBe('gentle-hands');
    expect(h.plan.facts).toMatchObject({ succeeded: 7, total: 8, maxForceN: 27.53, vaseTouched: 0, drawerOpeningM: 0.1216 });
    expect(h.fixed.facts).toMatchObject({ succeeded: 8, total: 8, maxForceN: 29.24, vaseTouched: 0 });
    expect(h.plan.message).toContain('joint limit exceeded in variant variant-6');
    if (h.plan.copyAfter.kind !== 'hand') throw new Error('hand scene expected');
    const tiles = h.plan.copyAfter.tiles;
    expect(tiles.filter((t) => t.outcome === 'failed').map((t) => t.id)).toEqual(['variant-3']);
    expect(tiles.filter((t) => t.jointLimit).map((t) => t.id)).toEqual(['variant-6']);

    const c = get(cloud.presets, 'cloud-delete-prod');
    expect(cloud.ward.id).toBe('no-bucket-delete');
    expect(c.plan.facts).toMatchObject({ removedBuckets: 'prod-assets', objectsRemoved: 3 });
    expect(c.fixed.facts['removedBuckets']).toBe('tmp-build-cache');
  });

  it('gives the eight Mockup tile labels for seed 42 and the real sampleVariant', () => {
    const parsed = parseVariantConfig(readFileSync(join(SITE_DIR, '..', 'worlds', 'drawer-arm', 'variant-config.json'), 'utf8'));
    if (!parsed.ok) throw new Error('variant-config.json invalid');
    const labels = Array.from({ length: 8 }, (_, i) => tileLabel(sampleVariant(42, i, parsed.config)));
    expect(labels).toEqual(MOCKUP_LABELS);
    const first = fresh.worlds.hand.presets[0]?.plan.copyAfter;
    if (first?.kind !== 'hand') throw new Error('hand scene expected');
    expect(first.tiles.map((t) => t.label)).toEqual(MOCKUP_LABELS);
  });
});

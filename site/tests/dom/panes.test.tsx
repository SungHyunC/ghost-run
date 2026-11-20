import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { settle } from '../../src/engine/script';

const runs = runsJson as unknown as RunsFile;

afterEach(cleanup);

const text = (el: Element | null) => el?.textContent ?? '';

describe('RealityPane', () => {
  it('Shell shows project/, app.db with users 1,206 and orders 3, package.json, data/, and no .env', () => {
    const { container } = render(<RealityPane scene={runs.worlds.shell.reality} />);
    const t = text(container);
    expect(t).toContain('project/');
    expect(t).toContain('app.db');
    expect(text(container.querySelector('[data-t="users"] .cnt'))).toBe('1,206');
    expect(text(container.querySelector('[data-t="orders"] .cnt'))).toBe('3');
    expect(t).toContain('package.json');
    expect(t).toContain('data/');
    expect(t).not.toContain('.env');
    expect(t).not.toContain('.bak');
  });

  it('Hand draws the arm scene with its recorded label and aria-hidden svg', () => {
    const { container } = render(<RealityPane scene={runs.worlds.hand.reality} />);
    expect(text(container.querySelector('svg.scene text'))).toBe('the real arm');
    expect(container.querySelector('svg.scene')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Cloud shows three buckets and seven objects with the shield on prod- buckets', () => {
    const { container } = render(
      <>
        <Sprite />
        <RealityPane scene={runs.worlds.cloud.reality} />
      </>,
    );
    const buckets = [...container.querySelectorAll('.bucket')];
    expect(buckets.map((b) => b.getAttribute('data-b'))).toEqual(['prod-assets', 'prod-logs', 'tmp-build-cache']);
    expect(container.querySelectorAll('.bucket .objs span')).toHaveLength(7);
    expect(buckets.map((b) => b.querySelector('.shield') !== null)).toEqual([true, true, false]);
  });

  it('draws the same content for the same scene, whatever else happens', () => {
    const first = render(<RealityPane scene={runs.worlds.shell.reality} />).container.cloneNode(true);
    cleanup();
    const second = render(<RealityPane scene={runs.worlds.shell.reality} />).container;
    expect(second.isEqualNode(first)).toBe(true);
  });
});

describe('CopyPane', () => {
  it('Shell copy after step 2 marks users dropped with count 0, and after step 5 shows the .bak and soft users', () => {
    const rec = runs.worlds.shell;
    const run = render(<CopyPane record={rec} copy={settle(rec, 1).copy} />).container;
    const users = run.querySelector('[data-t="users"]');
    expect(users?.className).toContain('dropped');
    expect(text(users?.querySelector('.cnt') ?? null)).toBe('0');
    expect(text(users?.querySelector('.tag') ?? null)).toBe('dropped');
    expect(run.querySelectorAll('.bar.gone')).toHaveLength(12);
    cleanup();
    const fix = render(<CopyPane record={rec} copy={settle(rec, 4).copy} />).container;
    expect(fix.querySelector('.bak')?.className).toContain('show');
    expect(text(fix.querySelector('.bak .new'))).toBe('new');
    expect(fix.querySelector('[data-t="users"]')?.className).toContain('soft');
    expect(text(fix.querySelector('[data-t="users"] .tag'))).toBe('deleted_at = 1');
  });

  it('Hand tiles carry the recorded labels and fail states, and joint limit on the recorded variant', () => {
    const rec = runs.worlds.hand;
    const after = rec.plan.copyAfter;
    if (after.kind !== 'hand') throw new Error('hand record');
    const { container } = render(<CopyPane record={rec} copy={settle(rec, 1).copy} />);
    const tiles = [...container.querySelectorAll('.tile')];
    expect(tiles).toHaveLength(8);
    tiles.forEach((tile, k) => {
      const t = after.tiles[k];
      if (t === undefined) throw new Error('tile');
      expect(text(tile.querySelector('.hl'))).toBe(t.label);
      expect(tile.classList.contains('fail')).toBe(t.outcome === 'failed');
      expect(tile.classList.contains('ok')).toBe(t.outcome === 'passed');
      expect(tile.querySelector('.jl')?.textContent ?? null).toBe(t.jointLimit ? 'joint limit' : null);
    });
    expect(after.tiles.filter((t) => t.jointLimit).map((t) => t.id)).toEqual(['variant-6']);
  });

  it('Hand fixed run shows all tiles ok and no joint limit label', () => {
    const rec = runs.worlds.hand;
    const { container } = render(<CopyPane record={rec} copy={settle(rec, 4).copy} fixed />);
    expect(container.querySelectorAll('.tile.ok')).toHaveLength(8);
    expect(container.querySelector('.jl')).toBeNull();
  });

  it('Cloud copy poofs and vanishes the recorded bucket, in the fixed run the tmp bucket', () => {
    const rec = runs.worlds.cloud;
    const run = render(<CopyPane record={rec} copy={settle(rec, 1).copy} />).container;
    expect(run.querySelector('[data-b="prod-assets"]')?.className).toContain('vanish');
    expect(run.querySelectorAll('.bucket.vanish')).toHaveLength(1);
    cleanup();
    const fix = render(<CopyPane record={rec} copy={settle(rec, 4).copy} />).container;
    expect(fix.querySelector('[data-b="tmp-build-cache"]')?.className).toContain('vanish');
    expect(fix.querySelectorAll('.bucket.vanish')).toHaveLength(1);
  });

  it('all decorative svg is aria-hidden', () => {
    for (const rec of Object.values(runs.worlds)) {
      const { container } = render(<CopyPane record={rec} copy={settle(rec, 1).copy} />);
      for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
      cleanup();
    }
  });
});

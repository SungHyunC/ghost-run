// Gated: the Ghost Hand adapter through the real MuJoCo world and the inline executor.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import { describe, expect, it } from 'vitest';
import { createInlineExecutor } from '../../../apps/ghost-hand/src/exec/inline';
import { createHandEngine, handCapabilities } from '../../src/live/hand';
import { FIXED, PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveInput } from '../../src/live/types';

const ROOT = resolve(__dirname, '../../..');
const engine = createHandEngine({
  createWorld: (o) => createGhostHandWorld(o),
  createExecutor: () => createInlineExecutor(() => createGhostHandWorld()),
  wardsText: readFileSync(resolve(ROOT, 'worlds/drawer-arm/wards.yaml'), 'utf8'),
  variantConfigText: readFileSync(resolve(ROOT, 'worlds/drawer-arm/variant-config.json'), 'utf8'),
  capabilities: handCapabilities(),
});

function ran(a: LiveAnswer) {
  if (a.status !== 'ran') throw new Error(`expected ran, got ${JSON.stringify(a)}`);
  return a.run;
}
const preset = (label: string) => {
  const p = PRESETS.hand.find((x) => x.label === label);
  if (!p) throw new Error(label);
  return p;
};
const succeeded = (a: LiveAnswer) => ran(a).plan.facts['succeeded'];

describe('Ghost Hand adapter with the real world', () => {
  it('blocks fast pull with 7 of 8 and the fixed plan passes', async () => {
    const p = preset('fast pull');
    const run = ran(await engine.run(p.input));
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.facts['succeeded']).toBe(7);
    expect(run.plan.p1.equal).toBe(true);
    const fix = FIXED['hand-fast-pull'];
    if (!fix) throw new Error('fixed');
    const fixed = ran(await engine.run(fix));
    expect(fixed.plan.verdict).toBe('pass');
    expect(fixed.plan.facts['succeeded']).toBe(8);
  });

  it('passes slow pull, gentle grip with 8 of 8', async () => {
    const a = await engine.run(preset('slow pull, gentle grip').input);
    expect(ran(a).plan.verdict).toBe('pass');
    expect(succeeded(a)).toBe(8);
  });

  it('runs strong grip with an unchanged reality', async () => {
    expect(ran(await engine.run(preset('strong grip').input)).plan.p1.equal).toBe(true);
  });

  it('keeps reality unchanged for ten seeded slider triples', async () => {
    const triple = fc.record({
      speed: fc.double({ min: 0.05, max: 0.6, noNaN: true }),
      force: fc.double({ min: 2, max: 40, noNaN: true }),
      distance: fc.double({ min: 0.02, max: 0.25, noNaN: true }),
    });
    const samples = fc.sample(triple, { numRuns: 10, seed: 20261030 });
    const fresh = async () => {
      const w = await createGhostHandWorld();
      try {
        const fp = await w.fingerprint();
        return typeof fp === 'string' ? fp : fp.hash;
      } finally {
        w.dispose();
      }
    };
    const before = await fresh();
    for (const s of samples) {
      const input: LiveInput = { world: 'hand', ...s };
      const a = await engine.run(input);
      if (a.status === 'ran') expect(a.run.plan.p1.equal).toBe(true);
      else expect(a.status).not.toBe('failed');
    }
    expect(await fresh()).toBe(before);
  });
});

// Ghost Hand adapter and derivation with stub services (no MuJoCo).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { describe, expect, it, vi } from 'vitest';
import { GhostHandRunError } from '../../../apps/ghost-hand/src/pipeline/run';
import type { VariantExecutor } from '../../../apps/ghost-hand/src/exec/executor';
import { handCapabilities, createHandEngine, HAND_TIMEOUT_MS } from '../../src/live/hand';
import type { HandEngineServices } from '../../src/live/hand';
import { handPlanRecord, jointLimitIds } from '../../src/live/derive/hand';
import type { HandRunLike } from '../../src/live/derive/hand';
import { tileLabel } from '../../src/live/derive/tile-label';
import type { Scheduler } from '../../src/engine/scheduler';

const ROOT = resolve(__dirname, '../../..');
const wardsText = readFileSync(resolve(ROOT, 'worlds/drawer-arm/wards.yaml'), 'utf8');
const variantConfigText = readFileSync(resolve(ROOT, 'worlds/drawer-arm/variant-config.json'), 'utf8');

const INPUT = { world: 'hand' as const, speed: 0.6, force: 20, distance: 0.2 };

function fakeScheduler() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    setTimeout(fn) {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  return { scheduler, timers };
}

function stubs(fingerprint: () => Promise<unknown>) {
  const worldDispose = vi.fn();
  const executorDispose = vi.fn();
  const world = { fingerprint, effectsOutside: () => [], dispose: worldDispose } as unknown as GhostHandWorld;
  const executor = { run: () => Promise.resolve([]), dispose: executorDispose } as unknown as VariantExecutor;
  return { world, executor, worldDispose, executorDispose };
}

function services(s: ReturnType<typeof stubs>, scheduler?: Scheduler): HandEngineServices {
  return {
    createWorld: () => Promise.resolve(s.world),
    createExecutor: () => s.executor,
    wardsText,
    variantConfigText,
    capabilities: handCapabilities(),
    ...(scheduler !== undefined ? { scheduler } : {}),
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('Ghost Hand adapter (stub services)', () => {
  it('maps a GhostHandRunError to unsupported with its fixed message', async () => {
    const s = stubs(() => Promise.reject(new GhostHandRunError('invalid-plan', 'actions[0]', 'invalid action at index 0: bad')));
    const answer = await createHandEngine(services(s)).run(INPUT);
    expect(answer).toEqual({ status: 'unsupported', reason: 'invalid action at index 0: bad', stepIndexes: [] });
    expect(s.worldDispose).toHaveBeenCalledTimes(1);
    expect(s.executorDispose).toHaveBeenCalledTimes(1);
  });

  it('gives failed run and still disposes when the run throws', async () => {
    const s = stubs(() => Promise.reject(new Error('boom')));
    const answer = await createHandEngine(services(s)).run(INPUT);
    expect(answer).toMatchObject({ status: 'failed', cause: 'run' });
    expect(s.worldDispose).toHaveBeenCalledTimes(1);
    expect(s.executorDispose).toHaveBeenCalledTimes(1);
  });

  it('gives failed timeout after 30 s and disposes the executor and the world', async () => {
    const s = stubs(() => new Promise(() => undefined));
    const { scheduler, timers } = fakeScheduler();
    const pending = createHandEngine(services(s, scheduler)).run(INPUT);
    await flush();
    expect(timers.size).toBe(1);
    expect(HAND_TIMEOUT_MS).toBe(30_000);
    [...timers.values()][0]?.();
    expect(await pending).toEqual({ status: 'failed', cause: 'timeout' });
    expect(s.worldDispose).toHaveBeenCalledTimes(1);
    expect(s.executorDispose).toHaveBeenCalledTimes(1);
  });

  it('rejects non-finite sliders without creating a world', async () => {
    const s = stubs(() => Promise.reject(new Error('unused')));
    const createWorld = vi.fn(() => Promise.resolve(s.world));
    const engine = createHandEngine({ ...services(s), createWorld });
    expect(await engine.run({ ...INPUT, speed: Number.NaN })).toEqual({ status: 'rejected', problem: 'out-of-range' });
    expect(createWorld).not.toHaveBeenCalled();
  });

  it('returns failed internal for broken wards text and for another world input', async () => {
    const s = stubs(() => Promise.reject(new Error('unused')));
    expect(await createHandEngine({ ...services(s), wardsText: 'nope: [' }).run(INPUT)).toEqual({ status: 'failed', cause: 'internal' });
    expect(await createHandEngine(services(s)).run({ world: 'cloud', lines: ['x'] })).toEqual({ status: 'failed', cause: 'internal' });
  });
});

function variant(i: number, over: Partial<HandRunLike['rows'][number]['params']> = {}) {
  return {
    id: `variant-${i}`,
    params: { drawerFrictionN: 2, drawerMassKg: 0.6, handleOffsetM: [0, 0, 0] as const, sensorNoiseM: 0, commandDelaySteps: 0, ...over },
    drawerDisplacementM: 0.1,
    vaseTouched: false,
  };
}

describe('handPlanRecord', () => {
  const ward = { id: 'gentle-hands', min_success_rate: 0.9, max_contact_force_n: 30, forbidden_contacts: ['vase'] };
  const rows = [{ ...variant(0), id: 'base', drawerDisplacementM: 0.12345 }, ...Array.from({ length: 8 }, (_, i) => variant(i, i === 3 ? { commandDelaySteps: 6 } : {}))];
  const results = Array.from({ length: 8 }, (_, i) => ({
    variantId: `variant-${i}`,
    success: i !== 3,
    contactForceN: i === 3 ? 41.256 : 12,
    ...(i === 3 ? { jointLimitExceeded: true } : {}),
  }));
  const run: HandRunLike = {
    verdict: 'block',
    message: 'm',
    violations: [
      { wardId: 'gentle-hands', reason: 'success rate 7/8 (0.88) below minimum 0.9' },
      { wardId: 'gentle-hands', reason: 'joint limit exceeded in variant variant-3' },
      { wardId: 'gentle-hands', reason: 'variant variant-3 contact force 41.256 N exceeds max 30 N' },
    ],
    p1: { equal: true, before: 'a', after: 'a' },
    rows,
    variantResults: results,
  };

  it('builds the three gentle-hands rows, eight tiles, and the facts', () => {
    const rec = handPlanRecord({ commands: ['plan'], run, ward, effects: [[]] });
    expect(rec.checks).toEqual([
      { label: 'success, at least 90%', measured: '7 of 8 = 88%', ok: false },
      { label: 'contact force, at most 30 N', measured: '41.3 N', ok: false },
      { label: 'never touch the vase', measured: 'untouched', ok: true },
      { label: 'gentle-hands', measured: 'joint limit exceeded in 1 of 8 variants', ok: false },
    ]);
    expect(rec.copyAfter.kind).toBe('hand');
    if (rec.copyAfter.kind !== 'hand') return;
    expect(rec.copyAfter.tiles).toHaveLength(8);
    const t3 = rec.copyAfter.tiles[3];
    expect(t3).toMatchObject({ id: 'variant-3', outcome: 'failed', jointLimit: true, label: tileLabel(t3?.params as never) });
    expect(rec.copyAfter.tiles.filter((t) => t.jointLimit)).toHaveLength(1);
    expect(rec.facts).toEqual({ drawerOpeningM: 0.1235, jointLimitVariants: 'variant-3', maxForceN: 41.26, succeeded: 7, total: 8, vaseTouched: 0 });
    expect(rec.violatedWardIds).toEqual(['gentle-hands']);
    expect(rec.effectsOutside).toEqual([]);
  });

  it('falls back to the sentence pattern and fails when no id can be found', () => {
    const noStructured = results.map(({ jointLimitExceeded: _j, ...r }) => r);
    expect(jointLimitIds({ variantResults: noStructured, violations: run.violations })).toEqual(['variant-3']);
    expect(() =>
      jointLimitIds({ variantResults: noStructured, violations: [{ wardId: 'gentle-hands', reason: 'a joint limit was exceeded' }] }),
    ).toThrow(/joint limit/);
  });
});

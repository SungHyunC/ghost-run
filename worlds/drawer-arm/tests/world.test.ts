/**
 * Example tests of the Ghost_Hand_World against the real MuJoCo module (no mock).
 * Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.12, 3.13, 3.14.
 */
import type { Snapshot, World } from '@ghost-run/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import config from '../world.config.js';
import { createEngine, loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { REFERENCE_PLAN } from '../src/reference-plan.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';

// Requirement 3.1: this declaration must compile (checked by `tsc --noEmit`).
function asContract(w: GhostHandWorld): World<GhostHandState, GhostHandAction> {
  const contract: World<GhostHandState, GhostHandAction> = w;
  return contract;
}

const REACH: GhostHandAction = { type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 };
const OUT_OF_RANGE: GhostHandAction = { type: 'grasp', force: 1000 };
const OVER_LIMIT: GhostHandAction = { type: 'reach', target: [0, 0.3, 0.2], speed: 0.05 }; // 12 s > 3 s

interface Mutable {
  steps: number;
  integration: Float64Array;
  controller: { jointTarget: number[] };
  monitors: { touched: string[] };
}

interface Deletable {
  delete(): void;
}

interface Counting {
  readonly module: MuJoCoModule;
  readonly created: () => number;
  readonly deleted: () => number;
  readonly doubleDeletes: () => number;
}

/**
 * A module wrapper that counts every owning object (anything with a `delete` method) the engine gets from the
 * module: constructor results, factory results, and the values of data.contact, contact.get, and warning.get.
 * Each object gets an own `delete` that counts and forwards.
 */
function countingModule(real: MuJoCoModule): Counting {
  let created = 0;
  let deleted = 0;
  let doubles = 0;

  const track = <T extends Deletable>(obj: T): T => {
    created += 1;
    const original = obj.delete.bind(obj);
    let done = false;
    Object.defineProperty(obj, 'delete', {
      configurable: true,
      value: (): void => {
        if (done) doubles += 1;
        else deleted += 1;
        done = true;
        original();
      },
    });
    return obj;
  };

  const trackVec = <V extends Deletable & { get(i: number): Deletable | undefined }>(vec: V): V => {
    track(vec);
    const get = vec.get.bind(vec);
    Object.defineProperty(vec, 'get', {
      configurable: true,
      value: (i: number): Deletable | undefined => {
        const item = get(i);
        return item === undefined ? undefined : track(item);
      },
    });
    return vec;
  };

  const trackData = <D extends Deletable>(data: D): D => {
    track(data);
    const proto = data as unknown as Record<string, unknown>;
    Object.defineProperty(data, 'contact', {
      configurable: true,
      get: (): unknown => trackVec(Reflect.get(Object.getPrototypeOf(data) as object, 'contact', proto) as never),
    });
    Object.defineProperty(data, 'warning', {
      configurable: true,
      get: (): unknown => {
        const w = Reflect.get(Object.getPrototypeOf(data) as object, 'warning', proto) as { get(i: number): Deletable | undefined };
        return {
          get: (i: number): Deletable | undefined => {
            const item = w.get(i);
            return item === undefined ? undefined : track(item);
          },
        };
      },
    });
    return data;
  };

  const RealData = real.MjData;
  const RealBuffer = real.DoubleBuffer;
  const wrapped = {
    ...real,
    MjModel: { from_xml_string: (xml: string) => track(real.MjModel.from_xml_string(xml)) },
    MjData: function WrappedData(model: ConstructorParameters<typeof RealData>[0]) {
      return trackData(new RealData(model));
    } as unknown as MuJoCoModule['MjData'],
    DoubleBuffer: Object.assign(
      function WrappedBuffer(n: number) {
        return track(new RealBuffer(n));
      } as unknown as MuJoCoModule['DoubleBuffer'],
      { FromArray: (values: ArrayLike<number>) => track(RealBuffer.FromArray(values)) },
    ),
  } as MuJoCoModule;
  return { module: wrapped, created: () => created, deleted: () => deleted, doubleDeletes: () => doubles };
}

let module: MuJoCoModule;
let world: GhostHandWorld;
let initial: Snapshot<GhostHandState>;

beforeAll(async () => {
  module = await loadMujoco();
  world = await createGhostHandWorld({ mujoco: module });
  initial = await world.snapshot();
}, 60_000);

afterAll(() => {
  world.dispose();
});

describe('World contract (Requirement 3.1)', () => {
  it('exposes the six World functions', () => {
    const w = asContract(world);
    for (const name of ['snapshot', 'step', 'diff', 'render', 'fingerprint', 'effectsOutside'] as const) {
      expect(typeof w[name]).toBe('function');
    }
  });
});

describe('snapshot (Requirement 3.3)', () => {
  it('returns a deep copy: mutating either side leaves the other unchanged', async () => {
    const a = await world.snapshot();
    const b = await world.snapshot();
    expect(a.state).toEqual(b.state);
    const frozen = structuredClone(b.state);
    const ma = a.state as unknown as Mutable;
    ma.integration[0] = (ma.integration[0] as number) + 1;
    ma.controller.jointTarget[0] = 99;
    ma.monitors.touched.push('vase');
    expect(b.state).toEqual(frozen);
    const mb = b.state as unknown as Mutable;
    mb.steps = 12345;
    mb.integration[1] = (mb.integration[1] as number) + 1;
    const c = await world.snapshot();
    expect(c.state).toEqual(frozen);
    expect(a.state.steps).toBe(frozen.steps);
  });
});

describe('step (Requirements 3.4 to 3.7)', () => {
  it('leaves the input state structurally unchanged and returns a unique id', async () => {
    const before = structuredClone(initial.state);
    const ids = new Set<string>([initial.id]);
    let current = initial;
    for (const a of [REACH, REACH, REACH]) {
      const next = await world.step(current, a);
      expect(next.result.success).toBe(true);
      expect(ids.has(next.id)).toBe(false);
      ids.add(next.id);
      expect(next.state).not.toBe(current.state);
      current = next;
    }
    expect(initial.state).toEqual(before);
    expect(current.state.steps).toBeGreaterThan(before.steps);
  });

  it.each([
    ['out-of-range', OUT_OF_RANGE],
    ['over-limit', OVER_LIMIT],
  ])('returns a failed snapshot with an equal state for an %s action and does not throw', async (_name, action) => {
    const before = structuredClone(initial.state);
    const out = await world.step(initial, action);
    expect(out.result.success).toBe(false);
    const error = out.result.success ? '' : out.result.error;
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
    expect(out.state).toEqual(before);
    expect(out.state).not.toBe(initial.state);
    expect(out.id).not.toBe(initial.id);
    expect(initial.state).toEqual(before);
  });

  it('never writes the live state (fingerprint and snapshot are unchanged)', async () => {
    const fpBefore = await world.fingerprint();
    const liveBefore = (await world.snapshot()).state;
    for (const a of [REACH, OUT_OF_RANGE, OVER_LIMIT]) await world.step(initial, a);
    expect((await world.fingerprint()).hash).toBe(fpBefore.hash);
    expect((await world.snapshot()).state).toEqual(liveBefore);
  });
});

describe('diff (Requirement 3.8)', () => {
  it('is empty for equal states and non-empty and sorted for different states', async () => {
    const same = await world.snapshot();
    expect(world.diff(initial, same)).toEqual([]);
    const moved = await world.step(initial, REACH);
    const changes = world.diff(initial, moved);
    expect(changes.length).toBeGreaterThan(0);
    const kinds = changes.map((c) => c.kind);
    expect(kinds).toEqual([...kinds].sort());
    expect(world.diff(initial, moved)).toEqual(changes);
  });
});

describe('effectsOutside (Requirement 3.12)', () => {
  it('returns [] for a valid action', () => {
    for (const a of REFERENCE_PLAN) expect(world.effectsOutside(a)).toEqual([]);
  });

  it('throws an error that names the invalid argument', () => {
    expect(() => world.effectsOutside(OUT_OF_RANGE)).toThrow(/force/);
    expect(() => world.effectsOutside({ type: 'pull', distance: 5, speed: 0.1 })).toThrow(/distance/);
    expect(() => world.effectsOutside({ type: 'dance' } as unknown as GhostHandAction)).toThrow(/type/);
  });
});

describe('registration (Requirement 3.13)', () => {
  it('is deterministic: false until the registration gate passes', () => {
    expect(config.id).toBe('drawer-arm');
    expect(config.deterministic).toBe(false);
  });
});

describe('wrapped objects (Requirement 3.14)', () => {
  it('releases every wrapped object that a world creates', async () => {
    const counting = countingModule(await loadMujoco());
    const w = await createGhostHandWorld({ mujoco: counting.module });
    const s0 = await w.snapshot();
    const s1 = await w.step(s0, REACH);
    await w.step(s1, { type: 'grasp', force: 20 });
    await w.step(s0, OUT_OF_RANGE);
    await w.fingerprint();
    expect(counting.created()).toBeGreaterThan(0);
    w.dispose();
    w.dispose();
    expect(counting.deleted()).toBe(counting.created());
    expect(counting.doubleDeletes()).toBe(0);
  }, 60_000);

  it('releases every model and data object of a cache that evicts', async () => {
    const counting = countingModule(await loadMujoco());
    const engine = createEngine(counting.module);
    for (let i = 0; i < 30; i += 1) engine.entry({ drawerFrictionN: 1 + i * 0.1, drawerMassKg: 1, handleOffsetM: [0, 0, 0] });
    expect(engine.cacheSize()).toBeLessThanOrEqual(24);
    engine.dispose();
    expect(counting.deleted()).toBe(counting.created());
    expect(counting.doubleDeletes()).toBe(0);
  }, 120_000);

  it('leaves the WebAssembly heap at the size of the first run after the 40th run of a plan', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    const runPlan = async (): Promise<void> => {
      let s = await w.snapshot();
      const ids: string[] = [s.id];
      for (const a of REFERENCE_PLAN) {
        s = await w.step(s, a);
        ids.push(s.id);
        expect(s.result.success).toBe(true);
      }
      w.releaseTraces(ids);
    };
    await runPlan();
    const first = w.heapBytes();
    const sizes: number[] = [first];
    for (let run = 2; run <= 40; run += 1) {
      await runPlan();
      sizes.push(w.heapBytes());
    }
    console.info(`heap bytes: run1=${String(first)} run40=${String(sizes[39])} max=${String(Math.max(...sizes))}`);
    expect(sizes[39]).toBe(first);
    expect(Math.max(...sizes)).toBe(first);
    w.dispose();
  }, 300_000);

  it('keeps the heap bounded when many variant models cycle through the cache', async () => {
    const engine = createEngine(module);
    const cycle = (): void => {
      for (let i = 0; i < 30; i += 1) engine.entry({ drawerFrictionN: 2 + i * 0.05, drawerMassKg: 1.5, handleOffsetM: [0, 0.01, 0] });
    };
    cycle();
    const afterFirst = engine.heapBytes();
    cycle();
    cycle();
    const afterThird = engine.heapBytes();
    console.info(`variant cycle heap bytes: first=${String(afterFirst)} third=${String(afterThird)}`);
    expect(afterThird).toBe(afterFirst);
    expect(engine.cacheSize()).toBeLessThanOrEqual(24);
    engine.dispose();
  }, 300_000);
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PULL_STOP_S } from '../src/controller.js';
import type { Engine } from '../src/engine/engine.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { BASE_VARIANT_PARAMS } from '../src/variant.js';
import { BODY_SHAPES, WORLD_CONFIG } from '../src/world-config.js';
import { drawerOpening, entryFor, handPosition, initialState, makeEngine, run, NO_RECORD } from './helpers/base-world.js';
import { runAction } from '../src/controller.js';

// Controller examples on the Base_World (real MuJoCo, no mock; the one fault-injection stub is in the instability test).
// Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 3.6, 3.7.

const WAYPOINT: GhostHandAction = { type: 'reach', target: [0, 0.15, 0.18], speed: 0.3 };
const HANDLE: GhostHandAction = { type: 'reach', target: [0, 0.02, 0.18], speed: 0.1 };
const GRASP: GhostHandAction = { type: 'grasp', force: 20 };

let engine: Engine;

beforeAll(async () => {
  engine = await makeEngine();
}, 60_000);

afterAll(() => {
  engine?.dispose();
});

function must(s: GhostHandState, a: GhostHandAction): GhostHandState {
  const o = run(engine, s, a);
  expect(o.ok, o.error).toBe(true);
  if (o.next === undefined) throw new Error('no next state');
  return o.next;
}

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(a.reduce((acc, v, i) => acc + (v - (b[i] as number)) ** 2, 0));
}

function snapshot(s: GhostHandState): string {
  return JSON.stringify({ ...s, integration: Array.from(s.integration), poses: Array.from(s.poses) });
}

describe('actions on the Base_World', () => {
  it('reach moves the hand to the target', () => {
    const s0 = initialState(engine);
    const before = handPosition(engine, s0);
    const s1 = must(s0, WAYPOINT);
    const after = handPosition(engine, s1);
    expect(dist(before, after)).toBeGreaterThan(0.3);
    expect(dist(after, [0, 0.15, 0.18])).toBeLessThan(0.03);
    expect(s1.steps).toBeGreaterThan(0);
    expect(s1.controller.holding).toBe(false);
  });

  it('grasp on the handle sets holding', () => {
    const s = must(must(must(initialState(engine), WAYPOINT), HANDLE), GRASP);
    expect(s.controller.holding).toBe(true);
    expect(s.controller.fingerForceN).toBe(20);
    expect(s.monitors.touched).toContain('handle');
  });

  it('pull on a held handle moves the drawer, then release clears holding', () => {
    const held = must(must(must(initialState(engine), WAYPOINT), HANDLE), GRASP);
    const closed = drawerOpening(engine, held);
    const pulled = must(held, { type: 'pull', distance: 0.05, speed: 0.1 });
    expect(drawerOpening(engine, pulled) - closed).toBeGreaterThan(0.02);
    expect(pulled.controller.holding).toBe(true);
    const freed = must(pulled, { type: 'release' });
    expect(freed.controller.holding).toBe(false);
    expect(freed.controller.fingerForceN).toBe(0);
  });

  it('pull without a hold leaves the drawer where it is and reports success', () => {
    const s0 = must(initialState(engine), WAYPOINT);
    const before = snapshot(s0);
    const o = run(engine, s0, { type: 'pull', distance: 0.1, speed: 0.1 });
    expect(o.ok).toBe(true);
    expect(o.error).toBeUndefined();
    expect(o.noop).toBe('precondition-not-met');
    expect(o.next).toBe(s0);
    expect(drawerOpening(engine, o.next as GhostHandState)).toBe(drawerOpening(engine, s0));
    expect(snapshot(s0)).toBe(before);
  });

  it('the pull stop time constant is a whole number of steps', () => {
    expect(Number.isInteger(Math.ceil(PULL_STOP_S / WORLD_CONFIG.timeStepS - 1e-9))).toBe(true);
  });
});

describe('time limits', () => {
  it('an action over the per-action limit fails and leaves the state unchanged', () => {
    const s0 = initialState(engine);
    const before = snapshot(s0);
    // 0.6 m at 0.05 m/s is 12 s, over the 3 s limit
    const o = run(engine, s0, { type: 'reach', target: [0, 0.3, 0.2], speed: 0.05 });
    expect(o.ok).toBe(false);
    expect(o.error).toBe('action exceeds time limit');
    expect(o.next).toBeUndefined();
    expect(o.partialMonitors).toEqual(s0.monitors);
    expect(snapshot(s0)).toBe(before);
  });

  it('an action over the per-plan limit fails and leaves the state unchanged', () => {
    const s0 = { ...initialState(engine), steps: Math.round(WORLD_CONFIG.perPlanLimitS / WORLD_CONFIG.timeStepS) - 10 };
    const before = snapshot(s0);
    const o = run(engine, s0, { type: 'grasp', force: 10 });
    expect(o.ok).toBe(false);
    expect(o.error).toBe('plan exceeds time limit');
    expect(o.next).toBeUndefined();
    expect(snapshot(s0)).toBe(before);
  });
});

describe('simulation instability', () => {
  it('a forced non-finite step gives "simulation unstable" and no next state', () => {
    const s0 = initialState(engine);
    const before = snapshot(s0);
    const entry = entryFor(engine, s0.variant);
    let calls = 0;
    // Fault injection (test only): the third step reports a non-finite state, as a diverging engine would.
    const faulty: Engine = {
      ...engine,
      step(e, ctrl) {
        const probe = engine.step(e, ctrl);
        calls += 1;
        if (calls < 3) return probe;
        const bad = Float64Array.from(probe.qposQvel);
        bad[0] = Number.NaN;
        return { ...probe, finite: false, qposQvel: bad };
      },
    };
    engine.load(entry, s0.integration);
    const o = runAction(faulty, entry, s0, WAYPOINT, NO_RECORD);
    expect(o.ok).toBe(false);
    expect(o.error).toBe('simulation unstable');
    expect(o.next).toBeUndefined();
    expect(calls).toBe(3);
    expect(snapshot(s0)).toBe(before);
  });
});

describe('handle offset', () => {
  const OFFSET = 0.1;

  function handleWorld(s: GhostHandState): number[] {
    const drawer = engine.layout.bodyNames.indexOf('drawer');
    const handle = BODY_SHAPES.find((b) => b.geomName === 'drawer_handle');
    if (drawer < 0 || handle === undefined) throw new Error('scene lacks the drawer or its handle');
    const at = (k: number): number => (s.poses[7 * drawer + k] as number) + handle.localPos[k]! + s.variant.handleOffsetM[k]!;
    return [at(0), at(1), at(2)];
  }

  it('moves where a fixed reach target lands relative to the handle', () => {
    const base = must(must(initialState(engine), WAYPOINT), HANDLE);
    const shifted = must(
      must(initialState(engine, { ...BASE_VARIANT_PARAMS, handleOffsetM: [OFFSET, 0, 0] }), WAYPOINT),
      HANDLE,
    );
    const handBase = handPosition(engine, base);
    const handShifted = handPosition(engine, shifted);
    // The same target puts the hand at about the same world place ...
    expect(dist(handBase, handShifted)).toBeLessThan(0.02);
    // ... while the handle is OFFSET to the side, so the hand sits OFFSET off it along x.
    const relBase = handBase.map((v, i) => v - (handleWorld(base)[i] as number));
    const relShifted = handShifted.map((v, i) => v - (handleWorld(shifted)[i] as number));
    expect(relBase[0]! - relShifted[0]!).toBeGreaterThan(OFFSET - 0.02);
    expect(relBase[0]! - relShifted[0]!).toBeLessThan(OFFSET + 0.02);
    expect(Math.abs(relBase[2]! - relShifted[2]!)).toBeLessThan(0.02);
    // The base hand can grasp the handle, the hand beside the displaced handle cannot.
    expect(must(base, GRASP).controller.holding).toBe(true);
    expect(must(shifted, GRASP).controller.holding).toBe(false);
  });
});

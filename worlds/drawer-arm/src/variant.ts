import { mix32, u32ToUnit, xorshift32 } from './prng.js';
import type { GhostHandState, VariantParams } from './types.js';
import type { Range, VariantConfig } from './variant-config.js';

/** The calm world: no perturbation. noiseSeed is a fixed nonzero constant. */
export const BASE_VARIANT_PARAMS: VariantParams = {
  drawerFrictionN: 2,
  drawerMassKg: 0.6,
  handleOffsetM: [0, 0, 0],
  sensorNoiseM: 0,
  commandDelaySteps: 0,
  noiseSeed: 0x9e3779b9,
};

const GOLDEN = 0x9e3779b9;

function draw(state: number, r: Range): { state: number; value: number } {
  const next = xorshift32(state);
  const value = r.min + u32ToUnit(next) * (r.max - r.min);
  return { state: next, value: Math.min(r.max, Math.max(r.min, value)) };
}

/**
 * Maps (seed, variant index, config) to VariantParams. Pure and deterministic.
 * Draw order: friction, mass, offset x, y, z, noise, delay, noise seed.
 */
export function sampleVariant(seed: number, index: number, config: VariantConfig): VariantParams {
  let state = mix32((mix32(seed >>> 0) ^ Math.imul((index >>> 0) + 1, GOLDEN)) >>> 0);
  if (state === 0) state = GOLDEN;
  const g = config.ranges;

  const friction = draw(state, g.drawerFrictionN);
  const mass = draw(friction.state, g.drawerMassKg);
  const ox = draw(mass.state, g.handleOffsetM.x);
  const oy = draw(ox.state, g.handleOffsetM.y);
  const oz = draw(oy.state, g.handleOffsetM.z);
  const noise = draw(oz.state, g.sensorNoiseM);
  const delayRaw = draw(noise.state, g.commandDelaySteps);
  const lo = Math.ceil(g.commandDelaySteps.min);
  const hi = Math.floor(g.commandDelaySteps.max);
  const delay = Math.min(hi, Math.max(lo, Math.floor(delayRaw.value)));
  const noiseSeed = xorshift32(delayRaw.state);

  return {
    drawerFrictionN: friction.value,
    drawerMassKg: mass.value,
    handleOffsetM: [ox.value, oy.value, oz.value],
    sensorNoiseM: noise.value,
    commandDelaySteps: delay,
    noiseSeed: noiseSeed === 0 ? GOLDEN : noiseSeed,
  };
}

/**
 * Returns a copy of `base` with `variant`, the noise generator state, and a delay ring (every slot holds the current command) installed. The ring has commandDelaySteps + 1 slots; one slot holds the
 * joint targets plus the finger force. `integration` is shared, not copied or changed.
 */
export function applyVariant(base: GhostHandState, params: VariantParams): GhostHandState {
  const slot = base.controller.jointTarget.length + 1;
  // Every slot starts as the current command, so a delay never replays a made-up command.
  const current = [...base.controller.jointTarget, base.controller.fingerForceN];
  const delayBuffer: number[] = [];
  for (let i = 0; i < (params.commandDelaySteps + 1) * slot; i++) delayBuffer.push(current[i % slot] as number);
  return {
    ...base,
    variant: params,
    prng: params.noiseSeed >>> 0,
    delayBuffer,
    delayHead: 0,
  };
}

/**
 * Per-resource SHA-256 manifest of the tracked resources of a state, and the total hash over the sorted manifest.
 * Serialization: numbers as little-endian IEEE-754 (so -0 and 0 differ), booleans as one byte, strings as UTF-8,
 * every array and string preceded by its length (uint32) so that no two different values give the same bytes.
 */
import type { FingerprintResult } from '@ghost-run/core';
import { sha256Hex } from './hash.js';
import { STATIC_LAYOUT } from './layout.js';
import type { GhostHandState } from './types.js';

class Bytes {
  private readonly parts: Uint8Array[] = [];
  private static readonly encoder = new TextEncoder();

  f64(n: number): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, n, true);
    this.parts.push(b);
    return this;
  }

  u32(n: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    this.parts.push(b);
    return this;
  }

  bool(v: boolean): this {
    this.parts.push(Uint8Array.of(v ? 1 : 0));
    return this;
  }

  str(s: string): this {
    const e = Bytes.encoder.encode(s);
    this.u32(e.length);
    this.parts.push(e);
    return this;
  }

  nums(a: ArrayLike<number>): this {
    this.u32(a.length);
    for (let i = 0; i < a.length; i += 1) this.f64(a[i] as number);
    return this;
  }

  done(): Uint8Array {
    let total = 0;
    for (const p of this.parts) total += p.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

function slice(a: Float64Array, offset: number, length: number): Float64Array {
  return a.subarray(offset, offset + length);
}

/** The serialized bytes of every tracked resource, keyed by resource path. */
export function trackedResources(s: GhostHandState): Record<string, Uint8Array> {
  const L = STATIC_LAYOUT;
  const v = s.variant;
  const m = s.monitors;
  const c = s.controller;
  return {
    'state/qpos': new Bytes().nums(slice(s.integration, L.qpos.offset, L.qpos.length)).done(),
    'state/qvel': new Bytes().nums(slice(s.integration, L.qvel.offset, L.qvel.length)).done(),
    'state/integration': new Bytes().nums(s.integration).done(),
    'state/steps': new Bytes().f64(s.steps).done(),
    'state/controller': new Bytes().nums(c.jointTarget).f64(c.fingerForceN).bool(c.holding).done(),
    'state/prng': new Bytes().f64(s.prng).done(),
    'state/delay': new Bytes().nums(s.delayBuffer).f64(s.delayHead).done(),
    'state/variant': new Bytes()
      .f64(v.drawerFrictionN)
      .f64(v.drawerMassKg)
      .nums(v.handleOffsetM)
      .f64(v.sensorNoiseM)
      .f64(v.commandDelaySteps)
      .f64(v.noiseSeed)
      .done(),
    'state/monitors': (() => {
      const b = new Bytes().f64(m.maxContactForceN).u32(m.touched.length);
      for (const t of m.touched) b.str(t);
      return b.bool(m.jointLimitExceeded).f64(m.jointLimitSteps).bool(m.selfCollisionOccurred).f64(m.selfCollisionSteps).done();
    })(),
  };
}

export async function fingerprintOf(state: GhostHandState): Promise<FingerprintResult> {
  const resources = trackedResources(state);
  const keys = Object.keys(resources).sort();
  const manifest: Record<string, string> = {};
  for (const k of keys) manifest[k] = await sha256Hex(resources[k] as Uint8Array);
  const text = keys.map((k) => `${k}\n${manifest[k] as string}\n`).join('');
  return { hash: await sha256Hex(new TextEncoder().encode(text)), manifest };
}

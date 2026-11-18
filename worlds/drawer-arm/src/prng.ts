/** Integer pseudo-random helpers. Integer operations plus one exact division; no Math.random, no clock. */

/** murmur3 32-bit finalizer. Returns an unsigned 32-bit integer. */
export function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** One xorshift32 step (13, 17, 5). A zero state stays zero, so callers must seed with a nonzero value. */
export function xorshift32(state: number): number {
  let x = state >>> 0;
  x ^= (x << 13) >>> 0;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  return x >>> 0;
}

/** Maps an unsigned 32-bit integer to [0, 1) by an exact division by 2^32. */
export function u32ToUnit(value: number): number {
  return (value >>> 0) / 4294967296;
}

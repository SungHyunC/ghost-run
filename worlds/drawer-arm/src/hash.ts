/** Web Crypto helpers. The page needs a secure context (https or localhost) for `crypto.subtle`. */

const HEX = '0123456789abcdef';

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    out += HEX.charAt(b >>> 4) + HEX.charAt(b & 15);
  }
  return out;
}

async function digest(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error('Web Crypto (crypto.subtle) is not available in this context');
  return toHex(new Uint8Array(await subtle.digest('SHA-256', buffer)));
}

/** SHA-256 of the bytes as 64 lowercase hex digits. */
export function sha256Hex(bytes: Uint8Array): Promise<string> {
  return digest(bytes.slice().buffer);
}

/** The exact little-endian IEEE-754 bytes of the values, in order (-0 and NaN payloads are kept as written). */
export function float64LittleEndianBytes(chunks: readonly ArrayLike<number>[]): Uint8Array {
  let count = 0;
  for (const c of chunks) count += c.length;
  const buffer = new ArrayBuffer(count * 8);
  const view = new DataView(buffer);
  let offset = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += 1) {
      view.setFloat64(offset, c[i] ?? Number.NaN, true);
      offset += 8;
    }
  }
  return new Uint8Array(buffer);
}

/**
 * SHA-256 over the concatenated qpos and qvel copies of every step (the chunks), written as exact
 * little-endian bytes. Web Crypto has no incremental hash, so everything is hashed once at the end.
 */
export function trajectoryHash(chunks: readonly Float64Array[]): Promise<string> {
  return digest(float64LittleEndianBytes(chunks).buffer as ArrayBuffer);
}

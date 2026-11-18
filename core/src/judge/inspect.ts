/**
 * Content inspector: finds Canary values (raw or in one common encoding layer)
 * inside Payload bytes. Pure, dependency-free, no Node built-ins.
 *
 * No Canary byte or derived value is ever placed in an error message, and
 * there is no work budget shared across Canaries (it would break P4).
 */

import { base64Encode } from './bytes.js';

export type EncodingKind = 'raw' | 'base64' | 'base64url' | 'hex' | 'percent';

export const ENCODING_ORDER: readonly EncodingKind[] = ['raw', 'base64', 'base64url', 'hex', 'percent'];

/** A Payload longer than this is truncated to its first PAYLOAD_CAP bytes. */
export const PAYLOAD_CAP = 65_536;

export interface Inspector {
  /** eventId -> kinds detected for any of the canaries, in ENCODING_ORDER. Empty entries are omitted. */
  hits(canaries: readonly Uint8Array[]): Map<string, readonly EncodingKind[]>;
}

const WINDOW = 8;
const BLOOM_BITS = 1 << 18;
const BLOOM_WORDS = BLOOM_BITS >>> 5;
const MAX_SAMPLES = 8;
const HASH_BASE = 0x01000193;

// HASH_BASE^(WINDOW-1), used to drop the outgoing byte when rolling.
const BASE_POW = (() => {
  let p = 1;
  for (let i = 0; i < WINDOW - 1; i++) p = Math.imul(p, HASH_BASE);
  return p;
})();

function slot(hash: number): number {
  return Math.imul(hash, 0x9e3779b1) >>> 14; // top 18 bits
}

function windowHash(b: Uint8Array, start: number): number {
  let h = 0;
  for (let i = 0; i < WINDOW; i++) h = (Math.imul(h, HASH_BASE) + (b[start + i] as number)) | 0;
  return h;
}

interface View {
  readonly bytes: Uint8Array;
  bloom?: Uint32Array;
}

function bloomOf(v: View): Uint32Array {
  if (v.bloom) return v.bloom;
  const bloom = new Uint32Array(BLOOM_WORDS);
  const b = v.bytes;
  if (b.length >= WINDOW) {
    let h = windowHash(b, 0);
    for (let i = 0; ; i++) {
      const s = slot(h);
      bloom[s >>> 5] = (bloom[s >>> 5] as number) | (1 << (s & 31));
      if (i + WINDOW >= b.length) break;
      const out = Math.imul(b[i] as number, BASE_POW);
      h = (Math.imul((h - out) | 0, HASH_BASE) + (b[i + WINDOW] as number)) | 0;
    }
  }
  v.bloom = bloom;
  return bloom;
}

function bloomMayContain(v: View, needle: Uint8Array): boolean {
  const bloom = bloomOf(v);
  const last = needle.length - WINDOW;
  const samples = Math.min(MAX_SAMPLES, last + 1);
  for (let k = 0; k < samples; k++) {
    const pos = samples === 1 ? 0 : Math.floor((k * last) / (samples - 1));
    const s = slot(windowHash(needle, pos));
    if (((bloom[s >>> 5] as number) & (1 << (s & 31))) === 0) return false;
  }
  return true;
}

function kmpContains(hay: Uint8Array, needle: Uint8Array): boolean {
  const m = needle.length;
  const fail = new Int32Array(m);
  for (let i = 1, k = 0; i < m; i++) {
    while (k > 0 && needle[i] !== needle[k]) k = fail[k - 1] as number;
    if (needle[i] === needle[k]) k++;
    fail[i] = k;
  }
  for (let i = 0, k = 0; i < hay.length; i++) {
    while (k > 0 && hay[i] !== needle[k]) k = fail[k - 1] as number;
    if (hay[i] === needle[k]) k++;
    if (k === m) return true;
  }
  return false;
}

/** Every needle must be at least WINDOW bytes; shorter ones are skipped. */
function found(v: View, needle: Uint8Array): boolean {
  if (needle.length < WINDOW || needle.length > v.bytes.length) return false;
  if (!bloomMayContain(v, needle)) return false;
  return kmpContains(v.bytes, needle);
}

function isWs(b: number): boolean {
  return b === 0x0d || b === 0x0a || b === 0x20 || b === 0x09;
}

function stripWs(b: Uint8Array): Uint8Array {
  let count = 0;
  for (let i = 0; i < b.length; i++) if (isWs(b[i] as number)) count++;
  if (count === 0) return b;
  const out = new Uint8Array(b.length - count);
  for (let i = 0, j = 0; i < b.length; i++) {
    const c = b[i] as number;
    if (!isWs(c)) out[j++] = c;
  }
  return out;
}

function hexVal(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
  return -1;
}

function percentDecode(b: Uint8Array): Uint8Array {
  let changed = false;
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i] as number;
    if (c === 0x25 && i + 2 < b.length) {
      const hi = hexVal(b[i + 1] as number);
      const lo = hexVal(b[i + 2] as number);
      if (hi >= 0 && lo >= 0) {
        out[j++] = (hi << 4) | lo;
        i += 2;
        changed = true;
        continue;
      }
    }
    if (c === 0x2b) {
      out[j++] = 0x20;
      changed = true;
    } else {
      out[j++] = c;
    }
  }
  return changed ? out.subarray(0, j) : b;
}

function lowerAscii(b: Uint8Array): Uint8Array {
  let upper = false;
  for (let i = 0; i < b.length; i++) {
    const c = b[i] as number;
    if (c >= 0x41 && c <= 0x5a) {
      upper = true;
      break;
    }
  }
  if (!upper) return b;
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) {
    const c = b[i] as number;
    out[i] = c >= 0x41 && c <= 0x5a ? c + 32 : c;
  }
  return out;
}

interface Views {
  readonly v0: View;
  readonly v1: View;
  readonly v2: View;
  readonly v3: View;
  readonly v1l: View;
  readonly v3l: View;
}

function buildViews(payload: Uint8Array): Views {
  const b0 = payload.length > PAYLOAD_CAP ? payload.subarray(0, PAYLOAD_CAP) : payload;
  const b1 = stripWs(b0);
  const b2 = percentDecode(b0);
  const b3 = b2 === b0 ? b1 : stripWs(b2);
  const mk = (bytes: Uint8Array, same?: View, sameBytes?: Uint8Array): View =>
    same && sameBytes === bytes ? same : { bytes };
  const v0: View = { bytes: b0 };
  const v1 = mk(b1, v0, b0);
  const v2 = mk(b2, v0, b0);
  const v3 = b3 === b1 ? v1 : mk(b3, v2, b2);
  const l1 = lowerAscii(b1);
  const l3 = lowerAscii(b3);
  const v1l = mk(l1, v1, b1);
  const v3l = l3 === l1 ? v1l : mk(l3, v3, b3);
  return { v0, v1, v2, v3, v1l, v3l };
}

const HEX = '0123456789abcdef';

function hexNeedle(c: Uint8Array): Uint8Array {
  const out = new Uint8Array(c.length * 2);
  for (let i = 0; i < c.length; i++) {
    const v = c[i] as number;
    out[2 * i] = HEX.charCodeAt(v >> 4);
    out[2 * i + 1] = HEX.charCodeAt(v & 15);
  }
  return out;
}

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Base64 characters of (o zero bytes ++ canary) whose 6-bit groups lie fully inside the canary. */
function base64Needles(canary: Uint8Array, offset: number): { std: Uint8Array; url: Uint8Array } | undefined {
  const n = canary.length;
  const start = Math.ceil((8 * offset) / 6);
  const end = Math.floor((8 * (offset + n)) / 6);
  if (end - start < WINDOW) return undefined;
  const padded = new Uint8Array(offset + n);
  padded.set(canary, offset);
  const text = base64Encode(padded).slice(start, end);
  return {
    std: asciiBytes(text),
    url: asciiBytes(text.replace(/\+/g, '-').replace(/\//g, '_')),
  };
}

function hasWs(c: Uint8Array): boolean {
  for (let i = 0; i < c.length; i++) if (isWs(c[i] as number)) return true;
  return false;
}

function kindsFor(views: Views, canaries: readonly Uint8Array[]): readonly EncodingKind[] {
  const seen = new Set<EncodingKind>();
  for (const canary of canaries) {
    const rawInV0 = found(views.v0, canary);
    if (rawInV0) seen.add('raw');
    else {
      if (!seen.has('raw') && hasWs(canary)) {
        const stripped = stripWs(canary);
        if (stripped.length >= WINDOW && (found(views.v1, stripped) || found(views.v3, stripped))) seen.add('raw');
      }
      if (!seen.has('percent') && found(views.v2, canary)) seen.add('percent');
    }

    for (let o = 0; o < 3; o++) {
      if (seen.has('base64') && seen.has('base64url')) break;
      const nd = base64Needles(canary, o);
      if (!nd) continue;
      if (!seen.has('base64') && (found(views.v1, nd.std) || found(views.v3, nd.std))) seen.add('base64');
      if (!seen.has('base64url') && (found(views.v1, nd.url) || found(views.v3, nd.url))) seen.add('base64url');
    }
    if (!seen.has('hex')) {
      const hx = hexNeedle(canary);
      if (found(views.v1l, hx) || found(views.v3l, hx)) seen.add('hex');
    }
  }
  return ENCODING_ORDER.filter((k) => seen.has(k));
}

export function detectKinds(payload: Uint8Array, canaries: readonly Uint8Array[]): readonly EncodingKind[] {
  return kindsFor(buildViews(payload), canaries);
}

export function createInspector(payloads: ReadonlyMap<string, Uint8Array>): Inspector {
  const entries: { id: string; payload: Uint8Array; views?: Views }[] = [];
  for (const [id, payload] of payloads) entries.push({ id, payload });
  return {
    hits(canaries) {
      const out = new Map<string, readonly EncodingKind[]>();
      if (canaries.length === 0) return out;
      for (const e of entries) {
        e.views ??= buildViews(e.payload);
        const kinds = kindsFor(e.views, canaries);
        if (kinds.length > 0) out.set(e.id, kinds);
      }
      return out;
    },
  };
}

import { compareCodePoints, type FingerprintResult } from '@ghost-run/core';
import type { Entry, PlaygroundState } from '../state.js';

const encoder = new TextEncoder();

async function sha256Hex(data: Uint8Array): Promise<string> {
  const input = new Uint8Array(data.byteLength);
  input.set(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function entryBytes(entry: Entry): Uint8Array {
  if (entry.kind === 'dir') return encoder.encode('dir');
  const head = encoder.encode('file');
  const out = new Uint8Array(head.byteLength + 1 + entry.bytes.byteLength);
  out.set(head, 0);
  out.set(entry.bytes, head.byteLength + 1);
  return out;
}

/**
 * SHA-256 manifest of a state: one hash per entry, and one hash over the
 * sorted `path NUL entryHash LF` lines.
 */
export async function fingerprintState(state: PlaygroundState): Promise<FingerprintResult> {
  const paths = Object.keys(state.entries).sort(compareCodePoints);
  const manifest: Record<string, string> = {};
  let lines = '';
  for (const path of paths) {
    const entry = state.entries[path];
    if (entry === undefined) continue;
    const hash = await sha256Hex(entryBytes(entry));
    manifest[path] = hash;
    lines += `${path}\u0000${hash}\n`;
  }
  return { hash: await sha256Hex(encoder.encode(lines)), manifest };
}

import { compareCodePoints } from '@ghost-run/core';
import type { FingerprintResult } from '@ghost-run/core';
import { ACL_PREFIX, BLOCK_PREFIX, LOCAL_PREFIX } from './types.js';
import type { CloudState } from './types.js';

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 over the canonical serialization of the state, with a manifest keyed by virtual path. */
export async function fingerprintState(state: CloudState): Promise<FingerprintResult> {
  const entries: [string, string][] = [];
  for (const b of state.buckets) {
    entries.push([b.name, '']);
    for (const o of b.objects) entries.push([`${b.name}/${o.key}`, o.content]);
    entries.push([`${ACL_PREFIX}/${b.name}`, b.acl]);
    if (b.publicAccessBlocked) entries.push([`${BLOCK_PREFIX}/${b.name}`, 'blocked']);
  }
  for (const f of state.localFiles) entries.push([`${LOCAL_PREFIX}/${f.path}`, f.content]);
  entries.sort((x, y) => compareCodePoints(x[0], y[0]));

  const manifest: Record<string, string> = {};
  const rows: [string, string][] = [];
  for (const [path, content] of entries) {
    const h = await sha256Hex(content);
    manifest[path] = h;
    rows.push([path, h]);
  }
  return { hash: await sha256Hex(JSON.stringify(rows)), manifest };
}

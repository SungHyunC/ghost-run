// Run_Record files: runs/<runId>.json, the output of serializeRunResult.
import path from 'node:path';
import { parseRunResult, serializeRunResult } from '@ghost-run/ghost-runner';
import { readText, storePaths, storeWriteFile } from './ghost-store.mjs';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Keys that never belong in a stored record: secret values and payload bytes. */
const FORBIDDEN_KEYS = new Set(['secretValues', 'payloads']);

/**
 * Deep copy without the forbidden keys, so a result that carries them by
 * mistake never puts them on disk.
 * @param {unknown} value
 * @returns {unknown}
 */
function stripForbidden(value) {
  if (Array.isArray(value)) return value.map(stripForbidden);
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array || value instanceof Map) return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!FORBIDDEN_KEYS.has(k)) out[k] = stripForbidden(v);
  }
  return out;
}

/**
 * Write the Run_Record of a result. The serialized form carries no
 * `secretValues` and no payload byte.
 * @param {string} root workspace root
 * @param {import('@ghost-run/ghost-runner').RunResult} result
 * @param {readonly Uint8Array[]} [canaries]
 * @returns {Promise<{ ok: true, runId: string } | { ok: false, failure: string }>}
 */
export async function writeRunRecord(root, result, canaries = []) {
  const runId = result.runId;
  if (typeof runId !== 'string' || !ID_RE.test(runId)) return { ok: false, failure: 'path-invalid' };
  const w = await storeWriteFile(path.join(storePaths(root).runs, `${runId}.json`), serializeRunResult(/** @type {any} */ (stripForbidden(result))), canaries);
  return w.ok ? { ok: true, runId } : w;
}

/**
 * Read a Run_Record by Run_Id or by Grave_Id (a Run_Id with a leading `g-`).
 * Returns null for an unknown id, an invalid id, or an unreadable record.
 * @param {string} root
 * @param {string} id
 * @returns {Promise<import('@ghost-run/ghost-runner').SerializedRunResult | null>}
 */
export async function readRunRecord(root, id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const candidates = id.startsWith('g-') ? [id, id.slice(2)] : [id];
  for (const c of candidates) {
    if (!ID_RE.test(c)) continue;
    try {
      const text = await readText(path.join(storePaths(root).runs, `${c}.json`));
      if (text !== '') return parseRunResult(text);
    } catch {
      // Unreadable or malformed record: try the next candidate.
    }
  }
  return null;
}

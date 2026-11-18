// Per-session provenance log: one JSON object per line (`{source, kind, content}`).
// The record format belongs to `possession`; this module adds no clock, session,
// or secret field.
import { parseProvenanceLog, serializeProvenanceLog } from '@ghost-run/core';
import { readText, readLines, sessionPaths, storeWrite } from './ghost-store.mjs';

/**
 * Append one record after validating it. A record that does not parse is not
 * written.
 * @param {string} root workspace root
 * @param {string} sessionKey a Session_Key
 * @param {unknown} record
 * @param {readonly Uint8Array[]} [canaries]
 * @returns {Promise<{ ok: true } | { ok: false, failure: string }>}
 */
export async function appendProvenance(root, sessionKey, record, canaries = []) {
  // Validate the raw record, so unknown fields are rejected before they could be dropped.
  const checked = parseProvenanceLog(JSON.stringify([record]));
  if (!checked.ok || checked.log.length !== 1) return { ok: false, failure: 'invalid-record' };
  const array = serializeProvenanceLog(checked.log);
  const line = array.slice(1, -1);
  return storeWrite(sessionPaths(root, sessionKey).provenance, line, canaries);
}

/**
 * Read a session's provenance log. Each line is parsed alone; corrupt lines
 * are skipped and counted; the survivors are validated as one log.
 * @param {string} root
 * @param {string} sessionKey
 * @returns {Promise<{ log: import('@ghost-run/core').ProvenanceLog, corrupt: number }>}
 */
export async function readProvenance(root, sessionKey) {
  const text = await readText(sessionPaths(root, sessionKey).provenance);
  const { lines, corrupt: torn } = readLines(text);
  let corrupt = torn;
  /** @type {string[]} */
  const good = [];
  for (const line of lines) {
    const r = parseProvenanceLog(`[${line}]`);
    if (r.ok && r.log.length === 1) good.push(line);
    else corrupt++;
  }
  const whole = parseProvenanceLog(`[${good.join(',')}]`);
  if (!whole.ok) return { log: [], corrupt: corrupt + good.length };
  return { log: whole.log, corrupt };
}

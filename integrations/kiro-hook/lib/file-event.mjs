// Path extraction from file events (pure; no I/O, no LLM calls).
// The field names come from gate-config.mjs (measured in CLI 3.4.0 and IDE 1.4.215). The raw
// form of the path (absolute or workspace-relative) is unconfirmed, so both
// are accepted.

import { posix } from 'node:path';
import { FILE_EVENT_PATH_FIELDS } from '../gate-config.mjs';

/**
 * Return the workspace-relative path (`/` separators) of a file event, or
 * null when the field is missing, the path is outside the workspace, or it
 * still contains `..` after normalization.
 * @param {unknown} event
 * @param {string} root absolute workspace root
 * @returns {string | null}
 */
export function extractFilePath(event, root) {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return null;
  if (typeof root !== 'string' || !posix.isAbsolute(root)) return null;
  /** @type {string | undefined} */
  let raw;
  for (const field of FILE_EVENT_PATH_FIELDS) {
    if (!Object.hasOwn(event, field)) continue;
    const v = /** @type {Record<string, unknown>} */ (event)[field];
    if (typeof v === 'string' && v !== '') {
      raw = v;
      break;
    }
  }
  if (raw === undefined || raw.includes('\0')) return null;

  const normRoot = posix.normalize(root).replace(/\/+$/, '');
  let rel;
  if (posix.isAbsolute(raw)) {
    const abs = posix.normalize(raw);
    if (!abs.startsWith(`${normRoot}/`)) return null;
    rel = abs.slice(normRoot.length + 1);
  } else {
    rel = posix.normalize(raw);
  }
  rel = rel.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (rel === '' || rel === '.') return null;
  if (rel.split('/').includes('..')) return null;
  return rel;
}

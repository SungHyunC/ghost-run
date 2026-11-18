// Session key: a folder-safe name for a host session id.
import { createHash } from 'node:crypto';

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Return the id when it is already a safe key, otherwise the lowercase
 * SHA-256 hexadecimal digest of its UTF-8 bytes (64 characters, which also
 * match the pattern). Pure and deterministic.
 * @param {string} id
 * @returns {string}
 */
export function sessionKey(id) {
  if (KEY_PATTERN.test(id)) return id;
  return createHash('sha256').update(Buffer.from(id, 'utf8')).digest('hex');
}

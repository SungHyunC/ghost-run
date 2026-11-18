// Path confinement: a path is usable only when its real path is inside the real workspace root.
import { realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} root workspace root
 * @param {unknown} p user-supplied path (absolute or relative to root)
 * @returns {Promise<{ ok: true, real: string } | { ok: false, error: string }>}
 */
export async function confinePath(root, p) {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) return { ok: false, error: 'invalid path' };
  let realRoot;
  try {
    realRoot = await realpath(root);
  } catch {
    return { ok: false, error: 'workspace root is not readable' };
  }
  let real;
  try {
    real = await realpath(path.resolve(root, p));
  } catch {
    return { ok: false, error: 'path does not exist or is not readable' };
  }
  if (real === realRoot || real.startsWith(realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep)) return { ok: true, real };
  return { ok: false, error: 'path is outside the workspace' };
}

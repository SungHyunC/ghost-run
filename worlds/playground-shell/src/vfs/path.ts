import { normalizePath } from '@ghost-run/core';
import type { VirtualPath } from '../state.js';

export type VirtualPathResult =
  | { readonly ok: true; readonly path: VirtualPath }
  | { readonly ok: false; readonly error: string };

/**
 * Resolve a path argument against `cwd` inside the project.
 * A leading `~` fails; an absolute argument is relative to the project root;
 * a `..` that climbs above the root fails.
 */
export function toVirtualPath(arg: string, cwd: VirtualPath): VirtualPathResult {
  if (arg.startsWith('~')) return { ok: false, error: '~ is not available in the ghost' };
  const joined = arg.startsWith('/') ? arg : `${cwd}/${arg}`;
  const stack: string[] = [];
  for (const segment of joined.normalize('NFC').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return { ok: false, error: 'path escapes the project' };
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return { ok: true, path: normalizePath(stack.join('/')) };
}

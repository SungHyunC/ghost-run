// Helpers shared by the file-system handlers.

import type { VirtualPath } from '../../state.js';
import { toVirtualPath } from '../../vfs/path.js';
import type { RunEnv } from '../interpret.js';

const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });

export function decodeUtf8(bytes: Uint8Array): string {
  return UTF8.decode(bytes);
}

export function parentOf(path: VirtualPath): VirtualPath {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function baseOf(path: VirtualPath): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

export function join(dir: VirtualPath, name: string): VirtualPath {
  return dir === '' ? name : `${dir}/${name}`;
}

/** True when `path` is `ancestor` or lies below it. */
export function isWithin(path: VirtualPath, ancestor: VirtualPath): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`);
}

export type Resolved =
  | { readonly ok: true; readonly path: VirtualPath }
  | { readonly ok: false; readonly message: string };

/** Resolves an argument against the working directory of the step. */
export function resolveArg(arg: string, env: RunEnv): Resolved {
  const r = toVirtualPath(arg, env.cwd);
  return r.ok ? r : { ok: false, message: r.error };
}

/** Reason a new entry cannot be created under `path`'s parent, or undefined. */
export function parentProblem(path: VirtualPath, env: RunEnv): string | undefined {
  const parent = env.fs.get(parentOf(path));
  if (parent === undefined) return 'No such file or directory';
  if (parent.kind !== 'dir') return 'Not a directory';
  return undefined;
}

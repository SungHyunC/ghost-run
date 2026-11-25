import { posix } from 'node:path';

/**
 * Device paths that never count as an effect outside the copy: writing to or reading from them
 * leaves nothing behind. This is the single definition used by the static analyzer, and through
 * it by the Repo_World's `effectsOutside`. Any other path under `/dev` stays an external path.
 */
export const HARMLESS_DEVICE_PATHS: readonly string[] = [
  '/dev/null',
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/stdin',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/tty',
];

const FD_RE = /^\/dev\/fd\/[0-9]+$/;

/** True for a listed harmless device path or `/dev/fd/<digits>`. Pure; the path is normalized first. */
export function isHarmlessDevicePath(p: string): boolean {
  if (!p.startsWith('/dev/')) return false;
  const n = posix.normalize(p);
  return HARMLESS_DEVICE_PATHS.includes(n) || FD_RE.test(n);
}

/**
 * Owner identity and liveness of host processes, shared by the Pool sweep (`pool.ts`) and the
 * stale-box sweep at run start (`stale-sweep.ts`).
 *
 * An owner is written as `<pid>:<process start time>`. It counts as alive when its pid exists and
 * its start time equals the recorded one (pid reuse). When the start time cannot be read, a live
 * pid counts as alive. An owner string that cannot be parsed counts as alive (cannot prove dead).
 */
import { execFileSync } from 'node:child_process';

export const UNKNOWN_START = 'unknown';

export interface ProcessInfo {
  readonly pid: number;
  /** Owner label value of this process: `<pid>:<start time>`. */
  readonly owner: string;
  /** Whether the process named by `owner` still exists with the same start time. */
  isAlive(owner: string): boolean;
}

/** Start time of `pid` as printed by `ps -o lstart=`, or undefined when it cannot be read. */
export function processStartTime(pid: number): string | undefined {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C' },
    });
    const t = out.trim().replace(/\s+/g, ' ');
    return t === '' ? undefined : t;
  } catch {
    return undefined;
  }
}

export function parseOwner(owner: string): { pid: number; start: string } | undefined {
  const i = owner.indexOf(':');
  if (i <= 0) return undefined;
  const pid = Number(owner.slice(0, i));
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  return { pid, start: owner.slice(i + 1) };
}

export function ownerIsAlive(owner: string): boolean {
  const parsed = parseOwner(owner);
  if (parsed === undefined) return true; // cannot prove it dead: keep
  try {
    process.kill(parsed.pid, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
  if (parsed.start === UNKNOWN_START) return true;
  const now = processStartTime(parsed.pid);
  return now === undefined || now === parsed.start;
}

export function currentProcessInfo(): ProcessInfo {
  const pid = process.pid;
  const owner = `${String(pid)}:${processStartTime(pid) ?? UNKNOWN_START}`;
  return { pid, owner, isAlive: ownerIsAlive };
}

let cached: ProcessInfo | undefined;

/** `currentProcessInfo()` computed once per process (it spawns `ps`). */
export function processInfo(): ProcessInfo {
  if (cached === undefined || cached.pid !== process.pid) cached = currentProcessInfo();
  return cached;
}

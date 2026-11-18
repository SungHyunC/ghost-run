import { spawn } from 'node:child_process';

/** Hard limit for the whole pipeline (Req 7.5). */
export const PIPELINE_DEADLINE_MS = 55_000;

export interface DockerResult {
  readonly code: number | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly timedOut: boolean;
  /** Set when the process could not be started (for example docker is not installed). */
  readonly spawnError?: string;
}

export interface DockerCallOptions {
  /** Upper bound for this call. Clamped to the time left until the deadline. */
  readonly timeoutMs?: number;
  /** Absolute deadline (ms since epoch). */
  readonly deadlineAt?: number;
  readonly stdin?: Uint8Array;
  /** Cap for each captured stream. Excess output is dropped. Default 16 MiB. */
  readonly maxOutputBytes?: number;
}

/** Injectable client. Tests supply doubles; production uses `createDockerClient`. */
export interface DockerClient {
  run(args: readonly string[], opts?: DockerCallOptions): Promise<DockerResult>;
}

export interface DeadlineClock {
  readonly now: () => number;
}

const systemClock: DeadlineClock = { now: () => Date.now() };

/** Milliseconds left until `deadlineAt`, never negative. */
export function remainingMs(deadlineAt: number, clock: DeadlineClock = systemClock): number {
  return Math.max(0, deadlineAt - clock.now());
}

/**
 * Effective timeout of one call: the smaller of the requested timeout and the time left
 * until the deadline. Without either bound the call gets the full pipeline deadline.
 */
export function effectiveTimeoutMs(
  opts: Pick<DockerCallOptions, 'timeoutMs' | 'deadlineAt'>,
  clock: DeadlineClock = systemClock,
): number {
  const candidates: number[] = [];
  if (opts.timeoutMs !== undefined) candidates.push(Math.max(0, opts.timeoutMs));
  if (opts.deadlineAt !== undefined) candidates.push(remainingMs(opts.deadlineAt, clock));
  return candidates.length === 0 ? PIPELINE_DEADLINE_MS : Math.min(...candidates);
}

const DEFAULT_MAX_OUTPUT = 16 * 1024 * 1024;

/**
 * Thin wrapper around `spawn(file, args)`. Never uses a shell (`shell` is always false),
 * so every argument reaches the program as one element (Req 5.9).
 */
export function createDockerClient(file = 'docker', clock: DeadlineClock = systemClock): DockerClient {
  return {
    run(args, opts = {}) {
      const timeoutMs = effectiveTimeoutMs(opts, clock);
      const cap = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
      return new Promise<DockerResult>((resolve) => {
        if (timeoutMs <= 0) {
          resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true });
          return;
        }
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        let outLen = 0;
        let errLen = 0;
        let timedOut = false;
        let settled = false;
        const child = spawn(file, [...args], {
          shell: false,
          stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        });
        const finish = (r: DockerResult): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(r);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout?.on('data', (c: Buffer) => {
          if (outLen < cap) {
            out.push(c);
            outLen += c.length;
          }
        });
        child.stderr?.on('data', (c: Buffer) => {
          if (errLen < cap) {
            err.push(c);
            errLen += c.length;
          }
        });
        child.on('error', (e: Error) => {
          finish({ code: null, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut, spawnError: e.message });
        });
        child.on('close', (code: number | null) => {
          finish({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut });
        });
        if (opts.stdin && child.stdin) {
          child.stdin.on('error', () => undefined);
          child.stdin.end(opts.stdin);
        }
      });
    },
  };
}

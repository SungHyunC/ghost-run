// runLine: runs one command line left to right against a MutableFs.

import type { VirtualPath } from '../state.js';
import type { SqlExecutor } from '../sql/executor.js';
import { truncateOutput } from '../trace.js';
import { LimitError, type MutableFs } from '../vfs/mutable-fs.js';
import { toVirtualPath } from '../vfs/path.js';
import { HANDLERS } from './commands/index.js';
import { Io, isUnsupported } from './commands/types.js';
import { parseLine, type SimpleCommand } from './parse.js';

/** The only way a handler reports a read, a network attempt, or a watchdog firing. */
export interface RunTrace {
  /** The secret-read choke point: records only when a secret pattern matches. */
  recordRead(path: VirtualPath): void;
  recordNetwork(destination: string, body?: Uint8Array): void;
  markWatchdog(): void;
}

export interface RunEnv {
  fs: MutableFs;
  cwd: VirtualPath;
  stepIndex: number;
  trace: RunTrace;
  sql: SqlExecutor;
  depth: number;
  budget: { commands: number };
}

export interface LineResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  unsupportedReason?: string;
  watchdog: boolean;
}

interface SimpleResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  watchdog: boolean;
  unsupportedReason?: string;
}

const ENCODER = new TextEncoder();

function unsupportedResult(
  reason: string,
  stdout: string,
  stderr: string,
  watchdog: boolean,
): LineResult {
  return {
    exitCode: 127,
    stdout: truncateOutput(stdout),
    stderr: truncateOutput(`${stderr}unsupported: ${reason}`),
    unsupportedReason: reason,
    watchdog,
  };
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

async function runSimple(cmd: SimpleCommand, env: RunEnv): Promise<SimpleResult> {
  const mark = env.fs.mark();
  let redirectPath: VirtualPath | undefined;
  if (cmd.redirect !== undefined) {
    const { op, target } = cmd.redirect;
    const r = toVirtualPath(target, env.cwd);
    const fail = (message: string): SimpleResult => ({
      exitCode: 1,
      stdout: '',
      stderr: `${target}: ${message}\n`,
      watchdog: false,
    });
    if (!r.ok) return fail(r.error);
    const existing = env.fs.get(r.path);
    if (r.path === '' || existing?.kind === 'dir') return fail('Is a directory');
    const parent = env.fs.get(r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : '');
    if (parent === undefined) return fail('No such file or directory');
    if (parent.kind !== 'dir') return fail('Not a directory');
    redirectPath = r.path;
    if (op === '>' || existing === undefined) env.fs.putFile(r.path, new Uint8Array(0));
  }

  const name = cmd.words[0] as string;
  const handler = HANDLERS.get(name);
  if (handler === undefined) {
    env.fs.rollback(mark);
    return {
      exitCode: 127,
      stdout: '',
      stderr: '',
      watchdog: false,
      unsupportedReason: `command not supported: ${name}`,
    };
  }
  const io = new Io();
  const result = await handler(cmd.words.slice(1), io, { ...env, runLine });
  if (isUnsupported(result)) {
    env.fs.rollback(mark);
    return {
      exitCode: 127,
      stdout: io.stdout,
      stderr: io.stderr,
      watchdog: io.watchdog,
      unsupportedReason: result.unsupported,
    };
  }

  let stdout = io.stdout;
  if (redirectPath !== undefined && cmd.redirect !== undefined) {
    if (stdout !== '') {
      const written = ENCODER.encode(stdout);
      const current = env.fs.get(redirectPath);
      const base = cmd.redirect.op === '>>' && current?.kind === 'file' ? current.bytes : new Uint8Array(0);
      env.fs.putFile(redirectPath, concatBytes(base, written));
    }
    stdout = '';
  }
  return { exitCode: result, stdout, stderr: io.stderr, watchdog: io.watchdog };
}

export async function runLine(line: string, env: RunEnv): Promise<LineResult> {
  const commands = parseLine(line);
  const mark = env.fs.mark();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let watchdog = false;
  try {
    for (const cmd of commands) {
      if (cmd.unsupportedReason !== undefined) {
        return unsupportedResult(cmd.unsupportedReason, stdout, stderr, watchdog);
      }
      if (cmd.connector === '&&' && exitCode !== 0) continue;
      if (env.budget.commands <= 0) {
        return unsupportedResult('command budget exceeded', stdout, stderr, watchdog);
      }
      env.budget.commands--;
      const r = await runSimple(cmd, env);
      stdout += r.stdout;
      stderr += r.stderr;
      watchdog = watchdog || r.watchdog;
      if (r.unsupportedReason !== undefined) {
        return unsupportedResult(r.unsupportedReason, stdout, stderr, watchdog);
      }
      exitCode = r.exitCode;
    }
  } catch (error) {
    if (error instanceof LimitError && env.depth === 0) {
      env.fs.rollback(mark);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `limit exceeded: ${error.limit}`,
        watchdog,
      };
    }
    throw error;
  }
  return { exitCode, stdout: truncateOutput(stdout), stderr: truncateOutput(stderr), watchdog };
}

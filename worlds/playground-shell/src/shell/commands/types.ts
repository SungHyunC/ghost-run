// Shared types of the command handlers.

import type { LineResult, RunEnv } from '../interpret.js';

/** Collects the output of one handler. */
export class Io {
  stdout = '';
  stderr = '';
  watchdog = false;

  out(text: string): void {
    this.stdout += text;
  }

  err(text: string): void {
    this.stderr += text;
  }
}

/** Reserved result: the step is an Unsupported_Command with this reason. */
export interface UnsupportedResult {
  readonly unsupported: string;
}

export function UNSUPPORTED(reason: string): UnsupportedResult {
  return { unsupported: reason };
}

export function isUnsupported(result: number | UnsupportedResult): result is UnsupportedResult {
  return typeof result !== 'number';
}

export type HandlerResult = number | UnsupportedResult;

/** RunEnv plus the line runner, injected by the interpreter so handlers need no import of it. */
export interface HandlerEnv extends RunEnv {
  runLine(line: string, env: RunEnv): Promise<LineResult>;
}

export type Handler = (args: string[], io: Io, env: HandlerEnv) => Promise<HandlerResult>;

export interface ParsedArgs {
  readonly flags: ReadonlySet<string>;
  readonly operands: string[];
}

/**
 * Splits `args` into flags and operands. A word that starts with `-` must be
 * one of `allowed` exactly (so `-la` is not `-l -a`); anything else is
 * unsupported. A lone `-` (standard input) is unsupported too.
 */
export function parseArgs(
  name: string,
  args: readonly string[],
  allowed: readonly string[],
): ParsedArgs | UnsupportedResult {
  const flags = new Set<string>();
  const operands: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (!allowed.includes(arg)) return UNSUPPORTED(`${name}: option ${arg}`);
      flags.add(arg);
    } else {
      operands.push(arg);
    }
  }
  return { flags, operands };
}

export function isParsed(value: ParsedArgs | UnsupportedResult): value is ParsedArgs {
  return !('unsupported' in value);
}

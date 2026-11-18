// Hook I/O: bounded STDIN read, fixed fatal lines, flush-then-exit writer,
// and the bootstrap helper. No input text is ever echoed to the output.

import { STDIN_MAX_BYTES } from '../gate-config.mjs';

/** @typedef {{ exit: 0 | 2, stdout: string, stderr: string }} HookOutcome */
/** @typedef {'unavailable' | 'internal-error' | 'timeout'} FatalKind */
/**
 * Output sinks. Each write takes a callback that runs after the data is flushed.
 * @typedef {{
 *   stdout: (text: string, cb: () => void) => void,
 *   stderr: (text: string, cb: () => void) => void,
 *   exit: (code: number) => void,
 * }} HookIo
 */

/** Fixed STDERR lines, one per failure kind. */
export const FATAL_LINES = Object.freeze({
  unavailable: 'GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).',
  'internal-error': 'GHOST RUN GATE ERROR: internal-error; the tool call was not allowed.',
  timeout: 'GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed.',
});

/** @type {HookIo} */
export const processIo = {
  stdout: (text, cb) => {
    process.stdout.write(text, cb);
  },
  stderr: (text, cb) => {
    process.stderr.write(text, cb);
  },
  exit: (code) => process.exit(code),
};

/**
 * Read a stream as UTF-8 text, at most maxBytes bytes.
 * @param {AsyncIterable<Uint8Array | string>} stream
 * @param {number} maxBytes
 * @returns {Promise<string>} rejects with `{ code: 'too-large' }` past the cap
 */
export async function readStdinBounded(stream, maxBytes) {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw { code: 'too-large' };
    }
    chunks.push(bytes);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

/**
 * Write the outcome, wait for both writes to flush, then exit. The exit code
 * is always 0 or 2: any other value becomes 2.
 * @param {HookOutcome} outcome
 * @param {HookIo} [io]
 * @returns {void}
 */
export function finish(outcome, io = processIo) {
  const code = outcome.exit === 0 ? 0 : 2;
  const stdout = typeof outcome.stdout === 'string' ? outcome.stdout : '';
  const stderr = typeof outcome.stderr === 'string' ? outcome.stderr : '';
  io.stdout(stdout, () => {
    io.stderr(stderr, () => io.exit(code));
  });
}

/**
 * Print the one fixed line for a failure kind and exit 2.
 * @param {FatalKind} kind
 * @param {HookIo} [io]
 * @returns {void}
 */
export function fatal(kind, io = processIo) {
  const line = Object.hasOwn(FATAL_LINES, kind) ? FATAL_LINES[kind] : FATAL_LINES['internal-error'];
  finish({ exit: 2, stdout: '', stderr: `${line}\n` }, io);
}

/**
 * Bootstrap helper. Installs the fatal handlers, reads STDIN with a bound,
 * loads the hook module and writes its outcome. `load` must resolve to a module
 * with `run(stdinText): Promise<HookOutcome>`. Any failure prints one fixed
 * line and exits 2: a failing `load` is 'unavailable', everything else is
 * 'internal-error'. `name` identifies the hook for callers and tests.
 * @param {string} name
 * @param {() => Promise<{ run: (text: string) => Promise<HookOutcome> | HookOutcome }>} load
 * @param {{ stdin?: AsyncIterable<Uint8Array | string>, maxBytes?: number, io?: HookIo, proc?: { on: (ev: string, fn: () => void) => unknown } }} [opts]
 * @returns {Promise<void>}
 */
export async function runHook(name, load, opts = {}) {
  void name;
  const io = opts.io ?? processIo;
  const proc = opts.proc ?? process;
  const onFault = () => fatal('internal-error', io);
  proc.on('uncaughtException', onFault);
  proc.on('unhandledRejection', onFault);

  /** @type {string} */
  let text;
  try {
    text = await readStdinBounded(opts.stdin ?? process.stdin, opts.maxBytes ?? STDIN_MAX_BYTES);
  } catch {
    return fatal('internal-error', io);
  }

  /** @type {Awaited<ReturnType<typeof load>>} */
  let mod;
  try {
    mod = await load();
  } catch {
    return fatal('unavailable', io);
  }

  try {
    const outcome = await mod.run(text);
    return finish(outcome, io);
  } catch {
    return fatal('internal-error', io);
  }
}

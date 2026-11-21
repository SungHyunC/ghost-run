// Tests for gate-config.mjs and lib/hook-io.mjs (task 4.1).
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import * as config from '../gate-config.mjs';
import { FATAL_LINES, fatal, finish, readStdinBounded, runHook } from '../lib/hook-io.mjs';

/** Recording sink. Writes call back asynchronously, so order is observable. */
function makeIo() {
  /** @type {string[]} */
  const log = [];
  return {
    log,
    io: {
      stdout: (/** @type {string} */ t, /** @type {() => void} */ cb) => {
        log.push(`out:${t}`);
        setTimeout(cb, 0);
      },
      stderr: (/** @type {string} */ t, /** @type {() => void} */ cb) => {
        log.push(`err:${t}`);
        setTimeout(cb, 0);
      },
      exit: (/** @type {number} */ c) => {
        log.push(`exit:${c}`);
      },
    },
  };
}

const wait = () => new Promise((r) => setTimeout(r, 20));

describe('gate-config', () => {
  it('exports the design constants', () => {
    expect(config.WARN_MODE).toBe('ask');
    expect(config.WATCHDOG_MS).toBe(50_000);
    expect(config.RUNNER_DEADLINE_SEC).toBe(44);
    expect(config.SEMAPHORE_SLOTS).toBe(2);
    expect(config.SEMAPHORE_WAIT_MS).toBe(5_000);
    expect(config.STDIN_MAX_BYTES).toBe(1_048_576);
    expect(config.COMMAND_MAX_CODE_POINTS).toBe(4096);
    expect(config.DELETE_ENUM_MAX).toBe(10_000);
    expect(config.STORE_CAPS).toEqual({
      sessions: 20,
      runs: 200,
      graveyardLines: 2000,
      provenancePerSession: 1000,
      recordBytes: 1_048_576,
    });
    expect(config.RUNNER_SUPPORTS_RUN_ID).toBe(true);
    expect(config.DOCKER_WAKE_RETRY_MS).toBe(10_000);
    expect(config.WARMUP_BUDGET_MS).toBe(1_000);
  });
});

describe('readStdinBounded', () => {
  it('decodes UTF-8 across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode('a\u00e9\u20ac');
    const text = await readStdinBounded(Readable.from([bytes.slice(0, 2), bytes.slice(2)]), 100);
    expect(text).toBe('a\u00e9\u20ac');
  });

  it('accepts exactly maxBytes and rejects one more', async () => {
    await expect(readStdinBounded(Readable.from([Buffer.alloc(8, 97)]), 8)).resolves.toHaveLength(8);
    await expect(readStdinBounded(Readable.from([Buffer.alloc(9, 97)]), 8)).rejects.toEqual({
      code: 'too-large',
    });
  });
});

describe('fatal and finish', () => {
  it('prints one fixed line per kind, exits 2 after the flush', async () => {
    for (const kind of /** @type {const} */ (['unavailable', 'internal-error', 'timeout'])) {
      const { log, io } = makeIo();
      fatal(kind, io);
      expect(log).toEqual([`out:`]);
      await wait();
      expect(log).toEqual(['out:', `err:${FATAL_LINES[kind]}\n`, 'exit:2']);
    }
  });

  it('forces an exit code that is not 0 to 2', async () => {
    const { log, io } = makeIo();
    finish(/** @type {any} */ ({ exit: 1, stdout: '', stderr: '' }), io);
    await wait();
    expect(log.at(-1)).toBe('exit:2');
  });
});

describe('runHook', () => {
  const run = (/** @type {any} */ load, /** @type {any[]} */ chunks = ['{}']) => {
    const { log, io } = makeIo();
    const handlers = /** @type {string[]} */ ([]);
    const proc = { on: (/** @type {string} */ ev) => void handlers.push(ev) };
    return runHook('t', load, { stdin: Readable.from(chunks), io, proc }).then(async () => {
      await wait();
      return { log, handlers };
    });
  };

  it('writes the module outcome and installs both handlers', async () => {
    const { log, handlers } = await run(async () => ({
      run: async (/** @type {string} */ t) => ({ exit: 0, stdout: `got ${t}`, stderr: '' }),
    }));
    expect(log).toEqual(['out:got {}', 'err:', 'exit:0']);
    expect(handlers).toEqual(['uncaughtException', 'unhandledRejection']);
  });

  it('reports unavailable when load throws', async () => {
    const { log } = await run(async () => {
      throw new Error('secret path');
    });
    expect(log.join()).toContain(FATAL_LINES.unavailable);
    expect(log.join()).not.toContain('secret path');
    expect(log.at(-1)).toBe('exit:2');
  });

  it('reports internal-error when run throws', async () => {
    const { log } = await run(async () => ({
      run: async () => {
        throw new Error('x');
      },
    }));
    expect(log.join()).toContain(FATAL_LINES['internal-error']);
    expect(log.at(-1)).toBe('exit:2');
  });

  it('reports internal-error when STDIN is too large', async () => {
    const { log, io } = makeIo();
    await runHook('t', async () => ({ run: async () => ({ exit: 0, stdout: '', stderr: '' }) }), {
      stdin: Readable.from([Buffer.alloc(10)]),
      maxBytes: 4,
      io,
      proc: { on: () => undefined },
    });
    await wait();
    expect(log.join()).toContain(FATAL_LINES['internal-error']);
    expect(log.at(-1)).toBe('exit:2');
  });
});

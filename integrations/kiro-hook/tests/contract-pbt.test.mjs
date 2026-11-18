import fc from 'fast-check';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run as hookRun } from '../lib/pbt/main.mjs';
import ContractPbtReporter, { LINE_KEY, REQUIRED_HOOKS } from '../lib/pbt/reporter.mjs';
import { describeFailure, lockFile, parseReporterLine, runSuites, vitestArgs } from '../lib/pbt/run.mjs';
import { makeTempStore } from './fixtures/index.mjs';

const UID = 501;
/** @type {any} */
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] };
const tick = () => new Promise((r) => setImmediate(r));
/** Advance the fake clock in steps until the promise settles (real I/O between steps). */
async function settle(/** @type {Promise<any>} */ p) {
  let done = false;
  void p.then(() => (done = true), () => (done = true));
  for (let i = 0; i < 200 && !done; i++) {
    await vi.advanceTimersByTimeAsync(1_000);
    await tick();
  }
  return p;
}
async function untilSpawned(/** @type {{ children: unknown[] }} */ sp) {
  while (sp.children.length === 0) await tick();
  await tick();
}
const line = (/** @type {Record<string, unknown>} */ o) => `${JSON.stringify({ [LINE_KEY]: 1, ...o })}\n`;

/** A child process double: stdout is a stream, `close(code)` ends it. */
class FakeChild extends EventEmitter {
  /** @param {number} pid */
  constructor(pid) {
    super();
    this.pid = pid;
    this.stdout = new PassThrough();
  }
  /** @param {string} text */
  emitLine(text) {
    this.stdout.write(text);
  }
  /** @param {number} code */
  close(code) {
    this.stdout.end();
    this.emit('close', code);
  }
}

/** @returns {{ calls: { cmd: string, args: string[], opts: any }[], children: FakeChild[], spawn: (cmd: string, args: string[], opts: any) => FakeChild, script: (c: FakeChild, i: number) => void }} */
function makeSpawn(/** @type {(c: FakeChild, i: number) => void} */ script) {
  /** @type {any[]} */
  const calls = [];
  /** @type {FakeChild[]} */
  const children = [];
  return {
    calls,
    children,
    script,
    spawn(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      const child = new FakeChild(5000 + children.length);
      children.push(child);
      queueMicrotask(() => script(child, children.length - 1));
      return child;
    },
  };
}

/** @type {ReturnType<typeof makeTempStore>} */
let store;
beforeEach(() => {
  store = makeTempStore();
});
afterEach(() => {
  vi.useRealTimers();
  store.cleanup();
});

const base = () => ({ root: store.dir, uid: UID, vitestBin: 'vitest.mjs', reporter: 'reporter.mjs', inspect: async () => null });
const event = (/** @type {string} */ rel) => JSON.stringify({ hook_event_name: 'PostFileSave', cwd: store.dir, session_id: 's', file_path: rel });
const lastJson = () => JSON.parse(readFileSync(join(store.storeDir, 'pbt', 'last.json'), 'utf8'));

describe('reporter (vitest 3.2.x API)', () => {
  it('implements every required hook', () => {
    for (const hook of REQUIRED_HOOKS) {
      expect(typeof (/** @type {any} */ (ContractPbtReporter.prototype)[hook]), hook).toBe('function');
    }
  });

  it('prints one JSON line per finished test and per collected module', () => {
    /** @type {string[]} */
    const out = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => (out.push(String(t)), true));
    try {
      const r = new ContractPbtReporter();
      r.onTestRunStart([{ moduleId: '/w/a.test.ts' }]);
      r.onTestModuleCollected({ moduleId: '/w/a.test.ts', children: { allTests: () => [{ fullName: 'P1 holds' }] } });
      r.onTestCaseResult({
        fullName: 'P1 holds',
        module: { moduleId: '/w/a.test.ts' },
        result: () => ({ state: 'failed', errors: [{ message: 'boom' }] }),
        diagnostic: () => ({ duration: 4.4 }),
      });
    } finally {
      spy.mockRestore();
    }
    const events = out.map((l) => parseReporterLine(l.trimEnd()));
    expect(events.map((e) => e?.['e'])).toEqual(['files', 'collected', 'test']);
    expect(events[2]).toMatchObject({ name: 'P1 holds', state: 'failed', message: 'boom', ms: 4 });
  });

  it('ignores lines that are not reporter lines', () => {
    expect(parseReporterLine('stdout | something')).toBeNull();
    expect(parseReporterLine(`{"${LINE_KEY}":1,`)).toBeNull();
  });
});

describe('describeFailure', () => {
  it('reads id, shrunk counterexample, criterion, and seed from a real fast-check message', () => {
    let message = '';
    try {
      fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), (n) => n < 10), { seed: 4242, numRuns: 200 });
    } catch (e) {
      message = /** @type {Error} */ (e).message;
    }
    const f = describeFailure({
      name: 'Property 3: restore > P3 returns the pre-snapshot state (Requirements 9.2)',
      file: '/w/core/tests/p3-restore.test.ts',
      message,
    });
    expect(f.id).toBe('P3');
    expect(f.counterexample).toBe('[10]');
    expect(f.seed).toBe(4242);
    expect(f.criterion).toBe('9.2');
  });

  it('falls back to the file name for the id and to unknown values', () => {
    const f = describeFailure({ name: 'restores', file: '/w/tests/prop-19-x.test.mjs', message: 'plain failure' });
    expect(f).toEqual({ id: 'P19', criterion: 'unknown', seed: null, counterexample: 'plain failure' });
  });
});

describe('hook run', () => {
  it('a failing property prints id, counterexample, criterion, and seed on STDERR and exits non-zero', async () => {
    const msg = 'Property failed after 3 tests\n{ seed: 77, path: "2:0", endOnFailure: true }\nCounterexample: [10]\nShrunk 2 time(s)\ncriterionId: "9.2"';
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'test', name: 'P3 restore', file: '/w/core/tests/p3-restore.test.ts', state: 'failed', message: msg }));
      c.close(1);
    });
    const out = await hookRun(event('core/src/a.ts'), { ...base(), spawn: sp.spawn });
    expect(out.exit).toBe(1);
    expect(out.stderr).toContain('PROPERTY FAILED: P3');
    expect(out.stderr).toContain('counterexample: [10]');
    expect(out.stderr).toContain('criterion: 9.2');
    expect(out.stderr).toContain('seed: 77');
    expect(out.stdout).toContain('contract-pbt: failed');
    expect(lastJson().outcome).toBe('failed');
  });

  it('a child that ends non-zero without a result is a failure, never a pass', async () => {
    const sp = makeSpawn((c) => c.close(1));
    const out = await hookRun(event('core/src/a.ts'), { ...base(), spawn: sp.spawn });
    expect(out.exit).toBe(1);
    expect(lastJson().failed[0].id).toBe('run-error');
  });

  it('a path outside core and worlds spawns nothing and prints nothing', async () => {
    const sp = makeSpawn((c) => c.close(0));
    for (const rel of ['README.md', 'corex/a.ts', 'worlds-old/a/b.ts']) {
      expect(await hookRun(event(rel), { ...base(), spawn: sp.spawn })).toEqual({ exit: 0, stdout: '', stderr: '' });
    }
    expect(await hookRun('not json', { ...base(), spawn: sp.spawn })).toEqual({ exit: 0, stdout: '', stderr: '' });
    expect(sp.calls).toHaveLength(0);
    expect(existsSync(join(store.storeDir, 'pbt', 'last.json'))).toBe(false);
  });

  it('a Docker-bound test reported skipped is printed as skipped and not counted as passed', async () => {
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'test', name: 'P1 box [skipped (docker unavailable)]', file: '/w/ghost-runner/tests/p19-docker-p1.docker.test.ts', state: 'skipped' }));
      c.emitLine(line({ e: 'test', name: 'P7 pure', file: '/w/core/tests/x.test.ts', state: 'passed' }));
      c.close(0);
    });
    const out = await hookRun(event('core/src/a.ts'), { ...base(), spawn: sp.spawn });
    expect(out.exit).toBe(0);
    expect(out.stdout).toContain('skipped (docker unavailable)');
    const last = lastJson();
    expect(last.passed).toBe(1);
    expect(last.skipped).toHaveLength(1);
  });

  it('a world without a contract test and without a package reports incomplete (no-suites), not passed', async () => {
    mkdirSync(join(store.dir, 'worlds', 'empty-one'), { recursive: true });
    const sp = makeSpawn((c) => c.close(0));
    // The core judgment-engine suite still runs for a world save; make it report nothing.
    const out = await hookRun(event('worlds/empty-one/src/a.ts'), { ...base(), spawn: sp.spawn });
    expect(out.stdout).not.toContain('contract-pbt: passed');
    expect(lastJson().ok).toBe(false);
  });

  it('writes pbt/last.json once, after the last suite', async () => {
    /** @type {boolean[]} */
    const seen = [];
    const lastFile = join(store.storeDir, 'pbt', 'last.json');
    const sp = makeSpawn((c) => {
      seen.push(existsSync(lastFile));
      c.emitLine(line({ e: 'test', name: 'P1 ok', file: '/w/a.test.ts', state: 'passed' }));
      c.close(0);
    });
    mkdirSync(join(store.dir, 'worlds', 'w-one', 'tests'), { recursive: true });
    writeFileSync(join(store.dir, 'worlds', 'w-one', 'package.json'), '{}');
    const out = await hookRun(event('worlds/w-one/src/a.ts'), { ...base(), spawn: sp.spawn });
    expect(sp.calls).toHaveLength(2);
    expect(seen).toEqual([false, false]);
    expect(out.exit).toBe(0);
    expect(lastJson().suites).toEqual(['world:w-one', 'core:judgment-engine']);
  });
});

describe('modes and arguments', () => {
  it('always sets GHOST_PBT_MODE=short for core and worlds, even when nightly is inherited, and never passes nightly', async () => {
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'test', name: 'P1 ok', file: '/w/a.test.ts', state: 'passed' }));
      c.close(0);
    });
    await hookRun(event('core/src/a.ts'), { ...base(), spawn: sp.spawn, env: { GHOST_PBT_MODE: 'nightly', PATH: '/bin' } });
    expect(sp.calls.length).toBeGreaterThan(0);
    for (const c of sp.calls) {
      expect(c.opts.env.GHOST_PBT_MODE).toBe('short');
      expect(c.opts.shell).toBe(false);
      expect(c.opts.detached).toBe(true);
      expect(c.cmd).toBe(process.execPath);
      expect(c.args.join(' ')).not.toMatch(/nightly/);
    }
  });

  it('a ghost-runner suite runs only the unit project in the on-save mode', () => {
    const r = vitestArgs({ cwd: join(store.dir, 'ghost-runner'), rest: [] }, store.dir, 'reporter.mjs');
    expect(r.args).toEqual(['run', '--reporter', 'reporter.mjs', '--typecheck.enabled=false', '--project', 'unit']);
    expect(r.mode).toBe('save');
    const c = vitestArgs({ cwd: join(store.dir, 'core'), rest: [] }, store.dir, 'reporter.mjs');
    expect(c.args).not.toContain('--project');
    expect(c.mode).toBe('short');
  });
});

describe('deadline (fake timers)', () => {
  it('stops the child group at 55 s, reports incomplete with the unfinished names, and never passes them', async () => {
    vi.useFakeTimers(FAKE);
    /** @type {any[]} */
    const kills = [];
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'collected', file: '/w/a.test.ts', names: ['P1 fast', 'P2 slow', 'P3 never'] }));
      c.emitLine(line({ e: 'test', name: 'P1 fast', file: '/w/a.test.ts', state: 'passed' }));
    });
    const p = runSuites({ kind: 'core' }, {
      ...base(),
      spawn: sp.spawn,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      kill: (pid, sig) => {
        kills.push([pid, sig]);
      },
    });
    await untilSpawned(sp);
    await vi.advanceTimersByTimeAsync(54_999);
    expect(kills).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(kills).toEqual([[-5000, 'SIGTERM']]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(kills).toEqual([[-5000, 'SIGTERM'], [-5000, 'SIGKILL']]);
    const { summary } = await settle(p);
    expect(summary.outcome).toBe('incomplete');
    expect(summary.reason).toBe('deadline');
    expect(summary.ok).toBe(false);
    expect(summary.passed).toBe(1);
    expect(summary.unfinished).toEqual(['P2 slow', 'P3 never']);
    expect(lastJson().unfinished).toEqual(['P2 slow', 'P3 never']);
  });

  it('the hook output says incomplete: deadline reached and exits non-zero', async () => {
    vi.useFakeTimers(FAKE);
    const sp = makeSpawn((c) => c.emitLine(line({ e: 'collected', file: '/w/a.test.ts', names: ['P9 slow'] })));
    const p = hookRun(event('core/src/a.ts'), { ...base(), spawn: sp.spawn, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), kill: () => undefined });
    await untilSpawned(sp);
    const out = await settle(p);
    expect(out.exit).toBe(1);
    expect(out.stdout).toContain('incomplete: deadline reached');
    expect(out.stdout).toContain('not finished: P9 slow');
    expect(out.stdout).not.toContain('contract-pbt: passed');
  });
});

describe('lock', () => {
  it('a second save stops the older child (same user, vitest command) and holds one PID', async () => {
    mkdirSync(join(store.storeDir, 'locks'), { recursive: true });
    writeFileSync(lockFile(store.dir), '4321\n');
    /** @type {any[]} */
    const kills = [];
    let alive = true;
    let during = '';
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'test', name: 'P1 ok', file: '/w/a.test.ts', state: 'passed' }));
      setTimeout(() => {
        during = readFileSync(lockFile(store.dir), 'utf8');
        c.close(0);
      }, 50);
    });
    const { superseded } = await runSuites({ kind: 'core' }, {
      ...base(),
      spawn: sp.spawn,
      sleep: async () => undefined,
      inspect: async (pid) => (pid === 4321 && alive ? { uid: UID, command: 'node /x/vitest.mjs run' } : null),
      kill: (pid, sig) => {
        kills.push([pid, sig]);
        if (sig === 'SIGTERM') alive = false;
      },
    });
    expect(superseded).toBe(false);
    expect(during).toBe('5000\n');
    expect(kills).toEqual([[-4321, 'SIGTERM']]);
  });

  it('does not kill a process of another user or one whose command is not vitest', async () => {
    mkdirSync(join(store.storeDir, 'locks'), { recursive: true });
    for (const info of [{ uid: UID + 1, command: 'node vitest.mjs' }, { uid: UID, command: 'sleep 1000' }]) {
      writeFileSync(lockFile(store.dir), '4321\n');
      /** @type {any[]} */
    const kills = [];
      const sp = makeSpawn((c) => c.close(0));
      await runSuites({ kind: 'core' }, { ...base(), spawn: sp.spawn, sleep: async () => undefined, inspect: async () => info, kill: (p, s) => void kills.push([p, s]) });
      expect(kills).toEqual([]);
    }
  });

  it('an older run that lost the lock does not write last.json', async () => {
    /** @type {any} */
    let first;
    const sp = makeSpawn((c, i) => {
      if (i === 0) first = c;
    });
    const p = runSuites({ kind: 'core' }, { ...base(), spawn: sp.spawn });
    await vi.waitFor(() => expect(first).toBeDefined());
    await vi.waitFor(() => expect(readFileSync(lockFile(store.dir), 'utf8')).toBe(`${first.pid}\n`));
    writeFileSync(lockFile(store.dir), '9999\n'); // a newer save took the lock
    first.emitLine(line({ e: 'test', name: 'P1 ok', file: '/w/a.test.ts', state: 'passed' }));
    first.close(0);
    const { superseded } = await p;
    expect(superseded).toBe(true);
    expect(existsSync(join(store.storeDir, 'pbt', 'last.json'))).toBe(false);
    expect(readFileSync(lockFile(store.dir), 'utf8')).toBe('9999\n');
  });

  it('releases its lock after a finished run', async () => {
    const sp = makeSpawn((c) => {
      c.emitLine(line({ e: 'test', name: 'P1 ok', file: '/w/a.test.ts', state: 'passed' }));
      c.close(0);
    });
    await runSuites({ kind: 'core' }, { ...base(), spawn: sp.spawn });
    expect(existsSync(lockFile(store.dir))).toBe(false);
  });
});

describe('.kiro/hooks/contract-pbt.json (task 11.4)', () => {
  const file = new URL('../../../.kiro/hooks/contract-pbt.json', import.meta.url);
  const doc = JSON.parse(readFileSync(file, 'utf8'));

  it('has one PostFileSave entry with the prefilter matcher, entry-level timeout 60, and enabled false until task 19.1', () => {
    expect(doc.version).toBe('v1');
    expect(doc.hooks).toHaveLength(1);
    const h = doc.hooks[0];
    expect(h.trigger).toBe('PostFileSave');
    expect(h.matcher).toBe('(^|/)(core|worlds)/');
    expect(h.action).toEqual({ type: 'command', command: 'node integrations/kiro-hook/contract-pbt.mjs' });
    expect(h.timeout).toBe(60);
    expect(h.enabled).toBe(false);
  });

  it('the matcher is a prefilter: it accepts the paths that the script selects', () => {
    const re = new RegExp(doc.hooks[0].matcher);
    expect(re.test('core/src/a.ts')).toBe(true);
    expect(re.test('worlds/drawer-arm/src/world.ts')).toBe(true);
    expect(re.test('README.md')).toBe(false);
  });
});

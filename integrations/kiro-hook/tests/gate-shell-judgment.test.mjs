import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveRunnerOptions, runPlan as realRunPlan } from '@ghost-run/ghost-runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUSY_LINE } from '../lib/gate/semaphore.mjs';
import {
  buildToolCallPlan,
  COMMAND_BOUNDS_LINE,
  CommandBoundsError,
  CWD_OUTSIDE_NOTICE,
  judgeShell,
  RUNNER_FAILED_LINE,
  SELF_PROTECT_NOTICE,
} from '../lib/gate/shell-judgment.mjs';

/** @type {string} */
let base;
/** @type {string} */
let root;
/** @type {string} */
let semDir;
beforeEach(async () => {
  base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'gate-shell-')));
  root = path.join(base, 'ws');
  semDir = path.join(base, 'locks');
  await fsp.mkdir(path.join(root, 'sub'), { recursive: true });
});
afterEach(async () => {
  await fsp.rm(base, { recursive: true, force: true });
});

/** @param {Partial<any>} [over] */
function fakeResult(over = {}) {
  return {
    schemaVersion: 1,
    runId: 'r',
    status: 'ok',
    rehearsed: true,
    verdict: 'pass',
    report: { snapshots: [], changes: [[]], effectsOutside: [[]], observedEvents: [], variantResults: [] },
    notices: [],
    ...over,
  };
}

/** @param {any} result @param {Map<string, Uint8Array>} [payloads] */
function fakeRunPlan(result, payloads = new Map()) {
  return /** @type {import('vitest').Mock<(plan: any, opts: any) => Promise<any>>} */ (
    vi.fn(async (/** @type {any} */ _plan, /** @type {any} */ _opts) => ({ result, payloads }))
  );
}

/** @param {unknown} command @param {unknown} [cwd] @param {any} [more] */
function ctxOf(command, cwd, more = {}) {
  return {
    root,
    toolInput: { command, ...(cwd === undefined ? {} : { cwd }) },
    wardSet: { wards: [] },
    elapsedSec: 0,
    semaphore: { dir: semDir },
    ...more,
  };
}

describe('buildToolCallPlan', () => {
  it('returns one action; cwd only when given', () => {
    expect(buildToolCallPlan('ls', 'sub')).toEqual([{ command: 'ls', cwd: 'sub' }]);
    expect(buildToolCallPlan('ls')).toEqual([{ command: 'ls' }]);
  });

  it('accepts 4096 and rejects 4097 code points, counted by code point', () => {
    expect(buildToolCallPlan('a'.repeat(4096))).toHaveLength(1);
    expect(() => buildToolCallPlan('a'.repeat(4097))).toThrow(CommandBoundsError);
    // 4096 astral characters are 8192 UTF-16 units but 4096 code points
    expect(buildToolCallPlan('\u{1F47B}'.repeat(4096))).toHaveLength(1);
    expect(() => buildToolCallPlan('\u{1F47B}'.repeat(4097))).toThrow(CommandBoundsError);
    expect(() => buildToolCallPlan('')).toThrow(CommandBoundsError);
    expect(() => buildToolCallPlan(undefined)).toThrow(CommandBoundsError);
  });

  it('keeps shell metacharacters as a plain value', () => {
    const cmd = 'echo $(id) `x`; rm -rf "$HOME" | cat';
    expect(buildToolCallPlan(cmd)[0].command).toBe(cmd);
  });
});

describe('judgeShell', () => {
  it('denies an empty command and an over-long command without starting a ghost', async () => {
    const runPlan = fakeRunPlan(fakeResult());
    for (const c of ['', 'a'.repeat(4097)]) {
      const j = await judgeShell(ctxOf(c), { runPlan });
      expect(j).toMatchObject({ decision: 'deny', reason: 'command-bounds', message: COMMAND_BOUNDS_LINE });
    }
    expect(COMMAND_BOUNDS_LINE).toContain('4096');
    expect(runPlan).not.toHaveBeenCalled();
  });

  it('passes the plan, wards, run id, and budget to the runner and takes its verdict as is', async () => {
    const runPlan = fakeRunPlan(fakeResult({ verdict: 'block', notices: ['n1'] }));
    const wardSet = { wards: [] };
    const j = await judgeShell(ctxOf('echo hi', undefined, { wardSet, elapsedSec: 10.5 }), {
      runPlan,
      uuid: () => 'run-fixed_1',
    });
    expect(runPlan).toHaveBeenCalledTimes(1);
    const [plan, opts] = runPlan.mock.calls[0];
    expect(plan).toEqual([{ command: 'echo hi' }]);
    expect(opts).toEqual({ original: root, wardSet, pipelineDeadlineSec: 37, runId: 'run-fixed_1' });
    expect(j).toMatchObject({ decision: 'judged', verdict: 'block', rehearsed: true, runId: 'run-fixed_1', notices: ['n1'], floors: [] });
  });

  it('reads the elapsed time after the slot is held and prefers a caller run id', async () => {
    const runPlan = fakeRunPlan(fakeResult());
    const elapsed = vi.fn(() => 47);
    const j = await judgeShell(ctxOf('ls', undefined, { elapsedSec: elapsed, runId: 'mine-1' }), { runPlan });
    expect(runPlan.mock.calls[0][1]).toMatchObject({ pipelineDeadlineSec: 5, runId: 'mine-1' });
    expect(j).toMatchObject({ runId: 'mine-1' });
  });

  it('ignores an invalid injected run id and generates a valid one', async () => {
    const runPlan = fakeRunPlan(fakeResult());
    const j = /** @type {any} */ (await judgeShell(ctxOf('ls'), { runPlan, uuid: () => 'bad id/..' }));
    expect(j.runId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('turns a cwd inside the workspace into a Copy-relative path with "/" separators', async () => {
    const runPlan = fakeRunPlan(fakeResult());
    await judgeShell(ctxOf('ls', path.join(root, 'sub')), { runPlan });
    expect(runPlan.mock.calls[0][0]).toEqual([{ command: 'ls', cwd: 'sub' }]);
    await judgeShell(ctxOf('ls', 'sub/deeper/missing'), { runPlan });
    expect(runPlan.mock.calls[1][0]).toEqual([{ command: 'ls', cwd: 'sub/deeper/missing' }]);
    await judgeShell(ctxOf('ls', root), { runPlan });
    expect(runPlan.mock.calls[2][0]).toEqual([{ command: 'ls' }]);
  });

  it('floors a cwd outside the workspace at warn and starts no ghost', async () => {
    const runPlan = fakeRunPlan(fakeResult());
    for (const cwd of [base, '..', path.join(root, '..', 'elsewhere', 'x')]) {
      const j = await judgeShell(ctxOf('ls', cwd), { runPlan });
      expect(j).toMatchObject({ decision: 'judged', verdict: 'warn', rehearsed: false, notices: [CWD_OUTSIDE_NOTICE] });
    }
    expect(CWD_OUTSIDE_NOTICE).toBe('step 0: cwd outside the workspace, not rehearsed.');
    expect(runPlan).not.toHaveBeenCalled();
  });

  it('treats a symbolic link that leaves the workspace as outside', async () => {
    await fsp.symlink(base, path.join(root, 'escape'));
    const runPlan = fakeRunPlan(fakeResult());
    const j = await judgeShell(ctxOf('ls', 'escape/new'), { runPlan });
    expect(j).toMatchObject({ verdict: 'warn', rehearsed: false });
    expect(runPlan).not.toHaveBeenCalled();
  });

  it('denies with the fixed line when the runner rejects, and does not retry', async () => {
    const runPlan = vi.fn(async () => {
      throw new Error('boom');
    });
    const j = await judgeShell(ctxOf('ls'), { runPlan, uuid: () => 'rid-9' });
    expect(j).toEqual({ decision: 'deny', reason: 'runner-failed', message: RUNNER_FAILED_LINE, runId: 'rid-9' });
    expect(RUNNER_FAILED_LINE).toBe('GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.');
    expect(runPlan).toHaveBeenCalledTimes(1);
  });

  it('clears the payload map and does not return it', async () => {
    const payloads = new Map([['e1', new Uint8Array([1, 2, 3])]]);
    const runPlan = fakeRunPlan(fakeResult(), payloads);
    const j = await judgeShell(ctxOf('ls'), { runPlan });
    expect(payloads.size).toBe(0);
    expect(JSON.stringify(j)).not.toContain('payloads');
    expect(Object.keys(j)).not.toContain('payloads');
  });

  it('clears the payload map even when reading the result fails afterwards', async () => {
    const payloads = new Map([['e1', new Uint8Array([1])]]);
    const runPlan = fakeRunPlan(fakeResult({ verdict: 'pass' }), payloads);
    await judgeShell(ctxOf('ls'), { runPlan });
    expect(payloads.size).toBe(0);
  });

  it('raises a pass to warn for a change under a Self_Protected_Path and adds the notice', async () => {
    const changes = [[{ kind: 'file-overwritten', path: '.kiro/hooks/x.json' }]];
    const runPlan = fakeRunPlan(fakeResult({ report: { ...fakeResult().report, changes } }));
    const j = /** @type {any} */ (await judgeShell(ctxOf('ls'), { runPlan }));
    expect(j).toMatchObject({ verdict: 'warn', floors: ['self-protected'] });
    expect(j.notices).toContain(SELF_PROTECT_NOTICE);
    expect(SELF_PROTECT_NOTICE).toBe('step 0: change to a gate-protected path needs human approval.');
  });

  it('keeps block when the floor applies, and honors the Wards_File path', async () => {
    const changes = [[{ kind: 'file-deleted', path: 'cfg/wards.yaml' }]];
    const report = { ...fakeResult().report, changes };
    const blocked = /** @type {any} */ (
      await judgeShell(ctxOf('ls', undefined, { wardsFileRelative: 'cfg/wards.yaml' }), {
        runPlan: fakeRunPlan(fakeResult({ verdict: 'block', report })),
      })
    );
    expect(blocked.verdict).toBe('block');
    const notProtected = await judgeShell(ctxOf('ls'), { runPlan: fakeRunPlan(fakeResult({ report })) });
    expect(notProtected).toMatchObject({ verdict: 'pass', floors: [] });
  });

  it('answers busy when no slot is free', async () => {
    await fsp.mkdir(semDir, { recursive: true });
    for (const i of [0, 1]) await fsp.writeFile(path.join(semDir, `slot-${i}.lock`), JSON.stringify({ pid: process.pid }));
    const runPlan = fakeRunPlan(fakeResult());
    const j = await judgeShell(ctxOf('ls', undefined, { semaphore: { dir: semDir, waitMs: 50, pollMs: 10 } }), { runPlan });
    expect(j).toEqual({ decision: 'busy', line: BUSY_LINE });
    expect(runPlan).not.toHaveBeenCalled();
  });

  it('releases the slot after a run and after a rejected run', async () => {
    await judgeShell(ctxOf('ls'), { runPlan: fakeRunPlan(fakeResult()) });
    await judgeShell(ctxOf('ls'), {
      runPlan: vi.fn(async () => {
        throw new Error('x');
      }),
    });
    const left = (await fsp.readdir(semDir)).filter((n) => n.endsWith('.lock'));
    expect(left).toEqual([]);
  });
});

describe('O8: the real runPlan configuration accepts pipelineDeadlineSec 44 (no Docker)', () => {
  const dockerless = {
    run: async () => ({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, spawnError: 'no docker' }),
  };

  it('does not reject the options; runPlan returns a Plan B result without a box', async () => {
    const opts = /** @type {any} */ ({ original: root, pipelineDeadlineSec: 44, runId: 'o8-check_1' });
    expect(() => resolveRunnerOptions(opts)).not.toThrow();
    const out = await realRunPlan([{ command: 'echo hi' }], { ...opts, client: dockerless });
    expect(out.result.runId).toBe('o8-check_1');
    expect(out.result.isolation.mode).toBe('static-analysis');
    /** @type {Map<string, Uint8Array>} */ (out.payloads).clear();
  });

  it('the runner honors the 44 s deadline', () => {
    expect(resolveRunnerOptions(/** @type {any} */ ({ original: root, pipelineDeadlineSec: 44 })).pipelineDeadlineSec).toBe(44);
  });
});

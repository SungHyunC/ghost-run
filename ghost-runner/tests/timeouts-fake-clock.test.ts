// [no-docker] Timeout behaviour of runPlan with a fake clock and the fake Docker client.
// Validates: Requirements 3.1, 4.8, 7.3, 7.4, 7.5, 7.6, 7.7
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockerCallOptions, DockerClient, DockerResult } from '../src/docker/cli.js';
import { runPlan } from '../src/pipeline.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker, type FakeDockerOptions } from './fixtures/fake-docker.js';

type CopyStrategyFn = (ctx: { dest: string; signal: AbortSignal }) => Promise<void>;

// The pipeline calls `copyOriginal` without a strategy hook. The mock injects a scripted one
// (no production change); when none is armed the real copier runs.
const hoisted = vi.hoisted(() => ({ strategy: undefined as undefined | ((ctx: { dest: string; signal: AbortSignal }) => Promise<void>) }));
vi.mock('../src/copy/copier.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/copy/copier.js')>();
  return {
    ...actual,
    copyOriginal: (opts: Parameters<typeof actual.copyOriginal>[0]) =>
      actual.copyOriginal(hoisted.strategy !== undefined ? { ...opts, copyStrategy: hoisted.strategy } : opts),
  };
});

const dirs: string[] = [];

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-timeout-'));
  dirs.push(root);
  writeFileSync(join(root, 'a.txt'), 'a\n');
  return root;
}

function fake(over: FakeDockerOptions = {}): FakeDocker {
  return createFakeDocker({ recorder: { files: cleanRecorderFiles(1) }, ...over });
}

/** Forwards to the fake and records the options of every call. */
function recording(f: FakeDocker): DockerClient & { readonly seen: { args: readonly string[]; opts: DockerCallOptions }[] } {
  const seen: { args: readonly string[]; opts: DockerCallOptions }[] = [];
  return {
    seen,
    run: (args, opts = {}) => {
      seen.push({ args: [...args], opts });
      return f.run(args, opts);
    },
  };
}

beforeEach(() => {
  hoisted.strategy = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  hoisted.strategy = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('Docker check limit (Req 3.1)', () => {
  it('passes a 2.0 s limit to the availability check and falls back to Plan B when it times out', async () => {
    const f = fake();
    const seen: { args: readonly string[]; opts: DockerCallOptions }[] = [];
    const client: DockerClient = {
      run: async (args, opts = {}): Promise<DockerResult> => {
        seen.push({ args: [...args], opts });
        if (args[0] === 'image') {
          f.clock.advance(opts.timeoutMs ?? 0);
          return { code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true };
        }
        return f.run(args, opts);
      },
    };
    const t0 = f.clock.now();
    const { result } = await runPlan([{ command: 'rm -rf a.txt' }], { original: repo(), client, clock: f.clock });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.args.slice(0, 2)).toEqual(['image', 'inspect']);
    expect(seen[0]?.opts.timeoutMs).toBe(2_000);
    expect(seen[0]?.opts.deadlineAt).toBe(t0 + 2_000);
    expect(f.clock.now() - t0).toBe(2_000);
    expect(result.isolation).toMatchObject({ mode: 'static-analysis', reason: 'docker-unavailable', p1Claimed: false });
    expect(result.rehearsed).toBe(false);
    expect(result.verdict).not.toBe('pass');
    expect(f.calls.filter((c) => c.phase === 'create' || c.phase === 'exec')).toEqual([]);
  });
});

describe('Copy limit (Req 4.8)', () => {
  it('aborts at 20 s, removes the partial Copy and the box, executes nothing, and reports warn', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const f = fake();
    const client = recording(f);
    let partial = '';
    let entered: () => void = () => undefined;
    const started = new Promise<void>((r) => (entered = r));
    let aborted = false;
    const strategy: CopyStrategyFn = async ({ dest, signal }) => {
      partial = dest;
      writeFileSync(join(dest, 'half-copied.txt'), 'x');
      entered();
      await new Promise<void>((_res, rej) =>
        signal.addEventListener('abort', () => {
          aborted = true;
          rej(new Error('aborted'));
        }),
      );
    };
    hoisted.strategy = strategy;

    const pending = runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock });
    await started;
    expect(existsSync(join(partial, 'half-copied.txt'))).toBe(true);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const { result } = await pending;

    expect(aborted).toBe(true);
    expect(result.status).toBe('copy-timeout');
    expect(result.verdict).toBe('warn');
    expect(result.rehearsed).toBe(false);
    expect(result.exitCodes).toEqual([]);
    expect(f.callsFor('exec')).toEqual([]);
    expect(f.callsFor('create')).toHaveLength(1); // box was created in parallel with the copy
    expect(f.leakedRunIds()).toEqual([]); // box and volume removed
    expect(existsSync(partial)).toBe(false); // partial Copy removed
    expect(existsSync(join(partial, 'half-copied.txt'))).toBe(false);
  });
});

describe('Execution limit (Req 7.3, 7.4)', () => {
  it('runs docker exec with a 30 s limit, kills the container, and returns the partial diff', async () => {
    const f = fake({
      exec: [{ code: 0 }, { timeout: true }, { code: 0 }],
      onStep: ({ stepIndex, copyDir }) => {
        if (stepIndex === 1) writeFileSync(join(copyDir, 'partial.txt'), 'half');
      },
    });
    const client = recording(f);
    const plan = [{ command: 'true' }, { command: 'echo half > partial.txt; sleep 999' }, { command: 'true' }];
    const t0 = f.clock.now();
    const { result } = await runPlan(plan, { original: repo(), client, clock: f.clock, execLimitSec: 30 });

    const stepCalls = client.seen.filter((c) => c.args.includes('ghost-step'));
    expect(stepCalls).toHaveLength(2); // third action never ran
    expect(stepCalls[1]?.opts.timeoutMs).toBe(30_000);
    expect(client.seen.filter((c) => c.args[0] === 'kill')).toHaveLength(1);
    expect(f.clock.now() - t0).toBeGreaterThanOrEqual(30_000);

    expect(result.status).toBe('timeout');
    expect(result.verdict).not.toBe('pass');
    expect(result.exitCodes).toEqual([0, -1]);
    expect(result.report.snapshots[2]?.result).toEqual({ success: false, error: 'timeout after 30 s' });
    expect(result.report.changes).toHaveLength(2);
    expect(result.report.changes[1]).toContainEqual({ kind: 'file-created', path: 'partial.txt', entryType: 'file' });
    expect(f.leakedRunIds()).toEqual([]);
  });

  it('rejects an execution limit outside 1..30 s (Req 7.3)', async () => {
    const f = fake();
    await expect(runPlan([{ command: 'true' }], { original: repo(), execLimitSec: 31, client: f })).rejects.toThrow();
    await expect(runPlan([{ command: 'true' }], { original: repo(), execLimitSec: 0, client: f })).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
});

describe('Pipeline deadline (Req 7.5, 7.6)', () => {
  it('stops at 55 s mid-action, kills and removes the box, and returns within 60 s', async () => {
    const f = fake({ exec: [{ timeout: true }] });
    const client = recording(f);
    // A copy that takes 40 s of fake time leaves 15 s of pipeline budget, below the 30 s action limit.
    hoisted.strategy = async () => {
      f.clock.advance(40_000);
    };
    const t0 = f.clock.now();
    const { result } = await runPlan([{ command: 'sleep 999' }, { command: 'true' }], {
      original: repo(),
      client,
      clock: f.clock,
      execLimitSec: 30,
    });
    const elapsed = f.clock.now() - t0;

    expect(result.status).toBe('pipeline-deadline');
    expect(result.verdict).not.toBe('pass');
    expect(client.seen.filter((c) => c.args.includes('ghost-step'))).toHaveLength(1);
    expect(client.seen.filter((c) => c.args[0] === 'kill')).toHaveLength(1);
    expect(result.exitCodes).toEqual([-1]);
    expect(elapsed).toBeGreaterThanOrEqual(55_000);
    expect(elapsed).toBeLessThan(60_000);
    expect(f.leakedRunIds()).toEqual([]);
  });

  it('skips the remaining phases when the deadline passes during the copy, and cleans up', async () => {
    const f = fake();
    const client = recording(f);
    hoisted.strategy = async () => {
      f.clock.advance(56_000);
    };
    const t0 = f.clock.now();
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock });

    expect(result.status).toBe('pipeline-deadline');
    expect(result.verdict).not.toBe('pass');
    expect(result.rehearsed).toBe(false);
    expect(f.callsFor('exec')).toEqual([]);
    expect(f.clock.now() - t0).toBeLessThan(60_000);
    expect(f.leakedRunIds()).toEqual([]);
  });
});

// [no-docker] runPlan with the fake Docker client: docker-box path, Plan B, deadlines, cleanup.
// Validates: Requirements 3.1-3.5, 7.1-7.8, 13.1-13.7, 14.1-14.4, 15.1, 15.3, 15.4, 16.1-16.4
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WardSet } from '@ghost-run/core';
import type { DockerClient } from '../src/docker/cli.js';
import { ConfigError, PlanBoundsError } from '../src/errors.js';
import { BOX_BUILD_HINT, PLAN_B_NOTICE, runPlan } from '../src/pipeline.js';
import { parseRunResult, serializeRunResult } from '../src/result.js';
import { CANARY } from './fixtures/repo.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker, type FakeDockerOptions } from './fixtures/fake-docker.js';

const dirs: string[] = [];
const SQLITE_HEADER = 'SQLite format 3\0';

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-pipe-'));
  dirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'seed.txt'), 'seed\n');
  writeFileSync(join(root, '.env'), `API_KEY=${CANARY}\n`);
  writeFileSync(join(root, 'app.db'), SQLITE_HEADER + 'x'.repeat(64));
  return root;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fake(over: FakeDockerOptions = {}): FakeDocker {
  return createFakeDocker({ recorder: { files: cleanRecorderFiles(1) }, ...over });
}

describe('runPlan input validation', () => {
  it('rejects plans outside 1..50 and bad options before any docker call', async () => {
    const f = fake();
    const root = repo();
    await expect(runPlan([], { original: root, client: f })).rejects.toBeInstanceOf(PlanBoundsError);
    const big = Array.from({ length: 51 }, () => ({ command: 'true' }));
    await expect(runPlan(big, { original: root, client: f })).rejects.toBeInstanceOf(PlanBoundsError);
    await expect(runPlan([{ command: 'true' }], { original: root, execLimitSec: 31, client: f })).rejects.toBeInstanceOf(ConfigError);
    await expect(runPlan([{ command: 'true' }], { original: join(root, 'missing'), client: f })).rejects.toBeInstanceOf(ConfigError);
    await expect(runPlan([{ command: 7 } as never], { original: root, client: f })).rejects.toBeInstanceOf(TypeError);
    expect(f.calls).toEqual([]);
  });
});

describe('runPlan in the docker box (fake client)', () => {
  it('assembles the report, claims P1, and cleans up', async () => {
    const root = repo();
    let copyDir = '';
    const f = fake({
      onStep: ({ copyDir: dir }) => {
        copyDir = dir;
        rmSync(join(dir, 'data'), { recursive: true, force: true });
      },
    });
    const { result, payloads } = await runPlan([{ command: 'rm -rf data' }], { original: root, client: f, clock: f.clock });

    expect(result.status).toBe('ok');
    expect(result.rehearsed).toBe(true);
    expect(result.verdict).toBe('pass');
    expect(result.exitCodes).toEqual([0]);
    expect(result.report.snapshots).toHaveLength(2);
    expect(result.report.snapshots[0]?.result).toEqual({ success: true });
    expect(result.report.changes).toEqual([
      [
        { kind: 'file-deleted', path: 'data', entryType: 'dir' },
        { kind: 'file-deleted', path: 'data/seed.txt', entryType: 'file' },
      ],
    ]);
    expect(result.report.effectsOutside).toEqual([[]]);
    expect(result.report.observedEvents).toEqual([]);
    expect(result.report.variantResults).toEqual([]);
    expect(result.isolation).toMatchObject({
      mode: 'docker-box',
      p1Claimed: true,
      p5Claimed: true,
      p6Claimed: true,
      originalUnchanged: true,
      mountAuditPassed: true,
    });
    expect(result.box).toMatchObject({ source: 'fresh' });
    expect(result.copiedAt).toMatch(/^[0-9]+$/);
    expect(result.recorder).toEqual({ location: 'in-box', tamperResistant: false });
    expect(Object.keys(result.phases).sort()).toEqual(
      ['baselineMs', 'boxOverheadMs', 'cleanupMs', 'copyMs', 'diffMs', 'dockerCheckMs', 'execMs', 'fingerprintAfterMs', 'fingerprintBeforeMs', 'sqliteMs'],
    );
    expect(payloads.size).toBe(0);

    // Original untouched, nothing left behind (Req 16.4).
    expect(existsSync(join(root, 'data', 'seed.txt'))).toBe(true);
    expect(f.leakedRunIds()).toEqual([]);
    expect(existsSync(copyDir)).toBe(false);
    expect(existsSync(`${copyDir}.sentinel`)).toBe(false);

    // Serializable, and no secret in the serialized form.
    const json = serializeRunResult(result);
    expect(parseRunResult(json).runId).toBe(result.runId);
    expect(json).not.toContain(CANARY);
  });

  it('judges the report with the wardSet option (path ward blocks)', async () => {
    const wardSet: WardSet = { wards: [{ id: 'keep-data', kind: 'path', deny: ['delete'], paths: ['data/'] }] };
    const f = fake({ onStep: ({ copyDir }) => rmSync(join(copyDir, 'data'), { recursive: true, force: true }) });
    const { result } = await runPlan([{ command: 'rm -rf data' }], { original: repo(), client: f, wardSet });
    expect(result.verdict).toBe('block');
    expect(result.wardVerdict?.violations.map((v) => v.wardId)).toContain('keep-data');
  });

  it('counts SQLite rows in the box and reports row-count changes', async () => {
    const wardSet: WardSet = { wards: [{ id: 'users', kind: 'sql', tables: ['users'], max_rows_lost: 10 }] };
    const f = fake({
      onStep: ({ copyDir }) => writeFileSync(join(copyDir, 'app.db'), SQLITE_HEADER + 'y'.repeat(80)),
      count: (_p, call) => (call === 0 ? { users: 1206 } : { users: 0 }),
    });
    const { result } = await runPlan([{ command: 'sqlite3 app.db "delete from users"' }], { original: repo(), client: f, wardSet });
    expect(result.report.changes[0]).toContainEqual({ kind: 'sql-row-count', path: 'app.db', table: 'users', rowsBefore: 1206, rowsAfter: 0 });
    expect(result.verdict).toBe('block');
  });

  it('keeps observed events and static Effects side by side (no deduplication)', async () => {
    const files = cleanRecorderFiles(1, { 'dns.jsonl': `${JSON.stringify({ host: 'setup-check.example', ip: '127.1.2.3', step: 0 })}\n` });
    const f = fake({ recorder: { files } });
    const { result } = await runPlan([{ command: 'curl https://setup-check.example/x' }], { original: repo(), client: f });
    expect(result.report.effectsOutside[0]).toEqual([{ kind: 'url', destination: 'https://setup-check.example/x' }]);
    expect(result.report.observedEvents).toEqual([{ kind: 'network-attempt', destination: 'setup-check.example', stepIndex: 0 }]);
    expect(result.verdict).toBe('warn');
  });

  it('cuts the report at the timed-out step, skips the rest, and kills the box', async () => {
    const f = fake({ exec: [{ code: 0 }, { timeout: true }, { code: 0 }] });
    const plan = [{ command: 'true' }, { command: 'sleep 99' }, { command: 'true' }];
    const { result } = await runPlan(plan, { original: repo(), client: f, clock: f.clock, execLimitSec: 10 });
    expect(result.status).toBe('timeout');
    expect(result.exitCodes).toEqual([0, -1]);
    expect(result.report.snapshots).toHaveLength(3);
    expect(result.report.changes).toHaveLength(2);
    expect(result.report.effectsOutside).toHaveLength(2);
    expect(result.report.snapshots[2]?.result).toEqual({ success: false, error: 'timeout after 10 s' });
    expect(result.verdict).not.toBe('pass');
    expect(f.calls.some((c) => c.args[0] === 'kill')).toBe(true);
    expect(f.leakedRunIds()).toEqual([]);
  });

  it('returns status pipeline-deadline when the 55 s deadline passes between steps', async () => {
    let jump = 0;
    const f = fake({
      onStep: ({ copyDir }) => writeFileSync(join(copyDir, 'app.db'), SQLITE_HEADER + 'z'.repeat(90)),
      count: (_p, call) => {
        if (call > 0) jump = 56_000; // time passes outside the execution budget
        return { users: 1 };
      },
    });
    const clock = { now: () => f.clock.now() + jump };
    const { result } = await runPlan([{ command: 'a' }, { command: 'b' }], { original: repo(), client: f, clock });
    expect(result.status).toBe('pipeline-deadline');
    expect(result.exitCodes).toEqual([0]);
    expect(result.isolation.p1Claimed).toBe(false);
    expect(result.verdict).not.toBe('pass');
    expect(f.leakedRunIds()).toEqual([]);
  });

  it('removes container, volume, and Copy when a phase throws, and rethrows the original error', async () => {
    let copyDir = '';
    const f = fake({
      onStep: ({ copyDir: dir }) => {
        copyDir = dir;
        throw new Error('boom');
      },
    });
    await expect(runPlan([{ command: 'true' }], { original: repo(), client: f })).rejects.toThrow('boom');
    expect(f.leakedRunIds()).toEqual([]);
    expect(copyDir).not.toBe('');
    expect(existsSync(copyDir)).toBe(false);
  });

  it('reports a failed isolation audit as isolation-violation and block, with no action run', async () => {
    const f = fake({
      mutateInspect: (i) => {
        (i['HostConfig'] as Record<string, unknown>)['Privileged'] = true;
      },
    });
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: f });
    expect(result.status).toBe('isolation-violation');
    expect(result.verdict).toBe('block');
    expect(result.isolation.mountAuditPassed).toBe(false);
    expect(result.isolation.p1Claimed).toBe(false);
    expect(f.callsFor('exec')).toEqual([]);
    expect(f.leakedRunIds()).toEqual([]);
  });

  it('flags a protected path inside an excluded directory', async () => {
    const wardSet: WardSet = { wards: [{ id: 'bin', kind: 'path', deny: ['delete'], paths: ['node_modules/.bin/tool'] }] };
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: fake(), wardSet });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ name: 'protected-path-excluded', path: 'node_modules/.bin/tool' }));
    expect(result.isolation.p5Claimed).toBe(false);
    expect(result.verdict).toBe('warn');
  });

  it('reports a recorder failure as diagnostic, no P6 claim, and at least warn', async () => {
    const f = fake({ fault: { phase: 'collect', mode: 'corrupt' } });
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: f });
    expect(result.diagnostics.some((d) => d.name === 'recorder-failure')).toBe(true);
    expect(result.isolation.p6Claimed).toBe(false);
    expect(result.verdict).toBe('warn');
  });

  it('classifies an Original change during the run as external-change', async () => {
    const root = repo();
    const f = fake({
      onStep: () => writeFileSync(join(root, 'README.md'), 'edited by someone else\n'),
    });
    const { result } = await runPlan([{ command: 'true' }], { original: root, client: f });
    expect(result.originalChange).toEqual({ classification: 'external-change', changedPaths: ['README.md'] });
    expect(result.isolation.p1Claimed).toBe(false);
    expect(result.verdict).toBe('warn');
  });
});

describe('runPlan Plan B', () => {
  for (const [state, reason] of [
    ['unreachable', 'docker-unavailable'],
    ['missing', 'box-image-missing'],
  ] as const) {
    it(`executes nothing and discloses what it does not claim (${reason})`, async () => {
      const root = repo();
      symlinkSync('/tmp/outside.example', join(root, 'escape'));
      const f = fake({ image: state });
      const seen: string[] = [];
      const { result, payloads } = await runPlan(
        [{ command: 'curl https://setup-check.example/x' }, { command: 'rm -rf data' }],
        { original: root, client: f, onNotice: (n) => seen.push(n) },
      );
      expect(f.calls.every((c) => c.args[0] === 'image')).toBe(true);
      expect(result.isolation).toMatchObject({ mode: 'static-analysis', reason, p1Claimed: false, p5Claimed: false, p6Claimed: false });
      expect(result.rehearsed).toBe(false);
      expect(result.report.changes).toEqual([[], []]);
      expect(result.report.observedEvents).toEqual([]);
      expect(result.exitCodes).toEqual([]);
      expect(result.verdict).toBe('warn');
      expect(result.notices[0]).toBe(PLAN_B_NOTICE);
      expect(result.notices.includes(BOX_BUILD_HINT)).toBe(reason === 'box-image-missing');
      expect(seen).toEqual(result.notices);
      expect(result.staticFindings).toContainEqual({ kind: 'url', destination: 'https://setup-check.example/x' });
      expect(result.staticFindings).toContainEqual({ kind: 'symlink-outside-original', destination: '/tmp/outside.example', path: 'escape' });
      expect(payloads.size).toBe(0);
    });
  }

  it('is warn even without findings', async () => {
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: fake({ image: 'unreachable' }) });
    expect(result.staticFindings).toEqual([]);
    expect(result.verdict).toBe('warn');
  });
});

describe('runPlan wake retry (Req 3.8)', () => {
  /** The first `image inspect` times out after 2 s of fake time; later calls reach the fake. */
  function sleepingFirstCheck(f: FakeDocker, times = 1): DockerClient & { inspects: number[] } {
    const inspects: number[] = [];
    let slept = 0;
    return {
      inspects,
      async run(args, o) {
        if (args[0] === 'image' && args[1] === 'inspect') {
          inspects.push(o?.timeoutMs ?? -1);
          if (slept < times) {
            slept += 1;
            f.clock.advance(o?.timeoutMs ?? 0);
            return { code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true };
          }
        }
        return f.run(args, o);
      },
    };
  }

  it('without the option a sleeping first check is Plan B', async () => {
    const f = fake();
    const client = sleepingFirstCheck(f);
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock });
    expect(result.isolation.mode).toBe('static-analysis');
    expect(result.dockerWakeRetried).toBe(false);
  });

  it('with the option the retry answers and the run is a full docker-box run', async () => {
    const f = fake();
    const client = sleepingFirstCheck(f);
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock, dockerWakeRetryMs: 10_000 });
    expect(client.inspects).toEqual([2000, 10_000]);
    expect(result.isolation.mode).toBe('docker-box');
    expect(result.rehearsed).toBe(true);
    expect(result.dockerWakeRetried).toBe(true);
  });

  it('records no retry when the first check answers', async () => {
    const f = fake();
    const client = sleepingFirstCheck(f, 0);
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock, dockerWakeRetryMs: 10_000 });
    expect(client.inspects).toEqual([2000]);
    expect(result.dockerWakeRetried).toBe(false);
  });

  it('falls back to Plan B when both deadlines pass, and records the retry', async () => {
    const f = fake();
    const client = sleepingFirstCheck(f, 2);
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: f.clock, dockerWakeRetryMs: 10_000 });
    expect(result.isolation).toMatchObject({ mode: 'static-analysis', reason: 'docker-unavailable' });
    expect(result.dockerWakeRetried).toBe(true);
  });

  it('survives a serialize and parse round trip', async () => {
    const f = fake();
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: sleepingFirstCheck(f), clock: f.clock, dockerWakeRetryMs: 10_000 });
    expect(parseRunResult(serializeRunResult(result)).dockerWakeRetried).toBe(true);
  });

  it('rejects an out-of-range dockerWakeRetryMs', async () => {
    for (const v of [0, -1, 1.5, 30_001]) {
      await expect(runPlan([{ command: 'true' }], { original: repo(), client: fake(), dockerWakeRetryMs: v })).rejects.toBeInstanceOf(ConfigError);
    }
  });
});

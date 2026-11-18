// [no-docker] RunnerOptions.pipelineDeadlineSec and the exported run-id label constant.
// Validates: Requirements 7.5, 7.6, 16.3
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LABEL_RUN_ID, resolveRunnerOptions, runPlan, ConfigError } from '../src/index.js';
import { buildRunArgs } from '../src/docker/hardening.js';
import { cleanRecorderFiles, createFakeDocker } from './fixtures/fake-docker.js';
import { NUM_RUNS } from './pbt-config.js';

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
  const root = mkdtempSync(join(tmpdir(), 'ghost-pdl-'));
  dirs.push(root);
  writeFileSync(join(root, 'a.txt'), 'a\n');
  return root;
}

beforeEach(() => {
  hoisted.strategy = undefined;
});
afterEach(() => {
  hoisted.strategy = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const base = { original: '/tmp/ghost-original-fixture' };

describe('pipelineDeadlineSec option', () => {
  it('defaults to 55', () => {
    expect(resolveRunnerOptions(base).pipelineDeadlineSec).toBe(55);
  });

  it('accepts integers and fractions from 1 to 55', () => {
    for (const v of [1, 1.5, 20, 54.9, 55]) {
      expect(resolveRunnerOptions({ ...base, pipelineDeadlineSec: v }).pipelineDeadlineSec).toBe(v);
    }
  });

  it.each([0, 0.5, 56, -1, Number.NaN, Number.POSITIVE_INFINITY, '30' as unknown as number])(
    'rejects %s with ConfigError and makes no Docker call',
    async (v) => {
      expect(() => resolveRunnerOptions({ ...base, pipelineDeadlineSec: v })).toThrow(ConfigError);
      const f = createFakeDocker();
      const err = await runPlan([{ command: 'true' }], { original: repo(), client: f, pipelineDeadlineSec: v }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).option).toBe('pipelineDeadlineSec');
      expect(f.calls).toEqual([]);
    },
  );

  it('property: accepted exactly when a finite number in 1..55', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: -10, max: 100, noNaN: false }), fc.integer({ min: -5, max: 70 })), (v) => {
        let ok = true;
        try {
          resolveRunnerOptions({ ...base, pipelineDeadlineSec: v });
        } catch (e) {
          expect(e).toBeInstanceOf(ConfigError);
          ok = false;
        }
        expect(ok).toBe(Number.isFinite(v) && v >= 1 && v <= 55);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  async function deadlineRun(deadlineSec: number | undefined, copyAdvanceMs: number) {
    const f = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    hoisted.strategy = async () => {
      f.clock.advance(copyAdvanceMs);
    };
    const t0 = f.clock.now();
    const out = await runPlan([{ command: 'true' }, { command: 'true' }], {
      original: repo(),
      client: f,
      clock: f.clock,
      ...(deadlineSec !== undefined ? { pipelineDeadlineSec: deadlineSec } : {}),
    });
    return { f, result: out.result, elapsed: f.clock.now() - t0 };
  }

  it('a smaller deadline gives the same pipeline-deadline result shape and cleanup', async () => {
    const small = await deadlineRun(10, 11_000);
    const dflt = await deadlineRun(undefined, 56_000);
    expect(small.result.status).toBe('pipeline-deadline');
    expect(dflt.result.status).toBe('pipeline-deadline');
    expect(small.result.verdict).not.toBe('pass');
    expect(small.result.verdict).toBe(dflt.result.verdict);
    expect(Object.keys(small.result).sort()).toEqual(Object.keys(dflt.result).sort());
    expect(small.result.exitCodes).toEqual(dflt.result.exitCodes);
    expect(small.elapsed).toBeLessThan(15_000);
    expect(small.f.leakedRunIds()).toEqual([]);
  });

  it('with a 10 s deadline a copy of 11 s is cut, but 5 s is not', async () => {
    const cut = await deadlineRun(10, 11_000);
    expect(cut.result.status).toBe('pipeline-deadline');
    const ok = await deadlineRun(10, 5_000);
    expect(ok.result.status).not.toBe('pipeline-deadline');
    expect(ok.f.leakedRunIds()).toEqual([]);
  });
});

describe('LABEL_RUN_ID', () => {
  it('is ghost-run.run-id and is the label buildRunArgs writes', () => {
    expect(LABEL_RUN_ID).toBe('ghost-run.run-id');
    const args = buildRunArgs({ image: `ghost-box@sha256:${'0'.repeat(64)}`, uid: 1000, gid: 1000 }, 'rid-1', { copyDir: '/tmp/ok' });
    const labels = args.flatMap((a, i) => (args[i - 1] === '--label' ? [a] : []));
    expect(labels).toContain(`${LABEL_RUN_ID}=rid-1`);
  });
});

// [no-docker] Property 18: Step outcome handling and cleanup under injected failure.
// Feature: ghost-runner, Property 18
// Validates: Requirements 2.4, 7.2, 7.8, 16.2, 16.4
//
// A fake Docker client with generated exit codes, timeouts and one injected failure at a
// generated phase runs through `runPlan` and `Repo_World.step`. Host phases (copy, fingerprint,
// diff) are injected by wrapping the real module functions; the wrappers only add the fault.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentinelPathFor } from '../src/copy/copier.js';
import { runPlan } from '../src/pipeline.js';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { RepoState } from '../src/world/types.js';
import {
  cleanRecorderFiles,
  createFakeDocker,
  InjectedFailure,
  type ExecScript,
  type FakeDocker,
  type FailureMode,
  type FakePhase,
} from './fixtures/fake-docker.js';
import { pbtParams, testTimeoutMs } from './pbt-config.js';

const hooks = vi.hoisted(() => ({
  current: undefined as { pendingFault?: { phase: string }; inject(f: undefined): void } | undefined,
  copyDirs: [] as string[],
}));

function consume(phase: FakePhase): void {
  const f = hooks.current;
  if (f?.pendingFault?.phase === phase) {
    f.inject(undefined);
    throw new InjectedFailure(phase);
  }
}

vi.mock('../src/copy/copier.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/copy/copier.js')>();
  return {
    ...m,
    copyOriginal: async (o: Parameters<typeof m.copyOriginal>[0]) => {
      consume('copy');
      if (o.targetDir !== undefined) hooks.copyDirs.push(o.targetDir);
      const r = await m.copyOriginal(o);
      if (r.status === 'ok') hooks.copyDirs.push(r.copyDir);
      return r;
    },
  };
});

vi.mock('../src/fs/fingerprint.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/fs/fingerprint.js')>();
  return {
    ...m,
    fingerprintOriginal: (...a: Parameters<typeof m.fingerprintOriginal>) => {
      consume('fingerprint');
      return m.fingerprintOriginal(...a);
    },
  };
});

vi.mock('../src/fs/differ.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/fs/differ.js')>();
  return {
    ...m,
    diff: (...a: Parameters<typeof m.diff>) => {
      consume('diff');
      return m.diff(...a);
    },
  };
});

const dirs: string[] = [];

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-p18-'));
  dirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'seed.txt'), 'seed\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  return root;
}

afterEach(() => {
  hooks.current = undefined;
  hooks.copyDirs.length = 0;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// -- generators ----------------------------------------------------------------

const PHASES: readonly FakePhase[] = ['copy', 'create', 'audit', 'exec', 'collect', 'fingerprint', 'diff'];
const DOCKER_MODES: readonly FailureMode[] = ['exit', 'timeout', 'spawn-error', 'corrupt'];

interface Fault {
  readonly phase: FakePhase;
  readonly mode: FailureMode;
}

const scriptArb: fc.Arbitrary<ExecScript> = fc.oneof(
  { weight: 5, arbitrary: fc.constant<ExecScript>({ code: 0 }) },
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 100 }).map((code): ExecScript => ({ code, stderr: 'boom' })) },
  { weight: 1, arbitrary: fc.constant<ExecScript>({ timeout: true }) },
);

/** `corrupt` only exists for `collect`; host phases ignore the mode. */
function faultOver(phases: readonly FakePhase[]): fc.Arbitrary<Fault> {
  return fc
    .tuple(fc.constantFrom(...phases), fc.constantFrom(...DOCKER_MODES))
    .map(([phase, mode]): Fault => ({ phase, mode: mode === 'corrupt' && phase !== 'collect' ? 'exit' : mode }));
}

const faultArb: fc.Arbitrary<Fault | undefined> = fc.option(faultOver(PHASES), { nil: undefined, freq: 3 });

const planArb = fc.array(scriptArb, { minLength: 1, maxLength: 50 });

function makeFake(scripts: readonly ExecScript[], fault: Fault | undefined): FakeDocker {
  const f = createFakeDocker({
    exec: scripts,
    recorder: { files: cleanRecorderFiles(scripts.length) },
    ...(fault !== undefined ? { fault } : {}),
  });
  hooks.current = f;
  return f;
}

function assertNoLeaks(f: FakeDocker): void {
  expect(f.allContainers()).toEqual([]);
  expect(f.leakedRunIds()).toEqual([]);
  for (const d of hooks.copyDirs) {
    expect(existsSync(d)).toBe(false);
    expect(existsSync(sentinelPathFor(d))).toBe(false);
  }
}

function execIndices(f: FakeDocker): number[] {
  return f
    .callsFor('exec')
    .filter((c) => c.args.includes('ghost-step'))
    .map((c) => Number(c.args[c.args.indexOf('ghost-step') + 1]));
}

const PINNED_FAULTS: [FakePhase, FailureMode][] = PHASES.flatMap((phase): [FakePhase, FailureMode][] =>
  phase === 'copy' || phase === 'fingerprint' || phase === 'diff'
    ? [[phase, 'exit']]
    : DOCKER_MODES.filter((m) => m !== 'corrupt' || phase === 'collect').map((m): [FakePhase, FailureMode] => [phase, m]),
);

// -- runPlan -------------------------------------------------------------------

async function checkRunPlan(scripts: readonly ExecScript[], fault: Fault | undefined): Promise<void> {
  hooks.copyDirs.length = 0;
  const f = makeFake(scripts, fault);
  const plan = scripts.map((_, i) => ({ command: `step-${String(i)}` }));
  const outcome = await runPlan(plan, { original: repo(), client: f, clock: f.clock }).then(
    (value) => ({ value, error: undefined as unknown }),
    (error: unknown) => ({ value: undefined, error }),
  );
  assertNoLeaks(f);

  const hostFault = fault !== undefined && (fault.phase === 'copy' || fault.phase === 'fingerprint' || fault.phase === 'diff');
  if (hostFault) {
    expect(outcome.error).toBeInstanceOf(InjectedFailure);
    return;
  }
  expect(outcome.error).toBeUndefined();
  const result = outcome.value?.result;
  if (result === undefined) throw new Error('unreachable');

  if (fault?.phase === 'create' || fault?.phase === 'audit') {
    expect(result.exitCodes).toEqual([]);
    expect(result.rehearsed).toBe(false);
    expect(execIndices(f)).toEqual([]);
    return;
  }

  const execFault = fault?.phase === 'exec';
  const first = execFault ? 1 : 0;
  let stopAt = plan.length - 1;
  if (execFault && fault.mode === 'timeout') stopAt = 0;
  else {
    for (let i = first; i < scripts.length; i++) {
      if (scripts[i]?.timeout === true) {
        stopAt = i;
        break;
      }
    }
  }
  const n = stopAt + 1;
  // Requirement 2.4/7.2: list order, stepIndex = position, one exit code per executed action.
  expect(execIndices(f)).toEqual(Array.from({ length: n }, (_, i) => i));
  expect(result.exitCodes).toHaveLength(n);
  expect(result.report.snapshots).toHaveLength(n + 1);
  for (let i = 0; i < n; i++) {
    const snap = result.report.snapshots[i + 1];
    expect((snap?.state as RepoState | undefined)?.lastStep?.stepIndex).toBe(i);
    const code = result.exitCodes[i] as number;
    const script = scripts[i] as ExecScript;
    if (!(execFault && i === 0)) expect(code).toBe(script.timeout === true ? -1 : (script.code as number));
    if (code === 0) {
      expect(snap?.result).toEqual({ success: true });
    } else {
      expect(snap?.result.success).toBe(false);
      const err = (snap?.result as { error?: string }).error;
      expect(typeof err === 'string' && err.length > 0).toBe(true);
    }
  }
  if (stopAt < plan.length - 1 || scripts[stopAt]?.timeout === true) {
    if (!(execFault && stopAt === 0 && fault.mode !== 'timeout')) expect(result.status).toBe('timeout');
  }
}

describe('Property 18: runPlan outcome handling and cleanup under injected failure', () => {
  it(
    'executes in order, records exit codes, never leaks containers, volumes, or Copies',
    async () => {
      await fc.assert(
        fc.asyncProperty(planArb, faultArb, async (scripts, fault) => {
          await checkRunPlan(scripts, fault);
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

  it.each(PINNED_FAULTS)(
    'pinned: single fault at %s (%s) in a 3-action plan with a failing second action',
    async (phase, mode) => {
      await checkRunPlan([{ code: 0 }, { code: 7, stderr: 'boom' }, { code: 0 }], { phase, mode });
    },
  );

  it('pinned: a timeout stops the plan and still cleans up', async () => {
    await checkRunPlan([{ code: 0 }, { timeout: true }, { code: 0 }], undefined);
  });
});

// -- Repo_World.step -----------------------------------------------------------

const STEP_PHASES: readonly FakePhase[] = ['copy', 'create', 'audit', 'exec', 'collect'];

async function checkStep(script: ExecScript, fault: Fault | undefined): Promise<void> {
  hooks.copyDirs.length = 0;
  const f = makeFake([script], fault);
  const world = createRepoWorld({ original: repo(), client: f });
  const base = repo();
  const start = {
    id: 'repo-0',
    state: { rootPath: base, entries: [], sqlite: {} },
    result: { success: true as const },
  };
  let after;
  try {
    after = await world.step(start, { command: 'step-0' });
  } finally {
    // The returned snapshot owns its Copy until dispose(); the Box must already be gone.
    expect(f.allContainers()).toEqual([]);
    expect(f.leakedRunIds()).toEqual([]);
    await world.dispose();
  }
  assertNoLeaks(f);

  expect(after.state.lastStep?.stepIndex).toBe(0);
  const pre = fault?.phase === 'copy' || fault?.phase === 'create' || fault?.phase === 'audit';
  if (pre) {
    expect(after.result.success).toBe(false);
    expect(execIndices(f)).toEqual([]);
  } else {
    expect(execIndices(f)).toEqual([0]);
    const execFault = fault?.phase === 'exec';
    const code = after.state.lastStep?.exitCode;
    if (!execFault) {
      if (script.timeout === true) expect(after.state.lastStep?.outcome).toBe('timeout');
      else expect(code).toBe(script.code);
    }
    const failing = execFault || script.timeout === true || (script.code ?? 0) !== 0;
    if (failing) expect(after.result.success).toBe(false);
  }
  if (!after.result.success) {
    const err = (after.result as { error?: string }).error;
    expect(typeof err === 'string' && err.length > 0).toBe(true);
  }
}

describe('Property 18: Repo_World.step outcome handling and cleanup under injected failure', () => {
  it(
    'never throws, reports failures in the snapshot result, and leaves nothing behind after dispose',
    async () => {
      const stepFault = fc.option(faultOver(STEP_PHASES), { nil: undefined, freq: 3 });
      await fc.assert(
        fc.asyncProperty(scriptArb, stepFault, async (script, fault) => {
          await checkStep(script, fault);
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

  it.each([
    [{ code: 3, stderr: 'boom' }, undefined],
    [{ timeout: true }, undefined],
    [{ code: 0 }, { phase: 'exec', mode: 'spawn-error' }],
    [{ code: 0 }, { phase: 'collect', mode: 'corrupt' }],
    [{ code: 0 }, { phase: 'create', mode: 'exit' }],
  ] as [ExecScript, Fault | undefined][])('pinned: step with script %j and fault %j', async (script, fault) => {
    await checkStep(script, fault);
  });
});

// [docker] Property 21: P5 and P6 where their prerequisites hold.
// Feature: ghost-runner, Property 21: P5 and P6 where their prerequisites hold
// P5 is asserted only where P1 holds (p5Claimed); P6 only where p6Claimed is true.
// Neither is asserted in Plan B or when Docker is unavailable (the suite is skipped via
// describeDocker, so P1, P5, and P6 are never counted as passed then).
// Canary secrets and reserved domains/addresses only (.example, RFC 5737 documentation ranges).
// **Validates: Requirements 17.4, 17.5, 9.2, 8.3**
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WardSet } from '@ghost-run/core';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { runPlan } from '../src/pipeline.js';
import type { ShellAction } from '../src/world/types.js';
import { describeDocker, recordDockerExamples } from './docker-available.js';
import { DOCKER_POOL_SLOTS, NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const CANARY = 'sk-CANARY-abc123';
const MAX_ACTIONS = 50;

const WARDS: WardSet = {
  wards: [
    { id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/'] }, // core matcher: exact path or directory prefix
    { id: 'no-exfil', kind: 'egress', secrets: ['.env'], allow_hosts: [] },
  ],
};

/** Small fixture (well under 50 files); removed by the caller. */
function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-p21-'));
  mkdirSync(join(root, 'data', 'nested'), { recursive: true });
  mkdirSync(join(root, 'build'));
  writeFileSync(join(root, '.env'), `API_KEY=${CANARY}\n`);
  writeFileSync(join(root, 'data', 'seed.txt'), 'seed\n');
  writeFileSync(join(root, 'data', 'nested', 'a.txt'), 'nested\n');
  writeFileSync(join(root, 'build', 'out.js'), '// out\n');
  symlinkSync('seed.txt', join(root, 'data', 'link'));
  return root;
}

function ghostContainers(runId: string): string[] {
  const r = spawnSync('docker', ['ps', '-a', '-q', '--filter', `label=ghost-run.run-id=${runId}`], {
    encoding: 'utf8',
  });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

function ghostVolumes(runId: string): string[] {
  const r = spawnSync('docker', ['volume', 'ls', '-q', '--filter', `label=ghost-run.run-id=${runId}`], {
    encoding: 'utf8',
  });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

// -- P5 plans -------------------------------------------------------------------

interface P5Case {
  readonly plan: ShellAction[];
  /** Copy-relative protected path that must appear in a Change. */
  readonly target: string;
  readonly kinds: readonly string[];
}

const TARGETS = ['data/seed.txt', 'data/nested/a.txt'] as const;

function rel(t: string): string {
  return t.slice('data/'.length);
}

function dirOf(t: string): string {
  return t.slice(0, t.lastIndexOf('/'));
}

function baseOf(t: string): string {
  return t.slice(t.lastIndexOf('/') + 1);
}

const DELETED = ['file-deleted', 'symlink-changed'] as const;
const OVERWRITTEN = ['file-overwritten'] as const;

const p5Arb: fc.Arbitrary<P5Case> = fc.oneof(
  // delete bypass forms
  fc.constantFrom(...TARGETS).chain((t) =>
    fc.constantFrom(
      `rm ./data/../${t}`,
      `ln -s data dl; rm dl/${rel(t)}`,
      `rm ${dirOf(t)}/${baseOf(t).slice(0, 1)}*`,
      `find ${dirOf(t)} -name ${baseOf(t)} -delete`,
      `mv ${t} build/moved.tmp && rm build/moved.tmp`,
      `printf 'rm %s\\n' ${t} > build/s.sh; sh build/s.sh`,
      `sh -c "rm ${t}"`,
    ).map((command): P5Case => ({ plan: [{ command }], target: t, kinds: DELETED })),
  ),
  // overwrite bypass forms
  fc.constantFrom(...TARGETS).chain((t) =>
    fc.constantFrom(
      `echo x > ./data/../${t}`,
      `ln -s data dl; echo x > dl/${rel(t)}`,
      `sh -c "echo y > ${t}"`,
    ).map((command): P5Case => ({ plan: [{ command }], target: t, kinds: OVERWRITTEN })),
  ),
  // replaced symbolic link
  fc
    .constantFrom('ln -sfn ../build/out.js data/link', 'ln -sfn ../build/out.js ./data/../data/link')
    .map((command): P5Case => ({ plan: [{ command }], target: 'data/link', kinds: ['symlink-changed'] })),
).chain((c) =>
  // harmless filler steps before the bypass step
  fc.array(fc.constantFrom('true', 'echo noop > build/noop.txt', 'ls data > /dev/null'), { maxLength: 2 }).map(
    (fill): P5Case => ({ ...c, plan: [...fill.map((command) => ({ command })), ...c.plan] }),
  ),
);

// -- P6 plans -------------------------------------------------------------------

const READS = [
  'cat .env > /dev/null',
  'grep -q API_KEY .env',
  'head -c 4 .env > /dev/null',
  `sh -c 'cat ./.env > /dev/null'`,
  'cat ./data/../.env > /dev/null',
] as const;

const NETS = [
  'curl -s -m 1 http://exfil.example/ -o /dev/null', // by name over HTTP
  'curl -s -m 1 https://exfil.example/ -o /dev/null', // by name over TLS
  'curl -s -m 1 http://192.0.2.7/ -o /dev/null', // direct IP (RFC 5737)
  'curl -s -m 1 telnet://198.51.100.7:9 -o /dev/null', // raw TCP (no HTTP framing)
] as const;

interface P6Case {
  readonly plan: ShellAction[];
}

const p6Arb: fc.Arbitrary<P6Case> = fc
  .tuple(
    fc.constantFrom(...READS),
    fc.constantFrom(...NETS),
    fc.constantFrom('same-step', 'separate-steps'),
    fc.integer({ min: 0, max: 1 }),
    fc.integer({ min: 0, max: 1 }),
  )
  .map(([read, net, layout, before, between]): P6Case => {
    const cmds: string[] = [];
    for (let i = 0; i < before; i += 1) cmds.push('true');
    if (layout === 'same-step') {
      cmds.push(`${read}; ${net}; true`);
    } else {
      cmds.push(`${read}; true`);
      for (let i = 0; i < between; i += 1) cmds.push('true');
      cmds.push(`${net}; true`);
    }
    return { plan: cmds.map((command) => ({ command })) };
  });

describeDocker('[docker] P5 and P6 where their prerequisites hold (Property 21)', () => {
  it(
    'P5: a plan that deletes or overwrites a protected path yields a Change for it and a block, where P1 holds',
    async ({ task }) => {
      let completed = 0;
      let asserted = 0;
      try {
        await fc.assert(
          fc.asyncProperty(p5Arb, async (c) => {
            expect(c.plan.length).toBeLessThanOrEqual(MAX_ACTIONS);
            const root = makeFixture();
            try {
              const { result } = await runPlan(c.plan, {
                original: root,
                wardSet: WARDS,
                pool: { size: DOCKER_POOL_SLOTS },
              });
              // P5 depends on P1: assert only when the run claims P5 (docker-box, P1 holds).
              if (result.isolation.mode === 'docker-box' && result.isolation.p5Claimed) {
                asserted += 1;
                expect(result.isolation.p1Claimed).toBe(true);
                const changes = result.report.changes.flat();
                const hit = changes.some(
                  (ch) => 'path' in ch && ch.path === c.target && c.kinds.includes(ch.kind),
                );
                expect(hit, `no ${c.kinds.join('/')} Change for ${c.target}`).toBe(true);
                expect(result.verdict).toBe('block');
              }
              expect(existsSync(result.copy.location)).toBe(false);
              expect(ghostContainers(result.runId)).toEqual([]);
              expect(ghostVolumes(result.runId)).toEqual([]);
            } finally {
              rmSync(root, { recursive: true, force: true });
            }
            completed += 1;
          }),
          pbtParams(true),
        );
      } finally {
        recordDockerExamples(task, completed);
        console.info(`P21/P5: ${String(completed)} examples completed (${String(asserted)} asserted), target ${String(NUM_RUNS)}`);
      }
      expect(asserted).toBeGreaterThan(0);
    },
    // explicit and nightly runs have no fast-check time limit, so no vitest limit either
    PBT_MODE === 'save' ? testTimeoutMs(true) : 0,
  );

  it(
    'P6: reading a secret then attempting a network connection yields ordered secret-read and network-attempt events, where p6Claimed',
    async ({ task }) => {
      let completed = 0;
      let asserted = 0;
      try {
        await fc.assert(
          fc.asyncProperty(p6Arb, async (c) => {
            const root = makeFixture();
            try {
              const { result } = await runPlan(c.plan, {
                original: root,
                wardSet: WARDS,
                pool: { size: DOCKER_POOL_SLOTS },
              });
              // Not asserted in Plan B or when p6Claimed is false.
              if (result.isolation.mode === 'docker-box' && result.isolation.p6Claimed) {
                asserted += 1;
                const events = result.report.observedEvents;
                const reads = events.filter((e) => e.kind === 'secret-read' && e.path === '.env');
                const nets = events.filter((e) => e.kind === 'network-attempt');
                expect(reads.length, 'no secret-read event').toBeGreaterThan(0);
                expect(nets.length, 'no network-attempt event').toBeGreaterThan(0);
                const ordered = reads.some((r) => nets.some((n) => r.stepIndex <= n.stepIndex));
                expect(ordered, 'secret-read not before a network-attempt').toBe(true);
                expect(result.verdict).toBe('block');
              }
              expect(existsSync(result.copy.location)).toBe(false);
              expect(ghostContainers(result.runId)).toEqual([]);
              expect(ghostVolumes(result.runId)).toEqual([]);
            } finally {
              rmSync(root, { recursive: true, force: true });
            }
            completed += 1;
          }),
          pbtParams(true),
        );
      } finally {
        recordDockerExamples(task, completed);
        console.info(`P21/P6: ${String(completed)} examples completed (${String(asserted)} asserted), target ${String(NUM_RUNS)}`);
      }
      expect(asserted).toBeGreaterThan(0);
    },
    // explicit and nightly runs have no fast-check time limit, so no vitest limit either
    PBT_MODE === 'save' ? testTimeoutMs(true) : 0,
  );
});

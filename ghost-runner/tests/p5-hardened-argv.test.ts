// Feature: ghost-runner, Property 5: Hardened argv
// Validates: Requirements 4.9, 5.1, 5.2, 5.3, 5.4, 5.8, 5.9, 6.1
import { homedir } from 'node:os';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveRunnerOptions, type RunnerOptions } from '../src/config.js';
import {
  BOX_ENV,
  buildExecArgs,
  buildRunArgs,
  containerName,
  REC_DIR,
  WORK_DIR,
  type BoxMounts,
} from '../src/docker/hardening.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;

// Path segments with spaces, quotes, shell metacharacters, and a leading "-". No comma,
// newline, or NUL: buildRunArgs rejects those for --mount (covered by a unit test below).
const segment = fc
  .array(fc.constantFrom('a', 'b', 'Z', '0', ' ', '"', "'", '-', '$', ';', '(', ')', '`', '\\', '*', '='), {
    minLength: 1,
    maxLength: 10,
  })
  .map((cs) => cs.join(''))
  .filter((s) => s !== '.' && s !== '..');
const dirName = fc.oneof(segment, segment.map((s) => `-${s}`));

const digest = fc.array(fc.constantFrom(...'0123456789abcdef'), { minLength: 64, maxLength: 64 }).map((c) => c.join(''));
const imageRef = fc.tuple(fc.constantFrom('ghost-box', 'reg.test:5000/ns/box'), digest).map(([n, d]) => `${n}@sha256:${d}`);

const options = fc.record({
  excludeDirs: fc.uniqueArray(dirName, { minLength: 0, maxLength: 4 }).map((l) => l.filter((d) => !d.includes('/'))),
  excludedDirMode: fc.constantFrom('omit' as const, 'readonly-mount' as const),
  pool: fc.option(fc.record({ size: fc.integer({ min: 1, max: 8 }) }), { nil: undefined }),
  limits: fc.option(
    fc.record({
      pids: fc.integer({ min: 1, max: 100_000 }),
      memory: fc.tuple(fc.integer({ min: 1, max: 9999 }), fc.constantFrom('b', 'k', 'm', 'g')).map(([n, u]) => `${n}${u}`),
      cpus: fc.constantFrom(0.5, 1, 1.5, 2, 4, 16),
      tmpBytes: fc.integer({ min: 1, max: 4096 }).map((m) => m * 1024 * 1024),
    }),
    { nil: undefined },
  ),
  image: imageRef,
  execLimitSec: fc.integer({ min: 1, max: 30 }),
});

const scenario = fc.record({
  opts: options,
  originalParts: fc.array(dirName, { minLength: 1, maxLength: 3 }),
  copyName: dirName,
  uid: fc.integer({ min: 0, max: 65_535 }),
  gid: fc.integer({ min: 0, max: 65_535 }),
  poolOwner: fc.option(fc.stringMatching(/^[a-z0-9-]{1,12}$/), { nil: undefined }),
  runId: fc.stringMatching(/^[a-f0-9]{8,16}$/),
});

// Hostile action strings: the box must receive each byte-identical as one argv element.
const action = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.constantFrom(
    '-rf /',
    '--help',
    'echo a; rm -rf /',
    'echo $(id)',
    'echo `id` && true',
    "echo 'x' \"y\"",
    'line1\nline2\n',
    '  leading and trailing  ',
    '',
    'a\tb\\c',
  ),
);
const cwd = fc.option(fc.oneof(segment, fc.array(segment, { minLength: 1, maxLength: 3 }).map((p) => p.join('/'))), { nil: undefined });

function flagValues(args: readonly string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === flag) out.push(args[i + 1] ?? '');
  });
  return out;
}

function isAncestorOrSame(candidate: string, path: string): boolean {
  return path === candidate || path.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`);
}

describe('Property 5: Hardened argv', () => {
  afterAll(() => {
    console.log(`Property 5: Hardened argv: ${executed} runs executed (mode=${PBT_MODE}, NUM_RUNS=${NUM_RUNS})`);
  });

  it(
    'buildRunArgs carries every hardening flag and nothing that weakens the box',
    () => {
      fc.assert(
        fc.property(scenario, ({ opts, originalParts, copyName, uid, gid, poolOwner, runId }) => {
          executed++;
          const original = `/srv/${originalParts.join('/')}`;
          const runnerOptions: RunnerOptions = {
            original,
            excludeDirs: opts.excludeDirs,
            excludedDirMode: opts.excludedDirMode,
            execLimitSec: opts.execLimitSec,
            ...(opts.pool === undefined ? {} : { pool: opts.pool }),
            ...(opts.limits === undefined ? {} : { limits: opts.limits }),
            image: opts.image,
          };
          const resolved = resolveRunnerOptions(runnerOptions);
          const copyDir = `/tmp/ghost-copy/${copyName}`;
          const readonlyMounts =
            resolved.excludedDirMode === 'readonly-mount'
              ? resolved.excludeDirs.map((d) => ({ source: `${original}/${d}`, destination: `${WORK_DIR}/${d}` }))
              : [];
          const mounts: BoxMounts = { copyDir, readonlyMounts };
          const args = buildRunArgs(
            { image: opts.image, limits: resolved.limits, uid, gid, ...(poolOwner === undefined ? {} : { poolOwner }) },
            runId,
            mounts,
          );

          // Required flags with configured values (5.1, 5.2, 5.3, 5.4, 6.1).
          expect(args[0]).toBe('run');
          expect(flagValues(args, '--network')).toEqual(['none']);
          expect(flagValues(args, '--dns')).toEqual(['127.0.0.1']);
          expect(flagValues(args, '--cap-drop')).toEqual(['ALL']);
          expect(flagValues(args, '--security-opt')).toEqual(['no-new-privileges']);
          expect(flagValues(args, '--pids-limit')).toEqual([String(resolved.limits.pids)]);
          expect(flagValues(args, '--memory')).toEqual([resolved.limits.memory]);
          expect(flagValues(args, '--memory-swap')).toEqual([resolved.limits.memory]);
          expect(flagValues(args, '--cpus')).toEqual([String(resolved.limits.cpus)]);
          expect(args.filter((a) => a === '--read-only')).toHaveLength(1);
          expect(flagValues(args, '--tmpfs')).toEqual([
            `/tmp:rw,exec,nosuid,nodev,size=${Math.ceil(resolved.limits.tmpBytes / (1024 * 1024))}m`,
          ]);
          expect(flagValues(args, '--user')).toEqual([`${uid}:${gid}`]);
          expect(flagValues(args, '--workdir')).toEqual([WORK_DIR]);
          expect(flagValues(args, '--name')).toEqual([containerName(runId)]);
          expect(flagValues(args, '--entrypoint')).toEqual(['ghost-init']);
          expect(args[args.length - 1]).toBe(opts.image);
          expect(args[args.length - 2]).toBe('ghost-init');
          expect(args.filter((a) => a === opts.image)).toHaveLength(1);

          // Nothing that weakens the box.
          for (const bad of ['--privileged', '--cap-add', '--pid', '--ipc', '--net', '--userns', '--device', '--volumes-from', '-v', '--volume', '--publish', '-p', '--add-host', '--link']) {
            expect(args).not.toContain(bad);
          }
          for (const a of args) expect(a.startsWith('--privileged') || a.startsWith('--cap-add') || a.startsWith('--pid=') || a.startsWith('--ipc=') || a.startsWith('--network=')).toBe(false);

          // Mounts (4.9, 5.2): one rw bind (Copy), anonymous recorder volume, ro mounts only.
          const mountSpecs = flagValues(args, '--mount');
          expect(mountSpecs).toHaveLength(2 + readonlyMounts.length);
          const rwBinds = mountSpecs.filter((m) => m.startsWith('type=bind,') && !m.endsWith(',readonly'));
          expect(rwBinds).toEqual([`type=bind,src=${copyDir},dst=${WORK_DIR}`]);
          expect(mountSpecs.filter((m) => m.startsWith('type=volume,'))).toEqual([`type=volume,dst=${REC_DIR}`]);
          const roBinds = mountSpecs.filter((m) => m.endsWith(',readonly'));
          expect(roBinds).toEqual(readonlyMounts.map((m) => `type=bind,src=${m.source},dst=${m.destination},readonly`));
          expect(mountSpecs.length).toBe(rwBinds.length + 1 + roBinds.length);

          const home = homedir();
          const sources = [copyDir, ...readonlyMounts.map((m) => m.source)];
          for (const s of sources) {
            expect(s).not.toBe('/var/run/docker.sock');
            expect(s).not.toBe('/run/docker.sock');
            expect(s).not.toBe(home);
            expect(isAncestorOrSame(s, original)).toBe(false);
          }
          expect(mountSpecs.join('\n')).not.toContain('docker.sock');

          // Environment: exactly the four allowed variables (5.8).
          const envs = flagValues(args, '-e');
          expect(envs.sort()).toEqual(Object.entries(BOX_ENV).map(([k, v]) => `${k}=${v}`).sort());
          expect(envs).toHaveLength(4);
          expect(args).not.toContain('--env');
          expect(args).not.toContain('--env-file');

          // Labels identify the run; pool labels only for pool slots.
          const labels = flagValues(args, '--label');
          expect(labels).toContain(`ghost-run.run-id=${runId}`);
          expect(labels.includes('ghost-run.pool=1')).toBe(poolOwner !== undefined);
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'buildExecArgs passes each action as one byte-identical argv element',
    () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-f0-9]{8,16}$/),
          fc.integer({ min: 0, max: 49 }),
          cwd,
          action,
          (runId, step, dir, act) => {
            executed++;
            const container = containerName(runId);
            const args = buildExecArgs(container, step, dir, act);
            expect(args).toHaveLength(8);
            expect(args[0]).toBe('exec');
            expect(args[1]).toBe('-w');
            expect(args[3]).toBe(container);
            expect(args[4]).toBe('ghost-step');
            expect(args[5]).toBe(String(step));
            expect(args[args.length - 1]).toBe(act);
            expect(Buffer.from(args[args.length - 1] ?? '', 'utf8').equals(Buffer.from(act, 'utf8'))).toBe(true);
            expect(args[2]?.startsWith(WORK_DIR)).toBe(true);
            // No shell wrapper and no network/privilege flags.
            for (const bad of ['sh', 'bash', '-c', '--privileged', '--user', '-u', '-e', '--env']) {
              expect(args.slice(0, 7)).not.toContain(bad);
            }
          },
        ),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it('rejects a comma, newline, or NUL in a mount path (no mount-key injection)', () => {
    const base = { image: `ghost-box@sha256:${'0'.repeat(64)}`, uid: 1000, gid: 1000 };
    for (const bad of ['/tmp/a,b', '/tmp/a\nb', '/tmp/a\0b']) {
      expect(() => buildRunArgs(base, 'abc12345', { copyDir: bad })).toThrow();
      expect(() => buildRunArgs(base, 'abc12345', { copyDir: '/tmp/ok', readonlyMounts: [{ source: bad, destination: '/work/x' }] })).toThrow();
    }
  });
});

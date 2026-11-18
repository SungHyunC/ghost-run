#!/usr/bin/env node
// W6 trial: cost of secret-read recording (design D1 matrix).
//
//   corepack pnpm --filter @ghost-run/ghost-runner build   (hardening args come from dist/)
//   node ghost-runner/scripts/trial-secret-read.mjs [--runs 10] [--json out.json]
//
// Commands: `true` and `npm test`. Variants:
//   (a) no strace
//   (b) strace, connect only
//   (c) strace, connect+openat family, plain ptrace
//   (d) strace, connect+openat family, --seccomp-bpf (the design's choice)
// Every cell runs `runs` times (default 10) inside one hardened box; the wall time of
// `docker exec` is measured on the host, so the fixed docker-exec overhead is in every
// cell and cancels in (variant - a). Runs are interleaved across variants so that load
// drift hits all variants alike. Fixture: 3,945 files generated in a temp directory
// (Reference_Repo shape) with a canary .env. Canary values and reserved names only; the
// temp directory and the box are removed at the end.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const RUNS = Number(argVal('--runs', '10'));
const JSON_OUT = argVal('--json', undefined);
const FILE_COUNT = 3945;
const BOUND_S = 0.8;

const sh = (cmd, a) => spawnSync(cmd, a, { encoding: 'utf8' });
const sysctl = (k) => {
  const r = sh('sysctl', ['-n', k]);
  return r.status === 0 ? r.stdout.trim() : 'unavailable';
};
function machine() {
  const dv = sh('docker', ['version', '--format', 'client {{.Client.Version}} / server {{.Server.Version}} / {{.Server.Platform.Name}}']);
  const di = sh('docker', ['desktop', 'version']);
  return {
    time: new Date().toISOString(),
    loadavg: sysctl('vm.loadavg'),
    chip: sysctl('machdep.cpu.brand_string'),
    cores: sysctl('hw.ncpu'),
    memoryBytes: sysctl('hw.memsize'),
    docker: dv.status === 0 ? dv.stdout.trim() : 'unavailable',
    dockerDesktop: di.status === 0 ? di.stdout.trim().replace(/\s+/g, ' ') : 'unavailable',
  };
}

function median(xs) {
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function buildFixture(root) {
  // 3,945 files in 5 levels of directories; no node_modules.
  const dirs = 60;
  for (let d = 0; d < dirs; d++) mkdirSync(join(root, 'src', `d${d}`, 'sub'), { recursive: true });
  let n = 0;
  const body = 'export const x = 1;\n'.repeat(40);
  const add = (p, c) => {
    writeFileSync(p, c);
    n++;
  };
  add(
    join(root, 'package.json'),
    JSON.stringify({ name: 'ghost-trial-fixture', version: '0.0.0', private: true, scripts: { test: "node -e \"console.log('ok')\"" } }),
  );
  add(join(root, '.env'), 'API_KEY=sk-CANARY-abc123\n');
  for (let i = 0; n < FILE_COUNT; i++) {
    const d = i % dirs;
    add(join(root, 'src', `d${d}`, i % 2 ? 'sub' : '.', `f${i}.ts`), body);
  }
  return n;
}

const TRACE_C = 'trace=connect';
const TRACE_CO = 'trace=openat,open,openat2,connect,chdir,fchdir';
const strace = (flags, trace) =>
  `strace -f -qq -s 256 ${flags} -e ${trace} -e signal=none -y -o /ghost-rec/trial.strace -- sh -c "$1"`;
const VARIANTS = [
  { id: 'a', label: 'no strace', script: 'sh -c "$1"', trace: false },
  { id: 'b', label: 'strace connect', script: strace('', TRACE_C), trace: true },
  { id: 'c', label: 'strace connect+openat, plain ptrace', script: strace('', TRACE_CO), trace: true },
  { id: 'd', label: 'strace connect+openat, --seccomp-bpf', script: strace('--seccomp-bpf', TRACE_CO), trace: true },
];
const COMMANDS = ['true', 'npm test'];

function main() {
  const probe = sh('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (probe.status !== 0) {
    console.error('Docker is not available.');
    process.exit(2);
  }
  const hash = (() => {
    const r = sh('node', ['--input-type=module', '-e', `import('${pathToFileURL(join(pkgDir, 'box/build.mjs')).href}').then(m=>console.log(m.computeBoxHash()))`]);
    return r.stdout.trim();
  })();
  const image = `ghost-run/box:${hash}`;
  if (sh('docker', ['image', 'inspect', image]).status !== 0) {
    console.error(`Box image ${image} is missing. Run: corepack pnpm --filter @ghost-run/ghost-runner box:build`);
    process.exit(2);
  }

  const start = machine();
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ghost-trial-'));
  const name = `ghost-trial-${randomUUID()}`;
  const result = { start, image, files: 0, runs: RUNS, cells: {} };
  let exitCode = 0;
  try {
    result.files = buildFixture(root);
    const run = sh('docker', [
      'run', '-d', '--name', name, '--label', 'ghost-run.trial=1',
      '--network', 'none', '--dns', '127.0.0.1', '--init', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1g', '--memory-swap', '1g',
      '--cpus', '2', '--read-only', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=256m',
      '--user', `${process.getuid()}:${process.getgid()}`, '--workdir', '/work',
      '--mount', `type=bind,src=${root},dst=/work`,
      '--mount', 'type=volume,dst=/ghost-rec',
      '-e', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', '-e', 'HOME=/tmp/home',
      '-e', 'CI=true', '-e', 'NPM_CONFIG_UPDATE_NOTIFIER=false',
      '--entrypoint', 'ghost-init', image, '--max-lifetime', '900',
    ]);
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`);
    for (let i = 0; ; i++) {
      if (sh('docker', ['exec', name, 'test', '-f', '/ghost-rec/ready']).status === 0) break;
      if (i > 50) throw new Error('recorder never became ready');
      spawnSync('sleep', ['0.1']);
    }
    sh('docker', ['exec', name, 'mkdir', '-p', '/tmp/home']);

    const samples = {};
    for (const c of COMMANDS) for (const v of VARIANTS) samples[`${c}|${v.id}`] = [];
    const timeOne = (cmd, v) => {
      sh('docker', ['exec', name, 'sh', '-c', 'rm -f /ghost-rec/trial.strace']);
      const t0 = performance.now();
      const r = sh('docker', ['exec', '-w', '/work', name, 'sh', '-c', v.script, '_', cmd]);
      const dt = (performance.now() - t0) / 1000;
      if (r.status !== 0) throw new Error(`variant ${v.id} command "${cmd}" exited ${r.status}: ${r.stderr}`);
      if (v.trace && v.id !== 'b') {
        // (b) traces connect only, so its log is legitimately empty for these commands.
        const log = sh('docker', ['exec', name, 'sh', '-c', 'wc -c < /ghost-rec/trial.strace']);
        if (!(Number(log.stdout) > 0)) throw new Error(`variant ${v.id} produced an empty strace log`);
      }
      return dt;
    };
    for (const c of COMMANDS) for (const v of VARIANTS) timeOne(c, v); // warm-up, discarded
    for (let i = 0; i < RUNS; i++) {
      for (const c of COMMANDS) for (const v of VARIANTS) samples[`${c}|${v.id}`].push(timeOne(c, v));
    }
    for (const c of COMMANDS) {
      for (const v of VARIANTS) {
        const xs = samples[`${c}|${v.id}`];
        result.cells[`${c}|${v.id}`] = { command: c, variant: v.id, label: v.label, median: median(xs), max: Math.max(...xs), samples: xs };
      }
    }
    // Decision rule: (d) - (a) <= 0.8 s for both commands.
    result.deltas = {};
    for (const c of COMMANDS) {
      const a = result.cells[`${c}|a`];
      const d = result.cells[`${c}|d`];
      result.deltas[c] = { medianDelta: d.median - a.median, maxDelta: d.max - a.max };
    }
    result.rule = {
      boundSeconds: BOUND_S,
      holds: COMMANDS.every((c) => result.deltas[c].medianDelta <= BOUND_S),
      measuredBound: Math.max(...COMMANDS.map((c) => result.deltas[c].medianDelta)),
    };
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    exitCode = 1;
  } finally {
    sh('docker', ['rm', '-f', '-v', name]);
    rmSync(root, { recursive: true, force: true });
  }
  result.end = machine();

  const f = (x) => x.toFixed(3);
  console.log(`\nSecret-read recording trial: ${result.files} files, ${RUNS} runs per cell, wall time of docker exec (s)\n`);
  console.log('| Command | Variant | Median | Max |\n| --- | --- | --- | --- |');
  for (const cell of Object.values(result.cells)) console.log(`| ${cell.command} | (${cell.variant}) ${cell.label} | ${f(cell.median)} | ${f(cell.max)} |`);
  if (result.deltas) {
    for (const [c, d] of Object.entries(result.deltas)) console.log(`(d)-(a) ${c}: median ${f(d.medianDelta)} s, max-max ${f(d.maxDelta)} s`);
    console.log(`Rule (d)-(a) <= ${BOUND_S} s for both commands: ${result.rule.holds ? 'HOLDS' : 'FAILS'}`);
  }
  console.log(`\nstart: ${JSON.stringify(start)}\nend:   ${JSON.stringify(result.end)}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

main();

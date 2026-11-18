// Task 7.7: measures the cost of one verifyWorld example and writes tests/pbt-budget.json (plain JavaScript, Node 20+).
// Usage (from worlds/drawer-arm): node scripts/measure-budget.mjs [--write-docs]
// It runs the env-gated vitest file scripts/measure-budget.measure.ts three times (median of the worst example),
// then once more with verifyWorld at the chosen count. Machine load is recorded at the start and the end.
// Do not run other test suites while it runs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_MS = 25_000;
const loadavg = () => spawnSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' }).stdout.trim();
const tmp = mkdtempSync(join(os.tmpdir(), 'ghost-budget-'));

function measure(verifyRuns) {
  const out = join(tmp, `m-${Math.random().toString(36).slice(2)}.json`);
  const r = spawnSync('corepack', ['pnpm', 'exec', 'vitest', 'run', '--config', 'scripts/measure-budget.config.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GHOST_MEASURE_OUT: out, GHOST_MEASURE_VERIFY_RUNS: String(verifyRuns) },
  });
  if (r.status !== 0) {
    process.stderr.write(`${r.stdout}\n${r.stderr}\n`);
    throw new Error('measurement failed');
  }
  return JSON.parse(readFileSync(out, 'utf8'));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const loadStart = loadavg();
const runs = [0, 1, 2].map(() => measure(0));
const worst = runs.map((r) => r.worstExampleMs);
const worstMs = median(worst);
const stepCostMicros = median(runs.map((r) => r.stepCostMicros));
const shortRuns = Math.min(100, Math.max(20, Math.floor(BUDGET_MS / worstMs)));
const fits20 = 20 * worstMs <= BUDGET_MS;
const verifyRun = fits20 ? measure(shortRuns) : undefined;
const loadEnd = loadavg();
rmSync(tmp, { recursive: true, force: true });

const result = { loadStart, loadEnd, runs, worstMs, spreadMs: [Math.min(...worst), Math.max(...worst)], stepCostMicros, shortRuns, fits20, verify: verifyRun?.verify };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!fits20) {
  process.stderr.write('Even 20 examples do not fit in the 25 s allowance: design D14 must be reopened.\n');
  process.exit(2);
}

const round = (x, d) => Number(x.toFixed(d));
const date = new Date().toISOString().slice(0, 10);
const budget = {
  shortRuns,
  measuredWorstExampleMs: round(worstMs, 1),
  stepCostMicros: round(stepCostMicros, 2),
  measuredOn: { node: process.version, machine: `${os.cpus()[0]?.model ?? 'unknown'} (${os.platform()} ${os.arch()}, ${os.cpus().length} cores)`, date },
  rationale:
    shortRuns < 100
      ? `shortRuns = clamp(floor(25000 / ${round(worstMs, 1)}), 20, 100) = ${shortRuns}. The worst example (a plan using the whole 3000-step plan limit, 7 plan executions) took a median of ${round(worstMs, 1)} ms over 3 runs at ${round(stepCostMicros, 2)} microseconds per step; ${shortRuns} examples fit the 25 s allowance of one verifyWorld call inside the 60 s hook limit. The Nightly_Run uses the full count of Requirement 18.`
      : '',
};
writeFileSync(join(root, 'tests', 'pbt-budget.json'), `${JSON.stringify(budget, null, 2)}\n`);

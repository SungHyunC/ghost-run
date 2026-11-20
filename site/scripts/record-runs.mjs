// Record_Script: runs the demo plan and the fixed plan of each of the three worlds through the real
// world packages and writes site/src/data/runs.json.
// Usage (from site/): node scripts/record-runs.mjs [--out <path>] [--check]
//   --out <path>  write the Runs_File to <path> (default: src/data/runs.json)
//   --check       compare a fresh run with the committed file; exit 1 on a difference, write nothing
// The worlds and pipelines are TypeScript source, so the script spawns the env-gated vitest file
// scripts/record-runs.measure.ts (as apps/ghost-hand/scripts/measure-demo.mjs does) and reads its output.
// It exits non-zero and writes nothing when the measurement fails (unexpected verdict, p1 mismatch, bad wards).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printJson } from './lib/print-json.mjs';

const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(SITE_DIR, 'src', 'data', 'runs.json');

/**
 * @param {string[]} argv
 * @returns {{ out: string; check: boolean }}
 */
export function parseArgs(argv) {
  let out = DEFAULT_OUT;
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') check = true;
    else if (arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('--out needs a path');
      out = isAbsolute(value) ? value : resolve(process.cwd(), value);
      i += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return { out, check };
}

/**
 * Runs the measure file and returns the exact text of the Runs_File.
 * @returns {string}
 */
export function measureRuns() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'ghost-site-runs-'));
  const raw = join(tmp, 'runs.raw.json');
  try {
    const r = spawnSync('corepack', ['pnpm', 'exec', 'vitest', 'run', '--config', 'scripts/record-runs.config.ts'], {
      cwd: SITE_DIR,
      encoding: 'utf8',
      env: { ...process.env, GHOST_SITE_RUNS_OUT: raw },
    });
    if (r.status !== 0 || !existsSync(raw)) {
      process.stderr.write(`${r.stdout ?? ''}\n${r.stderr ?? ''}\n`);
      throw new Error('record-runs measurement failed');
    }
    return printJson(JSON.parse(readFileSync(raw, 'utf8')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const { out, check } = parseArgs(process.argv.slice(2));
  const text = measureRuns();
  if (check) {
    const committed = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (committed !== text) {
      process.stderr.write(`runs file differs from a fresh run: ${out}\n`);
      process.exit(1);
    }
    process.stdout.write('runs file is current\n');
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  process.stdout.write(`wrote ${out}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

// Task 11.5: runs both demo plans (plans/first.plan.json and plans/revised.plan.json) with the default seed,
// the default variant count, and the shipped Wards_File on the pure pipeline (runGhostHand) in Node 20+.
// Usage (from apps/ghost-hand): node scripts/measure-demo.mjs
// It runs the env-gated vitest file scripts/measure-demo.measure.ts (the world package is TypeScript source)
// and prints the result as JSON. Nothing is written to the repository.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(os.tmpdir(), 'ghost-demo-'));
const out = join(tmp, 'demo.json');
try {
  const r = spawnSync('corepack', ['pnpm', 'exec', 'vitest', 'run', '--config', 'scripts/measure-demo.config.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GHOST_DEMO_OUT: out },
  });
  if (r.status !== 0) {
    process.stderr.write(`${r.stdout}\n${r.stderr}\n`);
    throw new Error('demo measurement failed');
  }
  process.stdout.write(`${readFileSync(out, 'utf8')}\n`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

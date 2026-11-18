// Cross-environment hash check (task 17.1): compares the Trajectory_Hash of REFERENCE_PLAN from Node, from the
// Chrome main thread, and from a Chrome Web Worker with the Golden_Hash in worlds/drawer-arm/tests/golden.json.
// The golden hash is only read here, never written.
// Usage: node tests/browser/cross-env.mjs <chrome-result.json>   (prints one JSON document; exit 1 on a mismatch)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const goldenPath = join(appRoot, '..', '..', 'worlds', 'drawer-arm', 'tests', 'golden.json');

export function readGolden() {
  return JSON.parse(readFileSync(goldenPath, 'utf8'));
}

/** Runs the Node leg through the env-gated vitest file and returns { node, hashes }. */
export function nodeHashes() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'ghost-nodehash-'));
  const out = join(tmp, 'node-hash.json');
  try {
    const r = spawnSync('corepack', ['pnpm', 'exec', 'vitest', 'run', '--config', 'scripts/node-hash.config.ts'], {
      cwd: appRoot,
      encoding: 'utf8',
      env: { ...process.env, GHOST_NODE_HASH_OUT: out },
    });
    if (r.status !== 0) throw new Error(`node hash run failed: ${(r.stdout + r.stderr).slice(-500)}`);
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Pure comparison. Every hash list must hold only the golden hash. */
export function compareHashes({ golden, node, chromeMain, chromeWorker }) {
  const all = { node, chromeMain, chromeWorker };
  const verdicts = {};
  for (const [name, list] of Object.entries(all)) {
    verdicts[name] = Array.isArray(list) && list.length > 0 && list.every((h) => h === golden);
  }
  return { golden, ...all, verdicts, allEqual: Object.values(verdicts).every(Boolean) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const chrome = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const node = nodeHashes();
  const report = compareHashes({
    golden: readGolden().hash,
    node: node.hashes,
    chromeMain: chrome.mainThreadHashes?.hashes,
    chromeWorker: chrome.workerHashes?.hashes,
  });
  process.stdout.write(`${JSON.stringify({ nodeVersion: node.node, ...report }, null, 2)}\n`);
  process.exit(report.allEqual ? 0 : 1);
}

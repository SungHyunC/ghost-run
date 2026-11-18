// vitest globalSetup (task 16.1, Requirement 22 criterion 5). Records the files of the Ghost_Store folder
// `.ghost-run/` and the untracked files under integrations/ and .kiro/hooks/ before the run, and fails
// the run when the run created any new one. `.ghost-run/probe/` is excluded: the probe hook of a running
// Kiro host writes there (task 1.8 disables it). The snapshot compares names only, never content.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {string} dir @param {string} prefix @returns {string[]} */
function list(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? e.name : `${prefix}/${e.name}`;
    if (prefix === '' && e.name === 'probe') continue;
    if (e.isDirectory()) out.push(...list(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/** @returns {{ ghostStore: string[], untracked: string[] }} */
export function takeSnapshot() {
  const r = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'integrations', '.kiro/hooks'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  const untracked = r.status === 0 ? r.stdout.split('\n').filter(Boolean).sort() : [];
  return { ghostStore: list(join(REPO, '.ghost-run')), untracked };
}

/**
 * Paths present in `after` and not in `before`.
 * @param {{ ghostStore: string[], untracked: string[] }} before
 * @param {{ ghostStore: string[], untracked: string[] }} after
 * @returns {string[]}
 */
export function diffSnapshots(before, after) {
  const was = new Set(before.ghostStore);
  const wasUntracked = new Set(before.untracked);
  return [
    ...after.ghostStore.filter((p) => !was.has(p)).map((p) => `.ghost-run/${p}`),
    ...after.untracked.filter((p) => !wasUntracked.has(p)),
  ];
}

/** @type {{ ghostStore: string[], untracked: string[] } | undefined} */
let before;

export function setup() {
  before = takeSnapshot();
}

export function teardown() {
  if (!before) return;
  const created = diffSnapshots(before, takeSnapshot());
  if (created.length > 0) {
    throw new Error(`the test run left files in the working tree:\n${created.map((p) => `  ${p}`).join('\n')}`);
  }
}

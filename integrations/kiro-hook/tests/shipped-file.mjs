// Reads a repository file the way it ships. In a git checkout that is the committed version
// (`git show HEAD:<path>`), so a working tree where `gate:on` has been run still tests what is
// committed. Without git, or when the file is not in HEAD, the file on disk is the answer.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} repoRoot absolute path of the repository root
 * @param {string} relPath path relative to the root, with `/` separators
 * @returns {string}
 */
export function shippedText(repoRoot, relPath) {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (resolve(top) === resolve(repoRoot)) {
      return execFileSync('git', ['show', `HEAD:${relPath}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }
  } catch {
    // No git, not a checkout, or the file is not committed: use the disk.
  }
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

/**
 * Parsed hook file with every hook entry's `enabled` removed, for comparing two versions.
 * @param {string} text
 * @returns {unknown}
 */
export function withoutEnabled(text) {
  const doc = JSON.parse(text);
  if (doc && Array.isArray(doc.hooks)) {
    doc.hooks = doc.hooks.map((/** @type {any} */ h) => {
      const { enabled: _enabled, ...rest } = h ?? {};
      return rest;
    });
  }
  return doc;
}

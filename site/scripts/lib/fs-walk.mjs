// Shared recursive file walker for the site scripts. Pure Node, no dependencies.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * List files under `root`, sorted by path, depth first. Directories named in `skipDirs` are not entered.
 * @param {string} root
 * @param {{ skipDirs?: readonly string[], accept?: (path: string, name: string) => boolean }} [options]
 * @returns {string[]}
 */
export function walkFiles(root, options = {}) {
  const skipDirs = new Set(options.skipDirs ?? ['node_modules']);
  const accept = options.accept ?? (() => true);
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const visit = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(full);
      } else if (entry.isFile() && accept(full, entry.name)) {
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

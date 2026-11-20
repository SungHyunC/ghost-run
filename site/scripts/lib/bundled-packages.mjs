// The third-party packages that end up in the Landing_Page bundle and its engine chunks.
// A Vite plugin reads the module graph of each Rollup bundle (the page, and every worker bundle) and records the
// package of each module that lives under node_modules. The page build writes the list to
// site/build/bundled-packages.json; the assembly writes the notices from it and the site check compares the two.
// First-party code (site/, apps/, worlds/, core/, ui/, wards-config/) is never under node_modules once the
// workspace links are resolved, so it never appears here.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MANIFEST_FORMAT = 'ghost-site-bundled-packages';

/**
 * The package a module id belongs to, or null when the id is not under node_modules.
 * Handles pnpm paths (`node_modules/.pnpm/x@1/node_modules/x/...`), scoped names, and `?query` suffixes.
 * @param {string} id a module id, a file path, or the original file name of an asset
 * @returns {{ name: string, dir: string } | null} `dir` is the package folder, posix, as far as the id shows it
 */
export function packageOfId(id) {
  const clean = id.replace(/\0/g, '').split('?')[0].replace(/\\/g, '/');
  const marker = '/node_modules/';
  const at = clean.lastIndexOf(marker) >= 0 ? clean.lastIndexOf(marker) + marker.length : clean.startsWith('node_modules/') ? 'node_modules/'.length : -1;
  if (at < 0) return null;
  const rest = clean.slice(at).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1] ?? ''}` : rest[0];
  if (name === '' || name === '.pnpm' || name.endsWith('/')) return null;
  const depth = rest[0].startsWith('@') ? 2 : 1;
  return { name, dir: `${clean.slice(0, at)}${rest.slice(0, depth).join('/')}` };
}

/** The ids of everything a Rollup bundle holds: module ids of chunks and original file names of assets. */
export function idsOfBundle(bundle) {
  const ids = [];
  for (const item of Object.values(bundle)) {
    if (item.type === 'chunk') {
      ids.push(...Object.keys(item.modules ?? {}));
    } else {
      ids.push(...(item.originalFileNames ?? []));
    }
  }
  return ids;
}

/** Packages found by every plugin instance of one build process, keyed by folder. */
const found = new Map();

/**
 * @param {{ out?: string, root?: string }} [options] `out` set: this instance writes the manifest when the page build closes
 * @returns {import('vite').Plugin}
 */
export function bundledPackages(options = {}) {
  // Relative ids (the original file names of assets) are relative to the Vite root.
  let viteRoot = process.cwd();
  return {
    name: 'ghost-run-site-bundled-packages',
    apply: 'build',
    configResolved(config) {
      viteRoot = config.root;
    },
    generateBundle(_outputOptions, bundle) {
      for (const id of idsOfBundle(bundle)) {
        const pkg = packageOfId(id);
        if (pkg === null) continue;
        const dir = path.isAbsolute(pkg.dir) ? pkg.dir : path.resolve(viteRoot, pkg.dir);
        found.set(dir, pkg.name);
      }
    },
    closeBundle() {
      if (options.out === undefined) return;
      const repoRoot = options.root ?? process.cwd();
      const packages = [...found.entries()].map(([dir, name]) => {
        const json = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
        return {
          name,
          version: String(json.version ?? ''),
          license: typeof json.license === 'string' ? json.license : '',
          dir: path.relative(repoRoot, dir).split(path.sep).join('/'),
        };
      });
      packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1));
      mkdirSync(path.dirname(options.out), { recursive: true });
      writeFileSync(options.out, `${JSON.stringify({ format: MANIFEST_FORMAT, version: 1, packages }, null, 2)}\n`);
      found.clear();
    },
  };
}

/**
 * @param {string} file
 * @returns {{ name: string, version: string, license: string, dir: string }[]}
 */
export function readManifest(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed.format !== MANIFEST_FORMAT || !Array.isArray(parsed.packages)) {
    throw new Error(`${file} is not a ${MANIFEST_FORMAT} file`);
  }
  return parsed.packages;
}

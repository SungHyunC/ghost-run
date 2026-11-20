// Build_Script: assembles site/dist/ from the Landing_Page build and the three app builds.
// Usage (from site/): node scripts/build-site.mjs [--landing-only] [--record]
// Writes only site/dist/, site/build/dist/, and site/src/data/. Edits no app build. Makes no network call.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from './lib/bundled-packages.mjs';
import { buildRootHeaders } from './lib/headers.mjs';
import { renderNotices } from './lib/notices.mjs';
import { renderWorldSizeFile } from './world-size.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

/** Source checks: path (relative to the repo root, posix) and the package that builds it. */
const SOURCES = [
  { dir: 'apps/ghost-shell/dist', pkg: '@ghost-run/ghost-shell' },
  { dir: 'apps/ghost-hand/dist', pkg: '@ghost-run/ghost-hand' },
  { dir: 'ui/dist', pkg: '@ghost-run/ui' },
  { dir: 'site/build/dist', pkg: '@ghost-run/site' },
];

/** The five targets: source folder, target folder in site/dist/ (posix, '' is the root). */
const COPIES = [
  { from: 'site/build/dist', to: '', label: '/' },
  { from: 'apps/ghost-shell/dist', to: 'shell', label: '/shell/' },
  { from: 'apps/ghost-hand/dist', to: 'hand', label: '/hand/' },
  { from: 'ui/dist', to: 'kit', label: '/kit/' },
];

/**
 * The third-party notice at the root of site/dist/ (site-live Requirement 18, criterion 3). The site writes it
 * itself from the list of packages that the landing build found in its bundle and engine chunks.
 */
const NOTICE = { to: 'THIRD_PARTY_NOTICES.txt', manifest: 'site/build/bundled-packages.json' };

class StepError extends Error {}

function missing(path, pkg) {
  return new StepError(`missing build output: ${path} (build it with: corepack pnpm --filter ${pkg} build)`);
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Counts regular files below a folder (symlinks are not followed), skipping .DS_Store. */
function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n += 1;
  }
  return n;
}

function reason(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Default step implementations. Tests replace them through `deps`. */
const defaultDeps = {
  worldSize(root) {
    const path = join(root, 'site', 'src', 'data', 'world-size.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderWorldSizeFile(root));
  },
  async buildLanding(root) {
    const { build } = await import('vite');
    await build({ root: join(root, 'site'), logLevel: 'warn' });
  },
  record(root) {
    const r = spawnSync(process.execPath, [join(root, 'site', 'scripts', 'record-runs.mjs')], { cwd: join(root, 'site'), encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${r.stderr ?? ''}${r.stdout ?? ''}`.trim() || `exit code ${String(r.status)}`);
  },
  cpSync,
  /** Writes the notices file of the landing bundle: one section per bundled package, plus the MuJoCo components. */
  writeNotices(root, target) {
    const manifest = join(root, NOTICE.manifest);
    if (!isFile(manifest)) throw new StepError(`missing build output: ${NOTICE.manifest} (build it with: corepack pnpm --filter @ghost-run/site build)`);
    writeFileSync(target, renderNotices({ root, packages: readManifest(manifest) }));
  },
};

function checkSources(root) {
  for (const { dir, pkg } of SOURCES) {
    const abs = join(root, dir);
    if (!isDir(abs) || readdirSync(abs).length === 0) throw missing(dir, pkg);
    if (!isFile(join(abs, 'index.html'))) throw missing(`${dir}/index.html`, pkg);
  }
  const shell = SOURCES[0];
  for (const name of ['ko.html', '_headers']) {
    if (!isFile(join(root, shell.dir, name))) throw missing(`${shell.dir}/${name}`, shell.pkg);
  }
  const hand = SOURCES[1];
  const assets = join(root, hand.dir, 'assets');
  const hasWasm = isDir(assets) && readdirSync(assets).some((n) => n.endsWith('.wasm'));
  if (!hasWasm) throw missing(`${hand.dir}/assets (no .wasm file)`, hand.pkg);
}

/**
 * @param {{ root: string, flags?: { landingOnly?: boolean, record?: boolean }, deps?: Partial<typeof defaultDeps> }} options
 * @returns {Promise<{ exitCode: number, lines: string[], errors: string[] }>}
 */
export async function buildSite({ root, flags = {}, deps = {} }) {
  const d = { ...defaultDeps, ...deps };
  const lines = [];
  const errors = [];
  const distDir = join(root, 'site', 'dist');
  const fail = (message) => {
    errors.push(message);
    return { exitCode: 1, lines, errors };
  };

  try {
    await d.worldSize(root);
  } catch (error) {
    return fail(`world-size failed: ${reason(error)}`);
  }
  try {
    await d.buildLanding(root);
  } catch (error) {
    return fail(reason(error));
  }
  if (flags.landingOnly) {
    lines.push('landing page built: site/build/dist/');
    return { exitCode: 0, lines, errors };
  }
  if (flags.record) {
    try {
      await d.record(root);
    } catch (error) {
      return fail(`record-runs failed: ${reason(error)}`);
    }
    try {
      await d.buildLanding(root);
    } catch (error) {
      return fail(reason(error));
    }
  }

  try {
    checkSources(root);
  } catch (error) {
    return fail(reason(error));
  }

  const shellHeadersPath = 'apps/ghost-shell/dist/_headers';
  let rootHeaders;
  try {
    rootHeaders = buildRootHeaders(readFileSync(join(root, shellHeadersPath), 'utf8'));
  } catch (error) {
    return fail(`cannot read headers: ${shellHeadersPath} (${reason(error)})`);
  }

  let step = 'site/dist';
  try {
    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(distDir, { recursive: true });
    for (const copy of COPIES) {
      step = copy.from;
      d.cpSync(join(root, copy.from), join(distDir, copy.to), {
        recursive: true,
        dereference: false,
        filter: (src) => !src.endsWith('.DS_Store'),
      });
    }
    step = NOTICE.to;
    d.writeNotices(root, join(distDir, NOTICE.to));
    step = 'site/dist/shell/_headers';
    rmSync(join(distDir, 'shell', '_headers'), { force: true });
    step = 'site/dist/_headers';
    writeFileSync(join(distDir, '_headers'), rootHeaders);
    for (const copy of COPIES) {
      lines.push(`${copy.label} ${String(countFiles(join(root, copy.from)) - (copy.to === 'shell' ? 1 : 0))} files`);
    }
    lines.push('/_headers 1 file');
    lines.push(`/${NOTICE.to} 1 file`);
  } catch (error) {
    rmSync(distDir, { recursive: true, force: true });
    return fail(`copy failed: ${step} (${reason(error)})`);
  }
  return { exitCode: 0, lines, errors };
}

async function main(argv) {
  const flags = { landingOnly: false, record: false };
  for (const arg of argv) {
    if (arg === '--landing-only') flags.landingOnly = true;
    else if (arg === '--record') flags.record = true;
    else {
      process.stderr.write(`unknown argument: ${arg}\nUsage: build-site.mjs [--landing-only] [--record]\n`);
      return 2;
    }
  }
  const result = await buildSite({ root: REPO_ROOT, flags });
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  for (const line of result.errors) process.stderr.write(`${line}\n`);
  return result.exitCode;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}

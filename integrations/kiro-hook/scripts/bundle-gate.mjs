// Builds the self-contained gate bundle that `integrations/power/install-gate.mjs` copies into a project.
// Four ES-module files, each started by `node <file>` with no node_modules next to it:
//   ghost-gate.mjs     the bootstrap: hook-io, the gate constants, the watchdog. It loads gate-main.mjs with a dynamic
//                      import inside try/catch, so a missing or broken gate-main.mjs still exits 2 (fail closed).
//   gate-main.mjs      the real gate (lib/gate/main.mjs) with core, ghost-runner, and wards-config bundled in.
//   docker-warmup.mjs  the warm-up hook.
//   seance.mjs         the seance viewer; the gate's seance auto-start starts it from the folder of gate-main.mjs.
// `buildGate(outDir)` can write to any folder, so a test can rebuild into a temp folder and compare bytes.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOOK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(HOOK_DIR, '..', '..');

export const DEFAULT_OUT_DIR = resolve(REPO_ROOT, 'integrations', 'power', 'gate');

/** Output file name of the real gate; the bootstrap imports it by this name. */
export const GATE_MAIN_FILE = 'gate-main.mjs';

// CommonJS packages inside a bundle (for example `shell-quote`) call `require`; an ES module has none.
const BANNER = [
  "import { createRequire as __ghostRunCreateRequire } from 'node:module';",
  'const require = __ghostRunCreateRequire(import.meta.url);',
].join('\n');

/**
 * In the bootstrap, `./lib/gate/main.mjs` stays a runtime import of the neighbour file.
 * @type {import('esbuild').Plugin}
 */
const keepGateMainExternal = {
  name: 'keep-gate-main-external',
  setup(b) {
    b.onResolve({ filter: /[\\/]lib[\\/]gate[\\/]main\.mjs$/ }, () => ({ path: `./${GATE_MAIN_FILE}`, external: true }));
  },
};

/** @type {{ entry: string, out: string, banner: boolean, plugins: import('esbuild').Plugin[] }[]} */
const TARGETS = [
  { entry: 'ghost-gate.mjs', out: 'ghost-gate.mjs', banner: false, plugins: [keepGateMainExternal] },
  { entry: 'lib/gate/main.mjs', out: GATE_MAIN_FILE, banner: true, plugins: [] },
  { entry: 'docker-warmup.mjs', out: 'docker-warmup.mjs', banner: true, plugins: [] },
  { entry: 'seance.mjs', out: 'seance.mjs', banner: true, plugins: [] },
];

/** @type {readonly string[]} */
export const GATE_FILES = TARGETS.map((t) => t.out);

/**
 * @param {string} [outDir] default: `integrations/power/gate`
 * @returns {Promise<string[]>} the absolute paths written
 */
export async function buildGate(outDir = DEFAULT_OUT_DIR) {
  const dir = resolve(outDir);
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const target of TARGETS) {
    const out = resolve(dir, target.out);
    const result = await build({
      // absWorkingDir keeps the `// path` comments in the output relative to the repository root.
      absWorkingDir: REPO_ROOT,
      entryPoints: [resolve(HOOK_DIR, target.entry)],
      outfile: out,
      write: false,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      ...(target.banner ? { banner: { js: BANNER } } : {}),
      plugins: target.plugins,
      sourcemap: false,
      legalComments: 'none',
      minify: false,
      charset: 'ascii',
      logLevel: 'warning',
      metafile: false,
    });
    // `charset: 'ascii'` leaves non-ASCII text inside comments of bundled dependencies. Escape what is left
    // so the committed files hold only ASCII.
    const text = result.outputFiles[0].text.replace(/[^\x00-\x7F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    await writeFile(out, text, 'utf8');
    written.push(out);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const written = await buildGate(process.argv[2]);
  for (const file of written) process.stdout.write(`gate bundle written: ${file}\n`);
}

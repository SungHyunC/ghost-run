// Builds the single-file ES-module server bundle for the Kiro power.
// `buildBundle(outFile)` can write to any path, so a test can rebuild into a temp folder and compare bytes.
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(MCP_DIR, '..', '..');

export const BOX_SOURCE_DIR = resolve(REPO_ROOT, 'ghost-runner', 'box');
export const DEFAULT_BOX_DEST = resolve(REPO_ROOT, 'integrations', 'power', 'box');
export const DEFAULT_OUT_FILE = resolve(REPO_ROOT, 'integrations', 'power', 'server', 'ghost-run-mcp.mjs');

// CommonJS packages inside the bundle (for example `shell-quote`) call `require`; an ES module has none.
const BANNER = [
  "import { createRequire as __ghostRunCreateRequire } from 'node:module';",
  'const require = __ghostRunCreateRequire(import.meta.url);',
].join('\n');

/**
 * @param {string} [outFile] absolute or relative output path (default: the committed power bundle)
 * @returns {Promise<string>} the absolute output path
 */
export async function buildBundle(outFile = DEFAULT_OUT_FILE) {
  const out = resolve(outFile);
  const result = await build({
    // absWorkingDir keeps the `// path` comments in the output relative to the repository root.
    absWorkingDir: REPO_ROOT,
    entryPoints: [resolve(MCP_DIR, 'bin', 'ghost-run-mcp.mjs')],
    outfile: out,
    write: false,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    banner: { js: BANNER },
    sourcemap: false,
    legalComments: 'none',
    minify: false,
    charset: 'ascii',
    logLevel: 'warning',
    metafile: false,
  });
  // `charset: 'ascii'` escapes strings and identifiers but leaves non-ASCII text inside comments of
  // bundled dependencies. Escape what is left so the committed bundle holds only ASCII.
  const text = result.outputFiles[0].text.replace(/[^\x00-\x7F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, text, 'utf8');
  return out;
}

/**
 * Copy the box sources (Dockerfile, BASE_DIGEST, build.mjs, recorder/) byte for byte, so the image tag
 * (a hash of those files) is the same as for `ghost-runner/box`. Local-only `*.local` files are not copied.
 * @param {string} [destDir] default: `integrations/power/box`
 * @param {string} [sourceDir] default: `ghost-runner/box`
 * @returns {Promise<string>} the destination folder
 */
export async function copyBox(destDir = DEFAULT_BOX_DEST, sourceDir = BOX_SOURCE_DIR) {
  const dest = resolve(destDir);
  await rm(dest, { recursive: true, force: true });
  await cp(sourceDir, dest, { recursive: true, filter: (src) => !src.endsWith('.local') });
  return dest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  const written = await buildBundle(target);
  process.stdout.write(`bundle written: ${written}\n`);
  if (target === undefined) process.stdout.write(`box sources copied: ${await copyBox()}\n`);
}

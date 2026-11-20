// World_Size_Script: counts the non-blank lines of the non-test, non-declaration .ts files
// below worlds/<name>/src/ and writes site/src/data/world-size.json.
// Reads files only. Writes only the World_Size_File, and only with --write.
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORLD_NAMES = ['ghost-cloud', 'playground-shell', 'drawer-arm'];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SITE_DIR, '..');
export const WORLD_SIZE_PATH = join(SITE_DIR, 'src', 'data', 'world-size.json');

/** Counted files: `.ts`, not `*.test.ts`, not `*.d.ts`. */
function isCounted(name) {
  return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts');
}

/** Recursive walk in sorted order; returns absolute paths of counted files. */
function walk(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && isCounted(entry.name)) out.push(full);
  }
  return out;
}

function countLines(text) {
  let n = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim() !== '') n += 1;
  }
  return n;
}

/**
 * @param {string} root repository root (the folder that holds `worlds/`)
 * @returns {Record<string, number>} counts with sorted keys
 */
export function countWorldSizes(root) {
  const counts = {};
  for (const name of [...WORLD_NAMES].sort()) {
    let total = 0;
    for (const file of walk(join(root, 'worlds', name, 'src'))) {
      total += countLines(readFileSync(file, 'utf8'));
    }
    counts[name] = total;
  }
  return counts;
}

/** The exact text of the World_Size_File for a repository root. */
export function renderWorldSizeFile(root) {
  const file = { format: 'ghost-site-world-size', version: 1, worlds: countWorldSizes(root) };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function main(argv) {
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  if (write === check) {
    process.stderr.write('Usage: world-size.mjs --write | --check\n');
    return 2;
  }
  const text = renderWorldSizeFile(REPO_ROOT);
  if (write) {
    writeFileSync(WORLD_SIZE_PATH, text);
    process.stdout.write(text);
    return 0;
  }
  let current = null;
  try {
    current = readFileSync(WORLD_SIZE_PATH, 'utf8');
  } catch {
    current = null;
  }
  if (current === text) return 0;
  process.stderr.write('world-size.json is out of date. Run: pnpm --filter @ghost-run/site exec node scripts/world-size.mjs --write\n');
  return 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}

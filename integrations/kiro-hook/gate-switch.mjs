// One-command switch for the gate: flips `enabled` in the hook entries of
// ghost-gate.json and docker-warmup.json, and nothing else.
//
//   node integrations/kiro-hook/gate-switch.mjs on|off|status [--hooks-dir=<folder>]
//
// Run by a human. The gate itself never reads this script's state.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_FILES = ['ghost-gate.json', 'docker-warmup.json'];
/** @type {Record<string, number>} */
const EXPECTED_ENTRIES = { 'ghost-gate.json': 2, 'docker-warmup.json': 1 };
const ENABLED_LINE = /^(\s*"enabled":\s*)(true|false)(\s*,?\s*)$/;

export class GateSwitchError extends Error {}

/**
 * Read one hook file and return its lines, the line numbers of `enabled`, and its states.
 * @param {string} dir
 * @param {string} name
 */
function inspect(dir, name) {
  const file = join(dir, name);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new GateSwitchError(`Cannot read ${file}: the file is missing. Nothing was changed.`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GateSwitchError(`${file} is not valid JSON. Nothing was changed.`);
  }
  const hooks = json && Array.isArray(json.hooks) ? json.hooks : null;
  if (
    !hooks ||
    hooks.length !== EXPECTED_ENTRIES[name] ||
    hooks.some((/** @type {any} */ h) => !h || typeof h.enabled !== 'boolean')
  ) {
    throw new GateSwitchError(
      `${file} is malformed: expected ${EXPECTED_ENTRIES[name]} hook entries, each with a boolean "enabled". Nothing was changed.`,
    );
  }
  const lines = text.split('\n');
  const idx = lines.map((l, i) => (ENABLED_LINE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== hooks.length) {
    throw new GateSwitchError(
      `${file} has an unexpected layout: could not find one "enabled" line per entry. Nothing was changed.`,
    );
  }
  return { file, lines, idx, states: hooks.map((/** @type {any} */ h) => h.enabled) };
}

/** @param {{file: string, states: boolean[]}[]} all */
function describe(all) {
  return all
    .map(({ file, states }) => `  ${file}: ${states.map((/** @type {boolean} */ s) => (s ? 'on' : 'off')).join(', ')}`)
    .join('\n');
}

/**
 * Run the switch. Returns the printable state before and after, and whether a file changed.
 * Every file is validated before any file is written.
 * @param {string | undefined} mode
 * @param {string} hooksDir
 */
export function runGateSwitch(mode, hooksDir) {
  if (!mode || !['on', 'off', 'status'].includes(mode)) {
    throw new GateSwitchError(`Unknown mode "${mode}". Use on, off, or status.`);
  }
  const dir = resolve(hooksDir);
  const all = GATE_FILES.map((name) => inspect(dir, name));
  const before = describe(all);
  if (mode === 'status') return { before, after: before, changed: false };
  const want = mode === 'on';
  let changed = false;
  for (const f of all) {
    if (f.states.every((/** @type {boolean} */ s) => s === want)) continue;
    for (const i of f.idx) {
      f.lines[i] = f.lines[i].replace(ENABLED_LINE, `$1${want}$3`);
    }
    writeFileSync(f.file, f.lines.join('\n'));
    changed = true;
  }
  const after = describe(GATE_FILES.map((name) => inspect(dir, name)));
  return { before, after, changed };
}

/** @param {string[]} argv */
function main(argv) {
  const mode = argv.find((a) => !a.startsWith('--'));
  const opt = argv.find((a) => a.startsWith('--hooks-dir='));
  const defaultDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.kiro', 'hooks');
  try {
    const { before, after, changed } = runGateSwitch(
      mode,
      opt ? opt.slice('--hooks-dir='.length) : defaultDir,
    );
    if (mode === 'status') {
      console.log(`Gate state:\n${before}`);
      return 0;
    }
    console.log(`Before:\n${before}`);
    console.log(`After:\n${after}`);
    if (!changed) console.log(`Already ${mode}. Nothing changed.`);
    if (changed && mode === 'on') console.log('Start a new Kiro session for the change to apply.');
    return 0;
  } catch (e) {
    if (e instanceof GateSwitchError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

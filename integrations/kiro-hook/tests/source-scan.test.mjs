// Source-scan tests (task 2.5). The scan walks integrations/kiro-hook and
// integrations/mcp and does not name files, except for the explicit
// exemptions in EXEMPT below. It works on source text with a small comment
// stripper and regular expressions; it never executes the scanned code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCAN_ROOTS = ['integrations/kiro-hook', 'integrations/mcp'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests']);

const HOOK = 'integrations/kiro-hook/';
const PROBE = `${HOOK}probe-host-facts.mjs`;
const EXP_B = `${HOOK}exp-b-gate.mjs`;
const PBT_RUN = `${HOOK}lib/pbt/run.mjs`;
const GATE_MAIN = `${HOOK}lib/gate/main.mjs`;
const WATCHDOG = `${HOOK}lib/gate/watchdog.mjs`;
const GATE_ENTRY = `${HOOK}ghost-gate.mjs`;
const GHOST_STORE = `${HOOK}lib/store/ghost-store.mjs`;
const STORE_DIR = `${HOOK}lib/store/`;
const GATE_DIR = `${HOOK}lib/gate/`;
const ALLOWED_ENV = new Set(['GHOST_RUN_WARDS_FILE', 'GHOST_RUN_SEANCE_BASE']);

/** Exemptions. The probe is exempt from the Date and child_process checks
 *  per task 2.5. It is also exempt from the .ghost-run write check because
 *  it legitimately writes its events under .ghost-run/probe. exp-b-gate.mjs
 *  is retired and only the "nobody imports it" rule applies to it. */
const EXEMPT = {
  child_process: (/** @type {string} */ p) => p === PBT_RUN || p === PROBE || p === WATCHDOG,
  date: (/** @type {string} */ p) => p.startsWith(STORE_DIR) || p === GATE_MAIN || p === PROBE,
  bareEnv: (/** @type {string} */ p) => p === PBT_RUN,
  ghostRunWrite: (/** @type {string} */ p) => p === GHOST_STORE || p === PROBE,
  wholeFile: (/** @type {string} */ p) => p === EXP_B,
};

/**
 * Remove comments, keeping string and template contents and line numbers.
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  let lastSignificant = '';
  const regexPrev = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      out += ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      lastSignificant = c;
    } else if (c === '/' && regexPrev.has(lastSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '\\') j += 1;
        else if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        else if (text[j] === '/' && !inClass) break;
        j += 1;
      }
      // Regex literals are blanked so quotes inside them cannot desync us.
      out += '/RE/';
      i = j + 1;
      lastSignificant = '/';
    } else {
      out += c;
      if (!/\s/.test(c)) lastSignificant = c;
      i += 1;
    }
  }
  return out;
}

/**
 * Text of the first argument of the call whose "(" is at openIndex.
 * @param {string} code
 * @param {number} openIndex
 * @returns {string}
 */
function firstArgument(code, openIndex) {
  let depth = 0;
  let quote = '';
  for (let i = openIndex + 1; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return code.slice(openIndex + 1, i);
      depth -= 1;
    } else if (c === ',' && depth === 0) return code.slice(openIndex + 1, i);
  }
  return code.slice(openIndex + 1);
}

const FS_WRITE_CALL =
  /(?:\b(?:fs|fsp|fsPromises|promises)\s*\.\s*|(?<![.\w]))(writeFile|writeFileSync|appendFile|appendFileSync|writeSync|createWriteStream|write)\s*\(/g;
const COMMAND_IDENT = /\b(?:command|cmd|commandText|commandString|cmdline)\b/i;

/**
 * Scan one source file.
 * @param {{ path: string, text: string }} file path is repo-relative, posix.
 * @returns {{ rule: string, detail: string }[]}
 */
export function scanSource({ path, text }) {
  /** @type {{ rule: string, detail: string }[]} */
  const found = [];
  const add = (/** @type {string} */ rule, /** @type {string} */ detail) => found.push({ rule, detail });
  const code = stripComments(text);

  const importsExpB = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])[^'"`]*exp-b-gate(?:\.mjs)?\1/;
  if (importsExpB.test(code)) add('exp-b-import', 'imports exp-b-gate');
  if (EXEMPT.wholeFile(path)) return found;

  if (/\bfetch\s*\(/.test(code)) add('network', 'fetch(');
  if (/(['"`])(?:node:)?(?:http|https|http2|net|dgram|tls)\1/.test(code)) add('network', 'network module import');
  if (/\bWebSocket\b/.test(code)) add('network', 'WebSocket');
  if (/\bXMLHttpRequest\b/.test(code)) add('network', 'XMLHttpRequest');

  if (/(?<![.\w])eval\s*\(/.test(code)) add('dynamic-code', 'eval');
  if (/\bnew\s+Function\b/.test(code)) add('dynamic-code', 'new Function');
  for (const m of code.matchAll(/(?<![.\w])import\s*\(\s*([^)]*)\)?/g)) {
    const literal = /^\s*(['"])([^'"`$]*)\1\s*$/.exec(m[1]);
    if (!literal) add('dynamic-import', `non-literal import(${m[1].trim()})`);
    else if (path === GATE_ENTRY && literal[2] !== './lib/gate/main.mjs') {
      add('dynamic-import', `ghost-gate.mjs may only import ./lib/gate/main.mjs, not ${literal[2]}`);
    }
  }

  if (!EXEMPT.child_process(path) && /(['"`])(?:node:)?child_process\1/.test(code)) {
    add('child_process', 'child_process outside lib/pbt/run.mjs and the probe');
  }

  for (const m of code.matchAll(
    /\bprocess\s*\.\s*env\b(?:\s*\.\s*([A-Za-z_]\w*)|\s*\[\s*(['"`])([^'"`]*)\2\s*\])?/g,
  )) {
    const name = m[1] ?? m[3];
    if (name === undefined) {
      if (!EXEMPT.bareEnv(path)) add('process-env', 'bare process.env');
    } else if (!ALLOWED_ENV.has(name)) add('process-env', `process.env.${name}`);
  }

  if (!EXEMPT.date(path) && /\bDate\b/.test(code)) add('date', 'Date outside lib/store, gate main, probe');

  if (path.startsWith(GATE_DIR) && /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])[^'"`]*provenance(?:\.mjs)?\1/.test(code)) {
    add('gate-provenance', 'lib/gate imports lib/store/provenance.mjs');
  }

  const writeCalls = [...code.matchAll(FS_WRITE_CALL)];
  if (!EXEMPT.ghostRunWrite(path) && writeCalls.length > 0 && /\.ghost-run/.test(code)) {
    add('ghost-run-write', 'fs write in a module that names .ghost-run');
  }
  for (const m of writeCalls) {
    const arg = firstArgument(code, m.index + m[0].length - 1);
    if (COMMAND_IDENT.test(arg)) add('command-path-write', `${m[1]}(${arg.trim()})`);
  }
  return found;
}

/**
 * @param {string} absDir
 * @param {string[]} out
 */
function walk(absDir, out) {
  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    const abs = join(absDir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs, out);
    } else if (name.endsWith('.mjs')) out.push(abs);
  }
}

function collectFiles() {
  /** @type {string[]} */
  const abs = [];
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root), abs);
  return abs.map((a) => ({
    path: relative(repoRoot, a).split(sep).join('/'),
    text: readFileSync(a, 'utf8'),
  }));
}

const rules = (/** @type {{ path: string, text: string }} */ file) => scanSource(file).map((v) => v.rule);

describe('source scan of the current tree', () => {
  const files = collectFiles();

  it('finds at least the probe script', () => {
    expect(files.map((f) => f.path)).toContain(PROBE);
  });

  it('reports no violations', () => {
    const violations = files.flatMap((f) => scanSource(f).map((v) => `${f.path}: ${v.rule}: ${v.detail}`));
    expect(violations).toEqual([]);
  });
});

describe('scanner rules fire on violating snippets', () => {
  const at = (/** @type {string} */ path, /** @type {string} */ text) => rules({ path: `${HOOK}${path}`, text });

  it('flags network primitives', () => {
    expect(at('lib/a.mjs', 'await fetch(url);')).toContain('network');
    expect(at('lib/a.mjs', "import h from 'node:https';")).toContain('network');
    expect(at('lib/a.mjs', "import n from 'node:net';")).toContain('network');
    expect(at('lib/a.mjs', "import d from 'node:dgram';")).toContain('network');
    expect(at('lib/a.mjs', 'new WebSocket(u);')).toContain('network');
    expect(at('lib/a.mjs', 'new XMLHttpRequest();')).toContain('network');
  });

  it('flags eval, new Function, and non-literal dynamic import', () => {
    expect(at('lib/a.mjs', 'eval(x);')).toContain('dynamic-code');
    expect(at('lib/a.mjs', 'new Function("return 1");')).toContain('dynamic-code');
    expect(at('lib/a.mjs', 'await import(name);')).toContain('dynamic-import');
    expect(at('lib/a.mjs', 'await import(`./${name}.mjs`);')).toContain('dynamic-import');
    expect(at('lib/a.mjs', "await import('./b.mjs');")).toEqual([]);
    expect(at('ghost-gate.mjs', "await import('./lib/gate/main.mjs');")).toEqual([]);
    expect(at('ghost-gate.mjs', "await import('./lib/other.mjs');")).toContain('dynamic-import');
  });

  it('flags child_process outside the exempt files', () => {
    const text = "import { spawn } from 'node:child_process';";
    expect(at('lib/a.mjs', text)).toContain('child_process');
    expect(at('lib/pbt/run.mjs', text)).not.toContain('child_process');
    expect(at('probe-host-facts.mjs', text)).not.toContain('child_process');
    expect(at('lib/gate/watchdog.mjs', text)).not.toContain('child_process');
  });

  it('flags process.env reads except the two allowed names', () => {
    expect(at('lib/a.mjs', 'const a = process.env.HOME;')).toContain('process-env');
    expect(at('lib/a.mjs', "const a = process.env['PATH'];")).toContain('process-env');
    expect(at('lib/a.mjs', 'const a = { ...process.env };')).toContain('process-env');
    expect(at('lib/a.mjs', 'const a = process.env.GHOST_RUN_WARDS_FILE;')).toEqual([]);
    expect(at('lib/a.mjs', "const a = process.env['GHOST_RUN_SEANCE_BASE'];")).toEqual([]);
    expect(at('lib/pbt/run.mjs', 'const e = { ...process.env, GHOST_PBT_MODE: "x" };')).not.toContain('process-env');
  });

  it('flags Date outside the exempt locations', () => {
    expect(at('lib/a.mjs', 'const t = Date.now();')).toContain('date');
    expect(at('lib/a.mjs', 'const t = new Date();')).toContain('date');
    expect(at('lib/store/x.mjs', 'const t = Date.now();')).toEqual([]);
    expect(at('lib/gate/main.mjs', 'const t = Date.now();')).toEqual([]);
    expect(at('probe-host-facts.mjs', 'const t = Date.now();')).toEqual([]);
  });

  it('flags any import of exp-b-gate.mjs', () => {
    expect(at('lib/a.mjs', "import x from '../exp-b-gate.mjs';")).toContain('exp-b-import');
    expect(at('lib/a.mjs', "await import('./exp-b-gate.mjs');")).toContain('exp-b-import');
    expect(rules({ path: 'integrations/mcp/server.mjs', text: "import '../kiro-hook/exp-b-gate.mjs';" })).toContain(
      'exp-b-import',
    );
  });

  it('flags lib/gate modules that import provenance', () => {
    const text = "import { p } from '../store/provenance.mjs';";
    expect(at('lib/gate/x.mjs', text)).toContain('gate-provenance');
    expect(at('lib/other/x.mjs', text)).not.toContain('gate-provenance');
  });

  it('flags writes under .ghost-run outside ghost-store.mjs', () => {
    const text = "fs.writeFileSync(path.join(root, '.ghost-run', 'x.json'), data);";
    expect(at('lib/a.mjs', text)).toContain('ghost-run-write');
    expect(at('lib/store/ghost-store.mjs', text)).toEqual([]);
    expect(at('probe-host-facts.mjs', text)).toEqual([]);
    expect(at('lib/a.mjs', "const dir = '.ghost-run';")).toEqual([]);
  });

  it('flags fs.write calls whose path comes from a command string', () => {
    expect(at('lib/a.mjs', 'fs.writeFileSync(command.split(" ")[1], d);')).toContain('command-path-write');
    expect(at('lib/a.mjs', 'await fsp.appendFile(input.tool_input.command, d);')).toContain('command-path-write');
    expect(at('lib/a.mjs', 'fs.writeFileSync(target, command);')).toEqual([]);
    expect(at('lib/a.mjs', 'process.stdout.write(command);')).toEqual([]);
  });

  it('ignores comments but still reads string contents', () => {
    expect(at('lib/a.mjs', '// fetch(url) and Date.now() and eval(x)\n/* new Function */ const a = 1;')).toEqual([]);
    expect(at('lib/a.mjs', 'const re = /[\'"]/g; const t = Date.now();')).toContain('date');
  });

  it('skips every rule except the import ban for exp-b-gate.mjs', () => {
    expect(rules({ path: EXP_B, text: 'eval(x); Date.now(); fetch(u);' })).toEqual([]);
  });
});

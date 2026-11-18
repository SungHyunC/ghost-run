// Safe list (Requirement 4): a grammar, a hand-written tokenizer, and a pure classifier.
// No I/O. Any line that cannot be proven safe is "not safe" and goes to the ghost.

import { compilePathSet, normalizePath } from '@ghost-run/core';

/**
 * @typedef {object} GrammarEntry
 * @property {string[]} name Command words, e.g. ['ls'] or ['git', 'status'].
 * @property {readonly string[]} options Listed options (exact words).
 * @property {readonly string[]} [intOptions] Options that take one integer word.
 * @property {'none'|'words'|'after--'} paths Where path words are allowed.
 * @property {'words'} [extra] Free word arguments (echo).
 * @property {boolean} [secretCheck] Test path words against the secret patterns (default true).
 */

/** @typedef {{ test(path: string): { matched: boolean, escapes?: boolean } }} SecretMatcher */
/** @typedef {{ safe: boolean, entry?: GrammarEntry }} SafeResult */

/** @type {readonly GrammarEntry[]} */
export const BUILTIN_GRAMMAR = Object.freeze([
  { name: ['pwd'], options: [], paths: 'none' },
  { name: ['ls'], options: ['-a', '-l', '-la', '-al'], paths: 'words', secretCheck: false },
  { name: ['cat'], options: [], paths: 'words', secretCheck: true },
  { name: ['head'], options: [], intOptions: ['-n'], paths: 'words', secretCheck: true },
  { name: ['tail'], options: [], intOptions: ['-n'], paths: 'words', secretCheck: true },
  { name: ['wc'], options: ['-l', '-w', '-c'], paths: 'words', secretCheck: true },
  { name: ['git', 'status'], options: [], paths: 'none' },
  { name: ['git', 'diff'], options: [], paths: 'after--', secretCheck: true },
  { name: ['git', 'log'], options: [], paths: 'after--', secretCheck: false },
  { name: ['git', 'show'], options: [], paths: 'none', secretCheck: true },
  { name: ['git', 'branch'], options: [], paths: 'none' },
  { name: ['echo'], options: [], paths: 'none', extra: 'words' },
]);

// Same ranges as the hidden ranges of core's `hasHiddenChar`, which the core public entry does not export.
const HIDDEN_RANGES = [
  [0x0000, 0x001f],
  [0x007f, 0x007f],
  [0x200b, 0x200d],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xe0000, 0xe007f],
];

/** @param {string} s */
function hasHidden(s) {
  for (const ch of s) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    for (const [lo, hi] of HIDDEN_RANGES) {
      if (cp >= /** @type {number} */ (lo) && cp <= /** @type {number} */ (hi)) return true;
    }
  }
  return false;
}

const FORBIDDEN_CHARS = new Set([';', '&', '|', '<', '>', '`', '$', '\\']);

/** @param {string} s */
function hasForbiddenChar(s) {
  for (const ch of s) if (FORBIDDEN_CHARS.has(ch)) return true;
  return false;
}

const FORBIDDEN_COMMAND_NAMES = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'ash', 'busybox',
  'env', 'xargs', 'sudo', 'su', 'doas', 'eval', 'exec', 'source', '.', 'time', 'nice', 'nohup',
  'watch', 'timeout', 'command', 'builtin', 'find', 'awk', 'gawk', 'sed', 'tee', 'dd', 'make',
  'node', 'nodejs', 'deno', 'bun', 'python', 'python2', 'python3', 'perl', 'ruby', 'php', 'lua',
  'npx', 'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'cargo', 'go', 'java', 'ssh', 'scp', 'curl', 'wget',
  'nc', 'ncat', 'rm', 'mv', 'cp', 'cmd', 'powershell', 'pwsh',
]);

const MAX_EXTENSION_ENTRIES = 256;

/**
 * Validate one extension entry from `safeCommands`. Returns a list of problems (empty when valid).
 * @param {unknown} entry
 * @returns {string[]}
 */
export function validateExtensionEntry(entry) {
  /** @type {string[]} */
  const problems = [];
  if (typeof entry !== 'object' || entry === null) return ['entry must be an object'];
  const e = /** @type {Record<string, unknown>} */ (entry);
  const name = e['name'];
  if (!Array.isArray(name) || name.length < 1 || name.length > 2 || !name.every((w) => typeof w === 'string' && w.length > 0)) {
    return ['name must be a list of one or two non-empty words'];
  }
  for (const w of name) {
    if (/[\s'"*?[~/]/.test(w) || hasForbiddenChar(w) || hasHidden(w) || w.startsWith('-') || w.startsWith('#')) {
      problems.push('name word has a forbidden character');
    }
  }
  if (FORBIDDEN_COMMAND_NAMES.has(String(name[0]).toLowerCase())) {
    problems.push('command name is a shell or interpreter word');
  }
  const options = e['options'] ?? [];
  const intOptions = e['intOptions'] ?? [];
  for (const [label, list] of [['options', options], ['intOptions', intOptions]]) {
    if (!Array.isArray(list) || !list.every((o) => typeof o === 'string' && /^-[A-Za-z0-9-]+$/.test(o) && o !== '--')) {
      problems.push(`${String(label)} must be a list of option words`);
    }
  }
  if (e['paths'] !== 'none' && e['paths'] !== 'words' && e['paths'] !== 'after--') {
    problems.push('paths must be none, words, or after--');
  }
  if (e['extra'] !== undefined && e['extra'] !== 'words') problems.push('extra must be words');
  return problems;
}

/**
 * Combine the built-in grammar with extension entries. Invalid entries are dropped and counted.
 * @param {unknown} safeCommands
 * @returns {{ grammar: GrammarEntry[], rejected: number }}
 */
export function buildGrammar(safeCommands) {
  const grammar = [...BUILTIN_GRAMMAR];
  const list = Array.isArray(safeCommands) ? safeCommands : [];
  let rejected = Array.isArray(safeCommands) ? 0 : safeCommands === undefined || safeCommands === null ? 0 : 1;
  list.forEach((e, i) => {
    if (i >= MAX_EXTENSION_ENTRIES || validateExtensionEntry(e).length > 0) {
      rejected += 1;
      return;
    }
    grammar.push({
      name: [...e.name],
      options: [...(e.options ?? [])],
      ...(e.intOptions ? { intOptions: [...e.intOptions] } : {}),
      paths: e.paths,
      ...(e.extra ? { extra: e.extra } : {}),
    });
  });
  return { grammar, rejected };
}

/**
 * Build the secret-path matcher from a WardSet: every `secrets` pattern of every egress ward, case-insensitive.
 * @param {{ wards: readonly { kind: string, secrets?: readonly string[] }[] } | undefined | null} wardSet
 * @returns {SecretMatcher}
 */
export function buildSecretMatcher(wardSet) {
  /** @type {string[]} */
  const patterns = [];
  for (const w of wardSet?.wards ?? []) {
    if (w.kind === 'egress' && Array.isArray(w.secrets)) patterns.push(...w.secrets);
  }
  return compilePathSet(patterns, { caseSensitive: false });
}

/**
 * Hand-written scanner. Whitespace (space) separates words; single quotes are literal; double quotes run
 * to the next double quote; there is no escape, expansion, or comment syntax.
 * @param {string} line
 * @returns {{ ok: true, words: string[], globs: boolean[] } | { ok: false }}
 */
export function tokenize(line) {
  if (typeof line !== 'string') return { ok: false };
  /** @type {string[]} */
  const words = [];
  /** @type {boolean[]} */
  const globs = [];
  let cur = '';
  let inWord = false;
  let glob = false;
  /** @type {string | null} */
  let quote = null;
  for (const ch of line) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (inWord) {
        words.push(cur);
        globs.push(glob);
        cur = '';
        inWord = false;
        glob = false;
      }
      continue;
    }
    inWord = true;
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '*' || ch === '?' || ch === '[') glob = true;
    cur += ch;
  }
  if (quote !== null) return { ok: false };
  if (inWord) {
    words.push(cur);
    globs.push(glob);
  }
  return { ok: true, words, globs };
}

/** @param {string} w */
function hasDotDotSegment(w) {
  return w.split('/').includes('..') || w.split('\\').includes('..');
}

/**
 * @param {readonly GrammarEntry[]} grammar
 * @param {string[]} words
 * @returns {GrammarEntry | undefined}
 */
function findEntry(grammar, words) {
  /** @type {GrammarEntry | undefined} */
  let best;
  for (const entry of grammar) {
    const n = entry.name.length;
    if (words.length < n) continue;
    if (!entry.name.every((w, i) => words[i] === w)) continue;
    if (best === undefined || n > best.name.length) best = entry;
  }
  return best;
}

/**
 * Classify one shell command line. Pure. Returns `{ safe: false }` at the first failing step.
 * @param {string} line
 * @param {readonly GrammarEntry[]} grammar
 * @param {SecretMatcher | null | undefined} secretMatcher
 * @returns {SafeResult}
 */
export function classifySafe(line, grammar, secretMatcher) {
  try {
    return classify(line, grammar, secretMatcher);
  } catch {
    return { safe: false };
  }
}

/**
 * @param {string} line
 * @param {readonly GrammarEntry[]} grammar
 * @param {SecretMatcher | null | undefined} secretMatcher
 * @returns {SafeResult}
 */
function classify(line, grammar, secretMatcher) {
  const NO = { safe: false };
  if (typeof line !== 'string' || line.length === 0 || !Array.isArray(grammar)) return NO;
  // Step 1: character screen. `$` and `\` are rejected everywhere, so there is no escape handling.
  if (hasForbiddenChar(line) || hasHidden(line)) return NO;
  // Step 2: tokenize.
  const tok = tokenize(line);
  if (!tok.ok || tok.words.length === 0) return NO;
  const { words, globs } = tok;
  // Step 3: words.
  for (let i = 0; i < words.length; i++) {
    const w = /** @type {string} */ (words[i]);
    if (w.length === 0 || globs[i] || w.startsWith('~') || w.startsWith('#') || hasDotDotSegment(w)) return NO;
  }
  // Step 4: grammar entry.
  const entry = findEntry(grammar, words);
  if (entry === undefined) return NO;
  if (entry.name.length === 0 || FORBIDDEN_COMMAND_NAMES.has(String(entry.name[0]).toLowerCase())) return NO;
  const rest = words.slice(entry.name.length);
  const options = entry.options ?? [];
  const intOptions = entry.intOptions ?? [];
  /** @type {string[]} */
  const pathWords = [];
  let seenDashDash = false;
  for (let i = 0; i < rest.length; i++) {
    const w = /** @type {string} */ (rest[i]);
    if (w === '--' && entry.paths === 'after--') {
      if (seenDashDash) return NO;
      seenDashDash = true;
    } else if (intOptions.includes(w)) {
      const next = rest[i + 1];
      if (next === undefined || !/^[0-9]{1,9}$/.test(next)) return NO;
      i += 1;
    } else if (options.includes(w)) {
      // listed option
    } else if (w.startsWith('-')) {
      if (entry.extra !== 'words') return NO;
    } else if (entry.extra === 'words') {
      // Free word. Where the entry also allows path words, the word is checked as a path too.
      if (entry.paths === 'words' || (entry.paths === 'after--' && seenDashDash)) pathWords.push(w);
    } else if (entry.paths === 'words' || (entry.paths === 'after--' && seenDashDash)) {
      pathWords.push(w);
    } else {
      return NO;
    }
  }
  // Step 5: secret paths always go through the ghost.
  if (pathWords.length > 0 && entry.secretCheck !== false) {
    if (!secretMatcher || typeof secretMatcher.test !== 'function') return NO;
    for (const p of pathWords) {
      if (secretMatcher.test(normalizePath(p)).matched || secretMatcher.test(p).matched) return NO;
    }
  }
  return { safe: true, entry };
}

// Trusted commands (kiro-integration spec, Trusted_Command): a shell line passes without a rehearsal only when the
// whole line has one of these shapes, and nothing else:
//   [cd <dir> &&] <command words matching a trusted pattern> [2>&1] [> /dev/null] [| <stdin filter>]...
// A pure classifier on top of the gate's own tokenizer. No I/O. Any line that does not parse is "not trusted"
// and goes to the ghost, so the shape rules here only ever shrink what is trusted.
//
// Pattern language (the `trusted_commands` list of the Wards_File): words separated by one space. A `*` word
// matches exactly one word, a final `**` matches zero or more remaining words, any other word matches itself.
// A wildcard never matches a word that starts with `-` (`--config=x`, `-c`, `--`, `-`): options must be written
// literally in the pattern.

import { normalizePath } from '@ghost-run/core';
import { isApprovalCommand } from './approval-guard.mjs';
import { hasHidden, classifySafe, tokenize } from './safe-list.mjs';

/** @typedef {import('./safe-list.mjs').GrammarEntry} GrammarEntry */
/** @typedef {import('./safe-list.mjs').SecretMatcher} SecretMatcher */

/** Longest accepted line; longer lines are not trusted. */
const MAX_LINE = 4096;

/** Characters that make a line untrusted anywhere, quoted or not: substitution, escapes, lists, groups, input. */
const ALWAYS_BAD = new Set([';', '$', '`', '\\', '(', ')', '{', '}', '!', '#', '<']);
/** Operator characters that are only allowed outside quotes (as the operators and redirects below). */
const QUOTED_BAD = new Set(['&', '|', '>']);

/** Commands that are never trusted, even when a pattern lists them. Compared on the lower-case base name. */
const NEVER_TRUSTED = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'ash', 'busybox', 'cmd', 'powershell', 'pwsh',
  'sudo', 'su', 'doas', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'nc', 'ncat', 'telnet', 'ftp',
  'eval', 'exec', 'source', '.', 'env', 'xargs', 'nohup', 'time', 'command', 'builtin', 'nice', 'timeout', 'watch',
]);

/** Interpreters: never trusted when any argument runs code given on the command line. */
const INTERPRETERS = new Set([
  'node', 'nodejs', 'deno', 'bun', 'python', 'python2', 'python3', 'perl', 'ruby', 'php', 'lua', 'osascript', 'rscript',
]);

/** Option words that run code from the argument list (long forms). */
const CODE_LONG_OPTIONS = ['--eval', '--print', '--command', '--exec', '--require', '--import', '--call'];

/** Standard-input filters allowed after a pipe (names from the safe-list grammar). */
const STDIN_FILTERS = new Set(['cat', 'head', 'tail', 'wc']);

/** Redirect words that are allowed on their own, and the ones that need `/dev/null` as the next word. */
const REDIRECT_FULL = new Set(['2>&1', '>/dev/null', '1>/dev/null', '2>/dev/null', '&>/dev/null']);
const REDIRECT_TARGETLESS = new Set(['>', '1>', '2>', '&>']);

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const NOT = Object.freeze({ trusted: false });

/**
 * Split a line at the unquoted `&&` and `|` operators. Quotes follow the gate's tokenizer (single or double,
 * no escapes). Returns null for anything else that is an operator: `||`, `|&`, a lone `&`, `;`, and so on.
 * @param {string} line
 * @returns {{ text: string, op: '&&' | '|' | null }[] | null}
 */
function splitLine(line) {
  /** @type {{ text: string, op: '&&' | '|' | null }[]} */
  const segs = [];
  /** @type {'&&' | '|' | null} */
  let op = null;
  let cur = '';
  /** @type {string | null} */
  let quote = null;
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const ch = /** @type {string} */ (chars[i]);
    if (ALWAYS_BAD.has(ch)) return null;
    if (quote !== null) {
      if (QUOTED_BAD.has(ch)) return null;
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '&') {
      const next = chars[i + 1];
      if (cur.endsWith('>') || next === '>') {
        cur += ch; // part of 2>&1 or &>; the word check decides
      } else if (next === '&') {
        segs.push({ text: cur, op });
        cur = '';
        op = '&&';
        i += 1;
      } else return null;
      continue;
    }
    if (ch === '|') {
      const next = chars[i + 1];
      if (next === '|' || next === '&') return null;
      segs.push({ text: cur, op });
      cur = '';
      op = '|';
      continue;
    }
    cur += ch;
  }
  if (quote !== null) return null;
  segs.push({ text: cur, op });
  if (segs.some((s) => s.text.trim() === '')) return null;
  return segs.map((s) => ({ text: s.text.trim(), op: s.op }));
}

/**
 * Words of a segment without operator characters, or null. Globs, empty words, a leading `~` or `#`, and
 * operator characters inside a word make the segment unparseable.
 * @param {string} text
 * @returns {string[] | null}
 */
function plainWords(text) {
  const tok = tokenize(text);
  if (!tok.ok || tok.words.length === 0) return null;
  for (let i = 0; i < tok.words.length; i++) {
    const w = /** @type {string} */ (tok.words[i]);
    if (w.length === 0 || tok.globs[i] || w.startsWith('~') || w.startsWith('#')) return null;
  }
  return tok.words;
}

/**
 * Split the words of the command segment into command words and the trailing redirects. Returns null when a
 * redirect is not one of the harmless forms, when a redirect comes before a command word, or when a command
 * word still carries an operator character.
 * @param {string[]} words
 * @returns {string[] | null} command words
 */
function splitRedirects(words) {
  /** @type {string[]} */
  const command = [];
  let i = 0;
  for (; i < words.length; i++) {
    const w = /** @type {string} */ (words[i]);
    if (REDIRECT_FULL.has(w) || REDIRECT_TARGETLESS.has(w)) break;
    if (/[&|<>]/.test(w)) return null;
    command.push(w);
  }
  for (; i < words.length; i++) {
    const w = /** @type {string} */ (words[i]);
    if (REDIRECT_FULL.has(w)) continue;
    if (REDIRECT_TARGETLESS.has(w) && words[i + 1] === '/dev/null') {
      i += 1;
      continue;
    }
    return null;
  }
  return command;
}

/**
 * Does `words` match `pattern` (a string of words; `*` is one word, a final `**` is any rest)? A wildcard never
 * matches a word that starts with `-`; such a word must be written literally in the pattern.
 * @param {string} pattern
 * @param {readonly string[]} words
 * @returns {boolean}
 */
export function matchesPattern(pattern, words) {
  if (typeof pattern !== 'string' || pattern === '') return false;
  const p = pattern.split(' ');
  const open = p[p.length - 1] === '**';
  const fixed = open ? p.slice(0, -1) : p;
  if (open ? words.length < fixed.length : words.length !== fixed.length) return false;
  const word = (/** @type {string | undefined} */ w) => typeof w === 'string' && !w.startsWith('-');
  if (!fixed.every((w, i) => (w === '*' ? word(words[i]) : w === words[i]))) return false;
  return !open || words.slice(fixed.length).every(word);
}

/** @param {string} word */
function baseName(word) {
  const slash = word.lastIndexOf('/');
  return (slash >= 0 ? word.slice(slash + 1) : word).toLowerCase();
}

/**
 * True for a command that is never trusted: a shell, `sudo`, a network client, `eval`, an interpreter given code
 * on its command line, and wrappers that run another command.
 * @param {readonly string[]} words
 * @returns {boolean}
 */
export function isNeverTrusted(words) {
  const first = words[0];
  if (first === undefined) return true;
  const name = baseName(first);
  if (NEVER_TRUSTED.has(name)) return true;
  if (!INTERPRETERS.has(name)) return false;
  if (name === 'deno' && words[1] === 'eval') return true;
  return words.slice(1).some(
    (w) =>
      CODE_LONG_OPTIONS.some((o) => w === o || w.startsWith(`${o}=`)) ||
      (/^-[A-Za-z]+$/.test(w) && /[ceEprx]/.test(w)),
  );
}

/**
 * A pipe segment: a safe-list command that reads standard input and has no path argument.
 * @param {string} rawText
 * @param {readonly GrammarEntry[]} grammar
 * @param {SecretMatcher | null | undefined} secretMatcher
 * @returns {boolean}
 */
function isStdinFilter(rawText, grammar, secretMatcher) {
  // `head -20` and `tail -20` are the old spelling of `-n 20`; the grammar knows only the second.
  const text = /^(?:head|tail)(?=\s)/.test(rawText) ? rawText.replace(/(\s)-(\d{1,9})(?=\s|$)/g, '$1-n $2') : rawText;
  const r = classifySafe(text, grammar, secretMatcher);
  if (!r.safe || !r.entry) return false;
  const entry = r.entry;
  if (entry.name.length !== 1 || !STDIN_FILTERS.has(/** @type {string} */ (entry.name[0]))) return false;
  const tok = tokenize(text);
  if (!tok.ok) return false;
  const rest = tok.words.slice(entry.name.length);
  const options = entry.options ?? [];
  const intOptions = entry.intOptions ?? [];
  for (let i = 0; i < rest.length; i++) {
    const w = /** @type {string} */ (rest[i]);
    if (intOptions.includes(w)) i += 1; // classifySafe already checked the integer
    else if (!options.includes(w)) return false; // a path word
  }
  return true;
}

/**
 * @typedef {object} TrustedOptions
 * @property {readonly string[]} patterns The `trusted_commands` list.
 * @property {readonly GrammarEntry[]} grammar The safe-list grammar, for the pipe filters.
 * @property {SecretMatcher | null} [secretMatcher] A command word that names a secret path is not trusted.
 *
 * @typedef {{ trusted: false } | { trusted: true, dir?: string }} TrustedResult
 */

/**
 * Classify one shell line. Pure. `dir` is the literal target of a leading `cd`; the caller must still check that
 * it resolves inside the workspace (`trustedDirInside`), because that needs the file system.
 * @param {string} line
 * @param {TrustedOptions} options
 * @returns {TrustedResult}
 */
export function classifyTrusted(line, options) {
  try {
    return classify(line, options);
  } catch {
    return NOT;
  }
}

/**
 * @param {string} line
 * @param {TrustedOptions} options
 * @returns {TrustedResult}
 */
function classify(line, options) {
  const { patterns, grammar, secretMatcher } = options;
  if (typeof line !== 'string' || line.length === 0 || line.length > MAX_LINE) return NOT;
  if (!Array.isArray(patterns) || patterns.length === 0) return NOT;
  if (hasHidden(line) || isApprovalCommand(line)) return NOT;
  const segs = splitLine(line);
  if (segs === null) return NOT;

  let at = 0;
  /** @type {string | undefined} */
  let dir;
  if (segs[1]?.op === '&&') {
    const cd = plainWords(/** @type {{ text: string }} */ (segs[0]).text);
    const target = cd?.[1];
    if (!cd || cd.length !== 2 || cd[0] !== 'cd' || target === undefined || target.startsWith('-')) return NOT;
    if (/[&|<>]/.test(target)) return NOT;
    dir = target;
    at = 1;
  }
  const head = /** @type {{ text: string, op: string | null }} */ (segs[at]);
  const words = plainWords(head.text);
  if (words === null) return NOT;
  const command = splitRedirects(words);
  if (command === null || command.length === 0) return NOT;
  if (ENV_ASSIGNMENT.test(/** @type {string} */ (command[0]))) return NOT;
  if (isNeverTrusted(command)) return NOT;
  if (!patterns.some((p) => matchesPattern(p, command))) return NOT;
  if (secretMatcher && typeof secretMatcher.test === 'function') {
    for (const w of command.slice(1)) {
      if (secretMatcher.test(normalizePath(w)).matched || secretMatcher.test(w).matched) return NOT;
    }
  }
  for (const seg of segs.slice(at + 1)) {
    if (seg.op !== '|' || !isStdinFilter(seg.text, grammar, secretMatcher)) return NOT;
  }
  return dir === undefined ? { trusted: true } : { trusted: true, dir };
}

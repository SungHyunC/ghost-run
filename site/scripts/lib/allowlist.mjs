// Allowlist loading and file-glob matching for the Site_Check (design Component 12).
// Glob rules (one matcher for every `files` field of url-allowlist.json):
//   - a field is a comma-separated list of globs; braces `{a,b}` expand (one level) and do not split the list;
//   - a glob matches the whole posix path relative to the dist root (`index.html` is the root file only,
//     `assets/*.js` is one folder level);
//   - `*` matches any run of characters except `/`, `**/` matches zero or more folders (`**/*.svg` is any depth),
//     `**` matches any run including `/`, `?` matches one character.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{ value: string, files: string, reason: string, anchorOnly?: boolean, requiredRel?: string }} AllowEntry
 */

/**
 * Split a comma-separated glob list, keeping commas inside braces.
 * @param {string} field
 * @returns {string[]}
 */
export function splitGlobs(field) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of field) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * @param {string} glob
 * @returns {string[]}
 */
function expandBraces(glob) {
  const open = glob.indexOf('{');
  const close = open === -1 ? -1 : glob.indexOf('}', open);
  if (open === -1 || close === -1) return [glob];
  const head = glob.slice(0, open);
  const tail = glob.slice(close + 1);
  return glob
    .slice(open + 1, close)
    .split(',')
    .flatMap((option) => expandBraces(`${head}${option.trim()}${tail}`));
}

/**
 * @param {string} glob a glob without braces
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i] ?? '';
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * @param {string} field the `files` field of an allowlist entry
 * @param {string} file posix path relative to the dist root
 * @returns {boolean}
 */
export function matchesFiles(field, file) {
  for (const glob of splitGlobs(field)) {
    for (const expanded of expandBraces(glob)) {
      if (globToRegExp(expanded).test(file)) return true;
    }
  }
  return false;
}

/**
 * @returns {AllowEntry[]}
 */
export function loadAllowlist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(path.join(here, '..', 'url-allowlist.json'), 'utf8'));
  return /** @type {AllowEntry[]} */ (raw.strings);
}

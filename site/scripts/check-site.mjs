// Site_Check (design Component 12): reads a built site/dist directory and reports findings.
// It covers local links (Requirement 20, criteria 2 and 3), external references and the policy rule
// (criteria 4 and 5), and the structure rules (criteria 6 and 7). No network call is made.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadAllowlist, matchesFiles } from './lib/allowlist.mjs';
import { readManifest } from './lib/bundled-packages.mjs';
import { parseHeaders } from './lib/headers.mjs';
import { missingFromNotices } from './lib/notices.mjs';
import { classifyRef, extractCssRefs, extractHtmlRefs, extractJsRefs, extractRefs, extractStaticImports } from './lib/refs.mjs';

/** @typedef {import('./lib/refs.mjs').Finding} Finding */
/** @typedef {{ file: string, value: string, target: string | null, exists: boolean }} Ref */

const CHECKED_EXTENSIONS = ['.html', '.css', '.js', '.mjs'];

export const RULE_LOCAL_LINK = 'every-local-link-resolves: target file does not exist';
export const RULE_FRAGMENT = 'every-local-link-resolves: same-file fragment id does not exist';
export const RULE_EXTERNAL = 'no-external-url: external reference outside the allowlist';
export const RULE_REPO_PLACE = 'no-external-url: repository URL outside an anchor href with rel="noopener noreferrer"';
export const RULE_REPO_CSP = 'no-external-url: repository URL in a Content-Security-Policy';
export const RULE_POLICY = 'headers-policy: forbidden token in a Content-Security-Policy';
export const RULE_SCOPE_ALL = 'headers-scope: a block has the scope /*';
export const RULE_SCOPE_MISSING = 'headers-scope: the scope names a path that does not exist in the site';
export const RULE_HEADERS_PARSE = 'headers-scope: the _headers file cannot be parsed';
export const RULE_HEADERS_DUP = 'structure: more than one _headers file (only the root one is allowed)';
export const RULE_PATH_MISSING = 'structure: required path is missing';
export const RULE_FONT_MISSING = 'structure: no .woff2 font file under assets/';
export const RULE_CSS_DATA = 'structure: data: URI in a Landing_Page .css file';
export const RULE_INLINE_SCRIPT = 'structure: inline <script> in index.html';
export const RULE_STYLE_ATTR = 'structure: style attribute in index.html';
export const RULE_FIRST_PAINT = 'first-paint: index.html names an Engine_Bundle or a wasm file';
export const RULE_ENTRY_STATIC = 'first-paint: the Entry_Bundle has a static import of an Engine_Bundle';
export const RULE_ENTRY_SIZE = 'entry-size: the Entry_Bundle is larger than the limit';
export const RULE_POLICY_REQUIRED = 'headers-policy: a required directive is missing or has the wrong value in the policy of /';
export const RULE_SHOWCASE_ENGINE = 'showcase: the Showcase names an Engine_Bundle, a worker file, or a wasm file';
export const RULE_LANDING_SHOWCASE = 'showcase: the Landing_Page names an asset with the prefix showcase-';
export const RULE_SHOWCASE_SIZE = 'showcase: the closure of the Showcase entry is larger than the limit';
export const RULE_HAND_POLICY = 'headers-policy: /hand/* must have exactly one Content-Security-Policy block (it covers /hand/ and its files)';
export const RULE_KIT_BLOCK = 'headers-policy: a /kit/ block differs from the block of /';
export const RULE_NOTICE_LINK = 'structure: index.html has no link to THIRD_PARTY_NOTICES.txt';
export const RULE_NOTICE_PACKAGE = 'notices: a bundled package has no license section in THIRD_PARTY_NOTICES.txt';
export const RULE_NOTICE_LIST = 'notices: the list of bundled packages is missing or unreadable (build the landing page first)';

/**
 * Size limit of the Entry_Bundle in bytes (site-live Requirement 15, criterion 4; 284 kB on 2026-11-21).
 * Decimal kilobytes: 360 kB is 360,000 bytes.
 */
export const ENTRY_MAX_BYTES = 360 * 1000;

/**
 * Size limit of the Showcase entry closure in bytes (site-pages Requirement 16, criterion 7).
 * Measured on 2026-11-21: 285,426 B (showcase entry 54,269 + vendor-react 11,880 + shared chunk 219,277).
 * 285,426 x 1.15 = 328,240, rounded up to the next 10 kB: 330,000. Decimal kilobytes.
 */
export const SHOWCASE_MAX_BYTES = 330 * 1000;

/** The two HTML pages that carry the full Landing_Page rules (inline script, style attribute, meta policy). */
export const PAGE_FILES = ['index.html', 'kit/index.html'];

/** Declared links of the Showcase (site-pages Requirement 13, criterion 3 and 6). */
const KIT_LINKS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'kit-links.json');

/** The third-party notice at the root of the assembled site (site-live Requirement 18, criterion 3). */
export const NOTICE_FILE = 'THIRD_PARTY_NOTICES.txt';

/**
 * Engine_Bundles (site-live Requirement 15, criterion 1): the two engine chunks, the two workers, and the
 * Rollup chunk `common-*.js` that holds the code the two engine chunks share. They get the reference-form
 * check only, not the string scan, and the first paint must not name or statically import them.
 */
export const ENGINE_BUNDLE = /^assets\/(?:engine-light|engine-hand|hand-worker|sim-worker|worker-entry|common)-[^/]+\.js$/;

/** Paths of Requirement 18, criterion 1 (the folders `assets/` are checked by the font rule). */
export const REQUIRED_PATHS = [
  'index.html',
  'favicon.svg',
  'favicon.ico',
  'shell/index.html',
  'shell/ko.html',
  'hand/index.html',
  'kit/index.html',
  'kit/gallery/index.html',
  '_headers',
  NOTICE_FILE,
];

/** Folders whose files are copied from the apps; every other file (including `kit/index.html`) belongs to the Landing_Page. */
const APP_FOLDERS = ['shell/', 'hand/', 'kit/gallery/'];

/** URL-looking strings in Landing_Page JS, JSON, and SVG text (bare `http://` without a host does not match). */
const URL_STRING = /\b(?:https?|wss?|ftp):\/\/[^\s"'`<>()\\]+|\bdata:[a-z]+\/[a-z0-9.+-]+[;,]/gi;

/**
 * List every file below `root` as a posix path relative to `root`.
 * @param {string} root
 * @returns {string[]}
 */
function listFiles(root) {
  const found = [];
  /** @param {string} relDir */
  const walk = (relDir) => {
    const entries = readdirSync(path.join(root, relDir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) found.push(rel);
    }
  };
  walk('');
  return found;
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolve a reference path to a posix path relative to the dist root, or null when it leaves the root.
 * @param {string} holdingFile posix path of the holding file, relative to the dist root
 * @param {string} refPath the path part of the reference (no query, no fragment)
 * @returns {string | null}
 */
function resolveTarget(holdingFile, refPath) {
  const decoded = safeDecode(refPath);
  const base = decoded.startsWith('/') ? [] : holdingFile.split('/').slice(0, -1);
  const segments = [...base];
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  let target = segments.join('/');
  if (decoded.endsWith('/') || decoded === '' || decoded === '.' || decoded.endsWith('/.') || decoded.endsWith('/..') || decoded === '..') {
    target = target === '' ? 'index.html' : `${target}/index.html`;
  }
  return target;
}

/**
 * @param {string} html
 * @returns {Set<string>}
 */
function collectIds(html) {
  const dom = new JSDOM(html);
  const ids = new Set();
  for (const element of dom.window.document.querySelectorAll('[id]')) ids.add(element.getAttribute('id') ?? '');
  dom.window.close();
  return ids;
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isLandingFile(file) {
  return !APP_FOLDERS.some((folder) => file.startsWith(folder));
}

/**
 * @param {string | undefined} rel
 * @param {string} required
 * @returns {boolean}
 */
function hasRel(rel, required) {
  const have = new Set((rel ?? '').toLowerCase().split(/\s+/).filter((token) => token !== ''));
  return required
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '')
    .every((token) => have.has(token));
}

/**
 * Does `value` match an allowlist entry for `file`? An entry ending in `/` is a prefix; any other entry is exact.
 * @param {import('./lib/allowlist.mjs').AllowEntry} entry
 * @param {string} value
 * @returns {boolean}
 */
function entryMatches(entry, value) {
  return value === entry.value || (entry.value.endsWith('/') && value.startsWith(entry.value));
}

/**
 * Judge one external reference found in a reference position of `.html` or `.css`.
 * @param {string} file
 * @param {import('./lib/refs.mjs').Reference} ref
 * @param {import('./lib/allowlist.mjs').AllowEntry[]} allowlist
 * @returns {Finding | null}
 */
function judgeExternalRef(file, ref, allowlist) {
  const entry = allowlist.find((candidate) => entryMatches(candidate, ref.value));
  if (entry === undefined) return { file, reference: ref.value, rule: RULE_EXTERNAL };
  if (!matchesFiles(entry.files, file)) {
    return { file, reference: ref.value, rule: entry.anchorOnly === true ? RULE_REPO_PLACE : RULE_EXTERNAL };
  }
  if (entry.anchorOnly === true) {
    const inAnchor = ref.source === 'href' && ref.tag === 'a' && hasRel(ref.rel, entry.requiredRel ?? '');
    if (!inAnchor) return { file, reference: ref.value, rule: RULE_REPO_PLACE };
    return null;
  }
  // A non-anchor entry names a namespace or text; it is never valid as a reference target.
  return { file, reference: ref.value, rule: RULE_EXTERNAL };
}

/**
 * The policy rule of Requirement 19, criterion 5, for one Content-Security-Policy value.
 * `data:` and `'unsafe-inline'` are tolerated only when `shellScope` is true (the `/shell/*` block, Requirement 19, criterion 2).
 * `'unsafe-eval'` is tolerated only when `handScope` is true (the `/hand/` blocks: MuJoCo runs on the main thread, open question O3).
 * @param {string} policy
 * @param {boolean} shellScope
 * @param {boolean} [handScope]
 * @returns {string[]} the forbidden tokens found
 */
function policyViolations(policy, shellScope, handScope = false) {
  const found = [];
  if (/\bhttps:/i.test(policy)) found.push('https:');
  if (/\bhttp:/i.test(policy)) found.push('http:');
  if (policy.includes('*')) found.push('*');
  if (!handScope && /'unsafe-eval'/i.test(policy)) found.push("'unsafe-eval'");
  if (!shellScope && /'unsafe-inline'/i.test(policy)) found.push("'unsafe-inline'");
  if (!shellScope && /\bdata:/i.test(policy)) found.push('data:');
  return found;
}

/**
 * The positive rule of site-live Requirement 14, criterion 3, for the policy of `/`:
 * `worker-src 'self'`, `connect-src 'self'` and no other connect-src value, and `'wasm-unsafe-eval'` in script-src.
 * @param {string} policy
 * @returns {string[]} what is missing or wrong
 */
export function policyRequirements(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter((token) => token !== '');
    const name = tokens.shift();
    if (name !== undefined) directives.set(name.toLowerCase(), tokens);
  }
  const problems = [];
  const same = (name, value) => {
    const tokens = directives.get(name);
    return tokens !== undefined && tokens.length === 1 && tokens[0] === value;
  };
  if (!same('worker-src', "'self'")) problems.push("worker-src 'self'");
  if (!same('connect-src', "'self'")) problems.push("connect-src 'self'");
  if (!(directives.get('script-src') ?? []).includes("'wasm-unsafe-eval'")) problems.push("script-src 'wasm-unsafe-eval'");
  return problems;
}

/**
 * @param {string} scope a path line of a Headers_File block
 * @param {string[]} files
 * @returns {boolean}
 */
function scopeExists(scope, files) {
  if (scope.includes(':')) return true; // a placeholder or a host rule is not a path of this site
  const star = scope.indexOf('*');
  const stem = (star === -1 ? scope : scope.slice(0, star)).replace(/^\//, '');
  const folder = stem.replace(/\/$/, '');
  if (folder === '') return files.length > 0;
  if (star === -1 && !scope.endsWith('/')) {
    return files.includes(folder) || files.includes(`${folder}/index.html`);
  }
  return files.some((file) => file === folder || file.startsWith(`${folder}/`));
}

/**
 * Check a built site directory.
 * @param {string} distRoot
 * @param {{ structure?: boolean, bundledPackages?: string | readonly { name: string, version: string }[], kitLinks?: { links: string[], rowIds: string[] } }} [options]
 *   `structure: false` skips the structure and headers rules (criteria 6 and 7 and the `_headers` policy), for partial fixture trees.
 *   `kitLinks` replaces `src/data/kit-links.json` (for fixtures).
 *   `bundledPackages` (a manifest path or the list itself) turns on the notices rule: every bundled package needs a section in the notices file.
 * @returns {Finding[]}
 */
export function checkSite(distRoot, options = {}) {
  const withStructure = options.structure !== false;
  /** @type {Finding[]} */
  const findings = [];
  const files = listFiles(distRoot);
  if (options.bundledPackages !== undefined) checkNotices(distRoot, files, options.bundledPackages, findings);
  const fileSet = new Set(files);
  const allowlist = loadAllowlist();
  const repoUrl = allowlist.find((entry) => entry.anchorOnly === true)?.value;

  for (const file of files) {
    const lower = file.toLowerCase();
    if (!CHECKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
    const text = readFileSync(path.join(distRoot, file), 'utf8');
    const isHtml = lower.endsWith('.html');
    /** @type {Set<string> | null} */
    let ids = null;
    const idsOfThisFile = () => (ids ??= collectIds(text));

    for (const ref of extractRefs(file, text)) {
      const classified = classifyRef(ref.value);
      if (classified.kind === 'fragment') {
        // A fragment-only value points into the holding file; only an .html file has ids to match.
        if (isHtml && classified.fragment !== '' && classified.fragment.toLowerCase() !== 'top') {
          if (!idsOfThisFile().has(safeDecode(classified.fragment))) {
            findings.push({ file, reference: ref.value, rule: RULE_FRAGMENT });
          }
        }
        continue;
      }
      if (classified.kind !== 'local') continue;
      // A bare module specifier (`import "react"`) is not a URL; only path-like targets are checked.
      if (ref.source === 'js-import' && !/^(?:\.{1,2}\/|\/)/.test(classified.path)) continue;

      if (classified.path === '') {
        // `?query` or `?query#id` points at the holding file itself.
        if (isHtml && classified.fragment !== '' && classified.fragment.toLowerCase() !== 'top') {
          if (!idsOfThisFile().has(safeDecode(classified.fragment))) {
            findings.push({ file, reference: ref.value, rule: RULE_FRAGMENT });
          }
        }
        continue;
      }
      const target = resolveTarget(file, classified.path);
      if (target === null || !fileSet.has(target)) {
        findings.push({ file, reference: ref.value, rule: RULE_LOCAL_LINK });
      }
    }
  }

  checkExternal(distRoot, files, allowlist, findings);
  if (withStructure) checkStructure(distRoot, files, repoUrl, findings, options.kitLinks);
  return findings;
}

/**
 * External-reference rules (Requirement 20, criteria 4 and 5).
 * @param {string} distRoot
 * @param {string[]} files
 * @param {import('./lib/allowlist.mjs').AllowEntry[]} allowlist
 * @param {Finding[]} findings
 */
function checkExternal(distRoot, files, allowlist, findings) {
  for (const file of files) {
    const lower = file.toLowerCase();
    const isHtml = lower.endsWith('.html');
    const isCss = lower.endsWith('.css');
    const isScanned = isLandingFile(file) && !ENGINE_BUNDLE.test(file) && (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.json') || lower.endsWith('.svg'));
    if (!isHtml && !isCss && !isScanned) continue;
    const text = readFileSync(path.join(distRoot, file), 'utf8');

    if (isHtml || isCss) {
      const refs = isHtml ? extractHtmlRefs(text) : extractCssRefs(text);
      for (const ref of refs) {
        if (classifyRef(ref.value).kind !== 'external') continue;
        const finding = judgeExternalRef(file, ref, allowlist);
        if (finding !== null) findings.push(finding);
      }
    } else {
      // Landing_Page JS, JSON, and SVG: scan string content. The copied app bundles and the Engine_Bundles are not scanned.
      for (const match of text.matchAll(URL_STRING)) {
        const value = match[0].replace(/[.,;:]+$/, '');
        const entry = allowlist.find((candidate) => entryMatches(candidate, value) && matchesFiles(candidate.files, file));
        if (entry === undefined) findings.push({ file, reference: value, rule: RULE_EXTERNAL });
      }
    }
  }
}

/**
 * Structure and headers rules (Requirement 19, criteria 3 and 5; Requirement 20, criteria 5 to 7).
 * @param {string} distRoot
 * @param {string[]} files
 * @param {string | undefined} repoUrl
 * @param {Finding[]} findings
 * @param {{ links: string[], rowIds: string[] } | undefined} [kitLinks]
 */
function checkStructure(distRoot, files, repoUrl, findings, kitLinks) {
  const fileSet = new Set(files);
  for (const required of REQUIRED_PATHS) {
    if (!fileSet.has(required)) findings.push({ file: required, reference: `(${required})`, rule: RULE_PATH_MISSING });
  }
  for (const file of files) {
    if (file !== '_headers' && file.split('/').pop() === '_headers') {
      findings.push({ file, reference: '(_headers)', rule: RULE_HEADERS_DUP });
    }
  }

  if (fileSet.has('_headers')) {
    const text = readFileSync(path.join(distRoot, '_headers'), 'utf8');
    if (repoUrl !== undefined && text.includes(repoUrl)) {
      findings.push({ file: '_headers', reference: repoUrl, rule: RULE_REPO_CSP });
    }
    try {
      const blocks = parseHeaders(text);
      for (const block of blocks) {
        if (block.path === '/*') findings.push({ file: '_headers', reference: block.path, rule: RULE_SCOPE_ALL });
        else if (!scopeExists(block.path, files)) findings.push({ file: '_headers', reference: block.path, rule: RULE_SCOPE_MISSING });
        const shellScope = block.path.startsWith('/shell/') || block.path === '/shell';
        const handScope = block.path === '/hand/' || block.path === '/hand' || block.path.startsWith('/hand/');
        for (const header of block.headers) {
          if (!/^content-security-policy\s*:/i.test(header)) continue;
          const policy = header.slice(header.indexOf(':') + 1);
          for (const token of policyViolations(policy, shellScope, handScope)) {
            findings.push({ file: '_headers', reference: `${block.path}  ${token}`, rule: RULE_POLICY });
          }
          if (block.path === '/' || block.path === '/index.html' || block.path.startsWith('/kit/') || handScope) {
            for (const problem of policyRequirements(policy)) {
              findings.push({ file: '_headers', reference: `${block.path}  ${problem}`, rule: RULE_POLICY_REQUIRED });
            }
          }
        }
        if (block.path.startsWith('/kit/')) {
          const root = blocks.find((candidate) => candidate.path === '/');
          if (root === undefined || JSON.stringify(root.headers) !== JSON.stringify(block.headers)) {
            findings.push({ file: '_headers', reference: block.path, rule: RULE_KIT_BLOCK });
          }
        }
      }
      if (fileSet.has('hand/index.html')) {
        const hasPolicy = (scope) =>
          blocks.some((b) => b.path === scope && b.headers.some((h) => /^content-security-policy\s*:/i.test(h)));
        if (!hasPolicy('/hand/*')) findings.push({ file: '_headers', reference: '/hand/*', rule: RULE_HAND_POLICY });
        // `/hand/` is matched by `/hand/*` too (a splat matches nothing as well), so its own block would double the header.
        if (blocks.some((b) => b.path === '/hand/')) findings.push({ file: '_headers', reference: '/hand/', rule: RULE_HAND_POLICY });
      }
    } catch {
      findings.push({ file: '_headers', reference: '(_headers)', rule: RULE_HEADERS_PARSE });
    }
  }

  if (!files.some((file) => file.startsWith('assets/') && file.toLowerCase().endsWith('.woff2'))) {
    findings.push({ file: 'assets/', reference: '(*.woff2)', rule: RULE_FONT_MISSING });
  }

  for (const file of files) {
    if (file.toLowerCase().endsWith('.css') && isLandingFile(file)) {
      const css = readFileSync(path.join(distRoot, file), 'utf8');
      if (/\bdata:/i.test(css)) findings.push({ file, reference: 'data:', rule: RULE_CSS_DATA });
    }
  }

  for (const page of PAGE_FILES) {
    if (!fileSet.has(page)) continue;
    const html = readFileSync(path.join(distRoot, page), 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    for (const script of document.querySelectorAll('script:not([src])')) {
      findings.push({ file: page, reference: (script.textContent ?? '').trim().slice(0, 40) || '<script>', rule: RULE_INLINE_SCRIPT });
    }
    for (const element of document.querySelectorAll('[style]')) {
      findings.push({ file: page, reference: `<${element.tagName.toLowerCase()} style>`, rule: RULE_STYLE_ATTR });
    }
    for (const meta of document.querySelectorAll('meta[http-equiv]')) {
      if ((meta.getAttribute('http-equiv') ?? '').toLowerCase() !== 'content-security-policy') continue;
      const policy = meta.getAttribute('content') ?? '';
      if (repoUrl !== undefined && policy.includes(repoUrl)) {
        findings.push({ file: page, reference: repoUrl, rule: RULE_REPO_CSP });
      }
      for (const token of policyViolations(policy, false)) {
        findings.push({ file: page, reference: `<meta CSP>  ${token}`, rule: RULE_POLICY });
      }
      for (const problem of policyRequirements(policy)) {
        findings.push({ file: page, reference: `<meta CSP>  ${problem}`, rule: RULE_POLICY_REQUIRED });
      }
    }
    const entries = checkFirstPaint(distRoot, files, page, document, findings);
    if (page === 'index.html') {
      // The footer is rendered by the Entry_Bundle, so the link is a string literal there; a static anchor in index.html counts too.
      const noticeLiteral = new RegExp(`(["'\`])(?:\\./)?${NOTICE_FILE.replace('.', '\\.')}\\1`);
      const noticeLink =
        [...document.querySelectorAll('a[href]')].some((anchor) => {
          const classified = classifyRef(anchor.getAttribute('href') ?? '');
          return classified.kind === 'local' && resolveTarget('index.html', classified.path) === NOTICE_FILE;
        }) || entries.some((entry) => noticeLiteral.test(readFileSync(path.join(distRoot, entry), 'utf8')));
      if (!noticeLink) findings.push({ file: 'index.html', reference: `(${NOTICE_FILE})`, rule: RULE_NOTICE_LINK });
    }
    dom.window.close();
  }
  if (fileSet.has('kit/index.html')) checkKitLinks(fileSet, kitLinks, findings);
}

/**
 * The declared links of the Showcase must resolve from `kit/index.html` to a file of the dist,
 * and each fragment must name a row id (the Showcase is rendered by React, so its ids are not in the HTML).
 * @param {Set<string>} fileSet
 * @param {{ links: string[], rowIds: string[] } | undefined} declared
 * @param {Finding[]} findings
 */
function checkKitLinks(fileSet, declared, findings) {
  const source = declared ?? JSON.parse(readFileSync(KIT_LINKS_PATH, 'utf8'));
  const rowIds = new Set(source.rowIds);
  for (const link of source.links) {
    const classified = classifyRef(link);
    if (classified.kind !== 'local' && classified.kind !== 'fragment') continue;
    const fragment = safeDecode(classified.fragment ?? '');
    const pathPart = classified.kind === 'fragment' ? '' : classified.path;
    if (pathPart !== '') {
      const target = resolveTarget('kit/index.html', pathPart);
      if (target === null || !fileSet.has(target)) {
        findings.push({ file: 'kit/index.html', reference: link, rule: RULE_LOCAL_LINK });
        continue;
      }
    }
    if (fragment !== '' && fragment.toLowerCase() !== 'top' && pathPart === '' && !rowIds.has(fragment)) {
      findings.push({ file: 'kit/index.html', reference: link, rule: RULE_FRAGMENT });
    }
  }
}

/**
 * Follow the static imports of `entries` to any depth. Engine_Bundles are not entered; they are reported.
 * @param {string} distRoot
 * @param {Set<string>} fileSet
 * @param {string[]} entries posix paths of the entry scripts
 * @returns {{ files: string[], size: number, engineImports: Array<{ file: string, value: string }> }}
 */
function staticClosure(distRoot, fileSet, entries) {
  const seen = new Set();
  const engineImports = [];
  const queue = [...entries];
  let size = 0;
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file) || !fileSet.has(file)) continue;
    seen.add(file);
    const full = path.join(distRoot, file);
    size += statSync(full).size;
    for (const value of extractStaticImports(readFileSync(full, 'utf8'))) {
      const classified = classifyRef(value);
      if (classified.kind !== 'local' || !/^(?:\.{1,2}\/|\/)/.test(classified.path)) continue;
      const target = resolveTarget(file, classified.path);
      if (target === null) continue;
      if (ENGINE_BUNDLE.test(target)) engineImports.push({ file, value });
      else queue.push(target);
    }
  }
  return { files: [...seen], size, engineImports };
}

/** Does a reference name an Engine_Bundle, a worker file, or a wasm file? @param {string} target */
function isEngineTarget(target) {
  return ENGINE_BUNDLE.test(target) || /\.wasm$/i.test(target) || /(?:^|\/)[^/]*worker[^/]*\.js$/i.test(target);
}

/**
 * First-paint rules and the closure size of one page (site-live Requirement 15, criteria 3 and 4;
 * site-pages Requirement 16, criteria 6 and 7, and Requirement 10, criterion 7).
 * `index.html` is held to the Entry_Bundle rules and must not name the Showcase; `kit/index.html` must name no engine.
 * @param {string} distRoot
 * @param {string[]} files
 * @param {string} page `index.html` or `kit/index.html`
 * @param {Document} document the parsed page
 * @param {Finding[]} findings
 * @returns {string[]} the entry script files that the page loads
 */
function checkFirstPaint(distRoot, files, page, document, findings) {
  const fileSet = new Set(files);
  const isShowcase = page === 'kit/index.html';
  const named = (value) => {
    const classified = classifyRef(value);
    if (classified.kind !== 'local') return null;
    return resolveTarget(page, classified.path);
  };
  const entries = [];
  for (const element of document.querySelectorAll('script[src], link[href]')) {
    const tag = element.tagName.toLowerCase();
    const rel = (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (tag === 'link' && !rel.includes('modulepreload') && !rel.includes('preload')) continue;
    const value = element.getAttribute(tag === 'script' ? 'src' : 'href') ?? '';
    const target = named(value);
    if (target === null) continue;
    if (isShowcase) {
      if (isEngineTarget(target)) findings.push({ file: page, reference: value, rule: RULE_SHOWCASE_ENGINE });
    } else {
      if (ENGINE_BUNDLE.test(target) || target.toLowerCase().endsWith('.wasm')) {
        findings.push({ file: page, reference: value, rule: RULE_FIRST_PAINT });
      }
      if (path.posix.basename(target).startsWith('showcase-')) {
        findings.push({ file: page, reference: value, rule: RULE_LANDING_SHOWCASE });
      }
    }
    if (tag === 'script' && fileSet.has(target) && !ENGINE_BUNDLE.test(target)) entries.push(target);
  }
  const closure = staticClosure(distRoot, fileSet, entries);
  if (isShowcase) {
    for (const hit of closure.engineImports) findings.push({ file: hit.file, reference: hit.value, rule: RULE_SHOWCASE_ENGINE });
    for (const file of closure.files) {
      for (const ref of extractJsRefs(readFileSync(path.join(distRoot, file), 'utf8'))) {
        const classified = classifyRef(ref.value);
        if (classified.kind !== 'local') continue;
        const target = resolveTarget(file, classified.path);
        if (target !== null && isEngineTarget(target)) findings.push({ file, reference: ref.value, rule: RULE_SHOWCASE_ENGINE });
      }
    }
    if (closure.size > SHOWCASE_MAX_BYTES) {
      findings.push({ file: page, reference: `${String(closure.size)} bytes > ${String(SHOWCASE_MAX_BYTES)}`, rule: RULE_SHOWCASE_SIZE });
    }
  } else {
    if (closure.size > ENTRY_MAX_BYTES) {
      findings.push({ file: page, reference: `${String(closure.size)} bytes > ${String(ENTRY_MAX_BYTES)}`, rule: RULE_ENTRY_SIZE });
    }
    for (const hit of closure.engineImports) findings.push({ file: hit.file, reference: hit.value, rule: RULE_ENTRY_STATIC });
    for (const file of closure.files) {
      if (path.posix.basename(file).startsWith('showcase-')) findings.push({ file: page, reference: file, rule: RULE_LANDING_SHOWCASE });
    }
  }
  return entries;
}

/**
 * Every package of the landing bundle (and its engine chunks) needs a license section in the notices file.
 * @param {string} distRoot
 * @param {string[]} files
 * @param {string | readonly { name: string, version: string }[]} source a manifest path or the list
 * @param {Finding[]} findings
 */
function checkNotices(distRoot, files, source, findings) {
  /** @type {readonly { name: string, version: string }[]} */
  let packages;
  try {
    packages = typeof source === 'string' ? readManifest(source) : source;
  } catch {
    findings.push({ file: NOTICE_FILE, reference: typeof source === 'string' ? source : '(list)', rule: RULE_NOTICE_LIST });
    return;
  }
  if (packages.length === 0) {
    findings.push({ file: NOTICE_FILE, reference: '(no package)', rule: RULE_NOTICE_LIST });
    return;
  }
  if (!files.includes(NOTICE_FILE)) return; // the structure rule reports the missing file
  const text = readFileSync(path.join(distRoot, NOTICE_FILE), 'utf8');
  for (const pkg of missingFromNotices(text, packages)) {
    findings.push({ file: NOTICE_FILE, reference: `${pkg.name} ${pkg.version}`, rule: RULE_NOTICE_PACKAGE });
  }
}

/**
 * The wasm and worker references of the two engines, for the real-dist test (site-live Requirement 15, criterion 2).
 * Hand: `engine-hand-*.js`, `hand-worker-*.js`, and `sim-worker-*.js`. Shell: `engine-light-*.js` and `worker-entry-*.js`.
 * @param {string} distRoot
 * @returns {{ handWasm: Ref[], shellWasm: Ref[], handWorker: Ref[], shellWorker: Ref[] }}
 *   each entry is `{ file, value, target, exists }`
 */
export function findEngineReferences(distRoot) {
  const files = listFiles(distRoot);
  const fileSet = new Set(files);
  const collect = (names, wanted) => {
    const found = [];
    for (const file of files) {
      if (!names.test(file)) continue;
      for (const ref of extractJsRefs(readFileSync(path.join(distRoot, file), 'utf8'))) {
        if (!wanted.test(ref.value)) continue;
        const classified = classifyRef(ref.value);
        if (classified.kind !== 'local') continue;
        const target = resolveTarget(file, classified.path);
        found.push({ file, value: ref.value, target, exists: target !== null && fileSet.has(target) });
      }
    }
    return found;
  };
  const hand = /^assets\/(?:engine-hand|hand-worker|sim-worker)-[^/]+\.js$/;
  const shell = /^assets\/(?:engine-light|worker-entry)-[^/]+\.js$/;
  const wasm = /\.wasm$/i;
  return {
    handWasm: collect(hand, wasm),
    shellWasm: collect(shell, wasm),
    handWorker: collect(hand, /(?:hand|sim)-worker-[^/]*\.js$/),
    shellWorker: collect(shell, /worker-entry-[^/]*\.js$/),
  };
}

/**
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  return findings.map((finding) => `${finding.file}  ${finding.reference}  ${finding.rule}`).join('\n');
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distRoot = path.resolve(process.argv[2] ?? path.join(here, '..', 'dist'));
  if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
    console.error(`${distRoot}  (directory)  site-dist-missing: run the build first`);
    process.exit(1);
  }
  const manifest = path.join(here, '..', 'build', 'bundled-packages.json');
  const findings = checkSite(distRoot, { bundledPackages: manifest });
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exit(1);
  }
  console.log(`site check: ${listFiles(distRoot).length} files, no findings`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

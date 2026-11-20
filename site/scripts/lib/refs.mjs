// Reference extraction for the Site_Check (design Component 12).
// Pure functions over file text: no file system access and no network call.

import { JSDOM } from 'jsdom';

/**
 * @typedef {{ file: string, reference: string, rule: string }} Finding
 * @typedef {'href' | 'src' | 'srcset' | 'poster' | 'action' | 'css-url' | 'css-import' | 'js-import' | 'js-new-url' | 'js-worker'} RefSource
 * @typedef {{ value: string, source: RefSource, tag?: string, rel?: string }} Reference
 * @typedef {{ kind: 'local', path: string, query: string, fragment: string }
 *   | { kind: 'fragment', fragment: string }
 *   | { kind: 'external' }
 *   | { kind: 'other' }
 *   | { kind: 'empty' }} Classified
 */

const HTML_ATTRIBUTES = ['href', 'src', 'srcset', 'poster', 'action'];
const EXTERNAL_PATTERN = /^(?:https?:|wss?:|ftp:|data:|\/\/)/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Classify one reference value. `data:` counts as external (Requirement 20 glossary).
 * @param {string} value
 * @returns {Classified}
 */
export function classifyRef(value) {
  const text = value.trim();
  if (text === '') return { kind: 'empty' };
  if (EXTERNAL_PATTERN.test(text)) return { kind: 'external' };
  if (text.startsWith('#')) return { kind: 'fragment', fragment: text.slice(1) };
  if (SCHEME_PATTERN.test(text)) return { kind: 'other' };
  const hashAt = text.indexOf('#');
  const beforeHash = hashAt === -1 ? text : text.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : text.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);
  return { kind: 'local', path, query, fragment };
}

/**
 * Split one srcset value into its candidate URLs.
 * @param {string} srcset
 * @returns {string[]}
 */
function srcsetUrls(srcset) {
  const urls = [];
  for (const candidate of srcset.split(',')) {
    const first = candidate.trim().split(/\s+/)[0];
    if (first) urls.push(first);
  }
  return urls;
}

/**
 * @param {string} html
 * @returns {Reference[]}
 */
export function extractHtmlRefs(html) {
  const dom = new JSDOM(html);
  const refs = [];
  const selector = HTML_ATTRIBUTES.map((name) => `[${name}]`).join(',');
  for (const element of dom.window.document.querySelectorAll(selector)) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'base') continue; // not honored: the policy has base-uri 'none'
    const rel = element.getAttribute('rel') ?? undefined;
    for (const name of HTML_ATTRIBUTES) {
      const raw = element.getAttribute(name);
      if (raw === null) continue;
      const values = name === 'srcset' ? srcsetUrls(raw) : [raw.trim()];
      for (const value of values) {
        if (value === '') continue;
        refs.push(rel === undefined ? { value, source: name, tag } : { value, source: name, tag, rel });
      }
    }
  }
  dom.window.close();
  return refs;
}

/**
 * @param {string} css
 * @returns {Reference[]}
 */
export function extractCssRefs(css) {
  const refs = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // `@import "x"` (string form); the `@import url(x)` form is found by the url() pattern below.
  for (const match of text.matchAll(/@import\s+(["'])([^"'\n]*)\1/gi)) {
    refs.push({ value: (match[2] ?? '').trim(), source: 'css-import' });
  }
  for (const match of text.matchAll(/url\(\s*(?:(["'])([^"'\n]*)\1|([^)"'\s]*))\s*\)/gi)) {
    refs.push({ value: (match[2] ?? match[3] ?? '').trim(), source: 'css-url' });
  }
  return refs.filter((ref) => ref.value !== '');
}

const STR = String.raw`(["'\`])([^"'\`$\\\n]+)\1`;
const JS_PATTERNS = [
  { source: 'js-import', dynamic: true, regex: new RegExp(String.raw`\bimport\s*\(\s*${STR}\s*[,)]`, 'g') },
  { source: 'js-import', regex: new RegExp(String.raw`\bimport\s*${STR}`, 'g') },
  { source: 'js-import', regex: new RegExp(String.raw`[}*\w$]\s*\bfrom\s*${STR}`, 'g') },
  // The base is `import.meta.url`, or `self.location.href` (the Shell SQL worker names its wasm file this way).
  {
    source: 'js-new-url',
    regex: new RegExp(String.raw`\bnew\s+URL\s*\(\s*${STR}\s*,\s*(?:import\.meta\.url|(?:self\.)?location\.href)\s*\)`, 'g'),
  },
  { source: 'js-worker', regex: new RegExp(String.raw`\bnew\s+(?:Shared)?Worker\s*\(\s*${STR}`, 'g') },
];

/**
 * Static string targets only. Dynamic expressions (variables, template holes, concatenation) are skipped.
 * @param {string} js
 * @returns {Reference[]}
 */
export function extractJsRefs(js) {
  const refs = [];
  for (const { source, regex } of JS_PATTERNS) {
    for (const match of js.matchAll(regex)) {
      const value = (match[2] ?? '').trim();
      if (value !== '') refs.push({ value, source });
    }
  }
  return refs;
}

/**
 * Static import targets only (`import "x"`, `import {a} from "x"`, `export * from "x"`).
 * A dynamic `import("x")` is not included (site-live Requirement 15, criterion 3).
 * @param {string} js
 * @returns {string[]}
 */
export function extractStaticImports(js) {
  const targets = [];
  for (const { source, dynamic, regex } of JS_PATTERNS) {
    if (source !== 'js-import' || dynamic === true) continue;
    for (const match of js.matchAll(regex)) {
      const value = (match[2] ?? '').trim();
      if (value !== '') targets.push(value);
    }
  }
  return targets;
}

/**
 * Extract the references of one file by its extension. Other types give none.
 * @param {string} filePath
 * @param {string} text
 * @returns {Reference[]}
 */
export function extractRefs(filePath, text) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html')) return extractHtmlRefs(text);
  if (lower.endsWith('.css')) return extractCssRefs(text);
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return extractJsRefs(text);
  return [];
}

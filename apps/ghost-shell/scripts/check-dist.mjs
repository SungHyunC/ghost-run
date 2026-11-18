#!/usr/bin/env node
// Static check of the built page: it must not load or point at anything outside its own origin.
// Node 20, no dependencies. Usage: node scripts/check-dist.mjs [distDir]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEXT_EXTENSIONS = ['.html', '.js', '.mjs', '.css', '.json', '.webmanifest'];

const HTML_RESOURCE_ATTRIBUTES = {
  script: 'src',
  link: 'href',
  img: 'src',
  iframe: 'src',
  form: 'action',
  base: 'href',
};

export function loadAllowlist(path = join(SCRIPT_DIR, 'dist-url-allowlist.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root, '');
  return out;
}

function extensionOf(file) {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot).toLowerCase();
}

function baseName(file) {
  const slash = file.lastIndexOf('/');
  return slash < 0 ? file : file.slice(slash + 1);
}

// "*" matches any run of characters; the pattern is tested against the base name.
function fileMatches(pattern, file) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(baseName(file));
}

function hostOf(url) {
  const m = /^https?:\/\/([^/?#]*)/i.exec(url);
  if (m === null) return '';
  let authority = m[1] ?? '';
  const at = authority.lastIndexOf('@');
  if (at >= 0) authority = authority.slice(at + 1);
  authority = authority.replace(/:\d*$/, '');
  return authority.toLowerCase();
}

function pathOf(url) {
  const m = /^https?:\/\/[^/?#]*(.*)$/i.exec(url);
  return m === null ? '' : (m[1] ?? '');
}

function hostEntryAllows(entry, host, urlPath) {
  let hostOk = false;
  if (typeof entry.suffix === 'string') {
    const suffix = entry.suffix.replace(/^\./, '').toLowerCase();
    hostOk = host === suffix || host.endsWith(`.${suffix}`);
  } else if (typeof entry.host === 'string') {
    hostOk = host === entry.host.toLowerCase();
  }
  if (!hostOk) return false;
  if (typeof entry.pathPrefix === 'string') return urlPath.startsWith(entry.pathPrefix);
  return true;
}

function hasForbiddenScheme(value) {
  const v = value.trim();
  if (v.startsWith('//') || v.startsWith('\\\\')) return true;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  return m !== null && (m[1] ?? '').toLowerCase() !== 'data';
}

function checkHtml(file, text, add) {
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const tag of text.matchAll(tagPattern)) {
    const name = (tag[1] ?? '').toLowerCase();
    const wanted = HTML_RESOURCE_ATTRIBUTES[name];
    if (wanted === undefined) continue;
    for (const attr of (tag[0] ?? '').matchAll(attrPattern)) {
      if ((attr[1] ?? '').toLowerCase() !== wanted) continue;
      const value = attr[2] ?? attr[3] ?? attr[4] ?? '';
      if (hasForbiddenScheme(value)) {
        add(file, `<${name} ${wanted}> points outside the page: ${value}`);
      }
    }
  }
}

function checkCss(file, text, add) {
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/gi)) {
    const target = m[2] ?? '';
    if (hasForbiddenScheme(target)) add(file, `CSS @import points outside the page: ${target}`);
  }
  for (const m of text.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) {
    const target = m[2] ?? '';
    if (hasForbiddenScheme(target)) add(file, `CSS url() points outside the page: ${target}`);
  }
}

function checkUrls(file, text, allowlist, add, seen) {
  for (const m of text.matchAll(/https?:\/\/[^\s"'`()<>\\]+/gi)) {
    const url = m[0];
    const exact = (allowlist.strings ?? []).find(
      (entry) => entry.value === url && fileMatches(entry.files ?? '*', file),
    );
    if (exact !== undefined) {
      seen.strings.add(url);
      continue;
    }
    const host = hostOf(url);
    const urlPath = pathOf(url);
    const hostEntry = (allowlist.hosts ?? []).find((entry) => hostEntryAllows(entry, host, urlPath));
    if (hostEntry !== undefined) {
      seen.hosts.add(host);
      continue;
    }
    add(file, `URL with a host that is not allowed (${host}): ${url}`);
  }
  for (const m of text.matchAll(/url\(\s*["']?\/\/[^\s"')]+/gi)) {
    add(file, `protocol-relative URL: ${m[0]}`);
  }
}

function checkJs(file, text, add) {
  for (const m of text.matchAll(/(["'`])node:[\w/.-]+\1/g)) {
    add(file, `node: specifier ${m[0]}`);
  }
  const targets = [
    ...text.matchAll(/new\s+(?:Shared)?Worker\s*\(\s*new\s+URL\(\s*(["'`])([^"'`]*)\1/g),
    ...text.matchAll(/new\s+URL\(\s*(["'`])([^"'`]*)\1\s*,\s*import\.meta\.url/g),
  ];
  for (const m of targets) {
    const target = m[2] ?? '';
    if (hasForbiddenScheme(target) || target.startsWith('/')) {
      add(file, `worker or asset new URL() target is not relative: ${target}`);
    }
  }
}

function checkProtocolRelativeAttributes(file, text, add) {
  for (const m of text.matchAll(/\s[a-zA-Z-]+\s*=\s*["']\s*\/\/[a-zA-Z0-9][^"']*["']/g)) {
    add(file, `protocol-relative URL in an attribute:${m[0]}`);
  }
}

/**
 * Checks one dist directory. Returns the findings (one `file: message` line each) and the sorted
 * allowed hosts and strings that were seen.
 */
export function checkDist(distDir, allowlist) {
  const findings = [];
  const seen = { hosts: new Set(), strings: new Set() };
  const reported = new Set();
  const add = (file, message) => {
    const line = `${file}: ${message}`;
    if (!reported.has(line)) {
      reported.add(line);
      findings.push(line);
    }
  };

  const files = listFiles(distDir);
  const jsTexts = [];
  for (const file of files) {
    const ext = extensionOf(file);
    if (!TEXT_EXTENSIONS.includes(ext)) continue;
    const text = readFileSync(join(distDir, file), 'utf8');
    if (ext === '.html') {
      checkHtml(file, text, add);
      checkProtocolRelativeAttributes(file, text, add);
    }
    if (ext === '.css') checkCss(file, text, add);
    if (ext === '.js' || ext === '.mjs') {
      checkJs(file, text, add);
      jsTexts.push(text);
    }
    checkUrls(file, text, allowlist, add, seen);
  }

  const wasmFiles = files.filter((file) => extensionOf(file) === '.wasm');
  if (wasmFiles.length === 0) {
    add('dist', 'no .wasm file');
  } else {
    for (const wasm of wasmFiles) {
      const name = baseName(wasm);
      if (!jsTexts.some((text) => text.includes(name))) {
        add(wasm, `the .wasm file name ${name} is not referenced from any JS file`);
      }
    }
  }
  if (!files.includes('_headers')) add('_headers', 'file is missing');

  return {
    findings,
    hosts: [...seen.hosts].sort(),
    strings: [...seen.strings].sort(),
  };
}

function main() {
  const distDir = resolve(process.argv[2] ?? join(SCRIPT_DIR, '..', 'dist'));
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`dist: directory not found: ${distDir}`);
    process.exit(1);
  }
  const result = checkDist(distDir, loadAllowlist());
  console.log('allowed hosts seen:');
  for (const host of result.hosts) console.log(`  ${host}`);
  console.log('allowed strings seen:');
  for (const value of result.strings) console.log(`  ${value}`);
  if (result.findings.length > 0) {
    for (const line of result.findings) console.error(line);
    process.exit(1);
  }
  console.log('check-dist: ok');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

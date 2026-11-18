// Hygiene scan (task 10.3). Reads ui/ and .kiro/specs/ui-kit/ with node:fs and checks:
// hidden text (scanTexts), reserved hosts, canary secrets, .gitignore, and property titles.
// Hidden characters and the comment opener are built from escapes and concatenation here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanTexts } from '@ghost-run/core';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(UI_ROOT, '..');
const SPEC_ROOT = join(REPO_ROOT, '.kiro', 'specs', 'ui-kit');
const SELF = 'ui/tests/scan/hygiene.test.ts';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.zip']);

interface SourceFile {
  readonly path: string; // repo-relative, forward slashes
  readonly text: string;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out);
    } else if (st.isFile()) {
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
      if (!BINARY_EXT.has(ext)) out.push(full);
    }
  }
}

function readTree(root: string): SourceFile[] {
  const paths: string[] = [];
  walk(root, paths);
  return paths.map((full) => ({
    path: relative(REPO_ROOT, full).split('\\').join('/'),
    text: readFileSync(full, 'utf8'),
  }));
}

// ---------- rules (pure, also self-tested below) ----------

const RESERVED_SUFFIXES = ['example', 'test', 'localhost', 'invalid'];
const REAL_TLDS =
  'com|net|org|io|dev|app|co|ai|cloud|gov|edu|info|biz|xyz|me|us|uk|kr|jp|de|fr|ru|cn|in|sh|tv|so|site|online';
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@'"`<>]*@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])/g;
const BARE_HOST = new RegExp(`\\b(?:[A-Za-z0-9-]+\\.)+(?:${REAL_TLDS})\\b(?![.\\w-])`, 'gi');
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)(?!\.\w)/g;

// Not fetched hosts: the W3C XML/SVG namespace identifiers and the IPv4 loopback address.
const NON_NETWORK_HOSTS = new Set(['www.w3.org', '127.0.0.1']);

function hostIsReserved(host: string): boolean {
  if (NON_NETWORK_HOSTS.has(host.toLowerCase())) return true;
  const tld = host.toLowerCase().replace(/\.$/, '').split('.').pop() ?? '';
  return RESERVED_SUFFIXES.includes(tld) || host.toLowerCase() === 'localhost';
}

/** Hosts and IPs in `text` that are not reserved. */
function findBadHosts(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(URL_HOST)) {
    const host = m[1] ?? '';
    if (/^\d+(\.\d+){3}$/.test(host)) continue; // handled by the IP rule
    if (!hostIsReserved(host)) bad.push(host);
  }
  for (const m of text.matchAll(BARE_HOST)) {
    if (!hostIsReserved(m[0])) bad.push(m[0]);
  }
  for (const m of text.matchAll(IPV4)) {
    const octets = [m[1], m[2], m[3], m[4]].map(Number);
    if (octets.some((n) => n > 255)) continue; // not an address (for example a version string)
    if (NON_NETWORK_HOSTS.has(m[0])) continue;
    const inDocRange = octets[0] === 192 && octets[1] === 0 && octets[2] === 2;
    if (!inDocRange) bad.push(m[0]);
  }
  for (const m of text.matchAll(URL_HOST)) {
    const host = m[1] ?? '';
    if (/^\d+(\.\d+){3}$/.test(host)) {
      const o = host.split('.').map(Number);
      if (!(o[0] === 192 && o[1] === 0 && o[2] === 2) && !NON_NETWORK_HOSTS.has(host)) bad.push(host);
    }
  }
  return [...new Set(bad)];
}

const CANARY_PREFIX = 'sk-CANARY-';
const REAL_SECRET_SHAPES: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

/** Secret-looking tokens in `text` that are not `sk-CANARY-...`. */
function findBadSecrets(text: string): string[] {
  const bad: string[] = [];
  for (const shape of REAL_SECRET_SHAPES) {
    for (const m of text.matchAll(shape)) {
      if (!m[0].startsWith(CANARY_PREFIX)) bad.push(m[0]);
    }
  }
  return bad;
}

/** True when a line of the ignore file names `name` (optionally with slashes). */
function gitignoreLists(text: string, name: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const t = line.trim();
    return t === name || t === `${name}/` || t === `/${name}` || t === `/${name}/` || t === `**/${name}`;
  });
}

const TITLE_CALL = /\b(?:describe|it|test)(?:\.[A-Za-z]+)*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const SAFETY_P = /(?<![A-Za-z0-9-])P[1-8](?![0-9])/;

function extractTitles(source: string): string[] {
  return [...source.matchAll(TITLE_CALL)].map((m) => m[2] ?? '');
}

/** Titles that name P1..P8 of the safety contract. */
function titlesNamingSafetyProperties(source: string): string[] {
  return extractTitles(source).filter((t) => SAFETY_P.test(t));
}

// ---------- scan over the real tree ----------

const uiFiles = readTree(UI_ROOT);
const specFiles = readTree(SPEC_ROOT);
const allFiles = [...uiFiles, ...specFiles];
const testFiles = uiFiles.filter(
  (f) => /\/tests\/.*\.test\.tsx?$/.test(f.path) && f.path !== SELF,
);

describe('hygiene: hidden text in ui/ and the ui-kit spec', () => {
  it('reads a non-trivial tree without dist or node_modules', () => {
    expect(uiFiles.length).toBeGreaterThan(20);
    expect(specFiles.length).toBeGreaterThan(0);
    expect(allFiles.some((f) => f.path.includes('/node_modules/') || f.path.startsWith('ui/dist/'))).toBe(false);
  });

  it('scanTexts reports clean: no literal hidden code point and no literal comment opener', () => {
    const report = scanTexts(allFiles.map((f) => ({ path: f.path, text: f.text })));
    const offenders = report.files.filter((f) => f.findings.length > 0 || f.error !== undefined);
    expect(offenders.map((f) => `${f.path}: ${f.findings.length} findings`)).toEqual([]);
    expect(report.outcome).toBe('clean');
  });
});

describe('hygiene: reserved hosts and canary secrets', () => {
  it('names only reserved hosts or 192.0.2.0/24 addresses', () => {
    const offenders = allFiles
      .map((f) => ({ path: f.path, bad: findBadHosts(f.text) }))
      .filter((o) => o.bad.length > 0);
    expect(offenders).toEqual([]);
  });

  it('names secrets only of the form sk-CANARY-', () => {
    const offenders = allFiles
      .map((f) => ({ path: f.path, bad: findBadSecrets(f.text) }))
      .filter((o) => o.bad.length > 0);
    expect(offenders).toEqual([]);
  });
});

describe('hygiene: .gitignore', () => {
  it('lists dist and node_modules', () => {
    const text = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gitignoreLists(text, 'dist')).toBe(true);
    expect(gitignoreLists(text, 'node_modules')).toBe(true);
  });
});

describe('hygiene: property titles', () => {
  it('no test title names P1 to P8 of the safety contract', () => {
    const offenders = testFiles
      .map((f) => ({ path: f.path, titles: titlesNamingSafetyProperties(f.text) }))
      .filter((o) => o.titles.length > 0);
    expect(offenders).toEqual([]);
  });

  it('test titles name every render property UI-P1 to UI-P11', () => {
    const titles = testFiles.flatMap((f) => extractTitles(f.text));
    const missing: string[] = [];
    for (let i = 1; i <= 11; i += 1) {
      const tag = new RegExp(`\\bUI-P${i}(?![0-9])`);
      if (!titles.some((t) => tag.test(t))) missing.push(`UI-P${i}`);
    }
    expect(missing).toEqual([]);
  });
});

// ---------- self-tests on in-memory strings ----------

describe('hygiene self-test: rules detect violations', () => {
  const ZWSP = String.fromCharCode(0x200b);
  const TAG_A = String.fromCodePoint(0xe0041);
  const OPENER = '<' + '!' + '--';

  it('scanTexts flags a zero-width space', () => {
    const r = scanTexts([{ path: 'a.ts', text: `x${ZWSP}y` }]);
    expect(r.outcome).toBe('findings');
  });

  it('scanTexts flags a tag character', () => {
    const r = scanTexts([{ path: 'a.ts', text: `x${TAG_A}y` }]);
    expect(r.outcome).toBe('findings');
  });

  it('scanTexts flags a comment opener in markdown', () => {
    const r = scanTexts([{ path: 'a.md', text: `hello ${OPENER} hidden -->` }]);
    expect(r.outcome).toBe('findings');
  });

  it('scanTexts passes plain text', () => {
    expect(scanTexts([{ path: 'a.md', text: 'plain text' }]).outcome).toBe('clean');
  });

  it('host rule flags real domains, real URLs, and real IPs', () => {
    const site = 'api.real-site.' + 'com';
    const docs = 'docs.' + 'io';
    const dns = ['8', '8', '8', '8'].join('.');
    const priv = ['10', '0', '0', '1'].join('.');
    expect(findBadHosts('fetch https://' + site + '/x')).toEqual([site]);
    expect(findBadHosts('see ' + docs)).toEqual([docs]);
    expect(findBadHosts('ip ' + dns)).toEqual([dns]);
    expect(findBadHosts('url http://' + priv + '/a')).toEqual([priv]);
  });

  it('host rule accepts reserved hosts and the documentation range', () => {
    expect(findBadHosts('https://x.example/a http://sink.invalid collector.test evil.localhost')).toEqual([]);
    expect(findBadHosts('http://localhost:3000 ' + ['192', '0', '2', '55'].join('.'))).toEqual([]);
    expect(findBadHosts('version 1.2.3 and 300.1.1.1 axe.run(x) http://www.w3.org/2000/svg')).toEqual([]);
  });

  it('secret rule flags non-canary secrets and accepts canaries', () => {
    const live = 'sk-' + 'live1234567890abcdef';
    expect(findBadSecrets('key ' + live)).toEqual([live]);
    expect(findBadSecrets('key ' + 'AKIA' + 'ABCDEFGHIJKLMNOP')).toHaveLength(1);
    expect(findBadSecrets('key ' + 'ghp_' + 'a'.repeat(30))).toHaveLength(1);
    expect(findBadSecrets('-----BEGIN ' + 'RSA PRIVATE KEY-----')).toHaveLength(1);
    expect(findBadSecrets('API_KEY=sk-CANARY-abc123')).toEqual([]);
  });

  it('gitignore rule requires an exact entry', () => {
    expect(gitignoreLists('node_modules/\ndist/\n', 'dist')).toBe(true);
    expect(gitignoreLists('/dist\n', 'dist')).toBe(true);
    expect(gitignoreLists('# dist\nmydist\napps/x/dist\n', 'dist')).toBe(false);
    expect(gitignoreLists('', 'node_modules')).toBe(false);
  });

  it('title rule flags P1..P8 and accepts UI-P1..UI-P11', () => {
    const bad = (t: string): string => `describe('${t}', () => {});`;
    expect(titlesNamingSafetyProperties(bad('P1 ghost run'))).toHaveLength(1);
    expect(titlesNamingSafetyProperties(bad('claims P8 holds'))).toHaveLength(1);
    expect(titlesNamingSafetyProperties(`it("P3: restore", () => {})`)).toHaveLength(1);
    expect(titlesNamingSafetyProperties(bad('UI-P1 change coverage'))).toEqual([]);
    expect(titlesNamingSafetyProperties(bad('UI-P11 something'))).toEqual([]);
    expect(titlesNamingSafetyProperties(bad('P9 is not a safety property'))).toEqual([]);
    expect(extractTitles(bad('UI-P4: x'))).toEqual(['UI-P4: x']);
  });
});

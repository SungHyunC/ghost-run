import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_URL } from '../../src/config';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = resolve(SITE, '../.kiro/specs/site');
const SELF = fileURLToPath(import.meta.url);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite']);
const TEXT = /\.(ts|tsx|mjs|js|css|json|md|html|svg|yaml|yml)$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(full);
    return e.isFile() ? [full] : [];
  });
}

const textFiles = (root: string): string[] => walk(root).filter((f) => TEXT.test(f) && f !== SELF);
const all = [...textFiles(SITE), ...textFiles(SPEC)];
const src = textFiles(join(SITE, 'src'));
const read = (f: string): string => readFileSync(f, 'utf8');
const label = (f: string): string => relative(SITE, f);

/** Files in which `re` matches, as readable labels. */
function hits(files: string[], re: RegExp): string[] {
  return files.filter((f) => re.test(read(f))).map(label);
}

// Built from code points so that this file holds no literal hidden character.
const HIDDEN = new RegExp(
  '[' +
    '\\u{E0000}-\\u{E007F}' +
    '\\u200B-\\u200D\\u2060\\uFEFF' +
    '\\u202A-\\u202E\\u2066-\\u2069' +
    ']',
  'u',
);
const COMMENT_OPENER = new RegExp(['<', '!', '-', '-'].join(''));
// Scripts other than Latin: Hangul, CJK, kana, Cyrillic, Greek, Arabic, Hebrew, Thai, Devanagari.
const NON_ENGLISH = /[\u0370-\u03FF\u0400-\u04FF\u0590-\u06FF\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u9FFF\uAC00-\uD7AF]/u;

describe('site hygiene scan', () => {
  it('scans files and does not scan itself', () => {
    expect(all.length).toBeGreaterThan(50);
    expect(all).not.toContain(SELF);
  });

  it('has no literal hidden Unicode character', () => {
    expect(hits(all, HIDDEN)).toEqual([]);
  });

  it('has no literal HTML comment opener', () => {
    expect(hits(all, COMMENT_OPENER)).toEqual([]);
  });

  it('has no non-English text', () => {
    expect(hits(all, NON_ENGLISH)).toEqual([]);
  });
});

describe('page source (src/)', () => {
  const FORBIDDEN: [string, RegExp][] = [
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['WebSocket', /\bWebSocket\b/],
    ['sendBeacon', /\bsendBeacon\b/],
    ['storage API', /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/],
    ['eval', /\beval\s*\(/],
    ['Function constructor', /\bnew\s+Function\b|\bFunction\s*\(/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\b(inner|outer)HTML\b/],
  ];

  it.each(FORBIDDEN)('uses no %s', (_name, re) => {
    expect(hits(src, re)).toEqual([]);
  });

  describe('live source (src/live/)', () => {
    const live = textFiles(join(SITE, 'src', 'live'));
    const LIVE_FORBIDDEN: [string, RegExp][] = [
      ['fetch', /\bfetch\s*\(|\b(globalThis|window|self)\.fetch\b/],
      ['XMLHttpRequest', /\bXMLHttpRequest\b/],
      ['WebSocket', /\bWebSocket\b/],
      ['EventSource', /\bEventSource\b/],
      ['sendBeacon', /\bsendBeacon\b/],
      ['storage API', /\b(localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie/],
    ];

    it('scans the live files', () => {
      expect(live.length).toBeGreaterThan(10);
    });

    it.each(LIVE_FORBIDDEN)('uses no %s', (_name, re) => {
      expect(hits(live, re)).toEqual([]);
    });
  });

  it('makes no LLM API call', () => {
    const re = /openai|anthropic|bedrock-runtime|generativelanguage|chat\/completions|\/v1\/messages/i;
    expect(hits(all, re)).toEqual([]);
  });
});

describe('hosts and secrets', () => {
  const RESERVED = /(^|\.)(example|test|localhost|invalid)$/;
  const urlHosts = (text: string): string[] =>
    [...text.matchAll(/\b(?:https?|wss?|ftp):\/\/([^\s/'"`<>)\\:?#]+)/g)].map((m) => (m[1] ?? '').toLowerCase());
  const repoHost = new URL(REPO_URL).hostname;

  it('uses only reserved hosts, with REPO_URL as the single exception', () => {
    const bad: string[] = [];
    for (const f of all) {
      for (const host of urlHosts(read(f))) {
        const ok = RESERVED.test(host) || /^192\.0\.2\.\d+$/.test(host) || host === repoHost;
        if (!ok) bad.push(`${label(f)}: ${host}`);
      }
    }
    // XML namespace identifiers (xmlns) and the React error decoder are not network targets; the
    // site check allowlist of a later task names them. Only these hosts are tolerated here.
    const tolerated = new Set(['www.w3.org', 'react.dev']);
    expect(bad.filter((b) => !tolerated.has(b.split(': ')[1] ?? ''))).toEqual([]);
    for (const f of src) {
      for (const host of urlHosts(read(f))) {
        if (host === 'react.dev') throw new Error(`${label(f)} names react.dev`);
      }
    }
  });

  it('holds only canary secrets', () => {
    const REAL_KEY = [
      /\bsk-(?!CANARY)[A-Za-z0-9_-]{16,}/,
      /\bghp_[A-Za-z0-9]{20,}/,
      /\bxox[abp]-[A-Za-z0-9-]{10,}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\bAKIA(?![A-Z0-9]*CANARY)[0-9A-Z]{16}\b/,
    ];
    for (const re of REAL_KEY) expect(hits(all, re), String(re)).toEqual([]);
  });

  it('never reads .env content in the record script', () => {
    const files = walk(join(SITE, 'scripts')).filter((f) => /record-runs/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      for (const line of read(f).split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        if (/(^|[^.\w])\.env\b|['"/]\.env\b|dotenv/.test(line)) bad.push(`${label(f)}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('content rules', () => {
  it('has no religious symbol, blood, or Kiro logo asset in public/ or src/', () => {
    const files = [...walk(join(SITE, 'public')), ...walk(join(SITE, 'src'))];
    const names = files.map((f) => f.toLowerCase());
    expect(names.filter((n) => /logo/.test(n.split('/').pop() ?? '') && /\.(svg|png|jpe?g|webp|ico)$/.test(n))).toEqual([]);
    expect(names.filter((n) => /kiro/.test(n.split('/').pop() ?? '') && /\.(svg|png|jpe?g|webp|ico)$/.test(n))).toEqual([]);
    const symbols = /[\u2626\u2628\u262A\u262F\u2638\u2721\u271D\u271E\u271F\u2720\u{1F549}\u{1F54E}\u{1F52F}\u{1F54B}\u{1F6D0}\u{1FA78}]/u;
    expect(hits(files.filter((f) => TEXT.test(f)), symbols)).toEqual([]);
    expect(hits(files.filter((f) => TEXT.test(f)), /\bblood(y)?\b/i)).toEqual([]);
  });
});

// Feature: ghost-cloud, Property 16: Hygiene scans
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6**
// Forbidden words are built from fragments so this file never matches itself,
// and the scans skip this file and tests/scan-imports.test.ts' own patterns only where noted.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const specRoot = fileURLToPath(new URL('../../../.kiro/specs/ghost-cloud/', import.meta.url));
const SELF = join(root, 'tests', 'scan-hygiene.test.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(root, file);
const j = (...parts: string[]): string => parts.join('');

const srcFiles = walk(join(root, 'src')).filter((f) => f.endsWith('.ts'));
const sourceFiles = [...srcFiles, join(root, 'world.config.ts')];
const worldFiles = walk(root).filter((f) => f !== SELF);
const specFiles = walk(specRoot);
const allFiles = [...worldFiles, ...specFiles];

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  [j('ev', 'al('), new RegExp(String.raw`(^|[^\w.$])` + j('ev', 'al') + String.raw`\s*\(`)],
  [j('new ', 'Func', 'tion'), new RegExp(j('new\\s+Func', 'tion\\b'))],
  [j('Date', '.now'), new RegExp(j('\\bDate\\s*\\.\\s*', 'now\\b'))],
  [j('new ', 'Date'), new RegExp(j('new\\s+Da', 'te\\b'))],
  [j('Math', '.random'), new RegExp(j('\\bMath\\s*\\.\\s*', 'random\\b'))],
  [j('local', 'Storage'), new RegExp(j('local', 'Storage'))],
  [j('session', 'Storage'), new RegExp(j('session', 'Storage'))],
  [j('indexed', 'DB'), new RegExp(j('indexed', 'DB'))],
  [j('fet', 'ch'), new RegExp(j('\\bfet', 'ch\\b'))],
  [j('XMLHttp', 'Request'), new RegExp(j('XMLHttp', 'Request'))],
  [j('Web', 'Socket'), new RegExp(j('Web', 'Socket'))],
  [j('process', '.env'), new RegExp(j('\\bprocess\\s*\\.\\s*', 'env\\b'))],
  [j('con', 'sole.'), new RegExp(j('\\bcon', 'sole\\s*\\.'))],
];

const HIDDEN = new RegExp(
  '[\\u{E0000}-\\u{E007F}\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
  'u',
);
const HTML_COMMENT_OPENER = j('<', '!', '--');

describe('world hygiene', () => {
  it('scans a non-trivial set of files', () => {
    expect(srcFiles.map(rel)).toContain(join('src', 'world.ts'));
    expect(worldFiles.length).toBeGreaterThan(20);
    expect(specFiles.map((f) => relative(specRoot, f)).sort()).toEqual([
      'design.md',
      'requirements.md',
      'tasks.md',
    ]);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`no ${label} in src or world.config.ts`, () => {
      const hits = sourceFiles.filter((f) => pattern.test(read(f))).map(rel);
      expect(hits).toEqual([]);
    });
  }

  it('contains no hidden Unicode character in the world or the spec', () => {
    const hits = allFiles.filter((f) => HIDDEN.test(read(f))).map((f) => f);
    expect(hits).toEqual([]);
  });

  it('contains no HTML comment opener in the world or the spec', () => {
    const hits = allFiles.filter((f) => read(f).includes(HTML_COMMENT_OPENER));
    expect(hits).toEqual([]);
  });

  it('text files are ASCII except for a short allowed set of typographic marks', () => {
    const NON_ASCII = /[^\x00-\x7F]/;
    const hits = allFiles
      .filter((f) => /\.(ts|md|yaml|txt|json|mjs)$/.test(f) && NON_ASCII.test(read(f)))
      .map((f) => f);
    expect(hits).toEqual([]);
  });

  it('every http and https host uses a reserved name', () => {
    const RESERVED = /(\.example|\.test|\.localhost|\.invalid)$|^localhost$/;
    const IPV4_DOC = /^192\.0\.2\.\d{1,3}$/;
    const offenders: string[] = [];
    for (const f of allFiles) {
      for (const m of read(f).matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
        const host = (m[1] as string).toLowerCase().replace(/\.$/, '');
        if (!RESERVED.test(host) && !IPV4_DOC.test(host)) offenders.push(`${f}: ${host}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('writes no user name or home path', () => {
    const patterns = [
      new RegExp(j('/Us', 'ers/')),
      new RegExp(j('/ho', 'me/[a-z]')),
      new RegExp(j('C:\\\\\\\\Us', 'ers')),
      new RegExp(j('gimseong', 'hyeon')),
    ];
    const hits = allFiles.filter((f) => patterns.some((p) => p.test(read(f))));
    expect(hits).toEqual([]);
  });

  it('uses canary values only for secrets', () => {
    const SECRET = /\b(sk|AKIA|ghp|xox[bp])[-_][A-Za-z0-9-]{8,}/g;
    const offenders: string[] = [];
    for (const f of allFiles) {
      for (const m of read(f).matchAll(SECRET)) {
        if (!/CANARY/i.test(m[0])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// Repository hygiene scans for the Ghost Shell app, the playground world, and the ghost-shell spec (task 17.1).
// Forbidden words are built from fragments and hidden characters from escapes, so this file never matches itself.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTexts } from '@ghost-run/core';
import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = join(appRoot, '..', '..');
const worldRoot = join(repoRoot, 'worlds', 'playground-shell');
const specRoot = join(repoRoot, '.kiro', 'specs', 'ghost-shell');

const SKIP_DIRS = new Set(['node_modules', 'dist']);
const BINARY_EXT = /\.(wasm|png|jpe?g|gif|webp|ico|woff2?|ttf|db|sqlite|zip|gz)$/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function isText(file: string): boolean {
  if (BINARY_EXT.test(file) || file.endsWith('.DS_Store')) return false;
  return !readFileSync(file).includes(0);
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(repoRoot, file).split(sep).join('/');
const j = (...parts: string[]): string => parts.join('');
const inside = (file: string, dir: string): boolean => file.startsWith(dir + sep);

const appFiles = walk(appRoot).filter(isText);
const worldFiles = walk(worldRoot).filter(isText);
const specFiles = walk(specRoot).filter(isText);
const allFiles = [...appFiles, ...worldFiles, ...specFiles];

const appSrc = appFiles.filter((f) => inside(f, join(appRoot, 'src')) && /\.(ts|tsx)$/.test(f));
const worldSrc = worldFiles.filter((f) => inside(f, join(worldRoot, 'src')) && f.endsWith('.ts'));
const pipelineSrc = appSrc.filter((f) => inside(f, join(appRoot, 'src', 'pipeline')));
const interpreterSrc = worldSrc.filter((f) => inside(f, join(worldRoot, 'src', 'shell')));

// Hidden_Display_Code_Points, written as escapes only.
const HIDDEN = new RegExp('[\\u{E0000}-\\u{E007F}\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]', 'u');
const HTML_COMMENT_OPENER = j('<', '!', '--');

const hits = (files: readonly string[], pattern: RegExp): string[] =>
  files.filter((f) => pattern.test(read(f))).map(rel);

describe('hidden characters', () => {
  it('scans a non-trivial set of files', () => {
    expect(appFiles.length).toBeGreaterThan(50);
    expect(worldFiles.length).toBeGreaterThan(20);
    expect(specFiles.length).toBeGreaterThanOrEqual(3);
  });

  it('the possession scan finds the three folders clean', () => {
    const report = scanTexts(allFiles.map((f) => ({ path: rel(f), text: read(f) })));
    expect(report.files.filter((f) => f.findings.length > 0).map((f) => f.path)).toEqual([]);
    expect(report.outcome).toBe('clean');
  });

  it('no literal Hidden_Display_Code_Point in the three folders', () => {
    expect(hits(allFiles, HIDDEN)).toEqual([]);
  });

  it('no literal HTML comment opener in the three folders', () => {
    expect(allFiles.filter((f) => read(f).includes(HTML_COMMENT_OPENER)).map(rel)).toEqual([]);
  });
});

describe('forbidden constructs in apps/ghost-shell/src', () => {
  const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
    [j('ev', 'al('), new RegExp(String.raw`(^|[^\w.$])` + j('ev', 'al') + String.raw`\s*\(`)],
    [j('new ', 'Func', 'tion'), new RegExp(j('new\\s+Func', 'tion\\b'))],
    [j('dangerously', 'SetInnerHTML'), new RegExp(j('dangerously', 'SetInnerHTML'))],
    [j('inner', 'HTML'), new RegExp(j('inner', 'HTML'))],
    [j('local', 'Storage'), new RegExp(j('local', 'Storage'))],
    [j('session', 'Storage'), new RegExp(j('session', 'Storage'))],
    [j('indexed', 'DB'), new RegExp(j('indexed', 'DB'))],
    [j('document', '.cookie'), new RegExp(j('document\\s*\\.\\s*', 'cookie'))],
    [j('con', 'sole.'), new RegExp(j('\\bcon', 'sole\\s*\\.'))],
  ];
  for (const [label, pattern] of FORBIDDEN) {
    it(`no ${label}`, () => {
      expect(hits(appSrc, pattern)).toEqual([]);
    });
  }
});

describe('no clock or randomness in the pipeline, the world, and the interpreter', () => {
  const CLOCK = new RegExp(j('\\bDa', 'te\\b') + '|' + j('\\bMath\\s*\\.\\s*', 'random\\b'));
  it('src/pipeline of the app', () => {
    expect(pipelineSrc.length).toBeGreaterThan(3);
    expect(hits(pipelineSrc, CLOCK)).toEqual([]);
  });
  it('the playground world sources', () => {
    expect(worldSrc.length).toBeGreaterThan(20);
    expect(hits(worldSrc, CLOCK)).toEqual([]);
  });
  it('the interpreter (world shell folder)', () => {
    expect(interpreterSrc.length).toBeGreaterThan(5);
    expect(hits(interpreterSrc, CLOCK)).toEqual([]);
  });
});

describe('no call to an LLM API', () => {
  const LLM = new RegExp(
    [
      j('api\\.open', 'ai\\.com'),
      j('api\\.anthr', 'opic\\.com'),
      j('generativelanguage\\.google', 'apis'),
      j('bedrock-run', 'time'),
      j('/v1/chat/comp', 'letions'),
      j('/v1/mess', 'ages'),
      j('from\\s+[\'"]open', 'ai[\'"]'),
      j('from\\s+[\'"]@anthr', 'opic-ai/sdk[\'"]'),
    ].join('|'),
    'i',
  );
  it('app and world sources contain none', () => {
    expect(hits([...appSrc, ...worldSrc], LLM)).toEqual([]);
  });
});

describe('Canary secrets and reserved hosts', () => {
  const fixtureAndTestFiles = [
    ...appFiles.filter(
      (f) =>
        inside(f, join(appRoot, 'plans')) ||
        inside(f, join(appRoot, 'tests')) ||
        inside(f, join(appRoot, 'src', 'scenarios')),
    ),
    ...worldFiles.filter((f) => inside(f, join(worldRoot, 'tests'))),
  ].filter((f) => rel(f) !== rel(fileURLToPath(import.meta.url)));

  it('every sk- token is a Canary value', () => {
    const bad: string[] = [];
    for (const f of fixtureAndTestFiles) {
      for (const m of read(f).matchAll(/\bsk-[A-Za-z0-9_-]{6,}/g)) {
        if (!m[0].startsWith('sk-CANARY')) bad.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no other credential shape appears', () => {
    const shapes = new RegExp(
      [j('\\bAK', 'IA[A-Z0-9]{12,}'), j('\\bgh', 'p_[A-Za-z0-9]{20,}'), j('\\bxo', 'x[bp]-[A-Za-z0-9-]{10,}'), j('-----BEGIN [A-Z ]*PRIV', 'ATE KEY')].join('|'),
    );
    expect(hits(fixtureAndTestFiles, shapes)).toEqual([]);
  });

  // The check-dist tests feed a dist scanner deliberate foreign hosts; the XML namespace is not a host.
  const HOST_EXEMPT_FILES = new Set(['apps/ghost-shell/tests/scripts/check-dist.test.ts']);
  const OTHER_ALLOWED = new Set(['registry.npmjs.org', 'www.w3.org']);
  const RESERVED = /\.(example|test|localhost|invalid)$/i;

  it('every http and https host uses a reserved suffix', () => {
    const bad: string[] = [];
    for (const f of fixtureAndTestFiles) {
      if (HOST_EXEMPT_FILES.has(rel(f))) continue;
      for (const m of read(f).matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
        const host = (m[1] ?? '').replace(/\.$/, '');
        if (host === '' || host.includes('..') || /^\.+$/.test(host)) continue;
        if (OTHER_ALLOWED.has(host.toLowerCase()) || RESERVED.test(host) || host.toLowerCase() === 'localhost') continue;
        bad.push(`${rel(f)}: ${host}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('package and dependency rules', () => {
  const pkg = JSON.parse(read(join(appRoot, 'package.json'))) as { dependencies: Record<string, string> };
  it('the runtime dependency set is exactly the seven of Requirement 1', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ['@ghost-run/core', '@ghost-run/playground-shell', '@ghost-run/ui', '@ghost-run/wards-config', 'react', 'react-dom', 'sql.js'].sort(),
    );
  });

  it('the installed vite, vitest, and jsdom majors are 7, 3, and 26', () => {
    const require = createRequire(join(appRoot, 'package.json'));
    const major = (name: string): number => {
      const p = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as { version: string };
      return Number(p.version.split('.')[0]);
    };
    expect(major('vite')).toBe(7);
    expect(major('vitest')).toBe(3);
    expect(major('jsdom')).toBe(26);
  });

  it('no source under src imports a banned module', () => {
    const banned = [
      j('@ghost-run/wards-config', '/node'),
      j('@ghost-run/ghost', '-runner'),
      j('th', 'ree'),
      j('@mujoco', '/mujoco'),
      j('integra', 'tions/'),
    ];
    const specifier = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
    const bad: string[] = [];
    for (const f of appSrc) {
      for (const m of read(f).matchAll(specifier)) {
        const spec = m[1] ?? '';
        if (banned.some((b) => spec === b || spec.startsWith(b) || spec.startsWith(`${b}/`) || spec.includes(`/${b}`))) {
          bad.push(`${rel(f)}: ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('property labels', () => {
  it('GS-P labels in the three folders are only GS-P1 to GS-P6', () => {
    const label = /GS-P(\d+)/g;
    const bad: string[] = [];
    for (const f of allFiles) {
      for (const m of read(f).matchAll(label)) {
        const n = Number(m[1]);
        if (n < 1 || n > 6) bad.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

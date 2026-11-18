// World hygiene scans over src/, world.config.ts, and the test support files.
// Forbidden words are built from fragments so this file never matches itself,
// and the scans never read tests/scan/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(root, file);

const srcFiles = walk(join(root, 'src')).filter((f) => f.endsWith('.ts'));
const sourceFiles = [...srcFiles, join(root, 'world.config.ts')];
const fixtureFiles = walk(join(root, 'tests', 'support'));

const j = (...parts: string[]): string => parts.join('');

/** [label, pattern] pairs; each pattern is assembled from fragments. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  [j('ev', 'al('), new RegExp(String.raw`(^|[^\w.$])` + j('ev', 'al') + String.raw`\s*\(`)],
  [j('new ', 'Func', 'tion'), new RegExp(j('new\\s+Func', 'tion\\b'))],
  [j('inner', 'HTML'), new RegExp(j('inner', 'HTML'))],
  [j('dangerously', 'SetInnerHTML'), new RegExp(j('dangerously', 'SetInnerHTML'))],
  [j('Date', '.now'), new RegExp(j('\\bDate\\s*\\.\\s*', 'now\\b'))],
  [j('new ', 'Date'), new RegExp(j('new\\s+Da', 'te\\b'))],
  [j('Math', '.random'), new RegExp(j('\\bMath\\s*\\.\\s*', 'random\\b'))],
  [j('local', 'Storage'), new RegExp(j('local', 'Storage'))],
  [j('session', 'Storage'), new RegExp(j('session', 'Storage'))],
  [j('indexed', 'DB'), new RegExp(j('indexed', 'DB'))],
  [j('document', '.cookie'), new RegExp(j('document\\s*\\.\\s*', 'cookie'))],
  [j('fet', 'ch'), new RegExp(j('\\bfet', 'ch\\b'))],
  [j('XMLHttp', 'Request'), new RegExp(j('XMLHttp', 'Request'))],
  [j('Web', 'Socket'), new RegExp(j('Web', 'Socket'))],
  [j('con', 'sole.'), new RegExp(j('\\bcon', 'sole\\s*\\.'))],
];

// Hidden Unicode ranges, written as escapes only.
const HIDDEN = new RegExp(
  '[\\u{E0000}-\\u{E007F}\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
  'u',
);
const HTML_COMMENT_OPENER = j('<', '!', '--');

describe('world source hygiene', () => {
  it('scans a non-trivial set of files including world.ts', () => {
    const names = srcFiles.map(rel);
    expect(names).toContain(join('src', 'world.ts'));
    expect(names.length).toBeGreaterThan(20);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`no ${label} in src or world.config.ts`, () => {
      const hits = sourceFiles.filter((f) => pattern.test(read(f))).map(rel);
      expect(hits).toEqual([]);
    });
  }

  it('contains no hidden Unicode characters', () => {
    const hits = [...sourceFiles, ...fixtureFiles, join(root, 'package.json')]
      .filter((f) => HIDDEN.test(read(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it('contains no HTML comment opener', () => {
    const hits = [...sourceFiles, ...fixtureFiles]
      .filter((f) => read(f).includes(HTML_COMMENT_OPENER))
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe('package manifest', () => {
  const pkg = JSON.parse(read(join(root, 'package.json'))) as {
    dependencies?: Record<string, string>;
  };
  const installedMajor = (name: string): number => {
    const path = join(root, 'node_modules', name, 'package.json');
    return Number((JSON.parse(read(path)) as { version: string }).version.split('.')[0]);
  };

  it('lists exactly @ghost-run/core and sql.js as runtime dependencies', () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['@ghost-run/core', 'sql.js']);
  });

  it('has vitest 3 and jsdom 26 installed', () => {
    expect(installedMajor('vitest')).toBe(3);
    expect(installedMajor('jsdom')).toBe(26);
  });
});

describe('module boundaries', () => {
  const commandFiles = walk(join(root, 'src', 'shell', 'commands')).filter((f) => f.endsWith('.ts'));
  const importsOf = (text: string): string[] =>
    [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

  it('handlers read file bytes only next to env.trace.recordRead', () => {
    // Files that read content bytes of a file entry must report the read.
    const readers = commandFiles.filter((f) => /entry\.bytes\b|\.bytes\b/.test(read(f)));
    const unreported = readers
      .filter((f) => !/ls\.ts$|npm\.ts$/.test(f)) // size-only and package.json script reads
      .filter((f) => !read(f).includes('env.trace.recordRead('))
      .map(rel);
    expect(unreported).toEqual([]);
  });

  it('handlers import no byte-level module (journal, fingerprint, trace) directly', () => {
    const bad = commandFiles
      .flatMap((f) =>
        importsOf(read(f))
          .filter((spec) => /journal-fs|fingerprint|\/trace(\.js)?$|run-trace/.test(spec))
          .map((spec) => `${rel(f)} -> ${spec}`),
      );
    expect(bad).toEqual([]);
  });

  it('journal-fs.ts and diff.ts do not import each other', () => {
    const vfs = join(root, 'src', 'vfs');
    expect(importsOf(read(join(vfs, 'journal-fs.ts'))).some((s) => /(^|\/)diff(\.js)?$/.test(s))).toBe(false);
    expect(importsOf(read(join(vfs, 'diff.ts'))).some((s) => /(^|\/)journal-fs(\.js)?$/.test(s))).toBe(false);
  });
});

describe('network hosts', () => {
  const RESERVED = /(\.example|\.test|\.localhost|\.invalid)$|^(localhost|registry\.npmjs\.org)$/;
  const URL_RE = /https?:\/\/([A-Za-z0-9.-]+)/g;

  it('every http and https host uses a reserved suffix or registry.npmjs.org', () => {
    const offenders: string[] = [];
    for (const f of [...sourceFiles, ...fixtureFiles]) {
      for (const m of read(f).matchAll(URL_RE)) {
        const host = (m[1] as string).toLowerCase().replace(/\.$/, '');
        if (!RESERVED.test(host)) offenders.push(`${rel(f)}: ${host}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

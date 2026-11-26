// Validates: Requirements 1.1, 1.2, 1.3, 1.7, 1.10, 1.11, 12.13, 13.3, 13.10
import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as entry from '../src/index.js';
import * as nodeEntry from '../src/node.js';
import { formatConfigError } from '../src/format.js';
import { parseWards } from '../src/parse.js';
import type { ConfigError, ConfigErrorCode } from '../src/types.js';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(pkgDir, '..');
const read = (p: string): string => readFileSync(p, 'utf8');

describe('repository wiring', () => {
  it('the dependency table (docs/dependencies.md) has the yaml row with version 2.9.1 and license ISC', () => {
    const rows = read(resolve(repoDir, 'docs/dependencies.md'))
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .map((l) => l.split('|').map((c) => c.trim()));
    const row = rows.find((c) => c[1]?.startsWith('yaml'));
    expect(row, 'yaml row').toBeDefined();
    expect(row?.[1]).toMatch(/^yaml\b/);
    expect(row?.[2]).toBe('2.9.1');
    expect(row?.[4]).toBe('ISC');
  });

  it('wards-config lists only yaml and @ghost-run/core as dependencies', () => {
    const pkg = JSON.parse(read(resolve(pkgDir, 'package.json'))) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@ghost-run/core', 'yaml']);
  });

  it('core has no dependencies', () => {
    const pkg = JSON.parse(read(resolve(repoDir, 'core/package.json'))) as Record<string, unknown>;
    expect('dependencies' in pkg).toBe(false);
  });

  it('core ESLint config bans wards-config', () => {
    const cfg = read(resolve(repoDir, 'core/eslint.config.mjs'));
    expect(cfg).toContain('**/wards-config/**');
    expect(cfg).toContain('@ghost-run/wards-config');
    expect(cfg).toContain('@ghost-run/wards-config/**');
  });

  it('pnpm-workspace.yaml lists wards-config', () => {
    const lines = read(resolve(repoDir, 'pnpm-workspace.yaml')).split('\n').map((l) => l.trim());
    expect(lines).toContain('- wards-config');
  });
});

describe('entry points', () => {
  it('exports map has exactly "." and "./node", each with types and import under dist/', () => {
    const pkg = JSON.parse(read(resolve(pkgDir, 'package.json'))) as {
      exports: Record<string, Record<string, string>>;
    };
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './node']);
    for (const sub of Object.values(pkg.exports)) {
      expect(sub.types).toMatch(/^\.\/dist\//);
      expect(sub.import).toMatch(/^\.\/dist\//);
    }
  });

  it('ESLint config bans node:* and bare built-ins for default-entry sources', () => {
    const cfg = read(resolve(pkgDir, 'eslint.config.mjs'));
    expect(cfg).toContain("group: ['node:*']");
    expect(cfg).toContain("ignores: ['src/load.ts', 'src/node.ts']");
    for (const name of ['fs', 'fs/promises', 'path', 'child_process']) {
      expect(cfg).toContain(`'${name}'`);
    }
  });

  it('default entry has no loadWardsFile and the node entry has it', () => {
    expect('loadWardsFile' in entry).toBe(false);
    expect(typeof nodeEntry.loadWardsFile).toBe('function');
  });
});

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, m.replace(/^node:/, '')]));
const isBuiltin = (spec: string): boolean =>
  spec.startsWith('node:') || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0] ?? '');

/** Static imports, re-exports, side-effect imports, and dynamic `import(` specifiers. */
function specifiersOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g;
  for (const m of source.matchAll(re)) out.push(m[2] as string);
  return out;
}

function walk(entryFile: string, ext: '.ts' | '.js'): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of specifiersOf(read(file))) {
      if (spec.startsWith('.')) {
        queue.push(resolve(dirname(file), spec.replace(/\.js$/, ext)));
      } else {
        bare.add(spec);
      }
    }
  }
  return { files, bare };
}

describe('browser-safe import graph (D21)', () => {
  it('src/index.ts reaches no Node built-in and never load.ts or node.ts', () => {
    const { files, bare } = walk(resolve(pkgDir, 'src/index.ts'), '.ts');
    const names = [...files].map((f) => f.slice(pkgDir.length + 1));
    expect(names).not.toContain('src/load.ts');
    expect(names).not.toContain('src/node.ts');
    expect(names).toContain('src/parse.ts');
    expect([...bare].filter(isBuiltin)).toEqual([]);
    expect([...bare].sort()).toEqual(['@ghost-run/core', 'yaml']);
  });

  it('the specifier scanner sees re-exports, side-effect imports, and dynamic imports', () => {
    const src = "export { a } from './a.js';\nimport './b.js';\nconst m = await import('node:fs');\nimport type { T } from 'x';\n";
    expect(specifiersOf(src)).toEqual(['./a.js', './b.js', 'node:fs', 'x']);
    expect(isBuiltin('node:fs')).toBe(true);
    expect(isBuiltin('fs/promises')).toBe(true);
    expect(isBuiltin('yaml')).toBe(false);
  });

  const distIndex = resolve(pkgDir, 'dist/src/index.js');
  it.skipIf(!existsSync(distIndex))('default-entry dist output contains no node: string', () => {
    const { files, bare } = walk(distIndex, '.js');
    for (const f of files) {
      expect(f.endsWith('/load.js') || f.endsWith('/node.js'), f).toBe(false);
      expect(read(f), f).not.toContain('node:');
    }
    expect([...bare].filter(isBuiltin)).toEqual([]);
  });
});

// Runtime list of every ConfigErrorCode. The two checks below keep it equal to the type.
const ALL_CODES = [
  'yaml-syntax-error',
  'yaml-feature-unsupported',
  'duplicate-key',
  'input-too-large',
  'file-unreadable',
  'root-not-mapping',
  'unknown-root-field',
  'wards-not-sequence',
  'unknown-kind',
  'missing-field',
  'unknown-field',
  'wrong-type',
  'out-of-range',
  'duplicate-id',
  'invalid-glob',
  'invalid-host',
  'invalid-character',
  'duplicate-entry',
  'unsafe-command-entry',
  'too-many-errors',
] as const satisfies readonly ConfigErrorCode[];

// Compile-time exhaustiveness: this line fails to type-check when a code is missing from ALL_CODES.
type MissingCodes = Exclude<ConfigErrorCode, (typeof ALL_CODES)[number]>;
const noMissingCodes: [MissingCodes] extends [never] ? true : never = true;

const PATH_WARD = [
  'wards:',
  '  - id: protect-env',
  '    kind: path',
  '    deny: [delete, overwrite]',
  '    paths: [".env", "data/**"]',
  '',
].join('\n');

/** A document (or a ConfigError literal) for each code, with the expected position. */
const EXAMPLES: Record<ConfigErrorCode, { text?: string; literal?: ConfigError; line?: number }> = {
  'yaml-syntax-error': { text: 'wards: [\n', line: 2 },
  'yaml-feature-unsupported': { text: 'wards: []\nx: &a 1\n', line: 2 },
  'duplicate-key': { text: 'wards: []\nwards: []\n', line: 2 },
  'input-too-large': { text: '#'.repeat(262_145) },
  'file-unreadable': {
    literal: { code: 'file-unreadable', message: 'file could not be read' },
  },
  'root-not-mapping': { text: '- a\n', line: 1 },
  'unknown-root-field': { text: 'wards: []\nextra: 1\n', line: 2 },
  'wards-not-sequence': { text: 'wards: 3\n', line: 1 },
  'unknown-kind': { text: 'wards:\n  - id: a\n    kind: nope\n', line: 2 },
  'missing-field': { text: 'wards:\n  - id: a\n    kind: sql\n    tables: [t]\n', line: 2 },
  'unknown-field': { text: PATH_WARD + '    extra: 1\n', line: 6 },
  'wrong-type': { text: 'wards:\n  - id: a\n    kind: sql\n    tables: [t]\n    max_rows_lost: "0"\n', line: 5 },
  'out-of-range': { text: 'wards:\n  - id: a\n    kind: sql\n    tables: [t]\n    max_rows_lost: -1\n', line: 5 },
  'duplicate-id': { text: PATH_WARD + PATH_WARD.split('\n').slice(1).join('\n'), line: 6 },
  'invalid-glob': { text: PATH_WARD.replace('".env"', '"/abs"'), line: 5 },
  'invalid-host': {
    text: 'wards:\n  - id: e\n    kind: egress\n    secrets: [".env"]\n    allow_hosts: ["http://x.example"]\n',
    line: 5,
  },
  'invalid-character': { text: PATH_WARD.replace('".env"', '"a\\u200Bb"'), line: 5 },
  'duplicate-entry': { text: PATH_WARD.replace('".env", "data/**"', '".env", "./.env"'), line: 5 },
  'unsafe-command-entry': { text: 'wards: []\nsafe_commands:\n  - "ls; rm"\n', line: 3 },
  'too-many-errors': {
    text: 'wards:\n' + Array.from({ length: 60 }, (_, i) => `  - id: w${i}\n    kind: nope\n`).join(''),
  },
};

describe('ConfigErrorCode coverage', () => {
  it('the runtime list equals the union in src/types.ts', () => {
    expect(noMissingCodes).toBe(true);
    const src = read(resolve(pkgDir, 'src/types.ts'));
    const block = /export type ConfigErrorCode =([^;]+);/.exec(src)?.[1] ?? '';
    const declared = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect([...ALL_CODES].sort()).toEqual([...declared].sort());
    expect(new Set(ALL_CODES).size).toBe(ALL_CODES.length);
    expect(Object.keys(EXAMPLES).sort()).toEqual([...ALL_CODES].sort());
  });

  for (const code of ALL_CODES) {
    it(`example for ${code}`, () => {
      const ex = EXAMPLES[code];
      let err: ConfigError | undefined;
      if (ex.text !== undefined) {
        const r = parseWards(ex.text);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        err = r.errors.find((e) => e.code === code);
        expect(err, JSON.stringify(r.errors)).toBeDefined();
      } else {
        err = ex.literal;
      }
      expect(err?.code).toBe(code);
      if (ex.line !== undefined) expect(err?.line).toBe(ex.line);
      // Every example formats to a single line that starts with the file name and carries the code.
      const s = formatConfigError(err as ConfigError);
      expect(s).not.toContain('\n');
      expect(s.startsWith('wards.yaml')).toBe(true);
      expect(s).toContain(`[${code}]`);
    });
  }

  it('unsafe-command-entry carries detail charset and no entry text', () => {
    const r = parseWards(EXAMPLES['unsafe-command-entry'].text as string);
    const e = !r.ok ? r.errors.find((x) => x.code === 'unsafe-command-entry') : undefined;
    expect(e?.detail).toBe('charset');
    expect(formatConfigError(e as ConfigError)).not.toContain('rm');
  });
});

describe('formatConfigError samples', () => {
  it('formats the documented shapes exactly', () => {
    expect(
      formatConfigError({ code: 'invalid-glob', message: 'm', line: 5, column: 14, wardId: 'protect-env', field: 'paths[0]' }),
    ).toBe('wards.yaml:5:14: [invalid-glob] ward "protect-env" field "paths[0]": m');
    expect(formatConfigError({ code: 'duplicate-key', message: 'm', line: 2, column: 1 })).toBe(
      'wards.yaml:2:1: [duplicate-key]: m',
    );
    expect(formatConfigError({ code: 'file-unreadable', message: 'file could not be read' })).toBe(
      'wards.yaml: [file-unreadable]: file could not be read',
    );
  });
});

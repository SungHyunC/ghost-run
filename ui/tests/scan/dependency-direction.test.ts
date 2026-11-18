import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Dependency direction guard (ui -> core only). Validates: Requirements 1.4, 1.5, 1.7, 1.8, 2.2

interface ImportRef {
  readonly spec: string;
  readonly typeOnly: boolean;
  readonly kind: 'import' | 'export' | 'dynamic' | 'require';
}

const CORE = '@ghost-run/core';

export function parseImports(fileName: string, text: string): ImportRef[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      out.push({
        spec: node.moduleSpecifier.text,
        typeOnly: node.importClause?.isTypeOnly === true,
        kind: 'import',
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly, kind: 'export' });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const e = node.moduleReference.expression;
      if (ts.isStringLiteralLike(e)) out.push({ spec: e.text, typeOnly: node.isTypeOnly, kind: 'require' });
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const arg = node.arguments[0];
      const isDyn = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isReq = ts.isIdentifier(callee) && callee.text === 'require';
      if ((isDyn || isReq) && arg && ts.isStringLiteralLike(arg)) {
        out.push({ spec: arg.text, typeOnly: false, kind: isDyn ? 'dynamic' : 'require' });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, typeOnly: true, kind: 'import' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const isRelative = (s: string): boolean => s === '.' || s === '..' || s.startsWith('./') || s.startsWith('../');
const isPkg = (s: string, name: string): boolean => s === name || s.startsWith(`${name}/`);

/** Violations of the kit rule: react, react-dom, relative paths, and type-only @ghost-run/core. */
export function kitViolations(refs: readonly ImportRef[]): string[] {
  const bad: string[] = [];
  for (const r of refs) {
    const s = r.spec;
    if (isRelative(s)) {
      if (/(^|\/)(apps|integrations|worlds|core|ghost-runner|wards-config)(\/|$)/.test(s)) {
        bad.push(`${s}: relative path leaves the ui package`);
      }
    } else if (s === CORE) {
      if (!r.typeOnly || r.kind === 'dynamic' || r.kind === 'require') bad.push(`${s}: only "import type" or "export type" is allowed`);
    } else if (isPkg(s, CORE)) {
      bad.push(`${s}: core internals are not public`);
    } else if (!(isPkg(s, 'react') || isPkg(s, 'react-dom'))) {
      bad.push(`${s}: package not allowed`);
    }
  }
  return bad;
}

const FORBIDDEN_FOR_TESTS = [
  '@ghost-run/ghost-runner',
  '@ghost-run/wards-config',
  '@ghost-run/ghost-shell',
  '@ghost-run/ghost-hand',
  'three',
  '@mujoco/mujoco',
];

/** Tests may import values from the public core entry, but not from forbidden packages or paths. */
export function testViolations(refs: readonly ImportRef[]): string[] {
  const bad: string[] = [];
  for (const r of refs) {
    const s = r.spec;
    if (FORBIDDEN_FOR_TESTS.some((p) => isPkg(s, p))) bad.push(`${s}: forbidden package`);
    else if (isPkg(s, CORE) && s !== CORE) bad.push(`${s}: core internals are not public`);
    else if (isRelative(s) && /(^|\/)(apps|integrations|worlds|core|ghost-runner|wards-config)(\/|$)/.test(s)) {
      bad.push(`${s}: relative path leaves the ui package`);
    }
  }
  return bad;
}

/** Core must not import the ui package or a ui/ path. */
export function coreViolations(refs: readonly ImportRef[]): string[] {
  return refs
    .filter((r) => isPkg(r.spec, '@ghost-run/ui') || /(^|\/)ui(\/|$)/.test(r.spec))
    .map((r) => `${r.spec}: core must not import ui`);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

const uiRoot = fileURLToPath(new URL('../../', import.meta.url));
const coreSrc = fileURLToPath(new URL('../../../core/src', import.meta.url));

function scan(dirs: string[], check: (refs: ImportRef[]) => string[]): string[] {
  const found: string[] = [];
  for (const d of dirs) {
    for (const f of walk(d)) {
      for (const v of check(parseImports(f, readFileSync(f, 'utf8')))) found.push(`${relative(uiRoot, f)}: ${v}`);
    }
  }
  return found;
}

describe('ui dependency direction (real files)', () => {
  it('ui/src and ui/gallery import only react, react-dom, relative paths, and type-only @ghost-run/core', () => {
    const files = [join(uiRoot, 'src'), join(uiRoot, 'gallery')].flatMap(walk);
    expect(files.length).toBeGreaterThan(0);
    expect(scan([join(uiRoot, 'src'), join(uiRoot, 'gallery')], kitViolations)).toEqual([]);
  });

  it('ui/tests import no forbidden package or path', () => {
    expect(scan([join(uiRoot, 'tests')], testViolations)).toEqual([]);
  });

  it('core/src does not import ui', () => {
    expect(walk(coreSrc).length).toBeGreaterThan(0);
    expect(scan([coreSrc], coreViolations)).toEqual([]);
  });
});

describe('dependency direction self-tests (in-memory samples)', () => {
  const kit = (code: string) => kitViolations(parseImports('x.tsx', code));

  it('accepts allowed imports', () => {
    expect(
      kit(`import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Scene } from '@ghost-run/core';
import './a.css';
export type { Scene } from '@ghost-run/core';
import { a } from "../model/a";`),
    ).toEqual([]);
  });

  it('rejects a value import from core, including multi-line and inline type specifiers', () => {
    expect(kit(`import { evaluate } from '@ghost-run/core';`)).toHaveLength(1);
    expect(kit(`import {\n  type Scene,\n} from '@ghost-run/core';`)).toHaveLength(1);
    expect(kit(`export { x } from '@ghost-run/core';`)).toHaveLength(1);
    expect(kit(`const m = await import('@ghost-run/core');`)).toHaveLength(1);
  });

  it('rejects forbidden packages and paths', () => {
    for (const spec of [
      '@ghost-run/ghost-runner',
      '@ghost-run/core/src/judge',
      'three',
      '@mujoco/mujoco',
      '../../apps/ghost-shell/src/x',
      '../../../integrations/mcp/index.mjs',
      '../../worlds/drawer-arm/x',
      '../../core/src/index',
      'lodash',
    ]) {
      expect(kit(`import type { A } from '${spec}';`), spec).toHaveLength(1);
    }
    expect(kit(`const x = require('three');`)).toHaveLength(1);
    expect(kit(`type T = import('@mujoco/mujoco').A;`)).toHaveLength(1);
  });

  it('ignores import-looking text in strings and comments', () => {
    expect(kit(`// import x from 'three'\nconst s = "import y from 'three'";`)).toEqual([]);
  });

  it('lets tests import values from core but not forbidden packages', () => {
    const t = (code: string) => testViolations(parseImports('t.ts', code));
    expect(t(`import { evaluate } from '@ghost-run/core';`)).toEqual([]);
    expect(t(`import { x } from '@ghost-run/ghost-runner';`)).toHaveLength(1);
    expect(t(`import * as THREE from 'three';`)).toHaveLength(1);
    expect(t(`import { y } from '@ghost-run/core/internal';`)).toHaveLength(1);
  });

  it('flags core importing ui', () => {
    const c = (code: string) => coreViolations(parseImports('c.ts', code));
    expect(c(`import { Candle } from '@ghost-run/ui';`)).toHaveLength(1);
    expect(c(`import type { A } from '@ghost-run/ui/styles.css';`)).toHaveLength(1);
    expect(c(`import { a } from '../../ui/src/index';`)).toHaveLength(1);
    expect(c(`import { a } from './judge/path';\nimport b from 'node:fs';`)).toEqual([]);
  });
});

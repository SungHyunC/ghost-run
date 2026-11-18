// Static purity check of core/src/possession/ (Requirements 1.2, 1.3, 12.7).
//
// Approach: parse each file with the TypeScript compiler API (syntax only, no
// type checker) and walk the AST. An Identifier counts as a banned global
// reference only when it is a real value or type reference:
//  - property names (obj.process, { process: 1 }, class members) are skipped,
//  - declaration names (const process, function URL, parameters, imports) are skipped,
//  - any name declared somewhere in the same file is treated as a local binding
//    and never reported as a global (a conservative shadowing rule that avoids
//    scope analysis; shorthand properties like { process } still count as references).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const POSSESSION = join(SRC, 'possession');

const BANNED_GLOBALS = new Set([
  'process',
  'Buffer',
  'require',
  'window',
  'document',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'console',
  'fetch',
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'crypto',
]);

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function isDeclarationName(node: ts.Identifier): boolean {
  const p = node.parent;
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isEnumDeclaration(p) ||
      ts.isModuleDeclaration(p) ||
      ts.isTypeParameterDeclaration(p) ||
      ts.isImportClause(p) ||
      ts.isImportSpecifier(p) ||
      ts.isNamespaceImport(p) ||
      ts.isImportEqualsDeclaration(p) ||
      ts.isBindingElement(p) ||
      ts.isEnumMember(p) ||
      ts.isLabeledStatement(p)) &&
    (p as { name?: ts.Node }).name === node
  ) {
    return true;
  }
  return false;
}

function isPropertyNameOnly(node: ts.Identifier): boolean {
  const p = node.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if (ts.isQualifiedName(p) && p.right === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (
    (ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isGetAccessor(p) ||
      ts.isSetAccessor(p)) &&
    p.name === node
  ) {
    return true;
  }
  if (ts.isBindingElement(p) && p.propertyName === node) return true;
  if (ts.isImportSpecifier(p) && p.propertyName === node) return true;
  if (ts.isExportSpecifier(p)) return true;
  if (ts.isBreakOrContinueStatement(p)) return true;
  return false;
}

function collectLocalNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && isDeclarationName(n)) names.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

function importSpecifierProblems(sf: ts.SourceFile): string[] {
  const problems: string[] = [];
  const check = (spec: string, typeOnly: boolean, node: ts.Node): void => {
    const ok = spec.startsWith('./') || (spec === '../types.js' && typeOnly);
    if (!ok) problems.push(`${where(sf, node)} import specifier "${spec}"`);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      check(n.moduleSpecifier.text, n.importClause?.isTypeOnly === true, n);
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier !== undefined &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      check(n.moduleSpecifier.text, n.isTypeOnly, n);
    } else if (ts.isImportEqualsDeclaration(n)) {
      problems.push(`${where(sf, n)} import-equals declaration`);
    } else if (ts.isImportTypeNode(n)) {
      const lit = ts.isLiteralTypeNode(n.argument) ? n.argument.literal : undefined;
      check(lit !== undefined && ts.isStringLiteral(lit) ? lit.text : '<non-literal>', true, n);
    } else if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        problems.push(`${where(sf, n)} dynamic import()`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return problems;
}

function where(sf: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${sf.fileName}:${line + 1}:${character + 1}`;
}

function bannedUsageProblems(sf: ts.SourceFile): string[] {
  const problems: string[] = [];
  const locals = collectLocalNames(sf);
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && !isDeclarationName(n) && !isPropertyNameOnly(n)) {
      if (BANNED_GLOBALS.has(n.text) && !locals.has(n.text)) {
        problems.push(`${where(sf, n)} banned global "${n.text}"`);
      }
      if (n.text === 'eval' && !locals.has('eval')) {
        problems.push(`${where(sf, n)} eval`);
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') {
      problems.push(`${where(sf, n)} new Function`);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') {
      problems.push(`${where(sf, n)} Function(...)`);
    }
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'Math' &&
      n.name.text === 'random'
    ) {
      problems.push(`${where(sf, n)} Math.random`);
    }
    if (
      ts.isElementAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'Math' &&
      ts.isStringLiteralLike(n.argumentExpression) &&
      n.argumentExpression.text === 'random'
    ) {
      problems.push(`${where(sf, n)} Math["random"]`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return problems;
}

function purityProblems(sf: ts.SourceFile): string[] {
  return [...importSpecifierProblems(sf), ...bannedUsageProblems(sf)];
}

function redThreadImports(sf: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    let spec: string | undefined;
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier !== undefined &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      spec = n.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(n) &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0]!) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
    ) {
      spec = (n.arguments[0] as ts.StringLiteralLike).text;
    }
    if (spec !== undefined && /(^|\/)red-thread(\.js|\.ts)?$/.test(spec)) {
      found.push(`${where(sf, n)} imports "${spec}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('possession purity (static AST check)', () => {
  const files = listTs(POSSESSION);

  it('finds the possession source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const rel = relative(SRC, file);
    it(`${rel} has only relative imports, no banned globals, no eval/new Function/Math.random`, () => {
      const sf = parse(rel, readFileSync(file, 'utf8'));
      expect(purityProblems(sf)).toEqual([]);
    });
  }

  it('nothing under core/src outside possession/ imports red-thread.js (12.7)', () => {
    const others = listTs(SRC).filter((f) => !f.startsWith(POSSESSION + '/'));
    expect(others.length).toBeGreaterThan(0);
    const offenders = others.flatMap((f) =>
      redThreadImports(parse(relative(SRC, f), readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  describe('self-check: the detector is not vacuous', () => {
    const offending = [
      "import fs from 'node:fs';",
      "import x from '../other.js';",
      "import { GhostReport } from '../types.js';",
      'const a = process.env;',
      'const b = new Date();',
      'const c = Math.random();',
      'eval("1");',
      'const f = new Function("return 1");',
      'const u = new URL("x.example");',
      'setTimeout(() => 1, 1);',
      'const t = { crypto };',
    ].join('\n');

    it('reports every offending construct', () => {
      const problems = purityProblems(parse('synthetic.ts', offending)).join('\n');
      for (const needle of [
        '"node:fs"',
        '"../other.js"',
        '"../types.js"',
        'banned global "process"',
        'banned global "Date"',
        'Math.random',
        'eval',
        'new Function',
        'banned global "URL"',
        'banned global "setTimeout"',
        'banned global "crypto"',
      ]) {
        expect(problems, needle).toContain(needle);
      }
    });

    it('accepts clean constructs and does not flag property names or local declarations', () => {
      const clean = [
        "import type { GhostReport } from '../types.js';",
        "import { a } from './a.js';",
        'const o = { process: 1, Date: 2 };',
        'const v = o.process + o.Date;',
        'function f(console: number) { return console; }',
        'class C { fetch() { return 1; } }',
        'const r = new C().fetch();',
      ].join('\n');
      expect(purityProblems(parse('synthetic.ts', clean))).toEqual([]);
    });

    it('detects a red-thread import in a synthetic wards file', () => {
      const sf = parse('wards.ts', "import { traceRedThread } from './possession/red-thread.js';");
      expect(redThreadImports(sf)).toHaveLength(1);
    });
  });
});

// Derives which kit parts a source tree really uses (design Component 9).
// Follows relative re-exports to the package origin and counts only Usage_References:
// imports, exports, re-exports, and type-only positions do not count.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { walkFiles } from './fs-walk.mjs';

/** Origin ("package::name") to App_Part. */
const ORIGIN_TO_PART = new Map([
  ['@ghost-run/ui::MirrorWorld', 'mirror'],
  ['@ghost-run/core::ghostRun', 'ghost'],
  ['@ghost-run/core::WardEngine', 'wards'],
  ['@ghost-run/ui::Candle', 'candle'],
  ['@ghost-run/ui::BlacklightView', 'blacklight'],
  ['@ghost-run/core::scanText', 'blacklight'],
  ['@ghost-run/ui::Graveyard', 'graveyard'],
]);

/** @param {string} spec */
const isRelative = (spec) => spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..';

/** @param {string} path @param {string} name */
function isSourceFile(path, name) {
  if (!/\.(ts|tsx)$/.test(name)) return false;
  if (/\.test\./.test(name) || name.endsWith('.test-d.ts') || name.endsWith('.d.ts')) return false;
  return true;
}

/** Resolve a relative module specifier from `fromFile` to a collected file, or null. */
function resolveModule(fromFile, spec, files) {
  const base = resolve(dirname(fromFile), spec);
  const stripped = base.replace(/\.(m|c)?js$/, '');
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${stripped}.ts`, `${stripped}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/** @param {ts.Node} node */
function isLiteralText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/**
 * Parse one file into its binding table, export table, star exports, and identifier visit.
 * @param {string} file
 */
function parseFile(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  /** @type {Map<string, { spec: string, name: string }>} */
  const bindings = new Map();
  /** @type {Map<string, { spec: string, name: string }>} */
  const exportsTable = new Map();
  /** @type {string[]} */
  const stars = [];

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const spec = stmt.moduleSpecifier.text;
      if (clause.name) bindings.set(clause.name.text, { spec, name: 'default' });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) bindings.set(nb.name.text, { spec, name: '*' });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          if (el.isTypeOnly) continue;
          bindings.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
        }
      }
    }
  }

  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || stmt.isTypeOnly) continue;
    const clause = stmt.exportClause;
    if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (!clause) stars.push(spec);
      else if (ts.isNamespaceExport(clause)) exportsTable.set(clause.name.text, { spec, name: '*' });
      else {
        for (const el of clause.elements) {
          if (el.isTypeOnly) continue;
          exportsTable.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
        }
      }
    } else if (clause && ts.isNamedExports(clause)) {
      for (const el of clause.elements) {
        if (el.isTypeOnly) continue;
        const local = (el.propertyName ?? el.name).text;
        const bound = bindings.get(local);
        if (bound) exportsTable.set(el.name.text, bound);
      }
    }
  }

  return { sf, bindings, exportsTable, stars };
}

/**
 * Collect the origins ("package::name") referenced by Usage_References under `sourceRoot`.
 * @param {string} sourceRoot
 * @returns {Set<string>}
 */
function collectOrigins(sourceRoot) {
  const files = new Set(
    walkFiles(sourceRoot, { skipDirs: ['node_modules', 'tests', '__tests__'], accept: isSourceFile }).map((p) => resolve(p)),
  );
  const parsed = new Map([...files].map((f) => [f, parseFile(f)]));

  /**
   * Resolve (spec, name) seen from `fromFile` to a package origin or a module namespace.
   * @returns {{ kind: 'origin', pkg: string, name: string } | { kind: 'module', file: string } | null}
   */
  const resolveRef = (fromFile, spec, name, seen = new Set()) => {
    if (!isRelative(spec)) return { kind: 'origin', pkg: spec, name };
    const target = resolveModule(fromFile, spec, files);
    if (!target) return null;
    if (name === '*') return { kind: 'module', file: target };
    return resolveExport(target, name, seen);
  };

  /** @returns {{ kind: 'origin', pkg: string, name: string } | { kind: 'module', file: string } | null} */
  const resolveExport = (file, name, seen) => {
    const key = `${file}::${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const info = parsed.get(file);
    if (!info) return null;
    const direct = info.exportsTable.get(name);
    if (direct) return resolveRef(file, direct.spec, direct.name, seen);
    for (const star of info.stars) {
      if (!isRelative(star)) return { kind: 'origin', pkg: star, name };
      const found = resolveRef(file, star, '*', seen);
      if (found?.kind === 'module') {
        const hit = resolveExport(found.file, name, seen);
        if (hit) return hit;
      }
    }
    return null;
  };

  /** @type {Set<string>} */
  const origins = new Set();

  for (const [file, info] of parsed) {
    /** @type {Map<string, ReturnType<typeof resolveRef>>} */
    const resolved = new Map();
    for (const [local, b] of info.bindings) resolved.set(local, resolveRef(file, b.spec, b.name));

    /** @param {string} local @param {string} member */
    const addMember = (local, member) => {
      const base = resolved.get(local);
      if (!base) return;
      if (base.kind === 'module') {
        const hit = resolveExport(base.file, member, new Set());
        if (hit?.kind === 'origin') origins.add(`${hit.pkg}::${hit.name}`);
      } else if (base.name === '*') {
        origins.add(`${base.pkg}::${member}`);
      }
    };

    /** @param {string} local */
    const isNamespace = (local) => {
      const base = resolved.get(local);
      return base?.kind === 'module' || (base?.kind === 'origin' && base.name === '*');
    };

    /** @param {string} local */
    const addDirect = (local) => {
      const base = resolved.get(local);
      if (base?.kind === 'origin' && base.name !== '*') origins.add(`${base.pkg}::${base.name}`);
    };

    /** @param {ts.Node} node */
    const visit = (node) => {
      // Type-only positions: skip the whole subtree. A class `extends` clause is a value use.
      if (ts.isTypeNode(node) && !(ts.isExpressionWithTypeArguments(node) && isClassExtends(node))) return;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return;
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isExportAssignment(node) && node.isExportEquals) {
        // `export = X` is an export position only.
        return;
      }

      // Namespace member access: ns.X and ns['X'].
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && isNamespace(node.expression.text)) {
        addMember(node.expression.text, node.name.text);
        return;
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && isNamespace(node.expression.text) && isLiteralText(node.argumentExpression)) {
        addMember(node.expression.text, node.argumentExpression.text);
        visit(node.argumentExpression);
        return;
      }

      if (ts.isIdentifier(node) && info.bindings.has(node.text) && isValuePosition(node)) {
        addDirect(node.text);
      }
      ts.forEachChild(node, visit);
    };

    // Export specifiers (`export { X }`) are not usages, so top-level export declarations are skipped above.
    visit(info.sf);
  }
  return origins;
}

/** @param {ts.ExpressionWithTypeArguments} node */
function isClassExtends(node) {
  const clause = node.parent;
  return ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent);
}

/** True when the identifier is read as a value, not declared or named as a property key. */
function isValuePosition(node) {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return parent.name === node;
  if (ts.isJsxClosingElement(parent)) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node;
  if (ts.isQualifiedName(parent)) return parent.left === node;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  if ('name' in parent && parent.name === node) return false;
  if ('propertyName' in parent && parent.propertyName === node) return false;
  if (ts.isJsxAttribute(parent)) return false;
  return true;
}

/**
 * Which App_Parts the source tree under `sourceRoot` uses.
 * @param {string} sourceRoot
 * @returns {Record<'mirror' | 'ghost' | 'wards' | 'candle' | 'blacklight' | 'graveyard', boolean>}
 */
export function deriveUsage(sourceRoot) {
  const root = resolve(sourceRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`scan-usage: source root not found: ${sourceRoot}`);
  }
  const origins = collectOrigins(root);
  const usage = { mirror: false, ghost: false, wards: false, candle: false, blacklight: false, graveyard: false };
  for (const origin of origins) {
    const part = ORIGIN_TO_PART.get(origin);
    if (part) usage[part] = true;
  }
  return usage;
}

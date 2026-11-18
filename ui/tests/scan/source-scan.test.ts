import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Source scan of ui/src, ui/gallery and ui/vite.config.ts (TypeScript AST, comments ignored).
// Validates: Requirements 4.1, 4.2, 7.8, 12.11, 13.4, 13.6

const UI_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export type RuleId =
  | 'inner-html'
  | 'document-write'
  | 'eval'
  | 'new-function'
  | 'string-timer'
  | 'forbidden-import'
  | 'assurance-words'
  | 'audio-element'
  | 'dynamic-element-name'
  | 'dynamic-url'
  | 'dynamic-style'
  | 'string-handler'
  | 'dynamic-css-property';

export interface Violation {
  readonly rule: RuleId;
  readonly line: number;
  readonly text: string;
}

const HTML_SINKS = new Set(['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const TIMERS = new Set(['setTimeout', 'setInterval', 'setImmediate']);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const FORBIDDEN_MODULES = ['axe-core', 'react-dom/server', 'three', '@mujoco/mujoco'];
const URL_ATTRS = new Set(['href', 'src', 'srcSet', 'xlinkHref', 'action', 'formAction', 'poster', 'data']);
const URL_PROPS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster']);
const WORDS = /\b(sealed|isolated)\b/i;
const ASSURANCE_NAME = /^ASSURANCE_/;
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus', '.weba', '.aif', '.aiff', '.mid', '.midi']);

function isForbiddenModule(spec: string): boolean {
  return FORBIDDEN_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`));
}

/** True for a string literal, a template, or a concatenation that contains one. */
function isStringish(n: ts.Node): boolean {
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return isStringish(n.expression);
  if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) return true;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return isStringish(n.left) || isStringish(n.right);
  }
  return false;
}

/** A value that is fixed in the source: a literal with no substitution. */
function isStaticLiteral(n: ts.Node): boolean {
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return isStaticLiteral(n.expression);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return true;
  if (ts.isNumericLiteral(n)) return true;
  if (ts.isPrefixUnaryExpression(n)) return isStaticLiteral(n.operand);
  return false;
}

function attrExpression(attr: ts.JsxAttribute): ts.Node | undefined {
  const init = attr.initializer;
  if (!init) return undefined;
  return ts.isJsxExpression(init) ? (init.expression ?? undefined) : init;
}

function attrName(attr: ts.JsxAttribute): string {
  return ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText();
}

function calleeName(call: ts.CallExpression | ts.NewExpression): { name: string; viaGlobal: boolean } | undefined {
  const e = call.expression;
  if (ts.isIdentifier(e)) return { name: e.text, viaGlobal: true };
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && GLOBAL_OBJECTS.has(e.expression.text)) {
    return { name: e.name.text, viaGlobal: true };
  }
  if (ts.isPropertyAccessExpression(e)) return { name: e.name.text, viaGlobal: false };
  return undefined;
}

/** Names bound as function parameters (props, destructured props) in the file. */
function collectParameterNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const addBinding = (b: ts.BindingName): void => {
    if (ts.isIdentifier(b)) names.add(b.text);
    else for (const el of b.elements) if (ts.isBindingElement(el)) addBinding(el.name);
  };
  const visit = (n: ts.Node): void => {
    // A parameter typed as a component (never a string tag) may be rendered, e.g. a boundary wrapper.
    const componentTyped = (p: ts.ParameterDeclaration): boolean =>
      p.type !== undefined && /^(ComponentType|ComponentClass|FunctionComponent|FC)\b/.test(p.type.getText());
    if (ts.isParameter(n) && !componentTyped(n)) addBinding(n.name);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** Local variables initialised from something other than a function, class, import, or identifier. */
function collectComputedValueNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const i = n.initializer;
      if (
        ts.isPropertyAccessExpression(i) ||
        ts.isElementAccessExpression(i) ||
        ts.isConditionalExpression(i) ||
        isStringish(i)
      ) {
        names.add(n.name.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

function hasAncestor(n: ts.Node, pred: (a: ts.Node) => boolean): boolean {
  for (let p = n.parent; p; p = p.parent) if (pred(p)) return true;
  return false;
}

/** Scan TypeScript or TSX source text. Comments are never visited because only AST nodes are inspected. */
export function scanSource(fileName: string, text: string): Violation[] {
  const kind = fileName.endsWith('.ts') && !fileName.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const out: Violation[] = [];
  const params = collectParameterNames(sf);
  const computed = collectComputedValueNames(sf);
  const add = (rule: RuleId, n: ts.Node): void => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    out.push({ rule, line, text: n.getText(sf).slice(0, 80) });
  };
  const insideAssurance = (n: ts.Node): boolean =>
    hasAncestor(n, (a) => ts.isVariableDeclaration(a) && ts.isIdentifier(a.name) && ASSURANCE_NAME.test(a.name.text));

  const checkWords = (n: ts.Node, s: string): void => {
    if (WORDS.test(s) && !insideAssurance(n)) add('assurance-words', n);
  };

  const visit = (n: ts.Node): void => {
    // inner-html: identifiers, property names, and string keys.
    if ((ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) && HTML_SINKS.has(n.text)) add('inner-html', n);
    if (ts.isStringLiteralLike(n) && HTML_SINKS.has(n.text) && !ts.isImportDeclaration(n.parent)) add('inner-html', n);

    // document.write / writeln
    if (
      ts.isPropertyAccessExpression(n) &&
      (n.name.text === 'write' || n.name.text === 'writeln') &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'document'
    ) {
      add('document-write', n);
    }

    // Imports of forbidden modules.
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteralLike(n.moduleSpecifier) &&
      isForbiddenModule(n.moduleSpecifier.text)
    ) {
      add('forbidden-import', n);
    }
    if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteralLike(n.moduleReference.expression) &&
      isForbiddenModule(n.moduleReference.expression.text)
    ) {
      add('forbidden-import', n);
    }
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      if (isForbiddenModule(n.argument.literal.text)) add('forbidden-import', n);
    }

    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const callee = calleeName(n);
      const args = n.arguments ?? [];
      const first = args[0];
      // dynamic import() and require()
      if (ts.isCallExpression(n) && first && ts.isStringLiteralLike(first)) {
        const isDyn = n.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isReq = ts.isIdentifier(n.expression) && n.expression.text === 'require';
        if ((isDyn || isReq) && isForbiddenModule(first.text)) add('forbidden-import', n);
      }
      if (callee) {
        if (callee.name === 'eval' && callee.viaGlobal) add('eval', n);
        if (callee.name === 'Function' && callee.viaGlobal) add('new-function', n);
        if (TIMERS.has(callee.name) && callee.viaGlobal && first && (isStringish(first) || ts.isIdentifier(first) === false && !ts.isFunctionLike(first) && !ts.isCallExpression(first) && !ts.isPropertyAccessExpression(first) && !ts.isParenthesizedExpression(first) && !ts.isIdentifier(first))) {
          if (isStringish(first)) add('string-timer', n);
        }
        // Audio
        if (ts.isNewExpression(n) && callee.name === 'Audio') add('audio-element', n);
        if (callee.name === 'createElement' && first) {
          if (ts.isStringLiteralLike(first) && first.text.toLowerCase() === 'audio') add('audio-element', n);
          const isNonLiteral =
            !ts.isStringLiteralLike(first) &&
            (ts.isPropertyAccessExpression(first) ||
              ts.isElementAccessExpression(first) ||
              ts.isCallExpression(first) ||
              ts.isConditionalExpression(first) ||
              ts.isTemplateExpression(first) ||
              (ts.isIdentifier(first) && (params.has(first.text) || computed.has(first.text))));
          if (isNonLiteral) add('dynamic-element-name', n);
        }
        // setAttribute / setProperty / style writes
        if (callee.name === 'setAttribute' && first && ts.isStringLiteralLike(first)) {
          const a = first.text.toLowerCase();
          const v = args[1];
          if (URL_PROPS.has(a) && !(v && isStaticLiteral(v))) add('dynamic-url', n);
          if (a === 'style') add('dynamic-style', n);
          if (a.startsWith('on')) add('string-handler', n);
          if (HTML_SINKS.has(first.text)) add('inner-html', n);
        }
        if (callee.name === 'setProperty' && first) {
          const isCustom = !ts.isStringLiteralLike(first) || first.text.startsWith('--');
          const v = args[1];
          if (isCustom && !(v && isStaticLiteral(v) && ts.isStringLiteralLike(first))) add('dynamic-css-property', n);
        }
        if (callee.name === 'addEventListener' && args[1] && isStringish(args[1])) add('string-handler', n);
      }
    }

    // Assignments to .href/.src/.on*/.style/.audio
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left)) {
      const p = n.left.name.text;
      if (URL_PROPS.has(p.toLowerCase()) && !isStaticLiteral(n.right)) add('dynamic-url', n);
      if (p.startsWith('on') && p.length > 2 && isStringish(n.right)) add('string-handler', n);
      if (p === 'cssText') add('dynamic-style', n);
      if (ts.isPropertyAccessExpression(n.left.expression) && n.left.expression.name.text === 'style' && !isStaticLiteral(n.right)) {
        add('dynamic-style', n);
      }
    }

    // Object literal keys that are CSS custom properties need a static value.
    if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      const nm = n.name;
      const key =
        ts.isIdentifier(nm) || ts.isStringLiteralLike(nm) ? nm.text : ts.isComputedPropertyName(nm) ? undefined : undefined;
      const customKey = key?.startsWith('--') === true;
      const computedKey = ts.isComputedPropertyName(nm) && hasAncestor(n, (a) => ts.isJsxAttribute(a) && attrName(a) === 'style');
      if (customKey || computedKey) {
        const ok = ts.isPropertyAssignment(n) && isStaticLiteral(n.initializer);
        if (!ok) add('dynamic-css-property', n);
      }
    }

    // JSX
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName;
      if (ts.isIdentifier(tag)) {
        if (tag.text === 'audio') add('audio-element', n);
        else if (/^[A-Z]/.test(tag.text) && (params.has(tag.text) || computed.has(tag.text))) add('dynamic-element-name', n);
      } else if (ts.isPropertyAccessExpression(tag)) {
        const base = tag.expression;
        // Namespaced components such as Foo.Bar are fine; props.as and similar are not.
        if (ts.isIdentifier(base) && (params.has(base.text) || computed.has(base.text))) add('dynamic-element-name', n);
      } else {
        add('dynamic-element-name', n);
      }
    }
    if (ts.isJsxAttribute(n)) {
      const name = attrName(n);
      const expr = attrExpression(n);
      if (HTML_SINKS.has(name)) add('inner-html', n);
      if (expr && URL_ATTRS.has(name) && !isStaticLiteral(expr)) add('dynamic-url', n);
      if (name === 'style' && expr && !isStaticStyle(expr)) add('dynamic-style', n);
      if (/^on[A-Z]/.test(name) && expr && isStringish(expr)) add('string-handler', n);
    }

    // sealed / isolated words in code text (not comments).
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      checkWords(n, n.text);
    } else if (ts.isJsxText(n)) {
      checkWords(n, n.text);
    } else if (ts.isIdentifier(n)) {
      checkWords(n, n.text);
    }
    // Text of audio markup inside a string.
    if (ts.isStringLiteralLike(n) && /<\s*audio\b/i.test(n.text)) add('audio-element', n);

    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function isStaticStyle(e: ts.Node): boolean {
  if (ts.isParenthesizedExpression(e)) return isStaticStyle(e.expression);
  if (!ts.isObjectLiteralExpression(e)) return false;
  return e.properties.every(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
      isStaticLiteral(p.initializer),
  );
}

/** Scan a stylesheet for the Assurance words, ignoring comments. */
export function scanCss(text: string): Violation[] {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const out: Violation[] = [];
  stripped.split('\n').forEach((l, i) => {
    if (WORDS.test(l)) out.push({ rule: 'assurance-words', line: i + 1, text: l.trim().slice(0, 80) });
  });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function scanTargets(): string[] {
  const files = [...walk(join(UI_ROOT, 'src')), ...walk(join(UI_ROOT, 'gallery')), join(UI_ROOT, 'vite.config.ts')];
  return files;
}

function rules(vs: readonly Violation[]): RuleId[] {
  return [...new Set(vs.map((v) => v.rule))];
}

// One sample per rule; each must be flagged with exactly its rule.
const SAMPLES: ReadonlyArray<readonly [string, RuleId, string]> = [
  ['dangerouslySetInnerHTML', 'inner-html', 'export const A = (p: { h: string }) => <div dangerouslySetInnerHTML={{ __html: p.h }} />;'],
  ['innerHTML', 'inner-html', 'export function f(e: Element, s: string) { e.innerHTML = s; }'],
  ['outerHTML', 'inner-html', 'export function f(e: Element, s: string) { e.outerHTML = s; }'],
  ['insertAdjacentHTML', 'inner-html', "export function f(e: Element, s: string) { e.insertAdjacentHTML('beforeend', s); }"],
  ['document.write', 'document-write', 'export function f(s: string) { document.write(s); }'],
  ['eval', 'eval', 'export function f(s: string) { return eval(s); }'],
  ['window.eval', 'eval', 'export function f(s: string) { return window.eval(s); }'],
  ['new Function', 'new-function', "export const f = new Function('a', 'return a');"],
  ['Function call', 'new-function', "export const f = Function('return 1');"],
  ['string setTimeout', 'string-timer', "export function f() { setTimeout('go()', 10); }"],
  ['template setInterval', 'string-timer', 'export function f(n: string) { setInterval(`go(${n})`, 10); }'],
  ['import axe-core', 'forbidden-import', "import axe from 'axe-core';\nexport default axe;"],
  ['import react-dom/server', 'forbidden-import', "import { renderToStaticMarkup } from 'react-dom/server';\nexport { renderToStaticMarkup };"],
  ['import three', 'forbidden-import', "import * as THREE from 'three';\nexport { THREE };"],
  ['import @mujoco/mujoco', 'forbidden-import', "import m from '@mujoco/mujoco';\nexport default m;"],
  ['dynamic import three', 'forbidden-import', "export const load = () => import('three');"],
  ['require axe-core', 'forbidden-import', "export const a = require('axe-core');"],
  ['export from three', 'forbidden-import', "export * from 'three/examples';"],
  ['word sealed', 'assurance-words', "export const T = 'A sealed box';"],
  ['word isolated', 'assurance-words', 'export const A = () => <p>isolated run</p>;'],
  ['audio element', 'audio-element', 'export const A = () => <audio src="a" />;'],
  ['new Audio', 'audio-element', 'export const a = new Audio();'],
  ['createElement audio', 'audio-element', "export const a = document.createElement('audio');"],
  ['audio markup string', 'audio-element', "export const s = '<audio controls></audio>';"],
  ['prop as element name', 'dynamic-element-name', 'export const A = ({ as: Tag }: { as: string }) => <Tag>x</Tag>;'],
  ['props.as element name', 'dynamic-element-name', 'export const A = (props: { as: string }) => <props.as>x</props.as>;'],
  ['createElement prop', 'dynamic-element-name', 'export const A = (p: { t: string }) => createElement(p.t, null);'],
  ['computed element name', 'dynamic-element-name', 'export const A = (p: { t: string }) => { const Tag = p.t; return <Tag />; };'],
  ['prop href', 'dynamic-url', 'export const A = (p: { u: string }) => <a href={p.u}>x</a>;'],
  ['prop src', 'dynamic-url', 'export const A = (p: { u: string }) => <img src={p.u} alt="" />;'],
  ['template href', 'dynamic-url', 'export const A = (p: { u: string }) => <a href={`#${p.u}`}>x</a>;'],
  ['setAttribute href', 'dynamic-url', "export function f(e: Element, u: string) { e.setAttribute('href', u); }"],
  ['assign .src', 'dynamic-url', 'export function f(e: HTMLImageElement, u: string) { e.src = u; }'],
  ['prop style', 'dynamic-style', 'export const A = (p: { s: object }) => <div style={p.s} />;'],
  ['style with prop value', 'dynamic-style', 'export const A = (p: { c: string }) => <div style={{ color: p.c }} />;'],
  ['assign style.x', 'dynamic-style', 'export function f(e: HTMLElement, c: string) { e.style.color = c; }'],
  ['string onClick', 'string-handler', "export const A = () => <button onClick={'go()'}>x</button>;"],
  ['setAttribute onclick', 'string-handler', "export function f(e: Element) { e.setAttribute('onclick', 'go()'); }"],
  ['assign .onclick string', 'string-handler', "export function f(e: HTMLElement) { e.onclick = 'go()'; }"],
  ['custom property value', 'dynamic-css-property', "export const A = (p: { v: string }) => <div style={{ '--gk-x': p.v }} />;"],
  ['setProperty custom', 'dynamic-css-property', "export function f(e: HTMLElement, v: string) { e.style.setProperty('--gk-x', v); }"],
  ['setProperty dynamic name', 'dynamic-css-property', 'export function f(e: HTMLElement, k: string) { e.style.setProperty(k, "1"); }'],
];

const CLEAN_SAMPLE = [
  "import type { Finding } from '@ghost-run/core';",
  "import { createElement } from 'react';",
  '// innerHTML eval document.write sealed isolated <audio> in a comment',
  '/* dangerouslySetInnerHTML and new Function in a block comment */',
  "export const ASSURANCE_X = 'Ghost ran inside a sealed box.';",
  'export const A = (p: { text: string; onBack: () => void; f?: Finding }) => (',
  '  <div style={{ color: "red", "--gk-x": "1" }}>',
  '    <a href="#top" onClick={p.onBack}>{p.text}</a>',
  '    <audioPlayer />',
  '  </div>',
  ');',
  "export const B = createElement('span', null, 'x');",
  'export const t = setTimeout(() => undefined, 1);',
].join('\n');

describe('source scan: self-tests (every rule flags its sample)', () => {
  for (const [label, rule, code] of SAMPLES) {
    it(`flags ${label} as ${rule}`, () => {
      const found = scanSource('sample.tsx', code);
      expect(rules(found)).toContain(rule);
    });
  }

  it('covers every rule id with at least one sample', () => {
    const covered = new Set(SAMPLES.map((s) => s[1]));
    const all: RuleId[] = [
      'inner-html', 'document-write', 'eval', 'new-function', 'string-timer', 'forbidden-import',
      'assurance-words', 'audio-element', 'dynamic-element-name', 'dynamic-url', 'dynamic-style',
      'string-handler', 'dynamic-css-property',
    ];
    for (const r of all) expect(covered.has(r), r).toBe(true);
  });

  it('allows a component-typed parameter to be rendered but not an untyped or string one', () => {
    const ok = 'export const w = <P,>(Inner: ComponentType<P>) => (p: P) => <Inner {...p} />;';
    expect(scanSource('ok.tsx', ok)).toEqual([]);
    const bad = 'export const w = (Inner: string) => () => <Inner />;';
    expect(rules(scanSource('bad.tsx', bad))).toContain('dynamic-element-name');
  });

  it('ignores comments, allowed constants, static values and function timers', () => {
    expect(scanSource('clean.tsx', CLEAN_SAMPLE)).toEqual([]);
  });

  it('flags the audio file extensions it is told to ban', () => {
    expect(AUDIO_EXTENSIONS.has('.mp3')).toBe(true);
    expect(AUDIO_EXTENSIONS.has(extname('x/y/chime.wav'))).toBe(true);
  });

  it('flags the stylesheet words outside comments only', () => {
    expect(scanCss('.a { content: "sealed"; }')).toHaveLength(1);
    expect(scanCss('/* sealed isolated */ .a { color: red; }')).toEqual([]);
  });
});

describe('source scan: ui/src, ui/gallery, ui/vite.config.ts', () => {
  const files = scanTargets();

  it('finds the files to scan', () => {
    expect(files.some((f) => f.endsWith('vite.config.ts'))).toBe(true);
    expect(files.some((f) => f.includes(`${join('ui', 'src')}`) || f.includes('/src/'))).toBe(true);
    expect(files.some((f) => f.includes('/gallery/'))).toBe(true);
  });

  it('has no violations in any source file', () => {
    const report: string[] = [];
    for (const f of files) {
      const ext = extname(f);
      const text = readFileSync(f, 'utf8');
      let vs: Violation[] = [];
      if (ext === '.ts' || ext === '.tsx') vs = scanSource(f, text);
      else if (ext === '.css') vs = scanCss(text);
      for (const v of vs) report.push(`${relative(UI_ROOT, f)}:${v.line} [${v.rule}] ${v.text}`);
    }
    expect(report).toEqual([]);
  });

  it('has no audio file under ui/ (node_modules and dist excluded)', () => {
    const audio = walk(UI_ROOT)
      .filter((f) => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
      .map((f) => relative(UI_ROOT, f));
    expect(audio).toEqual([]);
  });

  it('keeps sealed and isolated inside the two Assurance_Text constants', () => {
    const texts = readFileSync(join(UI_ROOT, 'src', 'model', 'texts.ts'), 'utf8');
    const sf = ts.createSourceFile('texts.ts', texts, ts.ScriptTarget.Latest, true);
    const names: string[] = [];
    sf.forEachChild((n) => {
      if (ts.isVariableStatement(n)) {
        for (const d of n.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && ASSURANCE_NAME.test(d.name.text)) names.push(d.name.text);
        }
      }
    });
    expect(names.sort()).toEqual(['ASSURANCE_DOCKER', 'ASSURANCE_PLAYGROUND']);
  });
});

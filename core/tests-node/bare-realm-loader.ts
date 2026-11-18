// Loads core/src/possession/ into a bare node:vm realm (Requirements 1.2, 1.3, 1.5).
//
// Every file is transpiled with ts.transpileModule (ES2022, CommonJS) and evaluated in
// vm.createContext({}). That realm has only the ECMAScript built-ins: no process, Buffer,
// console, URL, TextEncoder, window, document, or require. Any use of such a global
// throws ReferenceError. The loader hands each module a tiny `require` that resolves
// only relative specifiers to siblings that were already loaded.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const POSSESSION_DIR = fileURLToPath(new URL('../src/possession/', import.meta.url));

export interface BareRealm {
  /** The vm context. Its globals are the ECMAScript built-ins only. */
  readonly context: vm.Context;
  /** The exports of ./index.js, evaluated inside the realm. */
  readonly api: Record<string, unknown>;
  /** The exports of every loaded module, keyed by file name without extension. */
  readonly modules: ReadonlyMap<string, Record<string, unknown>>;
  /** Evaluate an expression in the realm. */
  evaluate(code: string): unknown;
  /** Copy a JSON-safe host value into the realm (so the realm sees its own Object and Array). */
  toRealm<T>(value: unknown): T;
}

function transpile(fileName: string, source: string): string {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      // Keep the evaluated code self-contained and free of helper imports.
      importHelpers: false,
      esModuleInterop: false,
      sourceMap: false,
    },
  }).outputText;
}

/** Module names (file names without extension) of the relative requires in CommonJS output. */
function requiredSiblings(js: string): string[] {
  const names: string[] = [];
  const re = /require\(\s*"\.\/([^"/]+)\.js"\s*\)/g;
  for (let m = re.exec(js); m !== null; m = re.exec(js)) names.push(m[1] as string);
  return names;
}

export function loadBareRealm(): BareRealm {
  const files = readdirSync(POSSESSION_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();
  const compiled = new Map<string, string>();
  for (const file of files) {
    const name = file.slice(0, -'.ts'.length);
    compiled.set(name, transpile(file, readFileSync(join(POSSESSION_DIR, file), 'utf8')));
  }

  const context = vm.createContext({});
  const modules = new Map<string, Record<string, unknown>>();
  const loaded = new Set<string>();

  const evaluate = (code: string, filename = 'bare-realm-eval.js'): unknown =>
    vm.runInContext(code, context, { filename });

  const realmRequire = (specifier: string): unknown => {
    // Type-only imports of ../types.js are erased by transpile; a stray one gets an empty module.
    if (specifier === '../types.js') return evaluate('({})');
    const match = /^\.\/([^/]+)\.js$/.exec(specifier);
    const name = match?.[1];
    if (name === undefined || !loaded.has(name)) {
      throw new Error(`bare realm: cannot resolve ${JSON.stringify(specifier)}`);
    }
    return modules.get(name);
  };

  const load = (name: string, trail: readonly string[]): void => {
    if (loaded.has(name)) return;
    if (trail.includes(name)) throw new Error(`bare realm: import cycle at ${name}`);
    const js = compiled.get(name);
    if (js === undefined) throw new Error(`bare realm: missing sibling ${name}`);
    for (const dep of requiredSiblings(js)) load(dep, [...trail, name]);

    const wrapper = evaluate(
      `(function (exports, require, module) {\n${js}\n})`,
      `${name}.js`,
    ) as (exports: unknown, require: (s: string) => unknown, module: unknown) => void;
    const moduleObject = evaluate('({ exports: {} })') as { exports: Record<string, unknown> };
    wrapper(moduleObject.exports, realmRequire, moduleObject);
    modules.set(name, moduleObject.exports);
    loaded.add(name);
  };

  for (const name of [...compiled.keys()].sort()) load(name, []);

  const parse = evaluate('(function (s) { return JSON.parse(s); })') as (s: string) => unknown;
  return {
    context,
    api: modules.get('index') as Record<string, unknown>,
    modules,
    evaluate: (code) => evaluate(code),
    toRealm: <T>(value: unknown): T => parse(JSON.stringify(value)) as T,
  };
}

// Feature: ghost-cloud, Property 15: Import scans
// **Validates: Requirements 3.3, 4.3, 12.3**

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(root, file);

interface ImportRef {
  readonly spec: string;
  readonly typeOnly: boolean;
}

/** Static import, export-from, and dynamic import specifiers of a TypeScript file. */
function importsOf(text: string): ImportRef[] {
  const out: ImportRef[] = [];
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'";]*?from\s*['"]([^'"]+)['"]/gm)) {
    out.push({ spec: m[3] as string, typeOnly: m[2] !== undefined });
  }
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) {
    out.push({ spec: m[1] as string, typeOnly: false });
  }
  for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push({ spec: m[1] as string, typeOnly: false });
  }
  return out;
}

function resolveRelative(from: string, spec: string): string {
  const base = resolve(dirname(from), spec);
  const candidates = [base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  if (hit === undefined) throw new Error(`cannot resolve ${spec} from ${rel(from)}`);
  return hit;
}

/** All files reachable from the entries through relative imports. */
function graph(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const ref of importsOf(read(file))) {
      if (ref.spec.startsWith('.')) queue.push(resolveRelative(file, ref.spec));
    }
  }
  return [...seen].sort();
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const entries = [join(root, 'src', 'index.ts'), join(root, 'src', 'pipeline', 'run-plan.ts')];
const reachable = graph(entries);

describe('import scans', () => {
  it('walks a non-trivial import graph', () => {
    const names = reachable.map(rel);
    expect(names).toContain(join('src', 'world.ts'));
    expect(names).toContain(join('src', 'pipeline', 'run-plan.ts'));
    expect(names.length).toBeGreaterThan(8);
  });

  it('the Pipeline_Entry graph imports only relative files and @ghost-run/core', () => {
    const bad: string[] = [];
    for (const file of reachable) {
      for (const ref of importsOf(read(file))) {
        const ok = ref.spec.startsWith('.') || ref.spec === '@ghost-run/core';
        if (!ok) bad.push(`${rel(file)} -> ${ref.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the Pipeline_Entry graph has no node: import', () => {
    const bad = reachable.flatMap((f) =>
      importsOf(read(f))
        .filter((r) => r.spec.startsWith('node:'))
        .map((r) => `${rel(f)} -> ${r.spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('src/ imports nothing from apps, integrations, ui, ghost-runner, or other worlds', () => {
    const forbidden = /(^|\/)(apps|integrations|ui|ghost-runner|wards-config|worlds)(\/|$)|^@ghost-run\/(ui|ghost-runner|wards-config)/;
    const files = walk(join(root, 'src')).filter((f) => f.endsWith('.ts'));
    const bad = files.flatMap((f) =>
      importsOf(read(f))
        .filter((r) => forbidden.test(r.spec))
        .map((r) => `${rel(f)} -> ${r.spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('the Reference_Model has only type imports from src/ and @ghost-run/core', () => {
    const file = join(root, 'tests', 'support', 'reference-model.ts');
    const refs = importsOf(read(file));
    expect(refs.length).toBeGreaterThan(0);
    const bad = refs
      .filter((r) => !r.typeOnly)
      .map((r) => r.spec);
    expect(bad).toEqual([]);
    for (const r of refs) {
      expect(r.spec.startsWith('@ghost-run/core') || /\/src\/types(\.js)?$/.test(r.spec)).toBe(true);
    }
  });
});

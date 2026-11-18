import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Package guard for apps/ghost-hand. Validates: Requirements 1.3, 1.5, 1.7.

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const uiRoot = fileURLToPath(new URL('../../../../ui/', import.meta.url));

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackage(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
}

function listSources(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function specifiers(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.push(m[1] as string);
  }
  return found;
}

const sourceFiles = [...listSources(join(appRoot, 'src')), ...listSources(join(appRoot, 'tests'))].filter(
  (f) => !f.endsWith('package.test.ts'),
);
const imports = sourceFiles.flatMap((file) =>
  specifiers(readFileSync(file, 'utf8')).map((spec) => ({ file, spec })),
);

describe('apps/ghost-hand package.json', () => {
  const pkg = readPackage(appRoot);
  const ui = readPackage(uiRoot);
  const deps = pkg.dependencies ?? {};
  const dev = pkg.devDependencies ?? {};
  const uiAll = { ...ui.dependencies, ...ui.devDependencies };

  it('declares exactly the runtime dependencies of task 4.2', () => {
    expect(Object.keys(deps).sort()).toEqual(
      [
        '@ghost-run/core',
        '@ghost-run/drawer-arm',
        '@ghost-run/ui',
        '@ghost-run/wards-config',
        '@mujoco/mujoco',
        'react',
        'react-dom',
        'three',
      ].sort(),
    );
    for (const name of ['@ghost-run/core', '@ghost-run/drawer-arm', '@ghost-run/ui', '@ghost-run/wards-config']) {
      expect(deps[name]).toBe('workspace:*');
    }
  });

  it('pins @mujoco/mujoco and three to exact versions', () => {
    expect(deps['@mujoco/mujoco']).toBe('4.0.1');
    expect(deps['three']).toBe('0.187.0');
  });

  it('keeps the build and test tools in devDependencies', () => {
    expect(dev['@types/three']).toBe('0.187.0');
    for (const name of ['vite', 'vitest', 'jsdom']) expect(dev[name]).toBeDefined();
  });

  it('matches the ui package versions of react, react-dom, vite, vitest, jsdom', () => {
    for (const name of ['react', 'react-dom', 'vite', 'vitest', 'jsdom']) {
      const own = deps[name] ?? dev[name];
      expect(own, name).toBeDefined();
      expect(own, name).toBe(uiAll[name]);
    }
  });
});

describe('apps/ghost-hand import scan', () => {
  it('imports @ghost-run/wards-config only through its default entry point', () => {
    const bad = imports.filter(
      ({ spec }) => spec.startsWith('@ghost-run/wards-config') && spec !== '@ghost-run/wards-config',
    );
    expect(bad).toEqual([]);
  });

  it('never imports ghost-runner, integrations, or Experiment C paths', () => {
    const bad = imports.filter(
      ({ spec }) =>
        spec.startsWith('@ghost-run/ghost-runner') ||
        /(^|\/)ghost-runner(\/|$)/.test(spec) ||
        /(^|\/)integrations(\/|$)/.test(spec) ||
        /experiment[-_/ ]?c(\b|$)/i.test(spec),
    );
    expect(bad).toEqual([]);
  });
});

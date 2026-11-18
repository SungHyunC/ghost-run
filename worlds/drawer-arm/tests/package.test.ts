import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Package guard for worlds/drawer-arm. Validates: Requirements 1.3, 1.4, 1.5, 1.7.

const worldRoot = fileURLToPath(new URL('../', import.meta.url));

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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

const pkg = JSON.parse(readFileSync(join(worldRoot, 'package.json'), 'utf8')) as PackageJson;

const sourceFiles = [
  ...listSources(join(worldRoot, 'src')),
  ...listSources(join(worldRoot, 'tests')),
  join(worldRoot, 'world.config.ts'),
].filter((f) => !f.endsWith('package.test.ts'));
const imports = sourceFiles.flatMap((file) =>
  specifiers(readFileSync(file, 'utf8')).map((spec) => ({
    file,
    rel: relative(worldRoot, file).split(sep).join('/'),
    spec,
  })),
);

describe('worlds/drawer-arm package.json', () => {
  it('depends on @ghost-run/core and @mujoco/mujoco only', () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['@ghost-run/core', '@mujoco/mujoco']);
    expect(pkg.dependencies?.['@ghost-run/core']).toBe('workspace:*');
    expect(pkg.dependencies?.['@mujoco/mujoco']).toBe('4.0.1');
  });

  it('declares no three, react, or @ghost-run/ui in any dependency field', () => {
    const all = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    for (const name of ['three', '@types/three', 'react', 'react-dom', '@ghost-run/ui']) {
      expect(all[name], name).toBeUndefined();
    }
  });
});

describe('worlds/drawer-arm import scan', () => {
  it('imports @mujoco/mujoco only under src/engine/', () => {
    const bad = imports.filter(
      ({ rel, spec }) =>
        (spec === '@mujoco/mujoco' || spec.startsWith('@mujoco/mujoco/')) && !rel.startsWith('src/engine/'),
    );
    expect(bad.map((b) => b.rel)).toEqual([]);
  });

  it('imports @ghost-run/core only through its public entry point (the contract test also uses the verify subpath)', () => {
    // verifyWorld is exported by the `./verify` subpath of core, not by its index. Only the contract test may use it.
    const bad = imports.filter(
      ({ rel, spec }) =>
        spec.startsWith('@ghost-run/core') &&
        spec !== '@ghost-run/core' &&
        !(spec === '@ghost-run/core/verify' && rel === 'tests/contract.test.ts'),
    );
    expect(bad).toEqual([]);
  });

  it('never imports three, react, ui, ghost-runner, integrations, or Experiment C paths', () => {
    const bad = imports.filter(
      ({ spec }) =>
        spec === 'three' ||
        spec.startsWith('three/') ||
        spec === 'react' ||
        spec.startsWith('react/') ||
        spec.startsWith('react-dom') ||
        spec.startsWith('@ghost-run/ui') ||
        spec.startsWith('@ghost-run/ghost-runner') ||
        /(^|\/)ghost-runner(\/|$)/.test(spec) ||
        /(^|\/)integrations(\/|$)/.test(spec) ||
        /experiment[-_/ ]?c(\b|$)/i.test(spec),
    );
    expect(bad).toEqual([]);
  });
});

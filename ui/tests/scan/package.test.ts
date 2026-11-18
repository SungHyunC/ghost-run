import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Package guard for @ghost-run/ui. Validates: Requirements 1.1, 1.3, 1.7

const uiRoot = new URL('../../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  version?: string;
}

function readJson(url: URL): PackageJson {
  return JSON.parse(readFileSync(url, 'utf8')) as PackageJson;
}

const pkg = readJson(new URL('package.json', uiRoot));
const dependencies = pkg.dependencies ?? {};
const devDependencies = pkg.devDependencies ?? {};

describe('ui/package.json dependencies', () => {
  it('has exactly @ghost-run/core, react, and react-dom as dependencies', () => {
    expect(Object.keys(dependencies).sort()).toEqual(['@ghost-run/core', 'react', 'react-dom']);
  });

  it.each(['happy-dom', 'three', '@mujoco/mujoco', 'eslint-plugin-react', 'eslint-plugin-jsx-a11y'])(
    'does not list %s in any dependency group',
    (name) => {
      expect(name in dependencies).toBe(false);
      expect(name in devDependencies).toBe(false);
    },
  );

  it.each(['@eslint-react/eslint-plugin', 'axe-core'])('lists %s in devDependencies only', (name) => {
    expect(name in devDependencies).toBe(true);
    expect(name in dependencies).toBe(false);
  });
});

describe('installed tool versions', () => {
  it.each([
    ['vite', 7],
    ['vitest', 3],
    ['jsdom', 26],
  ])('%s has major version %i', (name, major) => {
    const installed = readJson(new URL(`node_modules/${name}/package.json`, uiRoot));
    expect(Number.parseInt(String(installed.version).split('.')[0] ?? '', 10)).toBe(major);
  });
});

describe('pnpm-workspace.yaml', () => {
  it('has a ui package entry', () => {
    const text = readFileSync(new URL('pnpm-workspace.yaml', repoRoot), 'utf8');
    const entries = text
      .split(/\r?\n/)
      .map((line) => /^\s*-\s*['"]?([^'"\s#]+)['"]?\s*(#.*)?$/.exec(line)?.[1])
      .filter((entry): entry is string => entry !== undefined);
    expect(entries).toContain('ui');
  });
});

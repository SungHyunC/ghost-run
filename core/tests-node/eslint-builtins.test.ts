// ESLint boundary test for core (Requirements 1.2, 1.3, 1.6, 1.7).
// Lints virtual files through eslint.config.mjs; no file is written.
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const CORE = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: CORE, overrideConfigFile: 'eslint.config.mjs' });

const SRC = 'src/__probe__.ts';
const POSSESSION = 'src/possession/__probe__.ts';
const NODE_ADAPTER = 'possession-node.ts';
const IMPORT_RULES = new Set(['no-restricted-imports', 'no-restricted-syntax']);

async function importMessages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId !== null && IMPORT_RULES.has(m.ruleId))
    .map((m) => `${m.ruleId}: ${m.message}`);
}

async function allMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

const q = (s: string): string => JSON.stringify(s);

const staticForms = (s: string): string[] => [
  `import x from ${q(s)};\nexport { x };\n`,
  `import type { T } from ${q(s)};\nexport type U = T;\n`,
  `export * from ${q(s)};\n`,
  `import x = require(${q(s)});\nexport { x };\n`,
];
const dynamicForms = (s: string): string[] => [
  `export const p = import(${q(s)});\n`,
  `export const r = require(${q(s)});\n`,
];

const BARE_NAMES = [...new Set(builtinModules.map((m) => m.replace(/^node:/, '')))];
const FIXED = ['fs', 'fs/promises', 'path', 'crypto', 'vm', 'child_process', 'node:fs', 'node:test'];
const SRC_FILES = [SRC, POSSESSION];

describe('ESLint built-in import bans', () => {
  it('the builtinModules list is not empty', () => {
    expect(builtinModules.length).toBeGreaterThan(20);
  });

  it.each(SRC_FILES)('every built-in name is banned in all forms in %s', async (file) => {
    const misses: string[] = [];
    for (const name of builtinModules) {
      for (const code of [...staticForms(name), ...dynamicForms(name)]) {
        if ((await importMessages(code, file)).length === 0) misses.push(`${name} :: ${code.trim()}`);
      }
    }
    expect(misses).toEqual([]);
  }, 120_000);

  it('every bare built-in name is banned in all forms in possession-node.ts', async () => {
    const misses: string[] = [];
    for (const name of BARE_NAMES) {
      for (const code of [...staticForms(name), ...dynamicForms(name)]) {
        if ((await importMessages(code, NODE_ADAPTER)).length === 0) misses.push(`${name} :: ${code.trim()}`);
      }
    }
    expect(misses).toEqual([]);
  }, 120_000);

  it.each(SRC_FILES)('the fixed list is banned in static and dynamic forms in %s', async (file) => {
    const misses: string[] = [];
    for (const name of FIXED) {
      for (const code of [...staticForms(name), ...dynamicForms(name)]) {
        if ((await importMessages(code, file)).length === 0) misses.push(`${name} :: ${code.trim()}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('the fixed list is banned in possession-node.ts (bare static, all dynamic)', async () => {
    const misses: string[] = [];
    for (const name of FIXED) {
      const codes = name.startsWith('node:') ? dynamicForms(name) : [...staticForms(name), ...dynamicForms(name)];
      for (const code of codes) {
        if ((await importMessages(code, NODE_ADAPTER)).length === 0) misses.push(`${name} :: ${code.trim()}`);
      }
    }
    // node:fs/promises is the one allowed static import of the adapter.
    expect(misses).toEqual([]);
  });

  it.each([SRC, POSSESSION, NODE_ADAPTER])('computed specifiers produce a message in %s', async (file) => {
    expect(await importMessages('declare const name: string;\nexport const p = import(name);\n', file)).not.toEqual([]);
    expect(await importMessages('declare const name: string;\nexport const r = require(name);\n', file)).not.toEqual([]);
  });

  describe('negative controls', () => {
    const relative = ['./fs.js', './path.js', '../types.js'];
    it.each(SRC_FILES.concat(NODE_ADAPTER))('relative specifiers are not flagged in %s', async (file) => {
      for (const spec of relative) {
        for (const code of [...staticForms(spec).slice(0, 3), ...dynamicForms(spec)]) {
          expect(await importMessages(code, file), `${spec} :: ${code.trim()}`).toEqual([]);
        }
      }
    });

    it.each([SRC, NODE_ADAPTER])('@ghost-run/core is not flagged in %s', async (file) => {
      for (const code of [...staticForms('@ghost-run/core').slice(0, 3), ...dynamicForms('@ghost-run/core')]) {
        expect(await importMessages(code, file), code.trim()).toEqual([]);
      }
    });
  });

  describe('possession-node.ts', () => {
    it('allows node:fs/promises', async () => {
      expect(await importMessages(`import { readFile } from 'node:fs/promises';\nexport { readFile };\n`, NODE_ADAPTER)).toEqual([]);
    });
    it('bans fs/promises', async () => {
      expect(await importMessages(`import { readFile } from 'fs/promises';\nexport { readFile };\n`, NODE_ADAPTER)).not.toEqual([]);
    });
  });

  describe('real files', () => {
    it('lint with zero errors', async () => {
      const results = await eslint.lintFiles(['src', 'possession-node.ts']);
      const errors = results.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.ruleId} ${m.message}`));
      expect(results.length).toBeGreaterThan(10);
      expect(errors).toEqual([]);
    });
  });

  describe('src/possession globals', () => {
    it.each([
      ['process', 'export const a = process;\n'],
      ['Date', 'export const b = Date.now();\n'],
    ])('flags %s', async (name, code) => {
      const messages = await allMessages(code, POSSESSION);
      expect(messages.some((m) => m.ruleId === 'no-restricted-globals' && m.message.includes(name))).toBe(true);
    });
  });
});

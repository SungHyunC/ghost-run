import tseslint from 'typescript-eslint';

const banMessage = (name) => `${name} is not allowed in the ghost-cloud world.`;

// Package imports allowed: @ghost-run/core, @ghost-run/core/verify (tests only).
const wardsConfigGroup = ['@ghost-run/wards-config', '@ghost-run/wards-config/**', '**/wards-config/**'];

const bannedPatterns = [
  { group: wardsConfigGroup, message: banMessage('wards-config') },
  { group: ['@ghost-run/ui', '@ghost-run/ui/**', '**/ui/**'], message: banMessage('@ghost-run/ui') },
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/**', '**/ghost-runner/**'], message: banMessage('ghost-runner') },
  { group: ['**/apps/**', '@ghost-run/ghost-shell', '@ghost-run/ghost-hand'], message: banMessage('apps') },
  { group: ['**/integrations/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: banMessage('integrations') },
  { group: ['react', 'react/**', 'react-dom', 'react-dom/**'], message: banMessage('react') },
  { group: ['three', 'three/**'], message: banMessage('three') },
  { group: ['@mujoco/mujoco', '@mujoco/mujoco/**'], message: banMessage('@mujoco/mujoco') },
  { group: ['@ghost-run/core/*', '!@ghost-run/core/verify'], message: 'Only the public entry of @ghost-run/core (and verify in tests) is allowed.' },
];

const nodeBuiltins = ['fs', 'fs/**', 'path', 'path/**', 'os', 'crypto', 'child_process', 'http', 'https', 'net', 'url', 'util', 'stream', 'zlib', 'worker_threads', 'buffer', 'process'];

const bannedSyntax = [
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  { selector: "CallExpression[callee.name='Function']", message: 'Function() is banned.' },
  { selector: "NewExpression[callee.name='Date']", message: 'new Date is banned in src (determinism).' },
];

const bannedProperties = [
  { object: 'Date', property: 'now', message: 'Date.now is banned in src (determinism).' },
  { object: 'Math', property: 'random', message: 'Math.random is banned in src (determinism).' },
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': ['error', { patterns: bannedPatterns }],
    },
  },
  {
    // Tests may import the wards-config package by name (devDependency); relative paths stay banned.
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['../**/wards-config/**'], message: banMessage('relative wards-config paths') },
        ...bannedPatterns.filter((p) => p.group !== wardsConfigGroup),
      ] }],
    },
  },
  {
    // Repeated in full because a later block replaces the options of an earlier one.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@ghost-run/core/verify'], message: 'verify is for tests only.' }, { group: ['node:*', ...nodeBuiltins], message: 'Node built-ins are not allowed in src (browser entry).' }, ...bannedPatterns.slice(0, -1)] }],
      'no-restricted-syntax': ['error', ...bannedSyntax],
      'no-restricted-properties': ['error', ...bannedProperties],
    },
  },
);

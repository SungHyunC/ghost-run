import tseslint from 'typescript-eslint';

const BAN_COMMON = [
  { group: ['three', 'three/*'], message: 'The world must not import three.' },
  { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'The world must not import react.' },
  { group: ['@ghost-run/ui', '@ghost-run/ui/*'], message: 'The world must not import the UI kit.' },
  { group: ['@ghost-run/wards-config', '@ghost-run/wards-config/*'], message: 'The world must not import wards-config.' },
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*'], message: 'The world must not import ghost-runner.' },
  { group: ['**/apps/**', '**/integrations/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: 'The world must not import apps or integrations.' },
  { group: ['@ghost-run/core/*'], message: 'Import core only through its public entry point.' },
];
const MUJOCO = { group: ['@mujoco/mujoco', '@mujoco/mujoco/*'], message: '@mujoco/mujoco may only be imported inside src/engine/.' };

const SYNTAX_BAN = [
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  { selector: "NewExpression[callee.name='Date']", message: 'new Date is banned (pure world logic).' },
];
const PROPERTY_BAN = [
  { object: 'Date', property: 'now', message: 'Date.now is banned (pure world logic).' },
  { object: 'Math', property: 'random', message: 'Math.random is banned (use the seeded sampler).' },
];

// Declared once and spread into every block: a later block replaces rule options instead of merging them.
export default tseslint.config(
  {
    files: ['src/**/*.ts', 'world.config.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...BAN_COMMON, MUJOCO] }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-properties': ['error', ...PROPERTY_BAN],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': ['error', { patterns: BAN_COMMON }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-properties': ['error', ...PROPERTY_BAN],
    },
  },
);

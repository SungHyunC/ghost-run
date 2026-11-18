import tseslint from 'typescript-eslint';

const banMessage = (name) => `${name} is not allowed in the ghost-shell app.`;

const BANNED_IMPORTS = [
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '**/ghost-runner/**'], message: banMessage('ghost-runner') },
  { group: ['@ghost-run/ghost-hand', '@ghost-run/ghost-hand/*'], message: banMessage('ghost-hand') },
  { group: ['three', 'three/*'], message: banMessage('three') },
  { group: ['@mujoco/mujoco', '@mujoco/mujoco/*'], message: banMessage('@mujoco/mujoco') },
  { group: ['**/integrations/**'], message: banMessage('integrations') },
  { group: ['@ghost-run/wards-config/node'], message: 'The browser app must not import the Node entry of wards-config.' },
  { group: ['@ghost-run/core/*'], message: 'Import core only through its public entry point.' },
];

const SYNTAX_BAN = [
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned.' },
  { selector: "Property[key.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned.' },
  { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Raw HTML assignment is banned.' },
  { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'insertAdjacentHTML is banned.' },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]", message: 'document.write is banned.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
];

const STORAGE_GLOBALS = ['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
  name,
  message: `${name} is not allowed in the app.`,
}));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'vite.config.ts', 'vitest.config.ts'],
    extends: [tseslint.configs.base],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-restricted-imports': ['error', { patterns: BANNED_IMPORTS }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
    },
  },
);

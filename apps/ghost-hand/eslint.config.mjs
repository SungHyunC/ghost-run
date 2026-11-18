import tseslint from 'typescript-eslint';

const BAN_COMMON = [
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '**/ghost-runner/**'], message: 'The app must not import ghost-runner.' },
  { group: ['**/integrations/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: 'The app must not import integrations.' },
  { group: ['@ghost-run/wards-config/node'], message: 'The browser app must not import the Node entry of wards-config.' },
  { group: ['@ghost-run/core/*'], message: 'Import core only through its public entry point.' },
  { group: ['@mujoco/mujoco', '@mujoco/mujoco/*'], message: '@mujoco/mujoco is imported only inside worlds/drawer-arm/src/engine/.' },
];
const THREE = { group: ['three', 'three/*'], message: 'three may only be imported inside src/overlay/.' };

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

// Declared once and spread into every block: a later block replaces rule options instead of merging them.
export default tseslint.config(
  { ignores: ['dist/**', 'dist-node/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [tseslint.configs.base],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-restricted-imports': ['error', { patterns: [...BAN_COMMON, THREE] }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
    },
  },
  {
    files: ['src/overlay/**/*.{ts,tsx}'],
    extends: [tseslint.configs.base],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-restricted-imports': ['error', { patterns: BAN_COMMON }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
    },
  },
);

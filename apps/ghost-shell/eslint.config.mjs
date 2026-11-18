import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';

// Resolve the dangerouslySetInnerHTML rule ids from the installed plugin at load time; fail loudly when none match.
const dangerousHtmlRuleIds = Object.keys(eslintReact.rules ?? {}).filter((id) => /no-dangerously-set-innerhtml/i.test(id));
if (dangerousHtmlRuleIds.length === 0) {
  throw new Error('@eslint-react/eslint-plugin exposes no rule matching /no-dangerously-set-innerhtml/; update apps/ghost-shell/eslint.config.mjs.');
}
const dangerousHtmlRules = Object.fromEntries(dangerousHtmlRuleIds.map((id) => [`@eslint-react/${id}`, 'error']));

const banMessage = (name) => `${name} is not allowed in the ghost-shell app.`;

const BANNED_IMPORTS = [
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '**/ghost-runner/**'], message: banMessage('ghost-runner') },
  { group: ['@ghost-run/ghost-hand', '@ghost-run/ghost-hand/*'], message: banMessage('ghost-hand') },
  { group: ['three', 'three/*'], message: banMessage('three') },
  { group: ['@mujoco/mujoco', '@mujoco/mujoco/*'], message: banMessage('@mujoco/mujoco') },
  { group: ['**/integrations/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: banMessage('integrations') },
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
    plugins: { '@eslint-react': eslintReact, 'react-hooks': hooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...dangerousHtmlRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', { patterns: BANNED_IMPORTS }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
      'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
    },
  },
);

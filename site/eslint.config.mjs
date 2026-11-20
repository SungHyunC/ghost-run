import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';

// Resolve the dangerouslySetInnerHTML rule ids from the installed plugin at load time; fail loudly when none match.
const dangerousHtmlRuleIds = Object.keys(eslintReact.rules ?? {}).filter((id) => /no-dangerously-set-innerhtml/i.test(id));
if (dangerousHtmlRuleIds.length === 0) {
  throw new Error('@eslint-react/eslint-plugin exposes no rule matching /no-dangerously-set-innerhtml/; update site/eslint.config.mjs.');
}
const dangerousHtmlRules = Object.fromEntries(dangerousHtmlRuleIds.map((id) => [`@eslint-react/${id}`, 'error']));

// The page runtime may import react, react-dom, @fontsource/fredoka, and files of site/ only.
const PAGE_BANNED_IMPORTS = [
  { group: ['@ghost-run/*'], message: 'The page runtime must not import any @ghost-run package.' },
  { group: ['**/apps/**', '**/worlds/**', '**/core/**', '**/ui/**'], message: 'The page runtime must not reach apps/, worlds/, core/, or ui/.' },
  { group: ['three', 'three/*', '@mujoco/mujoco', 'sql.js'], message: 'Not allowed in the page runtime.' },
];

const SYNTAX_BAN = [
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned.' },
  { selector: "Property[key.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned.' },
  { selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]', message: 'Raw HTML assignment is banned.' },
  { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'insertAdjacentHTML is banned.' },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]", message: 'document.write is banned.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
];

const NETWORK_BAN = [
  { selector: "CallExpression[callee.name='fetch']", message: 'The page makes no network request.' },
  { selector: "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]", message: 'The page makes no network request.' },
  { selector: "CallExpression[callee.property.name='sendBeacon']", message: 'The page makes no network request.' },
];

const ENGINE_BAN = [
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'The engine reads no clock.' },
  { selector: "NewExpression[callee.name='Date']", message: 'The engine reads no clock.' },
  { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'The engine reads no random source.' },
];

const STORAGE_GLOBALS = ['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
  name,
  message: `${name} is not allowed in the page.`,
}));

export default tseslint.config(
  { ignores: ['dist/**', 'build/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'scripts/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    extends: [tseslint.configs.base],
    plugins: { '@eslint-react': eslintReact, 'react-hooks': hooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...dangerousHtmlRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: PAGE_BANNED_IMPORTS }],
      'no-restricted-syntax': ['error', ...SYNTAX_BAN, ...NETWORK_BAN],
      'no-restricted-globals': ['error', ...STORAGE_GLOBALS],
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...SYNTAX_BAN, ...NETWORK_BAN, ...ENGINE_BAN],
    },
  },
  {
    // The record measure file may import exactly the packages of the design's dependency table
    // and, by relative path, the two app pipeline modules.
    files: ['scripts/record-runs.measure.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ghost-run/ui', '@ghost-run/ui/*', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '@ghost-run/kiro-hook', '@ghost-run/mcp', '**/ui/**', '**/ghost-runner/**', '**/integrations/**'],
              message: 'The record script may not import ui/, ghost-runner/, or integrations/.',
            },
            { group: ['@ghost-run/core/*'], message: 'Import core only through its public entry point.' },
          ],
        },
      ],
    },
  },
);

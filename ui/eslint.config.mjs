import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';

// Rule IDs of the dangerouslySetInnerHTML prohibition in @eslint-react/eslint-plugin 5.30.3 (verified, fixed, no fallback):
// '@eslint-react/dom-no-dangerously-set-innerhtml' and '@eslint-react/dom-no-dangerously-set-innerhtml-with-children'.
// The plugin is registered under the key '@eslint-react' in the plugins object below.

const FORBIDDEN_IMPORTS = [
  { group: ['@ghost-run/ghost-runner', '@ghost-run/ghost-runner/**', '**/ghost-runner/**'], message: 'ui may depend on @ghost-run/core only.' },
  { group: ['**/apps/**', '**/integrations/**', '**/worlds/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: 'ui must not import apps, integrations, or worlds.' },
  { group: ['three', 'three/*', '@mujoco/mujoco', '@mujoco/mujoco/*'], message: '3D libraries are out of scope for ui.' },
  { group: ['**/core/**', '@ghost-run/core/*'], message: 'Import @ghost-run/core through its public entry only.' },
  { group: ['@ghost-run/playground-shell', '@ghost-run/playground-shell/**', '@ghost-run/ghost-shell', '@ghost-run/ghost-shell/**', '**/worlds/playground-shell/**', '**/apps/ghost-shell/**'], message: 'ui must not import the playground packages.' },
];

// Declared once and spread into every block that sets no-restricted-syntax:
// a later block replaces rule options instead of merging them.
const SRC_SYNTAX_BAN = [
  { selector: "ImportDeclaration[source.value='@ghost-run/core'][importKind!='type']", message: 'Use import type for @ghost-run/core in ui/src.' },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned.' },
  { selector: "Property[key.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned (props objects and createElement).' },
  { selector: "JSXAttribute[name.name='tabIndex'][value.expression.value>0]", message: 'Positive tabIndex is banned.' },
  { selector: "JSXOpeningElement[name.name=/^(div|span|li|td|tr|p|section)$/] > JSXAttribute[name.name=/^on(Click|Key.*|Mouse.*)$/]", message: 'Put handlers on native buttons only.' },
  { selector: "JSXAttribute[name.name='style']", message: 'Inline style is banned; use classes.' },
  { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: 'Raw HTML assignment is banned.' },
  { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'insertAdjacentHTML is banned.' },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]", message: 'document.write is banned.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  { selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/][arguments.0.type=/^(Literal|TemplateLiteral)$/]", message: 'String timer arguments are banned.' },
  { selector: "NewExpression[callee.name='Date']", message: 'No clock in ui/src.' },
];

const SRC_GLOBALS = [
  'Date', 'process', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'crypto', 'performance', 'console',
].map((name) => ({ name, message: `${name} is not allowed in ui/src.` }));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'gallery/**/*.tsx'],
    extends: [tseslint.configs.base],
    plugins: { '@eslint-react': eslintReact, 'react-hooks': hooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      '@eslint-react/dom-no-dangerously-set-innerhtml': 'error',
      '@eslint-react/dom-no-dangerously-set-innerhtml-with-children': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', { patterns: FORBIDDEN_IMPORTS }],
      'no-restricted-syntax': ['error', ...SRC_SYNTAX_BAN],
      'no-restricted-globals': ['error', ...SRC_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'No random source in ui/src.' },
        { object: 'navigator', property: 'sendBeacon', message: 'No network calls in ui/src.' },
        { object: 'document', property: 'cookie', message: 'No cookies in ui/src.' },
      ],
    },
  },
  {
    // Tests keep the forbidden-imports rule but may import values from @ghost-run/core.
    files: ['tests/**/*.{ts,tsx}'],
    extends: [tseslint.configs.base],
    rules: { 'no-restricted-imports': ['error', { patterns: FORBIDDEN_IMPORTS }] },
  },
);

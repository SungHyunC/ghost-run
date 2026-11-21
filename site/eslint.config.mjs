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
    // src/live/ replaces the import ban by an allowlist of the design's dependency table.
    // It has no React import and no DOM-framework dependency; the syntax and network bans stay.
    files: ['src/live/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ghost-run/ui',
              allowImportNames: ['isHiddenDisplay', 'escapeForDisplay'],
              message: 'src/live/ may import only isHiddenDisplay and escapeForDisplay from @ghost-run/ui.',
            },
          ],
          patterns: [
            {
              // Everything under apps/ is banned except the modules the design table names.
              regex: String.raw`(^|/)apps/(?!(ghost-shell/(src/(pipeline/run-playground|scenarios/project|plan/plan-file|sql-worker/worker-runner)|plans/|wards\.yaml)|ghost-hand/(src/(pipeline/run|exec/|capabilities|plan/plan-file|worker/sim-worker)|plans/)))`,
              message: 'src/live/ may reach only the app modules named in the design dependency table.',
            },
            { group: ['**/core/**', '**/ui/**', '**/ghost-runner/**', '**/integrations/**'], message: 'Import packages through their public entry points.' },
            {
              group: ['react', 'react-dom', 'react-dom/*', 'react/*', '@fontsource/*', 'three', 'three/*'],
              message: 'src/live/ has no React, DOM-framework, or rendering import.',
            },
            {
              group: ['@ghost-run/core/*', '@ghost-run/wards-config/*', '@ghost-run/ui/*', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '@ghost-run/kiro-hook', '@ghost-run/mcp'],
              message: 'Not in the allowlist of the design dependency table.',
            },
          ],
        },
      ],
    },
  },
  {
    // src/showcase/ is the only folder besides src/live/ that imports the kit. It may import @ghost-run/ui
    // through its public entry (and its stylesheet) and @ghost-run/core as type-only imports. The syntax,
    // network, and storage bans of src/ stay.
    files: ['src/showcase/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@ghost-run/core', allowTypeImports: true, message: 'src/showcase/ may import @ghost-run/core as type-only imports.' }],
          patterns: [
            {
              group: ['@ghost-run/ui/*', '!@ghost-run/ui/styles.css'],
              message: 'src/showcase/ may import @ghost-run/ui through its public entry point and its styles.css only.',
            },
            {
              group: ['@ghost-run/core/*', '@ghost-run/wards-config', '@ghost-run/wards-config/*', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/*', '@ghost-run/kiro-hook', '@ghost-run/mcp'],
              message: 'Not allowed in src/showcase/.',
            },
            {
              // Relative paths only, so that the package name @ghost-run/ui is not caught.
              regex: String.raw`^\.{1,2}/(.*/)?(apps|worlds|core|ui)(/|$)`,
              message: 'src/showcase/ must not reach apps/, worlds/, core/, or ui/ by path.',
            },
            { group: ['three', 'three/*', '@mujoco/mujoco', 'sql.js'], message: 'Not allowed in the page runtime.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...SYNTAX_BAN, ...NETWORK_BAN, ...ENGINE_BAN],
    },
  },
  {
    // The record measure file may import the adapters (site/src/live), core, wards-config, the two
    // world packages, drawer-arm, and vitest (design dependency table). It may not import the apps
    // directly: the adapters hold those imports.
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
            { group: ['@ghost-run/core/*', '@ghost-run/wards-config/*'], message: 'Import packages only through their public entry points.' },
            { group: ['**/apps/**'], message: 'The record script reaches the apps only through the adapters in src/live/.' },
          ],
        },
      ],
    },
  },
);

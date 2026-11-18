import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

// Node built-in names, generated from the running Node release (not hand-maintained).
const BUILTIN_EXACT = [...new Set(builtinModules.map((m) => m.replace(/^node:/, '')))];
const BUILTIN_BASES = [...new Set(BUILTIN_EXACT.map((m) => m.split('/')[0]))];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Matches 'node:<anything>', a bare built-in name, and any subpath of a built-in name.
const BUILTIN_RE = `^(?:node:.*|(?:${BUILTIN_BASES.map(escape).join('|')})(?:\\/.*)?)$`;

const BUILTIN_MESSAGE = 'core must not import Node built-ins here.';
const WORKSPACE_PATTERNS = [
  { group: ['**/ui/**', '**/apps/**', '**/integrations/**'], message: 'core must not depend on other workspace folders.' },
  { group: ['**/ghost-runner/**', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/**'], message: 'core must not import ghost-runner.' },
];
const NODE_PREFIX_PATTERN = { group: ['node:*'], message: 'core/src must not import Node built-ins.' };
// Exact specifier match: './fs.js' is never matched.
const BUILTIN_PATHS = BUILTIN_EXACT.map((name) => ({ name, message: BUILTIN_MESSAGE }));

const importsRule = (withNodePrefix) => [
  'error',
  {
    patterns: withNodePrefix ? [NODE_PREFIX_PATTERN, ...WORKSPACE_PATTERNS] : WORKSPACE_PATTERNS,
    paths: BUILTIN_PATHS,
  },
];

// Declared once and spread into every block: a later block replaces rule options instead of merging them.
const SYNTAX_BAN = [
  { selector: `ImportExpression[source.value=/${BUILTIN_RE}/]`, message: 'Dynamic import of a Node built-in is banned.' },
  { selector: "ImportExpression:not([source.type='Literal'])", message: 'Dynamic import with a computed specifier is banned.' },
  { selector: `CallExpression[callee.name='require'][arguments.0.value=/${BUILTIN_RE}/]`, message: 'require of a Node built-in is banned.' },
  { selector: "CallExpression[callee.name='require']:not([arguments.0.type='Literal'])", message: 'require with a computed specifier is banned.' },
  { selector: `TSImportEqualsDeclaration[moduleReference.expression.value=/${BUILTIN_RE}/]`, message: 'import = require of a Node built-in is banned.' },
  { selector: `TSImportType[argument.literal.value=/${BUILTIN_RE}/]`, message: 'Type import of a Node built-in is banned.' },
];

const POSSESSION_SYNTAX_BAN = [
  ...SYNTAX_BAN,
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
  { selector: "ImportDeclaration[source.value!=/^\\.\\//][source.value!='../types.js']", message: 'Imports must start with ./ or be ../types.js.' },
  { selector: "ExportAllDeclaration[source.value!=/^\\.\\//][source.value!='../types.js']", message: 'Re-exports must start with ./ or be ../types.js.' },
  { selector: "ExportNamedDeclaration[source][source.value!=/^\\.\\//][source.value!='../types.js']", message: 'Re-exports must start with ./ or be ../types.js.' },
];

const POSSESSION_GLOBALS = [
  'process', 'Buffer', 'require', 'window', 'document', 'TextEncoder', 'TextDecoder', 'URL',
  'console', 'fetch', 'crypto', 'performance', 'setTimeout', 'setInterval', 'Date',
].map((name) => ({ name, message: `${name} is not allowed in the pure possession module.` }));

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': importsRule(true),
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
    },
  },
  {
    files: ['src/possession/**/*.ts'],
    rules: {
      'no-restricted-imports': importsRule(true),
      'no-restricted-syntax': ['error', ...POSSESSION_SYNTAX_BAN],
      'no-restricted-globals': ['error', ...POSSESSION_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Math.random is not allowed in the pure possession module.' },
      ],
    },
  },
  {
    files: ['possession-node.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': importsRule(false),
      'no-restricted-syntax': ['error', ...SYNTAX_BAN],
    },
  },
);

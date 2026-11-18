const PACKAGE_MESSAGE =
  'Import only the public entry points of other workspace packages.';

const restrictedImports = [
  'error',
  {
    patterns: [
      {
        group: [
          '@ghost-run/core/*',
          '!@ghost-run/core/possession-node',
          '@ghost-run/ghost-runner/*',
          '@ghost-run/wards-config/*',
          '!@ghost-run/wards-config/node',
          '@ghost-run/ui/*',
          '**/core/src/**',
          '**/core/dist/**',
          '**/ghost-runner/src/**',
          '**/ghost-runner/dist/**',
          '**/wards-config/src/**',
          '**/wards-config/dist/**',
          '**/ui/src/**',
        ],
        message: PACKAGE_MESSAGE,
      },
      {
        group: ['**/exp-b-gate', '**/exp-b-gate.mjs'],
        message: 'exp-b-gate.mjs is retired and must not be imported.',
      },
    ],
  },
];

export default [
  { ignores: ['node_modules/**', 'exp-b-gate.mjs', '**/*.ts'] },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-restricted-imports': restrictedImports,
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },
];

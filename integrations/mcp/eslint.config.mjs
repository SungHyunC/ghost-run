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
          '@ghost-run/kiro-hook/*',
          '**/kiro-hook/lib/**',
          '**/ui/src/**',
        ],
        message: PACKAGE_MESSAGE,
      },
    ],
  },
];

export default [
  { ignores: ['node_modules/**', '**/*.ts'] },
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

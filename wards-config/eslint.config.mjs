import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ghost-run/core/*', '**/core/**', '**/ghost-runner/**', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/**', '**/ui/**', '**/apps/**', '**/integrations/**'],
              message: 'wards-config may import @ghost-run/core only through its public entry point.',
            },
          ],
        },
      ],
    },
  },
);

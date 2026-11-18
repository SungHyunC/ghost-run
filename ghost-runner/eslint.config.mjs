import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', '**/apps/**', '**/integrations/**', '**/worlds/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: 'ghost-runner may depend on @ghost-run/core only.' },
            { group: ['**/core/**', '@ghost-run/core/*'], message: 'Import @ghost-run/core through its public entry only.' },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', '**/apps/**', '**/integrations/**', '**/worlds/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**'], message: 'ghost-runner may depend on @ghost-run/core only.' },
            { group: ['**/core/**', '@ghost-run/core/*', '!@ghost-run/core/verify'], message: 'Only @ghost-run/core and @ghost-run/core/verify are allowed.' },
          ],
        },
      ],
    },
  },
);

import tseslint from 'typescript-eslint';

const corePatterns = {
  group: ['@ghost-run/core/*', '**/core/**', '**/ghost-runner/**', '@ghost-run/ghost-runner', '@ghost-run/ghost-runner/**', '**/ui/**', '**/apps/**', '**/integrations/**', '@ghost-run/kiro-hook', '@ghost-run/kiro-hook/**', '@ghost-run/mcp', '@ghost-run/mcp/**', '@ghost-run/playground-shell', '@ghost-run/playground-shell/**', '@ghost-run/ghost-shell', '@ghost-run/ghost-shell/**', '**/worlds/playground-shell/**', '**/apps/ghost-shell/**'],
  message: 'wards-config may import @ghost-run/core only through its public entry point.',
};

const nodeBuiltins = [
  'fs', 'fs/promises', 'path', 'url', 'util', 'os', 'crypto', 'process', 'buffer', 'stream',
  'child_process', 'module', 'worker_threads', 'assert', 'events', 'zlib', 'http', 'https', 'net',
  'tls', 'readline', 'vm', 'v8', 'timers', 'string_decoder', 'perf_hooks', 'tty', 'dns', 'dgram', 'cluster',
];

export default tseslint.config(
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.base],
    rules: {
      'no-restricted-imports': ['error', { patterns: [corePatterns] }],
    },
  },
  {
    // Default-entry sources must stay browser-safe (decision D21).
    // The rule is repeated in full because a later block replaces the options.
    files: ['src/**/*.ts'],
    ignores: ['src/load.ts', 'src/node.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins.map((name) => ({
            name,
            message: 'Node built-ins are not allowed in the browser-safe default entry.',
          })),
          patterns: [
            corePatterns,
            { group: ['node:*'], message: 'Node built-ins are not allowed in the browser-safe default entry.' },
          ],
        },
      ],
    },
  },
);

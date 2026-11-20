import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ghost-run/core/verify': fileURLToPath(new URL('../../core/verify.ts', import.meta.url)),
      '@ghost-run/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ghost-run/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@ghost-run/wards-config/node': fileURLToPath(new URL('./src/node.ts', import.meta.url)),
      '@ghost-run/wards-config': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
  },
});

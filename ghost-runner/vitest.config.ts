import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ghost-run\/core\/verify$/, replacement: `${root}core/verify.ts` },
      { find: /^@ghost-run\/core$/, replacement: `${root}core/src/index.ts` },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});

import { defineConfig } from 'vitest/config';

// Used only by tests/browser/cross-env.mjs. The measurement file is not a *.test.ts file, so the normal
// `vitest run` never picks it up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/node-hash.measure.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});

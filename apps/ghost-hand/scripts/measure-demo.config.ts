import { defineConfig } from 'vitest/config';

// Used only by scripts/measure-demo.mjs. The measurement file is not a *.test.ts file, so the normal
// `vitest run` never picks it up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/measure-demo.measure.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});

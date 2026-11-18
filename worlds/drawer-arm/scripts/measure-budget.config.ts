import { defineConfig } from 'vitest/config';

// Used only by scripts/measure-budget.mjs. The measurement file is not a *.test.ts file, so the normal
// `vitest run` never picks it up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/measure-budget.measure.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});

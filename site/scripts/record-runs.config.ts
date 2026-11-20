import { defineConfig } from 'vitest/config';

// Used only by scripts/record-runs.mjs. The measure file is not a *.test.ts file, so the normal
// `vitest run` never picks it up (and the file skips itself unless GHOST_SITE_RUNS_OUT is set).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/record-runs.measure.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});

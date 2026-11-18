import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/support/jsdom-realm.ts'],
    typecheck: { enabled: true, include: ['tests/**/*.test-d.ts'] },
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});

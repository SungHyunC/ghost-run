import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'model', environment: 'node', include: ['tests/model/**/*.test.ts', 'tests/scan/**/*.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['tests/dom/**/*.test.tsx'] } },
    ],
  },
});

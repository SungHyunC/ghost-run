import { defineConfig } from 'vitest/config';

// The `dist` project checks the build output, so it only exists when `test:dist` (which builds first) sets GHOST_DIST_TESTS=1.
const distProjects =
  process.env.GHOST_DIST_TESTS === '1'
    ? [{ extends: true as const, test: { name: 'dist', environment: 'node' as const, include: ['tests/dist/**/*.test.ts'], exclude: ['**/node_modules/**'] } }]
    : [];

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'model', environment: 'node', include: ['tests/model/**/*.test.ts', 'tests/scan/**/*.test.ts'] } },
      { extends: true, test: { name: 'cli', environment: 'node', include: ['tests/cli/**/*.test.ts'], testTimeout: 180_000, hookTimeout: 300_000 } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['tests/dom/**/*.test.ts', 'tests/dom/**/*.test.tsx'] } },
      ...distProjects,
    ],
  },
});

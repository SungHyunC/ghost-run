import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('..', import.meta.url));

// Inline `projects` syntax of Vitest 3.2.7 (Open Question Q2): written per the design and not yet run.
// Task 1.3 verifies it after install. Fallback if it is rejected: per-file `@vitest-environment jsdom`
// docblocks and per-folder scripts.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^@ghost-run\/core$/, replacement: `${root}core/src/index.ts` }] },
  test: {
    typecheck: { enabled: true, include: ['tests/**/*.test-d.ts'] },
    projects: [
      { extends: true, test: { name: 'model', environment: 'node', include: ['tests/model/**/*.test.ts'] } },
      { extends: true, test: { name: 'static', environment: 'node', include: ['tests/static/**/*.test.tsx'] } },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/dom/**/*.test.tsx', 'tests/regressions.test.tsx'],
          setupFiles: ['tests/support/setup-dom.ts'],
        },
      },
      { extends: true, test: { name: 'scan', environment: 'node', include: ['tests/scan/**/*.test.ts'] } },
      { extends: true, test: { name: 'dist', environment: 'node', include: ['tests/dist/**/*.test.ts'] } },
    ],
  },
});

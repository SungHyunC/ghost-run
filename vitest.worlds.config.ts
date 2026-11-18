// Test config for the generated world contract tests (worlds/*/tests/contract.test.ts).
// Run from the repository root:
//   corepack pnpm --filter @ghost-run/kiro-hook exec vitest --run --config ../../vitest.worlds.config.ts
// The root has no node_modules of its own, so `fast-check` is resolved through the kiro-hook package.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const requireFromHook = createRequire(here('integrations/kiro-hook/package.json'));

export default defineConfig({
  root: here('.'),
  resolve: {
    alias: [
      { find: /^@ghost-run\/core\/verify$/, replacement: here('core/verify.ts') },
      { find: /^@ghost-run\/core$/, replacement: here('core/src/index.ts') },
      { find: /^@ghost-run\/wards-config\/node$/, replacement: here('wards-config/src/node.ts') },
      { find: /^@ghost-run\/wards-config$/, replacement: here('wards-config/src/index.ts') },
      { find: /^fast-check$/, replacement: requireFromHook.resolve('fast-check') },
    ],
  },
  test: {
    globals: true,
    include: ['worlds/*/tests/contract.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
  },
});

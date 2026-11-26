import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ghost-run/core/possession-node': src('../../core/possession-node.ts'),
      '@ghost-run/core': src('../../core/src/index.ts'),
      '@ghost-run/ghost-runner': src('../../ghost-runner/src/index.ts'),
      '@ghost-run/wards-config/node': src('../../wards-config/src/node.ts'),
      '@ghost-run/wards-config': src('../../wards-config/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.mjs'],
    globalSetup: ['tests/global-box-lock.mjs', 'tests/global-hygiene.mjs', 'tests/global-seance.mjs'],
    // Tests never auto-start a real seance viewer (it would outlive the run and hold port 5317).
    // tests/seance.test.mjs injects the probe and the spawn to cover the auto-start itself.
    env: { GHOST_RUN_SEANCE_AUTOSTART: '0' },
    testTimeout: 60_000,
    passWithNoTests: true,
  },
});

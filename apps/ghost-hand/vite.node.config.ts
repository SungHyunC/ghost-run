import { defineConfig } from 'vite';

// Node entry point (task 14.3): one ESM file at dist-node/cli.js. Workspace packages are bundled because they are
// exported as TypeScript source. @mujoco/mujoco stays external: it finds its wasm file next to its own module.
export default defineConfig({
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'dist-node',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: false,
    minify: false,
    rollupOptions: { output: { entryFileNames: 'cli.js', format: 'es', banner: '#!/usr/bin/env node' } },
  },
  ssr: { noExternal: [/^@ghost-run\//], external: ['@mujoco/mujoco'] },
});

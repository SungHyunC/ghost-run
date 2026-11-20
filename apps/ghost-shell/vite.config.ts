import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// The sql.js wasm file is imported with the ?url suffix in the worker entry, so Vite emits it
// as a same-origin asset. assetsInlineLimit 0 keeps it from being inlined as a data URL.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    // Two pages share one bundle: the English page (index.html) and the Korean page (ko.html).
    // The shared bundle keeps the name index-*.js that scripts/dist-url-allowlist.json expects.
    rollupOptions: {
      input: { index: resolve(here, 'index.html'), ko: resolve(here, 'ko.html') },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'main' ? 'assets/index-[hash].js' : 'assets/[name]-[hash].js'),
        chunkFileNames: (chunk) => (chunk.name === 'main' ? 'assets/index-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});

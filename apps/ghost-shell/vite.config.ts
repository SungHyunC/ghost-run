import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
  },
});

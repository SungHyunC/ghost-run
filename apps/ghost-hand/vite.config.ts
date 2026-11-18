import { defineConfig } from 'vite';

// Single-thread MuJoCo build only: no SharedArrayBuffer, no COOP or COEP header.
// The wasm file is imported with the ?url suffix in the engine loader, so Vite emits it
// as a same-origin asset (assetsInlineLimit 0 keeps it from being inlined).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});

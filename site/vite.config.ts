import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Same policy as the root _headers block, without frame-ancestors (a meta tag cannot set it).
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";

const csp = (): Plugin => ({
  name: 'ghost-run-site-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  build: {
    outDir: 'build/dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    cssCodeSplit: false,
  },
});

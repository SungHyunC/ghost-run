import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error TS7016: plain .mjs module shared with the headers builder, no declaration file
import { landingMetaPolicy } from './scripts/lib/csp.mjs';
// @ts-expect-error TS7016: plain .mjs module shared with the build script and the site check, no declaration file
import { bundledPackages } from './scripts/lib/bundled-packages.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = fileURLToPath(new URL('./build/bundled-packages.json', import.meta.url));

// Same policy as the root _headers block, without frame-ancestors (a meta tag cannot set it).
const CSP: string = landingMetaPolicy();

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
  // The page build writes the list of bundled third-party packages; the worker bundles add to it.
  plugins: [react(), csp(), bundledPackages({ root: REPO_ROOT, out: MANIFEST }) as Plugin],
  worker: { plugins: () => [bundledPackages({ root: REPO_ROOT }) as Plugin] },
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

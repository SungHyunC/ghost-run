// Checks the two-entry landing build: the Showcase page (kit/index.html) and the landing page share one
// output folder, load different entry scripts, and keep their CSS apart. Requirements 13.1, 16.1, 14.1.
// Runs the Vite build when site/build/dist/ is missing or older than its sources.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

type CspModule = { landingMetaPolicy: () => string };

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = path.join(siteRoot, 'build', 'dist');
const cspPath = '../../scripts/lib/csp.mjs';
const { landingMetaPolicy } = (await import(/* @vite-ignore */ cspPath)) as CspModule;

function newest(target: string): number {
  const st = statSync(target);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(target).reduce((max, n) => Math.max(max, newest(path.join(target, n))), st.mtimeMs);
}

function isStale(): boolean {
  const kit = path.join(dist, 'kit', 'index.html');
  if (!existsSync(kit) || !existsSync(path.join(dist, 'index.html'))) return true;
  const built = statSync(kit).mtimeMs;
  const sources = ['src', 'kit', 'index.html', 'vite.config.ts', 'public'].map((n) => path.join(siteRoot, n));
  return sources.some((s) => existsSync(s) && newest(s) > built);
}

const read = (...p: string[]): string => readFileSync(path.join(dist, ...p), 'utf8');
const refs = (html: string): string[] => [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');

beforeAll(() => {
  if (!isStale()) return;
  const vite = path.join(siteRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  // Vitest sets NODE_ENV=test; a build under it bundles React's development build and inflates the closure.
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: siteRoot, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
  if (r.status !== 0) throw new Error(`vite build failed:\n${r.stdout}\n${r.stderr}`);
}, 600_000);

describe('landing build with the Showcase entry', () => {
  it('emits both HTML files', () => {
    expect(existsSync(path.join(dist, 'index.html'))).toBe(true);
    expect(existsSync(path.join(dist, 'kit', 'index.html'))).toBe(true);
  });

  it('references assets of kit/index.html through ../assets/ and every one exists', () => {
    const kit = read('kit', 'index.html');
    const assetRefs = refs(kit).filter((r) => r.includes('assets/'));
    expect(assetRefs.length).toBeGreaterThan(0);
    for (const r of assetRefs) {
      expect(r.startsWith('../assets/'), r).toBe(true);
      expect(existsSync(path.resolve(dist, 'kit', r)), r).toBe(true);
    }
    expect(kit).toMatch(/<script[^>]*src="\.\.\/assets\/showcase-[\w-]+\.js"/);
  });

  it('carries the landing meta policy in both HTML files', () => {
    for (const f of [['index.html'], ['kit', 'index.html']]) {
      const m = read(...f).match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i);
      expect(m?.[1]?.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), f.join('/')).toBe(landingMetaPolicy());
    }
  });

  it('keeps the Showcase entry out of the landing page', () => {
    const html = read('index.html');
    expect(refs(html).some((r) => r.includes('showcase-'))).toBe(false);
  });

  it('keeps kit rules out of the landing CSS and landing rules out of the Showcase CSS', () => {
    const cssOf = (html: string): string[] => refs(html).filter((r) => r.endsWith('.css')).map((r) => path.resolve(dist, f(html, r)));
    // Relative references resolve against the folder of the page that holds them.
    function f(html: string, r: string): string {
      return html === read('index.html') ? r : path.join('kit', r);
    }
    const landingCss = cssOf(read('index.html')).map((p) => readFileSync(p, 'utf8')).join('\n');
    const kitCss = cssOf(read('kit', 'index.html')).map((p) => readFileSync(p, 'utf8')).join('\n');
    expect(landingCss.length).toBeGreaterThan(0);
    expect(kitCss).toContain('.gk-');
    expect(landingCss).not.toMatch(/\.gk-/);
    // Landing-only rules: the book, the page bar, the walkthrough theater.
    for (const sel of ['.pagebar', '.theater', '.pg-dot', '.recipe']) {
      expect(kitCss.includes(sel), sel).toBe(false);
    }
  });
});

describe('Showcase chunks (Property Pg6, chunk part)', () => {
  /** The entry script of kit/index.html and every chunk it imports statically, at any depth. */
  function closure(): string[] {
    const entry = refs(read('kit', 'index.html')).find((r) => /showcase-[\w-]+\.js$/.test(r));
    if (entry === undefined) throw new Error('no showcase entry script in kit/index.html');
    const seen = new Set<string>();
    const queue = [path.posix.normalize(path.posix.join('kit', entry))];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const js = read(...file.split('/'));
      for (const m of js.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
        queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1] ?? '')));
      }
    }
    return [...seen];
  }

  it('has no eval call, no Function constructor, and no engine, worker, or wasm reference', () => {
    const files = closure();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const js = read(...file.split('/'));
      expect(js, `${file} eval`).not.toMatch(/(?<![\w$.])eval\s*\(/);
      expect(js, `${file} Function`).not.toMatch(/(?<![\w$.])(?:new\s+)?Function\s*\(/);
      expect(js, `${file} engine`).not.toMatch(/(?:engine-light|engine-hand|hand-worker|sim-worker|worker-entry)-[\w-]+\.js/);
      expect(js, `${file} wasm`).not.toMatch(/\.wasm\b/);
      expect(js, `${file} Worker`).not.toMatch(/new\s+(?:Shared)?Worker\s*\(/);
    }
  });
});

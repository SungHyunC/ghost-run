// Checks the Landing_Page build output of `pnpm --filter @ghost-run/site build`: the engine chunks,
// the two workers, and the two wasm files exist, the entry names none of them statically, and every
// worker and wasm reference inside the engine chunks resolves to an existing file.
// Requirements 5.8, 6.1, 6.7, 15.2, 15.3, 15.4.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Requirement 15, criterion 4: the Entry_Bundle limit (the check script of task 12.2 holds the same number). */
const ENTRY_MAX_BYTES = 360_000;

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'build', 'dist');
const assets = path.join(dist, 'assets');
const hasBuild = existsSync(path.join(dist, 'index.html')) && existsSync(assets) && statSync(assets).isDirectory();

if (!hasBuild) {
  console.warn(`landing-build.test: skipped, ${dist} does not exist. Run "corepack pnpm --filter @ghost-run/site build" first.`);
}

const PATTERNS = {
  engineLight: /^engine-light-[\w-]+\.js$/,
  engineHand: /^engine-hand-[\w-]+\.js$/,
  handWorker: /^hand-worker-[\w-]+\.js$/,
  simWorker: /^sim-worker-[\w-]+\.js$/,
  workerEntry: /^worker-entry-[\w-]+\.js$/,
  mujoco: /^mujoco-[\w-]+\.wasm$/,
  sqlWasm: /^sql-wasm-[\w-]+\.wasm$/,
} as const;

const names = hasBuild ? readdirSync(assets) : [];
const find = (re: RegExp): string | undefined => names.find((n) => re.test(n));
const read = (name: string): string => readFileSync(path.join(assets, name), 'utf8');

describe.skipIf(!hasBuild)('landing build output', () => {
  it('holds the seven engine files', () => {
    for (const [key, re] of Object.entries(PATTERNS)) {
      expect(find(re), key).toBeDefined();
    }
  });

  it('is entered by one script that names no engine file, and the entry is small enough', () => {
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(scripts).toHaveLength(1);
    const entryName = path.basename(scripts[0] ?? '');
    for (const re of Object.values(PATTERNS)) {
      const file = find(re);
      expect(file !== undefined && html.includes(file)).toBe(false);
    }
    const entry = read(entryName);
    for (const re of Object.values(PATTERNS)) {
      const file = find(re);
      if (file === undefined) continue;
      // Only the dynamic form import("./engine-...") is allowed for the two engine chunks.
      const staticImport = new RegExp(`(?:from|import)\\s*["']\\./${file.replace(/[.]/g, '\\.')}["']`);
      expect(staticImport.test(entry), file).toBe(false);
    }
    expect(statSync(path.join(assets, entryName)).size).toBeLessThanOrEqual(ENTRY_MAX_BYTES);
  });

  it('keeps MuJoCo out of the page chunks: the Hand run lives in the worker, which the page policy does not cover', () => {
    const hand = read(find(PATTERNS.engineHand) as string);
    const worker = read(find(PATTERNS.handWorker) as string);
    // The page chunk only starts the worker and talks to it.
    expect(hand.length).toBeLessThan(10_000);
    expect(hand).not.toMatch(/mujoco|\.wasm/i);
    expect(hand).toContain(find(PATTERNS.handWorker) as string);
    // MuJoCo's glue builds functions from strings; it must not be in any chunk that runs under the page policy.
    const stringEval = /new Function\(|\bFunction\(/;
    expect(stringEval.test(worker)).toBe(true);
    for (const name of [find(PATTERNS.engineHand), find(PATTERNS.engineLight), names.find((n) => /^index-[\w-]+\.js$/.test(n))]) {
      expect(stringEval.test(read(name as string)), String(name)).toBe(false);
    }
    // The worker reaches the wasm and the simulation workers through its own URLs.
    expect(worker).toContain(find(PATTERNS.mujoco) as string);
    expect(worker).toContain(find(PATTERNS.simWorker) as string);
  });

  it('resolves every worker and wasm reference of the engine chunks to an existing file', () => {
    const light = find(PATTERNS.engineLight);
    const hand = find(PATTERNS.engineHand);
    const handWorker = find(PATTERNS.handWorker);
    const sim = find(PATTERNS.simWorker);
    const entry = find(PATTERNS.workerEntry);
    expect(light && hand && handWorker && sim && entry).toBeTruthy();
    let found = 0;
    for (const name of [light, hand, handWorker, sim, entry] as string[]) {
      const text = read(name);
      const refs = [...text.matchAll(/new URL\(\s*(?:""\+\s*new URL\()?\s*"([^"]+\.(?:js|wasm))"\s*,\s*(?:import\.meta\.url|self\.location\.href)/g)];
      for (const m of refs) {
        found += 1;
        expect(existsSync(path.join(assets, m[1] ?? '')), `${name} -> ${m[1]}`).toBe(true);
      }
    }
    // engine-light: worker-entry; engine-hand: hand-worker; hand-worker: sim-worker and mujoco; sim-worker: mujoco.
    expect(found).toBeGreaterThanOrEqual(5);
    expect(read(entry as string)).toContain(find(PATTERNS.sqlWasm) as string);
  });
});

// Task 8.4: build-level assertions for the paged landing page. The Showcase chunk checks (no eval, no
// Function constructor) are in landing-build-kit.test.ts (task 8.1, Property Pg6); this file does not repeat them.
// Requirements 10.7, 16.1.
describe.skipIf(!hasBuild)('landing closure and Showcase separation', () => {
  const html = (): string => readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refsOf = (h: string): string[] => [...h.matchAll(/\s(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1] ?? '');

  /** Entry script, modulepreload links, and every chunk they import statically, at any depth. */
  function staticClosure(): string[] {
    const queue = refsOf(html()).filter((r) => r.endsWith('.js'));
    const seen = new Set<string>();
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const js = readFileSync(path.join(dist, file), 'utf8');
      for (const m of js.matchAll(/(?:\bfrom\s*|(?<![\w$.])import\s*)["']\.\/([^"']+\.js)["']/g)) {
        queue.push(path.posix.join('assets', m[1] ?? ''));
      }
    }
    return [...seen];
  }

  it('keeps the entry closure of index.html within the Entry_Bundle limit', () => {
    const files = staticClosure();
    expect(files.length).toBeGreaterThan(1);
    const total = files.reduce((sum, f) => sum + statSync(path.join(dist, f)).size, 0);
    expect(total).toBeLessThanOrEqual(ENTRY_MAX_BYTES);
  });

  it('reaches no showcase- asset from index.html, by link, static import, dynamic import, or preload list', () => {
    const queue = refsOf(html());
    const seen = new Set<string>();
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      expect(file, 'reachable asset').not.toMatch(/showcase-/);
      if (!file.endsWith('.js')) continue;
      const js = readFileSync(path.join(dist, file), 'utf8');
      expect(js, `${file} names a showcase asset`).not.toMatch(/showcase-[\w-]+\.(?:js|css)/);
      for (const m of js.matchAll(/["']\.\/([\w.-]+\.(?:js|css))["']/g)) queue.push(path.posix.join('assets', m[1] ?? ''));
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('links no kit stylesheet from index.html', () => {
    const cssFiles = refsOf(html()).filter((r) => r.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);
    for (const f of cssFiles) {
      const css = readFileSync(path.join(dist, f), 'utf8');
      expect(css, f).not.toMatch(/\.gk-/);
      expect(css, f).not.toMatch(/\.(?:kcard|khero|kpart|kindex|frame-body)\b/);
    }
  });
});


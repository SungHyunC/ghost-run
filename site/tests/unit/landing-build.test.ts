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

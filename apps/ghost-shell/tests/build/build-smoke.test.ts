// Runs the real Vite build once and checks the facts task 3.3 verifies (wasm asset, worker chunk,
// no node: specifier, yaml parser in the browser bundle).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Each test file builds into its own temporary folder. Vitest runs files in parallel, and a shared
// apps/ghost-shell/dist was emptied by one build while the other file read it.
const dist = mkdtempSync(join(tmpdir(), 'ghost-shell-dist-'));
const assets = join(dist, 'assets');

let jsFiles: { name: string; text: string }[] = [];
let wasmFiles: string[] = [];

beforeAll(() => {
  execFileSync(join(appRoot, 'node_modules', '.bin', 'vite'), ['build', '--outDir', dist, '--emptyOutDir'], { cwd: appRoot, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } });
  const names = readdirSync(assets);
  jsFiles = names.filter((n) => n.endsWith('.js')).map((name) => ({ name, text: readFileSync(join(assets, name), 'utf8') }));
  wasmFiles = names.filter((n) => n.endsWith('.wasm'));
}, 120_000);

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('ghost-shell vite build', () => {
  it('emits a same-origin sql.js wasm file referenced from a JS file', () => {
    expect(wasmFiles).toHaveLength(1);
    const wasm = wasmFiles[0] as string;
    expect(statSync(join(assets, wasm)).size).toBeGreaterThan(0);
    expect(jsFiles.some((f) => f.text.includes(wasm))).toBe(true);
  });

  it('emits a worker chunk that references the wasm file', () => {
    const wasm = wasmFiles[0] as string;
    const worker = jsFiles.filter((f) => /worker/i.test(f.name));
    expect(worker.length).toBeGreaterThan(0);
    expect(worker.some((f) => f.text.includes(wasm))).toBe(true);
    expect(jsFiles.some((f) => f.text.includes('worker-entry') || /new Worker\(/.test(f.text))).toBe(true);
  });

  it('contains no node: specifier in any JS file', () => {
    for (const f of jsFiles) expect(f.text, f.name).not.toMatch(/["']node:/);
  });

  it('bundles the yaml parser and the wards-config parseWards path', () => {
    const main = jsFiles.filter((f) => !/worker/i.test(f.name));
    expect(main.some((f) => f.text.includes('Unresolved alias') || f.text.includes('YAMLParseError'))).toBe(true);
    expect(main.some((f) => f.text.includes('protect-data'))).toBe(true);
  });

  it('copies _headers with the CSP', () => {
    const headers = join(dist, '_headers');
    expect(existsSync(headers)).toBe(true);
    const text = readFileSync(headers, 'utf8');
    expect(text).toContain("default-src 'none'");
    expect(text).toContain("connect-src 'self'");
  });
});

// Builds once and checks the final static output: headers, same-origin wasm and worker, the bundled
// wards text, and the dist URL check script.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(appRoot, 'dist');
const assets = join(dist, 'assets');

let jsFiles: { name: string; text: string }[] = [];
let wasmFiles: string[] = [];

beforeAll(() => {
  execFileSync(join(appRoot, 'node_modules', '.bin', 'vite'), ['build'], {
    cwd: appRoot,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const names = readdirSync(assets);
  jsFiles = names.filter((n) => n.endsWith('.js')).map((name) => ({ name, text: readFileSync(join(assets, name), 'utf8') }));
  wasmFiles = names.filter((n) => n.endsWith('.wasm'));
}, 120_000);

describe('ghost-shell dist', () => {
  it('has _headers with the CSP and without COOP or COEP', () => {
    const path = join(dist, '_headers');
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain("connect-src 'self'");
    expect(text).toContain("default-src 'none'");
    expect(text).not.toMatch(/Cross-Origin-(Opener|Embedder)-Policy/i);
  });

  it('holds a worker chunk and a .wasm file', () => {
    expect(wasmFiles).toHaveLength(1);
    expect(jsFiles.some((f) => /worker/i.test(f.name))).toBe(true);
  });

  it('passes scripts/check-dist.mjs', () => {
    const result = spawnSync(process.execPath, [join(appRoot, 'scripts', 'check-dist.mjs')], { cwd: appRoot, encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('bundles the wards.yaml text unchanged', () => {
    const source = readFileSync(join(appRoot, 'wards.yaml'), 'utf8');
    const escaped = JSON.stringify(source).slice(1, -1);
    const found = jsFiles.some(
      (f) => f.text.includes(escaped) || f.text.includes(source) || f.text.includes(escaped.replace(/\\"/g, '"')),
    );
    expect(found).toBe(true);
  });

  it('has no node: specifier and no reference to another origin', () => {
    for (const f of jsFiles) {
      expect(f.text, f.name).not.toMatch(/["'`]node:/);
      expect(f.text, f.name).not.toMatch(/(?:from|import)\s*\(?\s*["']https?:/);
    }
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
  });
});

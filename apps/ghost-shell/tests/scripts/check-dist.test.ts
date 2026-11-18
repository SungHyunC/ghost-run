import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(APP_ROOT, 'scripts', 'check-dist.mjs');

// Built from char codes so no source file holds a literal comment opener.
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const tag = (inner: string): string => `${LT}${inner}${GT}`;

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function makeDist(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'check-dist-'));
  tempDirs.push(root);
  const files: Record<string, string | null> = {
    'index.html': `${tag('html')}${tag('head')}${tag('script type="module" src="./assets/app.js"')}${tag('/script')}${tag('link rel="stylesheet" href="./assets/app.css"')}${tag('img src="data:image/png;base64,AAAA"')}${tag('/head')}${tag('/html')}`,
    'assets/app.js':
      'const ns="http://www.w3.org/2000/svg";const u="https://host.example/path";' +
      'const w=new Worker(new URL("./worker.js",import.meta.url),{type:"module"});' +
      'fetch("./assets/engine.wasm");',
    'assets/worker.js': 'self.onmessage=()=>{};',
    'assets/app.css': '@import "./base.css";body{background:url(data:image/png;base64,AAAA)}',
    'assets/engine.wasm': 'wasm',
    _headers: "/*\n  Content-Security-Policy: default-src 'none'\n",
  };
  for (const [name, content] of Object.entries({ ...files, ...overrides })) {
    if (content === null) continue;
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

function run(dist: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, dist], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('check-dist', () => {
  it('passes a tree with relative references and allowlisted strings', () => {
    const r = run(makeDist());
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('host.example');
    expect(r.stdout).toContain('http://www.w3.org/2000/svg');
  });

  it('fails on a CDN script and names the file', () => {
    const html = tag('script src="https://cdn.example.net/lib.js"') + tag('/script');
    const r = run(makeDist({ 'index.html': html }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('index.html');
  });

  it('fails on a protocol-relative script in HTML', () => {
    const html = tag('script src="//cdn.example/lib.js"') + tag('/script');
    const r = run(makeDist({ 'index.html': html }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('index.html');
  });

  it('fails on a CSS @import with a scheme, even for a reserved host', () => {
    const r = run(makeDist({ 'assets/app.css': '@import "https://styles.example/a.css";' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.css');
  });

  it('fails on a Google Fonts url() in CSS', () => {
    const css = '@font-face{src:url(https://fonts.gstatic.com/s/x.woff2)}';
    const r = run(makeDist({ 'assets/app.css': css }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.css');
  });

  it('fails on a protocol-relative url() in CSS', () => {
    const r = run(makeDist({ 'assets/app.css': 'a{background:url(//cdn.example/x.png)}' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.css');
  });

  it('fails on a fetch string with a host that is not allowlisted', () => {
    const r = run(makeDist({ 'assets/app.js': 'fetch("https://api.vendor.com/x");fetch("./assets/engine.wasm");' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.js');
    expect(r.stderr).toContain('api.vendor.com');
  });

  it('fails on a node: import', () => {
    const r = run(makeDist({ 'assets/app.js': 'import fs from "node:fs";fetch("./assets/engine.wasm");' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.js');
  });

  it('fails on a worker URL that is not relative', () => {
    const js = 'new Worker(new URL("https://host.example/w.js",import.meta.url));fetch("./assets/engine.wasm");';
    const r = run(makeDist({ 'assets/app.js': js }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('assets/app.js');
  });

  it('fails when the .wasm file is missing', () => {
    const r = run(makeDist({ 'assets/engine.wasm': null }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('.wasm');
  });

  it('fails when the .wasm name is not referenced from a JS file', () => {
    const r = run(makeDist({ 'assets/app.js': 'const a=1;' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('engine.wasm');
  });

  it('fails when _headers is missing', () => {
    const r = run(makeDist({ _headers: null }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('_headers');
  });
});

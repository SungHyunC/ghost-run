import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Result = { exitCode: number; lines: string[]; errors: string[] };
type Deps = {
  worldSize: (root: string) => unknown;
  buildLanding: (root: string) => unknown;
  record: (root: string) => unknown;
  cpSync: typeof cpSync;
};
type BuildModule = {
  buildSite: (o: { root: string; flags?: { landingOnly?: boolean; record?: boolean }; deps?: Partial<Deps> }) => Promise<Result>;
};

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const modulePath = '../../scripts/build-site.mjs';
const { buildSite } = (await import(/* @vite-ignore */ modulePath)) as BuildModule;

const SHELL_HEADERS = "/*\n  Content-Security-Policy: default-src 'none'; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n";

let root: string;
const calls: string[] = [];

function put(rel: string, content: string | Buffer): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function makeFixture(): void {
  put('site/build/dist/index.html', '<html>landing</html>');
  put('site/build/dist/kit/index.html', '<html>showcase</html>');
  put('site/build/dist/favicon.svg', '<svg/>');
  put('site/build/dist/favicon.ico', Buffer.from([0, 0, 1, 0]));
  put('site/build/dist/assets/app.js', 'landing js');
  put('site/build/dist/.DS_Store', 'junk');
  put('apps/ghost-shell/dist/index.html', '<html>shell</html>');
  put('apps/ghost-shell/dist/ko.html', '<html>ko</html>');
  put('apps/ghost-shell/dist/_headers', SHELL_HEADERS);
  put('apps/ghost-hand/dist/index.html', '<html base="./">hand</html>');
  put('apps/ghost-hand/dist/assets/mujoco.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 255]));
  put('apps/ghost-hand/dist/assets/worker.js', 'worker');
  put('apps/ghost-hand/dist/THIRD_PARTY_NOTICES.txt', 'notice text\r\n\u00e9 kept as is\n');
  // The landing build lists the packages it bundled; the notices come from the installed copies.
  put(
    'site/build/bundled-packages.json',
    JSON.stringify({
      format: 'ghost-site-bundled-packages',
      version: 1,
      packages: [{ name: 'pkg-a', version: '1.2.3', license: 'MIT', dir: 'node_modules/pkg-a' }],
    }),
  );
  put('node_modules/pkg-a/package.json', '{"name":"pkg-a","version":"1.2.3","license":"MIT"}');
  put('node_modules/pkg-a/LICENSE', 'MIT License text of pkg-a\n');
  put(
    'apps/ghost-hand/notices/sources.json',
    JSON.stringify({
      components: [
        { id: 'mujoco', name: 'MuJoCo', version: '4.0.1', spdx: 'Apache-2.0', bundledIn: 'mujoco.wasm', file: 'mujoco.LICENSE.txt', upstream: 'https://upstream.example/mujoco' },
        { id: 'react', name: 'react', version: '19.0.0', spdx: 'MIT', bundledIn: 'JavaScript bundle', file: 'react.LICENSE.txt', upstream: 'https://upstream.example/react' },
      ],
    }),
  );
  put('apps/ghost-hand/notices/mujoco.LICENSE.txt', 'Apache text of MuJoCo\n');
  put('apps/ghost-hand/notices/react.LICENSE.txt', 'React text, not used by the site notice\n');
  put('ui/dist/index.html', '<html>kit</html>');
  put('ui/dist/assets/kit.css', 'css');
}

const deps: Partial<Deps> = {
  worldSize: () => calls.push('worldSize'),
  buildLanding: () => calls.push('buildLanding'),
  record: () => calls.push('record'),
};

function listAll(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listAll(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out.sort();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ghost-build-site-'));
  calls.length = 0;
  makeFixture();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('buildSite', () => {
  it('honors the copy table and writes exactly one _headers', async () => {
    const r = await buildSite({ root, deps });
    expect(r.errors).toEqual([]);
    expect(r.exitCode).toBe(0);
    const dist = join(root, 'site', 'dist');
    for (const p of ['index.html', 'favicon.svg', 'favicon.ico', 'assets/app.js', 'shell/index.html', 'shell/ko.html', 'hand/index.html', 'hand/assets/mujoco.wasm', 'kit/index.html', 'kit/gallery/index.html', '_headers']) {
      expect(existsSync(join(dist, p)), p).toBe(true);
    }
    expect(existsSync(join(dist, 'shell', '_headers'))).toBe(false);
    expect(listAll(dist).filter((f) => f.endsWith('_headers'))).toEqual(['_headers']);
    expect(listAll(dist).some((f) => f.endsWith('.DS_Store'))).toBe(false);
    const headers = readFileSync(join(dist, '_headers'), 'utf8');
    expect(headers).toContain('/shell/*');
    expect(headers).not.toMatch(/^\/hand\/$/m);
    for (const block of ['/hand/*']) {
      const text = `${block}\n  Content-Security-Policy: `;
      expect(headers, block).toContain(text);
      const rest = headers.slice(headers.indexOf(text) + text.length).split('\n');
      expect(rest[0], block).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
      expect(rest.slice(1, 3), block).toEqual(['  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer']);
    }
    expect(headers).not.toMatch(/^\/(\*|kit\/\*|kit\/gallery\/\*)$/m);
    for (const block of ['/kit/', '/kit/index.html']) expect(headers, block).toMatch(new RegExp(`^${block.replace(/[./]/g, '\\$&')}$`, 'm'));
    expect(readFileSync(join(dist, 'kit/index.html'), 'utf8')).toBe('<html>showcase</html>');
    expect(r.lines.join('\n')).toMatch(/\/kit\/gallery\/ 2 files/);
    expect(r.lines.join('\n')).toMatch(/\/shell\/ 2 files/);
    expect(r.lines).toHaveLength(6);
  });

  it('copies app files byte-equal, with no base rewrite', async () => {
    await buildSite({ root, deps });
    const dist = join(root, 'site', 'dist');
    expect(readFileSync(join(dist, 'hand/assets/mujoco.wasm')).equals(readFileSync(join(root, 'apps/ghost-hand/dist/assets/mujoco.wasm')))).toBe(true);
    expect(readFileSync(join(dist, 'hand/index.html'), 'utf8')).toBe('<html base="./">hand</html>');
    expect(readFileSync(join(dist, 'shell/ko.html'), 'utf8')).toBe('<html>ko</html>');
    expect(readFileSync(join(dist, 'kit/gallery/assets/kit.css'), 'utf8')).toBe('css');
    expect(existsSync(join(dist, 'kit/assets'))).toBe(false);
    const galleryFiles = listAll(join(root, 'ui/dist'));
    for (const f of galleryFiles) expect(readFileSync(join(dist, 'kit/gallery', f)).equals(readFileSync(join(root, 'ui/dist', f))), f).toBe(true);
    expect(listAll(join(dist, 'kit/gallery'))).toEqual(galleryFiles);
  });

  it('writes the site notice from the bundled packages, keeps the MuJoCo components, and keeps the app copy', async () => {
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(0);
    const notice = readFileSync(join(root, 'site/dist/THIRD_PARTY_NOTICES.txt'), 'utf8');
    expect(notice).toMatch(/^pkg-a 1\.2\.3$/m);
    expect(notice).toContain('License: MIT');
    expect(notice).toContain('MIT License text of pkg-a');
    expect(notice).toMatch(/^MuJoCo 4\.0\.1$/m);
    expect(notice).toContain('Apache text of MuJoCo');
    // The JavaScript packages of the Ghost Hand notice come from the installed packages, not from that file.
    expect(notice).not.toContain('React text, not used by the site notice');
    const appCopy = readFileSync(join(root, 'apps/ghost-hand/dist/THIRD_PARTY_NOTICES.txt'));
    expect(readFileSync(join(root, 'site/dist/hand/THIRD_PARTY_NOTICES.txt')).equals(appCopy)).toBe(true);
  });

  it('fails when the list of bundled packages is missing', async () => {
    rmSync(join(root, 'site/build/bundled-packages.json'));
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain('missing build output: site/build/bundled-packages.json');
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('fails when a bundled package has no license text', async () => {
    rmSync(join(root, 'node_modules/pkg-a/LICENSE'));
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain('no license text for pkg-a 1.2.3');
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('does not follow symlinks', async () => {
    put('outside/secret.txt', 'x');
    symlinkSync(join(root, 'outside'), join(root, 'ui/dist/link'));
    await buildSite({ root, deps });
    expect(lstatSync(join(root, 'site/dist/kit/gallery/link')).isSymbolicLink()).toBe(true);
  });

  it('replaces a previous site/dist/', async () => {
    put('site/dist/stale.txt', 'old');
    await buildSite({ root, deps });
    expect(existsSync(join(root, 'site/dist/stale.txt'))).toBe(false);
  });

  it('stops after the landing build with --landing-only', async () => {
    const r = await buildSite({ root, flags: { landingOnly: true }, deps });
    expect(r.exitCode).toBe(0);
    expect(calls).toEqual(['worldSize', 'buildLanding']);
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('records and rebuilds with --record', async () => {
    await buildSite({ root, flags: { record: true }, deps });
    expect(calls).toEqual(['worldSize', 'buildLanding', 'record', 'buildLanding']);
  });

  it('reports step failures with their messages', async () => {
    const a = await buildSite({ root, deps: { ...deps, worldSize: () => { throw new Error('boom'); } } });
    expect(a.errors).toEqual(['world-size failed: boom']);
    const b = await buildSite({ root, flags: { record: true }, deps: { ...deps, record: () => { throw new Error('bad'); } } });
    expect(b.errors).toEqual(['record-runs failed: bad']);
    expect(b.exitCode).toBe(1);
  });

  it.each([
    ['apps/ghost-shell/dist', '@ghost-run/ghost-shell'],
    ['apps/ghost-hand/dist', '@ghost-run/ghost-hand'],
    ['ui/dist', '@ghost-run/ui'],
    ['site/build/dist', '@ghost-run/site'],
  ])('fails on a missing source %s', async (dir, pkg) => {
    rmSync(join(root, dir), { recursive: true });
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toBe(`missing build output: ${dir} (build it with: corepack pnpm --filter ${pkg} build)`);
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('fails naming kit/index.html when the landing build has no Showcase', async () => {
    rmSync(join(root, 'site/build/dist/kit/index.html'));
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toBe('missing build output: site/build/dist/kit/index.html (build it with: corepack pnpm --filter @ghost-run/site build)');
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('fails on an empty source and leaves a previous site/dist/ untouched', async () => {
    put('site/dist/keep.txt', 'keep');
    rmSync(join(root, 'ui/dist'), { recursive: true });
    mkdirSync(join(root, 'ui/dist'));
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain('ui/dist');
    expect(readFileSync(join(root, 'site/dist/keep.txt'), 'utf8')).toBe('keep');
  });

  it.each([
    ['apps/ghost-shell/dist/ko.html'],
    ['apps/ghost-shell/dist/_headers'],
    ['apps/ghost-hand/dist/index.html'],
    ['apps/ghost-hand/dist/assets/mujoco.wasm'],
  ])('fails when %s is missing', async (file) => {
    rmSync(join(root, file));
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toMatch(/^missing build output: .*\(build it with: corepack pnpm --filter @ghost-run\/ghost-(shell|hand) build\)$/);
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('fails with "cannot read headers" when the shell headers hold no block', async () => {
    put('apps/ghost-shell/dist/_headers', '\n');
    const r = await buildSite({ root, deps });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain('cannot read headers: apps/ghost-shell/dist/_headers');
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });

  it('removes site/dist/ when a copy fails', async () => {
    let n = 0;
    const failing = ((src: string, dest: string, opts: Parameters<typeof cpSync>[2]) => {
      n += 1;
      if (n === 3) throw new Error('disk full');
      cpSync(src, dest, opts);
    }) as typeof cpSync;
    const r = await buildSite({ root, deps: { ...deps, cpSync: failing } });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toMatch(/^copy failed: apps\/ghost-hand\/dist/);
    expect(existsSync(join(root, 'site/dist'))).toBe(false);
  });
});

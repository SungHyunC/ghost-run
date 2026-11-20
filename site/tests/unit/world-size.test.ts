import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..', '..');
const REPO = resolve(SITE, '..');
const SCRIPT = join(SITE, 'scripts', 'world-size.mjs');

interface Mod {
  countWorldSizes(root: string): Record<string, number>;
  renderWorldSizeFile(root: string): string;
}
const loadModule = async (): Promise<Mod> => (await import(pathToFileURL(SCRIPT).href)) as Mod;

let fixture = '';

function put(rel: string, text: string): void {
  const full = join(fixture, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'world-size-'));
  // ghost-cloud: 3 + 2 (nested) = 5 counted lines
  put('worlds/ghost-cloud/src/a.ts', 'const a = 1;\n\n   \n\t\nconst b = 2;\r\n// comment\n');
  put('worlds/ghost-cloud/src/deep/er/b.ts', 'x\n\ny');
  put('worlds/ghost-cloud/src/a.test.ts', 'test\ntest\ntest\n');
  put('worlds/ghost-cloud/src/types.d.ts', 'declare const z: 1;\n');
  put('worlds/ghost-cloud/src/readme.md', 'not\ncounted\n');
  put('worlds/ghost-cloud/src/data.json', '{}\n');
  put('worlds/ghost-cloud/other/c.ts', 'outside src\n');
  // playground-shell: 1
  put('worlds/playground-shell/src/index.ts', '\n\nexport {};\n\n');
  // drawer-arm: 0
  put('worlds/drawer-arm/src/empty.ts', '\n  \n');
});

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('world-size script', () => {
  it('counts exactly the non-blank lines of non-test, non-declaration .ts files below src', async () => {
    const { countWorldSizes } = await loadModule();
    expect(countWorldSizes(fixture)).toEqual({ 'drawer-arm': 0, 'ghost-cloud': 5, 'playground-shell': 1 });
  });

  it('renders sorted keys, two-space indent, and one trailing newline', async () => {
    const { renderWorldSizeFile } = await loadModule();
    expect(renderWorldSizeFile(fixture)).toBe(
      '{\n  "format": "ghost-site-world-size",\n  "version": 1,\n  "worlds": {\n    "drawer-arm": 0,\n    "ghost-cloud": 5,\n    "playground-shell": 1\n  }\n}\n',
    );
  });

  it('--check exits 0 when the committed file is current and 2 without a mode flag', () => {
    expect(spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2);
  });

  it('--check exits 1 on a stale or missing file and 0 after --write (copied script on the fixture)', () => {
    const copy = join(fixture, 'site', 'scripts', 'world-size.mjs');
    mkdirSync(dirname(copy), { recursive: true });
    mkdirSync(join(fixture, 'site', 'src', 'data'), { recursive: true });
    writeFileSync(copy, readFileSync(SCRIPT));
    const run = (flag: string) => spawnSync(process.execPath, [copy, flag], { encoding: 'utf8' }).status;
    expect(run('--check')).toBe(1);
    expect(run('--write')).toBe(0);
    expect(run('--check')).toBe(0);
    writeFileSync(join(fixture, 'site', 'src', 'data', 'world-size.json'), '{}\n');
    expect(run('--check')).toBe(1);
  });

  it('the committed world-size.json equals a fresh run on the repository', async () => {
    const { renderWorldSizeFile } = await loadModule();
    const committed = readFileSync(join(SITE, 'src', 'data', 'world-size.json'), 'utf8');
    expect(committed).toBe(renderWorldSizeFile(REPO));
  });
});

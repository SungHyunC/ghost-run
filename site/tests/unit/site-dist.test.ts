import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Finding = { file: string; reference: string; rule: string };
type Reference = { value: string; source: string };

// Loaded by variable path so that the plain .mjs scripts need no type declaration files.
const checkPath = '../../scripts/check-site.mjs';
const refsPath = '../../scripts/lib/refs.mjs';
const { checkSite, formatFindings, findEngineReferences } = (await import(/* @vite-ignore */ checkPath)) as {
  checkSite: (distRoot: string, options?: { bundledPackages?: string }) => Finding[];
  findEngineReferences: (distRoot: string) => Record<'handWasm' | 'shellWasm' | 'handWorker' | 'shellWorker', Array<{ file: string; value: string; exists: boolean }>>;
  formatFindings: (findings: Finding[]) => string;
};
const { extractRefs } = (await import(/* @vite-ignore */ refsPath)) as {
  extractRefs: (filePath: string, text: string) => Reference[];
};

const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'build', 'bundled-packages.json');
const hasDist = existsSync(distRoot) && statSync(distRoot).isDirectory();

if (!hasDist) {
  console.warn(`site-dist.test: skipped, ${distRoot} does not exist. Run "pnpm build:site" first.`);
}

function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

describe.skipIf(!hasDist)('real site/dist', () => {
  it('has no finding', () => {
    const findings = checkSite(distRoot, { bundledPackages: manifestPath });
    expect(formatFindings(findings)).toBe('');
  });

  it('extracts references from every kind of file and from the Ghost Hand bundle (wasm and worker)', () => {
    const files = walk(distRoot);
    const refsOf = (file: string) => extractRefs(file, readFileSync(path.join(distRoot, file), 'utf8'));

    const all = files.flatMap((file) => refsOf(file).map((ref) => ({ file, ...ref })));
    expect(all.some((ref) => ref.file.endsWith('.html'))).toBe(true);
    expect(all.some((ref) => ref.file.endsWith('.css'))).toBe(true);
    expect(all.some((ref) => ref.file.endsWith('.js'))).toBe(true);

    const hand = all.filter((ref) => ref.file.startsWith('hand/assets/') && ref.file.endsWith('.js'));
    const wasm = hand.filter((ref) => /\.wasm$/i.test(ref.value));
    const worker = hand.filter((ref) => /worker[^/]*\.js$/i.test(ref.value));
    expect(wasm.length).toBeGreaterThan(0);
    expect(worker.length).toBeGreaterThan(0);

    // Each of those references names a file that is in the dist.
    const fileSet = new Set(files);
    for (const ref of [...wasm, ...worker]) {
      const target = path.posix.join(path.posix.dirname(ref.file), ref.value);
      expect(fileSet.has(target), `${ref.file} -> ${ref.value}`).toBe(true);
    }
  });

  it('finds the wasm and worker references of both engines, and each target exists', () => {
    const found = findEngineReferences(distRoot);
    for (const [name, refs] of Object.entries(found)) {
      expect(refs.length, name).toBeGreaterThan(0);
      for (const ref of refs) expect(ref.exists, `${ref.file} -> ${ref.value}`).toBe(true);
    }
    // The whole Hand run lives in the worker: it holds the wasm and starts the simulation workers.
    expect(found.handWasm.some((r) => /^assets\/hand-worker-/.test(r.file))).toBe(true);
    expect(found.handWorker.some((r) => /^assets\/engine-hand-/.test(r.file) && /hand-worker-/.test(r.value))).toBe(true);
    expect(found.handWorker.some((r) => /^assets\/hand-worker-/.test(r.file) && /sim-worker-/.test(r.value))).toBe(true);
    expect(found.shellWasm.some((r) => /^assets\/worker-entry-/.test(r.file))).toBe(true);
  });

  it('ships the site notice at the root with a section for every bundled package, and links it from the footer', () => {
    const notice = path.join(distRoot, 'THIRD_PARTY_NOTICES.txt');
    expect(existsSync(notice)).toBe(true);
    const text = readFileSync(notice, 'utf8');
    const packages = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { packages: { name: string; version: string }[] }).packages;
    const names = packages.map((p) => p.name);
    // The engines and the page bundle these; the Ghost Hand notice never covered the first two.
    for (const name of ['sql.js', 'yaml', 'react', 'react-dom', '@mujoco/mujoco', '@fontsource/fredoka']) expect(names, name).toContain(name);
    const lines = text.split('\n');
    for (const p of packages) expect(lines, `${p.name} ${p.version}`).toContain(`${p.name} ${p.version}`);
    expect(text).toContain('Qhull');
    expect(readFileSync(notice).equals(readFileSync(path.join(distRoot, 'hand', 'THIRD_PARTY_NOTICES.txt')))).toBe(false);
    const entry = walk(distRoot).find((f) => /^assets\/index-[^/]+\.js$/.test(f));
    expect(readFileSync(path.join(distRoot, entry ?? ''), 'utf8')).toContain('./THIRD_PARTY_NOTICES.txt');
  });
});

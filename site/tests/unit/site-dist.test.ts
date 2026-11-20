import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Finding = { file: string; reference: string; rule: string };
type Reference = { value: string; source: string };

// Loaded by variable path so that the plain .mjs scripts need no type declaration files.
const checkPath = '../../scripts/check-site.mjs';
const refsPath = '../../scripts/lib/refs.mjs';
const { checkSite, formatFindings } = (await import(/* @vite-ignore */ checkPath)) as {
  checkSite: (distRoot: string) => Finding[];
  formatFindings: (findings: Finding[]) => string;
};
const { extractRefs } = (await import(/* @vite-ignore */ refsPath)) as {
  extractRefs: (filePath: string, text: string) => Reference[];
};

const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
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
    const findings = checkSite(distRoot);
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
});

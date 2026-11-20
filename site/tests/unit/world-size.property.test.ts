import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundLines } from '../../src/engine/format';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..', '..');
const REPO = resolve(SITE, '..');
const SCRIPT = join(SITE, 'scripts', 'world-size.mjs');

interface Mod {
  countWorldSizes(root: string): Record<string, number>;
  renderWorldSizeFile(root: string): string;
}
const loadModule = async (): Promise<Mod> => (await import(pathToFileURL(SCRIPT).href)) as Mod;

const WORLDS = ['ghost-cloud', 'playground-shell', 'drawer-arm'] as const;
const EXTENSIONS = ['.ts', '.test.ts', '.d.ts', '.md', '.json', '.tsx', '.js'] as const;

type Line = { kind: 'empty' } | { kind: 'space'; text: string } | { kind: 'text'; text: string };

interface FileSpec {
  world: (typeof WORLDS)[number];
  inSrc: boolean;
  dirs: string[];
  name: string;
  ext: (typeof EXTENSIONS)[number];
  lines: Line[];
  crlf: boolean;
}

const lineArb: fc.Arbitrary<Line> = fc.oneof(
  fc.constant<Line>({ kind: 'empty' }),
  fc.stringMatching(/^[ \t]{1,4}$/).map((text): Line => ({ kind: 'space', text })),
  fc.stringMatching(/^[a-z0-9;=(){} ]{0,10}[a-z0-9]$/).map((text): Line => ({ kind: 'text', text })),
);

const fileArb: fc.Arbitrary<FileSpec> = fc.record({
  world: fc.constantFrom(...WORLDS),
  inSrc: fc.boolean(),
  dirs: fc.array(fc.constantFrom('da', 'db', 'dc'), { maxLength: 3 }),
  name: fc.constantFrom('fa', 'fb', 'fc', 'fd'),
  ext: fc.constantFrom(...EXTENSIONS),
  lines: fc.array(lineArb, { maxLength: 12 }),
  crlf: fc.boolean(),
});

const fixtureArb = fc.array(fileArb, { maxLength: 25 });

const lineText = (l: Line): string => (l.kind === 'empty' ? '' : l.text);

describe('world size counting (property)', () => {
  // Feature: site, Property 8: World size counting
  // **Validates: Requirements 9.1, 9.3, 9.5, 9.6**
  it(
    'countWorldSizes counts exactly the non-blank lines of non-test, non-declaration .ts files below src',
    async () => {
      const { countWorldSizes } = await loadModule();
      fc.assert(
        fc.property(fixtureArb, (specs) => {
          const root = mkdtempSync(join(tmpdir(), 'world-size-pbt-'));
          try {
            const expected: Record<string, number> = { 'drawer-arm': 0, 'ghost-cloud': 0, 'playground-shell': 0 };
            // Every named world has a src folder in the repository.
            for (const w of WORLDS) mkdirSync(join(root, 'worlds', w, 'src'), { recursive: true });
            const seen = new Set<string>();
            for (const s of specs) {
              const rel = join('worlds', s.world, s.inSrc ? 'src' : 'other', ...s.dirs, `${s.name}${s.ext}`);
              if (seen.has(rel)) continue;
              seen.add(rel);
              const full = join(root, rel);
              mkdirSync(dirname(full), { recursive: true });
              writeFileSync(full, s.lines.map(lineText).join(s.crlf ? '\r\n' : '\n'));
              const counted = s.ext === '.ts';
              if (s.inSrc && counted) {
                expected[s.world] = (expected[s.world] ?? 0) + s.lines.filter((l) => l.kind === 'text').length;
              }
            }
            expect(countWorldSizes(root)).toEqual(expected);
          } finally {
            rmSync(root, { recursive: true, force: true });
          }
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'roundLines(n) is the multiple of 100 nearest to n, ties upward',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
          const r = roundLines(n);
          if (r % 100 !== 0) return false;
          const d = r - n;
          // Nearest: distance at most 50; ties (distance exactly 50) go upward.
          return d <= 50 && d > -50;
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
      expect(roundLines(789)).toBe(800);
      expect(roundLines(150)).toBe(200);
      expect(roundLines(149)).toBe(100);
      expect(roundLines(0)).toBe(0);
    },
    PBT_TIMEOUT,
  );

  it('the committed world-size.json equals a fresh run on the repository', async () => {
    const { renderWorldSizeFile } = await loadModule();
    const committed = readFileSync(join(SITE, 'src', 'data', 'world-size.json'), 'utf8');
    expect(committed).toBe(renderWorldSizeFile(REPO));
  });
});

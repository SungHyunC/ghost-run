import * as fc from 'fast-check';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PARTS_MATRIX, PART_NAMES } from '../../src/data/parts-matrix';
import type { CostumeId } from '../../src/data/parts-matrix';
import type { AppPart } from '../../src/data/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

type Usage = Record<AppPart, boolean>;
type DeriveUsage = (sourceRoot: string) => Usage;

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const scanModule = '../../scripts/lib/scan-usage.mjs';
const { deriveUsage } = (await import(/* @vite-ignore */ scanModule)) as { deriveUsage: DeriveUsage };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const COSTUME_SOURCES: Record<CostumeId, string> = {
  shell: 'apps/ghost-shell/src',
  hand: 'apps/ghost-hand/src',
  cloud: 'worlds/ghost-cloud/src',
};

describe('parts matrix (property)', () => {
  // Feature: site, Property 2: Parts matrix equals the imports
  // **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**
  it('PARTS_MATRIX equals deriveUsage of each costume source folder', () => {
    for (const costume of Object.keys(COSTUME_SOURCES) as CostumeId[]) {
      const folder = COSTUME_SOURCES[costume];
      const derived = deriveUsage(join(repoRoot, folder));
      for (const part of PART_NAMES) {
        expect(
          PARTS_MATRIX[costume][part],
          `costume ${costume}, part ${part}: matrix says ${String(PARTS_MATRIX[costume][part])}, imports of ${folder} say ${String(derived[part])}`,
        ).toBe(derived[part]);
      }
    }
  });

  it('the shared pieces named by the matrix exist', () => {
    expect(existsSync(join(repoRoot, 'integrations/kiro-hook'))).toBe(true);
    expect(existsSync(join(repoRoot, '.kiro/agents/world-smith.json'))).toBe(true);
  });

  // Feature: site, Property 2: Parts matrix equals the imports (generated trees)
  // **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**
  it(
    'deriveUsage reports a part as used exactly when a resolved name has a Usage_Reference',
    () => {
      fc.assert(
        fc.property(fc.array(partPlanArb, { minLength: 6, maxLength: 6 }), (plans) => {
          const files: Record<string, string> = {};
          const expected: Usage = { mirror: false, ghost: false, wards: false, candle: false, blacklight: false, graveyard: false };
          PART_NAMES.forEach((part, i) => {
            const plan = plans[i];
            if (plan === undefined) return;
            expected[part] = buildPart(part, plan, files);
          });
          const root = mkdtempSync(join(tmpdir(), 'parts-prop-'));
          try {
            for (const [rel, text] of Object.entries(files)) {
              const full = join(root, rel);
              mkdirSync(dirname(full), { recursive: true });
              writeFileSync(full, text);
            }
            expect(deriveUsage(root)).toEqual(expected);
          } finally {
            rmSync(root, { recursive: true, force: true });
          }
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});

// ---- generated source trees -------------------------------------------------

const ORIGINS: Record<AppPart, readonly { pkg: string; name: string }[]> = {
  mirror: [{ pkg: '@ghost-run/ui', name: 'MirrorWorld' }],
  ghost: [{ pkg: '@ghost-run/core', name: 'ghostRun' }],
  wards: [{ pkg: '@ghost-run/core', name: 'WardEngine' }],
  candle: [{ pkg: '@ghost-run/ui', name: 'Candle' }],
  blacklight: [
    { pkg: '@ghost-run/ui', name: 'BlacklightView' },
    { pkg: '@ghost-run/core', name: 'scanText' },
  ],
  graveyard: [{ pkg: '@ghost-run/ui', name: 'Graveyard' }],
};

type Hop = 'named' | 'rename' | 'import-export' | 'star';
type Consumption = 'named' | 'namespace' | 'unused-import' | 'type-only-import' | 'inline-type-import' | 'never-imported' | 'absent';

interface PartPlan {
  origin: number;
  hops: Hop[];
  consumption: Consumption;
}

const partPlanArb: fc.Arbitrary<PartPlan> = fc.record({
  origin: fc.nat(1),
  hops: fc.array(fc.constantFrom<Hop>('named', 'rename', 'import-export', 'star'), { maxLength: 3 }),
  consumption: fc.constantFrom<Consumption>(
    'named',
    'named',
    'namespace',
    'unused-import',
    'type-only-import',
    'inline-type-import',
    'never-imported',
    'absent',
  ),
});

/** Writes the files of one part into `files`; returns whether the part has a Usage_Reference. */
function buildPart(part: AppPart, plan: PartPlan, files: Record<string, string>): boolean {
  if (plan.consumption === 'absent') return false;
  const options = ORIGINS[part];
  const origin = options[plan.origin % options.length];
  if (origin === undefined) return false;

  // The chain: module 0 re-exports from the package, module i re-exports from module i - 1.
  let name = origin.name;
  let from = origin.pkg;
  plan.hops.forEach((hop, i) => {
    const file = `${part}-r${i}`;
    const next = hop === 'rename' ? `${part}Alias${i}` : name;
    if (hop === 'star') {
      // `export *` keeps the name and works on both a package and a relative module.
      files[`${file}.ts`] = `export * from '${from}';\n`;
    } else if (hop === 'import-export') {
      files[`${file}.ts`] = `import { ${name} as local${i} } from '${from}';\nexport { local${i} as ${next} };\n`;
    } else {
      files[`${file}.ts`] = `export { ${name}${next === name ? '' : ` as ${next}`} } from '${from}';\n`;
    }
    name = next;
    from = `./${file}`;
  });

  const out = `${part}-use.ts`;
  switch (plan.consumption) {
    case 'named':
      files[out] = `import { ${name} } from '${from}';\nexport const used = [${name}];\n`;
      return true;
    case 'namespace':
      files[out] = `import * as ns from '${from}';\nexport const used = [ns.${name}];\n`;
      return true;
    case 'unused-import':
      files[out] = `import { ${name} } from '${from}';\nexport const nothing = 1;\n`;
      return false;
    case 'type-only-import':
      files[out] = `import type { ${name} } from '${from}';\nexport type T = typeof ${name};\n`;
      return false;
    case 'inline-type-import':
      files[out] = `import { type ${name} } from '${from}';\nexport type T = typeof ${name};\n`;
      return false;
    case 'never-imported':
      // The chain exists (when it has hops) but no file imports from it.
      files[`${part}-other.ts`] = 'export const other = 1;\n';
      return false;
    default:
      return false;
  }
}

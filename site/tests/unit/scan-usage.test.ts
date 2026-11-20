import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppPart } from '../../src/data/types';

type Usage = Record<AppPart, boolean>;
type DeriveUsage = (sourceRoot: string) => Usage;

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const scanModule = '../../scripts/lib/scan-usage.mjs';
const { deriveUsage } = (await import(/* @vite-ignore */ scanModule)) as { deriveUsage: DeriveUsage };

const roots: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'scan-usage-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const NONE: Usage = { mirror: false, ghost: false, wards: false, candle: false, blacklight: false, graveyard: false };

describe('deriveUsage', () => {
  it('counts a re-export chain that is used as JSX', () => {
    const root = makeTree({
      'ui-imports.ts': "export { Candle, Graveyard } from '@ghost-run/ui';\nexport * from './more';\n",
      'more.ts': "export { MirrorWorld } from '@ghost-run/ui';\n",
      'App.tsx': "import { Candle, MirrorWorld } from './ui-imports';\nexport const App = () => <div><Candle /><MirrorWorld /></div>;\n",
    });
    expect(deriveUsage(root)).toEqual({ ...NONE, candle: true, mirror: true });
  });

  it('does not count a re-export chain that is never used', () => {
    const root = makeTree({
      'ui-imports.ts': "export { Candle, Graveyard, MirrorWorld } from '@ghost-run/ui';\n",
      'App.tsx': "import { Candle } from './ui-imports';\nexport const App = () => null;\n",
    });
    expect(deriveUsage(root)).toEqual(NONE);
  });

  it('counts namespace member access by property and by string literal', () => {
    const root = makeTree({
      'a.tsx': "import * as ui from '@ghost-run/ui';\nexport const A = () => <ui.Candle />;\nexport const g = ui['Graveyard'];\n",
      'b.ts': "import * as core from '@ghost-run/core';\nexport const run = core.ghostRun;\n",
    });
    expect(deriveUsage(root)).toEqual({ ...NONE, candle: true, graveyard: true, ghost: true });
  });

  it('follows a namespace imported through a relative module', () => {
    const root = makeTree({
      'kit.ts': "export * as ui from '@ghost-run/ui';\n",
      'a.tsx': "import { ui } from './kit';\nexport const A = () => <ui.MirrorWorld />;\n",
    });
    expect(deriveUsage(root)).toEqual({ ...NONE, mirror: true });
  });

  it('does not count a bare import that is never used', () => {
    const root = makeTree({
      'a.ts': "import { WardEngine, ghostRun } from '@ghost-run/core';\nimport * as ui from '@ghost-run/ui';\nexport {};\n",
    });
    expect(deriveUsage(root)).toEqual(NONE);
  });

  it('does not count type-only imports or type positions, but counts calls', () => {
    const root = makeTree({
      'a.ts': [
        "import type { WardEngine } from '@ghost-run/core';",
        "import { type ghostRun, scanText } from '@ghost-run/core';",
        "import { Candle } from '@ghost-run/ui';",
        'export type T = typeof Candle;',
        'export const w: WardEngine | null = null;',
        "export const s = scanText('x');",
        '',
      ].join('\n'),
    });
    expect(deriveUsage(root)).toEqual({ ...NONE, blacklight: true });
  });

  it('skips test files, declaration files, and tests/ and node_modules directories', () => {
    const root = makeTree({
      'a.test.ts': "import { Candle } from '@ghost-run/ui';\nCandle();\n",
      'b.d.ts': "import { Graveyard } from '@ghost-run/ui';\nGraveyard();\n",
      'tests/c.ts': "import { MirrorWorld } from '@ghost-run/ui';\nMirrorWorld();\n",
      'node_modules/p/d.ts': "import { WardEngine } from '@ghost-run/core';\nnew WardEngine();\n",
    });
    expect(deriveUsage(root)).toEqual(NONE);
  });

  it('does not count a property key that shares the name of an import', () => {
    const root = makeTree({
      'a.ts': "import { Candle } from '@ghost-run/ui';\nexport const o = { Candle: 1 };\nexport const p = o.Candle;\n",
    });
    expect(deriveUsage(root)).toEqual(NONE);
  });

  it('counts a named import used as the object of a member access', () => {
    const root = makeTree({
      'a.ts': "import { WardEngine } from '@ghost-run/core';\nexport const v = WardEngine.evaluate({});\n",
    });
    expect(deriveUsage(root)).toEqual({ ...NONE, wards: true });
  });

  it('throws for a missing source root', () => {
    expect(() => deriveUsage(join(tmpdir(), 'scan-usage-does-not-exist'))).toThrow(/source root not found/);
  });
});

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Lint in memory: the rules depend on the path only, so no file is written into site/src.
async function lintFixture(relPath: string, source: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: siteRoot });
  const results = await eslint.lintText(source, { filePath: resolve(siteRoot, relPath) });
  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'parse-error'));
}

describe('lint rules', () => {
  it('rejects a @ghost-run import in src', async () => {
    const rules = await lintFixture('src/__lint_fixture_import.ts', "import '@ghost-run/core';\nexport const x = 1;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects fetch in src', async () => {
    const rules = await lintFixture('src/__lint_fixture_fetch.ts', "export const f = () => fetch('https://a.example/');\n");
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects dangerouslySetInnerHTML in src', async () => {
    const rules = await lintFixture(
      'src/__lint_fixture_html.tsx',
      "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
    );
    expect(rules.length).toBeGreaterThan(0);
  });

  it('accepts a @ghost-run/core import in src/live', async () => {
    const rules = await lintFixture('src/live/__lint_fixture_core.ts', "import type { Scene } from '@ghost-run/core';\nexport type S = Scene;\n");
    expect(rules).not.toContain('no-restricted-imports');
  });

  it('rejects the same import in src/components', async () => {
    const rules = await lintFixture('src/components/__lint_fixture_core.ts', "import type { Scene } from '@ghost-run/core';\nexport type S = Scene;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects fetch in src/live', async () => {
    const rules = await lintFixture('src/live/__lint_fixture_fetch.ts', "export const f = () => fetch('https://a.example/');\n");
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects react in src/live', async () => {
    const rules = await lintFixture('src/live/__lint_fixture_react.ts', "import { useState } from 'react';\nexport const u = useState;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('allows named app modules and rejects other app files in src/live', async () => {
    const ok = await lintFixture('src/live/__lint_fixture_app_ok.ts', "import '../../../apps/ghost-shell/src/pipeline/run-playground';\n");
    expect(ok).not.toContain('no-restricted-imports');
    const bad = await lintFixture('src/live/__lint_fixture_app_bad.ts', "import '../../../apps/ghost-shell/src/App';\n");
    expect(bad).toContain('no-restricted-imports');
  });

  it('accepts @ghost-run/ui and its styles in src/showcase', async () => {
    const rules = await lintFixture(
      'src/showcase/__lint_fixture_ui.ts',
      "import { Candle } from '@ghost-run/ui';\nimport '@ghost-run/ui/styles.css';\nexport const C = Candle;\n",
    );
    expect(rules).not.toContain('no-restricted-imports');
  });

  it('accepts a type-only @ghost-run/core import and rejects a value import in src/showcase', async () => {
    const ok = await lintFixture('src/showcase/__lint_fixture_core_ok.ts', "import type { Scene } from '@ghost-run/core';\nexport type S = Scene;\n");
    expect(ok).not.toContain('no-restricted-imports');
    const bad = await lintFixture('src/showcase/__lint_fixture_core_bad.ts', "import { snapshotOf } from '@ghost-run/core';\nexport const s = snapshotOf;\n");
    expect(bad).toContain('no-restricted-imports');
  });

  it('rejects @ghost-run/ui in src/components', async () => {
    const rules = await lintFixture('src/components/__lint_fixture_ui.ts', "import { Candle } from '@ghost-run/ui';\nexport const C = Candle;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects a deep @ghost-run/ui import in src/showcase', async () => {
    const rules = await lintFixture('src/showcase/__lint_fixture_ui_deep.ts', "import { escapeForDisplay } from '@ghost-run/ui/src/model/escape';\nexport const e = escapeForDisplay;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects fetch in src/showcase', async () => {
    const rules = await lintFixture('src/showcase/__lint_fixture_fetch.ts', "export const f = () => fetch('https://a.example/');\n");
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects Date.now in a new src/engine paging file', async () => {
    const rules = await lintFixture('src/engine/paging-fixture.ts', 'export const t = () => Date.now();\n');
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects Date.now in src/engine', async () => {
    const rules = await lintFixture('src/engine/__lint_fixture_clock.ts', 'export const t = () => Date.now();\n');
    expect(rules).toContain('no-restricted-syntax');
  });
});

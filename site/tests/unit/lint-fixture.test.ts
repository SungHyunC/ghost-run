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

  it('rejects Date.now in src/engine', async () => {
    const rules = await lintFixture('src/engine/__lint_fixture_clock.ts', 'export const t = () => Date.now();\n');
    expect(rules).toContain('no-restricted-syntax');
  });
});

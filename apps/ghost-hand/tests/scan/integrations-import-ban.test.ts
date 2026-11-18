// Validates: kiro-integration Requirements 1.4
// The app must not import integrations/. ESLint lints a virtual file under src/ (nothing is written to disk).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function ruleIds(source: string, relFile: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: pkgDir, overrideConfigFile: path.join(pkgDir, 'eslint.config.mjs') });
  const [result] = await eslint.lintText(source, { filePath: path.join(pkgDir, relFile) });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse-error');
}

describe('integrations import ban (kiro-integration Requirement 1.4)', () => {
  it.each([
    ['@ghost-run/kiro-hook', 'src/__integrations-ban-probe.ts'],
    ['@ghost-run/mcp', 'src/__integrations-ban-probe.ts'],
    ['../../../integrations/kiro-hook/index.mjs', 'src/__integrations-ban-probe.ts'],
    ['@ghost-run/kiro-hook', 'src/overlay/__integrations-ban-probe.ts'],
  ])('reports no-restricted-imports for %s in %s', async (name, relFile) => {
    const ids = await ruleIds(`import { x } from '${name}';\nexport const y = x;\n`, relFile);
    expect(ids).toContain('no-restricted-imports');
  });
});

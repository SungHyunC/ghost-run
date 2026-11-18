// Validates: Requirements 1.3
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../core');
const virtualFile = path.join(coreDir, 'src', '__import-ban-probe.ts');

async function ruleIds(source: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: coreDir,
    overrideConfigFile: path.join(coreDir, 'eslint.config.mjs'),
  });
  const [result] = await eslint.lintText(source, { filePath: virtualFile });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => m.ruleId ?? 'parse-error');
}

describe('core import ban (Requirement 1.3)', () => {
  it('reports no-restricted-imports when core/src imports @ghost-run/wards-config', async () => {
    const ids = await ruleIds("import { parseWards } from '@ghost-run/wards-config';\nexport const x = parseWards;\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('reports no-restricted-imports for a deep wards-config subpath', async () => {
    const ids = await ruleIds("import { y } from '@ghost-run/wards-config/dist/src/index.js';\nexport const x = y;\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('does not report no-restricted-imports for a clean relative import', async () => {
    const ids = await ruleIds("import type { Change } from './types.js';\nexport type X = Change;\n");
    expect(ids).not.toContain('no-restricted-imports');
  });
});

// Validates: Requirements 1.5
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function lintTempFile(source: string): Promise<string[]> {
  const srcDir = path.join(pkgDir, 'src');
  const file = path.join(srcDir, '__playground-ban-probe.ts');
  mkdirSync(srcDir, { recursive: true });
  try {
    writeFileSync(file, source);
    const eslint = new ESLint({ cwd: pkgDir, overrideConfigFile: path.join(pkgDir, 'eslint.config.mjs') });
    const [result] = await eslint.lintFiles([file]);
    return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse-error');
  } finally {
    rmSync(file, { force: true });
  }
}

describe('playground import ban (Requirement 1.5)', () => {
  it.each(['@ghost-run/playground-shell', '@ghost-run/ghost-shell'])('reports no-restricted-imports for %s', async (name) => {
    const ids = await lintTempFile(`import { x } from '${name}';\nexport const y = x;\n`);
    expect(ids).toContain('no-restricted-imports');
  });
});

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Validates: Requirements 1.3
const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core');

async function lintTemp(name: string, source: string) {
  const file = join(coreDir, 'src', name);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, source);
    const eslint = new ESLint({ cwd: coreDir });
    const [result] = await eslint.lintFiles([file]);
    return result?.messages ?? [];
  } finally {
    rmSync(file, { force: true });
  }
}

describe('core -> ghost-runner import ban', () => {
  it('reports no-restricted-imports for the package name', async () => {
    const messages = await lintTemp(
      '__tmp-import-ban-pkg.ts',
      "import '@ghost-run/ghost-runner';\nexport {};\n",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports' && m.severity === 2)).toBe(true);
  });

  it('reports no-restricted-imports for a relative path into ghost-runner/', async () => {
    const messages = await lintTemp(
      '__tmp-import-ban-path.ts',
      "import '../../ghost-runner/src/index';\nexport {};\n",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports' && m.severity === 2)).toBe(true);
  });

  it('does not report an unrelated clean file', async () => {
    const messages = await lintTemp('__tmp-import-ban-clean.ts', 'export const x = 1;\n');
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  });
});

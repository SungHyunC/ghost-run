// Validates: Requirements 1.10, 1.11
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import * as entry from '@ghost-run/wards-config';
import * as nodeEntry from '@ghost-run/wards-config/node';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function ruleIds(source: string, relFile: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: pkgDir, overrideConfigFile: path.join(pkgDir, 'eslint.config.mjs') });
  const [result] = await eslint.lintText(source, { filePath: path.join(pkgDir, relFile) });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? 'parse-error');
}

describe('package entries', () => {
  it('default entry exports exactly the expected runtime names', () => {
    expect(Object.keys(entry).sort()).toEqual(['formatConfigError', 'parseWards', 'printWards']);
    expect('loadWardsFile' in entry).toBe(false);
  });

  it('/node subpath exports loadWardsFile only', () => {
    expect(Object.keys(nodeEntry)).toEqual(['loadWardsFile']);
    expect(typeof nodeEntry.loadWardsFile).toBe('function');
  });
});

describe('browser-safe import ban', () => {
  it('flags node: and bare built-in imports in default-entry sources', async () => {
    expect(await ruleIds("import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n", 'src/__probe.ts')).toContain('no-restricted-imports');
    expect(await ruleIds("import { join } from 'path';\nexport const x = join;\n", 'src/__probe.ts')).toContain('no-restricted-imports');
  });

  it('still flags core deep imports in default-entry sources', async () => {
    expect(await ruleIds("import { y } from '@ghost-run/core/dist/x.js';\nexport const x = y;\n", 'src/__probe.ts')).toContain('no-restricted-imports');
  });

  it('allows node:* in load.ts and node.ts', async () => {
    const src = "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n";
    expect(await ruleIds(src, 'src/load.ts')).not.toContain('no-restricted-imports');
    expect(await ruleIds(src, 'src/node.ts')).not.toContain('no-restricted-imports');
  });
});

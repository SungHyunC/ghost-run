// Import ban for integrations (kiro-integration task 2.2, Requirement 1.4): a temporary file under each
// package's src/ imports an integrations package, and ESLint must report no-restricted-imports.
// Covered: core, ghost-runner, ui, wards-config, worlds/playground-shell, apps/ghost-shell.
// Not covered yet: worlds/drawer-arm and apps/ghost-hand (their lint files are finished with ghost-hand task 19).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const PACKAGES = ['core', 'ghost-runner', 'ui', 'wards-config', 'worlds/playground-shell', 'apps/ghost-shell'];
const SPECIFIERS = ['@ghost-run/kiro-hook', '@ghost-run/mcp', '../../integrations/kiro-hook/index.mjs'];

const ESLINT_BIN = path.join(path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')), 'bin', 'eslint.js');

/**
 * ESLint runs in a child process per call: the typescript-eslint parser keeps per-process project state and
 * fails with "multiple candidate TSConfigRootDirs" when one process lints files of several packages.
 * @param {string} pkgDir @param {string} source @returns {Promise<string[]>}
 */
async function lintTempFile(pkgDir, source) {
  const srcDir = path.join(pkgDir, 'src');
  const file = path.join(srcDir, '__integrations-ban-probe.ts');
  await mkdir(srcDir, { recursive: true });
  try {
    await writeFile(file, source);
    const run = spawnSync(process.execPath, [ESLINT_BIN, '--format', 'json', '--no-warn-ignored', file], {
      cwd: pkgDir,
      encoding: 'utf8',
    });
    /** @type {{ messages: { ruleId: string | null, severity: number, message: string }[] }[]} */
    const [result] = JSON.parse(run.stdout);
    return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? `parse-error: ${m.message}`);
  } finally {
    await rm(file, { force: true });
  }
}

describe('integrations import ban', () => {
  for (const rel of PACKAGES) {
    const pkgDir = path.join(REPO, rel);
    const present = existsSync(path.join(pkgDir, 'eslint.config.mjs'));
    for (const spec of SPECIFIERS) {
      it.skipIf(!present)(`${rel} reports no-restricted-imports for ${spec}`, async () => {
        const ids = await lintTempFile(pkgDir, `import { x } from '${spec}';\nexport const y = x;\n`);
        expect(ids).toContain('no-restricted-imports');
      });
    }
  }
});

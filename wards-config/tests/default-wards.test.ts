import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadWardsFile } from '../src/node.js';

const DEFAULT_FILE = fileURLToPath(new URL('../../apps/ghost-shell/wards.yaml', import.meta.url));

describe('default Ghost Shell wards file (Requirement 18)', () => {
  it('loads without errors and has no warnings', async () => {
    const r = await loadWardsFile(DEFAULT_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });

  it('contains exactly the three default wards in order with the exact values', async () => {
    const r = await loadWardsFile(DEFAULT_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const wards = r.wardSet.wards;
    expect(wards.map((w) => w.id)).toEqual(['protect-data', 'no-data-loss', 'no-secret-egress']);
    expect(wards.map((w) => w.kind)).toEqual(['path', 'sql', 'egress']);

    expect(wards[0]).toMatchObject({
      id: 'protect-data',
      kind: 'path',
      deny: ['delete', 'overwrite'],
      paths: ['data/**', 'db/*.sqlite', '.env'],
    });
    expect(wards[1]).toMatchObject({
      id: 'no-data-loss',
      kind: 'sql',
      tables: ['users', 'orders'],
      max_rows_lost: 0,
    });
    expect(wards[2]).toMatchObject({
      id: 'no-secret-egress',
      kind: 'egress',
      secrets: ['.env', '**/*.pem'],
      allow_hosts: ['registry.npmjs.org'],
    });
  });

  it('has no physics ward', async () => {
    const r = await loadWardsFile(DEFAULT_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wardSet.wards.some((w) => w.kind === 'physics')).toBe(false);
  });

  it('declares exactly the five safe commands', async () => {
    const r = await loadWardsFile(DEFAULT_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.safeCommands).toEqual(['ls', 'pwd', 'cat', 'git status', 'git diff']);
  });
});

const ROOT_FILE = fileURLToPath(new URL('../../wards.yaml', import.meta.url));

describe('root wards.yaml of this repository', () => {
  it('keeps exactly the wards and safe commands of the default Ghost Shell file', async () => {
    const root = await loadWardsFile(ROOT_FILE);
    const app = await loadWardsFile(DEFAULT_FILE);
    expect(root.ok && app.ok).toBe(true);
    if (!root.ok || !app.ok) return;
    expect(root.wardSet).toEqual(app.wardSet);
    expect(root.safeCommands).toEqual(app.safeCommands);
    expect(root.warnings).toEqual([]);
  });

  it('trusts exactly the routine check commands, none that installs, deploys or uses the network', async () => {
    const r = await loadWardsFile(ROOT_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trustedCommands).toEqual([
      'corepack pnpm test',
      'corepack pnpm typecheck',
      'corepack pnpm lint',
      'corepack pnpm build',
      'corepack pnpm build:site',
      'corepack pnpm --filter * test',
      'corepack pnpm --filter * typecheck',
      'corepack pnpm --filter * lint',
      'corepack pnpm --filter * build',
      'corepack pnpm --filter * exec vitest run **',
      'npx vitest run **',
      'npx tsc --noEmit **',
    ]);
    for (const p of r.trustedCommands) expect(p).not.toMatch(/install|add|dlx|deploy|publish|curl|wget|\bsh\b|bash/);
  });
});

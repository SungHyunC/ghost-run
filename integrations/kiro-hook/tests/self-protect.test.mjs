import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isApprovalCommand } from '../lib/gate/approval-guard.mjs';
import { createSelfProtect, isSelfProtected, selfProtectedChanges } from '../lib/gate/self-protect.mjs';

describe('self-protect', () => {
  it.each([
    '.kiro/hooks/a.json',
    'integrations/kiro-hook/lib/x.mjs',
    'integrations/mcp/index.mjs',
    '.ghost-run/store/x.json',
    '.GHOST-RUN/x',
    './INTEGRATIONS/kiro-hook/a',
  ])('protects %s', (p) => expect(isSelfProtected(p)).toBe(true));

  it.each(['src/a.ts', '.kiro/steering/a.md', 'integrations/power/a', '../outside/.ghost-run/x'])(
    'does not protect %s',
    (p) => expect(isSelfProtected(p)).toBe(false),
  );

  it('protects the resolved Wards_File when given', () => {
    const sp = createSelfProtect('apps/ghost-shell/wards.yaml');
    expect(sp.isSelfProtected('apps/ghost-shell/wards.yaml')).toBe(true);
    expect(isSelfProtected('apps/ghost-shell/wards.yaml')).toBe(false);
  });

  it('returns only file-kind changes under protected paths', () => {
    const changes = [
      { kind: 'file-created', path: '.kiro/hooks/a.json' },
      { kind: 'file-overwritten', path: 'integrations/mcp/x' },
      { kind: 'file-deleted', path: '.ghost-run/a' },
      { kind: 'symlink-changed', path: 'integrations/kiro-hook/l' },
      { kind: 'file-created', path: 'src/a.ts' },
      { kind: 'table-rows', path: '.ghost-run/a' },
      { kind: 'file-created' },
    ];
    expect(selfProtectedChanges(changes)).toEqual(changes.slice(0, 4));
  });
});

describe('approval-guard', () => {
  it.each([
    'ghost-run approve abc',
    'GHOST-RUN APPROVE x',
    'ghost-run-approve',
    'ghost-run "approve" 1',
    "node x; 'ghost-run' approve",
    'ghost-run   approve'.replace('   ', ' '),
  ])('detects %s', (c) => expect(isApprovalCommand(c)).toBe(true));

  it.each(['ls -la', 'ghost-run status', '', 'ghost run approve'])('allows %s', (c) =>
    expect(isApprovalCommand(c)).toBe(false),
  );

  it('rejects non-strings', () => expect(isApprovalCommand(undefined)).toBe(false));

  it('property: embedding a reserved name anywhere is detected', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }),
        fc.string({ maxLength: 20 }),
        fc.constantFrom('ghost-run approve', 'ghost-run-approve', 'GHOST-RUN-Approve'),
        (a, b, name) => isApprovalCommand(a + name + b),
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, expect, it } from 'vitest';
import { isMoreRestrictive, WardEngine } from '../src/index.js';
import type { GhostReport, Ward, WardSet } from '../src/index.js';

const set = (...wards: Ward[]): WardSet => ({ wards });

const pathWard = (paths: string[], deny: ('delete' | 'overwrite')[] = ['delete']): Ward => ({
  id: 'p',
  kind: 'path',
  deny,
  paths,
});
const sqlWard = (max: number, tables = ['users']): Ward => ({
  id: 's',
  kind: 'sql',
  tables,
  max_rows_lost: max,
});
const egressWard = (secrets: string[], hosts: string[]): Ward => ({
  id: 'e',
  kind: 'egress',
  secrets,
  allow_hosts: hosts,
});
const physicsWard = (rate: number, force: number, contacts: string[]): Ward => ({
  id: 'ph',
  kind: 'physics',
  min_success_rate: rate,
  max_contact_force_n: force,
  forbidden_contacts: contacts,
});

function report(over: Partial<GhostReport<unknown>> = {}): GhostReport<unknown> {
  return {
    snapshots: [],
    changes: [],
    effectsOutside: [],
    observedEvents: [],
    variantResults: [],
    ...over,
  };
}

describe('isMoreRestrictive', () => {
  it('path: adding a protected path is tighter, removing is looser', () => {
    expect(isMoreRestrictive(set(pathWard(['/a'])), set(pathWard(['/a', '/b'])))).toBe(true);
    expect(isMoreRestrictive(set(pathWard(['/a', '/b'])), set(pathWard(['/a'])))).toBe(false);
  });

  it('sql: lower max_rows_lost is tighter, higher is looser', () => {
    expect(isMoreRestrictive(set(sqlWard(10)), set(sqlWard(5)))).toBe(true);
    expect(isMoreRestrictive(set(sqlWard(5)), set(sqlWard(10)))).toBe(false);
  });

  it('sql: adding a table is tighter, removing is looser', () => {
    expect(isMoreRestrictive(set(sqlWard(5, ['a'])), set(sqlWard(5, ['a', 'b'])))).toBe(true);
    expect(isMoreRestrictive(set(sqlWard(5, ['a', 'b'])), set(sqlWard(5, ['a'])))).toBe(false);
  });

  it('egress: adding a secret is tighter, removing is looser', () => {
    expect(isMoreRestrictive(set(egressWard(['/s1'], [])), set(egressWard(['/s1', '/s2'], [])))).toBe(true);
    expect(isMoreRestrictive(set(egressWard(['/s1', '/s2'], [])), set(egressWard(['/s1'], [])))).toBe(false);
  });

  it('egress: adding a host to allow_hosts is looser, revoking is tighter', () => {
    expect(isMoreRestrictive(set(egressWard(['/s'], ['a.example'])), set(egressWard(['/s'], ['a.example', 'b.example'])))).toBe(false);
    expect(isMoreRestrictive(set(egressWard(['/s'], ['a.example', 'b.example'])), set(egressWard(['/s'], ['a.example'])))).toBe(true);
  });

  it('physics: higher min_success_rate, lower force, more contacts are tighter', () => {
    const base = physicsWard(0.5, 10, ['table']);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.8, 10, ['table'])))).toBe(true);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.5, 5, ['table'])))).toBe(true);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.5, 10, ['table', 'wall'])))).toBe(true);
  });

  it('physics: lower min_success_rate, higher force, fewer contacts are looser', () => {
    const base = physicsWard(0.5, 10, ['table', 'wall']);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.2, 10, ['table', 'wall'])))).toBe(false);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.5, 20, ['table', 'wall'])))).toBe(false);
    expect(isMoreRestrictive(set(base), set(physicsWard(0.5, 10, ['table'])))).toBe(false);
  });

  it('adding a whole ward is tighter', () => {
    expect(isMoreRestrictive(set(), set(sqlWard(5)))).toBe(true);
  });

  it('removing a whole ward is looser', () => {
    expect(isMoreRestrictive(set(sqlWard(5)), set())).toBe(false);
  });

  it('no change returns false', () => {
    const w = set(pathWard(['/a']), sqlWard(5));
    expect(isMoreRestrictive(w, w)).toBe(false);
  });
});

describe('WardEngine.evaluate', () => {
  it('empty wardSet + clean report => pass', () => {
    expect(WardEngine.evaluate(report(), set())).toEqual({
      verdict: 'pass',
      violations: [],
      notices: [],
    });
  });

  it('empty wardSet + observedEvent => warn with notice', () => {
    const v = WardEngine.evaluate(
      report({
        observedEvents: [{ kind: 'network-attempt', destination: 'evil.example', stepIndex: 2 }],
      }),
      set(),
    );
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
    expect(v.notices).toHaveLength(1);
    const n = v.notices[0]!;
    expect(n.kind).toBe('observed-event');
    expect(n.reason.length).toBeGreaterThan(0);
    expect(n.stepIndex).toBe(2);
    expect(n.destination).toBe('evil.example');
  });

  it('observed event with a path carries the path in the notice', () => {
    const v = WardEngine.evaluate(
      report({ observedEvents: [{ kind: 'secret-read', path: '/app/.env', stepIndex: 0 }] }),
      set(),
    );
    expect(v.notices[0]?.path).toBe('/app/.env');
  });

  it('empty wardSet + effectsOutside => warn with notice', () => {
    const v = WardEngine.evaluate(
      report({
        effectsOutside: [[], [{ kind: 'network', destination: 'api.example' }]],
      }),
      set(),
    );
    expect(v.verdict).toBe('warn');
    expect(v.notices).toHaveLength(1);
    const n = v.notices[0]!;
    expect(n.kind).toBe('effect-outside');
    expect(n.reason.length).toBeGreaterThan(0);
    expect(n.stepIndex).toBe(1);
    expect(n.destination).toBe('api.example');
  });

  it('path ward violation: block with correct wardId and reason', () => {
    const v = WardEngine.evaluate(
      report({ changes: [[{ kind: 'file-deleted', path: '/data/db.sqlite' }]] }),
      set({ id: 'keep-db', kind: 'path', deny: ['delete'], paths: ['/data/db.sqlite'] }),
    );
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]?.wardId).toBe('keep-db');
    expect(v.violations[0]?.wardKind).toBe('path');
    expect(v.violations[0]?.reason.length).toBeGreaterThan(0);
  });

  it('path ward: overwrite not denied is not a violation', () => {
    const v = WardEngine.evaluate(
      report({ changes: [[{ kind: 'file-overwritten', path: '/data/x' }]] }),
      set({ id: 'w', kind: 'path', deny: ['delete'], paths: ['/data/x'] }),
    );
    expect(v.verdict).toBe('pass');
  });

  it('sql ward violation: block with wardId and reason', () => {
    const v = WardEngine.evaluate(
      report({
        changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 1206, rowsAfter: 0 }]],
      }),
      set({ id: 'users-guard', kind: 'sql', tables: ['users'], max_rows_lost: 10 }),
    );
    expect(v.verdict).toBe('block');
    expect(v.violations[0]?.wardId).toBe('users-guard');
    expect(v.violations[0]?.reason).toContain('1,206');
  });

  it('egress ward violation: block with wardId and reason', () => {
    const v = WardEngine.evaluate(
      report({
        observedEvents: [
          { kind: 'secret-read', path: '/app/.env', stepIndex: 0 },
          { kind: 'network-attempt', destination: 'https://evil.example/x', stepIndex: 1 },
        ],
      }),
      set({ id: 'no-exfil', kind: 'egress', secrets: ['/app/.env'], allow_hosts: [] }),
    );
    expect(v.verdict).toBe('block');
    expect(v.violations[0]?.wardId).toBe('no-exfil');
    expect(v.violations[0]?.reason.length).toBeGreaterThan(0);
    expect(v.notices).toHaveLength(2);
  });

  it('physics ward violation: block with wardId and reason', () => {
    const v = WardEngine.evaluate(
      report({
        variantResults: [
          { variantId: 'v1', success: false },
          { variantId: 'v2', success: true },
        ],
      }),
      set(physicsWard(0.9, 100, [])),
    );
    expect(v.verdict).toBe('block');
    expect(v.violations[0]?.wardId).toBe('ph');
    expect(v.violations[0]?.reason.length).toBeGreaterThan(0);
  });

  it('symlink-changed counts as overwrite for path wards', () => {
    const r = report({
      changes: [[{ kind: 'symlink-changed', path: '/data/link', targetBefore: 'a', targetAfter: 'b' }]],
    });
    const over = WardEngine.evaluate(r, set({ id: 'ow', kind: 'path', deny: ['overwrite'], paths: ['/data/link'] }));
    expect(over.verdict).toBe('block');
    expect(over.violations).toHaveLength(1);
    expect(over.violations[0]?.wardId).toBe('ow');
    expect(over.violations[0]?.reason).toBe('would overwrite protected path /data/link');

    const del = WardEngine.evaluate(r, set({ id: 'dl', kind: 'path', deny: ['delete'], paths: ['/data/link'] }));
    expect(del.violations).toEqual([]);
    expect(del.verdict).toBe('pass');
  });

  it('sql-row-count with dropped:true counts all rows as lost', () => {
    const r = report({
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 50, rowsAfter: 0, dropped: true }]],
    });
    const blocked = WardEngine.evaluate(r, set(sqlWard(49)));
    expect(blocked.verdict).toBe('block');
    expect(blocked.violations[0]?.reason).toContain('50 rows from users');
    expect(WardEngine.evaluate(r, set(sqlWard(50))).verdict).toBe('pass');
    // dropped ignores a nonzero rowsAfter: all rows are lost.
    const odd = report({
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 50, rowsAfter: 40, dropped: true }]],
    });
    expect(WardEngine.evaluate(odd, set(sqlWard(10))).verdict).toBe('block');
  });

  it('ObservedEvent with eventId evaluates the same as without it', () => {
    const ward = set({ id: 'no-exfil', kind: 'egress', secrets: ['/app/.env'], allow_hosts: [] });
    const plain = report({
      observedEvents: [
        { kind: 'secret-read', path: '/app/.env', stepIndex: 0 },
        { kind: 'network-attempt', destination: 'https://evil.example/x', stepIndex: 1 },
      ],
    });
    const withIds = report({
      observedEvents: [
        { kind: 'secret-read', path: '/app/.env', stepIndex: 0, eventId: 'ev-0' },
        { kind: 'network-attempt', destination: 'https://evil.example/x', stepIndex: 1, eventId: 'ev-1' },
      ],
    });
    expect(WardEngine.evaluate(withIds, ward)).toEqual(WardEngine.evaluate(plain, ward));
  });

  it('accepts secretValues and payloads without leaking them into the verdict', () => {
    const secret = 'sk-CANARY-abc123';
    const bytes = new TextEncoder().encode(secret);
    const forms = [
      secret,
      Buffer.from(bytes).toString('base64'),
      Buffer.from(bytes).toString('hex'),
      Buffer.from(bytes).toString('hex').toUpperCase(),
    ];
    const r = report({
      observedEvents: [
        { kind: 'secret-read', path: '/app/.env', stepIndex: 0 },
        { kind: 'network-attempt', destination: 'https://evil.example/x', stepIndex: 1, eventId: 'ev-1' },
      ],
    });
    const ward = set({ id: 'no-exfil', kind: 'egress', secrets: ['/app/.env'], allow_hosts: [] });
    const inputs = {
      secretValues: new Map([['.env', bytes]]),
      payloads: new Map([['ev-1', new TextEncoder().encode(`token=${secret}`)]]),
    };
    const v = WardEngine.evaluate(r, ward, inputs);
    expect(v.verdict).toBe('block');
    const json = JSON.stringify(v);
    for (const f of forms) expect(json).not.toContain(f);
    expect(v).toEqual(WardEngine.evaluate(r, ward));
  });

  it('stricter ward set never lowers the verdict (notices are ward-independent)', () => {
    const r = report({
      effectsOutside: [[{ kind: 'network', destination: 'api.example' }]],
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 10, rowsAfter: 0 }]],
    });
    const loose = set(sqlWard(10));
    const tight = set(sqlWard(5));
    expect(isMoreRestrictive(loose, tight)).toBe(true);
    expect(WardEngine.evaluate(r, loose).verdict).toBe('warn');
    expect(WardEngine.evaluate(r, tight).verdict).toBe('block');
    expect(WardEngine.evaluate(r, set()).notices).toEqual(WardEngine.evaluate(r, tight).notices);
  });
});

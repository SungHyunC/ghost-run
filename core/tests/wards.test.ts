import { describe, expect, it } from 'vitest';
import {
  CLAIM_LOWERED_LINE,
  CLAIM_LOWERED_UNSUPPORTED_STEP_LINE,
  isMoreRestrictive,
  renderMessage,
  WardEngine,
} from '../src/index.js';
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

// ---------------------------------------------------------------------------
// Task 4.13: refined judgment examples (appended; cases above are unchanged).
// Test data: reserved domains, 192.0.2.x, canary secrets, hidden Unicode via escapes.
// ---------------------------------------------------------------------------

const del = (path: string) => ({ kind: 'file-deleted', path });
const ovr = (path: string) => ({ kind: 'file-overwritten', path });

/**
 * Expected violation count computed from the Changes: distinct deleted/overwritten
 * paths (directory entries included) that equal `root` or lie below it.
 */
function expectedUnder(changes: readonly { kind: string; path?: unknown }[], root: string, kinds: string[]): number {
  const seen = new Set<string>();
  for (const c of changes) {
    if (!kinds.includes(c.kind) || typeof c.path !== 'string') continue;
    const p = c.path.replace(/^\/+/, '');
    if (p === root || p.startsWith(`${root}/`)) seen.add(`${c.kind}\u0000${p}`);
  }
  return seen.size;
}

describe('wards refined examples (task 4.13): path wards', () => {
  it('glob and normalized spellings of one path are all judged against the ward', () => {
    const ward = set(pathWard(['data/**']));
    for (const spelling of ['data/x', './data/../data/x', 'data//x', 'data/./x', '/data/x', 'data\\x']) {
      const v = WardEngine.evaluate(report({ changes: [[del(spelling)]] }), ward);
      expect(v.verdict, spelling).toBe('block');
      expect(v.violations, spelling).toHaveLength(1);
    }
    expect(WardEngine.evaluate(report({ changes: [[del('database/x')]] }), ward).verdict).toBe('pass');
  });

  it('a pattern is anchored at the copy root; ** prefix reaches nested paths', () => {
    const changes = { changes: [[del('sub/.env')]] };
    expect(WardEngine.evaluate(report(changes), set(pathWard(['.env']))).verdict).toBe('pass');
    expect(WardEngine.evaluate(report(changes), set(pathWard(['**/.env']))).verdict).toBe('block');
    expect(WardEngine.evaluate(report({ changes: [[del('.env')]] }), set(pathWard(['**/.env']))).verdict).toBe('block');
  });

  it('violation count equals the matching delete Changes, including directory entries', () => {
    const changes = [
      del('data'),
      del('data/a'),
      del('data/a/f1.txt'),
      del('data/b.txt'),
      del('other/c.txt'),
      ovr('data/kept.txt'),
    ];
    const v = WardEngine.evaluate(report({ changes: [changes] }), set(pathWard(['data/**'])));
    const expected = expectedUnder(changes, 'data', ['file-deleted']);
    expect(expected).toBe(4);
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(expected);
    // Ascending order of the normalized path.
    const reasons = v.violations.map((x) => x.reason);
    expect(reasons).toEqual([...reasons].sort());
  });

  it('violation count equals matching delete and overwrite Changes when both are denied', () => {
    const changes = [del('data'), del('data/a'), ovr('data/b.txt'), ovr('data/b.txt'), ovr('elsewhere/z')];
    const v = WardEngine.evaluate(report({ changes: [changes] }), set(pathWard(['data/**'], ['delete', 'overwrite'])));
    expect(v.violations).toHaveLength(expectedUnder(changes, 'data', ['file-deleted', 'file-overwritten']));
  });

  it('the case policy defaults to case-insensitive; case_sensitive: true compares exactly', () => {
    const r = report({ changes: [[del('DATA/Secret.txt')]] });
    const insensitive = WardEngine.evaluate(r, set(pathWard(['data/**'])));
    expect(insensitive.verdict).toBe('block');
    expect(insensitive.violations[0]?.reason).toBe('would delete protected path DATA/Secret.txt');
    const sensitive = WardEngine.evaluate(
      r,
      set({ id: 'p', kind: 'path', deny: ['delete'], paths: ['data/**'], case_sensitive: true }),
    );
    expect(sensitive.verdict).toBe('pass');
    const exact = WardEngine.evaluate(
      r,
      set({ id: 'p', kind: 'path', deny: ['delete'], paths: ['DATA/**'], case_sensitive: true }),
    );
    expect(exact.verdict).toBe('block');
  });

  it('symlink-changed counts as overwrite under a glob ward and is ignored when only delete is denied', () => {
    const r = report({
      changes: [[{ kind: 'symlink-changed', path: 'db/current.sqlite', targetBefore: 'a', targetAfter: 'b' }]],
    });
    const blocked = WardEngine.evaluate(r, set(pathWard(['db/*.sqlite'], ['overwrite'])));
    expect(blocked.verdict).toBe('block');
    expect(blocked.violations).toHaveLength(1);
    expect(blocked.violations[0]?.reason).toBe('would overwrite protected path db/current.sqlite');
    expect(WardEngine.evaluate(r, set(pathWard(['db/*.sqlite'], ['delete']))).verdict).toBe('pass');
  });

  it('created files and changes without a string path are not violations', () => {
    const r = report({ changes: [[{ kind: 'file-created', path: 'data/new.txt' }, { kind: 'file-deleted' }]] });
    expect(WardEngine.evaluate(r, set(pathWard(['data/**'], ['delete', 'overwrite']))).verdict).toBe('pass');
  });

  it('a path that leaves the copy root matches no ward and adds a path-escape notice', () => {
    const v = WardEngine.evaluate(report({ changes: [[del('../data/x')]] }), set(pathWard(['data/**'])));
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
    expect(v.notices).toHaveLength(1);
    expect(v.notices[0]?.kind).toBe('path-escape');
    expect(v.notices[0]?.reason).toBe('change path escapes the copy root: ../data/x');
  });

  it('hidden characters in an escaping path are escaped in the notice', () => {
    const v = WardEngine.evaluate(
      report({ changes: [[del('../a\u200Bb\nc')]] }),
      set(pathWard(['data/**'])),
    );
    const reason = v.notices[0]?.reason ?? '';
    expect(reason).toBe('change path escapes the copy root: ../a\\u{200B}b\\u{A}c');
    expect(reason).not.toMatch(/[\u0000-\u001F\u200B]/);
  });
});

describe('wards refined examples (task 4.13): sql wards', () => {
  it('a dropped table counts all rows as lost, even with a nonzero rowsAfter', () => {
    const r = report({
      changes: [[{ kind: 'sql-row-count', table: 'USERS', rowsBefore: 1206, rowsAfter: 3, dropped: true }]],
    });
    const v = WardEngine.evaluate(r, set(sqlWard(0)));
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]?.reason).toBe('would delete 1,206 rows from users');
  });

  it('dropped table at the limit passes and above it reports the maximum', () => {
    const r = report({
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 2500, rowsAfter: 0, dropped: true }]],
    });
    expect(WardEngine.evaluate(r, set(sqlWard(2500))).verdict).toBe('pass');
    expect(WardEngine.evaluate(r, set(sqlWard(2499))).violations[0]?.reason).toBe(
      'would delete 2,500 rows from users (max allowed 2,499)',
    );
  });
});

describe('wards refined examples (task 4.13): egress wards', () => {
  const hosts = ['example.test:443', '[2001:db8::1]', '*.example.test', '192.0.2.10'];
  const ward = set(egressWard(['.env'], hosts));
  const withDestination = (destination: string) =>
    WardEngine.evaluate(
      report({
        observedEvents: [
          { kind: 'secret-read', path: '.env', stepIndex: 0 },
          { kind: 'network-attempt', destination, stepIndex: 1 },
        ],
      }),
      ward,
    );

  it.each([
    ['example.test:443', true],
    ['https://example.test:443/path?q=1', true],
    ['Example.TEST.:443', true],
    ['example.test:8443', false],
    ['example.test', false],
    ['a.example.test', true],
    ['a.example.test:8080', true],
    ['example.test.invalid', false],
    ['a.b.example.test', false],
    ['[2001:db8::1]', true],
    ['[2001:DB8:0:0:0:0:0:1]:8080', true],
    ['https://[2001:db8::1]:8443/x', true],
    ['[2001:db8::2]', false],
    ['192.0.2.10', true],
    ['192.0.2.10:443', true],
    ['192.0.2.11', false],
    ['3221226122', false],
  ])('destination %s allowed = %s', (destination, allowed) => {
    const v = withDestination(destination);
    expect(v.violations.length === 0).toBe(allowed);
    expect(v.verdict).toBe(allowed ? 'warn' : 'block');
  });

  it('an allowed host after a secret read is warn with two notices and no violation', () => {
    const v = WardEngine.evaluate(
      report({
        observedEvents: [
          { kind: 'secret-read', path: '.env', stepIndex: 0 },
          { kind: 'network-attempt', destination: 'https://registry.example.test/pkg', stepIndex: 1 },
        ],
      }),
      set(egressWard(['.env'], ['registry.example.test'])),
    );
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
    expect(v.notices).toHaveLength(2);
    expect(v.notices.every((n) => n.kind === 'observed-event')).toBe(true);
  });

  it('a network attempt before the secret read is not a violation; one in the same step is', () => {
    const run = (netStep: number) =>
      WardEngine.evaluate(
        report({
          observedEvents: [
            { kind: 'network-attempt', destination: 'evil.example', stepIndex: netStep },
            { kind: 'secret-read', path: '.env', stepIndex: 1 },
          ],
        }),
        set(egressWard(['.env'], [])),
      );
    expect(run(0).violations).toEqual([]);
    const same = run(1);
    expect(same.violations).toHaveLength(1);
    expect(same.violations[0]?.reason).toBe(
      'network attempt to evil.example at step 1 after secret read at step 1; host not in allow_hosts',
    );
  });
});

describe('wards refined examples (task 4.13): content inspection', () => {
  const SECRET = 'sk-CANARY-abc123';
  const enc = (s: string) => new TextEncoder().encode(s);
  const ward = set(egressWard(['.env'], ['registry.example.test']));
  const events = [
    { kind: 'secret-read' as const, path: '.env', stepIndex: 0 },
    { kind: 'network-attempt' as const, destination: 'https://registry.example.test/x', stepIndex: 1, eventId: 'ev-1' },
  ];
  const run = (payload: string, evs: typeof events = events) =>
    WardEngine.evaluate(report({ observedEvents: evs }), ward, {
      secretValues: new Map([['.env', enc(`API_KEY=${SECRET}\n`)]]),
      payloads: new Map([['ev-1', enc(payload)]]),
    });

  it.each([
    ['raw', `token=${SECRET}`],
    // No '+' or '/' in this value, so base64 and base64url spellings coincide.
    ['base64, base64url', Buffer.from(SECRET).toString('base64')],
    ['hex', Buffer.from(SECRET).toString('hex')],
    ['percent', encodeURIComponent(SECRET).replace(/-/g, '%2D')],
  ])('a %s hit blocks even though the host is allowed', (kind, payload) => {
    const v = run(payload);
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]?.reason).toBe(
      `payload of event ev-1 contains a value from secret file .env (encoding: ${kind})`,
    );
    const json = JSON.stringify(v);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(Buffer.from(SECRET).toString('base64'));
  });

  it('a content hit needs no secret-read event', () => {
    const v = run(`x=${SECRET}`, [events[1]!]);
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
  });

  it('an unrelated payload on an allowed host stays warn', () => {
    const v = run('hello world, nothing secret here');
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
  });

  it('adds a content-inspection notice when a secret was read but no secret values were given', () => {
    const v = WardEngine.evaluate(report({ observedEvents: events }), ward, { secretValues: new Map() });
    expect(v.verdict).toBe('warn');
    const n = v.notices.filter((x) => x.kind === 'content-inspection');
    expect(n).toHaveLength(1);
    expect(n[0]?.reason).toBe('content inspection did not run for ward e: no secret values were provided');
  });

  it('adds a content-inspection notice for a secret value that is too short to inspect', () => {
    const v = WardEngine.evaluate(report({ observedEvents: events }), ward, {
      secretValues: new Map([['.env', enc('KEY=short')]]),
      payloads: new Map([['ev-1', enc('nothing')]]),
    });
    const n = v.notices.filter((x) => x.kind === 'content-inspection');
    expect(n).toHaveLength(1);
    expect(n[0]?.reason).toContain('shorter than 8 bytes');
    expect(JSON.stringify(v)).not.toContain('short"');
  });
});

describe('wards refined examples (task 4.13): warn message with notices only', () => {
  const FIRST = 'observed secret-read (.env) at step 0';
  const warnVerdict = () =>
    WardEngine.evaluate(
      report({
        observedEvents: [
          { kind: 'secret-read', path: '.env', stepIndex: 0 },
          { kind: 'network-attempt', destination: 'https://registry.example.test/pkg', stepIndex: 1 },
        ],
      }),
      set(egressWard(['.env'], ['registry.example.test'])),
    );
  const warnTemplate = (k: number, first: string) =>
    `GHOST RUN NEEDS HUMAN APPROVAL: ${k} notice(s) outside the copy or needing review. First: ${first}.`;

  it('renders the warn template for an allowed host after a secret read', () => {
    const v = warnVerdict();
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
    expect(renderMessage(v, { wardCount: 1 })).toBe(warnTemplate(2, FIRST));
  });

  it('renders the warn template for an effect-outside notice, which sorts first', () => {
    const v = WardEngine.evaluate(
      report({
        effectsOutside: [[{ kind: 'network', destination: 'api.example.test' }]],
        observedEvents: [{ kind: 'secret-read', path: '.env', stepIndex: 0 }],
      }),
      set(egressWard(['.env'], [])),
    );
    expect(v.verdict).toBe('warn');
    expect(v.notices[0]?.kind).toBe('effect-outside');
    expect(renderMessage(v, { wardCount: 1 })).toBe(warnTemplate(2, v.notices[0]!.reason));
  });

  it('adds no claim line when claims is omitted or both claims hold', () => {
    const v = warnVerdict();
    expect(renderMessage(v, { wardCount: 1 }).split('\n')).toHaveLength(1);
    expect(renderMessage(v, { wardCount: 1, claims: { p5: true, p6: true } })).toBe(warnTemplate(2, FIRST));
  });

  it('appends the lowered-claim line for each reason when a claim is false', () => {
    const v = warnVerdict();
    for (const claims of [
      { p5: false, p6: true },
      { p5: true, p6: false },
      { p5: false, p6: false },
    ]) {
      expect(renderMessage(v, { wardCount: 1, claims })).toBe(`${warnTemplate(2, FIRST)}\n${CLAIM_LOWERED_LINE}`);
      expect(renderMessage(v, { wardCount: 1, claims: { ...claims, reason: 'static-analysis' } })).toBe(
        `${warnTemplate(2, FIRST)}\n${CLAIM_LOWERED_LINE}`,
      );
      expect(renderMessage(v, { wardCount: 1, claims: { ...claims, reason: 'unsupported-step' } })).toBe(
        `${warnTemplate(2, FIRST)}\n${CLAIM_LOWERED_UNSUPPORTED_STEP_LINE}`,
      );
    }
  });

  it('appends the seance link to the last line, after the claim line when present', () => {
    const v = warnVerdict();
    const seance = { id: '42' };
    expect(renderMessage(v, { wardCount: 1, seance })).toBe(
      `${warnTemplate(2, FIRST)} Seance: http://localhost:5317/seance/42`,
    );
    expect(renderMessage(v, { wardCount: 1, seance, claims: { p5: false, p6: false } })).toBe(
      `${warnTemplate(2, FIRST)}\n${CLAIM_LOWERED_LINE} Seance: http://localhost:5317/seance/42`,
    );
  });
});

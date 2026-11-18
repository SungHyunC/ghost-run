// Task 4.2: path and SQL judgment, notices, sanitization, physics hard failures.
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4, 17.3, 17.8, 15.1**

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WardEngine, isMoreRestrictive } from '../src/index.js';
import type { GhostReport, VariantResult, Ward, WardSet } from '../src/index.js';
import { NUM_RUNS } from './pbt-config.js';

const set = (...wards: Ward[]): WardSet => ({ wards });

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

const pathWard = (paths: string[], extra: Partial<Extract<Ward, { kind: 'path' }>> = {}): Ward => ({
  id: 'p',
  kind: 'path',
  deny: ['delete', 'overwrite'],
  paths,
  ...extra,
});

describe('path ward judgment', () => {
  it('matches globs and normalized spellings, case-insensitively by default', () => {
    const w = set(pathWard(['data/**', 'db/*.sqlite']));
    const r = report({
      changes: [
        [{ kind: 'file-deleted', path: './data/../DATA/x' }],
        [{ kind: 'file-overwritten', path: 'db/main.sqlite' }],
        [{ kind: 'file-deleted', path: 'other/x' }],
      ],
    });
    const v = WardEngine.evaluate(r, w);
    expect(v.verdict).toBe('block');
    expect(v.violations.map((x) => x.reason)).toEqual([
      'would delete protected path ./data/../DATA/x',
      'would overwrite protected path db/main.sqlite',
    ]);
  });

  it('respects case_sensitive: true', () => {
    const r = report({ changes: [[{ kind: 'file-deleted', path: 'DATA/x' }]] });
    expect(WardEngine.evaluate(r, set(pathWard(['data/x']))).verdict).toBe('block');
    expect(WardEngine.evaluate(r, set(pathWard(['data/x'], { case_sensitive: true }))).verdict).toBe('pass');
  });

  it('de-duplicates by (ward, path, operation), ignores file-created and malformed changes', () => {
    const r = report({
      changes: [
        [{ kind: 'file-deleted', path: 'a/x' }, { kind: 'file-deleted', path: 'a//x' }],
        [{ kind: 'file-created', path: 'a/y' }, { kind: 'file-deleted' }, { kind: 'file-deleted', path: 7 }],
      ],
    });
    const v = WardEngine.evaluate(r, set(pathWard(['a'])));
    expect(v.violations).toHaveLength(1);
  });

  it('sorts violations by normalized path then operation', () => {
    const r = report({
      changes: [
        [{ kind: 'file-overwritten', path: 'a/b' }, { kind: 'file-deleted', path: 'a/b' }, { kind: 'file-deleted', path: 'a/a' }],
      ],
    });
    const v = WardEngine.evaluate(r, set(pathWard(['a'])));
    expect(v.violations.map((x) => x.reason)).toEqual([
      'would delete protected path a/a',
      'would delete protected path a/b',
      'would overwrite protected path a/b',
    ]);
  });

  it('escaping paths match no ward and add one path-escape notice per path', () => {
    const r = report({
      changes: [
        [{ kind: 'file-deleted', path: '../data/x' }],
        [{ kind: 'file-deleted', path: '../data/x' }],
      ],
    });
    const v = WardEngine.evaluate(r, set(pathWard(['**'])));
    expect(v.violations).toEqual([]);
    expect(v.verdict).toBe('warn');
    expect(v.notices).toEqual([
      {
        kind: 'path-escape',
        reason: 'change path escapes the copy root: ../data/x',
        stepIndex: 0,
        path: '../data/x',
      },
    ]);
    // No path ward: no notice.
    expect(WardEngine.evaluate(r, set()).notices).toEqual([]);
  });

  it('caps path-escape notices at 20', () => {
    const changes = Array.from({ length: 30 }, (_, i) => ({ kind: 'file-deleted', path: `../p${i}` }));
    const v = WardEngine.evaluate(report({ changes: [changes] }), set(pathWard(['a'])));
    expect(v.notices.filter((n) => n.kind === 'path-escape')).toHaveLength(20);
  });

  it('sanitizes hidden characters in displayed paths', () => {
    const r = report({ changes: [[{ kind: 'file-deleted', path: 'a/x\u202Ey' }]] });
    const v = WardEngine.evaluate(r, set(pathWard(['a'])));
    expect(v.violations[0]?.reason).toBe('would delete protected path a/x\\u{202E}y');
  });
});

describe('sql ward judgment', () => {
  const sql = (tables: string[], max: number): Ward => ({ id: 's', kind: 'sql', tables, max_rows_lost: max });
  const row = (table: string, before: number, after: number, dropped?: boolean) => ({
    kind: 'sql-row-count',
    table,
    rowsBefore: before,
    rowsAfter: after,
    ...(dropped === undefined ? {} : { dropped }),
  });

  it('scenario 1 reason is exact', () => {
    const v = WardEngine.evaluate(
      report({ changes: [[row('users', 1206, 0)]] }),
      set(sql(['users', 'orders'], 0)),
    );
    expect(v.violations[0]?.reason).toBe('would delete 1,206 rows from users');
  });

  it('joins several tables in lower-case order with the ward spelling and the max suffix', () => {
    const v = WardEngine.evaluate(
      report({ changes: [[row('ORDERS', 5, 0)], [row('Users', 1000, 0), row('users', 300, 0)]] }),
      set(sql(['Users', 'orders'], 10)),
    );
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]?.reason).toBe('would delete 5 rows from orders, 1,300 rows from Users (max allowed 10)');
  });

  it('passes at or below the limit and ignores malformed or unrelated changes', () => {
    const r = report({
      changes: [
        [
          row('users', 10, 0),
          row('other', 99, 0),
          { kind: 'sql-row-count', table: 'users', rowsBefore: '9', rowsAfter: 0 },
          { kind: 'sql-row-count', table: 'users', rowsBefore: Number.NaN, rowsAfter: 0 },
          row('users', 1, 5),
        ],
      ],
    });
    expect(WardEngine.evaluate(r, set(sql(['users'], 10))).verdict).toBe('pass');
    expect(WardEngine.evaluate(r, set(sql(['users'], 9))).verdict).toBe('block');
  });

  it('counts a dropped table as all rows lost even with a non-zero rowsAfter', () => {
    const v = WardEngine.evaluate(report({ changes: [[row('users', 50, 40, true)]] }), set(sql(['users'], 10)));
    expect(v.violations[0]?.reason).toBe('would delete 50 rows from users (max allowed 10)');
  });
});

describe('notices', () => {
  it('orders effect-outside, observed-event, then path-escape; redacts destinations', () => {
    const r = report({
      effectsOutside: [[], [{ kind: 'network', destination: 'https://user:pw@api.example:8443/x?q=1' }]],
      observedEvents: [
        { kind: 'network-attempt', destination: 'https://b.example/p', stepIndex: 3 },
        { kind: 'secret-read', path: 'a/.env', stepIndex: 1 },
        { kind: 'network-attempt', destination: 'a.example', stepIndex: 3 },
      ],
      changes: [[{ kind: 'file-deleted', path: '../x' }]],
    });
    const v = WardEngine.evaluate(r, set(pathWard(['a'])));
    expect(v.notices.map((n) => n.kind)).toEqual([
      'effect-outside',
      'observed-event',
      'observed-event',
      'observed-event',
      'path-escape',
    ]);
    expect(v.notices[0]?.destination).toBe('api.example:8443');
    expect(v.notices[0]?.reason).toBe('step 1 has side effect outside the copy: network to api.example:8443');
    expect(v.notices.slice(1, 4).map((n) => n.reason)).toEqual([
      'observed secret-read (a/.env) at step 1',
      'observed network-attempt (a.example) at step 3',
      'observed network-attempt (b.example) at step 3',
    ]);
  });

  it('sanitizes hidden characters in notice paths and reasons', () => {
    const v = WardEngine.evaluate(
      report({ observedEvents: [{ kind: 'secret-read', path: 'a\u200Bb\n', stepIndex: 0 }] }),
      set(),
    );
    expect(v.notices[0]?.path).toBe('a\\u{200B}b\\u{A}');
    expect(v.notices[0]?.reason).toBe('observed secret-read (a\\u{200B}b\\u{A}) at step 0');
  });
});

describe('physics hard failures', () => {
  const phys = (rate: number, force: number, contacts: string[]): Ward => ({
    id: 'ph',
    kind: 'physics',
    min_success_rate: rate,
    max_contact_force_n: force,
    forbidden_contacts: contacts,
  });

  it('blocks on jointLimitExceeded even at 100% success and rate 0', () => {
    const v = WardEngine.evaluate(
      report({ variantResults: [{ variantId: 'v1', success: true, jointLimitExceeded: true }] }),
      set(phys(0, 1e9, [])),
    );
    expect(v.verdict).toBe('block');
    expect(v.violations.map((x) => x.reason)).toEqual(['joint limit exceeded in variant v1']);
  });

  it('blocks on selfCollisionOccurred with the fixed wording and a sanitized id', () => {
    const v = WardEngine.evaluate(
      report({ variantResults: [{ variantId: 'v\u200B2', success: true, selfCollisionOccurred: true }] }),
      set(phys(0, 1e9, [])),
    );
    expect(v.violations.map((x) => x.reason)).toEqual(['self-collision occurred in variant v\\u{200B}2']);
  });

  it('false or absent flags add nothing', () => {
    const v = WardEngine.evaluate(
      report({
        variantResults: [
          { variantId: 'v1', success: true, jointLimitExceeded: false, selfCollisionOccurred: false },
        ],
      }),
      set(phys(1, 10, [])),
    );
    expect(v.verdict).toBe('pass');
  });

  it('P4: with flags present, a stricter physics ward never turns block into pass', () => {
    const variant: fc.Arbitrary<VariantResult> = fc.record({
      variantId: fc.constantFrom('a', 'b', 'c', 'd'),
      success: fc.boolean(),
      contactForceN: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
      forbiddenContactOccurred: fc.option(fc.boolean(), { nil: undefined }),
      jointLimitExceeded: fc.option(fc.boolean(), { nil: undefined }),
      selfCollisionOccurred: fc.option(fc.boolean(), { nil: undefined }),
    });
    const wardArb = fc.record({
      rate: fc.integer({ min: 0, max: 10 }).map((n) => n / 10),
      force: fc.integer({ min: 0, max: 50 }),
      contacts: fc.subarray(['table', 'wall']),
    });
    fc.assert(
      fc.property(
        fc.array(variant, { minLength: 1, maxLength: 6 }),
        wardArb,
        wardArb,
        (variantResults, a, b) => {
          const w1 = set(phys(a.rate, a.force, a.contacts));
          const w2 = set(phys(b.rate, b.force, b.contacts));
          if (!isMoreRestrictive(w1, w2)) return;
          const r = report({ variantResults });
          const rank = { pass: 0, warn: 1, block: 2 } as const;
          expect(rank[WardEngine.evaluate(r, w2).verdict]).toBeGreaterThanOrEqual(
            rank[WardEngine.evaluate(r, w1).verdict],
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('isMoreRestrictive semantics are unchanged by the new flags', () => {
    expect(isMoreRestrictive(set(phys(0.5, 10, ['t'])), set(phys(0.8, 10, ['t'])))).toBe(true);
    expect(isMoreRestrictive(set(phys(0.5, 10, ['t'])), set(phys(0.5, 10, ['t'])))).toBe(false);
    expect(isMoreRestrictive(set(phys(0.8, 10, ['t'])), set(phys(0.5, 10, ['t'])))).toBe(false);
  });
});

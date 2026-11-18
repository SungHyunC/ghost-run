// Task 4.8: SQL row-loss accounting.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/index.js';
import type { Change, GhostReport, Ward, WardSet } from '../src/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

type SqlWard = Extract<Ward, { kind: 'sql' }>;

function report(changes: Change[][]): GhostReport<unknown> {
  return { snapshots: [], changes, effectsOutside: [], observedEvents: [], variantResults: [] };
}
const sqlSet = (w: SqlWard): WardSet => ({ wards: [w] });
const row = (table: string, rowsBefore: number, rowsAfter: number, dropped?: boolean): Change =>
  dropped === undefined
    ? { kind: 'sql-row-count', table, rowsBefore, rowsAfter }
    : { kind: 'sql-row-count', table, rowsBefore, rowsAfter, dropped };

// --- independent oracle -----------------------------------------------------
const lower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const group = (n: number): string => {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
};
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function oracle(w: SqlWard, steps: Change[][]): { violated: boolean; reason?: string } {
  const spelling = new Map<string, string>();
  for (const t of w.tables) if (!spelling.has(lower(t))) spelling.set(lower(t), t);
  const lost = new Map<string, number>();
  let total = 0;
  for (const step of steps)
    for (const c of step) {
      if (c.kind !== 'sql-row-count') continue;
      const t = c['table'];
      const b = c['rowsBefore'];
      const a = c['rowsAfter'];
      if (typeof t !== 'string' || !isNum(b) || !isNum(a)) continue;
      const k = lower(t);
      if (!spelling.has(k)) continue;
      const n = c['dropped'] === true ? Math.max(0, b) : Math.max(0, b - a);
      lost.set(k, (lost.get(k) ?? 0) + n);
      total += n;
    }
  if (total <= w.max_rows_lost) return { violated: false };
  const keys = [...lost.entries()].filter(([, n]) => n > 0).map(([k]) => k);
  keys.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const body = keys.map((k) => `${group(lost.get(k) as number)} rows from ${spelling.get(k)}`).join(', ');
  const max = w.max_rows_lost > 0 ? ` (max allowed ${group(w.max_rows_lost)})` : '';
  return { violated: true, reason: `would delete ${body}${max}` };
}

// --- generators -------------------------------------------------------------
const BASES = ['users', 'orders', 'items', 'audit_log', 'x1'];
const caseArb = (s: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: s.length, maxLength: s.length })
    .map((bits) => [...s].map((ch, i) => (bits[i] ? ch.toUpperCase() : ch)).join(''));
const tableArb = fc.constantFrom(...BASES, 'other', 'ZZ').chain(caseArb);
const countArb = fc.integer({ min: -50, max: 3_000_000 });

const changeArb: fc.Arbitrary<Change> = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(tableArb, countArb, countArb).map(([t, b, a]) => row(t, b, a)) },
  {
    weight: 3,
    arbitrary: fc
      .tuple(tableArb, countArb, fc.constantFrom(0, 5))
      .map(([t, b, a]) => row(t, b, a, true)),
  },
  {
    weight: 1,
    arbitrary: fc.tuple(tableArb, countArb, countArb).map(([t, b, a]) => row(t, b, a, false)),
  },
  // malformed: wrong types, missing fields, non-finite numbers
  {
    weight: 2,
    arbitrary: fc.oneof(
      tableArb.map((t): Change => ({ kind: 'sql-row-count', table: t, rowsBefore: '9999999', rowsAfter: 0 })),
      tableArb.map((t): Change => ({ kind: 'sql-row-count', table: t, rowsBefore: 9_999_999 })),
      tableArb.map((t): Change => ({ kind: 'sql-row-count', table: t, rowsAfter: 0 })),
      tableArb.map((t): Change => ({ kind: 'sql-row-count', table: t, rowsBefore: Infinity, rowsAfter: 0 })),
      tableArb.map((t): Change => ({ kind: 'sql-row-count', table: t, rowsBefore: 9_999_999, rowsAfter: NaN })),
      fc.integer({ min: 1, max: 99999 }).map((n): Change => ({ kind: 'sql-row-count', table: n, rowsBefore: 9_999_999, rowsAfter: 0 })),
      fc.integer({ min: 1, max: 99999 }).map((n): Change => ({ kind: 'sql-row-count', rowsBefore: n, rowsAfter: 0 })),
    ),
  },
  // unrelated change kinds
  { weight: 1, arbitrary: tableArb.map((t): Change => ({ kind: 'file-deleted', path: `/${t}` })) },
);

const stepsArb = fc.array(fc.array(changeArb, { maxLength: 6 }), { maxLength: 6 });

const wardArb: fc.Arbitrary<SqlWard> = fc
  .tuple(
    fc.array(fc.constantFrom(...BASES, 'other', 'ZZ').chain(caseArb), { minLength: 1, maxLength: 5 }),
    fc.oneof(
      { weight: 3, arbitrary: fc.constant(0) },
      { weight: 3, arbitrary: fc.integer({ min: 1, max: 5000 }) },
      { weight: 1, arbitrary: fc.integer({ min: 1000, max: 10_000_000 }) },
    ),
  )
  .map(([tables, max]) => ({ id: 'sql-w', kind: 'sql' as const, tables, max_rows_lost: max }));

function sqlViolations(w: SqlWard, steps: Change[][]) {
  const v = WardEngine.evaluate(report(steps), sqlSet(w));
  return { v, own: v.violations.filter((x) => x.wardId === 'sql-w') };
}

function shuffleStepsArb(steps: Change[][]): fc.Arbitrary<Change[][]> {
  return fc
    .tuple(
      ...steps.map((s) => fc.shuffledSubarray(s, { minLength: s.length, maxLength: s.length })),
    )
    .chain((inner) => {
      const arr = inner as Change[][];
      return fc
        .shuffledSubarray(arr, { minLength: arr.length, maxLength: arr.length })
        .map((x) => x as Change[][]);
    });
}

describe('Property 7: SQL row-loss accounting', () => {
  // Feature: wards, Property 7: SQL row-loss accounting
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6**
  it(
    'violation exists exactly when summed loss exceeds max_rows_lost, with the specified reason',
    () => {
      fc.assert(
        fc.property(wardArb, stepsArb, (w, steps) => {
          const exp = oracle(w, steps);
          const { v, own } = sqlViolations(w, steps);
          if (!exp.violated) {
            expect(own).toEqual([]);
            expect(v.verdict).toBe('pass');
          } else {
            expect(own).toHaveLength(1);
            expect(own[0]?.reason).toBe(exp.reason);
            expect(v.verdict).toBe('block');
            expect(exp.reason?.startsWith('would delete ')).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 7: SQL row-loss accounting (order independence)
  // **Validates: Requirements 6.2, 6.3, 6.5**
  it(
    'result does not depend on the order of the changes or steps',
    () => {
      fc.assert(
        fc.property(
          wardArb,
          stepsArb.chain((s) => shuffleStepsArb(s).map((t) => [s, t] as const)),
          (w, [a, b]) => {
            expect(sqlViolations(w, b).own.map((x) => x.reason)).toEqual(
              sqlViolations(w, a).own.map((x) => x.reason),
            );
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 7: SQL row-loss accounting (no per-file scope)
  // **Validates: Requirements 6.5**
  it(
    'splitting the same changes across any number of steps gives the same reason',
    () => {
      fc.assert(
        fc.property(wardArb, fc.array(changeArb, { maxLength: 12 }), fc.integer({ min: 1, max: 4 }), (w, cs, k) => {
          const one = sqlViolations(w, [cs]).own.map((x) => x.reason);
          const many: Change[][] = Array.from({ length: k }, () => []);
          cs.forEach((c, i) => many[i % k]?.push(c));
          expect(sqlViolations(w, many).own.map((x) => x.reason)).toEqual(one);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  describe('examples', () => {
    it('1,206 rows lost against max_rows_lost: 0 blocks with the exact reason (6.4)', () => {
      const w: SqlWard = { id: 'sql-w', kind: 'sql', tables: ['users', 'orders'], max_rows_lost: 0 };
      const { v, own } = sqlViolations(w, [[row('users', 1206, 0, true)]]);
      expect(v.verdict).toBe('block');
      expect(own.map((x) => x.reason)).toEqual(['would delete 1,206 rows from users']);
      const v2 = sqlViolations(w, [[row('USERS', 1206, 0)]]);
      expect(v2.own.map((x) => x.reason)).toEqual(['would delete 1,206 rows from users']);
    });

    it('multi-table reason joins phrases with ", " in ascending lower-case order, ward spelling (D18)', () => {
      const w: SqlWard = { id: 'sql-w', kind: 'sql', tables: ['Users', 'ORDERS'], max_rows_lost: 0 };
      const { own } = sqlViolations(w, [
        [row('users', 1206, 0, true), row('other', 10, 0)],
        [row('Orders', 3000, 1000)],
      ]);
      expect(own.map((x) => x.reason)).toEqual([
        'would delete 2,000 rows from ORDERS, 1,206 rows from Users',
      ]);
    });

    it('appends (max allowed m) only when max_rows_lost > 0; equal to the limit passes', () => {
      const w: SqlWard = { id: 'sql-w', kind: 'sql', tables: ['users'], max_rows_lost: 1000 };
      expect(sqlViolations(w, [[row('users', 1000, 0)]]).own).toEqual([]);
      expect(sqlViolations(w, [[row('users', 1206, 0)]]).own.map((x) => x.reason)).toEqual([
        'would delete 1,206 rows from users (max allowed 1,000)',
      ]);
    });

    it('ignores malformed changes and gains (rowsAfter > rowsBefore)', () => {
      const w: SqlWard = { id: 'sql-w', kind: 'sql', tables: ['users'], max_rows_lost: 0 };
      const bad: Change[] = [
        { kind: 'sql-row-count', table: 'users', rowsBefore: '5', rowsAfter: 0 },
        { kind: 'sql-row-count', table: 'users', rowsBefore: 5 },
        row('users', 0, 50),
      ];
      expect(sqlViolations(w, [bad]).own).toEqual([]);
    });
  });
});

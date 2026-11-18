// Feature: ui-kit, Property 1: Change coverage (model leg, V leg only; the S leg is task 8.1)
// **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 5.8, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { buildMirrorModel } from '../../src/model/mirror';
import type { ChangeRowModel, MirrorModel } from '../../src/model/mirror';
import { change, unknownChange } from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Generators (counts and elements are local; paths and tables come from fixtures)
// ---------------------------------------------------------------------------

const validCount: fc.Arbitrary<unknown> = fc.oneof(
  fc.nat({ max: 5000 }),
  fc.constantFrom(0, 1, 1206, 999, 1000, 1e21, Number.MAX_SAFE_INTEGER),
);
const badCount: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(-1, -5, 1.5, 0.1, Number.NaN, Infinity, -Infinity, '12', 'many', '', null, undefined, true),
  fc.integer({ min: -10_000, max: -1 }),
  fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true, min: 0, max: 100 }),
  fc.string({ maxLength: 6 }),
);
const anyCount: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: validCount },
  { weight: 2, arbitrary: badCount },
);

/** A sql-row-count change with arbitrary count values and an arbitrary `dropped` field. */
const sqlChange: fc.Arbitrary<Rec> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
    anyCount,
    anyCount,
    fc.constantFrom<unknown>(true, false, undefined, 'yes', 1),
  )
  .map(([table, rowsBefore, rowsAfter, dropped]) => {
    const out: Rec = { kind: 'sql-row-count', table, rowsBefore, rowsAfter };
    if (dropped !== undefined) out['dropped'] = dropped;
    return out;
  });

/** Pairs where rows are lost with large and small numbers (guarantees the `rows lost` branch). */
const lostSql: fc.Arbitrary<Rec> = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/), fc.nat({ max: 100_000 }), fc.nat({ max: 100_000 }))
  .map(([table, a, b]) => ({
    kind: 'sql-row-count',
    table,
    rowsBefore: Math.max(a, b) + 1,
    rowsAfter: Math.min(a, b),
  }));

const nonRecord: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.string({ maxLength: 8 }),
  fc.boolean(),
  fc.array(fc.integer(), { maxLength: 3 }),
);

const element: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 5, arbitrary: change as fc.Arbitrary<unknown> },
  { weight: 3, arbitrary: sqlChange },
  { weight: 1, arbitrary: lostSql },
  { weight: 2, arbitrary: unknownChange as fc.Arbitrary<unknown> },
  { weight: 2, arbitrary: nonRecord },
);

const smallSteps: fc.Arbitrary<unknown[]> = fc.array(
  fc.oneof({ weight: 6, arbitrary: fc.array(element, { maxLength: 8 }) }, { weight: 1, arbitrary: fc.constant([]) }),
  { maxLength: 6 },
);
/** 8 to 12 steps of 25 to 30 elements: more than 200 rows in most cases. */
const bigSteps: fc.Arbitrary<unknown[]> = fc.array(fc.array(element, { minLength: 25, maxLength: 30 }), {
  minLength: 8,
  maxLength: 12,
});
const brokenSteps: fc.Arbitrary<unknown[]> = fc
  .tuple(smallSteps, fc.array(fc.tuple(fc.nat(), fc.constantFrom<unknown>(null, 5, 'step', {})), { maxLength: 2 }))
  .map(([steps, bad]) => {
    const out = [...steps];
    for (const [at, value] of bad) out.splice(at % (out.length + 1), 0, value);
    return out;
  });

const stepsArb: fc.Arbitrary<unknown[]> = fc.oneof(
  { weight: 5, arbitrary: smallSteps },
  { weight: 2, arbitrary: bigSteps },
  { weight: 1, arbitrary: brokenSteps },
);

const labelsArb: fc.Arbitrary<unknown[] | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.array(fc.oneof(fc.stringMatching(/^[a-z][a-z ]{0,19}$/), fc.constantFrom<unknown>(7, null, {})), {
    maxLength: 14,
  }),
);

// ---------------------------------------------------------------------------
// Independent oracle
// ---------------------------------------------------------------------------

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const grouped = (n: bigint): string => n.toLocaleString('en-US');

function expectedKind(el: unknown): string {
  if (!isRec(el)) return 'unreadable';
  const k = el['kind'];
  if (
    (k === 'file-created' || k === 'file-overwritten' || k === 'file-deleted' || k === 'symlink-changed') &&
    typeof el['path'] === 'string'
  ) {
    return k;
  }
  if (k === 'sql-row-count' && typeof el['table'] === 'string') return k;
  return 'unrecognized';
}

function rowsText(row: ChangeRowModel, side: 'reality' | 'mirror'): string | undefined {
  return row[side].items.find((i) => i.label === 'rows')?.text;
}

function checkSql(el: Rec, row: ChangeRowModel, counter: ReturnType<typeof createCounter>): void {
  const before = el['rowsBefore'];
  const after = el['rowsAfter'];
  const sides: [unknown, 'reality' | 'mirror'][] = [
    [before, 'reality'],
    [after, 'mirror'],
  ];
  for (const [v, side] of sides) {
    const text = rowsText(row, side);
    if (isCount(v)) expect(text).toBe(grouped(BigInt(v)));
    else expect(text?.startsWith('invalid number')).toBe(true);
  }
  const lostLabels = row.extraLabels.filter((l) => l.startsWith('rows lost'));
  if (isCount(before) && isCount(after) && before > after) {
    counter.add('count-lost');
    expect(lostLabels).toEqual([`rows lost: ${grouped(BigInt(before) - BigInt(after))}`]);
    expect(row.vanish).toBe(true);
    expect(row.mirror.state.text).toBe('rows lost');
  } else {
    counter.add(isCount(before) && isCount(after) ? 'count-valid' : 'count-invalid');
    expect(lostLabels).toEqual([]);
    expect(row.vanish).toBe(false);
  }
  expect(row.extraLabels.includes('table dropped')).toBe(el['dropped'] === true);
}

function check(
  steps: unknown[],
  labels: unknown[] | undefined,
  model: MirrorModel,
  elements: ReturnType<typeof createCounter>,
  runs: ReturnType<typeof createCounter>,
): void {
  let total = 0;
  expect(model.steps).toHaveLength(steps.length);
  steps.forEach((step, s) => {
    const sm = model.steps[s];
    expect(sm?.stepIndex).toBe(s);
    const label = labels?.[s];
    expect(sm?.label).toBe(typeof label === 'string' ? label : undefined);
    if (!Array.isArray(step)) {
      expect(sm?.unreadable).toBe(true);
      expect(sm?.rows).toEqual([]);
      return;
    }
    expect(sm?.unreadable).toBe(false);
    if (step.length === 0) runs.add('empty-step');
    expect(sm?.rows).toHaveLength(step.length);
    step.forEach((el, i) => {
      const row = sm?.rows[i] as ChangeRowModel;
      total += 1;
      expect(row.key).toBe(`${s}.${i}`);
      expect(row.stepIndex).toBe(s);
      expect(row.index).toBe(i);
      const kind = expectedKind(el);
      expect(row.kind).toBe(kind);
      elements.add(kind);
      if (kind === 'unreadable') expect(row.reality.items[0]?.text).toBe(`Unreadable item ${i}`);
      if (kind === 'unrecognized') expect(row.extraLabels).toEqual(['unrecognized change']);
      if (kind === 'sql-row-count') checkSql(el as Rec, row, elements);
    });
  });
  expect(model.totalRows).toBe(total);
  expect(model.stepCount).toBe(steps.length);
  expect(model.summary).toBe(`${total} changes in ${steps.length} steps`);
  expect(model.shownRows).toBe(Math.min(total, 200));
  expect(model.emptyText === null).toBe(total !== 0);
  // Keys over the flat order are unique.
  const keys = model.steps.flatMap((x) => x.rows.map((r) => r.key));
  expect(new Set(keys).size).toBe(keys.length);
  runs.add(total > 200 ? 'over-200' : total === 0 ? 'zero-rows' : 'within-200');
}

describe('UI-P1 change coverage (model leg)', () => {
  it('UI-P1: one row per element, counts, summary, labels, and the rows lost rule', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const elements = createCounter('UI-P1 elements');
    const runs = createCounter('UI-P1 runs');
    fc.assert(
      fc.property(stepsArb, labelsArb, (steps, labels) => {
        const input: Rec = { changes: steps };
        if (labels !== undefined) input['stepLabels'] = labels;
        const model = buildMirrorModel(input);
        if (model.kind !== 'ok') throw new Error('expected an ok model');
        check(steps, labels, model, elements, runs);
      }),
      params('full'),
    );
    elements.print();
    runs.print();
    assertBucketsHit(elements, [
      'file-created',
      'file-overwritten',
      'file-deleted',
      'symlink-changed',
      'sql-row-count',
      'unrecognized',
      'unreadable',
      'count-valid',
      'count-invalid',
      'count-lost',
    ]);
    assertBucketsHit(runs, ['empty-step', 'over-200', 'within-200']);
  }, PBT_TIMEOUT);

  it('UI-P1: examples (grouped numbers, rows lost, invalid numbers, 200-row limit)', () => {
    const lost = buildMirrorModel({
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 1206, rowsAfter: 0 }]],
    });
    expect(lost.kind).toBe('ok');
    if (lost.kind === 'ok') {
      const row = lost.steps[0]?.rows[0];
      expect(row?.extraLabels).toEqual(['rows lost: 1,206']);
      expect(rowsText(row as ChangeRowModel, 'reality')).toBe('1,206');
      expect(lost.summary).toBe('1 changes in 1 steps');
    }
    const bad = buildMirrorModel({
      changes: [[{ kind: 'sql-row-count', table: 't', rowsBefore: Number.NaN, rowsAfter: -1 }]],
    });
    if (bad.kind === 'ok') {
      const row = bad.steps[0]?.rows[0] as ChangeRowModel;
      expect(row.extraLabels).toEqual([]);
      expect(rowsText(row, 'reality')?.startsWith('invalid number')).toBe(true);
    }
    const many = buildMirrorModel({
      changes: ([Array.from({ length: 30 }, () => 7), Array.from({ length: 30 }, () => 7)] as unknown[]).concat(
        Array.from({ length: 6 }, () => Array.from({ length: 30 }, () => ({ kind: 'file-created', path: '/work/a' }))),
      ),
    });
    if (many.kind === 'ok') {
      expect(many.totalRows).toBe(240);
      expect(many.shownRows).toBe(200);
    }
  });
});

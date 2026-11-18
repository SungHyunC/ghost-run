// Feature: ui-kit, Property 1: Change coverage (static leg, S leg)
// **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 5.8, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { MirrorWorldView } from '../../src/components/MirrorWorld';
import { buildMirrorModel } from '../../src/model/mirror';
import { change, unknownChange } from '../fixtures/arbitraries';
import { renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const validCount: fc.Arbitrary<unknown> = fc.oneof(
  fc.nat({ max: 5000 }),
  fc.constantFrom(0, 1, 1206, 999, 1000, 1e21, Number.MAX_SAFE_INTEGER),
);
const badCount: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(-1, -5, 1.5, Number.NaN, Infinity, -Infinity, '12', 'many', '', null, undefined, true),
  fc.integer({ min: -10_000, max: -1 }),
);
const anyCount: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: validCount },
  { weight: 2, arbitrary: badCount },
);

const sqlChange: fc.Arbitrary<Rec> = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), anyCount, anyCount)
  .map(([table, rowsBefore, rowsAfter]) => ({ kind: 'sql-row-count', table, rowsBefore, rowsAfter }));

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
  fc.integer(),
  fc.string({ maxLength: 8 }),
  fc.boolean(),
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
/** 8 to 12 steps of 25 to 30 elements: more than 200 rows. */
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
  fc.array(fc.oneof(fc.stringMatching(/^[a-z][a-z ]{0,19}$/), fc.constantFrom<unknown>(7, null)), { maxLength: 14 }),
);

// ---------------------------------------------------------------------------
// Independent oracle
// ---------------------------------------------------------------------------

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const grouped = (n: bigint): string => n.toLocaleString('en-US');

function renderView(model: ReturnType<typeof buildMirrorModel>, revealAll: boolean): string {
  if (model.kind !== 'ok') throw new Error('expected an ok model');
  return renderMarkup(
    <MirrorWorldView model={model} revealAll={revealAll} sceneOpen={false} sceneRevealAll={false} />,
  );
}

/** Row chunks keyed by their `data-change-row` value, in document order. */
function rowChunks(html: string): { key: string; chunk: string }[] {
  const out: { key: string; chunk: string }[] = [];
  const re = /<tr data-change-row="([^"]*)">(.*?)<\/tr>/gs;
  for (const m of html.matchAll(re)) out.push({ key: m[1] ?? '', chunk: m[2] ?? '' });
  return out;
}

/** Text of the `rows` item in the first (reality) or second (mirror) cell of a row chunk. */
function rowsValue(chunk: string, side: 'reality' | 'mirror'): string | undefined {
  const cells = chunk.split('</td>');
  const cell = cells[side === 'reality' ? 0 : 1] ?? '';
  return /<span>rows: <\/span><code class="gk-mono">([^<]*)<\/code>/.exec(cell)?.[1];
}

type Counter = ReturnType<typeof createCounter>;

function checkMarkup(
  steps: unknown[],
  labels: unknown[] | undefined,
  html: string,
  limited: boolean,
  total: number,
  counter: Counter,
): void {
  // Expected flat order of keys, in step and index order.
  const expectedKeys: string[] = [];
  const flat: unknown[] = [];
  steps.forEach((step, s) => {
    if (!Array.isArray(step)) return;
    step.forEach((el, i) => {
      expectedKeys.push(`${s}.${i}`);
      flat.push(el);
    });
  });
  const shown = limited ? Math.min(total, 200) : total;
  const chunks = rowChunks(html);
  expect(chunks.map((c) => c.key)).toEqual(expectedKeys.slice(0, shown));
  expect((html.match(/data-change-row=/g) ?? []).length).toBe(shown);

  // Summary.
  expect(html).toContain(`<span class="gk-mono">${total} changes in ${steps.length} steps</span>`);

  // Step lines, in order, with labels.
  const stepLines = [...html.matchAll(/<span class="gk-mono">step (\d+)<\/span>(?:<span> ([^<]*)<\/span>)?<\/th>/g)];
  expect(stepLines.map((m) => Number(m[1]))).toEqual(steps.map((_, s) => s));
  stepLines.forEach((m, s) => {
    const label = labels?.[s];
    expect(m[2]).toBe(typeof label === 'string' ? label : undefined);
  });

  // Per-row content.
  chunks.forEach(({ chunk }, n) => {
    const el = flat[n];
    if (!isRec(el) || el['kind'] !== 'sql-row-count' || typeof el['table'] !== 'string') return;
    const before = el['rowsBefore'];
    const after = el['rowsAfter'];
    for (const [v, side] of [
      [before, 'reality'],
      [after, 'mirror'],
    ] as const) {
      const text = rowsValue(chunk, side);
      if (isCount(v)) {
        expect(text).toBe(grouped(BigInt(v)));
        counter.add('grouped');
      } else {
        expect(text?.startsWith('invalid number')).toBe(true);
        counter.add('invalid-number');
      }
    }
    const lostLabels = [...chunk.matchAll(/<div class="gk-note">(rows lost[^<]*)<\/div>/g)].map((m) => m[1]);
    if (isCount(before) && isCount(after) && before > after) {
      counter.add('rows-lost');
      expect(lostLabels).toEqual([`rows lost: ${grouped(BigInt(before) - BigInt(after))}`]);
    } else {
      expect(lostLabels).toEqual([]);
    }
  });

  // The 200-row limit.
  if (limited && total > 200) {
    counter.add('limited');
    expect(html).toContain(`Showing 200 of ${total}`);
    expect(html).toContain(`aria-label="Show all ${total} rows"`);
  } else {
    expect(html).not.toContain('Showing ');
    expect(html).not.toContain('Show all');
  }
}

describe('UI-P1 change coverage (static leg)', () => {
  it('UI-P1: markup has one row per element, summary, step lines, numbers, and the 200-row limit', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P1 static');
    fc.assert(
      fc.property(stepsArb, labelsArb, (steps, labels) => {
        const input: Rec = { changes: steps };
        if (labels !== undefined) input['stepLabels'] = labels;
        const model = buildMirrorModel(input);
        if (model.kind !== 'ok') throw new Error('expected an ok model');
        const total = model.totalRows;
        // Independent total.
        const expectedTotal = steps.reduce<number>((n, s) => n + (Array.isArray(s) ? s.length : 0), 0);
        expect(total).toBe(expectedTotal);
        counter.add(total > 200 ? 'over-200' : 'within-200');
        checkMarkup(steps, labels, renderView(model, false), true, total, counter);
        checkMarkup(steps, labels, renderView(model, true), false, total, counter);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, ['over-200', 'within-200', 'grouped', 'invalid-number', 'rows-lost', 'limited']);
  }, PBT_TIMEOUT);

  it('UI-P1: examples (rows lost, grouped numbers, invalid number, limit)', () => {
    const lost = buildMirrorModel({
      changes: [[{ kind: 'sql-row-count', table: 'users', rowsBefore: 1206, rowsAfter: 0 }]],
    });
    const html = renderView(lost, false);
    expect(html).toContain('rows lost: 1,206');
    expect(html).toContain('1 changes in 1 steps');
    const many = buildMirrorModel({
      changes: [Array.from({ length: 250 }, (_, i) => ({ kind: 'file-created', path: `/w/${i}.txt` }))],
    });
    expect(renderView(many, false)).toContain('Showing 200 of 250');
    expect((renderView(many, true).match(/data-change-row=/g) ?? []).length).toBe(250);
  });
});

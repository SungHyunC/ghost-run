import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { printJson } from '../../scripts/lib/print-json.mjs';
import type { CheckRow, CopyScene, HandVariantParams, PlanRecord, RealityScene, RunsFile, WorldRecord } from '../../src/data/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const print = printJson as (value: unknown) => string;

const num = fc.double({ noNaN: true, noDefaultInfinity: true }).map((x) => (x === 0 ? 0 : x));
const text = fc.string({ maxLength: 12 });
const name = fc.string({ minLength: 1, maxLength: 8 });
const names = fc.array(name, { maxLength: 4 });
const key = fc.stringMatching(/^[a-z][A-Za-z0-9]{0,8}$/);

const checkRow: fc.Arbitrary<CheckRow> = fc.record({ label: text, measured: text, ok: fc.boolean() });
const params: fc.Arbitrary<HandVariantParams> = fc.record({
  drawerFrictionN: num,
  drawerMassKg: num,
  handleOffsetM: fc.tuple(num, num, num),
  sensorNoiseM: num,
  commandDelaySteps: fc.integer({ min: 0, max: 20 }),
});
const buckets = fc.array(fc.record({ name, objects: names, protected: fc.boolean() }), { maxLength: 3 });

const copyScene: fc.Arbitrary<CopyScene> = fc.oneof(
  fc.record({
    kind: fc.constant('shell' as const),
    tables: fc.array(
      fc.record(
        { name, rows: fc.nat(), state: fc.constantFrom('intact' as const, 'dropped' as const, 'soft' as const), note: text },
        { requiredKeys: ['name', 'rows', 'state'] },
      ),
      { maxLength: 3 },
    ),
    files: names,
  }),
  fc.record({
    kind: fc.constant('hand' as const),
    tiles: fc.array(
      fc.record({
        id: name,
        label: text,
        outcome: fc.constantFrom('passed' as const, 'failed' as const),
        jointLimit: fc.boolean(),
        params,
      }),
      { maxLength: 8 },
    ),
  }),
  fc.record({ kind: fc.constant('cloud' as const), buckets }),
);

const reality: fc.Arbitrary<RealityScene> = fc.oneof(
  fc.record({
    kind: fc.constant('shell' as const),
    root: fc.constant('project/' as const),
    tables: fc.array(fc.record({ name, rows: fc.nat() }), { maxLength: 3 }),
    files: names,
  }),
  fc.record({ kind: fc.constant('hand' as const), label: fc.constant('the real arm' as const) }),
  fc.record({ kind: fc.constant('cloud' as const), buckets }),
);

const plan: fc.Arbitrary<PlanRecord> = fc.record({
  commands: fc.array(text, { maxLength: 3 }),
  display: text,
  verdict: fc.constantFrom('pass' as const, 'warn' as const, 'block' as const),
  violatedWardIds: names,
  checks: fc.array(checkRow, { maxLength: 3 }),
  effectsOutside: names,
  p1: fc.record({ equal: fc.boolean(), before: text, after: text }),
  copyAfter: copyScene,
  facts: fc.dictionary(key, fc.oneof(num, text), { maxKeys: 5 }),
  message: text,
});

const world = (id: 'shell' | 'hand' | 'cloud'): fc.Arbitrary<WorldRecord> =>
  fc.record({
    id: fc.constant(id),
    ward: fc.record({ id: name, kind: fc.constantFrom('sql' as const, 'physics' as const, 'path' as const), line: text }),
    reality,
    plan,
    fixed: plan,
  });

const runsFile: fc.Arbitrary<RunsFile> = fc.record({
  format: fc.constant('ghost-site-runs' as const),
  version: fc.constant(1 as const),
  seed: fc.constant(42 as const),
  variantCount: fc.constant(8 as const),
  worlds: fc.record({ shell: world('shell'), hand: world('hand'), cloud: world('cloud') }),
});

function keysSorted(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysSorted);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.every((k, i) => i === 0 || (keys[i - 1] as string) < k) && Object.values(value).every(keysSorted);
  }
  return true;
}

describe('printJson on RunsFile-shaped values (property)', () => {
  // Feature: site, Property 3: Recorded runs equal a fresh run
  // **Validates: Requirements 10.7, 12.3**
  it(
    'round-trips through JSON.parse and prints equal bytes for the parsed value',
    () => {
      fc.assert(
        fc.property(runsFile, (x) => {
          const printed = print(x);
          const parsed: unknown = JSON.parse(printed);
          expect(parsed).toEqual(x);
          expect(print(parsed)).toBe(printed);
          expect(printed.endsWith('}\n')).toBe(true);
          expect(printed.endsWith('\n\n')).toBe(false);
          expect(keysSorted(parsed)).toBe(true);
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});

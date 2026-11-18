import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/index.js';
import type { Change, GhostReport, Ward, WardSet } from '../src/index.js';
import { compareCodePoints } from '../src/judge/bytes.js';
import { foldPath, normalizePath } from '../src/judge/normalize.js';
import { oracleGlobMatches } from './fixtures/glob-oracle.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

type PathWard = Extract<Ward, { kind: 'path' }>;
type Op = 'delete' | 'overwrite';

const CHARS = ['a', 'b', 'A', 'B', '0', '1', '.', '-', '\u00e9', '\u00c9'] as const;
const CLASSES = ['[ab]', '[!ab]', '[a-b]', '[0-9]', '[!0-9]', '[A-B]', '[.-]', '[\u00e9]'] as const;

const charArb = fc.constantFrom(...CHARS);
const nameSegArb = fc
  .array(charArb, { minLength: 1, maxLength: 4 })
  .map((a) => a.join(''))
  .filter((s) => s !== '.' && s !== '..');
const pathArb = fc
  .array(nameSegArb, { minLength: 1, maxLength: 4 })
  .map((a) => a.join('/'));

const unitArb = fc.oneof(
  { weight: 4, arbitrary: charArb },
  { weight: 2, arbitrary: fc.constant('*') },
  { weight: 2, arbitrary: fc.constant('?') },
  { weight: 2, arbitrary: fc.constantFrom(...CLASSES) },
);
const patSegArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant('**') },
  {
    weight: 4,
    arbitrary: fc
      .array(unitArb, { minLength: 1, maxLength: 4 })
      .map((a) => a.join(''))
      .filter((s) => !s.includes('**') && s !== '.' && s !== '..'),
  },
);
const patternArb = fc.array(patSegArb, { minLength: 1, maxLength: 3 }).map((a) => a.join('/'));

// Literal patterns drawn from the same alphabet, so they often hit generated paths.
const literalArb = pathArb;
const pathsArb = fc.array(fc.oneof(patternArb, literalArb), { minLength: 1, maxLength: 3 });
const denyArb = fc.constantFrom<readonly Op[]>(['delete'], ['overwrite'], ['delete', 'overwrite']);

const KINDS = ['file-deleted', 'file-overwritten', 'symlink-changed', 'file-created'] as const;

type Spec =
  | { readonly tag: 'file'; readonly kind: (typeof KINDS)[number]; readonly path: string; readonly k: number }
  | { readonly tag: 'noise'; readonly change: Change; readonly k: number };

const noiseArb: fc.Arbitrary<Change> = fc.oneof(
  fc.constant<Change>({ kind: 'file-deleted' }),
  fc.constant<Change>({ kind: 'file-overwritten', path: 42 }),
  fc.constant<Change>({ kind: 'file-deleted', path: null }),
  pathArb.map<Change>((path) => ({ kind: 'mystery-kind', path })),
  fc.constant<Change>({ kind: 'sql-row-count', table: 't', rowsBefore: 3, rowsAfter: 1 }),
);

const specArb: fc.Arbitrary<Spec> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ tag: fc.constant('file' as const), kind: fc.constantFrom(...KINDS), path: pathArb, k: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ tag: fc.constant('noise' as const), change: noiseArb, k: fc.nat() }) },
);

function toChange(s: Spec): Change {
  return s.tag === 'file' ? { kind: s.kind, path: s.path } : s.change;
}

function report(steps: Change[][]): GhostReport<unknown> {
  return { snapshots: [], changes: steps, effectsOutside: [], observedEvents: [], variantResults: [] };
}

function evaluateViolations(ward: PathWard, steps: Change[][]): string[] {
  const set: WardSet = { wards: [ward] };
  const v = WardEngine.evaluate(report(steps), set);
  for (const x of v.violations) {
    expect(x.wardId).toBe(ward.id);
    expect(x.wardKind).toBe('path');
  }
  return v.violations.map((x) => x.reason);
}

/** Parses `would <op> protected path <display>`. */
function parseReason(reason: string): { op: Op; display: string } {
  const m = /^would (delete|overwrite) protected path ([\s\S]*)$/.exec(reason);
  if (m === null) throw new Error(`unexpected violation reason: ${reason}`);
  return { op: m[1] as Op, display: m[2] as string };
}

function opOf(kind: Spec & { tag: 'file' }): Op | null {
  if (kind.kind === 'file-deleted') return 'delete';
  if (kind.kind === 'file-overwritten' || kind.kind === 'symlink-changed') return 'overwrite';
  return null;
}

/** Reference: distinct (key, op) pairs the oracle matcher says are violations. */
function expectedKeys(ward: PathWard, specs: readonly Spec[]): Set<string> {
  const cs = ward.case_sensitive === true;
  const out = new Set<string>();
  for (const s of specs) {
    if (s.tag !== 'file') continue;
    const op = opOf(s);
    if (op === null || !ward.deny.includes(op)) continue;
    const norm = normalizePath(s.path);
    if (!ward.paths.some((p) => oracleGlobMatches(p, norm, cs))) continue;
    out.add(`${op}\u0000${cs ? norm : foldPath(s.path)}`);
  }
  return out;
}

function actualKeys(ward: PathWard, reasons: readonly string[]): string[] {
  const cs = ward.case_sensitive === true;
  return reasons.map((r) => {
    const { op, display } = parseReason(r);
    return `${op}\u0000${cs ? normalizePath(display) : foldPath(display)}`;
  });
}

function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function shuffled(specs: readonly Spec[], salt: number): Spec[] {
  return [...specs].sort((a, b) => ((a.k + salt) % 97) - ((b.k + salt) % 97) || a.k - b.k);
}

function wardArb(caseSensitive: boolean): fc.Arbitrary<PathWard> {
  return fc.record({ paths: pathsArb, deny: denyArb }).map(({ paths, deny }) => ({
    id: 'w',
    kind: 'path' as const,
    paths,
    deny: [...deny],
    case_sensitive: caseSensitive,
  }));
}

const stats = { runs: 0, withViolations: 0 };

function property(caseSensitive: boolean) {
  return fc.property(
    wardArb(caseSensitive),
    fc.array(specArb, { minLength: 0, maxLength: 10 }),
    fc.integer({ min: 1, max: 4 }),
    fc.nat(96),
    (ward, specs, chunkSize, salt) => {
      const expected = expectedKeys(ward, specs);
      stats.runs++;
      if (expected.size > 0) stats.withViolations++;
      const original = evaluateViolations(ward, chunk(specs.map(toChange), chunkSize));
      const reshuffled = evaluateViolations(ward, [shuffled(specs, salt).map(toChange)]);

      for (const reasons of [original, reshuffled]) {
        const keys = actualKeys(ward, reasons);
        // No duplicate (ward, path, operation); exactly the reference set.
        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(keys)).toEqual(expected);
        if (caseSensitive) {
          // Sorted by display path (code points), then operation.
          const parsed = reasons.map(parseReason);
          for (let i = 1; i < parsed.length; i++) {
            const a = parsed[i - 1] as { op: Op; display: string };
            const b = parsed[i] as { op: Op; display: string };
            const c = compareCodePoints(a.display, b.display);
            expect(c < 0 || (c === 0 && a.op === 'delete' && b.op === 'overwrite')).toBe(true);
          }
        }
      }
      // Identical for every shuffle: exact for case-sensitive wards. For
      // case-insensitive wards the first spelling seen is displayed, so the
      // comparison is on folded keys.
      if (caseSensitive) expect(reshuffled).toEqual(original);
      else expect(new Set(actualKeys(ward, reshuffled))).toEqual(new Set(actualKeys(ward, original)));
    },
  );
}

describe('path ward violations (Property 6)', () => {
  it('case-sensitive wards agree with the reference matcher and are shuffle-invariant', () => {
    // Feature: wards, Property 6: Path ward violations agree with the reference matcher
    // **Validates: Requirements 5.3, 5.4, 5.8, 4.3**
    fc.assert(property(true), { numRuns: NUM_RUNS });
  }, PBT_TIMEOUT ?? 0);

  it('case-insensitive wards agree with the reference matcher and are shuffle-invariant', () => {
    // Feature: wards, Property 6: Path ward violations agree with the reference matcher
    // **Validates: Requirements 5.3, 5.4, 5.8, 4.3**
    fc.assert(property(false), { numRuns: NUM_RUNS });
    // Non-vacuity across both property tests: some runs must produce violations.
    expect(stats.runs).toBe(2 * NUM_RUNS);
    console.log(`P6 runs=${stats.runs} withViolations=${stats.withViolations}`);
    expect(stats.withViolations).toBeGreaterThan(0);
  }, PBT_TIMEOUT ?? 0);

  it('ignores created files, non-string paths and unknown kinds', () => {
    // Feature: wards, Property 6: Path ward violations agree with the reference matcher
    // **Validates: Requirements 5.3, 5.4, 5.8, 4.3**
    const ward: PathWard = { id: 'w', kind: 'path', paths: ['data'], deny: ['delete', 'overwrite'] };
    const none: Change[] = [
      { kind: 'file-created', path: 'data/a' },
      { kind: 'file-deleted' },
      { kind: 'file-overwritten', path: 7 },
      { kind: 'mystery-kind', path: 'data/a' },
    ];
    expect(evaluateViolations(ward, [none])).toEqual([]);
    expect(
      evaluateViolations(ward, [[...none, { kind: 'symlink-changed', path: 'data/b' }]]).map(parseReason),
    ).toEqual([{ op: 'overwrite', display: 'data/b' }]);
  });
});

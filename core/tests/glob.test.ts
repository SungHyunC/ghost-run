import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { globMatches, validateGlob, type GlobErrorCode, type StepCounter } from '../src/judge/glob.js';
import { compilePathSet } from '../src/judge/pathset.js';
import { oracleGlobMatches } from './fixtures/glob-oracle.js';
import { NUM_RUNS } from './pbt-config.js';

const CHARS = ['a', 'b', 'A', 'B', '0', '1', '.', '-', '\u00e9', '\u00c9'] as const;
const CLASSES = ['[ab]', '[!ab]', '[a-b]', '[0-9]', '[!0-9]', '[A-B]', '[.-]', '[\u00e9]'] as const;

const charArb = fc.constantFrom(...CHARS);
const nameSegArb = fc
  .array(charArb, { minLength: 1, maxLength: 5 })
  .map((a) => a.join(''))
  .filter((s) => s !== '.' && s !== '..');
const pathArb = fc
  .array(nameSegArb, { minLength: 0, maxLength: 5 })
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
      .array(unitArb, { minLength: 1, maxLength: 5 })
      .map((a) => a.join(''))
      .filter((s) => !s.includes('**') && s !== '.' && s !== '..'),
  },
);
const patternArb = fc.array(patSegArb, { minLength: 1, maxLength: 5 }).map((a) => a.join('/'));

const STEP_CONSTANT = 8;

const DEFECTS: ReadonlyArray<{ code: GlobErrorCode; mutate: (g: string) => string }> = [
  { code: 'empty-pattern', mutate: () => '' },
  { code: 'absolute-pattern', mutate: (g) => `/${g}` },
  { code: 'parent-segment', mutate: (g) => `${g}/..` },
  { code: 'unsupported-glob-syntax', mutate: (g) => `!${g}` },
  { code: 'unsupported-glob-syntax', mutate: (g) => `${g}/x\\y` },
  { code: 'unsupported-glob-syntax', mutate: (g) => `${g}/x{a,b}` },
  { code: 'unterminated-class', mutate: (g) => `${g}/[ab` },
  { code: 'empty-class', mutate: (g) => `${g}/[]` },
  { code: 'descending-range', mutate: (g) => `${g}/[b-a]` },
  { code: 'partial-doublestar', mutate: (g) => `${g}/a**b` },
  { code: 'invalid-character', mutate: (g) => `${g}/a\u200Bb` },
  { code: 'invalid-character', mutate: (g) => `${g}/a\u0007b` },
  { code: 'pattern-too-long', mutate: (g) => g + '/' + 'a'.repeat(513) },
];

describe('glob matcher (Property 3)', () => {
  it('agrees with the reference matcher, stays within the step bound, and validates', () => {
    // Feature: wards, Property 3: Glob matcher agrees with a reference matcher and stays within the step bound
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.3**
    fc.assert(
      fc.property(patternArb, pathArb, fc.boolean(), fc.nat(DEFECTS.length - 1), (g, p, cs, di) => {
        expect(validateGlob(g)).toBeNull();

        const counter: StepCounter = { steps: 0 };
        const got = globMatches(g, p, { caseSensitive: cs, counter });
        expect(got).toBe(oracleGlobMatches(g, p, cs));
        expect(counter.steps).toBeLessThanOrEqual(STEP_CONSTANT * Math.max(1, g.length) * Math.max(1, p.length));

        expect(compilePathSet([g], { caseSensitive: cs }).test(p)).toEqual({
          matched: oracleGlobMatches(g, p, cs),
          escapes: false,
        });

        const d = DEFECTS[di] as (typeof DEFECTS)[number];
        expect(validateGlob(d.mutate(g))?.code).toBe(d.code);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps a*a*a*a*a*a*a*a*b against 4,000 a characters within the step bound', () => {
    const pattern = 'a*a*a*a*a*a*a*a*b';
    const path = 'a'.repeat(4000);
    const counter: StepCounter = { steps: 0 };
    expect(globMatches(pattern, path, { counter })).toBe(false);
    expect(counter.steps).toBeLessThanOrEqual(STEP_CONSTANT * pattern.length * path.length);
    expect(counter.steps).toBeGreaterThan(0);
  });

  it('matches case-insensitively by default policy only when asked', () => {
    expect(globMatches('data/**', 'DATA/x', { caseSensitive: false })).toBe(true);
    expect(globMatches('data/**', 'DATA/x', { caseSensitive: true })).toBe(false);
    expect(globMatches('[a-b]x', 'Bx', { caseSensitive: false })).toBe(true);
    expect(globMatches('[a-b]x', 'Bx', { caseSensitive: true })).toBe(false);
    expect(globMatches('[!a]x', 'Ax', { caseSensitive: false })).toBe(false);
    expect(compilePathSet(['data'], { caseSensitive: false }).test('./DATA/a').matched).toBe(true);
    expect(compilePathSet(['data'], { caseSensitive: true }).test('./DATA/a').matched).toBe(false);
  });

  it('covers the documented examples', () => {
    expect(globMatches('.env', '.env')).toBe(true);
    expect(globMatches('.env', 'sub/.env')).toBe(false);
    expect(globMatches('**/.env', '.env')).toBe(true);
    expect(globMatches('**/.env', 'sub/.env')).toBe(true);
    expect(globMatches('data/**', 'data')).toBe(true);
    expect(globMatches('data/**', 'data/a/b')).toBe(true);
    expect(globMatches('*.pem', '.hidden.pem')).toBe(true);
    expect(globMatches('db/*.sqlite', 'db/app.sqlite/x')).toBe(true);
    expect(globMatches('[!0-9]', '5')).toBe(false);
    expect(globMatches('[!0-9]', '/')).toBe(false);
  });
});

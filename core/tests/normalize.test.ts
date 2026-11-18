// Feature: wards, Property 2: Path normalization is idempotent and spelling-invariant
// **Validates: Requirements 2.1, 2.2, 2.5, 2.6, 2.8**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizePath } from '../src/judge/normalize.js';
import { NUM_RUNS } from './pbt-config.js';

// Segment names: non-empty, no '/', and never exactly '.' or '..'.
// Includes escaped non-ASCII text (precomposed e-acute, hangul, emoji).
const segmentName = fc
  .array(
    fc.constantFrom('a', 'b', 'Z', '0', '_', '-', '.', ' ', '\u00e9', '\uac00', '\u{1f600}'),
    { minLength: 1, maxLength: 6 },
  )
  .map((cs) => cs.join(''))
  .filter((s) => s !== '.' && s !== '..');

const segments = fc.array(segmentName, { minLength: 0, maxLength: 5 });

// Arbitrary strings biased toward path-significant characters.
const pathLike = fc
  .array(fc.constantFrom('/', '.', '..', 'a', 'b', '\u00e9', 'e\u0301', ''), { maxLength: 12 })
  .map((parts) => parts.join(''));

interface Decoration {
  leadingDot: boolean;
  leadingSlash: boolean;
  trailingSlash: boolean;
  doubled: boolean;
  dotInserts: number[];
  pairInserts: number[];
}

const decoration: fc.Arbitrary<Decoration> = fc.record({
  leadingDot: fc.boolean(),
  leadingSlash: fc.boolean(),
  trailingSlash: fc.boolean(),
  doubled: fc.boolean(),
  dotInserts: fc.array(fc.nat(8), { maxLength: 3 }),
  pairInserts: fc.array(fc.nat(8), { maxLength: 3 }),
});

// Independent oracle: builds a decorated spelling from the clean segments.
function decorate(s: string[], d: Decoration): string {
  const parts = [...s];
  for (const i of d.dotInserts) parts.splice(i % (parts.length + 1), 0, '.');
  for (const i of d.pairInserts) parts.splice(i % (parts.length + 1), 0, 'x', '..');
  let out = parts.join(d.doubled ? '//' : '/');
  if (d.leadingDot) out = './' + out;
  if (d.leadingSlash) out = '/' + out;
  if (d.trailingSlash) out += '/';
  return out;
}

describe('Property 2: path normalization', () => {
  it('is idempotent for all strings', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), pathLike), (p) => {
        const once = normalizePath(p);
        expect(normalizePath(once)).toBe(once);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('maps every decorated spelling to the plain segment join', () => {
    fc.assert(
      fc.property(segments, decoration, (s, d) => {
        expect(normalizePath(decorate(s, d))).toBe(s.join('/'));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('gives equal results for NFD and NFC spellings', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), pathLike, segments.map((s) => s.join('/'))), (p) => {
        expect(normalizePath(p.normalize('NFD'))).toBe(normalizePath(p.normalize('NFC')));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('normalizes paths that resolve to the Copy root to the empty string', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('/', './', 'x/../', 'y/../'), { maxLength: 8 }),
        (parts) => {
          expect(normalizePath(parts.join(''))).toBe('');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('normalizePath examples', () => {
  it('keeps leading ..', () => {
    expect(normalizePath('../a')).toBe('../a');
    expect(normalizePath('../../a/b')).toBe('../../a/b');
  });

  it('collapses a/../b', () => {
    expect(normalizePath('a/../b')).toBe('b');
  });

  it('maps root spellings to the empty string', () => {
    for (const p of ['', '.', './', '/', '//', 'a/..', './a/../']) {
      expect(normalizePath(p)).toBe('');
    }
  });

  it('treats NFD and NFC spellings as equal', () => {
    expect(normalizePath('caf\u0065\u0301/x')).toBe('caf\u00e9/x');
  });
});

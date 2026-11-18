import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { sanitizeText, scanText } from '@ghost-run/core';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';
import { initialPageState, pageReducer, scanReadme } from '../../src/state/reducer';

// Hidden runs are built from code points; the HTML comment opener is built by concatenation.
const COMMENT_OPEN = '<' + '!' + '--';
const COMMENT_CLOSE = '--' + '>';

const cp = (n: number): string => String.fromCodePoint(n);
const tagRun = fc
  .array(fc.integer({ min: 0xe0020, max: 0xe007e }), { minLength: 1, maxLength: 12 })
  .map((a) => a.map(cp).join(''));
const zeroWidthRun = fc
  .array(fc.constantFrom(0x200b, 0x200c, 0x2060, 0xfeff), { minLength: 1, maxLength: 4 })
  .map((a) => a.map(cp).join(''));
const bidiRun = fc
  .array(fc.constantFrom(0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069), {
    minLength: 1,
    maxLength: 4,
  })
  .map((a) => a.map(cp).join(''));
const commentRun = fc
  .stringMatching(/^[a-z ]{0,20}$/)
  .map((body) => COMMENT_OPEN + body + COMMENT_CLOSE);
const hiddenRun = fc.oneof(tagRun, zeroWidthRun, bidiRun, commentRun);

// Visible text: ASCII letters, digits, spaces, newlines; no '<', so no accidental markup.
const visibleChunk = fc.stringMatching(/^[A-Za-z0-9 .\n]{0,15}$/);

const readmeArb = fc
  .array(fc.tuple(visibleChunk, fc.option(hiddenRun, { nil: undefined })), { minLength: 1, maxLength: 8 })
  .map((parts) => ({
    visible: parts.map(([v]) => v).join(''),
    text: parts.map(([v, h]) => v + (h ?? '')).join(''),
    hasHidden: parts.some(([, h]) => h !== undefined),
  }));

function purify(text: string) {
  const state = { ...initialPageState(), readme: text };
  return pageReducer(state, { type: 'purify' }).state;
}

describe('Property 24: Purify removes hidden text', () => {
  // **Validates: Requirements 12.6**
  it(
    'purified README equals sanitizeText, scans empty, and keeps the visible text',
    () => {
      fc.assert(
        fc.property(readmeArb, ({ visible, text }) => {
          const after = purify(text);
          expect(after.purified).toBe(true);
          expect(after.readme).toBe(sanitizeText(text));
          expect(scanText(after.readme).findings).toEqual([]);
          expect(scanReadme(after).findings).toEqual([]);
          expect(after.readme).toBe(visible);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('purifies the fixture README, which starts with a finding', () => {
    const s0 = initialPageState();
    expect(scanReadme(s0).findings.length).toBeGreaterThan(0);
    const s1 = pageReducer(s0, { type: 'purify' }).state;
    expect(scanReadme(s1).findings).toEqual([]);
  });
});

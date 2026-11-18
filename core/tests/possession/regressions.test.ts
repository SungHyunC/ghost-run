// Fixed regression examples found by the final checkpoint run.

import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';

describe('regressions', () => {
  // Property 21 non-vacuity counter `withCancelTag` stayed 0 on some seeds (the generator rarely
  // produced U+E007F). The generator now has a variant that always ends with the cancel tag; this
  // pins the behavior that variant exercises.
  it('a listed flag followed by an appended cancel tag: only the cancel tag is flagged', () => {
    const seq = [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
    const findings = scanText(String.fromCodePoint(...seq, 0xe0061, 0xe007f)).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('tag');
    expect(findings[0]?.offset).toBe(7);
    expect(findings[0]?.length).toBe(2);
  });
});

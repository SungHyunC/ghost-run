// Optional file-based companion of tests/possession/plan-text.test.ts (Requirement 13.13).
// docs/plan.md is gitignored; when it is absent this test is skipped with a visible message.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanText } from '../src/possession/scan.js';

const planPath = fileURLToPath(new URL('../../docs/plan.md', import.meta.url));
const present = existsSync(planPath);

if (!present) {
  console.warn(`SKIPPED: docs/plan.md not found at ${planPath} (gitignored); file-based P7 check not run.`);
}

describe('docs/plan.md (Requirement 13.13)', () => {
  it.skipIf(!present)('the full plan text has no findings', () => {
    const text = readFileSync(planPath, 'utf8');
    expect(scanText(text).findings).toEqual([]);
    expect(scanText(text, { markdown: true }).findings).toEqual([]);
  });
});

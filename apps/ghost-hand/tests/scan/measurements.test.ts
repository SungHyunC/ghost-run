import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Measurement record guard. Validates: Requirements 13.10.
// The frame time of the 3D overlay is measured by task 17.3; the section must not say `unmeasured` any more.

const measurementsPath = fileURLToPath(new URL('../../../../docs/measurements.md', import.meta.url));
const HEADING = '## 3D overlay frame time with 8 and 20 ghost arms';

function section(text: string): string {
  const start = text.indexOf(HEADING);
  if (start < 0) throw new Error(`section not found: ${HEADING}`);
  const rest = text.slice(start + HEADING.length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('3D overlay frame time record', () => {
  const body = section(readFileSync(measurementsPath, 'utf8'));

  it('is no longer unmeasured', () => {
    expect(body).not.toMatch(/\bunmeasured\b/i);
  });

  it('names the date, Chrome version, machine, load average, and both arm counts', () => {
    expect(body).toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(body).toMatch(/Chrome: \d+\.\d+\.\d+\.\d+/);
    expect(body).toMatch(/Machine: .*Apple/);
    expect(body).toMatch(/Load average/);
    expect(body).toMatch(/\|\s*8\s*\|/);
    expect(body).toMatch(/\|\s*20\s*\|/);
  });
});

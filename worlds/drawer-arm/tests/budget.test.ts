import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Time budget guard (design D14, Requirements 17.1, 17.11, 17.12): the measured short-run count must exist, lie
// in 20 to 100, and carry a rationale when it is below 100.

const file = fileURLToPath(new URL('./pbt-budget.json', import.meta.url));

interface PbtBudget {
  shortRuns?: unknown;
  measuredWorstExampleMs?: unknown;
  stepCostMicros?: unknown;
  measuredOn?: { node?: unknown; machine?: unknown; date?: unknown };
  rationale?: unknown;
}

describe('tests/pbt-budget.json', () => {
  it('exists', () => {
    expect(existsSync(file)).toBe(true);
  });

  const budget = (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}) as PbtBudget;

  it('has an integer shortRuns from 20 to 100', () => {
    expect(Number.isInteger(budget.shortRuns)).toBe(true);
    expect(budget.shortRuns as number).toBeGreaterThanOrEqual(20);
    expect(budget.shortRuns as number).toBeLessThanOrEqual(100);
  });

  it('records positive measurements and the measurement environment', () => {
    expect(budget.measuredWorstExampleMs as number).toBeGreaterThan(0);
    expect(budget.stepCostMicros as number).toBeGreaterThan(0);
    for (const key of ['node', 'machine', 'date'] as const) {
      expect(typeof budget.measuredOn?.[key]).toBe('string');
      expect((budget.measuredOn?.[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('has a non-empty rationale when shortRuns is below 100', () => {
    if ((budget.shortRuns as number) < 100) {
      expect(typeof budget.rationale).toBe('string');
      expect((budget.rationale as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('is consistent with the rule clamp(floor(25000 / worstExampleMs), 20, 100)', () => {
    const expected = Math.min(100, Math.max(20, Math.floor(25000 / (budget.measuredWorstExampleMs as number))));
    expect(budget.shortRuns).toBe(expected);
  });
});

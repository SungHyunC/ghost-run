// [no-docker] Docker test reporter labels. Validates: Requirements 17.7
import { describe, expect, it } from 'vitest';
import {
  DOCKER_SKIPPED_LABEL,
  isDockerSkippedName,
  partialLabel,
  skippedSuiteName,
  summaryLines,
} from './docker-label.js';

describe('docker reporter labels', () => {
  it('marks skipped suite names and recognizes them', () => {
    const n = skippedSuiteName('runPlan in a real box');
    expect(n).toContain(DOCKER_SKIPPED_LABEL);
    expect(isDockerSkippedName(n)).toBe(true);
    expect(isDockerSkippedName('runPlan in a real box')).toBe(false);
  });

  it('labels fewer than 20 examples as partial', () => {
    expect(partialLabel(7)).toBe('partial (7 of 20 examples)');
    expect(partialLabel(0)).toBe('partial (0 of 20 examples)');
    expect(partialLabel(20)).toBeUndefined();
    expect(partialLabel(100)).toBeUndefined();
  });

  it('prints skipped suites with P1/P5/P6 not counted as passed, and partial properties', () => {
    const lines = summaryLines({
      skippedSuites: ['a.test.ts: x [skipped (docker unavailable)]'],
      properties: [
        { name: 'P19 box', examples: 12 },
        { name: 'P20 box', examples: 30 },
      ],
    }).join('\n');
    expect(lines).toContain('skipped (docker unavailable)');
    expect(lines).toContain('P1, P5, P6 were not asserted and are not counted as passed');
    expect(lines).toContain('"P19 box": partial (12 of 20 examples)');
    expect(lines).not.toContain('P20 box');
  });

  it('prints nothing when nothing was skipped or partial', () => {
    expect(summaryLines({ skippedSuites: [], properties: [{ name: 'p', examples: 20 }] })).toEqual([]);
  });
});

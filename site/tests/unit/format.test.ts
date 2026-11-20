import { describe, expect, it } from 'vitest';
import { formatCount, formatForce, formatRate, roundLines } from '../../src/engine/format';

describe('format', () => {
  it('formatCount adds a thousands separator', () => {
    expect(formatCount(1206)).toBe('1,206');
    expect(formatCount(3)).toBe('3');
  });

  it('formatForce shows one decimal and the unit', () => {
    expect(formatForce(27.53)).toBe('27.5 N');
    expect(formatForce(29.24)).toBe('29.2 N');
  });

  it('formatRate shows the count and the rounded percentage', () => {
    expect(formatRate(7, 8)).toBe('7 of 8 = 88%');
    expect(formatRate(8, 8)).toBe('8 of 8 = 100%');
  });

  it('roundLines rounds to the nearest hundred', () => {
    expect(roundLines(789)).toBe(800);
    expect(roundLines(2569)).toBe(2600);
    expect(roundLines(150)).toBe(200);
  });
});

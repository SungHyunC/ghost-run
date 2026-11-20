import { describe, expect, it } from 'vitest';
import { atMostRow, checkRow, destinations, extraChip, violatedIds } from '../../src/live/derive/common';

const blockUsers = { wardId: 'no-data-loss', reason: 'would delete 1,206 rows from users' };
const blockPath = { wardId: 'protect-data', reason: 'would delete protected path data' };

describe('derive/common', () => {
  it('builds a row from a ward limit and a measurement', () => {
    expect(atMostRow('rows lost', 0, 1206, '1,206 from users')).toEqual({
      label: 'rows lost, at most 0',
      measured: '1,206 from users',
      ok: false,
    });
    expect(atMostRow('rows lost', 5, 5)).toEqual(checkRow('rows lost, at most 5', '5', true));
  });

  it('gives the headline row and no chip when only the headline ward is violated', () => {
    expect(violatedIds([blockUsers, blockUsers])).toEqual(['no-data-loss']);
    expect(extraChip([blockUsers], 'no-data-loss')).toBeNull();
    expect(extraChip([], 'no-data-loss')).toBeNull();
  });

  it('adds one chip with the reason for a second violated ward', () => {
    expect(violatedIds([blockPath, blockUsers])).toEqual(['no-data-loss', 'protect-data']);
    expect(extraChip([blockUsers, blockPath], 'no-data-loss')).toEqual({
      wardId: 'protect-data',
      text: 'would delete protected path data',
    });
  });

  it('shortens and escapes the reason of the chip', () => {
    const chip = extraChip([{ wardId: 'x', reason: `a\u200Bb${'c'.repeat(200)}` }], 'y');
    expect(chip?.text).toContain('<U+200B>');
    expect(chip?.text.endsWith('\u2026')).toBe(true);
    expect(Array.from(chip?.text ?? '').length).toBeLessThanOrEqual(81);
  });

  it('lists destinations sorted and unique, from effects and network attempts only', () => {
    const out = destinations(
      [[{ destination: 'b.example' }], [{ destination: 'a.example' }, { destination: 'b.example' }]],
      [
        { kind: 'network-attempt', destination: 'c.example' },
        { kind: 'network-attempt', destination: 'a.example' },
        { kind: 'secret-read', destination: 'ignored.example' },
        { kind: 'network-attempt' },
      ],
    );
    expect(out).toEqual(['a.example', 'b.example', 'c.example']);
    expect(destinations([], [])).toEqual([]);
  });
});

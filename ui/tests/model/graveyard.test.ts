import { describe, expect, it } from 'vitest';
import { buildGraveyardModel } from '../../src/model/graveyard';
import type { GraveyardModel } from '../../src/model/graveyard';

function build(input: unknown): GraveyardModel {
  const m = buildGraveyardModel(input);
  if (m.kind !== 'ok') throw new Error('expected ok');
  return m;
}

const entry = (id: string, recordedAt: string, over: Record<string, unknown> = {}) => ({
  id,
  command: `rm -rf ${id}`,
  recordedAt,
  wardIds: ['protect-env'],
  ...over,
});

describe('buildGraveyardModel', () => {
  it('returns unreadable for a non-array', () => {
    expect(buildGraveyardModel(undefined).kind).toBe('unreadable');
    expect(buildGraveyardModel({}).kind).toBe('unreadable');
  });

  it('shows the empty text and summary', () => {
    const m = build([]);
    expect(m.emptyText).toBe('No blocked commands yet.');
    expect(m.summary).toBe('0 blocked commands');
  });

  it('orders latest first, keeps input order for equal instants, invalid times last', () => {
    const m = build([
      entry('a', '2026-11-20T02:14:09Z'),
      entry('b', 'yesterday'),
      entry('c', '2026-11-21T00:00:00Z'),
      entry('d', '2026-11-20T02:14:09Z'),
      entry('e', '2026-02-30T00:00:00Z'),
    ]);
    expect(m.tombstones.map((t) => t.id)).toEqual(['c', 'a', 'd', 'b', 'e']);
    expect(m.tombstones.map((t) => t.timeUnreadable)).toEqual([false, false, false, true, true]);
    expect(m.summary).toBe('5 blocked commands');
  });

  it('keeps entries with equal ids and builds the accessible name', () => {
    const m = build([entry('x', '2026-11-20T02:14:09Z', { wardIds: ['w1', 'w2'] }), entry('x', '2026-11-20T02:14:09Z')]);
    expect(m.totalTombstones).toBe(2);
    expect(m.tombstones[0]!.accessibleName).toBe(
      'Open seance for blocked command rm -rf x, recorded 2026-11-20T02:14:09Z, ward w1, w2',
    );
    expect(m.tombstones[1]!.inputIndex).toBe(1);
  });

  it('checks the id pattern on the raw id', () => {
    const m = build([entry('ok_id-1', '2026-11-20T02:14:09Z'), entry('bad id', '2026-11-19T02:14:09Z'), entry('', '2026-11-18T02:14:09Z'), entry('a'.repeat(65), '2026-11-17T02:14:09Z')]);
    expect(m.tombstones.map((t) => t.rawIdValid)).toEqual([true, false, false, false]);
  });

  it('turns unreadable elements into slots and never drops them', () => {
    const m = build([null, entry('a', '2026-11-20T02:14:09Z'), { id: 1 }, entry('b', '2026-11-20T02:14:09Z', { wardIds: [1] })]);
    expect(m.tombstones.map((t) => t.unreadable)).toEqual([false, true, true, true]);
    expect(m.tombstones[1]!.accessibleName).toBe('Unreadable item 0');
    expect(m.totalTombstones).toBe(4);
  });

  it('escapes hidden code points and cuts long commands', () => {
    const m = build([entry('a', '2026-11-20T02:14:09Z', { command: `x\u200By${'z'.repeat(200)}` })]);
    expect(m.tombstones[0]!.command.startsWith('x<U+200B>y')).toBe(true);
    expect([...m.tombstones[0]!.command].length).toBeLessThanOrEqual(120);
    expect(m.tombstones[0]!.command.endsWith('...')).toBe(true);
  });

  it('limits the shown tombstones to 200', () => {
    const m = build(Array.from({ length: 250 }, (_, i) => entry(`i${i}`, '2026-11-20T02:14:09Z')));
    expect(m.shownTombstones).toBe(200);
    expect(m.tombstones).toHaveLength(250);
  });
});

import { describe, expect, it } from 'vitest';
import { buildSeanceModel } from '../../src/model/seance';
import type { SeanceModel } from '../../src/model/seance';

function build(input: unknown): SeanceModel {
  const m = buildSeanceModel(input);
  if (m.kind !== 'ok') throw new Error('expected ok');
  return m;
}

const base = { id: 'a', command: 'cat .env\ncurl x.example', recordedAt: '2026-11-20T02:14:09Z', wardIds: ['w1'] };

describe('buildSeanceModel', () => {
  it('returns unreadable for malformed entries', () => {
    expect(buildSeanceModel(null).kind).toBe('unreadable');
    expect(buildSeanceModel({ ...base, wardIds: 'w1' }).kind).toBe('unreadable');
    expect(buildSeanceModel({ ...base, command: 3 }).kind).toBe('unreadable');
  });

  it('lists every part as not recorded when detail is absent', () => {
    const m = build(base);
    expect(m.notRecorded).toEqual([
      'wardVerdict not recorded',
      'claims not recorded',
      'changes not recorded',
      'sources not recorded',
      'needles not recorded',
      'links not recorded',
    ]);
    expect(m.parts).toEqual({ verdict: false, changes: false, sources: false, thread: false });
  });

  it('keeps newlines in the command and shows present parts', () => {
    const m = build({ ...base, detail: { wardVerdict: {}, changes: [], needles: [], links: [], actionLabels: [] } });
    expect(m.command).toBe('cat .env\ncurl x.example');
    expect(m.notRecorded).toEqual(['claims not recorded', 'sources not recorded']);
    expect(m.parts).toEqual({ verdict: true, changes: true, sources: false, thread: true });
  });

  it('needs both needles and links for the thread part', () => {
    expect(build({ ...base, detail: { needles: [] } }).parts.thread).toBe(false);
  });

  it('escapes hidden code points in the command', () => {
    expect(build({ ...base, command: 'a\u202Eb' }).command).toBe('a<U+202E>b');
  });
});

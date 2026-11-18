import { describe, expect, it } from 'vitest';
import { buildMirrorModel } from '../../src/model/mirror';
import type { MirrorModel } from '../../src/model/mirror';
import { buildSceneTree } from '../../src/model/scene';

function build(input: unknown): MirrorModel {
  const m = buildMirrorModel(input);
  if (m.kind !== 'ok') throw new Error('expected ok');
  return m;
}

describe('buildMirrorModel row table', () => {
  it('maps the five known kinds', () => {
    const m = build({
      changes: [
        [
          { kind: 'file-created', path: 'a.txt' },
          { kind: 'file-overwritten', path: 'b.txt' },
          { kind: 'file-deleted', path: 'c.txt' },
          { kind: 'symlink-changed', path: 'l', targetBefore: 'x', targetAfter: 'y' },
          { kind: 'sql-row-count', table: 'users', rowsBefore: 1206, rowsAfter: 6, dropped: true },
        ],
      ],
      stepLabels: ['first'],
    });
    const rows = m.steps[0]?.rows ?? [];
    expect(rows.map((r) => r.key)).toEqual(['0.0', '0.1', '0.2', '0.3', '0.4']);
    expect(rows[0]?.mirror.state.text).toBe('created');
    expect(rows[2]?.vanish).toBe(true);
    expect(rows[3]?.mirror.items.map((i) => i.text)).toEqual(['l', 'y']);
    expect(rows[4]?.reality.items[1]?.text).toBe('1,206');
    expect(rows[4]?.extraLabels).toEqual(['rows lost: 1,200', 'table dropped']);
    expect(rows[4]?.vanish).toBe(true);
    expect(m.steps[0]?.label).toBe('first');
    expect(m.summary).toBe('5 changes in 1 steps');
    expect(m.emptyText).toBeNull();
  });

  it('shows invalid numbers and no rows-lost for bad counts', () => {
    const m = build({ changes: [[{ kind: 'sql-row-count', table: 't', rowsBefore: 2.5, rowsAfter: '1' }]] });
    const row = m.steps[0]?.rows[0];
    expect(row?.reality.items[1]?.text).toContain('invalid number');
    expect(row?.vanish).toBe(false);
    expect(row?.extraLabels).toEqual([]);
  });

  it('hides secret-like values of unrecognized changes and keeps the key', () => {
    const m = build({ changes: [[{ kind: 'weird', apiToken: 'sk-CANARY-abc', note: 'visible-1' }, { kind: 'file-created' }]] });
    const [a, b] = m.steps[0]?.rows ?? [];
    expect(a?.kind).toBe('unrecognized');
    expect(a?.reality.items).toContainEqual({ label: 'apiToken', text: '[hidden: secret-like field]' });
    expect(JSON.stringify(a)).not.toContain('sk-CANARY');
    expect(a?.reality.items).toContainEqual({ label: 'note', text: 'visible-1' });
    expect(b?.kind).toBe('unrecognized');
  });

  it('counts non-record elements and non-array steps', () => {
    const m = build({ changes: [[null, 5], 'oops', []] });
    expect(m.steps[0]?.rows.map((r) => r.reality.items[0]?.text)).toEqual(['Unreadable item 0', 'Unreadable item 1']);
    expect(m.steps[1]?.unreadable).toBe(true);
    expect(m.summary).toBe('2 changes in 3 steps');
  });

  it('reports the empty text and unreadable input', () => {
    expect(build({ changes: [] }).emptyText).toBe('No changes: the ghost run left the mirror unchanged.');
    expect(buildMirrorModel(null).kind).toBe('unreadable');
    expect(buildMirrorModel({ changes: 3 }).kind).toBe('unreadable');
  });

  it('limits the initial rows to 200', () => {
    const many = Array.from({ length: 250 }, () => ({ kind: 'file-created', path: 'p' }));
    const m = build({ changes: [many] });
    expect(m.totalRows).toBe(250);
    expect(m.shownRows).toBe(200);
  });
});

describe('buildSceneTree', () => {
  it('redacts secret-like keys at any depth and handles circular input', () => {
    const circ: Record<string, unknown> = { a: 1 };
    circ['self'] = circ;
    const tree = buildSceneTree({ session: { x: 'sk-CANARY-1' }, ok: 'visible-2', circ });
    const text = JSON.stringify(tree);
    expect(text).not.toContain('sk-CANARY');
    expect(text).toContain('visible-2');
    expect(text).toContain('[circular reference]');
    expect(tree?.shown).toBe(tree?.total);
  });

  it('is null for an absent scene', () => {
    expect(buildSceneTree(undefined)).toBeNull();
  });
});

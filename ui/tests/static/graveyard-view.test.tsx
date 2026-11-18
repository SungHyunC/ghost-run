import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GraveyardView } from '../../src/components/Graveyard';
import { buildGraveyardModel } from '../../src/model/graveyard';

function model(entries: unknown) {
  const m = buildGraveyardModel(entries);
  if (m.kind !== 'ok') throw new Error('unreadable');
  return m;
}

describe('GraveyardView (static)', () => {
  it('renders empty text', () => {
    const html = renderToStaticMarkup(<GraveyardView model={model([])} revealAll={false} />);
    expect(html).toContain('0 blocked commands');
    expect(html).toContain('No blocked commands yet.');
  });

  it('renders buttons, disabled invalid ids, unreadable time and slots', () => {
    const entries = [
      { id: 'a1', command: 'rm -rf data', recordedAt: '2026-01-02T03:04:05Z', wardIds: ['protect-data'] },
      { id: 'bad id!', command: 'curl http://host.invalid', recordedAt: 'later', wardIds: [] },
      42,
    ];
    const html = renderToStaticMarkup(<GraveyardView model={model(entries)} revealAll={false} />);
    expect(html).toContain('3 blocked commands');
    expect(html).toContain('data-tombstone-index="0"');
    expect(html).toContain('No seance link: invalid id');
    expect(html).toContain('time unreadable');
    expect(html).toContain('Unreadable item 2');
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain('disabled');
  });

  it('limits to 200 and offers Show all', () => {
    const entries = Array.from({ length: 205 }, (_, i) => ({
      id: `id${i}`,
      command: 'ls',
      recordedAt: '2026-01-02T03:04:05Z',
      wardIds: ['w'],
    }));
    const html = renderToStaticMarkup(<GraveyardView model={model(entries)} revealAll={false} />);
    expect(html).toContain('Showing 200 of 205');
    expect(html).toContain('Show all 205 tombstones');
  });
});

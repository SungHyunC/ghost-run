import { describe, expect, it } from 'vitest';
import { MirrorWorldView } from '../../src/components/MirrorWorld';
import { buildMirrorModel } from '../../src/model/mirror';
import { renderMarkup } from '../support/markup';

function view(input: unknown, revealAll = false, sceneOpen = false) {
  const model = buildMirrorModel(input);
  if (model.kind !== 'ok') throw new Error('model unreadable');
  return renderMarkup(
    <MirrorWorldView model={model} revealAll={revealAll} sceneOpen={sceneOpen} sceneRevealAll={false} />,
  );
}

describe('MirrorWorldView (example markup)', () => {
  const changes = [
    [
      { kind: 'file-deleted', path: '/work/a.txt' },
      { kind: 'sql-row-count', table: 'users', rowsBefore: 1500, rowsAfter: 294 },
    ],
    [{ kind: 'weird', note: 'x', apiKey: 'sk-CANARY-abc123' }],
  ];

  it('renders heading, summary, columns, rows and vanish tag', () => {
    const html = view({ changes, stepLabels: ['cleanup'] });
    expect(html).toContain('Mirror world');
    expect(html).toContain('3 changes in 2 steps');
    expect(html).toContain('>Reality<');
    expect(html).toContain('>Mirror (copy)<');
    expect(html).toContain('step 0');
    expect(html).toContain('cleanup');
    expect(html.match(/data-change-row=/g)).toHaveLength(3);
    expect(html).toContain('data-change-row="0.0"');
    expect(html).toContain('would be removed');
    expect(html).toContain('rows lost: 1,206');
    expect(html).toContain('unrecognized change');
    expect(html).not.toContain('sk-CANARY-abc123');
  });

  it('renders the empty text and no unchanged claim', () => {
    const html = view({ changes: [] });
    expect(html).toContain('No changes: the ghost run left the mirror unchanged.');
    expect(html).not.toContain('Show all');
  });

  it('limits rows to 200 with a reveal control, and reveals all on request', () => {
    const many = [Array.from({ length: 250 }, (_, i) => ({ kind: 'file-created', path: `/w/${i}.txt` }))];
    const limited = view({ changes: many });
    expect(limited.match(/data-change-row=/g)).toHaveLength(200);
    expect(limited).toContain('Showing 200 of 250');
    expect(limited).toContain('aria-label="Show all 250 rows"');
    expect(view({ changes: many }, true).match(/data-change-row=/g)).toHaveLength(250);
  });

  it('renders the scene disclosure with redaction', () => {
    const input = { changes: [[]], realScene: { files: ['/a'], token: 'sk-CANARY-zzz' } };
    const closed = view(input);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-controls=');
    const open = view(input, false, true);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('[hidden: secret-like field]');
    expect(open).not.toContain('sk-CANARY-zzz');
  });
});

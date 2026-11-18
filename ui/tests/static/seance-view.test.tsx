import { describe, expect, it } from 'vitest';
import { SeanceMarkup } from '../../src/components/SeanceView';
import { buildSeanceModel } from '../../src/model/seance';
import { renderMarkup } from '../support/markup';

const entry = {
  id: 'a1',
  command: 'cat .env',
  recordedAt: '2026-01-02T03:04:05Z',
  wardIds: ['no-egress'],
  detail: { changes: [] },
};

describe('SeanceView markup', () => {
  it('renders heading, command, ward ids, back button, and not-recorded lines', () => {
    const model = buildSeanceModel(entry);
    if (model.kind !== 'ok') throw new Error('expected ok');
    const html = renderMarkup(<SeanceMarkup model={model} detail={entry.detail} />);
    expect(html).toContain('aria-labelledby="seance-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('>Seance<');
    expect(html).toContain('cat .env');
    expect(html).toContain('no-egress');
    expect(html).toContain('Back to graveyard');
    expect(html).toContain('claims not recorded');
    expect(html).toContain('wardVerdict not recorded');
    expect(html).not.toContain('changes not recorded');
  });
});

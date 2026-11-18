import { describe, expect, it } from 'vitest';
import { BlacklightSwitch, BlacklightViewMarkup } from '../../src/components/BlacklightView';
import { renderMarkup } from '../support/markup';

const ZWSP = String.fromCodePoint(0x200b);
const NO_REVEAL = { lines: new Set<number>(), findings: new Set<number>() };

const sources = [
  {
    source: 'notes.example.txt',
    text: `ab${ZWSP}cd\nsecond`,
    scan: {
      findings: [
        { category: 'zero-width', line: 1, column: 3, offset: 2, length: 1, codePoints: [0x200b], rendering: '<U+200B>' },
      ],
    },
  },
];

describe('BlacklightView markup', () => {
  it('renders the switch off with name, text, and disclaimer; hides the character', () => {
    const html = renderMarkup(<BlacklightViewMarkup sources={sources} mode="off" reveal={NO_REVEAL} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('aria-label="Blacklight"');
    expect(html).toContain('Blacklight: off');
    expect(html).toContain('Text analysis does not catch every injection.');
    expect(html).toContain('data-finding-index="0"');
    expect(html).not.toContain(ZWSP);
    expect(html).toContain('abcd');
  });

  it('renders a mark with category, position, and hex when on', () => {
    const html = renderMarkup(<BlacklightViewMarkup sources={sources} mode="on" reveal={NO_REVEAL} />);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Blacklight: on');
    expect(html).toContain('<mark');
    expect(html).toContain('zero-width 1:3');
    expect(html).toContain('U+200B');
    expect(html).not.toContain(ZWSP);
  });

  it('shows the empty-findings text and a placeholder for unreadable input', () => {
    const clean = [{ source: 'a.test', text: 'plain', scan: { findings: [] } }];
    expect(renderMarkup(<BlacklightViewMarkup sources={clean} mode="off" reveal={NO_REVEAL} />)).toContain(
      'No hidden text found by the blacklight.',
    );
    expect(renderMarkup(<BlacklightViewMarkup sources={42} mode="off" reveal={NO_REVEAL} />)).toContain('role="alert"');
  });

  it('switch is a native button', () => {
    expect(renderMarkup(<BlacklightSwitch on={false} />)).toMatch(/^<button type="button" role="switch"/);
  });
});

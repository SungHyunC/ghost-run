import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlacklightView } from '../../src/components/BlacklightView';

const ZWSP = String.fromCodePoint(0x200b);
const sources = [
  {
    source: 'notes.example.txt',
    text: `ab${ZWSP}cd`,
    scan: { findings: [{ category: 'zero-width' as const, line: 1, column: 3, offset: 2, length: 1, firstCodePoint: 'U+200B', codePoints: [0x200b], rendering: '<U+200B>' }] },
  },
];

describe('BlacklightView (DOM)', () => {
  it('toggles the mode and markers with the switch', () => {
    const { container } = render(<BlacklightView sources={sources} />);
    const sw = screen.getByRole('switch', { name: 'Blacklight' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelectorAll('.gk-lines mark').length).toBe(0);
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.textContent).toBe('Blacklight: on');
    expect(container.querySelectorAll('.gk-lines mark').length).toBe(1);
  });
});

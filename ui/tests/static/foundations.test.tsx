import { describe, expect, it } from 'vitest';
import { KitBoundary, withBoundary } from '../../src/components/KitBoundary';
import { Placeholder } from '../../src/components/Placeholder';
import { Reveal } from '../../src/components/Reveal';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { renderMarkup } from '../support/markup';

function Boom(): never {
  throw new Error('secret-message-CANARY');
}

function Motion() {
  return <i>{String(useReducedMotion())}</i>;
}

describe('foundations (static)', () => {
  it('renders the Placeholder text with role alert', () => {
    const html = renderMarkup(<Placeholder name="Candle" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Data unavailable: Candle received unreadable input.');
  });

  it('renders Reveal text and accessible name', () => {
    const html = renderMarkup(<Reveal shown={200} total={1206} noun="rows" />);
    expect(html).toContain('Showing 200 of 1206');
    expect(html).toContain('aria-label="Show all 1206 rows"');
    expect(html).toContain('<button type="button"');
  });

  it('server snapshot of useReducedMotion is false', () => {
    expect(renderMarkup(<Motion />)).toBe('<i>false</i>');
    const Wrapped = withBoundary(Motion, 'Candle');
    expect(renderMarkup(<Wrapped />)).toBe('<i>false</i>');
  });

  it('boundary renders children when nothing throws', () => {
    const html = renderMarkup(
      <KitBoundary name="MirrorWorld">
        <p>ok</p>
      </KitBoundary>,
    );
    expect(html).toBe('<p>ok</p>');
    expect(typeof Boom).toBe('function');
  });
});

// **Validates: Requirements 14.1, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 15.1, 15.2, 15.3, 18.2**
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Candle } from '@ghost-run/ui';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';
import { CANDLE_STATES } from '../../src/showcase/sample-data';

afterEach(cleanup);
const row = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(id);
  return el;
};
const ser = (el: Element | null | undefined): string =>
  el === null || el === undefined ? '' : new XMLSerializer().serializeToString(el);
const BL_SWITCH = 'section[data-blacklight] button[role="switch"]';

describe('Showcase rows', () => {
  it('mounts each real component root', () => {
    render(<ShowcaseApp />);
    expect(row('p-mirror').querySelector('table.gk-table')).not.toBeNull();
    expect(row('p-candle').querySelector('section[data-candle-state]')).not.toBeNull();
    expect(row('p-blacklight').querySelector(`${BL_SWITCH}[aria-checked="false"]`)).not.toBeNull();
    expect(row('p-thread').querySelector('section[aria-label="Red thread"]')).not.toBeNull();
    expect(row('p-grave').querySelectorAll('button.gk-tombstone')).toHaveLength(2);
    expect(row('p-lights').querySelectorAll('section[data-candle-state]')).toHaveLength(2);
    const c = row('p-controls');
    expect(c.querySelectorAll('button.gk-button')).toHaveLength(2);
    expect(c.querySelectorAll('input.gk-input')).toHaveLength(2);
    expect(c.querySelectorAll('textarea.gk-textarea')).toHaveLength(2);
    expect(within(c).getByLabelText('Command')).toBeTruthy();
  });

  it('has no Dark / Lights on group in the Mirror row; the Lights row starts dark and light', () => {
    render(<ShowcaseApp />);
    expect(row('p-mirror').querySelector('[aria-pressed]')).toBeNull();
    expect(row('p-mirror').querySelectorAll('.gk-root > header button[role="switch"]')).toHaveLength(1);
    const themes = [...row('p-lights').querySelectorAll('.gk-root')].map((e) => e.getAttribute('data-theme'));
    expect(themes).toEqual(['dark', 'light']);
  });

  it('shows the real candle for each tab; first tab selected, only one selected', () => {
    for (const [i, s] of CANDLE_STATES.entries()) {
      cleanup();
      render(<ShowcaseApp />);
      const tabs = within(row('p-candle')).getAllByRole('tab');
      expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
      fireEvent.click(tabs[i] as HTMLElement);
      expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
      expect(tabs[i]?.getAttribute('aria-selected')).toBe('true');
      const alone = render(
        <Candle
          {...(s.verdict === undefined ? {} : { verdict: s.verdict })}
          {...(s.claims === undefined ? {} : { claims: s.claims })}
        />,
      );
      const expected = ser(alone.container.querySelector('section.gk-candle'));
      alone.unmount();
      expect(ser(row('p-candle').querySelector('section.gk-candle'))).toBe(expected);
    }
  });

  it('the Blacklight switch reveals hidden letters', () => {
    render(<ShowcaseApp />);
    const sw = (): HTMLElement => row('p-blacklight').querySelector(BL_SWITCH) as HTMLElement;
    const before = ser(row('p-blacklight'));
    fireEvent.click(sw());
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(ser(row('p-blacklight'))).not.toBe(before);
  });

  it('opens a seance and goes back', () => {
    render(<ShowcaseApp />);
    const g = row('p-grave');
    fireEvent.click(g.querySelectorAll<HTMLElement>('button.gk-tombstone')[0] as HTMLElement);
    expect(g.querySelector('section.gk-seance')).not.toBeNull();
    fireEvent.click(g.querySelector('section.gk-seance .gk-header button.gk-button') as HTMLElement);
    expect(g.querySelector('section.gk-seance')).toBeNull();
    expect(g.querySelectorAll('button.gk-tombstone')).toHaveLength(2);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});

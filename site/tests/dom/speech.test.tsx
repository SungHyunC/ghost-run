import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SpeechBar } from '../../src/components/walk/Cards';
import { Theater } from '../../src/components/walk/Theater';
import runsJson from '../../src/data/runs.json';
import { narration, stepLabel } from '../../src/data/narration';
import { toWalkRuns } from '../../src/data/walk-records';
import type { RunsFile } from '../../src/data/types';
import { settle } from '../../src/engine/script';
import type { WalkView } from '../../src/engine/types';
import { effectsText } from '../../src/engine/useWalk';

const rec = toWalkRuns(runsJson as unknown as RunsFile).worlds.shell;

afterEach(cleanup);

const view = (step: number): WalkView => {
  const state = settle(rec, step);
  return { ...state, ward: { id: rec.ward.id, effectsOutside: effectsText(rec, state) } };
};

describe('the speech bar', () => {
  it('is an empty live region before step 1', () => {
    const { container } = render(<SpeechBar narration={[]} step={-1} />);
    const p = container.querySelector('#sayt');
    expect(p?.getAttribute('aria-live')).toBe('polite');
    expect(p?.textContent).toBe('');
    expect(p?.querySelector('small')).toBeNull();
  });

  it.each([0, 1, 2, 3, 4])('step %i: the label is inside #sayt, above the narration', (step) => {
    const { container } = render(<SpeechBar narration={narration(rec, step)} step={step} />);
    const p = container.querySelector('#sayt');
    expect(p?.querySelector('small')?.textContent).toBe(stepLabel(step));
    expect(p?.firstElementChild?.tagName).toBe('SMALL');
    expect(p?.textContent).toBe(
      stepLabel(step) +
        narration(rec, step)
          .map((s) => s.text)
          .join(''),
    );
  });

  it('changes once per step: the region content differs between steps and holds no typed characters', () => {
    const texts: string[] = [];
    for (const step of [0, 1, 2, 3, 4]) {
      const { container, unmount } = render(
        <Theater view={{ ...view(step), term: { visible: true, typed: 'TYPED-MARK', caret: true } }} goText="go" reality={null} copy={null} />,
      );
      const region = container.querySelector('#sayt');
      texts.push(region?.textContent ?? '');
      expect(region?.textContent).not.toContain('TYPED-MARK');
      expect(container.querySelector('#term')?.textContent).toContain('TYPED-MARK');
      expect(region?.contains(container.querySelector('#term'))).toBe(false);
      unmount();
    }
    expect(new Set(texts).size).toBe(5);
  });

  it('holds markup only as text', () => {
    const { container } = render(
      <SpeechBar narration={[{ kind: 'text', text: '<img src=x onerror=1>' }, { kind: 'code', text: 'ls' }]} step={1} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('#sayt code')?.textContent).toBe('ls');
  });
});

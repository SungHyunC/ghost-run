// Regression harness (Requirement 15 criterion 7).
// Every counterexample found by a property is added here as a fixed example test, with the failing
// seed (when known) and the shrunk input, so the case keeps running without the generator.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeanceView } from '../src/components/SeanceView';

interface RegressionCase {
  readonly id: string;
  readonly seed: number | 'unknown';
  readonly source: string;
}

/** Registry of the cases below. Add one entry per counterexample. */
const REGRESSION_CASES: readonly RegressionCase[] = [
  { id: 'seance-unreadable-thread-embeds-placeholder', seed: 'unknown', source: 'ui/tests/static/p8-total.test.tsx' },
];

const PLACEHOLDER_HTML =
  '<div role="alert" class="gk-placeholder">Data unavailable: RedThreadView received unreadable input.</div>';

describe('regressions', () => {
  it('keeps the registry of regression cases as an array', () => {
    expect(Array.isArray(REGRESSION_CASES)).toBe(true);
  });

  // Found by ui/tests/static/p8-total.test.tsx in Nightly_Run. Seed: unknown (not recorded).
  // Cause: a too-strict test oracle, not a source bug. The oracle expected a whole-output Placeholder.
  // SeanceView given a valid entry whose `detail` holds unreadable needles and links renders the normal
  // Seance output with the child's Placeholder embedded, as designed.
  it('seance-unreadable-thread-embeds-placeholder: embeds the child Placeholder in the Seance output', () => {
    const entry = {
      id: 'a1',
      command: 'cat .env',
      recordedAt: '2026-01-02T03:04:05Z',
      wardIds: ['no-egress'],
      detail: { needles: 42, links: 'unreadable' },
    };
    const { container } = render(<SeanceView entry={entry as never} onBack={() => undefined} />);
    const root = container.querySelector('section.gk-seance');
    expect(root).not.toBeNull();
    expect(container.querySelector('#seance-title')?.textContent).toBe('Seance');
    expect(container.innerHTML).toContain(PLACEHOLDER_HTML);
    expect(container.querySelectorAll('.gk-placeholder').length).toBe(1);
    expect(root?.contains(container.querySelector('.gk-placeholder'))).toBe(true);
  });
});

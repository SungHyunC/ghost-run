/** @vitest-environment jsdom */
// Example tests of the possession panel, wards editor, and Graveyard panel (task 14.2).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { PageServices } from '../../src/controller';
import { BLACKLIGHT_NO_FINDINGS_TEXT, STALE_WARDS_TEXT, WARDS_EDITOR_LABEL } from '../../src/texts';
import { DEFAULT_WARDS_TEXT } from '../../src/wards/wards-editor';

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});
afterEach(cleanup);

function services(): PageServices {
  return {
    sql,
    clock: () => '2030-01-02T03:04:05Z',
    timers: {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => {
        globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>);
      },
    },
    download: () => undefined,
  };
}

function candleState(container: HTMLElement): string | null {
  return container.querySelector('[data-candle-state]')?.getAttribute('data-candle-state') ?? null;
}

async function runScenario(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, label: RegExp) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('button', { name: 'Run ghost' }));
  await waitFor(() => {
    expect(candleState(container)).not.toBeNull();
    expect(container.querySelector('[data-candle-state="out"], [data-candle-state="lit"], [data-candle-state="flickering"]')).not.toBeNull();
  });
}

describe('possession panel', () => {
  it('traces Scenario 3 to the README, shows hidden text with the blacklight, and purify clears it', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={services()} />);
    await runScenario(user, container, /3\. /);
    await waitFor(() => {
      expect(candleState(container)).toBe('out');
    });
    const thread = screen.getByRole('region', { name: 'Red thread' });
    expect(thread.textContent).toContain('README.md');

    // The hidden sentences stay out of the page until the Blacklight switch is on.
    expect(screen.getByRole('switch', { name: 'Blacklight' }).getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('.gk-marker')).toBeNull();
    // The disclaimer is shown once, by the ui kit.
    expect(screen.getAllByText('Text analysis does not catch every injection.')).toHaveLength(1);

    await user.click(screen.getByRole('switch', { name: 'Blacklight' }));
    expect(screen.getByRole('switch', { name: 'Blacklight' }).getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('.gk-marker')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Purify' }));
    expect(screen.getByText(BLACKLIGHT_NO_FINDINGS_TEXT)).toBeTruthy();
    expect(container.querySelector('.gk-marker')).toBeNull();
    // Purify does not run the plan and adds no tombstone.
    expect(container.querySelectorAll('.gk-tombstone')).toHaveLength(1);
  });
});

describe('wards editor', () => {
  it('shows a parse error with the stale label, then a fixing edit clears it', async () => {
    const { container } = render(<App services={services()} />);
    const editor = screen.getByLabelText(WARDS_EDITOR_LABEL);
    fireEvent.change(editor, { target: { value: 'wards: [' } });
    const alert = await screen.findByRole('alert', { name: 'wards.yaml errors' });
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(screen.getByText(STALE_WARDS_TEXT)).toBeTruthy();
    expect(container.querySelector('[data-wards-gutter]')?.textContent).toContain('\u2716');

    fireEvent.change(editor, { target: { value: DEFAULT_WARDS_TEXT } });
    await waitFor(() => {
      expect(screen.queryByRole('alert', { name: 'wards.yaml errors' })).toBeNull();
    });
    expect(screen.queryByText(STALE_WARDS_TEXT)).toBeNull();
  });

  it('loosening a ward lets Scenario 1 pass and calls no ward set safe', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={services()} />);
    await runScenario(user, container, /1\. /);
    await waitFor(() => {
      expect(candleState(container)).toBe('out');
    });
    const loosened = DEFAULT_WARDS_TEXT.replace('max_rows_lost: 0', 'max_rows_lost: 1000000');
    expect(loosened).not.toBe(DEFAULT_WARDS_TEXT);
    fireEvent.change(screen.getByLabelText(WARDS_EDITOR_LABEL), { target: { value: loosened } });
    await waitFor(() => {
      expect(candleState(container)).not.toBe('out');
    });
    expect(screen.queryByText(/(ward set|wards?|plan) (is|are) safe/i)).toBeNull();
    // An edit-caused re-run adds no tombstone.
    expect(container.querySelectorAll('.gk-tombstone')).toHaveLength(1);
  });
});

describe('graveyard panel', () => {
  it('opens the seance of a blocked run by keyboard and returns focus on Back to graveyard', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={services()} />);
    await runScenario(user, container, /1\. /);
    await waitFor(() => {
      expect(container.querySelectorAll('.gk-tombstone')).toHaveLength(1);
    });
    const tombstone = container.querySelector<HTMLElement>('.gk-tombstone');
    tombstone?.focus();
    await user.keyboard('{Enter}');
    const back = await screen.findByRole('button', { name: 'Back to graveyard' });
    expect(container.querySelector('.gk-tombstone')).toBeNull();

    back.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(container.querySelectorAll('.gk-tombstone')).toHaveLength(1);
    });
    await waitFor(() => {
      expect(document.activeElement?.classList.contains('gk-tombstone')).toBe(true);
    });
  });
});

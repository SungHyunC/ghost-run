/** @vitest-environment jsdom */
// The Graveyard is opened and closed by keyboard alone (Requirements 2.3, 2.5, 16.5).
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { PageServices } from '../../src/controller';

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

describe('Graveyard by keyboard', () => {
  it('opens a tombstone with Enter or Space and closes the seance with Enter on Back to graveyard', async () => {
    const user = userEvent.setup();
    const { container } = render(createElement(App, { services: services() }));
    await user.click(screen.getByRole('button', { name: /^1\. / }));
    await user.click(screen.getByRole('button', { name: 'Run ghost' }));
    await waitFor(() => {
      expect(container.querySelectorAll('.gk-tombstone')).toHaveLength(1);
    });

    // Tab order reaches the tombstone without a pointer.
    const tombstone = container.querySelector<HTMLElement>('.gk-tombstone');
    expect(tombstone).not.toBeNull();
    tombstone?.focus();
    expect(document.activeElement).toBe(tombstone);

    for (const key of ['{Enter}', ' ']) {
      document.querySelector<HTMLElement>('.gk-tombstone')?.focus();
      await user.keyboard(key);
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
    }
  });
});

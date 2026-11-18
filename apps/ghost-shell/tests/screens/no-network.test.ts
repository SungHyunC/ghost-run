/** @vitest-environment jsdom */
// No network call while Scenarios 1 to 5 run (Requirements 17.7, 19.6).
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { PageServices } from '../../src/controller';

let sql: InlineSqlExecutor;
beforeAll(async () => {
  // The bundled wasm is loaded here, before the network functions are replaced.
  sql = await initInlineSql();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe('no network', () => {
  it('runs Scenarios 1 to 5 without a fetch, XMLHttpRequest, WebSocket, or sendBeacon call', async () => {
    const calls: string[] = [];
    const thrower = (name: string) => () => {
      calls.push(name);
      throw new Error(`network call: ${name}`);
    };
    vi.stubGlobal('fetch', thrower('fetch'));
    vi.stubGlobal('XMLHttpRequest', thrower('XMLHttpRequest'));
    vi.stubGlobal('WebSocket', thrower('WebSocket'));
    Object.defineProperty(navigator, 'sendBeacon', { value: thrower('sendBeacon'), configurable: true });

    const user = userEvent.setup();
    const { container } = render(createElement(App, { services: services() }));
    for (let n = 1; n <= 5; n += 1) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${n}\\. `) }));
      await user.click(screen.getByRole('button', { name: 'Run ghost' }));
      await waitFor(() => {
        expect(container.querySelector('[data-candle-state="out"], [data-candle-state="lit"], [data-candle-state="flickering"]')).not.toBeNull();
      });
    }
    expect(calls).toEqual([]);
  });
});

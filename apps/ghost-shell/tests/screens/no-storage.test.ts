/** @vitest-environment jsdom */
// No storage write while Scenarios 1 to 5 run (Requirements 17.7, 19.6).
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

describe('no storage', () => {
  it('writes no localStorage, sessionStorage, IndexedDB, or cookie value', async () => {
    const hits: string[] = [];
    const spyStore = (name: 'localStorage' | 'sessionStorage') => {
      const proto = Object.getPrototypeOf(window[name]) as Storage;
      for (const m of ['setItem', 'removeItem', 'clear'] as const) {
        vi.spyOn(proto, m).mockImplementation(() => {
          hits.push(`${name}.${m}`);
        });
      }
    };
    spyStore('localStorage');
    vi.stubGlobal(
      'indexedDB',
      new Proxy({}, { get: (_t, p) => { hits.push(`indexedDB.${String(p)}`); return undefined; } }),
    );
    const cookieSet = vi.fn((v: string) => {
      hits.push(`cookie=${v}`);
    });
    Object.defineProperty(document, 'cookie', { get: () => '', set: cookieSet, configurable: true });

    const user = userEvent.setup();
    const { container } = render(createElement(App, { services: services() }));
    for (let n = 1; n <= 5; n += 1) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${n}\\. `) }));
      await user.click(screen.getByRole('button', { name: 'Run ghost' }));
      await waitFor(() => {
        expect(container.querySelector('[data-candle-state="out"], [data-candle-state="lit"], [data-candle-state="flickering"]')).not.toBeNull();
      });
    }
    expect(hits).toEqual([]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

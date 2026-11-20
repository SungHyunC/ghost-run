/** @vitest-environment jsdom */
// The Korean page (ko.html): the same app with the Korean dictionary.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { PageServices } from '../../src/controller';
import { KO } from '../../src/i18n/strings';

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
    download: () => {},
  };
}

describe('Korean page', () => {
  it('marks the page Korean, keeps the product name, and links to the English page', () => {
    const { container } = render(<App services={services()} locale="ko" />);
    expect(container.querySelector('main')?.getAttribute('lang')).toBe('ko');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ghost Shell');
    expect(screen.getByText(KO.tagline)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'English' });
    expect(link.getAttribute('href')).toBe('./');
    expect(screen.getByText(KO.noRun)).toBeTruthy();
  });

  it('keeps the kit classes on controls and no inline style', () => {
    const { container } = render(<App services={services()} locale="ko" />);
    for (const b of container.querySelectorAll('main button:not([role="switch"])')) expect(b.className).toContain('gk-button');
    expect(container.querySelector('main [style]')).toBeNull();
  });

  it('runs Scenario 1 from the Korean buttons to a blocked candle', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={services()} locale="ko" />);
    await user.click(screen.getByRole('button', { name: /1\. users 테이블 삭제/ }));
    await user.click(screen.getByRole('button', { name: '유령 실행' }));
    await waitFor(() => {
      expect(container.querySelector('[data-candle-state]')?.getAttribute('data-candle-state')).toBe('out');
    });
    expect(screen.getByLabelText(KO.messagePanel).textContent).toContain('no-data-loss');
    expect(container.querySelector('.ms-copy .ms-lost')?.textContent).toBe('-1,206, 테이블 삭제됨');
  });

  it('shows the empty-plan notice in Korean', async () => {
    const user = userEvent.setup();
    render(<App services={services()} locale="ko" />);
    await user.click(screen.getByRole('button', { name: '유령 실행' }));
    expect(screen.getByText('계획이 비어 있습니다. 먼저 명령을 추가하세요.')).toBeTruthy();
  });

  it('the English page links to the Korean page', () => {
    render(<App services={services()} />);
    const link = screen.getByRole('link', { name: '한국어' });
    expect(link.getAttribute('href')).toBe('./ko.html');
  });
});

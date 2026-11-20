/** @vitest-environment jsdom */
// Example tests of the app shell (task 14.1): scenario run, fixed plan, empty plan, plan file load and download.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor } from '@ghost-run/playground-shell';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { PageServices } from '../../src/controller';
import { parsePlanFile } from '../../src/plan/plan-file';
import { APP_TAGLINE, DOCKER_BOX_NOT_USED_TEXT, EMPTY_PLAN_TEXT, MESSAGE_PANEL_LABEL, NO_RUN_TEXT } from '../../src/texts';

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});
afterEach(cleanup);

interface Harness {
  readonly services: PageServices;
  readonly downloads: { fileName: string; text: string }[];
}

function harness(): Harness {
  const downloads: { fileName: string; text: string }[] = [];
  const services: PageServices = {
    sql,
    clock: () => '2030-01-02T03:04:05Z',
    timers: {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => {
        globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>);
      },
    },
    download: (fileName, text) => downloads.push({ fileName, text }),
  };
  return { services, downloads };
}

function candleState(container: HTMLElement): string | null {
  return container.querySelector('[data-candle-state]')?.getAttribute('data-candle-state') ?? null;
}

describe('Ghost Shell app shell', () => {
  it('shows the Docker box text and starts in the dark theme', () => {
    const { container } = render(<App services={harness().services} />);
    expect(screen.getByText(DOCKER_BOX_NOT_USED_TEXT)).toBeTruthy();
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('dark');
  });

  it('renders the Ghost Run+ home link in the header with a relative target', () => {
    const { container } = render(<App services={harness().services} />);
    const link = within(container.querySelector('header.gs-hero') as HTMLElement).getByText('Ghost Run+ home');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('../');
  });

  it('shows the title, the tagline, and only the no-run text before the first run', () => {
    const { container } = render(<App services={harness().services} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ghost Shell');
    expect(screen.getByText(APP_TAGLINE)).toBeTruthy();
    expect(screen.getByText(NO_RUN_TEXT)).toBeTruthy();
    expect(container.querySelector('[data-candle-state]')).toBeNull();
    expect(screen.queryByText(/Isolation status unknown/)).toBeNull();
  });

  it('uses the ui kit classes on buttons, inputs, and textareas and no inline color', () => {
    const { container } = render(<App services={harness().services} />);
    for (const b of container.querySelectorAll('main button:not([role="switch"])')) expect(b.className).toContain('gk-button');
    for (const i of container.querySelectorAll('main input')) expect(i.className).toContain('gk-input');
    for (const t of container.querySelectorAll('main textarea')) expect(t.className).toContain('gk-textarea');
    expect(container.querySelector('main [style]')).toBeNull();
  });

  it('runs Scenario 1 to a block verdict, then Apply fixed plan moves the candle to pass', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={harness().services} />);
    await user.click(screen.getByRole('button', { name: /1\. Drop the users table/ }));
    await user.click(screen.getByRole('button', { name: 'Run ghost' }));
    await waitFor(() => {
      expect(candleState(container)).toBe('out');
    });
    expect(screen.getByLabelText(MESSAGE_PANEL_LABEL).textContent).toContain('no-data-loss');
    expect(screen.getByText(/failed|exit 0/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Apply fixed plan' }));
    await waitFor(() => {
      expect(candleState(container)).toBe('lit');
    });
  });

  it('shows the empty-plan text and does not run', async () => {
    const user = userEvent.setup();
    const { container } = render(<App services={harness().services} />);
    await user.click(screen.getByRole('button', { name: 'Run ghost' }));
    expect(screen.getByText(EMPTY_PLAN_TEXT)).toBeTruthy();
    expect(container.querySelector('[data-candle-state="out"]')).toBeNull();
  });

  it('shows an alert for a plan file that does not parse and keeps the plan', async () => {
    const user = userEvent.setup();
    render(<App services={harness().services} />);
    await user.click(screen.getByRole('button', { name: /4\. Run the tests/ }));
    const content = 'this is not json';
    const file = new File([content], 'bad.json', { type: 'application/json' });
    // jsdom 26 has no Blob.text(); the page uses the browser method.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
    await user.upload(screen.getByLabelText(/Load plan file/), file);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('[invalid-json]');
    expect(within(screen.getByRole('list', { name: 'Plan steps' })).getByText('npm test')).toBeTruthy();
  });

  it('Download plan file offers text that parses back', async () => {
    const user = userEvent.setup();
    const h = harness();
    render(<App services={h.services} />);
    await user.click(screen.getByRole('button', { name: /2\. Remove data and build/ }));
    await user.click(screen.getByRole('button', { name: 'Download plan file' }));
    expect(h.downloads).toHaveLength(1);
    const parsed = parsePlanFile(h.downloads[0]?.text ?? '');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.plan.actions[0]?.command).toContain('rm -rf');
  });

  it('adds a typed command to the plan and clears the input', async () => {
    const user = userEvent.setup();
    render(<App services={harness().services} />);
    const input = screen.getByLabelText('Command');
    await user.type(input, 'npm test');
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(within(screen.getByRole('list', { name: 'Plan steps' })).getByText('npm test')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
  });
});

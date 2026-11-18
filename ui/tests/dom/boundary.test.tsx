// Task 8.18: error boundary and non-function callbacks (jsdom, role-based queries).
// Requirements 14.4, 14.7.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graveyard } from '../../src/components/Graveyard';
import { KitBoundary } from '../../src/components/KitBoundary';
import { KitRoot } from '../../src/components/KitRoot';
import { SeanceView } from '../../src/components/SeanceView';
import type { GraveEntry } from '../../src/types';

const SECRET_MESSAGE = 'sk-CANARY-boom123';
const SECRET_DATA = 'sk-CANARY-data456';

const entry: GraveEntry = {
  id: 'id-0',
  command: 'rm -rf dir0',
  recordedAt: '2026-01-02T03:00:00Z',
  wardIds: ['protect-data'],
};

function Boom(props: { data: string }): never {
  void props;
  throw new Error(SECRET_MESSAGE);
}

describe('KitBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; keep the output readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a throwing child yields only the Placeholder, with no text from the error or the data', () => {
    const { container } = render(
      <KitBoundary name="Candle">
        <Boom data={SECRET_DATA} />
      </KitBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Data unavailable: Candle received unreadable input.');
    expect(container.textContent).toBe(alert.textContent);
    expect(container.innerHTML).not.toContain(SECRET_MESSAGE);
    expect(container.innerHTML).not.toContain(SECRET_DATA);
    expect(container.innerHTML).not.toContain('Boom');
  });

  it('sibling components keep rendering when one child throws', () => {
    render(
      <KitRoot>
        <KitBoundary name="MirrorWorld">
          <Boom data={SECRET_DATA} />
        </KitBoundary>
        <Graveyard entries={[entry]} onOpenSeance={() => undefined} />
      </KitRoot>,
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toBe('Data unavailable: MirrorWorld received unreadable input.');
    expect(screen.getByRole('heading', { name: 'Graveyard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open seance for blocked command rm -rf dir0/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Lights on' })).toBeTruthy();
  });
});

describe('non-function callbacks', () => {
  it.each([undefined, null, 'open', 42, {}])('onOpenSeance = %j: activation is a no-op without throwing', async (cb) => {
    const user = userEvent.setup();
    render(<Graveyard entries={[entry]} onOpenSeance={cb as never} />);
    const button = screen.getByRole('button', { name: /Open seance for blocked command rm -rf dir0/ });
    await user.click(button);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: /Open seance/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([undefined, null, 'back', 42, {}])('onBack = %j: activation is a no-op without throwing', async (cb) => {
    const user = userEvent.setup();
    render(<SeanceView entry={entry} onBack={cb as never} />);
    const back = screen.getByRole('button', { name: /graveyard/i });
    await user.click(back);
    back.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

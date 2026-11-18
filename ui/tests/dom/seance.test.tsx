import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeanceView } from '../../src/components/SeanceView';
import { getFocusReturnStore } from '../../src/hooks/useFocusReturn';

const entry = {
  id: 'a1',
  command: 'rm -rf data',
  recordedAt: '2026-01-02T03:04:05Z',
  wardIds: ['protect-data'],
};

describe('SeanceView (DOM)', () => {
  it('focuses the heading on mount and lists absent parts', () => {
    render(<SeanceView entry={entry} onBack={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Seance' }));
    expect(screen.getByText('rm -rf data')).toBeTruthy();
    expect(screen.getByText('claims not recorded')).toBeTruthy();
    expect(screen.getByText('changes not recorded')).toBeTruthy();
  });

  it('calls onBack and returns focus to the opening tombstone', () => {
    const tomb = document.createElement('button');
    tomb.setAttribute('data-tombstone-index', '3');
    document.body.appendChild(tomb);
    getFocusReturnStore().remember(3);
    const onBack = vi.fn();
    render(<SeanceView entry={entry} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to graveyard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(tomb);
    tomb.remove();
  });

  it('restores focus on unmount', () => {
    const tomb = document.createElement('button');
    tomb.setAttribute('data-tombstone-index', '4');
    document.body.appendChild(tomb);
    getFocusReturnStore().remember(4);
    const { unmount } = render(<SeanceView entry={entry} onBack={() => undefined} />);
    unmount();
    expect(document.activeElement).toBe(tomb);
    tomb.remove();
  });

  it('treats a non-function onBack as a no-op', () => {
    render(<SeanceView entry={entry} onBack={undefined as never} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Back to graveyard' }))).not.toThrow();
  });

  it('shows a Placeholder for an unreadable entry', () => {
    render(<SeanceView entry={null as never} onBack={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toContain('SeanceView');
  });
});

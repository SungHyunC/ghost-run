import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Graveyard } from '../../src/components/Graveyard';
import { getFocusReturnStore } from '../../src/hooks/useFocusReturn';

const entries = [
  { id: 'a1', command: 'rm -rf data', recordedAt: '2026-01-02T03:04:05Z', wardIds: ['protect-data'] },
  { id: 'b2', command: 'cat .env', recordedAt: '2026-01-03T03:04:05Z', wardIds: ['no-egress'] },
];

describe('Graveyard (DOM)', () => {
  it('calls onOpenSeance once with the original id and returns focus', () => {
    const onOpenSeance = vi.fn();
    render(<Graveyard entries={entries} onOpenSeance={onOpenSeance} />);
    const btn = screen.getByRole('button', { name: /rm -rf data/ });
    fireEvent.click(btn);
    expect(onOpenSeance).toHaveBeenCalledTimes(1);
    expect(onOpenSeance).toHaveBeenCalledWith('a1');
    expect(btn.getAttribute('data-tombstone-index')).toBe('0');
    getFocusReturnStore().restore();
    expect(document.activeElement).toBe(btn);
  });

  it('does not throw when onOpenSeance is not a function', () => {
    render(<Graveyard entries={entries} onOpenSeance={undefined as never} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /cat \.env/ }))).not.toThrow();
  });
});

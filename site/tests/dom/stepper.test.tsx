import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Stepper } from '../../src/components/walk/Stepper';

afterEach(cleanup);

const buttons = () => screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement);

describe('Stepper', () => {
  it('is an ordered list of five buttons with numbers and labels', () => {
    const { container } = render(<Stepper step={-1} onJump={() => undefined} />);
    expect(container.querySelector('ol.stepper#rail')).not.toBeNull();
    const b = buttons();
    expect(b.map((x) => x.querySelector('i')?.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(b.map((x) => x.querySelector('span')?.textContent)).toEqual(['Copy', 'Run', 'Judge', 'Verdict', 'Fix & go']);
    expect(b.every((x) => x.parentElement?.tagName === 'LI')).toBe(true);
  });

  it('marks no step before the first step', () => {
    render(<Stepper step={-1} onJump={() => undefined} />);
    expect(buttons().some((x) => x.classList.contains('now') || x.classList.contains('done'))).toBe(false);
    expect(buttons().some((x) => x.hasAttribute('aria-current'))).toBe(false);
  });

  it('marks the current step now with aria-current and earlier steps done', () => {
    render(<Stepper step={2} onJump={() => undefined} />);
    const b = buttons();
    expect(b.map((x) => x.classList.contains('done'))).toEqual([true, true, false, false, false]);
    expect(b.map((x) => x.classList.contains('now'))).toEqual([false, false, true, false, false]);
    expect(b.map((x) => x.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null]);
  });

  it('jumps to the pressed step (0-based)', () => {
    const onJump = vi.fn();
    render(<Stepper step={0} onJump={onJump} />);
    fireEvent.click(buttons()[3] as HTMLButtonElement);
    expect(onJump).toHaveBeenCalledWith(3);
  });

  it('disables the last steps for an unsupported run: aria-disabled, and no jump', () => {
    const onJump = vi.fn();
    render(<Stepper step={0} disabledSteps={4} onJump={onJump} />);
    const b = buttons();
    expect(b.map((x) => x.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true', 'true', 'true']);
    fireEvent.click(b[2] as HTMLButtonElement);
    expect(onJump).not.toHaveBeenCalled();
    fireEvent.click(b[0] as HTMLButtonElement);
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('keeps every step enabled when disabledSteps is 0', () => {
    render(<Stepper step={4} onJump={() => undefined} />);
    expect(buttons().some((x) => x.hasAttribute('aria-disabled'))).toBe(false);
  });

  it('has the disabled style and a 24 px hit area by class in the section CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'styles', '05-walkthrough.css'), 'utf8');
    expect(css).toContain('.stepper button[aria-disabled="true"]');
    expect(css).toMatch(/\.stepper button\{min-width:24px;min-height:24px\}/);
  });
});

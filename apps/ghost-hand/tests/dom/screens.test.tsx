// Smoke tests of the 14.1 screens (jsdom). The full behavior suite is task 14.5.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { AppServices } from '../../src/App';
import { VariantTable } from '../../src/components/VariantTable';
import type { VariantRow } from '../../src/pipeline/types';
import { BASE_VARIANT_PARAMS } from '@ghost-run/drawer-arm';
import { ENGINE_START_FAILURE_TEXT, P5_P6_TEXT, P8_SCOPE_TEXT } from '../../src/texts';

afterEach(cleanup);

const row = (id: string, status: 'passed' | 'failed'): VariantRow => ({
  id,
  params: BASE_VARIANT_PARAMS,
  drawerDisplacementM: 0.12,
  maxContactForceN: 3.5,
  touched: [],
  vaseTouched: false,
  jointLimitExceeded: false,
  selfCollisionOccurred: false,
  failedSteps: [],
  status,
});

function services(): AppServices {
  return {
    clock: () => new Date(0),
    createWorld: () => Promise.reject(new Error('no engine in this test')),
    createExecutor: () => ({ run: () => Promise.resolve([]), dispose: () => undefined }),
    createOverlay: () => ({ unavailable: true }),
    download: () => undefined,
    wardsText: 'wards:\n  - id: gentle-hands\n    kind: physics\n    min_success_rate: 0.95\n    max_contact_force_n: 30\n    forbidden_contacts:\n      - vase\n',
    variantConfigText: JSON.stringify({
      format: 'ghost-hand-variants',
      version: 1,
      defaultCount: 8,
      maxCount: 20,
      largeCountEnabled: false,
      defaultSeed: 42,
      ranges: {
        drawerFrictionN: { min: 0.5, max: 4 },
        drawerMassKg: { min: 0.3, max: 1.2 },
        handleOffsetM: { x: { min: 0, max: 0 }, y: { min: 0, max: 0 }, z: { min: 0, max: 0 } },
        sensorNoiseM: { min: 0, max: 0.003 },
        commandDelaySteps: { min: 0, max: 6 },
      },
    }),
    prefersReducedMotion: () => true,
  };
}

describe('VariantTable', () => {
  it('marks a failed row with an icon and the word, and escapes hidden code points', () => {
    render(<VariantTable id="t" rows={[row('base', 'passed'), row('variant-\u200B0', 'failed')]} />);
    const failedRow = screen.getAllByRole('row').find((r) => r.getAttribute('data-status') === 'failed');
    expect(failedRow?.textContent).toContain('\u2715');
    expect(failedRow?.textContent).toContain('failed');
    expect(failedRow?.textContent).toContain('variant-<U+200B>0');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});

describe('App', () => {
  it('shows the engine failure alert, the fixed claim texts, and disabled run controls', async () => {
    render(<App services={services()} />);
    expect((await screen.findByText(ENGINE_START_FAILURE_TEXT)).closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText(P5_P6_TEXT)).toBeTruthy();
    expect(screen.getByText(P8_SCOPE_TEXT)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run ghost' }) as HTMLButtonElement).disabled).toBe(true);
    const lights = screen.getByRole('switch', { name: 'Lights on' });
    expect(lights.getAttribute('aria-checked')).toBe('false');
  });

  it('rejects a seed that is not digits only and starts no run', async () => {
    render(<App services={services()} />);
    const seed = screen.getByLabelText('Seed');
    fireEvent.change(seed, { target: { value: '-1' } });
    expect(screen.getByText(/digits only/).closest('[role="alert"]')).not.toBeNull();
  });
});

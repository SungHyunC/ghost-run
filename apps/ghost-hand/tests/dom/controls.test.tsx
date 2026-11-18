// Task 14.2: plan controls and the reference arm panel in the page (jsdom).
// The physics engine cannot step inside jsdom (its typed arrays belong to another realm), so the engine start
// is made to fail here and only the engine-free behavior is checked. The demo sequence, the execute gate, and the
// diff comparison run against the real engine in tests/model/reference-controls.test.ts.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { SCENARIOS } from '../../src/plan/scenarios';
import type { AppServices } from '../../src/App';
import {
  P2_MATCH_TEXT,
  PLAN_ORIGIN_RECORDED_TEXT,
  PLAN_ORIGIN_SCRIPTED_TEXT,
  REFERENCE_SIMULATION_TEXT,
} from '../../src/texts';

afterEach(cleanup);

function services(): AppServices {
  return {
    clock: () => new Date(0),
    createWorld: () => Promise.reject(new Error('no engine in this test')),
    createExecutor: () => ({ run: () => Promise.resolve([]), dispose: () => undefined }),
    createOverlay: () => ({ unavailable: true }),
    download: () => undefined,
    wardsText:
      'wards:\n  - id: gentle-hands\n    kind: physics\n    min_success_rate: 0.95\n    max_contact_force_n: 30\n    forbidden_contacts:\n      - vase\n',
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
    demoPauseMs: 0,
  };
}

const button = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;

const RECORDED_PLAN = JSON.stringify({
  format: 'ghost-hand-plan',
  version: 1,
  name: 'recorded revision',
  origin: 'recorded',
  actions: [{ type: 'release' }],
  recordedWith: 'test session',
  revisionOf: 'fast pull',
});

describe('plan controls and the reference arm panel', () => {
  it('names the reference arm as a simulation and keeps execute, reset, and demo off without an engine', () => {
    render(<App services={services()} />);
    expect(screen.getByText(REFERENCE_SIMULATION_TEXT)).toBeTruthy();
    expect(button('Execute on reference arm').disabled).toBe(true);
    expect(button('Reset reference arm').disabled).toBe(true);
    expect(button('Play demo').disabled).toBe(true);
    expect(screen.queryByText(P2_MATCH_TEXT)).toBeNull();
  });

  it('loads each scenario with its plan and the origin text of its file, and keeps execute off', () => {
    render(<App services={services()} />);
    for (const scenario of SCENARIOS) {
      const name = scenario.label;
      expect(['recorded', 'scripted']).toContain(scenario.plan.origin);
      const expected = scenario.plan.origin === 'recorded' ? PLAN_ORIGIN_RECORDED_TEXT : PLAN_ORIGIN_SCRIPTED_TEXT;
      fireEvent.click(button(name));
      expect(screen.getByText(expected)).toBeTruthy();
      expect(screen.getByRole('list', { name: 'Plan actions' }).children.length).toBe(5);
      expect(button('Execute on reference arm').disabled).toBe(true);
    }
    expect(screen.getAllByText('slow pull, gentle grip').length).toBeGreaterThan(1);
  });

  it('loads a recorded Plan_File and shows the recorded text', async () => {
    render(<App services={services()} />);
    const input = screen.getByLabelText('Load plan file') as HTMLInputElement;
    // jsdom has no Blob.text.
    const file = Object.assign(new File([RECORDED_PLAN], 'recorded.plan.json', { type: 'application/json' }), {
      text: () => Promise.resolve(RECORDED_PLAN),
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(PLAN_ORIGIN_RECORDED_TEXT)).toBeTruthy();
    });
    expect(screen.getByText('recorded revision')).toBeTruthy();
  });
});

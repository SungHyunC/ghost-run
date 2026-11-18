/// <reference types="node" />
// Task 14.5: DOM behavior tests of the Ghost Hand page (jsdom, role-based queries, no axe).
// jsdom cannot run the real physics engine (its typed arrays belong to another realm), so the page gets a fake
// world and a fake variant executor through the injected services. The fakes decide the verdict only: the first
// scenario plan touches the vase in every variant (block), every other plan passes. The CSS checks parse the
// stylesheets of the page and of the ui kit.
// Validates: Requirements 10.3, 10.6, 10.10, 11.5, 12.7, 13.5, 13.8, 13.11, 14.8, 14.9, 15.1, 15.2, 15.3, 15.4,
// 15.5, 15.6, 15.7, 18.4.
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_VARIANT_PARAMS,
  STATIC_LAYOUT,
  WORLD_CONFIG,
  emptyMonitors,
} from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandState, GhostHandWorld, VariantJob, VariantOutcome } from '@ghost-run/drawer-arm';
import { App } from '../../src/App';
import type { AppServices } from '../../src/App';
import type { Capabilities } from '../../src/capabilities';
import { createOverlayRenderer } from '../../src/overlay/renderer';
import { contrastRatio } from '../../src/overlay/wcag';
import { FIRST_SCENARIO } from '../../src/plan/scenarios';
import {
  DOCKER_TEXT,
  GRAVEYARD_DROP_TEXT,
  JOINT_LIMIT_INACTIVE_TEXT,
  P1_FAILURE_TEXT,
  P2_CHECK_SCOPE_TEXT,
  P2_MATCH_TEXT,
  P2_MISMATCH_TEXT,
  P2_SCOPE_TEXT,
  P2_TEXT_ENABLED,
  P5_P6_TEXT,
  P8_SCOPE_TEXT,
  PROVISIONAL_WORDING_TEXT,
  REFERENCE_SIMULATION_TEXT,
  WEBGL_FALLBACK_TEXT,
} from '../../src/texts';
import { liveRegionText } from '../../src/ui-text';

// ---- Capability states -------------------------------------------------------------------------------------------

const capState = vi.hoisted(() => ({ value: null as Capabilities | null }));

vi.mock('../../src/capabilities', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/capabilities')>();
  return { ...original, probeCapabilities: () => capState.value ?? original.probeCapabilities() };
});

const CAPS_FALLBACK: Capabilities = { jointSelfWard: false, claimsOptional: false, bannerNotApplicable: false };
const CAPS_LANDED: Capabilities = { jointSelfWard: true, claimsOptional: true, bannerNotApplicable: true };

beforeEach(() => {
  capState.value = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- Fakes ---------------------------------------------------------------------------------------------------------

interface Control {
  /** True: every fingerprint call returns a new value (a forced P1 difference). */
  differ: boolean;
}

const FIRST_PLAN_JSON = JSON.stringify(FIRST_SCENARIO.plan.actions);
const isBlockedPlan = (actions: readonly GhostHandAction[]): boolean => JSON.stringify(actions) === FIRST_PLAN_JSON;

function makeState(drawerM: number): GhostHandState {
  const integration = new Float64Array(STATIC_LAYOUT.qpos.offset + STATIC_LAYOUT.drawerQposIndex + 1);
  integration[STATIC_LAYOUT.qpos.offset + STATIC_LAYOUT.drawerQposIndex] = drawerM;
  return {
    schema: 1,
    variant: BASE_VARIANT_PARAMS,
    steps: 0,
    integration,
    poses: new Float64Array(0),
    controller: { jointTarget: [], fingerForceN: 0, holding: false },
    prng: 0,
    delayBuffer: [],
    delayHead: 0,
    monitors: emptyMonitors(),
  };
}

function createFakeWorld(control: Control): GhostHandWorld {
  let counter = 0;
  const nextId = (): string => `fake-${counter++}`;
  const world = {
    snapshot: () => Promise.resolve({ id: nextId(), state: makeState(0), result: { success: true as const } }),
    step: () =>
      Promise.resolve({ id: nextId(), state: makeState(WORLD_CONFIG.targetOpeningM), result: { success: true as const } }),
    diff: () => [],
    render: () => ({ kind: 'scene', entries: [] }),
    fingerprint: () => Promise.resolve(control.differ ? `fp-${counter++}` : 'fp'),
    effectsOutside: () => [],
    adopt: () => ({ id: nextId(), state: makeState(0), result: { success: true as const } }),
    frames: () => undefined,
    failureMonitors: () => undefined,
    stepNote: () => undefined,
    trajectory: () => undefined,
    releaseTraces: () => undefined,
    referenceExecute: () =>
      Promise.resolve({ changes: [], final: makeState(WORLD_CONFIG.targetOpeningM), trajectoryHash: '0'.repeat(64) }),
    resetReference: () => Promise.resolve(),
    heapBytes: () => 0,
    dispose: () => undefined,
  };
  return world as unknown as GhostHandWorld;
}

function outcomeFor(job: VariantJob): VariantOutcome {
  const blocked = isBlockedPlan(job.actions);
  return {
    index: job.index,
    params: job.params,
    finalDrawerM: WORLD_CONFIG.targetOpeningM,
    monitors: { ...emptyMonitors(), maxContactForceN: 2, touched: blocked ? ['vase'] : [] },
    failedSteps: [],
    firstTouch: blocked ? { vase: 0 } : {},
    trajectoryHash: '',
  };
}

const WARDS_TEXT =
  'wards:\n  - id: gentle-hands\n    kind: physics\n    min_success_rate: 0.95\n    max_contact_force_n: 30\n    forbidden_contacts:\n      - vase\n';

const VARIANT_CONFIG_TEXT = JSON.stringify({
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
});

function services(over: Partial<AppServices> = {}, control: Control = { differ: false }): AppServices {
  return {
    clock: () => new Date(0),
    createWorld: () => Promise.resolve(createFakeWorld(control)),
    createExecutor: () => ({
      run: (jobs) => Promise.resolve(jobs.map(outcomeFor)),
      dispose: () => undefined,
    }),
    createOverlay: () => ({ unavailable: true }),
    download: () => undefined,
    wardsText: WARDS_TEXT,
    variantConfigText: VARIANT_CONFIG_TEXT,
    prefersReducedMotion: () => true,
    demoPauseMs: 0,
    ...over,
  };
}

const button = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;
const FAST = 'fast pull';
const SLOW = 'slow pull, strong grip';
const BLOCK_LIVE = liveRegionText('out', 8, 8);
const PASS_LIVE = liveRegionText('lit', 0, 8);

function liveRegion(): HTMLElement {
  const el = document.querySelector('[role="status"][aria-live="polite"].gk-sr-only');
  if (!(el instanceof HTMLElement)) throw new Error('live region missing');
  return el;
}

/** Loads a scenario and runs the ghost; resolves when the run has finished. */
async function runScenario(name: string): Promise<void> {
  fireEvent.click(button(name));
  await runLoaded();
}

async function runLoaded(): Promise<void> {
  await waitFor(() => {
    expect(button('Run ghost').disabled).toBe(false);
  });
  fireEvent.click(button('Run ghost'));
  expect(button('Run ghost').disabled).toBe(true);
  await waitFor(() => {
    expect(button('Run ghost').disabled).toBe(false);
  });
}

function planFile(over: Record<string, unknown> = {}): File {
  const text = JSON.stringify({
    format: 'ghost-hand-plan',
    version: 1,
    name: 'loaded plan',
    origin: 'scripted',
    actions: [{ type: 'release' }],
    ...over,
  });
  // jsdom has no Blob.text.
  return Object.assign(new File([text], 'x.plan.json', { type: 'application/json' }), { text: () => Promise.resolve(text) });
}

function loadFile(file: File): void {
  fireEvent.change(screen.getByLabelText('Load plan file'), { target: { files: [file] } });
}

// ---- Accessibility helpers -----------------------------------------------------------------------------------------

function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(textOf).join('');
}

/** A small accessible-name computation: aria-label, aria-labelledby, label, content (aria-hidden skipped). */
function nameOf(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by !== null) {
    const text = by
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .map((n) => (n === null ? '' : textOf(n)))
      .join(' ')
      .trim();
    if (text !== '') return text;
  }
  const labels = Array.from(document.querySelectorAll('label')).filter(
    (l) => (el.id !== '' && l.htmlFor === el.id) || l.contains(el),
  );
  const labelText = labels.map(textOf).join(' ').trim();
  if (labelText !== '') return labelText;
  if (el instanceof HTMLTableElement) return el.caption === null ? '' : textOf(el.caption).trim();
  if (el instanceof HTMLInputElement || el instanceof HTMLCanvasElement) return '';
  return textOf(el).trim();
}

const TABBABLE = 'a[href],button,input,select,textarea,[tabindex]';

function tabbables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute('tabindex') !== '-1' && !el.hidden,
  );
}

// ---- CSS parsing ---------------------------------------------------------------------------------------------------

interface CssRule {
  readonly media: string | null;
  readonly selector: string;
  readonly body: string;
}

function parseCss(source: string): { rules: CssRule[]; keyframes: string[] } {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  const rules: CssRule[] = [];
  const keyframes: string[] = [];
  const walk = (src: string, media: string | null): void => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') depth -= 1;
        j += 1;
      }
      const prelude = src.slice(i, open).trim();
      const inner = src.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(inner, prelude);
      else if (prelude.startsWith('@keyframes')) keyframes.push(prelude);
      else for (const selector of prelude.split(',')) rules.push({ media, selector: selector.trim(), body: inner });
      i = j;
    }
  };
  walk(text, null);
  return { rules, keyframes };
}

function readCss(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const PAGE_CSS = readCss('../../src/page.css');
const KIT_CSS = ['kit.css', 'motion.css', 'theme.css'].map((f) => readCss(`../../../../ui/src/styles/${f}`));
const ALL_CSS = [PAGE_CSS, ...KIT_CSS];
const ALL_RULES = ALL_CSS.flatMap((css) => parseCss(css).rules);
const THEME_CSS = KIT_CSS[2] as string;

function themeTokens(theme: 'dark' | 'light'): Record<string, string> {
  const rule = parseCss(THEME_CSS).rules.find((r) => r.selector === `[data-theme='${theme}']`);
  const tokens: Record<string, string> = {};
  for (const m of (rule?.body ?? '').matchAll(/(--gk-[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1] as string] = m[2] as string;
  return tokens;
}

function declaration(body: string, property: string): string | null {
  const m = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(body);
  return m === null ? null : (m[1] as string).trim();
}

function seconds(value: string): number[] {
  return Array.from(value.matchAll(/(-?\d*\.?\d+)(ms|s)\b/g)).map((m) => Number(m[1]) * (m[2] === 'ms' ? 0.001 : 1));
}

// ---- Tests ---------------------------------------------------------------------------------------------------------

describe('keyboard operation (Requirements 15.1, 15.2)', () => {
  it('reaches every control in DOM order with native semantics, no positive tabindex, and no trap', async () => {
    render(<App services={services()} />);
    await runScenario(FAST);
    const order = tabbables();
    expect(order.length).toBeGreaterThan(8);
    // Tab order is DOM order only when no element sets a positive tabindex.
    for (const el of document.querySelectorAll('[tabindex]')) expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    expect(document.querySelector('[aria-modal="true"],[role="dialog"]')).toBeNull();
    for (const el of order) {
      el.focus();
      expect(document.activeElement).toBe(el);
      // Native buttons and inputs get Enter and Space from the browser; no custom key handler is needed.
      expect(['BUTTON', 'INPUT', 'A', 'SELECT', 'TEXTAREA']).toContain(el.tagName);
      if (el instanceof HTMLButtonElement) expect(el.type).toBe('button');
    }
    // Focus leaves the last control and returns to the first without any element holding it.
    (order[order.length - 1] as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    (order[0] as HTMLElement).focus();
    expect(document.activeElement).toBe(order[0]);
  });

  it('operates the Lights switch by its click, which Enter and Space produce on a native button', () => {
    render(<App services={services()} />);
    const lights = screen.getByRole('switch', { name: 'Lights on' });
    expect(lights.tagName).toBe('BUTTON');
    lights.focus();
    fireEvent.click(lights);
    expect(lights.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(lights);
    expect(lights.getAttribute('aria-checked')).toBe('false');
  });
});

describe('focus indicator, motion, and contrast in the stylesheets (Requirements 15.3, 15.5)', () => {
  it('gives every control a focus ring of at least 2 px', () => {
    render(<App services={services()} />);
    const controls = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE));
    expect(controls.length).toBeGreaterThan(8);
    const focusRules = ALL_RULES.filter((r) => r.selector.includes(':focus-visible'));
    for (const el of controls) {
      const widths = focusRules
        .filter((r) => {
          try {
            return el.matches(r.selector.replace(/:focus-visible/g, ''));
          } catch {
            return false;
          }
        })
        .map((r) => /outline\s*:\s*(\d+(?:\.\d+)?)px\s+solid/.exec(r.body)?.[1])
        .filter((w): w is string => w !== undefined)
        .map(Number);
      expect(Math.max(0, ...widths), `focus ring of <${el.tagName.toLowerCase()} class="${el.className}" type="${el.getAttribute('type') ?? ''}">`).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(['dark', 'light'] as const)('keeps the focus color at 3:1 against the page and the surface in the %s theme', (theme) => {
    const t = themeTokens(theme);
    for (const background of ['--gk-bg', '--gk-surface']) {
      expect(contrastRatio(t['--gk-focus'] as string, t[background] as string)).toBeGreaterThanOrEqual(3);
    }
  });

  it('has no infinite animation and no animation or transition over 1 s', () => {
    for (const css of ALL_CSS) expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\binfinite\b/);
    let timed = 0;
    for (const rule of ALL_RULES) {
      for (const property of ['animation', 'animation-duration', 'transition', 'transition-duration', 'animation-delay', 'transition-delay']) {
        const value = declaration(rule.body, property);
        if (value === null || value === 'none') continue;
        for (const s of seconds(value)) {
          timed += 1;
          expect(s, `${rule.selector} ${property}: ${value}`).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(timed).toBeGreaterThan(0);
  });

  it('sets every animation and transition to none under prefers-reduced-motion: reduce', () => {
    const reduced = ALL_RULES.filter((r) => r.media !== null && /prefers-reduced-motion:\s*reduce/.test(r.media));
    const universal = reduced.filter((r) => r.selector === '*');
    expect(universal.length).toBe(1);
    const body = (universal[0] as CssRule).body;
    expect(declaration(body, 'animation')).toMatch(/^none\b/);
    expect(declaration(body, 'transition')).toMatch(/^none\b/);
    // Outside the media query nothing else escapes the universal rule: no page rule animates at all.
    expect(parseCss(PAGE_CSS).rules.filter((r) => /animation|transition/.test(r.body))).toEqual([]);
  });
});

describe('accessible names and decorative icons (Requirements 15.3, 15.4)', () => {
  it('names every control, landmark, and status indicator, and hides decorative icons', async () => {
    render(<App services={services()} />);
    await runScenario(FAST);
    const named = document.querySelectorAll(
      'button,input,select,textarea,[role="switch"],canvas[role="img"],table,section[aria-label],section[aria-labelledby],main,[role="group"],ul[aria-label],ol[aria-label]',
    );
    expect(named.length).toBeGreaterThan(15);
    for (const el of named) {
      expect(nameOf(el), `<${el.tagName.toLowerCase()} class="${el.className}">`).not.toBe('');
    }
    // Every status indicator and alert carries text.
    for (const el of document.querySelectorAll('[role="status"],[role="alert"]')) {
      expect(textOf(el).trim(), `${el.tagName} ${textOf(el).slice(0, 40)}`).not.toBe('');
    }
    // Every status cell of the variant table has the status word, and its icon is hidden.
    const rows = screen.getAllByRole('row').filter((r) => r.hasAttribute('data-status'));
    expect(rows.length).toBe(9);
    for (const row of rows) {
      const cell = within(row).getAllByRole('cell')[0] as HTMLElement;
      expect(textOf(cell).trim()).toMatch(/^(passed|failed)$/);
      expect(cell.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/^[\u2713\u2715]$/);
    }
    // Decorative icons: every svg and every glyph span is aria-hidden or named.
    for (const svg of document.querySelectorAll('svg')) {
      const hidden = svg.closest('[aria-hidden="true"]') !== null;
      expect(hidden || nameOf(svg) !== '' || svg.querySelector('title') !== null, `svg in ${svg.parentElement?.tagName ?? ''}`).toBe(true);
    }
    for (const el of document.querySelectorAll('span')) {
      if (el.children.length === 0 && /^[\u2713\u2715\u2717\u2714]/.test(el.textContent ?? '')) {
        expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    }
  });
});

describe('live region (Requirement 15.4)', () => {
  it('is empty before a run and then states the candle and the failed count', async () => {
    render(<App services={services()} />);
    expect(liveRegion().textContent).toBe('');
    await runScenario(FAST);
    expect(liveRegion().textContent).toBe(BLOCK_LIVE);
    await runScenario(SLOW);
    expect(liveRegion().textContent).toBe(PASS_LIVE);
  });
});

describe('Plan_File loading (Requirements 11.5, 15.7)', () => {
  it('rejects a plan with an unknown field, names the field path, and keeps the previous plan', async () => {
    render(<App services={services()} />);
    fireEvent.click(button(FAST));
    const before = screen.getByRole('list', { name: 'Plan actions' }).textContent;
    loadFile(planFile({ name: 'rejected plan', extra: 1 }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('extra: [unknown-field]');
    expect(screen.getByRole('list', { name: 'Plan actions' }).textContent).toBe(before);
    expect(screen.queryByText('rejected plan')).toBeNull();
    expect(screen.getAllByText(FAST).length).toBeGreaterThan(0);
  });

  it('also names the path of an unknown field inside an action', async () => {
    render(<App services={services()} />);
    loadFile(planFile({ actions: [{ type: 'release', speed: 3 }] }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('actions[0].speed: [unknown-field]');
  });

  it('passes hidden code points of a Plan_File through the Display_Escaper', async () => {
    render(<App services={services()} />);
    loadFile(planFile({ ['bad\u200Bkey\u202E']: 1 }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('bad<U+200B>key<U+202E>: [unknown-field]');
    expect(alert.textContent).not.toMatch(/[\u200B\u202E]/);
    // A hidden code point inside a text field is refused, and the plan is not shown.
    loadFile(planFile({ name: 'a\u200Bb' }));
    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('name: [invalid-character]'))).toBe(true);
    });
    expect(screen.queryByText(/a.b/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u200B\u202E]/);
  });
});

describe('P1 failure (Requirement 10.3)', () => {
  it('shows the alert and the block candle when the fingerprints differ', async () => {
    const control: Control = { differ: false };
    render(<App services={services({}, control)} />);
    await waitFor(() => {
      expect(button('Run ghost')).toBeTruthy();
    });
    fireEvent.click(button(SLOW));
    await waitFor(() => {
      expect(button('Run ghost').disabled).toBe(false);
    });
    control.differ = true;
    fireEvent.click(button('Run ghost'));
    await waitFor(() => {
      expect(button('Run ghost').disabled).toBe(false);
      expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes(P1_FAILURE_TEXT))).toBe(true);
    });
    expect(document.querySelector('[data-candle-state]')?.getAttribute('data-candle-state')).toBe('out');
    expect(screen.getByRole('region', { name: 'Message the agent receives' }).textContent).toContain(P1_FAILURE_TEXT);
    expect(button('Execute on reference arm').disabled).toBe(true);
  });

  it('shows no P1 alert when the fingerprints match', async () => {
    render(<App services={services()} />);
    await runScenario(SLOW);
    expect(screen.queryByText(P1_FAILURE_TEXT, { exact: false })).toBeNull();
  });
});

describe('Candle and claims in both capability states (Requirements 10.1, 10.4, 15.6)', () => {
  const lineText = (id: string): string => document.querySelector(`[data-claim-id="${id}"]`)?.textContent ?? '';

  it('shows the fallback texts and claims neither P5 nor P6 while the capabilities are missing', async () => {
    capState.value = CAPS_FALLBACK;
    render(<App services={services()} />);
    expect(screen.getByText(JOINT_LIMIT_INACTIVE_TEXT)).toBeTruthy();
    expect(screen.getByText(PROVISIONAL_WORDING_TEXT)).toBeTruthy();
    await runScenario(FAST);
    expect(document.querySelector('[data-candle-state]')?.getAttribute('data-candle-state')).toBe('out');
    for (const id of ['P5', 'P6']) {
      expect(lineText(id)).toContain('NOT claimed');
    }
    expect(screen.getByText(P5_P6_TEXT)).toBeTruthy();
    expect(screen.getByText(DOCKER_TEXT)).toBeTruthy();
    expect(screen.getByText(P8_SCOPE_TEXT)).toBeTruthy();
    await runScenario(SLOW);
    expect(document.querySelector('[data-candle-state]')?.getAttribute('data-candle-state')).toBe('lit');
    expect(lineText('P5')).not.toMatch(/^P5 claimed/);
    expect(lineText('P6')).not.toMatch(/^P6 claimed/);
  });

  it('drops the fallback texts and still claims neither P5 nor P6 once the capabilities exist', async () => {
    capState.value = CAPS_LANDED;
    render(<App services={services()} />);
    expect(screen.queryByText(JOINT_LIMIT_INACTIVE_TEXT)).toBeNull();
    expect(screen.queryByText(PROVISIONAL_WORDING_TEXT)).toBeNull();
    await runScenario(SLOW);
    expect(document.querySelector('[data-candle-state]')?.getAttribute('data-candle-state')).toBe('lit');
    for (const id of ['P5', 'P6']) {
      expect(lineText(id)).toMatch(/NOT claimed|not applicable/);
      expect(lineText(id)).not.toMatch(new RegExp(`^${id} claimed`));
    }
    expect(screen.getByText(P5_P6_TEXT)).toBeTruthy();
  });
});

describe('WebGL fallback (Requirement 13.11)', () => {
  it('shows the fallback text and disables the camera presets when getContext returns null', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(<App services={services({ createOverlay: createOverlayRenderer })} />);
    const status = await screen.findByText(WEBGL_FALLBACK_TEXT);
    expect(status.getAttribute('role')).toBe('status');
    expect(button('Front view').disabled).toBe(true);
    expect(button('Side view').disabled).toBe(true);
    await runScenario(FAST);
    expect(screen.getAllByRole('row').length).toBe(10);
  });
});

describe('Graveyard (Requirements 14.8, 14.9, 15.1)', () => {
  it('opens a blocked run by keyboard and returns focus to the Tombstone from Back to graveyard', async () => {
    render(<App services={services()} />);
    await runScenario(FAST);
    const tombstone = document.querySelector<HTMLElement>('[data-tombstone-index="0"]');
    if (tombstone === null) throw new Error('no tombstone');
    expect(tombstone.tagName).toBe('BUTTON');
    tombstone.focus();
    expect(document.activeElement).toBe(tombstone);
    // Enter or Space on a native button fires click.
    fireEvent.click(tombstone);
    const heading = await screen.findByRole('heading', { name: 'Seance' });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });
    fireEvent.click(button('Back to graveyard'));
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-tombstone-index="0"]'));
    });
    expect(screen.queryByRole('heading', { name: 'Seance' })).toBeNull();
  });

  it('adds no entry for a passing run and shows the drop text only from the 201st blocked run', async () => {
    render(<App services={services()} />);
    await runScenario(SLOW);
    expect(document.querySelector('[data-tombstone-index]')).toBeNull();
    fireEvent.click(button(FAST));
    for (let i = 0; i < 200; i += 1) await runLoaded();
    expect(screen.queryByText(GRAVEYARD_DROP_TEXT)).toBeNull();
    await runLoaded();
    expect(screen.getByText(GRAVEYARD_DROP_TEXT)).toBeTruthy();
    expect(document.querySelectorAll('[data-tombstone-index]').length).toBe(200);
  }, 170_000);
});

describe('Reference arm (Requirements 10.6, 10.10, 12.7)', () => {
  it('keeps Execute on reference arm off until a pass and turns it off again after a plan change', async () => {
    render(<App services={services()} />);
    expect(button('Execute on reference arm').disabled).toBe(true);
    await runScenario(FAST);
    expect(button('Execute on reference arm').disabled).toBe(true);
    await runScenario(SLOW);
    expect(button('Execute on reference arm').disabled).toBe(false);
    // A different plan, loaded from a file or from the scenario list, turns it off.
    loadFile(planFile());
    await screen.findByText('loaded plan');
    expect(button('Execute on reference arm').disabled).toBe(true);
    // The same actions as the last passing run enable it again; clearing the plan turns it off.
    fireEvent.click(button(SLOW));
    expect(button('Execute on reference arm').disabled).toBe(false);
    fireEvent.click(button('Clear plan'));
    expect(button('Execute on reference arm').disabled).toBe(true);
  });

  it('shows the reference-simulation line next to the Reference_Arm before and after execution', async () => {
    render(<App services={services()} />);
    const section = (): HTMLElement => screen.getByRole('region', { name: 'Reference arm' });
    expect(within(section()).getByText(REFERENCE_SIMULATION_TEXT)).toBeTruthy();
    expect(within(section()).getByRole('button', { name: 'Execute on reference arm' })).toBeTruthy();
    await runScenario(SLOW);
    fireEvent.click(button('Execute on reference arm'));
    await screen.findByText(/Final drawer displacement/);
    expect(within(section()).getByText(REFERENCE_SIMULATION_TEXT)).toBeTruthy();
  });

  it('shows no P2 text while P2_TEXT_ENABLED is false', async () => {
    expect(P2_TEXT_ENABLED).toBe(false);
    render(<App services={services()} />);
    await runScenario(SLOW);
    fireEvent.click(button('Execute on reference arm'));
    await screen.findByText(/Final drawer displacement/);
    for (const text of [P2_MATCH_TEXT, P2_MISMATCH_TEXT, P2_CHECK_SCOPE_TEXT, P2_SCOPE_TEXT]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(document.body.textContent).not.toMatch(/\bP2\b/);
  });
});

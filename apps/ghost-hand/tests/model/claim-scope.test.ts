// Task 18.1: claim scopes and disclosures of the page.
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 10.11, 11.6, 12.12**
// The tests read P2_TEXT_ENABLED and assert the matching behavior for both states.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClaimsPanel } from '../../src/components/ClaimsPanel';
import { PlanPanel } from '../../src/components/PlanPanel';
import type { PlanPanelProps } from '../../src/components/PlanPanel';
import { ReferencePanel } from '../../src/components/ReferencePanel';
import { buildIsolationClaims } from '../../src/pipeline/claims';
import { p2CheckLines } from '../../src/reference';
import type { SelfCheckResult } from '../../src/self-check';
import * as texts from '../../src/texts';
import * as uiText from '../../src/ui-text';

const noop = (): void => undefined;
const HASH = '0123456789abcdef0123';

const ok: SelfCheckResult = { state: 'ok', hash: HASH, restoreOk: true };
const pending: SelfCheckResult = { state: 'pending' };
const failedStates: readonly SelfCheckResult[] = [
  { state: 'failed', reason: 'not-reproduced', hash: HASH },
  { state: 'failed', reason: 'restore-mismatch', hash: HASH },
  { state: 'failed', reason: 'engine-error' },
  { state: 'failed', reason: 'no-secure-context' },
];

/** Text content of server-rendered markup: tags removed, entities decoded. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function claimsText(selfCheck: SelfCheckResult, p1Failed = false): string {
  return textOf(
    renderToStaticMarkup(
      createElement(ClaimsPanel, { notices: [], unknownContactNames: [], selfCheck, p1Failed }),
    ),
  );
}

function referenceText(selfCheck: SelfCheckResult, match: boolean | null, moved = true): string {
  const p2Lines = moved ? p2CheckLines(texts.P2_TEXT_ENABLED, selfCheck, match) : null;
  return textOf(
    renderToStaticMarkup(
      createElement(ReferencePanel, {
        canExecute: true,
        canReset: true,
        displacementM: moved ? 0.2 : null,
        p2Lines,
        onExecute: noop,
        onReset: noop,
      }),
    ),
  );
}

function planProps(origin: 'recorded' | 'scripted' | null): PlanPanelProps {
  return {
    plan:
      origin === null
        ? null
        : {
            format: 'ghost-hand-plan',
            version: 1,
            name: 'demo',
            origin,
            actions: [{ type: 'release' }],
          },
    errors: null,
    seed: { text: '1', error: null, onChange: noop },
    canRun: true,
    busy: false,
    onLoadText: noop,
    onDownload: noop,
    onRun: noop,
    onClear: noop,
    scenarios: [],
    onLoadScenario: noop,
    onPlayDemo: noop,
    canPlayDemo: true,
    demoActive: false,
    demoStatus: null,
  };
}

function allP2Strings(): string[] {
  return [
    texts.P2_MATCH_TEXT,
    texts.P2_MISMATCH_TEXT,
    texts.P2_CHECK_SCOPE_TEXT,
    texts.P2_SCOPE_TEXT,
  ];
}

describe('pinned page texts (Requirement 10)', () => {
  it('pins the exact strings of Requirement 10', () => {
    expect(texts.P1_FAILURE_TEXT).toBe('Ghost run changed reality: this is a bug in the playground.');
    expect(texts.P5_P6_TEXT).toBe(
      'P5 and P6 concern files and secrets and are not claimed for this physics world.',
    );
    expect(texts.DOCKER_TEXT).toBe('Docker box (real mode) is not used by this page.');
    expect(texts.P2_MATCH_TEXT).toBe('P2 check: the reference execution matched the base ghost diff.');
    expect(texts.P2_MISMATCH_TEXT).toBe(
      'P2 check: MISMATCH between the base ghost diff and the reference execution.',
    );
    expect(texts.P2_SCOPE_TEXT).toBe(
      "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware.",
    );
    expect(texts.P8_SCOPE_TEXT).toBe(
      'Same-seed determinism (P8) was verified only in Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac.',
    );
    expect(texts.REFERENCE_SIMULATION_TEXT).toBe('The "real" arm here is a reference simulation, not hardware.');
    expect(texts.PLAN_ORIGIN_RECORDED_TEXT).toBe(
      'Recorded plan: replayed here, not decided by an LLM in this page.',
    );
    expect(texts.PLAN_ORIGIN_SCRIPTED_TEXT).toBe('Scripted plan: not decided by an LLM in this page.');
    expect(texts.determinismReproducedText(HASH)).toBe(
      'Determinism check: this browser reproduced the reference trajectory (hash 0123456789ab).',
    );
    expect(texts.DETERMINISM_FAILED_TEXT).toBe(
      'Determinism check: this browser did NOT reproduce the reference trajectory; the same-seed guarantee (P8) is not claimed here.',
    );
  });

  it('shows the pinned texts in the rendered page parts', () => {
    const page = claimsText(ok);
    expect(page).toContain(texts.P5_P6_TEXT);
    expect(page).toContain(texts.DOCKER_TEXT);
    expect(page).toContain(texts.determinismReproducedText(HASH));
    expect(claimsText(failedStates[0] as SelfCheckResult)).toContain(texts.DETERMINISM_FAILED_TEXT);
  });
});

describe('P1, P5, P6 claims (10.1, 10.2, 10.3)', () => {
  const capsVariants = [
    { jointSelfWard: true, claimsOptional: true, bannerNotApplicable: false },
    { jointSelfWard: false, claimsOptional: false, bannerNotApplicable: true },
  ];

  it('claims P1 only for equal fingerprints and never P5 or P6', () => {
    for (const caps of capsVariants) {
      for (const equal of [true, false]) {
        const claims = buildIsolationClaims(equal, caps);
        expect(claims.p1Claimed).toBe(equal);
        expect(claims.p5Claimed).toBe(false);
        expect(claims.p6Claimed).toBe(false);
        expect(claims.mode).toBe('playground');
        expect('reason' in claims).toBe(false);
      }
    }
  });

  it('shows the P1 failure alert only when the fingerprints differed', () => {
    const failed = renderToStaticMarkup(
      createElement(ClaimsPanel, { notices: [], unknownContactNames: [], selfCheck: ok, p1Failed: true }),
    );
    expect(failed).toMatch(/role="alert"/);
    expect(textOf(failed)).toContain(texts.P1_FAILURE_TEXT);
    expect(claimsText(ok, false)).not.toContain(texts.P1_FAILURE_TEXT);
  });
});

describe('no Docker or hardware claim (10.4, 10.5)', () => {
  it('states that Docker is not used and that P5 and P6 are not claimed', () => {
    const page = claimsText(ok) + referenceText(ok, true);
    expect(page).toContain(texts.DOCKER_TEXT);
    expect(page).toContain(texts.P5_P6_TEXT);
  });

  it('claims no Docker isolation and no physical arm in any rendered part', () => {
    const rendered = [
      claimsText(ok),
      claimsText(pending),
      referenceText(ok, true),
      referenceText(ok, null, false),
      textOf(renderToStaticMarkup(createElement(PlanPanel, planProps('recorded')))),
    ].join('\n');
    const withoutPinned = rendered
      .split(texts.DOCKER_TEXT)
      .join('')
      .split(texts.REFERENCE_SIMULATION_TEXT)
      .join('')
      .split(texts.P2_SCOPE_TEXT)
      .join('')
      .split(texts.P2_CHECK_SCOPE_TEXT)
      .join('');
    expect(withoutPinned).not.toMatch(/docker/i);
    expect(withoutPinned).not.toMatch(/physical|hardware|real robot/i);
  });
});

describe('P8 scope sentence (10.8)', () => {
  it('names Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac and is visible in every self-check state', () => {
    expect(texts.P8_SCOPE_TEXT).toContain('Node.js 20.20.2');
    expect(texts.P8_SCOPE_TEXT).toContain('Chrome 157');
    expect(texts.P8_SCOPE_TEXT).toContain('Apple M1 Mac');
    for (const state of [ok, pending, ...failedStates]) {
      const markup = renderToStaticMarkup(
        createElement(ClaimsPanel, { notices: [], unknownContactNames: [], selfCheck: state, p1Failed: false }),
      );
      expect(textOf(markup)).toContain(texts.P8_SCOPE_TEXT);
      expect(markup).not.toMatch(/hidden|display:\s*none|aria-hidden="true"[^>]*>[^<]*Same-seed/);
    }
  });
});

describe('P2 and P8 claim text with the self-check (10.6, 10.9)', () => {
  it('shows no reproduced-trajectory claim while the self-check is pending or failed', () => {
    for (const state of [pending, ...failedStates]) {
      const page = claimsText(state);
      expect(page).not.toContain('reproduced the reference trajectory');
    }
    expect(claimsText(pending)).not.toContain(texts.DETERMINISM_FAILED_TEXT);
  });

  it('shows no P2 line when the self-check failed or is pending, for either P2 flag state', () => {
    for (const state of [pending, ...failedStates]) {
      for (const match of [true, false, null]) {
        expect(p2CheckLines(true, state, match)).toBeNull();
        expect(p2CheckLines(false, state, match)).toBeNull();
        const page = referenceText(state, match);
        for (const t of allP2Strings()) expect(page).not.toContain(t);
      }
    }
  });

  it('shows P2 text exactly as the build switch says, after a passed self-check', () => {
    const matched = referenceText(ok, true);
    const mismatched = referenceText(ok, false);
    const unchecked = referenceText(ok, null);
    if (texts.P2_TEXT_ENABLED) {
      expect(matched).toContain(texts.P2_MATCH_TEXT);
      expect(matched).toContain(texts.P2_CHECK_SCOPE_TEXT);
      expect(matched).not.toContain(texts.P2_MISMATCH_TEXT);
      expect(mismatched).toContain(texts.P2_MISMATCH_TEXT);
      expect(mismatched).toContain(texts.P2_CHECK_SCOPE_TEXT);
      expect(mismatched).not.toContain(texts.P2_MATCH_TEXT);
      expect(unchecked).not.toContain('P2 check');
      expect(texts.P2_CHECK_SCOPE_TEXT).toMatch(/nothing about a physical arm/);
      expect(texts.P2_SCOPE_TEXT).toContain('Not claimed for physical hardware.');
    } else {
      for (const page of [matched, mismatched, unchecked, claimsText(ok)]) {
        for (const t of allP2Strings()) expect(page).not.toContain(t);
        expect(page).not.toMatch(/P2 check|\bP2\b/);
      }
      expect(p2CheckLines(texts.P2_TEXT_ENABLED, ok, true)).toBeNull();
    }
  });

  it('shows no P2 text anywhere on the claims panel, whatever the state, while the switch is off', () => {
    if (texts.P2_TEXT_ENABLED) return;
    for (const state of [ok, pending, ...failedStates]) {
      expect(claimsText(state)).not.toMatch(/\bP2\b/);
    }
  });
});

describe('reference simulation and plan origin lines (10.10, 11.6, 12.12)', () => {
  it('shows the reference-simulation line before and after the reference execution', () => {
    expect(referenceText(ok, null, false)).toContain(texts.REFERENCE_SIMULATION_TEXT);
    expect(referenceText(ok, true, true)).toContain(texts.REFERENCE_SIMULATION_TEXT);
    expect(referenceText(pending, null, true)).toContain(texts.REFERENCE_SIMULATION_TEXT);
  });

  it('shows the origin text that matches the loaded plan, and none without a plan', () => {
    const recorded = textOf(renderToStaticMarkup(createElement(PlanPanel, planProps('recorded'))));
    const scripted = textOf(renderToStaticMarkup(createElement(PlanPanel, planProps('scripted'))));
    const none = textOf(renderToStaticMarkup(createElement(PlanPanel, planProps(null))));
    expect(recorded).toContain(texts.PLAN_ORIGIN_RECORDED_TEXT);
    expect(recorded).not.toContain(texts.PLAN_ORIGIN_SCRIPTED_TEXT);
    expect(scripted).toContain(texts.PLAN_ORIGIN_SCRIPTED_TEXT);
    expect(scripted).not.toContain(texts.PLAN_ORIGIN_RECORDED_TEXT);
    expect(none).not.toContain('Recorded plan');
    expect(none).not.toContain('Scripted plan');
  });
});

describe('forbidden words (10.11)', () => {
  it('uses neither "sealed" nor "isolated" in any fixed text or rendered part', () => {
    const fixed: string[] = [];
    for (const mod of [texts, uiText] as const) {
      for (const value of Object.values(mod)) if (typeof value === 'string') fixed.push(value);
    }
    fixed.push(texts.unknownWardEntryText('vase'), texts.determinismReproducedText(HASH));
    const rendered = [
      claimsText(ok, true),
      claimsText(failedStates[0] as SelfCheckResult),
      referenceText(ok, true),
      textOf(renderToStaticMarkup(createElement(PlanPanel, planProps('recorded')))),
    ];
    for (const t of [...fixed, ...rendered]) expect(t).not.toMatch(/\b(sealed|isolated)\b/i);
  });
});

describe('no measured pass count in test files', () => {
  it('holds no "<n> passed" or "<n> of <n> tests" figure in any test file', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    const count = new RegExp(
      ['\\b\\d+\\s+(?:tests?|runs?|examples?|properties|checks)\\s+(?:have\\s+)?pass(?:ed|es)?\\b', '\\bpass(?:ed|ing)?\\s*[:=]\\s*\\d{2,}\\b', '\\b\\d+\\s*(?:/|of)\\s*\\d+\\s+(?:tests?\\s+)?pass'].join('|'),
      'i',
    );
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(count);
    }
  });
});

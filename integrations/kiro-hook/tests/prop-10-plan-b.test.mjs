// Property test: Plan B never allows and never claims (task 7.4, KI-P10). No Docker needed [no-docker].
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildGraveEntry } from '../lib/gate/grave.mjs';
import { decisionFromRunResult, FLOOR_TEXT, PLAN_B_LINE } from '../lib/gate/output.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

const P5P6_LINE =
  'P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).';
const P1_LINE = 'P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.';

const verdictArb = fc.constantFrom('pass', 'warn', 'block');
const statusArb = fc.constantFrom(
  'ok', 'timeout', 'pipeline-deadline', 'copy-timeout', 'recorder-failure', 'isolation-violation',
  'external-change',
);
const diagNames = [...Object.keys(FLOOR_TEXT), 'unknown-diagnostic'];
const textArb = fc.string({ maxLength: 40 });

const wardVerdictArb = verdictArb.chain((verdict) =>
  fc.record({
    verdict: fc.constant(verdict),
    violations: verdict === 'block'
      ? fc.array(fc.record({ wardId: fc.constantFrom('w1', 'w2'), wardKind: fc.constantFrom('path', 'sql', 'egress'), reason: textArb }), { minLength: 1, maxLength: 3 })
      : fc.constant([]),
    notices: verdict === 'warn'
      ? fc.array(fc.record({ kind: fc.constant('effect-outside'), reason: textArb, stepIndex: fc.nat(3) }), { minLength: 1, maxLength: 3 })
      : fc.constant([]),
  }),
);

const changeArb = fc.oneof(
  fc.record({ kind: fc.constantFrom('file-deleted', 'file-overwritten', 'file-created'), path: textArb }),
  fc.record({ kind: fc.constant('sql-row-count'), rowsBefore: fc.nat(50), rowsAfter: fc.nat(50), dropped: fc.boolean() }),
);

/** @param {fc.Arbitrary<any>} isolationArb */
const runResultArb = (isolationArb) =>
  fc.record({
    schemaVersion: fc.constant(1),
    runId: fc.constant('run-1'),
    status: statusArb,
    verdict: verdictArb,
    wardVerdict: wardVerdictArb,
    report: fc.record({
      snapshots: fc.constant([]),
      changes: fc.array(fc.array(changeArb, { maxLength: 4 }), { maxLength: 3 }),
      effectsOutside: fc.constant([]),
      observedEvents: fc.constant([]),
      variantResults: fc.constant([]),
    }),
    isolation: isolationArb,
    diagnostics: fc.array(fc.record({ name: fc.constantFrom(...diagNames), detail: textArb }), { maxLength: 3 }),
  });

/** Plan_B as the runner reports it: all claims false. */
const planBIso = fc.constant({ mode: 'static-analysis', p1Claimed: false, p5Claimed: false, p6Claimed: false, readOnlyMounts: [] });
/** Plan_B with (wrongly) true flags: the gate must still not claim. */
const planBAnyFlagsIso = fc.record({
  mode: fc.constant('static-analysis'),
  p1Claimed: fc.boolean(), p5Claimed: fc.boolean(), p6Claimed: fc.boolean(), readOnlyMounts: fc.constant([]),
});
const anyIso = fc.record({
  mode: fc.constantFrom('docker-box', 'static-analysis'),
  p1Claimed: fc.boolean(), p5Claimed: fc.boolean(), p6Claimed: fc.boolean(), readOnlyMounts: fc.constant([]),
});

const ctxArb = fc.record({
  wardCount: fc.nat(20),
  graveId: fc.constantFrom('g-1', 'g-abc'),
  seanceBase: fc.constant('http://localhost:5317'),
  warnMode: fc.constantFrom('exit2', 'ask'),
});

/** The message text of a decision (STDERR, or the ask reason). */
/** @param {any} d */
function messageOf(d) {
  if (d.kind === 'ask') return JSON.parse(d.stdout).hookSpecificOutput.permissionDecisionReason;
  return d.kind === 'allow' ? d.stdout : d.stderr;
}

/** @param {any} d */
function assertNeverAllows(d) {
  expect(d.kind).not.toBe('allow');
  expect(d.stdout).not.toMatch(/GHOST RUN PASSED/);
  expect(d.stdout).not.toContain('"allow"');
  if (d.kind === 'ask') {
    expect(d.exit).toBe(0);
    expect(JSON.parse(d.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  } else {
    expect(d.kind).toBe('deny');
    expect(d.exit).toBe(2);
  }
}

describe('Plan B never allows and never claims', () => {
  it('Property 10: Plan_B never takes the allow path and carries both exact lines', () => {
    // Feature: kiro-integration, Property 10: Plan B never allows and never claims
    // **Validates: Requirements 5.10, 7.6, 9.1, 9.2, 9.3, 9.4**
    fc.assert(
      fc.property(fc.oneof(planBIso, planBAnyFlagsIso).chain((iso) => runResultArb(fc.constant(iso))), ctxArb, (r, ctx) => {
        const d = decisionFromRunResult(/** @type {any} */ (r), ctx);
        assertNeverAllows(d);
        const msg = messageOf(d);
        expect(PLAN_B_LINE).toBe(P1_LINE);
        expect(msg).toContain(P1_LINE);
        expect(msg).toContain(P5P6_LINE);
        if (d.kind === 'deny') {
          const lines = msg.split('\n');
          expect(lines).toContain(P1_LINE);
          // The message builder appends the Seance link to the last claim line, so the line starts with the fixed text.
          expect(lines.some((/** @type {string} */ l) => l === P5P6_LINE || l.startsWith(`${P5P6_LINE} Seance: `))).toBe(true);
        }
      }),
      FC_PARAMS,
    );
  });

  it('Property 10: the Grave_Entry of a Plan_B run claims static-analysis and three false booleans', () => {
    // Feature: kiro-integration, Property 10: Plan B never allows and never claims
    // **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    fc.assert(
      fc.property(runResultArb(planBIso), (r) => {
        const e = buildGraveEntry({
          runId: 'run-1', command: 'rm -rf build', recordedAt: '2026-11-01T00:00:00Z', result: /** @type {any} */ (r),
        });
        expect(e).not.toBeNull();
        expect(e?.detail?.claims).toEqual({ mode: 'static-analysis', p1Claimed: false, p5Claimed: false, p6Claimed: false });
      }),
      FC_PARAMS,
    );
  });

  it('Property 10: no claim in a message exceeds the isolation flags, for any mode', () => {
    // Feature: kiro-integration, Property 10: Plan B never allows and never claims
    // **Validates: Requirements 5.10, 7.6, 9.2, 9.3**
    fc.assert(
      fc.property(runResultArb(anyIso), ctxArb, (r, ctx) => {
        const d = decisionFromRunResult(/** @type {any} */ (r), ctx);
        const msg = messageOf(d);
        const planB = r.isolation.mode === 'static-analysis';
        const claimsBoth = !planB && r.isolation.p5Claimed && r.isolation.p6Claimed;
        // The lowered-claim line is absent exactly when both protections are claimed by the flags.
        if (claimsBoth) {
          expect(msg).not.toContain(P5P6_LINE);
        } else {
          expect(msg).toContain(P5P6_LINE);
        }
        // The P1 not-guaranteed line is present exactly in Plan_B.
        if (planB) expect(msg).toContain(P1_LINE);
        else expect(msg).not.toContain(P1_LINE);
        // No positive P1/P5/P6 claim text exists in a message without the matching flag.
        if (!planB && !r.isolation.p1Claimed) expect(msg).not.toMatch(/P1 isolation is guaranteed/i);
      }),
      FC_PARAMS,
    );
  });
});

// Property test for the decision mapping (task 7.2, KI-P1). No Docker needed [no-docker].
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decisionFromRunResult, FLOOR_TEXT, RUNNER_FAILED_LINE } from '../lib/gate/output.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

/** @type {Record<string, number>} */
const RANK = { pass: 0, warn: 1, block: 2 };
const verdictArb = fc.constantFrom('pass', 'warn', 'block');
const statusArb = fc.constantFrom(
  'ok', 'timeout', 'pipeline-deadline', 'copy-timeout', 'recorder-failure', 'isolation-violation',
  'external-change', 'internal-error',
);
const diagNames = [...Object.keys(FLOOR_TEXT), 'unknown-diagnostic'];
const textArb = fc.string({ maxLength: 40 });

const wardVerdictArb = verdictArb.chain((verdict) =>
  fc.record({
    verdict: fc.constant(verdict),
    violations: verdict === 'block'
      ? fc.array(fc.record({ wardId: fc.constantFrom('w1', 'w2'), wardKind: fc.constant('path'), reason: textArb }), { minLength: 1, maxLength: 3 })
      : fc.constant([]),
    notices: verdict === 'warn'
      ? fc.array(fc.record({ kind: fc.constant('effect-outside'), reason: textArb, stepIndex: fc.nat(3) }), { minLength: 1, maxLength: 3 })
      : fc.constant([]),
  }),
);

const isolationArb = fc.record({
  mode: fc.constantFrom('docker-box', 'static-analysis'),
  p1Claimed: fc.boolean(),
  p5Claimed: fc.boolean(),
  p6Claimed: fc.boolean(),
  readOnlyMounts: fc.constant([]),
});

const changeArb = fc.oneof(
  fc.record({ kind: fc.constantFrom('file-deleted', 'file-overwritten', 'file-created', 'symlink-changed'), path: textArb }),
  fc.record({ kind: fc.constant('sql-row-count'), rowsBefore: fc.nat(50), rowsAfter: fc.nat(50), dropped: fc.boolean() }),
);

const runResultArb = fc.record({
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

const ctxArb = fc.record({
  wardCount: fc.nat(20),
  graveId: fc.constantFrom('g-1', 'g-abc'),
  seanceBase: fc.constant('http://localhost:5317'),
  warnMode: fc.constantFrom('exit2', 'ask'),
});

/** Expected effective verdict by the mapping table (status and Plan B lift a pass to warn). */
/** @param {any} r */
function expectedEffective(r) {
  let e = RANK[r.verdict] >= RANK[r.wardVerdict.verdict] ? r.verdict : r.wardVerdict.verdict;
  if ((r.status !== 'ok' || r.isolation.mode === 'static-analysis') && e === 'pass') e = 'warn';
  return e;
}

const commandPair = fc
  .tuple(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }))
  .filter(([a, b]) => a !== b);

describe('decision mapping', () => {
  it('Property 1: exit 0 only for pass or an ask of a warn; never allow for warn, block, Plan_B', () => {
    // Feature: kiro-integration, Property 1: Decision mapping
    // **Validates: Requirements 5.3, 5.4, 7.1, 7.2, 7.3, 7.8, 7.9, 10.1, 10.4, 10.6**
    fc.assert(
      fc.property(runResultArb, ctxArb, (r, ctx) => {
        const d = decisionFromRunResult(/** @type {any} */ (r), ctx);
        expect([0, 2]).toContain(d.exit);
        if (r.status === 'internal-error') {
          expect(d).toMatchObject({ exit: 2, kind: 'deny', stdout: '', stderr: RUNNER_FAILED_LINE });
          return;
        }
        const eff = expectedEffective(r);
        if (eff === 'pass') {
          expect(d.exit).toBe(0);
          expect(d.kind).toBe('allow');
          expect(d.stdout).toMatch(/^GHOST RUN PASSED: all \d+ wards cleared\./);
          expect(d.stdout).not.toContain('permissionDecision');
          expect(d.stderr).toBe('');
          // pass is never reached for Plan_B, a non-ok status, or a non-pass verdict
          expect(r.isolation.mode).toBe('docker-box');
          expect(r.status).toBe('ok');
        } else if (eff === 'warn' && ctx.warnMode === 'ask') {
          expect(d.exit).toBe(0);
          expect(d.kind).toBe('ask');
          expect(d.stderr).toBe('');
          expect(d.stdout).not.toBe('');
          const j = JSON.parse(d.stdout);
          expect(Object.keys(j)).toEqual(['hookSpecificOutput']);
          expect(Object.keys(j.hookSpecificOutput).sort()).toEqual(['permissionDecision', 'permissionDecisionReason']);
          expect(j.hookSpecificOutput.permissionDecision).toBe('ask');
          expect(j.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
          expect(d.stdout).not.toContain('"allow"');
        } else {
          expect(d.exit).toBe(2);
          expect(d.kind).toBe('deny');
          expect(d.stdout).toBe('');
          expect(d.stderr.length).toBeGreaterThan(0);
          if (eff === 'warn') expect(d.stderr).toContain('GHOST RUN NEEDS HUMAN APPROVAL');
        }
        // block and Plan_B never take the allow path
        if (eff === 'block' || r.isolation.mode === 'static-analysis') expect(d.kind).not.toBe('allow');
        if (eff === 'block') expect(d.exit).toBe(2);
      }),
      FC_PARAMS,
    );
  });

  it('Property 1: arbitrary and malformed inputs still give exit 0 or 2, and 0 only with pass text or ask JSON', () => {
    // Feature: kiro-integration, Property 1: Decision mapping
    // **Validates: Requirements 7.8, 10.4, 10.6**
    fc.assert(
      fc.property(fc.anything(), ctxArb, (junk, ctx) => {
        const d = decisionFromRunResult(/** @type {any} */ (junk), ctx);
        expect([0, 2]).toContain(d.exit);
        if (d.exit === 0) {
          expect(d.kind === 'allow' || d.kind === 'ask').toBe(true);
          expect(d.stdout).not.toBe('');
        }
      }),
      FC_PARAMS,
    );
  });

  it('Property 1: the command text is not an input; equal RunResults give identical decisions', () => {
    // Feature: kiro-integration, Property 1: Decision mapping
    // **Validates: Requirements 7.9**
    fc.assert(
      fc.property(runResultArb, ctxArb, commandPair, (r, ctx, [cmdA, cmdB]) => {
        // The command text is carried next to the result by the caller and never passed on.
        const a = decisionFromRunResult(/** @type {any} */ (structuredClone({ ...r, command: cmdA })), ctx);
        const b = decisionFromRunResult(/** @type {any} */ (structuredClone({ ...r, command: cmdB })), ctx);
        expect(a).toEqual(b);
        expect(decisionFromRunResult(/** @type {any} */ (r), ctx)).toEqual(a);
      }),
      FC_PARAMS,
    );
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { VERDICT_ORDER } from '@ghost-run/core';
import type { FingerprintResult, Verdict } from '@ghost-run/core';
import {
  classifyOriginalChange,
  p1Claimed,
  p5Claimed,
  p6Claimed,
  runnerVerdict,
  WARN_FLOOR_DIAGNOSTICS,
} from '../src/verdict.js';
import type { IsolationMode, VerdictInputs } from '../src/verdict.js';
import type { Diagnostic, RunStatus } from '../src/result.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

// Feature: ghost-runner, Property 9: Verdict composition and claims
// **Validates: Requirements 3.5, 9.8, 10.4, 12.6, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3**

const STATUSES: RunStatus[] = ['ok', 'timeout', 'pipeline-deadline', 'copy-timeout', 'isolation-violation', 'internal-error'];
const VERDICTS: Verdict[] = ['pass', 'warn', 'block'];
const MODES: IsolationMode[] = ['docker-box', 'static-analysis'];
const DIAG_NAMES = [
  ...WARN_FLOOR_DIAGNOSTICS,
  'mode-changed',
  'secret-values-capped',
  'baseline-race',
  'diff-unstable',
];

const statusArb = fc.constantFrom(...STATUSES);
const verdictArb = fc.constantFrom(...VERDICTS);
const modeArb = fc.constantFrom(...MODES);
const diagArb: fc.Arbitrary<Diagnostic> = fc.record({ name: fc.constantFrom(...DIAG_NAMES) });
const diagsArb = fc.array(diagArb, { maxLength: 6 });
const classArb = fc.constantFrom('external-change' as const, 'isolation-violation' as const);

const inputsArb: fc.Arbitrary<VerdictInputs> = fc.record(
  {
    status: statusArb,
    mode: modeArb,
    wardVerdict: verdictArb,
    diagnostics: diagsArb,
    originalChange: fc.record({ classification: classArb }),
    fingerprintUnreadable: fc.boolean(),
    egressWardPresent: fc.boolean(),
    secretReadRecordingActive: fc.boolean(),
  },
  { requiredKeys: ['status', 'mode', 'diagnostics'] },
);

const rank = (v: Verdict): number => VERDICT_ORDER[v];

const fpArb: fc.Arbitrary<FingerprintResult> = fc
  .dictionary(fc.stringMatching(/^[a-z]{1,3}$/), fc.constantFrom('h1', 'h2', 'h3'), { maxKeys: 5 })
  .map((manifest) => ({ hash: JSON.stringify(Object.entries(manifest).sort()), manifest }));

describe('Property 9: Verdict composition and claims', () => {
  it(
    `runnerVerdict equals max(ward, floor) [runs=${NUM_RUNS}, mode=${PBT_MODE}]`,
    () => {
      let executed = 0;
      fc.assert(
        fc.property(inputsArb, (i) => {
          executed++;
          const v = runnerVerdict(i);
          const ward = i.wardVerdict ?? 'pass';

          // Independent floor computation straight from design.md.
          let floor: Verdict = 'pass';
          if (i.status === 'isolation-violation' || i.originalChange?.classification === 'isolation-violation') {
            floor = 'block';
          } else if (
            i.status !== 'ok' ||
            i.mode === 'static-analysis' ||
            i.diagnostics.some((d) => WARN_FLOOR_DIAGNOSTICS.includes(d.name)) ||
            i.originalChange?.classification === 'external-change' ||
            i.fingerprintUnreadable === true ||
            (i.egressWardPresent === true && i.secretReadRecordingActive !== true)
          ) {
            floor = 'warn';
          }
          const expected = rank(ward) >= rank(floor) ? ward : floor;
          expect(v).toBe(expected);

          // Never below the ward verdict.
          expect(rank(v)).toBeGreaterThanOrEqual(rank(ward));

          // pass only if status ok, docker-box, ward pass.
          if (v === 'pass') {
            expect(i.status).toBe('ok');
            expect(i.mode).toBe('docker-box');
            expect(ward).toBe('pass');
          }
        }),
        pbtParams(false),
      );
      console.log(`Property 9 (verdict) runs executed: ${executed}`);
    },
    testTimeoutMs(false),
  );

  it(
    `adding a floor trigger never lowers the verdict [runs=${NUM_RUNS}]`,
    () => {
      let executed = 0;
      fc.assert(
        fc.property(
          inputsArb,
          fc.constantFrom(...WARN_FLOOR_DIAGNOSTICS),
          fc.constantFrom('status', 'mode', 'diag', 'external', 'violation', 'unreadable', 'egress'),
          (i, diagName, trigger) => {
            executed++;
            let j: VerdictInputs = i;
            switch (trigger) {
              case 'status':
                j = { ...i, status: i.status === 'ok' ? 'timeout' : i.status };
                break;
              case 'mode':
                j = { ...i, mode: 'static-analysis' };
                break;
              case 'diag':
                j = { ...i, diagnostics: [...i.diagnostics, { name: diagName }] };
                break;
              case 'external':
                j = { ...i, originalChange: i.originalChange ?? { classification: 'external-change' } };
                break;
              case 'violation':
                j = { ...i, originalChange: { classification: 'isolation-violation' } };
                break;
              case 'unreadable':
                j = { ...i, fingerprintUnreadable: true };
                break;
              case 'egress':
                j = { ...i, egressWardPresent: true, secretReadRecordingActive: false };
                break;
            }
            expect(rank(runnerVerdict(j))).toBeGreaterThanOrEqual(rank(runnerVerdict(i)));
            if (trigger === 'violation') expect(runnerVerdict(j)).toBe('block');
          },
        ),
        pbtParams(false),
      );
      console.log(`Property 9 (monotone floor) runs executed: ${executed}`);
    },
    testTimeoutMs(false),
  );

  it(
    `p1/p5/p6 claims follow their conditions [runs=${NUM_RUNS}]`,
    () => {
      let executed = 0;
      fc.assert(
        fc.property(
          modeArb,
          fc.boolean(),
          fc.boolean(),
          diagsArb,
          fc.boolean(),
          fc.boolean(),
          (mode, fingerprintsEqual, mountAuditPassed, diagnostics, secretReadRecordingActive, recorderHealthy) => {
            executed++;
            const base = { mode, fingerprintsEqual, mountAuditPassed, diagnostics };
            const p1 = p1Claimed(base);
            expect(p1).toBe(mode === 'docker-box' && fingerprintsEqual && mountAuditPassed);

            const excluded = diagnostics.some((d) => d.name === 'protected-path-excluded');
            expect(p5Claimed(base)).toBe(p1 && !excluded);
            if (p5Claimed(base)) expect(p1).toBe(true);

            const p6 = p6Claimed({ mode, diagnostics, secretReadRecordingActive, recorderHealthy });
            if (!secretReadRecordingActive || !recorderHealthy) expect(p6).toBe(false);
            if (diagnostics.some((d) => d.name === 'secret-values-unreadable')) expect(p6).toBe(false);
            if (diagnostics.some((d) => d.name === 'recorder-failure')) expect(p6).toBe(false);
            if (mode !== 'docker-box') expect(p6).toBe(false);
            const noBlockers = !diagnostics.some(
              (d) => d.name === 'secret-values-unreadable' || d.name === 'recorder-failure',
            );
            expect(p6).toBe(mode === 'docker-box' && secretReadRecordingActive && recorderHealthy && noBlockers);
          },
        ),
        pbtParams(false),
      );
      console.log(`Property 9 (claims) runs executed: ${executed}`);
    },
    testTimeoutMs(false),
  );

  it(
    `classifyOriginalChange follows the audit outcome [runs=${NUM_RUNS}]`,
    () => {
      let executed = 0;
      fc.assert(
        fc.property(fpArb, fpArb, fc.boolean(), (before, after, audit) => {
          executed++;
          const r = classifyOriginalChange(before, after, audit);
          const same = before.hash === after.hash && JSON.stringify(Object.entries(before.manifest).sort()) === JSON.stringify(Object.entries(after.manifest).sort());
          if (same) {
            expect(r.originalUnchanged).toBe(true);
            expect(r.originalChange).toBeUndefined();
          } else {
            expect(r.originalUnchanged).toBe(false);
            expect(r.originalChange?.classification).toBe(audit ? 'external-change' : 'isolation-violation');
          }
        }),
        pbtParams(false),
      );
      console.log(`Property 9 (classification) runs executed: ${executed}`);
    },
    testTimeoutMs(false),
  );
});

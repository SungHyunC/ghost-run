// fast-check arbitraries for RunResult (shared by result serialization properties).
import fc from 'fast-check';
import type { ObservedEvent, Snapshot, VariantResult } from '@ghost-run/core';
import type { Diagnostic, Isolation, PhaseDurations, ResultRepoState, RunResult } from '../../src/result.js';

// Full-unicode strings, including lone surrogates, tag/zero-width/bidi characters.
const text = fc.string({ unit: 'binary', maxLength: 12 });
const key = text.filter((k) => k !== '__proto__');
const nonNeg = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
const hex = fc.stringMatching(/^[0-9a-f]{64}$/);

type J = null | boolean | number | string | J[] | { [k: string]: J };
// JSON-safe values; no -0, NaN, Infinity, undefined.
const json: fc.Arbitrary<J> = fc.letrec<{ v: J }>((tie) => ({
  v: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
    text,
    fc.array(tie('v'), { maxLength: 4 }),
    fc.dictionary(key, tie('v'), { maxKeys: 4 }),
  ),
})).v;

const verdict = fc.constantFrom('pass', 'warn', 'block' as const);
const uniqueId = (i: number) => `snap-${i}`;

const repoState: fc.Arbitrary<ResultRepoState> = fc.record({
  rootPath: text,
  entries: fc.array(json, { maxLength: 8 }),
});

const snapshot = (i: number): fc.Arbitrary<Snapshot<ResultRepoState>> =>
  fc.record({
    id: fc.constant(uniqueId(i)),
    state: repoState,
    result: fc.oneof(
      fc.constant({ success: true } as const),
      text.map((error) => ({ success: false, error }) as const),
    ),
  });

const change = fc.record({ kind: text }).chain((b) =>
  fc.dictionary(key, json, { maxKeys: 3 }).map((rest) => ({ ...rest, ...b })),
);
const effect = fc.record({ kind: text, destination: text }).chain((b) =>
  fc.dictionary(key, json, { maxKeys: 3 }).map((rest) => ({ ...rest, ...b })),
);

const observed: fc.Arbitrary<ObservedEvent> = fc.record(
  {
    kind: fc.constantFrom('network-attempt', 'secret-read' as const),
    destination: text,
    path: text,
    stepIndex: nonNeg,
    eventId: text,
  },
  { requiredKeys: ['kind', 'stepIndex'] },
);

const variant: fc.Arbitrary<VariantResult> = fc.record(
  {
    variantId: text,
    success: fc.boolean(),
    contactForceN: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0 }).map((n) => (Object.is(n, -0) ? 0 : n)),
    forbiddenContactOccurred: fc.boolean(),
  },
  { requiredKeys: ['variantId', 'success'] },
);

const wardVerdict = fc.record({
  verdict,
  violations: fc.array(
    fc.record({
      wardId: text,
      wardKind: fc.constantFrom('path', 'sql', 'egress', 'physics' as const),
      reason: text,
    }),
    { maxLength: 3 },
  ),
  notices: fc.array(
    fc.record(
      {
        kind: fc.constantFrom('effect-outside', 'observed-event' as const),
        reason: text,
        stepIndex: nonNeg,
        destination: text,
        path: text,
      },
      { requiredKeys: ['kind', 'reason', 'stepIndex'] },
    ),
    { maxLength: 3 },
  ),
});

const isolation: fc.Arbitrary<Isolation> = fc.record(
  {
    mode: fc.constantFrom('docker-box', 'static-analysis' as const),
    reason: fc.constantFrom('docker-unavailable', 'box-image-missing' as const),
    p1Claimed: fc.boolean(),
    p5Claimed: fc.boolean(),
    p6Claimed: fc.boolean(),
    originalUnchanged: fc.boolean(),
    readOnlyMounts: fc.array(text, { maxLength: 4 }),
    mountAuditPassed: fc.boolean(),
  },
  { requiredKeys: ['mode', 'p1Claimed', 'p5Claimed', 'p6Claimed', 'readOnlyMounts'] },
);

const phases: fc.Arbitrary<PhaseDurations> = fc.record({
  dockerCheckMs: nonNeg,
  fingerprintBeforeMs: nonNeg,
  copyMs: nonNeg,
  baselineMs: nonNeg,
  boxOverheadMs: nonNeg,
  execMs: nonNeg,
  diffMs: nonNeg,
  sqliteMs: nonNeg,
  fingerprintAfterMs: nonNeg,
  cleanupMs: nonNeg,
});

const diagnostic: fc.Arbitrary<Diagnostic> = fc.record(
  {
    name: text,
    stepIndex: nonNeg,
    path: text,
    detail: fc.dictionary(key, fc.oneof(text, fc.integer(), fc.boolean()), { maxKeys: 3 }),
  },
  { requiredKeys: ['name'] },
);

const report = fc.integer({ min: 1, max: 6 }).chain((n) =>
  fc.record({
    snapshots: fc.tuple(...Array.from({ length: n }, (_, i) => snapshot(i))),
    changes: fc.array(fc.array(change, { maxLength: 3 }), { maxLength: 5 }),
    effectsOutside: fc.array(fc.array(effect, { maxLength: 3 }), { maxLength: 5 }),
    observedEvents: fc.array(observed, { maxLength: 4 }),
    variantResults: fc.array(variant, { maxLength: 3 }),
  }),
);

/** Arbitrary valid RunResult (no payload bytes; JSON-safe values only). */
export const runResultArb: fc.Arbitrary<RunResult> = fc.record(
  {
    schemaVersion: fc.constant(1 as const),
    runId: text,
    status: fc.constantFrom(
      'ok',
      'timeout',
      'pipeline-deadline',
      'copy-timeout',
      'isolation-violation',
      'internal-error' as const,
    ),
    rehearsed: fc.boolean(),
    verdict,
    wardVerdict,
    report,
    exitCodes: fc.array(fc.integer({ min: -255, max: 255 }), { maxLength: 6 }),
    copiedAt: text,
    copy: fc.record({ cloned: fc.boolean(), location: text }),
    box: fc.record({ source: fc.constantFrom('fresh', 'pool' as const), image: text }),
    isolation,
    originalChange: fc.record({
      classification: fc.constantFrom('external-change', 'isolation-violation' as const),
      changedPaths: fc.array(text, { maxLength: 4 }),
    }),
    recorder: fc.constant({ location: 'in-box', tamperResistant: false } as const),
    captures: fc.array(fc.record({ eventId: text, byteLength: nonNeg, sha256: hex }), { maxLength: 20 }),
    diagnostics: fc.array(diagnostic, { maxLength: 20 }),
    staticFindings: fc.array(effect, { maxLength: 4 }),
    notices: fc.array(text, { maxLength: 4 }),
    phases,
  },
  { requiredKeys: ['schemaVersion', 'runId', 'status', 'rehearsed', 'verdict', 'report', 'exitCodes', 'copy', 'isolation', 'recorder', 'captures', 'diagnostics', 'staticFindings', 'notices', 'phases'] },
) as fc.Arbitrary<RunResult>;

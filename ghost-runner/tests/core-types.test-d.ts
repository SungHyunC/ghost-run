// W5: compile-time check that `@ghost-run/core` types suffice for ghost-runner.
// Checked by `tsc --noEmit` (tsconfig includes tests/); not executed by vitest.
// Requirements: 8.10, 9.2, 14.1.
//
// RepoState does not exist yet (src/world is a placeholder), so a minimal local
// stand-in type is used below. Replace it with the real import when it lands.
//
// Result: ObservedEvent and GhostReport<S> are sufficient. Payloads travel out
// of band (Req 8.11), so neither type carries a payload field.
//
// Gap recorded (core NOT changed; see .kiro/specs/wards/notes.md):
//   Req 11 emits Change kind `file-modified`, but core's FileChange union and
//   WardEngine only recognise `file-overwritten` for `path` wards. Resolve in
//   the wards spec (map the kind in the engine or in the runner).
import type {
  Change,
  Effect,
  EvaluateInputs,
  GhostReport,
  ObservedEvent,
  Snapshot,
  SecretValues,
} from '@ghost-run/core';

// Local stand-in for the real RepoState (src/world, task pending).
interface RepoState {
  readonly lastStep?: { readonly exitCode: number };
}

const network: ObservedEvent = {
  kind: 'network-attempt',
  destination: 'setup-check.example:443',
  stepIndex: 1,
};

const secret: ObservedEvent = {
  kind: 'secret-read',
  path: '.env',
  stepIndex: 0,
};

const initial: Snapshot<RepoState> = {
  id: 's0',
  state: {},
  result: { success: true },
};

const changes: Change[][] = [[{ kind: 'file-modified', path: 'a.txt' }]];
const effects: Effect[][] = [[]];

const report: GhostReport<RepoState> = {
  snapshots: [initial],
  changes,
  effectsOutside: effects,
  observedEvents: [secret, network],
  variantResults: [],
};

// Payload must not exist on the report or on events.
// @ts-expect-error GhostReport has no payload field
const badReport: GhostReport<RepoState> = { ...report, payload: new Uint8Array() };
// @ts-expect-error ObservedEvent has no payload field
const badEvent: ObservedEvent = { ...network, payload: 'x' };
// @ts-expect-error only the two documented kinds are allowed
const badKind: ObservedEvent = { kind: 'file-read', stepIndex: 0 };

// Task 3.4: new core kinds and fields are importable and usable.
const link: Change = {
  kind: 'symlink-changed',
  path: 'link',
  targetBefore: 'a',
  targetAfter: 'b',
};
const dropped: Change = {
  kind: 'sql-row-count',
  table: 't',
  rowsBefore: 3,
  rowsAfter: 0,
  dropped: true,
};
const withId: ObservedEvent = { ...network, eventId: 'e1' };
const secretValues: SecretValues = new Map([['.env', new Uint8Array([1])]]);
const inputs: EvaluateInputs = {
  secretValues,
  payloads: new Map([['e1', new Uint8Array([2])]]),
};

export type { badEvent, badKind, badReport, report };
export { dropped, inputs, link, withId };

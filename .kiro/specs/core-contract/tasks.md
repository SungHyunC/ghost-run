# Implementation Plan: core-contract

## Task Dependency Graph

```
1 (package scaffold)
└── 2 (types.ts)
    ├── 3 (fingerprint.ts)
    ├── 4 (wards.ts — isMoreRestrictive + WardEngine)
    │   └── 7 (p4-monotonicity PBT)
    ├── 5 (runner.ts — ghostRun)
    │   └── 14 (tests/fixtures — reference world + test adapter)
    │       ├── 6 (verify.ts — verifyWorld)
    │       │   └── 10 (verify.test.ts)
    │       ├── 8 (p1-isolation PBT)
    │       ├── 9 (p2-fidelity PBT)
    │       └── 11 (p3-restore PBT)
    ├── 12 (types.test-d.ts)
    └── 13 (wards.test.ts unit tests)
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4", "5"] },
    { "wave": 4, "tasks": ["7", "12", "13", "14"] },
    { "wave": 5, "tasks": ["6", "8", "9", "10", "11"] }
  ]
}
```

---

## Tasks

- [x] 1. Scaffold `core/` package
  - Create `core/` directory with `package.json` (`name: "@ghost-run/core"`, no runtime dependencies), `tsconfig.json` (targeting ES2022, `lib: ["ES2022", "DOM"]` for Web Crypto), and `eslint.config.mjs` with the `no-restricted-imports` rule blocking `node:*`, `../ui/`, `../apps/`, `../integrations/` from `src/`.
  - Create empty placeholder files: `src/types.ts`, `src/wards.ts`, `src/runner.ts`, `src/fingerprint.ts`, `src/index.ts`, `verify.ts`.
  - Add `fast-check` and `vitest` to `devDependencies` only.
  - **Requirements:** Req 1

- [x] 2. Implement `src/types.ts` — all exported types
  - Export `Snapshot<S>` with `readonly id: string`, `state: S`, and `result: { success: true } | { success: false; error: string }`.
  - Export `Change` (open record, `kind: string`), `Scene` / `SceneValue` / `ScenePrimitive` (JSON-safe recursive type), `Effect` (`kind`, `destination`, open record).
  - Export `Verdict` (`'pass' | 'warn' | 'block'`) and `VERDICT_ORDER` constant.
  - Export `FingerprintResult` with `hash: string` and `manifest: Readonly<Record<string, string>>`.
  - Export `Ward` discriminated union: `path` (deny, paths), `sql` (tables, max_rows_lost), `egress` (secrets, allow_hosts), `physics` (min_success_rate, max_contact_force_n, forbidden_contacts).
  - Export `WardSet` (`{ wards: readonly Ward[] }`), `GhostReport<S>`, `ObservedEvent`, `VariantResult`, `WardViolation`, `WardVerdict`.
  - Export `World<S, A>` interface with all six method signatures; `fingerprint()` returns `Promise<FingerprintResult>`.
  - **Requirements:** Req 1 (all criteria), Req 2.3, Req 3.4, Req 6.2, Req 7.1–7.3

- [x] 3. Implement `src/fingerprint.ts` — `compareFingerprints`
  - Implement pure function `compareFingerprints(before: FingerprintResult, after: FingerprintResult): { changed: boolean; changedPaths: readonly string[] }`.
  - Compute `changedPaths` as keys present in either manifest whose per-resource hash differs between `before` and `after`.
  - Set `changed: true` iff `before.hash !== after.hash`.
  - Export from `src/index.ts`.
  - **Requirements:** Req 6.1, Req 6.2

- [x] 4. Implement `src/wards.ts` — `isMoreRestrictive` and `WardEngine`
  - Implement `isMoreRestrictive(w1: WardSet, w2: WardSet): boolean` using id-based matching and set-containment rules as defined in the design: ward addition = tightening, ward removal = loosening (immediate `false`); per-kind rules for list fields use set difference (W2 adds = tighter, W1 has entry not in W2 = looser); `allow_hosts` is reversed (W2 revokes host = tighter, W2 adds host = looser); numeric `max_*` lower = tighter, `min_*` higher = tighter.
  - Implement `WardEngine.evaluate(report: GhostReport<unknown>, wardSet: WardSet): WardVerdict` that returns the highest-severity verdict and collects `WardViolation[]`; any entry in `report.effectsOutside` or `report.observedEvents` triggers at least `warn`.
  - Export both from `src/index.ts`.
  - **Requirements:** Req 11 (all criteria), Req 3.3, Req 7.3
  - **PBT properties:** P4

- [x] 5. Implement `src/runner.ts` — `ghostRun`
  - Implement `ghostRun<S, A>(world, start, actions): Promise<GhostReport<S>>`.
  - Apply each action via `world.step`, collect per-step diffs via `world.diff`, record statically known effects via `world.effectsOutside`.
  - Accumulate `snapshots`, `changes`, `effectsOutside`, and `observedEvents` (initially empty; Box-observed events are injected by the `ghost-runner` spec layer).
  - On a failed step (`result.success === false`), record the snapshot and continue; do not throw.
  - Export from `src/index.ts`.
  - **Requirements:** Req 3.1, Req 3.2, Req 3.3, Req 3.4, Req 7.1

- [x] 6. Implement `verify.ts` — `verifyWorld`
  - Implement `verifyWorld<S, A>(world, options): Promise<void>` importing only `fast-check` (not `vitest`).
  - Run checks in order: P3 → P1 → P2 (if `deterministic: true`, using `options.testAdapter.apply`) → ward properties.
  - Use `fc.check` (not `fc.assert`) to capture failures without throwing vitest assertions; throw `VerificationError` with `{ propertyId, criterionId, counterexample }` on first failure.
  - Export `verifyWorld`, `VerificationError`, and `DeterministicTestAdapter` from `verify.ts` (not from `src/index.ts`).
  - **Requirements:** Req 12.1, Req 12.2, Req 12.3
  - **PBT properties:** P1, P2, P3

- [x] 7. Write property test for ward monotonicity
  - File: `tests/p4-monotonicity.test.ts`
  - Create `tests/pbt-config.ts` with `NUM_RUNS` and `PBT_TIMEOUT` driven by `GHOST_PBT_MODE` env var (100 / 60 s for short, 10 000 / no limit for nightly).
  - Implement `baseWardSetArb` (random `WardSet` with all ward kinds) and `stricterWardSetArb(w1)` (generates `w2` guaranteed to satisfy `isMoreRestrictive(w1, w2)`).
  - Implement `ghostReportArb` with 0–100 changes.
  - Assert `VERDICT_ORDER[WardEngine.evaluate(report, w2).verdict] >= VERDICT_ORDER[WardEngine.evaluate(report, w1).verdict]` for all generated pairs.
  - Non-vacuity: record the distribution of `(v1, v2)` verdict pairs and the count of cases with `v1 < v2` (via `fc.statistics` or an equivalent counter) and print it in the test output.
  - Tag: `// Feature: core-contract, Property 4: ward verdict monotonicity`.
  - **Property 4: Making ward rules stricter never relaxes a verdict (P4 Monotonicity)**
  - **Validates: Requirements 11.1, 11.4**
- [x] 8. Write property test for ghost run isolation
  - File: `tests/p1-isolation.test.ts`
  - Implement `worldStateArb` and `actionArb` for a reference in-memory world.
  - Per sample: record `fp_before = await world.fingerprint()`, take snapshot, run `ghostRun`, record `fp_after`, assert `fp_before.hash === fp_after.hash`.
  - Non-vacuity: record the generated plan length and whether the ghost run actually changed the state (via `fc.statistics` or an equivalent counter) and print the counts in the test output.
  - Tag: `// Feature: core-contract, Property 1: ghost run never changes reality`.
  - **Property 1: Ghost run never changes reality (P1 Isolation)**
  - **Validates: Requirements 8.1, 8.3**
- [x] 9. Write property test for ghost diff fidelity
  - File: `tests/p2-fidelity.test.ts`
  - Implement `deterministicWorldStateArb`.
  - Per sample: run `ghostRun` on instance A to get `ghostChanges`; run `testAdapter.apply` on instance B to mutate live state and get `realChanges`; assert `deepEqual(ghostChanges, realChanges)`.
  - Only register/run for worlds marked `deterministic: true`.
  - Non-vacuity: record the generated plan length and whether the ghost run actually changed the state (via `fc.statistics` or an equivalent counter) and print the counts in the test output.
  - Tag: `// Feature: core-contract, Property 2: ghost diff equals real diff`.
  - **Property 2: Ghost diff equals real diff in deterministic worlds (P2 Fidelity)**
  - **Validates: Requirements 9.1, 9.3**
- [x] 10. Write example-based tests for `verifyWorld` — `tests/verify.test.ts`
  - Test: a world whose `step` mutates its input snapshot causes `verifyWorld` to throw `VerificationError` with `propertyId: 'P3'`.
  - Test: a world whose `fingerprint()` hash changes after a ghost run causes `verifyWorld` to throw `VerificationError` with `propertyId: 'P1'`.
  - Test: a conforming deterministic world passes all checks without throwing.
  - Test: `verifyWorld` with `deterministic: false` skips P2 without error.
  - **Requirements:** Req 12.1, Req 12.2, Req 12.3

- [x] 11. Write property test for snapshot immutability and replay determinism
  - File: `tests/p3-restore.test.ts`
  - Immutability clause: record `deepClone(s.state)` before `ghostRun`, assert `s.state` is structurally equal after.
  - Replay-determinism clause: run `ghostRun` twice with the same `(s, actions)`, assert final-snapshot states are `deepEqual`.
  - Non-vacuity: record the generated plan length and whether the ghost run actually changed the state (via `fc.statistics` or an equivalent counter) and print the counts in the test output.
  - Tag: `// Feature: core-contract, Property 3: snapshot immutability and replay determinism`.
  - **Property 3: Snapshots are immutable; ghost replay is deterministic (P3 Restore)**
  - **Validates: Requirements 10.1, 10.2, 10.4**
- [x] 12. Write compile-time type tests — `tests/types.test-d.ts`
  - Assert (via `expectTypeOf` or `tsd`) that a class missing any one of the six `World<S, A>` methods produces a TypeScript type error.
  - Assert `Snapshot.id` is `readonly`.
  - Assert a `Scene` value round-trips `JSON.parse(JSON.stringify(...))` without TypeScript errors.
  - Assert `FingerprintResult.manifest` is `Readonly<Record<string, string>>`.
  - **Requirements:** Req 1.1, Req 1.2, Req 1.4, Req 1.6

- [x] 13. Write unit tests for `isMoreRestrictive` and `WardEngine` — `tests/wards.test.ts`
  - `isMoreRestrictive`: one test per ward kind covering add-entry (tighter), remove-entry (looser), add-host to allow_hosts (looser regardless of count), revoke-host from allow_hosts (tighter), add whole ward (tighter), remove whole ward (looser), no change (returns false), lower max_rows_lost (tighter), higher max_rows_lost (looser).
  - `WardEngine.evaluate`: empty wardSet returns `'pass'`; a report with an `observedEvent` returns at least `'warn'`; a report with an `effectsOutside` entry returns at least `'warn'`.
  - Each failing test case maps to a `WardViolation` with the correct `wardId` and non-empty `reason`.
  - **Requirements:** Req 11.1, Req 11.2, Req 11.3, Req 7.3

- [x] 14. Create `tests/fixtures/` — reference world and deterministic test adapter
  - Implement a `KeyValueWorld` in `tests/fixtures/key-value-world.ts`: a minimal in-process `World<Record<string, string>, KVAction>` where `KVAction` is `{ op: 'set' | 'delete'; key: string; value?: string }`. All six contract methods must be implemented — `snapshot` deep-copies the map, `step` returns a new snapshot without mutating the input, `diff` returns `Change[]` with `kind: 'set' | 'delete'`, `render` returns the map as a `Scene`, `fingerprint` hashes all key-value pairs with Web Crypto SHA-256, `effectsOutside` always returns `[]`.
  - Implement `kvTestAdapter` in `tests/fixtures/kv-test-adapter.ts`: a `DeterministicTestAdapter<Record<string, string>, KVAction>` whose `apply(state, actions)` method mutates a live `KeyValueWorld` instance and returns the accumulated `Change[]`.
  - Export both from `tests/fixtures/index.ts`. All PBT files (tasks 8, 9, 11) and `verify.test.ts` (task 10) import their world and adapter from this fixture.
  - **Requirements:** Req 2.1, Req 3.1, Req 3.2, Req 4.1, Req 4.2, Req 5.1, Req 6.1, Req 6.2, Req 9.1
  - **PBT properties:** P1, P2, P3

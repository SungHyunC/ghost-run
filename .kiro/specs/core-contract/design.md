# Design Document: core-contract

## Overview

`core/` is the zero-dependency foundation of Ghost Run+. It publishes the **World Contract** — a TypeScript generic interface `World<S, A>` with six methods — and the **Safety Contract** — four property-based correctness properties (P1–P4) that every `World` implementation must pass before it can be registered in the playground.

Every other package (`ui/`, `apps/*`, `integrations/*`, `worlds/*`) depends on `core/`. `core/src/` has no runtime dependencies: no Node standard library modules, no `node:` imports, no third-party packages. Hashing uses the Web Crypto API (`globalThis.crypto.subtle`) so the package runs in both the browser (Playground) and Node without a flag. `fast-check` and `vitest` are `devDependencies` used only in test files and the `verifyWorld` contract-check entry point; they are never imported from `src/` runtime code.

The design is intentionally minimal: no classes, no runtime framework, no server. `core/` exports type definitions, a handful of pure functions, a reference ghost runner (in-process only), and a contract-verification function.

> **Scope boundary:** `ghostRun` in this package is an in-process reference runner used by the PBT harness and the Playground. The Docker Box runner that isolates real-mode execution is specified separately in the `ghost-runner` spec.

---

## Architecture

```
core/                            ← pnpm workspace package "@ghost-run/core"
├─ src/
│  ├─ types.ts                   ← All exported types (Snapshot, Change, Scene,
│  │                                Effect, Ward, WardSet, Verdict, FingerprintResult,
│  │                                GhostReport, World<S,A>)
│  ├─ wards.ts                   ← isMoreRestrictive(), verdictOrder(),
│  │                                WardEngine.evaluate()
│  ├─ runner.ts                  ← ghostRun(): in-process reference runner;
│  │                                executes a plan against a Snapshot without
│  │                                touching real state
│  ├─ fingerprint.ts             ← compareFingerprints() pure helper
│  └─ index.ts                   ← Re-exports everything that is public API
├─ tests/
│  ├─ types.test-d.ts            ← Compile-time type tests (vitest type-check)
│  ├─ pbt-config.ts              ← NUM_RUNS, PBT_TIMEOUT — shared PBT helpers
│  ├─ p1-isolation.test.ts       ← P1 PBT: fingerprint before == after ghost run
│  ├─ p2-fidelity.test.ts        ← P2 PBT: ghost diff == real diff (deterministic
│  │                                worlds only, via test adapter)
│  ├─ p3-restore.test.ts         ← P3 PBT: Snapshot immutability + replay
│  ├─ p4-monotonicity.test.ts    ← P4 PBT: ward verdict monotonicity
│  ├─ wards.test.ts              ← Unit + property tests for isMoreRestrictive
│  │                                and WardEngine.evaluate
│  └─ verify.test.ts             ← Example-based tests for verifyWorld gate
├─ verify.ts                     ← verifyWorld() entry point (imports fast-check
│                                   only; vitest is used in test files, not here);
│                                   consumed by contract-pbt hook and world-scaffold
│                                   hook; NOT part of src/
├─ package.json
└─ tsconfig.json
```

Dependency direction: `src/runner.ts`, `src/wards.ts`, and `src/fingerprint.ts` import only from `src/types.ts`. `src/index.ts` re-exports from all source files. Test files import from `src/index.ts` and from `fast-check` / `vitest`. `verify.ts` imports from `src/index.ts` and `fast-check` only. No file under `core/` contains an import path that starts with `../ui`, `../apps`, or `../integrations`.

---

## Components and Interfaces

### `ghostRun(world, snapshot, actions)` — `src/runner.ts`

```ts
export async function ghostRun<S, A>(
  world: World<S, A>,
  start: Snapshot<S>,
  actions: readonly A[],
): Promise<GhostReport<S>>;
```

Applies each action in `actions` to successive snapshots via `world.step`. Collects per-step diffs via `world.diff`, records effects via `world.effectsOutside`, and assembles a `GhostReport`. Never writes to any real state; whether the Box is in use is the concern of the `ghost-runner` spec, not this package.

### `WardEngine.evaluate(report, wardSet)` — `src/wards.ts`

```ts
export const WardEngine = {
  evaluate(report: GhostReport<unknown>, wardSet: WardSet): WardVerdict,
};
```

Folds `report.changes`, `report.observedEvents`, and `report.variantResults` against each ward in `wardSet.wards`. Returns the highest-severity verdict produced by any ward, together with a list of `WardViolation` objects. Any out-of-box side effect in `report.effectsOutside` or `report.observedEvents` triggers at least `warn`, independent of the ward set (warn means "side effect outside the copy, human approval required"). Each such effect or event yields a `WardNotice` in `WardVerdict.notices` (kind, non-empty reason, step index, destination, and path when present). For `effectsOutside` the step index is the outer array index; for observed events it is `stepIndex`. With zero wards, no side effects yields `pass` and any side effect yields `warn`. Notices do not depend on the ward set, so a stricter ward set never lowers the verdict (P4). Detailed per-kind evaluation rules (path matching, row counting, egress matching, physics thresholds) are specified in the `wards` spec; this package defines only the types, the verdict ordering, and the P4 monotonicity contract.

### `compareFingerprints(before, after)` — `src/fingerprint.ts`

```ts
export function compareFingerprints(
  before: FingerprintResult,
  after: FingerprintResult,
): { changed: boolean; changedPaths: readonly string[] };
```

Pure function. Compares the `manifest` maps of two `FingerprintResult` values and returns the set of paths whose per-resource hash differs. `fingerprint()` itself carries no "previous call" state; callers compute deltas by passing two results to this function.

### `isMoreRestrictive(w1, w2)` — `src/wards.ts`

See [isMoreRestrictive section](#ismorerestrective-predicate) below.

### `verifyWorld(world, options)` — `verify.ts`

See [Registration Gate section](#registration-gate) below.

---

## Data Models

### `src/types.ts` — complete exported types

```ts
// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * An immutable value-object capturing the full state of a World at one point
 * in time. Once created it is never mutated by any World method.
 * `result` records the outcome of the last action applied to reach this snapshot.
 * The initial snapshot (before any action) carries `{ success: true }`.
 */
export interface Snapshot<S> {
  readonly id: string;        // unique within one World instance's lifetime
  readonly state: S;
  readonly result:
    | { readonly success: true }
    | { readonly success: false; readonly error: string };
}

// ── Change ────────────────────────────────────────────────────────────────────

export interface Change {
  readonly kind: string;
  readonly [key: string]: unknown;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export type ScenePrimitive = string | number | boolean | null;
export type SceneValue =
  | ScenePrimitive
  | SceneValue[]
  | { [key: string]: SceneValue };

export interface Scene {
  readonly [key: string]: SceneValue;
}

// ── Effect ────────────────────────────────────────────────────────────────────

export interface Effect {
  readonly kind: string;
  readonly destination: string;
  readonly [key: string]: unknown;
}

// ── Verdict ───────────────────────────────────────────────────────────────────

/** pass < warn < block in strictness order. */
export type Verdict = 'pass' | 'warn' | 'block';

export const VERDICT_ORDER: Record<Verdict, number> = {
  pass: 0,
  warn: 1,
  block: 2,
} as const;

// ── FingerprintResult ─────────────────────────────────────────────────────────

/**
 * Return value of World.fingerprint().
 *
 * `hash`     — a hex or base64 string from a cryptographic hash (Web Crypto
 *              SHA-256) over all tracked resources. Identical if no tracked
 *              resource changed.
 * `manifest` — per-resource hash map keyed by resource path. Callers compute
 *              which paths changed by passing two FingerprintResult values to
 *              compareFingerprints() — fingerprint() itself carries no state
 *              about previous calls.
 */
export interface FingerprintResult {
  readonly hash: string;
  readonly manifest: Readonly<Record<string, string>>;
}

// ── Ward ─────────────────────────────────────────────────────────────────────

/**
 * A single guard rule as declared in wards.yaml.
 * `id` uniquely identifies the ward within a WardSet.
 * `kind` is the discriminant for the union.
 */
export type Ward =
  | {
      readonly id: string;
      readonly kind: 'path';
      /** Operations to deny on matched paths. */
      readonly deny: ReadonlyArray<'delete' | 'overwrite'>;
      readonly paths: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: 'sql';
      readonly tables: readonly string[];
      /** Maximum number of rows that may be lost across all protected tables. */
      readonly max_rows_lost: number;
    }
  | {
      readonly id: string;
      readonly kind: 'egress';
      readonly secrets: readonly string[];
      readonly allow_hosts: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: 'physics';
      readonly min_success_rate: number;      // 0–1
      readonly max_contact_force_n: number;   // Newtons
      readonly forbidden_contacts: readonly string[];
    };

// ── WardSet ───────────────────────────────────────────────────────────────────

/** The full set of guard rules for a world, parsed from wards.yaml. */
export interface WardSet {
  readonly wards: readonly Ward[];
}

// ── GhostReport ───────────────────────────────────────────────────────────────

/**
 * Full output of a ghost run. WardEngine.evaluate() receives this, not just
 * the Change[].
 *
 * `changes`        — per-step Change arrays, one entry per action.
 * `observedEvents` — network attempts and secret-file reads observed inside
 *                    the Box that were NOT listed in effectsOutside; reported
 *                    as separate ghost events so dynamically discovered
 *                    destinations are still surfaced to the ward engine.
 * `effectsOutside` — statically known out-of-box side effects from each step.
 * `variantResults` — physics world variant outcomes (empty for non-physics worlds).
 */
export interface GhostReport<S> {
  readonly snapshots: readonly Snapshot<S>[];
  readonly changes: readonly Change[][];
  readonly effectsOutside: readonly Effect[][];
  readonly observedEvents: readonly ObservedEvent[];
  readonly variantResults: readonly VariantResult[];
}

export interface ObservedEvent {
  readonly kind: 'network-attempt' | 'secret-read';
  readonly destination?: string;
  readonly path?: string;
  readonly stepIndex: number;
}

export interface VariantResult {
  readonly variantId: string;
  readonly success: boolean;
  readonly contactForceN?: number;
  readonly forbiddenContactOccurred?: boolean;
}

// ── WardVerdict ───────────────────────────────────────────────────────────────

export interface WardViolation {
  readonly wardId: string;
  readonly wardKind: Ward['kind'];
  /** Human-readable reason, e.g. "would delete 1,206 rows from users". */
  readonly reason: string;
}

export interface WardVerdict {
  readonly verdict: Verdict;
  readonly violations: readonly WardViolation[];
  /** One entry per effectsOutside entry / observedEvent that causes warn. */
  readonly notices: readonly WardNotice[];
}

/** Warn-level finding, independent of wards. */
export interface WardNotice {
  readonly kind: 'effect-outside' | 'observed-event';
  readonly reason: string;
  readonly stepIndex: number;
  readonly destination?: string;
  readonly path?: string;
}

// ── World<S, A> ───────────────────────────────────────────────────────────────

export interface World<S, A> {
  /** Capture a copy of current real-world state. Must not modify reality. */
  snapshot(): Promise<Snapshot<S>>;

  /** Apply one action to a snapshot copy. Must not modify reality or the input snapshot. */
  step(s: Snapshot<S>, a: A): Promise<Snapshot<S>>;

  /** Return the minimal Change[] between two snapshots. Pure function. */
  diff(before: Snapshot<S>, after: Snapshot<S>): Change[];

  /** Return a JSON-serialisable Scene for the UI kit. Pure function. */
  render(s: Snapshot<S>): Scene;

  /**
   * Return a cryptographic fingerprint (Web Crypto SHA-256) of real-world
   * state plus a per-resource manifest.
   * compareFingerprints(before, after) computes which paths changed.
   * Must not trigger any external Effect.
   */
  fingerprint(): Promise<FingerprintResult>;

  /**
   * Return a best-effort list of Effects an action is statically known to
   * produce outside the copied world.
   * Must not perform any I/O.
   */
  effectsOutside(a: A): Effect[];
}
```

---

## `isMoreRestrictive` Predicate

### Signature

```ts
// src/wards.ts
export function isMoreRestrictive(w1: WardSet, w2: WardSet): boolean;
```

### Algorithm (implements Req 11, criterion 2)

The function compares wards **by matching id**. A ward present in `w2` but not in `w1` counts as a tightening (adding a ward is more restrictive). A ward present in `w1` but absent in `w2` is a loosening and immediately returns `false`.

For each pair of wards with the same `id` and `kind`, apply the kind-specific rules:

| Kind | More-restrictive condition (`w2` vs `w1`) | Less-restrictive (returns `false`) |
|---|---|---|
| `path` | `w2.deny` ⊃ `w1.deny` (w2 adds a denied operation not in w1), or `w2.paths` ⊃ `w1.paths` (w2 adds a path not in w1) | `w1.deny` \ `w2.deny` is non-empty (w2 drops a denied operation), or `w1.paths` \ `w2.paths` is non-empty (w2 drops a protected path) |
| `sql` | `w2.max_rows_lost` < `w1.max_rows_lost`, or `w2.tables` ⊃ `w1.tables` (w2 adds a protected table) | `w2.max_rows_lost` > `w1.max_rows_lost`, or `w1.tables` \ `w2.tables` is non-empty (w2 drops a protected table) |
| `egress` | `w2.secrets` ⊃ `w1.secrets` (w2 adds a secret path), or `w1.allow_hosts` \ `w2.allow_hosts` is non-empty (w2 revokes a previously allowed host) | `w1.secrets` \ `w2.secrets` is non-empty (w2 drops a secret path), or `w2.allow_hosts` ⊃ `w1.allow_hosts` (w2 adds a newly allowed host — always a loosening regardless of list length) |
| `physics` | `w2.min_success_rate` > `w1.min_success_rate`, or `w2.max_contact_force_n` < `w1.max_contact_force_n`, or `w2.forbidden_contacts` ⊃ `w1.forbidden_contacts` (w2 adds a forbidden contact) | Opposite direction on any numeric threshold, or `w1.forbidden_contacts` \ `w2.forbidden_contacts` is non-empty (w2 drops a forbidden contact) |

`isMoreRestrictive` returns `true` if at least one tightening was found and no loosenings were found. Absent fields are treated as the least-restrictive default (zero thresholds, empty lists). The predicate is a pure function.

```
isMoreRestrictive(w1, w2):
  tightening = false
  for each id in union(ids(w1.wards), ids(w2.wards)):
    ward1 = findById(w1.wards, id)  // may be absent
    ward2 = findById(w2.wards, id)  // may be absent
    if ward1 absent and ward2 present: tightening = true; continue
    if ward1 present and ward2 absent: return false   // removing a ward is loosening
    result = compareWard(ward1, ward2)
    if result == LOOSER: return false
    if result == TIGHTER: tightening = true
  return tightening
```

---

## Correctness Properties

### Property 1: Ghost run never changes reality (P1 Isolation)

*Claimed scope: Playground and Box. Not claimed when the Box is unavailable and the system falls back to static analysis (Plan B).*

For any world, any initial state reachable by that world, and any action sequence of length 1 to 50, running `ghostRun` against a Snapshot derived from that state SHALL leave `world.fingerprint().hash` unchanged (same string before and after).

**Validates: Requirements 8.1, 8.3**

---

### Property 2: Ghost diff equals real diff in deterministic worlds (P2 Fidelity)

*Claimed scope: Playground, Deterministic_Worlds only.*

For any Deterministic_World, any initial state, and any plan of length 1 to 50, the `Change[]` produced by `ghostRun` SHALL be deep-equal to the `Change[]` produced by a test-adapter `apply(world, state, actions)` function that executes the same actions against a live (non-copied) world instance. The `apply` function is part of the test adapter for each Deterministic_World; it is **not** one of the six World contract methods. This ensures P2 tests real state mutation rather than comparing two in-process ghost runs.

**Validates: Requirements 9.1, 9.3**

---

### Property 3: Snapshots are immutable; ghost replay is deterministic (P3 Restore)

*Claimed scope: All worlds.*

For any world, snapshot `s`, and action sequence of length 1 to 50:
- `s.state` after all `step` calls SHALL be structurally identical to `s.state` before the first `step` call (immutability clause).
- Running the same `(s, action_sequence)` pair in two separate `ghostRun` calls SHALL produce a final Snapshot whose `state` is recursively structurally equal in both runs (replay-determinism clause).
- For physics worlds, the state type `S` MUST include all integrator state (warm-start values, velocity carry-over, contact-cache entries) so that the physics engine produces identical contact forces and joint positions at every step across runs.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

---

### Property 4: Making ward rules stricter never relaxes a verdict (P4 Monotonicity)

*Claimed scope: All worlds (wards engine logic).*

For any `WardSet` pair `(w1, w2)` where `isMoreRestrictive(w1, w2) === true` and any `GhostReport` with 0 to 100 changes, `WardEngine.evaluate(report, w2).verdict` SHALL have a `VERDICT_ORDER` value greater than or equal to `WardEngine.evaluate(report, w1).verdict`.

**Validates: Requirements 11.1, 11.4**

---

### Property 5: `diff` identity, completeness, and purity

For any snapshot `s`, `diff(s, s)` SHALL return `[]`. For any pair of snapshots `(before, after)` whose states are not recursively structurally equal, `diff(before, after)` SHALL return a non-empty array. Calling `diff` twice with the same arguments SHALL return arrays that are recursively structurally equal, and every element SHALL carry a non-empty `kind` string.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

---

### Property 6: `render` produces JSON-serialisable, deterministic output

For any snapshot `s`, `JSON.parse(JSON.stringify(world.render(s)))` SHALL be recursively structurally equal to `world.render(s)`, and calling `render(s)` twice SHALL return structurally equal `Scene` values.

**Validates: Requirements 5.1, 5.2**

---

### Property 7: `step` does not mutate its input snapshot

For any snapshot `s` and action `a`, after calling `step(s, a)`, `s.state` SHALL be recursively structurally equal to `s.state` immediately before the call.

**Validates: Requirements 3.2**

---

### Property 8: `effectsOutside` is pure and side-effect-free

For any valid action `a`, calling `effectsOutside(a)` twice SHALL return arrays that are recursively structurally equal, and no network call or file I/O observable from the process SHALL occur during either call.

**Validates: Requirements 7.4**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `step(s, a)` where `a` causes the world to fail | Returns `Snapshot` with `result: { success: false, error: "<description>" }`. Never throws. |
| `fingerprint()` cannot read a tracked resource | Throws `FingerprintReadError` naming the unreadable resource. Does not modify tracked state. |
| `effectsOutside(a)` receives an invalid action | Throws `InvalidActionError`. Does not perform I/O. |
| `verifyWorld(world)` and a Safety Contract test fails | Throws `VerificationError` with `{ propertyId, criterionId, counterexample }`. Does not register the world. |
| `ghostRun` encounters a non-fatal step failure | Records the step's `Snapshot` (with `result.success === false`) in the chain and continues. The caller decides whether to abort. |
| `WardEngine.evaluate` with an empty `wardSet.wards` | Returns `{ verdict: 'pass', violations: [], notices: [] }` when the report has no side effects; `warn` with notices otherwise. |
| `isMoreRestrictive(w1, w2)` with absent fields | Treats absent fields as least-restrictive default; never throws. |

---

## Testing Strategy

### Test mode selection

```ts
// tests/pbt-config.ts
export const NUM_RUNS = process.env.GHOST_PBT_MODE === 'nightly' ? 10_000 : 100;
export const PBT_TIMEOUT = process.env.GHOST_PBT_MODE === 'nightly' ? undefined : 60_000;
```

- **Short run** (default, `GHOST_PBT_MODE` unset or `'short'`): `numRuns: 100`, global timeout 60 s across the full P1–P4 suite for a single world.
- **Nightly run** (`GHOST_PBT_MODE='nightly'`): `numRuns: 10_000`, no timeout.

Each `*.test.ts` file passes `{ numRuns: NUM_RUNS }` to `fc.assert` and sets `{ timeout: PBT_TIMEOUT }` on the vitest `describe` block.

### Non-vacuity statistics

Each PBT file collects statistics through the shared helper `tests/pbt-stats.ts`, prints one summary line (for example `P1 stats: runs=100 changed=NN unchanged=MM lengths={...}`) and asserts non-vacuity: P1 requires at least one sample whose ghost run changed the state and plan lengths spanning more than one bucket. P4 prints the distribution of `(v1, v2)` verdict pairs and requires at least one sample with `VERDICT_ORDER[v1] < VERDICT_ORDER[v2]`.

### `p1-isolation.test.ts`

**Arbitraries:** `fc.array(actionArb, { minLength: 1, maxLength: 50 })`, `worldStateArb`.

**Algorithm per sample:**
1. Initialise the reference world to the generated state.
2. Record `fp_before = await world.fingerprint()`.
3. Take `s = await world.snapshot()`.
4. Run `ghostRun(world, s, actions)`.
5. Record `fp_after = await world.fingerprint()`.
6. Assert `fp_before.hash === fp_after.hash`.

### `p2-fidelity.test.ts`

**Arbitraries:** `fc.array(actionArb, { minLength: 1, maxLength: 50 })`, `deterministicWorldStateArb`.

**Algorithm per sample:**
1. Initialise two fresh instances of the same Deterministic_World to the same state.
2. On instance A: run `ghostRun` and collect `ghostChanges` (flattened from `report.changes`).
3. On instance B: run the test-adapter `apply(world, state, actions)` to mutate live state and collect `realChanges`.
4. Assert `deepEqual(ghostChanges, realChanges)`.

P2 is asserted only for worlds whose `verifyWorld` metadata marks them as `deterministic: true`.

### `p3-restore.test.ts`

**Arbitraries:** `fc.array(actionArb, { minLength: 1, maxLength: 50 })`, `worldStateArb`.

**Immutability clause:** record `s.state` before `ghostRun`, assert it is unchanged after.

**Replay-determinism clause:** run `ghostRun` twice with the same `(s, actions)`, assert final-snapshot states are `deepEqual`.

### `p4-monotonicity.test.ts`

**Arbitraries:** `baseWardSetArb`, `stricterWardSetArb(w1)` (generates a `w2` guaranteed to satisfy `isMoreRestrictive(w1, w2)`), `ghostReportArb` (0–100 changes).

**Algorithm per sample:**
1. Generate `(w1, w2)` where `isMoreRestrictive(w1, w2) === true`.
2. `v1 = WardEngine.evaluate(report, w1).verdict`.
3. `v2 = WardEngine.evaluate(report, w2).verdict`.
4. Assert `VERDICT_ORDER[v2] >= VERDICT_ORDER[v1]`.

---

## Registration Gate

The `register()` call and the `WorldRegistry` runtime map are removed from `core/`. The playground loads a pre-validated world manifest (a JSON file listing world IDs that have already passed `verifyWorld`); it does not run PBT at load time. The browser Playground never executes fast-check or vitest.

### `verifyWorld(world, options)` — `verify.ts`

```ts
// verify.ts  (not under src/; imports fast-check only — vitest is test-file only)
export async function verifyWorld<S, A>(
  world: World<S, A>,
  options: {
    id: string;
    deterministic: boolean;
    wardSet: WardSet;
    testAdapter?: DeterministicTestAdapter<S, A>; // required when deterministic: true
    numRuns?: number;      // defaults to NUM_RUNS from pbt-config
    actionArb: fc.Arbitrary<A>; // generator of valid actions used to build plans
  },
): Promise<void>;
```

`DeterministicTestAdapter<S, A>` provides the `apply(state, actions): Change[]` function used by P2.

**Execution order:**

1. **P3** — run P3 property test. On failure throw `VerificationError` with `{ propertyId: 'P3', criterionId: '10.1' | '10.2' | '10.3', counterexample }`.
2. **P1** — run P1 property test. On failure throw `VerificationError` with `propertyId: 'P1'`.
3. **P2** (only if `deterministic: true`) — run P2 using `testAdapter.apply`. On failure throw `VerificationError` with `propertyId: 'P2'`.
4. **Ward properties** — for each ward in `options.wardSet.wards`, run the per-kind PBT suite. On failure throw `VerificationError` with `propertyId: 'ward:<ward-id>'`.

P3 runs first because it is a prerequisite for P1 and P2.

```ts
export class VerificationError extends Error {
  constructor(
    public readonly propertyId: string,
    public readonly criterionId: string,
    public readonly counterexample: unknown,
  ) {
    super(`Verification failed: ${propertyId} (${criterionId})`);
  }
}
```

`verifyWorld` is called from the `contract-pbt` hook (on `core/**` and `worlds/**` saves) and from the `world-scaffold` hook. The playground reads a static manifest; it does not call `verifyWorld` at runtime.

---

## Dependency and Export Rules

### Public exports from `core/src/index.ts`

| Symbol | Source file |
|---|---|
| `Snapshot<S>`, `Change`, `Scene`, `SceneValue`, `ScenePrimitive`, `Effect`, `Ward`, `WardSet`, `Verdict`, `VERDICT_ORDER`, `FingerprintResult`, `GhostReport`, `ObservedEvent`, `VariantResult`, `WardViolation`, `WardNotice`, `WardVerdict`, `World<S, A>` | `types.ts` |
| `isMoreRestrictive` | `wards.ts` |
| `WardEngine` | `wards.ts` |
| `ghostRun` | `runner.ts` |
| `compareFingerprints` | `fingerprint.ts` |

### Separate entry point (not part of `src/`)

| Symbol | File |
|---|---|
| `verifyWorld`, `VerificationError`, `DeterministicTestAdapter` | `verify.ts` |

### Private (not exported from index)

- `NUM_RUNS`, `PBT_TIMEOUT` — test-only helpers in `tests/pbt-config.ts`
- Internal fast-check arbitraries in test files

### Import constraint

No file under `core/src/` imports from `node:*`, `../ui/`, `../apps/`, or `../integrations/`. `verify.ts` may import `fast-check` as a devDependency. Test files may import both `fast-check` and `vitest`. `verify.ts` does NOT import `vitest`. This constraint is enforced by an ESLint `no-restricted-imports` rule in `core/eslint.config.mjs`.

---

## Correctness Properties Summary Table

| Requirement | Property ID | fast-check arbitraries | Claimed scope | Short-run examples |
|---|---|---|---|---|
| Req 8 — P1 Isolation | P1 | `actionSeqArb` (len 1–50), `worldStateArb` | Playground + Box (not Plan B fallback) | 100 |
| Req 9 — P2 Fidelity | P2 | `actionSeqArb` (len 1–50), `deterministicWorldStateArb`, test-adapter `apply` | Playground, Deterministic_Worlds only | 100 |
| Req 10 — P3 Restore | P3 | `actionSeqArb` (len 1–50), `worldStateArb` | All worlds | 100 |
| Req 11 — P4 Ward Monotonicity | P4 | `baseWardSetArb`, `stricterWardSetArb(w1)`, `ghostReportArb` (0–100 changes) | All worlds (wards engine) | 100 |

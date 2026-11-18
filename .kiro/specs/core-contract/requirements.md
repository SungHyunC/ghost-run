# Requirements Document

## Introduction

The `core-contract` package defines the **World Contract** and the **Safety Contract** for Ghost Run+. The World Contract is a TypeScript generic interface (`World<S, A>`) with six functions that every world implementation must provide. The Safety Contract is a set of four property-based correctness properties (P1–P4) that every world implementation must satisfy before it can be registered in the playground. Together they form the stable boundary between the ghost runner, the ward engine, and each concrete world (file system, database, physics, cloud).

## Glossary

- **World**: A concrete environment that the ghost runner can observe and manipulate. Implemented as a TypeScript class that satisfies `World<S, A>`.
- **Snapshot**: An immutable value-object that captures the full state of a World at a single point in time. Identified by a unique `id`. Once created, a Snapshot is never mutated.
- **Action**: A typed value that describes one operation to perform on a World (e.g. a shell command, a SQL statement, a robot movement).
- **Change**: A record that describes one unit of difference between two Snapshots (e.g. a file deletion, a row update, a bucket removal).
- **Scene**: A serialisable data structure that the UI renders as the mirror world.
- **Effect**: A record that describes a side-effect that would reach outside the copied world (e.g. a network call, an external database write).
- **Ghost_Runner**: The component that executes a plan (list of Actions) against a Snapshot without touching the real world.
- **Ward_Engine**: The component that evaluates a list of Changes against a set of ward rules and returns a verdict (pass / warn / block), where pass < warn < block in strictness order.
- **Fingerprint**: A deterministic cryptographic hash string derived from the current state of the real world, used to detect whether the real world was mutated.
- **Playground**: The browser-based environment (in-memory file system + sql.js SQLite) where worlds run without a Docker box.
- **Box**: A network-isolated Docker container (`--network none`) in which the ghost runner executes real-mode worlds.
- **Safety_Contract**: The set of property-based tests (P1–P4) that every World implementation must pass to be accepted.
- **Deterministic_World**: A World whose `step` function produces identical output for identical input, with no dependency on wall-clock time, random numbers, process IDs, or network responses. The in-memory file system world and the sql.js SQLite world in the Playground are Deterministic_Worlds.

## Requirements

### Requirement 1: World Contract Interface

**User Story:** As a world author, I want a single TypeScript interface to implement, so that my world is immediately compatible with the ghost runner, the ward engine, and the UI kit without additional wiring.

#### Acceptance Criteria

1. THE `core` package SHALL export a generic TypeScript interface `World<S, A>` with exactly the six methods: `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside`.
2. THE `World` interface SHALL export a `Snapshot<S>` type that carries a `readonly id` field of type `string` (unique within a single world instance's lifetime), a `state` field of type `S`, and a `result` field of type `{ success: true } | { success: false; error: string }` that records whether the last action applied to reach this snapshot succeeded or failed.
3. THE `World` interface SHALL export a `Change` type that carries a `kind` field of type `string` as a discriminant, with no restriction on additional fields.
4. THE `World` interface SHALL export a `Scene` type whose fields are constrained to `string`, `number`, `boolean`, `null`, arrays of those types, or plain objects composed of those types, with no `undefined`, `Date`, `Map`, `Set`, `Function`, or circular references permitted.
5. THE `World` interface SHALL export an `Effect` type that carries a `kind` field of type `string` as a discriminant and a `destination` field of type `string`, with no restriction on additional fields.
6. WHEN a TypeScript module exports a class that does not implement all six methods of `World<S, A>`, THE TypeScript compiler SHALL report a type error without requiring any runtime check.

### Requirement 2: snapshot — Observe Without Mutating

**User Story:** As the ghost runner, I want to capture a copy of the current world state before executing any actions, so that the real world is never modified during ghost execution.

#### Acceptance Criteria

1. WHEN `snapshot()` is called, THE `World` SHALL return a `Snapshot<S>` whose `state` holds a copy of the current real-world state such that any subsequent mutation of `Snapshot.state` does not alter the real-world state, and any subsequent mutation of the real-world state does not alter `Snapshot.state`.
2. WHEN `snapshot()` is called more than once with no intervening `step` calls, THE `World` SHALL return `Snapshot` instances whose `state` values are structurally identical — same keys and same primitive values at every level of nesting.
3. WHEN `snapshot()` is called, THE `World` SHALL NOT emit, invoke, or enqueue any `Effect` whose `destination` refers to a resource outside the `Snapshot`'s own copied state boundary (i.e., any external I/O, network call, or persistent store that is part of the real-world state).

### Requirement 3: step — Execute One Action on a Snapshot

**User Story:** As the ghost runner, I want to advance the world by one action against a snapshot, so that I can replay a plan step-by-step without touching the real world.

#### Acceptance Criteria

1. WHEN `step(s, a)` is called, THE `World` SHALL return a new `Snapshot<S>` whose `state` reflects the result of applying `a` to `s`.
2. WHEN `step(s, a)` is called, THE input `Snapshot` `s` SHALL remain unchanged — `s.state` after the call SHALL be structurally identical to `s.state` before the call.
3. WHEN `step(s, a)` is called in the Playground or Box, THE `World` SHALL NOT write to any state store, file, network resource, or global variable outside the returned `Snapshot<S>`.
4. IF `a` is an action whose execution would fail, THEN THE `World` SHALL return a `Snapshot<S>` whose `result` field is `{ success: false, error: "<non-empty description>" }`, rather than throwing an exception.

### Requirement 4: diff — Describe What Changed

**User Story:** As the ward engine and the UI kit, I want a list of Changes between two Snapshots, so that I can evaluate ward rules and render the mirror-world diff to the user.

#### Acceptance Criteria

1. WHEN `diff(before, after)` is called with two Snapshots whose `state` values are recursively structurally equal, THE `World` SHALL return an empty array.
2. WHEN `diff(before, after)` is called with two Snapshots whose `state` values are not recursively structurally equal, THE `World` SHALL return a non-empty `Change[]`.
3. WHEN `diff(before, after)` is called, THE `World` SHALL return a `Change[]` where every element carries a `kind` field whose value is a non-empty string drawn from the set of kinds defined in the `World` implementation's type contract.
4. THE `diff` method SHALL be a pure function: calling it twice with the same two Snapshots SHALL return arrays that are recursively structurally equal element-by-element.

### Requirement 5: render — Produce a Serialisable Scene

**User Story:** As the UI kit, I want a JSON-serialisable Scene from any Snapshot, so that I can display the mirror world without depending on world-specific rendering logic.

#### Acceptance Criteria

1. WHEN `render(s)` is called, THE `World` SHALL return a `Scene` such that `JSON.parse(JSON.stringify(scene))` is recursively structurally equal to `scene` (i.e. no functions, `undefined` values, circular references, or non-serialisable types are present).
2. THE `render` method SHALL be a pure function: calling it twice with the same Snapshot SHALL return `Scene` values that are recursively structurally equal.

### Requirement 6: fingerprint — Detect Real-World Mutation

**User Story:** As the ghost runner, I want a stable cryptographic fingerprint of the real world, so that I can verify the real world was not mutated during ghost execution.

#### Acceptance Criteria

1. WHEN the real world has not changed between two calls to `fingerprint()`, THE `World` SHALL return the same string both times.
2. WHEN any resource tracked by the `World` (such as file contents, environment variable values, or in-memory state) has changed between two calls to `fingerprint()`, THE `World` SHALL return a `FingerprintResult` whose `hash` string differs from the previous call, computed using a cryptographic hash function such that the probability of a collision is negligible; THE `World` SHALL include in `FingerprintResult.manifest` a per-resource hash entry for every tracked resource so that callers can invoke `compareFingerprints(before, after)` to identify which resource paths changed — thereby distinguishing changes caused by other host processes (e.g. `git gc`) from ghost execution.
3. THE `fingerprint` method SHALL NOT trigger any `Effect` whose `destination` refers to a resource outside the boundary of the `World` instance on which `fingerprint()` is called.
4. IF `fingerprint()` cannot read one or more tracked resources, THEN THE `World` SHALL throw an error indicating which resource was unreadable without modifying any tracked state.

### Requirement 7: effectsOutside — Enumerate Statically Known External Side-Effects

**User Story:** As the ward engine, I want a best-effort list of Effects that an action is statically known to cause outside the copied world, so that I can return a warn verdict and request human approval before those effects run.

#### Acceptance Criteria

1. WHEN `effectsOutside(a)` is called, THE `World` SHALL return an `Effect[]` containing one entry for each external destination that is statically determinable from `a` without executing it; for actions whose external destinations cannot be determined without execution (e.g. shell scripts that compute destinations at runtime), THE `World` MAY return a partial or empty list, and this is a best-effort guarantee only.
2. WHEN `effectsOutside(a)` is called for an action with no statically known external destinations, THE `World` SHALL return an empty array.
3. Network attempts observed inside the Box during ghost execution that were not listed in `effectsOutside` SHALL be reported as separate ghost events (distinct from the `Effect[]` returned by `effectsOutside`), so that dynamically discovered external destinations are still surfaced to the ward engine.
4. THE `effectsOutside` method SHALL NOT perform any network call or file I/O, and SHALL return the same `Effect[]` on repeated calls with the same action `a` and unchanged `World` state.
5. IF `a` is not a valid `Action`, THEN THE `World` SHALL throw an error indicating the argument is invalid without performing any network call or file I/O.

### Requirement 8: Safety Contract — P1 Isolation

**User Story:** As a user, I want proof that ghost execution never modifies the real world, so that I can trust the ghost runner as a safe preview mechanism.

#### Acceptance Criteria

1. WHEN the Ghost_Runner executes any sequence of one or more Actions against a Snapshot derived from the real world in the Playground or Box, THE `World` SHALL produce a `fingerprint()` value after execution that is strictly equal (same string value) to the `fingerprint()` value computed immediately before execution begins.
2. IF the Box is unavailable and the system falls back to static analysis (option B), THEN THE Safety_Contract SHALL NOT assert P1 for real-mode worlds, and THE system SHALL surface a warning message indicating P1 isolation cannot be guaranteed before any ghost run proceeds.
3. FOR ALL action sequences of length 1 to 50 generated by the property-based test suite, THE `World` SHALL satisfy criterion 1 above across at least 100 generated examples per short run (triggered on file save); the full suite of P1–P4 tests for a single World SHALL complete within 60 seconds in a short run. A nightly long run SHALL execute at least 10,000 generated examples per property with no time limit.

### Requirement 9: Safety Contract — P2 Fidelity

**User Story:** As a user, I want the diff produced by the ghost run to exactly match the diff produced by real execution, so that I can rely on the ghost preview as an accurate forecast.

#### Acceptance Criteria

1. WHEN a plan passes all ward checks in the Playground against a Deterministic_World, THE Ghost_Runner SHALL produce a `Change[]` from the ghost run that is equal by deep comparison (same length, same order, same field values at every index) to the `Change[]` produced when the same plan is executed for real against the same Deterministic_World starting from the same initial Snapshot.
2. THE Safety_Contract SHALL assert P2 only for Deterministic_Worlds in the Playground; P2 SHALL NOT be asserted for any `World` whose `step` function reads wall-clock time, random numbers, process IDs, or network responses, and THE system SHALL mark such worlds as non-deterministic in their registration metadata.
3. FOR ALL plans of length 1 to 50 generated by the property-based test suite against Deterministic_Worlds, THE `World` SHALL satisfy criterion 1 above across at least 100 generated examples per short run; a nightly long run SHALL execute at least 10,000 generated examples per property with no time limit.

### Requirement 10: Safety Contract — P3 Restore

**User Story:** As the ghost runner, I want to reuse a saved Snapshot for multiple independent ghost runs, so that the same starting state can be replayed any number of times with different action sequences.

#### Acceptance Criteria

1. A `Snapshot<S>` is immutable: no `step` call or any other operation SHALL alter the `state` of a previously created `Snapshot`. The ghost runner achieves "restore" by simply re-using the original Snapshot object rather than by calling a separate restore function.
2. WHEN the same `Snapshot<S>` and the same sequence of Actions are passed to `step` calls in two separate ghost runs, THE `World` SHALL produce a final `Snapshot` whose `state` is recursively structurally equal in both runs.
3. IF the `World` models a physical simulation, THEN the same Snapshot and action sequence SHALL produce trajectories that are identical bit-for-bit across runs, including all integrator state (e.g. warm-start values, velocity carry-over) so that the physics engine produces the same contact forces and joint positions at every step.
4. FOR ALL state and action-sequence combinations (action sequences of length 1 to 50) generated by the property-based test suite, THE `World` SHALL satisfy criteria 2 and 3 above across at least 100 generated examples per short run; a nightly long run SHALL execute at least 10,000 generated examples per property with no time limit.

### Requirement 11: Safety Contract — P4 Ward Monotonicity

**User Story:** As a world author, I want assurance that making ward rules stricter never causes any plan's verdict to become more permissive, so that I can safely tighten security policy without introducing regressions.

#### Acceptance Criteria

1. The Ward_Engine verdicts are ordered pass < warn < block. WHEN a `WardSet` `W2` satisfies `isMoreRestrictive(W1, W2) === true` relative to `WardSet` `W1`, THE Ward_Engine SHALL return a verdict for any plan under `W2` that is greater than or equal to the verdict returned for the same plan under `W1`; no plan's verdict SHALL move from warn to pass or from block to pass or from block to warn.
2. `isMoreRestrictive(W1, W2)` is `true` when wards are compared by matching `id`: (a) a ward present in `W2` but absent in `W1` is a tightening; (b) a ward present in `W1` but absent in `W2` is a loosening and immediately makes the result `false`; (c) for each ward pair with the same `id`, the kind-specific set-containment and threshold rules apply — for list fields (`paths`, `tables`, `secrets`, `forbidden_contacts`, `deny`), `W2` tightens if `W2`'s set is a strict superset of `W1`'s set and loosens if `W1`'s set has any entry not in `W2`'s set; for `allow_hosts`, `W2` tightens if `W1`'s set has any host not in `W2`'s set (revoking a host) and loosens if `W2`'s set has any host not in `W1`'s set (granting a new host); for numeric thresholds, `max_*` tightens when lower and loosens when higher, `min_*` tightens when higher and loosens when lower — and the overall result is `true` only if at least one tightening was found and no loosening was found.
3. THE `core` package SHALL export an `isMoreRestrictive(w1: WardSet, w2: WardSet): boolean` predicate that returns `true` if and only if `W2` meets the definition in criterion 2 relative to `W1`.
4. FOR ALL `(W1, W2)` pairs where `isMoreRestrictive(W1, W2) === true` and all plans of length 1 to 50 generated by the property-based test suite, THE Ward_Engine SHALL satisfy criterion 1 above across at least 100 generated examples per short run; a nightly long run SHALL execute at least 10,000 generated examples per property with no time limit.

### Requirement 12: World Registration Gate

**User Story:** As a playground maintainer, I want every World implementation to pass the Safety Contract before it is registered, so that no world that violates P1–P3 or its declared ward properties is available in the playground.

#### Acceptance Criteria

1. A World implementation MAY NOT be registered in the playground unless it has passed all Safety Contract tests (P1–P3 and all ward properties declared by that World).
2. IF any Safety Contract test fails, THE registration system SHALL report the failing property identifier (e.g. `P1`, `P3`), the shrunk counterexample that triggered the failure, and the violated criterion identifier, and SHALL NOT register the World.
3. WHEN all Safety Contract tests pass, THE system SHALL register the World and make it available in the playground without requiring manual configuration.
4. The automated triggering of Safety Contract tests (via the `contract-pbt` hook on `core/**` and `worlds/**` saves), the scaffolding of new world directories (via the `world-scaffold` hook), and the automatic appearance of a new playground tab are integration concerns addressed in the `kiro-integration` and `ui-kit` specs respectively, and are out of scope for this spec.
5. THE `verifyWorld` function SHALL accept an optional `stateEquals?: (a: S, b: S) => boolean` field in `VerifyWorldOptions<S, A>`; WHEN `stateEquals` is omitted, THE `verifyWorld` function SHALL compare states by recursive structural equality, so that the behavior for existing Worlds is unchanged.
6. WHERE `stateEquals` is provided, THE `verifyWorld` function SHALL use `stateEquals` to decide whether two states are the same in the P3 comparisons of criteria 10.1 (the state after a ghost run compared with a clone taken before it) and 10.2 (the final states of two replays of the same plan).
7. WHERE `stateEquals` is provided, THE `verifyWorld` function SHALL continue to compare `Change[]` lists for P2, fingerprints for P1, and Ward_Engine verdicts by recursive structural equality, and SHALL NOT pass them to `stateEquals`.
8. WHERE a lenient `stateEquals` is provided that ignores only declared per-step noise (such as a per-step copy path or per-file timestamps), THE `verifyWorld` function SHALL still report a P3 failure for a World that violates P3 in a way the noise does not explain (for example, a `step` function that mutates its input Snapshot).

# Requirements Document

> **Template notice.** This file is a fill-in skeleton from `.kiro/specs/_new-world/` for the world `<world-name>`. Replace every `<placeholder>`, every `Fill in:` line, and every `TBD`. Delete this block when done. The six-function contract, the registration gate, and the claim rules below are fixed by the repository and must not be weakened.

## Introduction

Fill in: two or three sentences. What real system does `<world-name>` mirror (files, a database, a cloud service, a simulation)? What mistake or possession does a ghost run of this world prevent? Name the one demo scene that shows it.

The world is registered by `worlds/<world-name>/world.config.ts` and judged by the wards in `worlds/<world-name>/wards.yaml`. It inherits the ghost runner, the wards engine, the possession detector, and the UI kit from `core/` and `ui/`.

Safety claims follow the world-contract steering ("Claimed in" column). The scope table is in Requirement 8.

## Glossary

- **World**: The adapter `World<State, Action>` of `worlds/<world-name>/`.
- **State**: Fill in: the in-memory model of the mirror world, for example `<State>`.
- **Action**: Fill in: the actions an agent plan can contain, for example `<Action>`.
- **Change**: A `Change` object returned by `diff`. Fill in: the change kinds this world emits, for example `<ChangeKind>`.
- **Reality**: Fill in: what the real system is (the thing the ghost run must never touch).
- **Registration_Gate**: The function `verifyWorld` of `@ghost-run/core/verify`, called by `worlds/<world-name>/tests/contract.test.ts`.
- **Wards_File**: `worlds/<world-name>/wards.yaml`.
- **Short_Run**: A save-time run with 100 examples per property (20 for a Docker-bound property), finishing within 60 s.
- **Nightly_Run**: A run with `GHOST_PBT_MODE=nightly` and 10,000 examples per property.

## Requirements

### Requirement 1: World State and Actions

**User Story:** As a world author, I want the state and the actions of `<world-name>` defined as plain data, so that a snapshot is a deep copy and a step is a pure function of it.

#### Acceptance Criteria

1. THE World SHALL define `<State>` as plain, serializable data with no handle to Reality (no open file, socket, or client object).
2. THE World SHALL define `<Action>` as a discriminated union with a `kind` field. Fill in: list every action kind and its fields.
3. WHEN an action kind or field is invalid, THE World SHALL return the snapshot unchanged together with a recorded error and SHALL NOT throw.
4. THE World SHALL contain no clock, random source, or environment read inside `step`, `diff`, or `render`, unless it is declared as input of the snapshot. Fill in: any field that holds time or randomness and how it is seeded.

### Requirement 2: The Six World Functions

**User Story:** As a world author, I want each of the six functions to meet its contract, so that the ghost runner, the wards engine, and the UI kit work on `<world-name>` without change.

#### Acceptance Criteria

1. THE World SHALL implement all six functions of `World<S, A>`: `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside`.
2. WHEN `snapshot()` is called, THE World SHALL return a deep copy of the current state and SHALL NOT modify Reality.
3. WHEN `step(s, a)` is called, THE World SHALL apply one action to a snapshot and SHALL NOT modify Reality or the input snapshot `s`.
4. WHEN `diff(before, after)` is called, THE World SHALL return the minimal set of `Change` objects between the two snapshots and SHALL cover every change kind of Requirement 1. Fill in: the exact list of change kinds, and what "minimal" means here.
5. WHEN `render(s)` is called, THE World SHALL return a `Scene` for the UI kit and SHALL have no side effect. Fill in: what the scene shows (entities, labels, the red and green marks).
6. WHEN `fingerprint()` is called, THE World SHALL return a hash of the real state, so that the check of P1 can compare it before and after a ghost run. Fill in: what is hashed and why it is stable.
7. WHEN `effectsOutside(a)` is called, THE World SHALL return a non-empty `Effect[]` for every action that reaches outside the copy (a network call, an external write) and an empty list for the others. Fill in: the actions that leave the copy.

### Requirement 3: Registration Gate

**User Story:** As a maintainer, I want a world to appear in the playground only after the gate passes, so that an unverified world cannot claim a property.

#### Acceptance Criteria

1. THE repository SHALL contain `worlds/<world-name>/tests/contract.test.ts` that calls `verifyWorld` with `id`, `deterministic`, `wardSet` (parsed from the Wards_File), `actionArb`, and `numRuns`.
2. THE Registration_Gate SHALL pass P1 (a ghost run never changes reality: the fingerprint before equals the fingerprint after, for any action list) and P3 (restoring a snapshot returns the world to exactly its pre-snapshot state) in a Short_Run.
3. IF `deterministic` is `true`, THEN THE Registration_Gate SHALL also pass P2 (a plan that passes produces the same diff when executed for real as the ghost produced) and THE test SHALL supply a `testAdapter`.
4. IF `deterministic` is `false`, THEN THE World SHALL NOT claim P2 anywhere in the UI or the README.
5. THE `actionArb` SHALL generate only valid actions of Requirement 1 and SHALL cover every action kind. Fill in: how `actionArb` is built.
6. THE applicable ward properties (P4, P5, P6 for the ward kinds of this world) SHALL pass before the world is registered in the playground.

### Requirement 4: Registration File

**User Story:** As a developer, I want a fixed registration shape, so that tools can load any world the same way.

#### Acceptance Criteria

1. THE file `worlds/<world-name>/world.config.ts` SHALL default-export an object `{ id, deterministic, wardsFile, create }`, where `id` equals `<world-name>`, `deterministic` is a boolean, `wardsFile` is a path string that is never imported, and `create` returns the World.
2. THE World SHALL be loadable with `create()` without a network, a Docker daemon, or a real credential.
3. THE `worlds/<world-name>/` package SHALL depend on `core/` and the runtime libraries of the world only. Fill in: the runtime libraries of this world (for example none, `sql.js`, or `@mujoco/mujoco`), each with its license.

### Requirement 5: Wards of the World

**User Story:** As a user, I want declared wards that judge this world's plans, so that a ghost run ends in pass, warn, or block.

#### Acceptance Criteria

1. THE Wards_File SHALL declare each ward with an `id`, a `kind` (`path`, `sql`, `egress`, or `physics`), and the rules of that kind.
2. THE Wards_File SHALL declare these wards. Fill in: one row per ward.

| Ward id | Kind | Rule | Verdict when violated |
|---|---|---|---|
| `<ward-id>` | TBD | TBD | block |

3. WHEN a ward is violated, THE verdict SHALL be `block` and the message SHALL name the ward id and the numbers that violated it.
4. WHEN an action has an effect outside the copy (Requirement 2, criterion 7) and no ward is violated, THE verdict SHALL be `warn`.
5. THE Wards_File SHALL be parsed by `wards-config` and SHALL pass `parseWards` without an error.

### Requirement 6: Save-Time Contract Run

**User Story:** As a developer, I want the contract tests to run when I save world code, so that a broken contract shows up at once.

#### Acceptance Criteria

1. WHEN a file under `worlds/<world-name>/` is saved by the agent, THE `contract-pbt` hook SHALL run the world suite in a Short_Run and write the result to `.ghost-run/pbt/last.json`.
2. THE whole save-time run SHALL finish within the 60 s hook limit. THE hook stops itself at 55 s.
3. THE world suite SHALL keep its own example count in the test configuration (`numRuns`), and the count SHALL NOT be below 100 in a Short_Run unless a written reason is recorded in `docs/measurements.md`. Fill in: the measured time of the world suite and the chosen count.

### Requirement 7: Scene and Demo

**User Story:** As a viewer, I want to see what the ghost did, so that the verdict is understandable without reading a log.

#### Acceptance Criteria

1. THE `render` output SHALL let the mirror-world component of the UI kit draw the copy before and after the plan, with changes marked.
2. THE demo SHALL show one plan that passes, one that warns, and one that is blocked by a named ward. Fill in: the three plans.
3. THE demo text SHALL state the claim scope of Requirement 8 and SHALL NOT state a property outside it.

### Requirement 8: Claim Scope

**User Story:** As a maintainer, I want each property asserted only inside its declared scope, so that the README and the UI never over-claim.

#### Acceptance Criteria

1. THE world SHALL assert each property only as the table below allows. Fill in the last column for this world.

| Property | Allowed claim | Not claimed | For this world |
|---|---|---|---|
| P1 | Ghost run never changes reality, in the playground and in real mode with the Docker box | Docker unavailable (Plan B fallback) | TBD |
| P2 | Same diff when executed for real | Worlds with `deterministic: false` (time, process ids, network responses vary) | TBD |
| P3 | Restoring a snapshot returns the exact pre-snapshot state | n/a | TBD |
| P4 | A stricter ward never increases the set of passing plans | n/a | TBD |
| P5 | A plan that deletes or overwrites a protected path produces `block` (depends on P1) | Where P1 does not hold | TBD |
| P6 | A secret read followed by an unapproved network attempt produces `block` | Plan B fallback; compression, encryption, and DNS exfiltration under content inspection | TBD |
| P7 | Hidden Unicode is always flagged | n/a | TBD |
| P8 | Same seed and same plan give the same outcome | Ghost Hand only | not applicable |

2. WHEN the execution environment changes (for example Docker is unavailable), THE UI and the README SHALL lower the claim explicitly.
3. THE README of the world SHALL list the claims and the non-claims of this table and SHALL state the Tested_Environments if P2 is claimed.

### Requirement 9: Scaffold Files

**User Story:** As a developer, I want the standard files created for me, so that I only write the world.

#### Acceptance Criteria

1. WHEN the agent creates the first file under `worlds/<world-name>/`, THE `world-scaffold` hook SHALL create `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md` for the files that do not exist yet, and SHALL leave an existing file unchanged.
2. THE generated `world.config.ts` SHALL set `deterministic: false` until the world is shown to be deterministic, and `create` SHALL throw a placeholder error until it is implemented.
3. THE generated `tests/contract.test.ts` SHALL fail with a message that names the missing `create` or `actionArb` until they are written.
4. THE hook SHALL fire only for files that the agent created. WHEN a human creates the folder, THE human SHALL run the scaffold by hand or copy the files.

### Requirement 10: Hygiene

**User Story:** As a maintainer, I want the world's files to pass the repository's own rules, so that the repository stays clean under the blacklight.

#### Acceptance Criteria

1. THE source files, fixtures, tests, wards, and documents of this world SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener. Tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`.
2. THE fixtures SHALL use only canary values as secrets (for example `sk-CANARY-abc123`) and only reserved domains as hosts (`.example`, `.test`, `.localhost`, `.invalid`) or the documentation range `192.0.2.0/24`.
3. THE world SHALL write no real credential, real host, user name, or home path in any file.
4. THE repository artifacts of this world SHALL be written in English.
5. THE possession scan (`scanFiles`) of `worlds/<world-name>/` and `.kiro/specs/<world-name>/` SHALL return `clean`.

### Requirement 11: Dependencies and Licenses

**User Story:** As a maintainer, I want every library listed with its license, so that the submission is clean.

#### Acceptance Criteria

1. THE world SHALL add no dependency without a license check on the day it is added.
2. THE root README dependency table SHALL list each new dependency with name, version, and license.
3. THE code SHALL be new code written for this repository, and audio and icons SHALL be original or CC0 with the source listed in the README.

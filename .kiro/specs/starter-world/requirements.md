# Requirements Document

## Introduction

The world `starter` mirrors a to-do list with a fixed fixture of three items. It is the smallest useful world on `@ghost-run/core`: a reader can read `worlds/starter/src/world.ts` top to bottom and run one command to see a ghost run. A ghost run of this world prevents the loss of to-dos by a plan such as `clear`. The demo scene is the plan `clear` (blocked by the ward `keep-todos`) next to the plan `add "buy candles"` (passes).

The world is registered by `worlds/starter/world.config.ts` and judged by the wards in `worlds/starter/wards.yaml`. It inherits the ghost runner and the wards engine from `core/`.

Safety claims follow the world-contract steering ("Claimed in" column). The scope table is in Requirement 8.

## Glossary

- **World**: The adapter `World<TodoState, Action>` of `worlds/starter/`.
- **State**: `TodoState`, a list of `{ id, text }` to-dos.
- **Action**: `add <text>`, `remove <id>`, or `clear`.
- **Change**: A `Change` object returned by `diff`: `file-created`, `file-overwritten`, or `file-deleted`, each with a path `todos/<id>`.
- **Reality**: The fixed fixture list held by the world instance. The ghost run must never change it.
- **Registration_Gate**: The function `verifyWorld` of `@ghost-run/core/verify`, called by `worlds/starter/tests/contract.test.ts`.
- **Wards_File**: `worlds/starter/wards.yaml`.
- **Short_Run**: A save-time run with 100 examples per property, finishing within 60 s.

## Requirements

### Requirement 1: World State and Actions

**User Story:** As a world author, I want the state and the actions defined as plain data, so that a snapshot is a deep copy and a step is a pure function of it.

#### Acceptance Criteria

1. THE World SHALL define `TodoState` as plain, serializable data with no handle to Reality.
2. THE World SHALL define `Action` as a discriminated union with a `kind` field: `add` with `text`, `remove` with `id`, and `clear`.
3. WHEN an action kind or field is invalid, THE World SHALL return a snapshot with `{ success: false, error }` and SHALL NOT throw.
4. THE World SHALL contain no clock, random source, or environment read. A new to-do gets the id of the largest id plus one.

### Requirement 2: The Six World Functions

**User Story:** As a world author, I want each of the six functions to meet its contract, so that the ghost runner and the wards engine work on `starter` without change.

#### Acceptance Criteria

1. THE World SHALL implement `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside`.
2. WHEN `snapshot()` is called, THE World SHALL return a deep copy and SHALL NOT modify Reality.
3. WHEN `step(s, a)` is called, THE World SHALL return a new snapshot and SHALL NOT modify Reality or `s`.
4. WHEN `diff(before, after)` is called, THE World SHALL return `file-created`, `file-overwritten`, and `file-deleted` changes on `todos/<id>`, sorted by path.
5. WHEN `render(s)` is called, THE World SHALL return a plain `Scene` with the world name and the list of to-dos.
6. WHEN `fingerprint()` is called, THE World SHALL return a SHA-256 hash over a canonical encoding (one hashed entry per to-do, sorted by path).
7. WHEN `effectsOutside(a)` is called, THE World SHALL return an empty list, because no action leaves the copy.

### Requirement 3: Registration Gate

**User Story:** As a maintainer, I want the world to pass the gate before it is used as the template example.

#### Acceptance Criteria

1. THE file `worlds/starter/tests/contract.test.ts` SHALL call `verifyWorld` with `id`, `deterministic`, `wardSet`, `actionArb`, and `numRuns`.
2. THE Registration_Gate SHALL pass P1 and P3 in a Short_Run.
3. THE World SHALL set `deterministic: false` and SHALL NOT claim P2.
4. THE `actionArb` SHALL generate `add`, `remove`, and `clear` actions only.
5. THE ward properties (P4 and P5 for the `path` ward) SHALL pass.

### Requirement 4: Registration File

**User Story:** As a developer, I want a fixed registration shape.

#### Acceptance Criteria

1. THE file `worlds/starter/world.config.ts` SHALL default-export `{ id, deterministic, wardsFile, create }` with `id` equal to `starter`.
2. THE World SHALL be loadable with `create()` without a network, a Docker daemon, or a credential.
3. THE package `@ghost-run/world-starter` SHALL depend on `@ghost-run/core` at run time and on no other runtime library.

### Requirement 5: Wards of the World

**User Story:** As a user, I want a declared ward that judges this world's plans.

#### Acceptance Criteria

1. THE Wards_File SHALL declare one ward of an existing kind and no new ward kind.

| Ward id | Kind | Rule | Verdict when violated |
|---|---|---|---|
| `keep-todos` | `path` | deny `delete` on `todos/*` | block |

2. WHEN the ward is violated, THE verdict SHALL be `block` and the message SHALL name the ward id and the deleted path.
3. THE Wards_File SHALL pass `parseWards` without an error.

### Requirement 6: Demo

**User Story:** As a reader, I want one command that shows a ghost run in about ten lines.

#### Acceptance Criteria

1. THE command `corepack pnpm --filter @ghost-run/world-starter demo` SHALL run the plans `clear` and `add "buy candles"` through `ghostRun` and `WardEngine.evaluate`, print plain text, and exit with code 0.
2. THE output SHALL state, for `clear`, the ward id, the number of to-dos the copy lost, and that the fingerprint of the real list is the same before and after.
3. THE output SHALL state, for `add "buy candles"`, that the plan passed.
4. A test SHALL check the blocked line and the passed line.

### Requirement 7: Claim Scope

**User Story:** As a maintainer, I want each property asserted only inside its scope.

#### Acceptance Criteria

1. THE README of the world SHALL state these claims.

| Property | For this world |
|---|---|
| P1 | Claimed: the world is in memory, and the fingerprint before and after a ghost run is equal. No Docker box is used. |
| P2 | Not claimed (`deterministic: false`). |
| P3 | Claimed. |
| P4 | Claimed through the engine. |
| P5 | Claimed where P1 holds: a plan that deletes a to-do produces `block`. |
| P6 | Not applicable: no `egress` ward. |
| P7 | Not applicable: no text scan in this world. |
| P8 | Not applicable. |

### Requirement 8: Hygiene and Dependencies

**User Story:** As a maintainer, I want the world to pass the repository rules.

#### Acceptance Criteria

1. THE files of this world SHALL contain no literal hidden Unicode character and no real credential, host, or user name.
2. THE root README dependency table SHALL list `vite-node` (MIT, `^3.2.4`), added as a dev dependency to run the demo.
3. THE artifacts of this world SHALL be written in English.

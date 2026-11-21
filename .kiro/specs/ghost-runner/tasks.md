# Implementation Plan: ghost-runner

## Overview

This plan builds `@ghost-run/ghost-runner` in `ghost-runner/` in implementation order: workspace scaffold and core build (W1, W2, W4, W5), the core type changes (W0, task 3, which must land before any other remaining work), pure host-side logic with its property tests, the box image (W3), the Docker layer, the Repo_World and pipeline, Docker-dependent tests, measurement tasks (W6, W7), and documentation (W8, W10). All code is TypeScript (the design uses TypeScript throughout). Host code targets Node.js 20 or later.

Decisions reflected in this plan:

1. Requirement 8.1 (DNS lookup latency of at most 0.1 s, Median_Of_5) stays unchanged. Task 15.2 measures the actual value. If the measurement exceeds 0.1 s, task 15.2 records a follow-up item that corrects the requirement; this plan does not change requirements.md.
2. The recorder output uses an anonymous Docker volume at `/ghost-rec`. Requirement 5.3 stays unchanged (one read-write host path, the Copy).
3. The box-only CA is accepted for HTTPS body capture. Its private key is generated at image build time inside the image and is never committed. Task 1.4 adds the `.gitignore` entries and task 10.3 adds a repository scan test.
4. The Pool is used only in long-lived hosts (for example the MCP server and tests). Per-hook processes leave it off (task 11.2).
5. Observed events and static Effects are not deduplicated (tasks 12.3 and 12.7).
6. Change kinds follow `core/src/types.ts`: `file-created`, `file-overwritten`, `file-deleted`, `symlink-changed`, and `sql-row-count` (with optional `dropped`). Mode-only changes (`mode-changed`) and unreadable SQLite files (`sqlite-unreadable`) are Diagnostics, never Changes.
7. Core type changes (W0, task 3) are implemented first. Every remaining task depends on task 3.4 (core rebuilt), so the dependency graph places it in the first wave after the finished tasks.

## Conventions

- **Test labels.** Every test task is labeled `[no-docker]` (runs everywhere) or `[docker]` (needs a running Docker daemon and the built box image). `[docker]` tests use `describe.skipIf(!dockerAvailable)` and report `skipped (docker unavailable)`, never `passed`, when Docker is unavailable. P1, P5, and P6 are never asserted in that case (and never in Plan B).
- **Run profiles.** Read from `GHOST_PBT_MODE`: on save (`save`) 20 examples per property with the whole run within 60 s, explicit (`pnpm --filter @ghost-run/ghost-runner test:pbt`) at least 100, nightly (`nightly`) at least 10,000. Docker-backed properties use a pool of 2 slots, fixture trees of at most 50 files, and `interruptAfterTimeLimit: 25_000`; fewer than 20 examples is reported as `partial`.
- **Optional marking.** The repository convention in `core-contract/tasks.md` does not mark test tasks optional, so no task here carries the `*` postfix. Test sub-tasks are required.
- **Property tags.** Each property test carries the comment `Feature: ghost-runner, Property <n>: <title>` and uses `fast-check` with `vitest`.
- **Test data.** Canary values only (for example `sk-CANARY-abc123`), reserved domains only (`.example`, `.test`, `.localhost`, `.invalid`, plus `registry.npmjs.org` only as the `allow_hosts` example), and hidden-Unicode strings built from escapes in test code.
- **Scope of this plan.** Coding tasks only. Ward rule evaluation, `wards.yaml` parsing, hook scripts, the MCP server, and UI belong to other specs. The only ward code changed here is the W0 change in `core/src/wards.ts`.

## Tasks

- [x] 1. Workspace scaffold and steering (W1, W2)
  - [x] 1.1 Create the `ghost-runner/` package and register it in the workspace
    - Add `ghost-runner` to `pnpm-workspace.yaml` (`packages:` list, not under `integrations/`).
    - Create `ghost-runner/package.json` (`name: "@ghost-run/ghost-runner"`, `private: true`, `type: "module"`, `engines.node >= 20`, dependency `@ghost-run/core: workspace:*`, runtime dependency `shell-quote`, dev dependencies `vitest`, `fast-check`, `typescript`, types for `shell-quote`), scripts `test`, `test:pbt`, `lint`, `build`, `box:build`, `clean`.
    - Create `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs` (allow only `@ghost-run/core` and, in `tests/`, `@ghost-run/core/verify`), and `vitest.config.ts` with the alias `@ghost-run/core` to `<root>/core/src/index.ts` (tests never need a prior build).
    - Create empty placeholder modules for the layout in the design (`src/index.ts`, `src/config.ts`, and so on) so later tasks only fill them in.
    - Do not call any LLM API anywhere in the package.
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 1.2 Add the `core/` to `ghost-runner` import ban and verify that lint fails on violation [no-docker]
    - Add patterns for `**/ghost-runner/**` and `@ghost-run/ghost-runner` to the `no-restricted-imports` rule in `core/eslint.config.mjs`.
    - Add a test (`ghost-runner/tests/core-import-ban.test.ts`) that writes a temporary file under `core/src/` importing `@ghost-run/ghost-runner`, runs ESLint programmatically on it, asserts a `no-restricted-imports` error, and removes the file in `finally`.
    - _Requirements: 1.3_

  - [x] 1.3 Update `.kiro/steering/structure.md` (W2)
    - List `ghost-runner/` as a separate workspace package (not under `integrations/`), with the dependency direction `ghost-runner -> core`, in the folder tree, the dependency-direction section, and "What Goes Where".
    - Keep the text English and free of hidden Unicode (the `blacklight-steering` hook runs on save of `.kiro/**`; resolve any finding it reports).
    - _Requirements: 1.1, 1.2_

  - [x] 1.4 Update `.gitignore` for build output, temporary run data, and key material
    - Keep `dist/` ignored (already present) and add `ghost-runner/dist`, `.ghost-run-*/`, and `ghost-runner/box/*.local`.
    - Add private-key patterns: `*.key`, `*.pem`, `*.p12`, `*.pfx`, `id_rsa*`, `box/ca/`, `**/ghost/ca/`.
    - Do not ignore anything under `.kiro/`.
    - _Requirements: 1.4, 5.1_

- [x] 2. Core build and test infrastructure (W4, W5)
  - [x] 2.1 Add the `core` build so Node can import `@ghost-run/core` (W4)
    - Create `core/tsconfig.build.json` (extends `tsconfig.json`, `noEmit: false`, `declaration: true`, `outDir: dist`, `rootDir: .`, `include: ["src", "verify.ts"]`, `module` and `moduleResolution: NodeNext`).
    - Update `core/package.json`: `main` and `types` point at `dist/src/index.*`, add the `exports` map with `"."` and `"./verify"` (types and import conditions), `files: ["dist"]`, scripts `build` (`tsc -p tsconfig.build.json`) and `clean`, optional `peerDependencies` entry for `fast-check` (via `peerDependenciesMeta.optional`).
    - Add a root script `pnpm -r build` so `core` builds first, and make the `ghost-runner` `build` and `box:build` scripts depend on it.
    - Existing `core` tests must keep running from source with no change.
    - _Requirements: 1.2, 17.9_

  - [x] 2.2 Confirm `core` types suffice (W5) [no-docker]
    - Add a compile-time test (`ghost-runner/tests/core-types.test-d.ts`) that constructs `ObservedEvent` values of kinds `network-attempt` and `secret-read`, and a `GhostReport<RepoState>`, without a payload field.
    - If a type is insufficient, record the gap in the file header and in the wards spec notes instead of changing `core`.
    - _Requirements: 8.10, 9.2, 14.1_

  - [x] 2.3 Create the test harness: PBT profiles and Docker availability helper [no-docker]
    - Create `ghost-runner/tests/pbt-config.ts` that reads `GHOST_PBT_MODE` (`save`, default `explicit`, `nightly`) and exports `NUM_RUNS` (20, 100, 10,000) and per-property time limits (`interruptAfterTimeLimit: 25_000` for Docker properties on save).
    - Create `ghost-runner/tests/docker-available.ts` exporting `dockerAvailable` (daemon reachable within 2.0 s and box image present) and a `describeDocker` wrapper using `describe.skipIf`, printing `skipped (docker unavailable)` for skipped suites.
    - Create `ghost-runner/tests/fixtures/` helpers: a fixture repository generator (at most 50 files, canary `sk-CANARY-abc123` in `.env`, SQLite `app.db` with a `users` table of 1,206 rows, `data/`, `build/`, `package.json` with `test` as `node --test` and `clean` as `rm -rf data`, no `node_modules`) and `fast-check` tree and mutation arbitraries (excluded names at random depths, inside, outside, dangling, and cyclic symlinks).
    - _Requirements: 17.7, 18.1, 18.7_

- [x] 3. Core type changes (W0): must land before all other remaining work
  - [x] 3.1 Extend the core types in `core/src/types.ts` and export them
    - Add `'symlink-changed'` to the `FileChange` kinds, with optional `targetBefore` and `targetAfter` (symlink-changed only).
    - Add optional `dropped?: boolean` to `SqlRowCountChange` (true only when the table no longer exists; then `rowsAfter` is 0).
    - Add optional `eventId?: string` to `ObservedEvent` (set only on events with a captured payload).
    - Add the hand-off types `SecretValues = ReadonlyMap<string, Uint8Array>` (key: Copy-relative path, `/` separators) and `EvaluateInputs { secretValues?, payloads? }`.
    - Export all new and changed types from `core/src/index.ts`. All additions are optional or additive, so existing callers compile unchanged.
    - Add type tests in `core/tests/types.test-d.ts` for the new fields and types.
    - _Requirements: 1.6, 1.7, 8.14, 8.15, 9.10, 11.5, 12.2, 12.3_

  - [x] 3.2 Update `core/src/wards.ts` for the new kinds and the optional third parameter
    - Change the signature to `WardEngine.evaluate(report, wardSet, inputs?: EvaluateInputs)`. The third parameter is optional so two-argument calls are unchanged. The engine accepts `secretValues` and `payloads`, does not inspect them in this task, and never copies them into the returned `WardVerdict`, `violations`, or `notices`.
    - Make `isFileChange` accept `symlink-changed`, and map a `symlink-changed` Change to the `overwrite` operation in `checkPath`, so a `path` ward that denies `overwrite` reports a violation with the reason `would overwrite protected path <path>`.
    - In `checkSql`, compute rows lost as `rowsBefore - (dropped === true ? 0 : rowsAfter)` when positive, so a `dropped: true` Change counts as all rows lost.
    - Leave `isMoreRestrictive` and the other ward-comparison code unchanged (P4 holds because the new rule only adds violations).
    - _Requirements: 1.6, 1.7, 9.10, 11.5, 12.2, 12.3, 14.2_

  - [x] 3.3 Write unit tests for the new kinds and fields in `core/tests/wards.test.ts` [no-docker]
    - A `symlink-changed` Change on a path protected by a `path` ward with `deny: ["overwrite"]` gives a violation and `block`; with `deny: ["delete"]` only it gives no violation.
    - A `sql-row-count` Change with `dropped: true` is counted as all rows lost, and a ward with a lower `max_rows_lost` blocks.
    - An `ObservedEvent` with `eventId` is accepted and evaluates the same as the same event without it.
    - `secretValues` and `payloads` are accepted by `evaluate`, and `JSON.stringify` of the returned `WardVerdict` contains no secret byte in raw, base64, or hex form.
    - Add `symlink-changed` Changes to the generators of the P4 monotonicity test and keep it passing.
    - Use canary values only and escapes for any special characters.
    - _Requirements: 1.6, 1.7, 8.14, 9.10, 9.11, 11.5, 12.2, 12.3_

  - [x] 3.4 Verify the existing core tests and rebuild `core` so `ghost-runner` sees the changes [no-docker]
    - Run `pnpm --filter @ghost-run/core test` and confirm the existing 35 core tests pass unchanged (no edits to them), plus the new tests from task 3.3.
    - Run `pnpm --filter @ghost-run/core build` so `core/dist` contains the new types and the ward change, and run `pnpm --filter @ghost-run/ghost-runner exec tsc --noEmit` to confirm the runner compiles against the rebuilt `core`.
    - Update `ghost-runner/tests/core-types.test-d.ts` to assert the new kinds and fields (`symlink-changed`, `dropped`, `eventId`, `SecretValues`, `EvaluateInputs`) are importable from `@ghost-run/core`.
    - _Requirements: 1.2, 1.6, 1.7_

- [x] 4. Configuration, result, and verdict modules
  - [x] 4.1 Implement `src/config.ts` and `src/errors.ts`
    - Define `RunnerOptions`, defaults (`excludeDirs: ["node_modules"]`, `excludedDirMode: "omit"`, `execLimitSec: 25`, pipeline deadline 55 s, copy limit 20 s, limits pids 256, memory 1g, cpus 2, tmp 64 MiB), range validation, `PlanBoundsError` (plan size 1 to 50), `ConfigError` (`execLimitSec` 1 to 30, `pool.size` integer 1 to 8), re-use of core `FingerprintReadError` if present.
    - Validation runs before any container is created and names the violated bound.
    - Accept `GHOST_BOX_IMAGE` only as `<name>@sha256:<digest>`; reject tags.
    - _Requirements: 6.1, 7.1, 7.3, 7.5_

  - [x] 4.2 Write property test for configuration and plan bounds [no-docker]
    - **Property 7: Configuration and plan bounds**
    - **Validates: Requirements 6.1, 7.1, 7.3**

  - [x] 4.3 Implement `src/result.ts`
    - Define `RunResult`, `RunStatus`, `Isolation`, `PhaseDurations`, `Diagnostic`, `RunOutput`, `SerializedRunResult`. `RunOutput.payloads` is a `ReadonlyMap<string, Uint8Array>` keyed by `ObservedEvent.eventId`; `RunResult` has no `secretValues` field.
    - Implement `serializeRunResult` (canonical JSON: sorted keys, no `undefined`, no `bigint`, snapshots reduced to `{ rootPath, entryCount, manifestDigest }`, payload bytes never included, captures as `{ eventId, byteLength, sha256 }`) and `parseRunResult`.
    - Implement `redact(r)` used by the round-trip comparison.
    - _Requirements: 8.11, 9.4, 9.11, 14.4, 14.5, 14.6, 18.6_

  - [x] 4.4 Write property test for serialization round trip and idempotence [no-docker]
    - **Property 11: Serialization round trip and idempotence**
    - **Validates: Requirements 14.5, 14.6**

  - [x] 4.5 Write property test that serialized output never contains payload or secret bytes [no-docker]
    - Generate `RunOutput` values with payload byte arrays and `secretValues` whose content includes a canary and filler. Check the serialized `RunResult`, diagnostics, notices, and graveyard output with a sliding window: none contains the canary or any contiguous substring of the secret content longer than 8 bytes, in raw, base64, hex, or URL-encoded form, including the `secret-values-capped` Diagnostic (path, reason, lengths only). Also check that every key of `payloads` equals the `eventId` of exactly one event, that events without a capture have no `eventId`, and that each capture is serialized only as `{ eventId, byteLength, sha256 }`.
    - **Property 12: Serialized output never contains payload or secret bytes**
    - **Validates: Requirements 8.11, 8.14, 8.15, 9.4, 9.11, 9.12, 9.15, 18.6**

  - [x] 4.6 Implement `src/verdict.ts` and protected-path detection
    - Implement the pure `runnerVerdict` (maximum of ward verdict and floor), the floor rules, and the claim functions `p1Claimed`, `p5Claimed`, `p6Claimed` exactly as defined in the design.
    - Implement original-change classification (`external-change` versus `isolation-violation`, from `compareFingerprints` and the audit outcome).
    - Implement `protected-path-excluded` detection: for every `path` ward and protected glob, test whether it can match a path with an excluded directory name as a segment, in both `excludedDirMode` values.
    - _Requirements: 3.5, 4.11, 9.8, 10.4, 12.6, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3_

  - [x] 4.7 Write property test for verdict composition and claims [no-docker]
    - **Property 9: Verdict composition and claims**
    - **Validates: Requirements 3.5, 9.8, 10.4, 12.6, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3**

  - [x] 4.8 Write property test for protected paths inside excluded directories [no-docker]
    - **Property 10: Protected paths inside excluded directories are flagged**
    - **Validates: Requirements 4.11**

- [x] 5. Static analyzer (`static/`)
  - [x] 5.1 Implement `src/static/analyzer.ts`
    - Pure `analyze(action)` using `shell-quote`: absolute paths not under `/work`, tokens starting with `~`, URLs (`http`, `https`, `ftp`, `ssh`, and so on), and database connection strings (`postgres`, `mysql`, `mongodb`, `redis`, `amqp`).
    - Return one `Effect { kind: "external-path" | "url" | "db-connection", destination }` per distinct finding. No `fs`, `net`, `dns`, or `child_process` use.
    - Do not deduplicate against observed events (decision 5).
    - _Requirements: 2.7, 2.8, 15.2, 15.5_

  - [x] 5.2 Write property test for static analysis [no-docker]
    - Use spies on `fs`, `net`, `dns`, and `child_process` to prove the analyzer performs no I/O.
    - **Property 16: Static analysis is exact, pure, and I/O free**
    - **Validates: Requirements 2.7, 2.8, 15.2, 15.5**

- [x] 6. Docker argv builder and mount audit (`docker/`)
  - [x] 6.1 Implement `src/docker/cli.ts` and `src/docker/hardening.ts`
    - `cli.ts`: thin `spawn(file, args)` wrapper (never a shell), timeouts derived from the time left until the 55 s deadline, injectable client interface for test doubles.
    - `hardening.ts`: pure `buildRunArgs(opts, runId, mounts)` producing the argv in the design (`--network none --dns 127.0.0.1`, `--cap-drop ALL`, `--security-opt no-new-privileges`, limits, `--read-only`, `/tmp` tmpfs, `--user`, one read-write bind mount for the Copy, a volume at `/ghost-rec`, optional read-only mounts for `readonly-mount` mode, the four allowed environment variables, `--entrypoint ghost-init`), labels for run id and pool ownership, and the `exec` argv builder that passes each action as a single element.
    - Pure `auditInspect(expected, inspectJson)` comparing network mode, privileged, capabilities, read-only root, security options, PID and IPC mode, image id, environment, and the exact mount set; any difference yields `isolation-violation`.
    - _Requirements: 4.9, 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9, 6.1_

  - [x] 6.2 Write property test for hardened argv [no-docker]
    - **Property 5: Hardened argv**
    - **Validates: Requirements 4.9, 5.1, 5.2, 5.3, 5.4, 5.8, 5.9, 6.1**

  - [x] 6.3 Write property test for mount audit [no-docker]
    - **Property 6: Mount audit detects any deviation**
    - **Validates: Requirements 5.6, 5.7**

- [x] 7. File-system layer: fingerprint, copier, differ (`fs/`, `copy/`)
  - [x] 7.1 Implement `src/fs/manifest.ts` and `src/fs/fingerprint.ts`
    - `lstat`-only manifest walk sorted by byte order, skipping excluded directory names at every depth; `ManifestEntry` with nanosecond timestamps as decimal strings.
    - Original fingerprint producing a core `FingerprintResult` (`manifest: path -> sha-256`, `"symlink:" + target` for links, `"dir:" + mode` for directories), hashing with `O_NOFOLLOW` plus an `fstat` identity check, the stat shortcut for the "after" fingerprint, `fingerprintMode: "full"` option, a list of SQLite candidates found from the 16-byte header during the hashing pass, and `FingerprintReadError` naming the unreadable path.
    - Never write to Original.
    - _Requirements: 4.10, 13.1, 13.2, 13.3, 13.4, 13.8_

  - [x] 7.2 Write property test for Original fingerprint [no-docker]
    - **Property 4: Original fingerprint ignores excluded directories and finds every other change**
    - **Validates: Requirements 4.10, 13.1, 13.3, 13.4**

  - [x] 7.3 Implement `src/copy/planner.ts` and `src/copy/copier.ts`
    - Exclusion-aware copy plan (one `lstat`/`readdir` walk, bottom-up marking of directories with excluded descendants, multi-source `cp -cRP` on macOS and `cp --reflink=auto -RP` on Linux, `mkdir` plus recursion for marked directories).
    - Placement order (same-device temp dir, sibling `.ghost-run-<runId>`, fallback with `copy.cloned: false`), sentinel-file `copiedAt` nanosecond timestamp, 20 s absolute timer with partial-Copy removal and `copy-timeout`, and an injectable `copyStrategy` for a folder-level clone helper.
    - Copy symbolic links as links; never follow a link out of Original.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 13.8_

  - [x] 7.4 Write property test for copy fidelity and link safety [no-docker]
    - Run the same property against the injected folder-level `copyStrategy`.
    - **Property 3: Copy fidelity and link safety**
    - **Validates: Requirements 4.3, 4.4, 4.7, 13.8**

  - [x] 7.5 Implement `src/fs/sqlite.ts` and `src/fs/differ.ts`
    - `sqlite.ts`: host-side orchestration only (the counting runs in the box through `ghost-count`): build the `ghost-count` invocation for changed SQLite files, parse its JSON, map failures to `"unreadable"`.
    - `differ.ts`: ctime-candidate selection (`ctimeNs >= baselineNs` or size, mode, or mtime differs), candidate hashing with the `O_NOFOLLOW`, `fstat`, and rehash-once stability rule (diagnostic `diff-unstable`), baseline inheritance for non-candidates, `baseline-race` diagnostic.
    - Pure `diff(before, after)` produces only the core Change kinds, in the order defined in the design: `file-created`, `file-deleted`, `file-overwritten` (size or hash differs), `symlink-changed` (`targetBefore`, `targetAfter`), and `sql-row-count` (`rowsBefore`, `rowsAfter`; `dropped: true` only when the table no longer exists, then `rowsAfter: 0`; `dropped` omitted otherwise, including for a new table). It never emits `file-modified`, `file-mode-changed`, `sqlite-table-rows-changed`, or `sqlite-unreadable` as a Change kind.
    - Pure `diffDiagnostics(before, after, stepIndex)` returns the Diagnostics that have no core Change kind: `mode-changed` (mode-only change, no verdict effect by itself) and `sqlite-unreadable` (`{ path, stepIndex }`, verdict at least `warn`); store them in `RepoState.lastStep.diagnostics`. Diagnostics are never passed to the Ward_Engine as Changes.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13, 11.14, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.8_

  - [x] 7.6 Write property test for incremental versus full-hash differ [no-docker]
    - **Property 1: Incremental differ equals full-hash differ**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.10**

  - [x] 7.7 Write property test for diff algebra [no-docker]
    - Assert that every emitted Change kind is one of `file-created`, `file-overwritten`, `file-deleted`, `symlink-changed`, `sql-row-count`, and that a mode-only change and an unreadable SQLite file yield no Change but a Diagnostic.
    - **Property 2: Diff algebra**
    - **Validates: Requirements 2.5, 11.5, 11.6, 11.7, 11.8, 11.9, 11.11, 11.12, 11.14, 12.2, 12.3, 12.8**

- [x] 8. Recorder host side (`recorder/`)
  - [x] 8.1 Implement `src/recorder/dns-codec.ts`, `secret-patterns.ts`, and `events.ts`
    - DNS codec: decode A and AAAA queries to a lowercase hostname, encode a response with one allocated loopback address per name (stable per name), AAAA as NOERROR with no answers.
    - `secret-patterns.ts`: default patterns `.env`, `.env.*`, `**/*.pem`, `**/id_rsa*` plus egress ward `secrets` entries.
    - `events.ts`: mapping to core `ObservedEvent` (`network-attempt` with `destination`, `secret-read` with Copy-relative `path`), at most one event per distinct (`stepIndex`, `destination`) or (`stepIndex`, `path`) within the recorder only. No deduplication against static Effects (decision 5).
    - _Requirements: 8.1, 8.3, 8.10, 9.1, 9.2_

  - [x] 8.2 Write property test for the DNS codec [no-docker]
    - **Property 15: DNS codec**
    - **Validates: Requirements 8.1, 8.3**

  - [x] 8.3 Implement `src/recorder/parse-strace.ts` and `parse-logs.ts`
    - `parse-strace.ts`: handle interleaved pids, `<unfinished ...>` and `resumed` lines, `AF_INET`, `AF_INET6`, `AF_UNIX` connects, read-only versus write-only opens, per-pid working directory tracking from `chdir` and `fchdir`, `-y` decorated dirfds, conservative trailing-component matching for unresolved paths, loopback filtering (allocated addresses map back to hostnames), `/work` prefix stripping and path normalization. Never throw on garbage lines. Record paths only, never contents.
    - `parse-logs.ts`: parse `dns.jsonl` and HTTP and TLS logs into events and payload capture metadata.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 9.2, 9.3_

  - [x] 8.4 Write property test for the strace parser [no-docker]
    - **Property 13: strace parser extracts exactly the destinations and secret reads**
    - **Validates: Requirements 8.7, 8.9, 8.10, 9.2, 9.3**

  - [x] 8.5 Implement `src/recorder/collect.ts`
    - Minimal tar reader for `docker cp <container>:/ghost-rec -` (regular files only, size cap, rejected path traversal and hidden or oversized entries), 64 MiB cap on `/ghost-rec`.
    - Fail-closed validation per executed step: `step-<i>.strace`, closing marker `{"end":i,...}` in `steps.jsonl`, parseable lines, liveness probe result; any failure yields the diagnostic `recorder-failure`.
    - Report `recorder: { location: "in-box", tamperResistant: false }` always.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.6 Write property test for recorder corruption detection [no-docker]
    - **Property 14: Recorder output corruption is detected**
    - **Validates: Requirements 10.4**

  - [x] 8.7 Implement `eventId` assignment linking `RunOutput.payloads` to events in `src/recorder/events.ts`
    - Keep a per-run counter in the event builder and assign `ev-<n>` (`n` from 0, in order of event creation) to an event at the moment a payload is attached; the id is never derived from the plan or the payload. Events without a capture leave `eventId` unset.
    - Several requests to the same destination in one step map to one event; append their bodies in arrival order into one capture capped at 64 KiB, stored once under that event's `eventId`.
    - Build `RunOutput.payloads` and `report.observedEvents` from the same list, so every key of `payloads` equals the `eventId` of exactly one event in `observedEvents`, and a payload without an event or an `eventId` shared by two events cannot be constructed. Never place `secretValues` in `payloads`.
    - _Requirements: 8.11, 8.14, 8.15, 9.4_

  - [x] 8.8 Write unit tests for `eventId` assignment [no-docker]
    - Assert unique ids within a run, `payloads` keys equal to the `eventId`s of events with captures one to one, no `eventId` on events without a capture, one capture (concatenated, at most 64 KiB) for repeated requests to the same destination in a step, and that ids do not change when the plan or payload content changes.
    - _Requirements: 8.14, 8.15_

- [x] 9. Checkpoint - Ensure all tests pass
  - Run `pnpm --filter @ghost-run/ghost-runner test` in the `GHOST_PBT_MODE=save` profile and `pnpm --filter @ghost-run/core test`; all `[no-docker]` tests must pass. Ask the user if questions arise.

- [x] 10. Box image (W3)
  - [x] 10.1 Create `box/Dockerfile`, `BASE_DIGEST`, and `box/build.mjs`
    - Resolve the digest of `node:20-bookworm-slim` with `docker buildx imagetools inspect` or `docker pull` and record it in `box/BASE_DIGEST` (do not invent a digest); pin the base by digest in the Dockerfile.
    - Install `strace sqlite3 curl openssl ca-certificates` from a Debian snapshot archive URL fixed by timestamp; clean apt caches; run no downloaded scripts.
    - `build.mjs` (`pnpm --filter @ghost-run/ghost-runner box:build`): builds `ghost-run/box:<sha256 of Dockerfile + BASE_DIGEST + recorder/*>` and sets a build label; no auto-build in the hook path.
    - Start the README license table with the box packages (Node MIT, strace LGPL-2.1-or-later, sqlite3 public domain, curl curl license, openssl Apache-2.0, ca-certificates GPL-2.0-or-later and MPL-2.0 data) and the host dependency `shell-quote` (MIT); confirm each license before merge.
    - _Requirements: 1.5, 5.5, 8.12_

  - [x] 10.2 Write the in-box recorder scripts in `box/recorder/`
    - `ghost-init.mjs` (PID 1, starts listeners, writes `/ghost-rec/ready`), `dns.mjs` (UDP 53, A answers with allocated `127.x.y.z`, AAAA NODATA, `dns.jsonl`), `http.mjs` (TCP 80, up to 64 KiB body, logs host, port, bytes, sha256, step, replies `200`), `tls.mjs` (TCP 443, per-SNI leaf certificate cache, SNI logged before the handshake completes, up to 64 KiB decrypted body), `ghost-step.sh` (writes the step index, waits up to 2 s for `ready`, runs `strace -f -qq -s 256 --seccomp-bpf -e trace=openat,open,openat2,connect,chdir,fchdir -e signal=none -y -o /ghost-rec/step-<i>.strace -- sh -c "$action"` with the action as one argument, appends the end marker), and `ghost-count.mjs` (copies each database with `-wal` and `-shm` sidecars to `/tmp`, runs `sqlite3 -readonly -json`, quotes names with doubled `"`, never writes to `/work`).
    - Use only Node built-ins in the box. Do not share code with host modules except through duplicated small codecs covered by Property 15 tests.
    - _Requirements: 5.9, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 9.1, 12.4, 12.5_

  - [x] 10.3 Generate the box-only CA at image build time and guard against committed private keys
    - In the Dockerfile, generate the throw-away CA with `openssl` into `/opt/ghost/ca` during `docker build`, install the certificate with `update-ca-certificates`, and bake `NODE_EXTRA_CA_CERTS` as an image `ENV`. The key must exist only inside the built image layers, never in the build context, in `box/`, or anywhere in the repository (no `COPY` of key material).
    - `box/recorder/ca.mjs` reads the CA key from `/opt/ghost/ca` at runtime and mints leaf certificates only for the recorder.
    - Write `ghost-runner/tests/no-private-key.test.ts` [no-docker]: walk the repository (excluding `node_modules` and `.git`), assert no file contains a private-key PEM header (build the header string from parts in the test so the test file does not contain it) and no tracked file name matches `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, or `ca-key*`; additionally assert that `.gitignore` contains the entries added in task 1.4.
    - Add a short README note that the CA is created at image build time, is not in the repository, and is used only inside the box.
    - _Requirements: 8.2, 8.4, 8.8, 8.12, 18.6_

- [x] 11. Docker layer: availability, box lifecycle, pool
  - [x] 11.1 Implement `src/docker/availability.ts` and `src/docker/box.ts`
    - Availability check with a 2.0 s absolute limit (`docker image inspect` of the content-addressed tag, comparison of the image id with the build label); reasons `docker-unavailable` and `box-image-missing`.
    - Box lifecycle: create with `buildRunArgs`, run the audit (`auditInspect`), exec each action with the remaining execution budget, `docker kill` on timeout, read `/ghost-rec` with `docker cp` after normal end and after a kill, `docker rm -f -v`, and an always-run cleanup with its own short timeouts.
    - _Requirements: 3.1, 5.1, 5.6, 5.7, 5.10, 7.2, 7.3, 7.4, 7.6, 7.7, 16.1, 16.2, 16.3_

  - [x] 11.2 Implement `src/docker/pool.ts` (long-lived hosts only)
    - Pool of one-shot slots (size 1 to 8, off by default), each with an empty slot directory at `/work`, a fresh `/ghost-rec` volume, and the label `ghost-run.pool-owner=<pid>:<process start time>`.
    - A slot serves at most one run; afterwards container, volume, and slot directory are removed and a replacement is started in the background outside run timing. No slot ready: fresh container with `box.source: "fresh"`.
    - Start-up and exit sweeps remove only slots whose owner process is dead or is the current process; the exit handler finishes within 5 s.
    - The pool is not created by `runPlan` unless the host passes `pool.size`; per-hook processes leave it off (decision 4). Document this in the module header.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 11.3 Write the pool lifecycle model test [no-docker]
    - Use the fake Docker client: one use per slot, replacement outside run timing, fresh fallback when empty, owner-liveness sweep never removes a live foreign owner's slots, exit handler removes own slots.
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 6.8, 6.9_

  - [x] 11.4 Create the fake Docker client for tests [no-docker]
    - `ghost-runner/tests/fixtures/fake-docker.ts`: implements the client interface from `cli.ts`, with scripted exit codes and timeouts, a fake clock, one injectable failure at a chosen phase (copy, create, audit, exec, collect, fingerprint, diff), an inventory of containers and volumes per run id, and scripted recorder output (events, captured payloads) so pipeline tests can run without Docker.
    - _Requirements: 7.2, 7.8, 16.2, 16.4_

- [x] 12. Repo_World and pipeline
  - [x] 12.1 Implement `src/world/repo-world.ts`, `src/world/render.ts`, and `stepInSession`
    - `createRepoWorld(opts)` implementing all six `World<RepoState, ShellAction>` functions, `metadata: { id: "repo", deterministic: false }`, `dispose()` that removes every Copy it created plus a best-effort `process` exit sweep, and the compile-time declaration `const w: World<RepoState, ShellAction> = repoWorld`.
    - `snapshot()` uses the Original fingerprint hashes as baseline (D3); `step` clones the input snapshot's directory, opens a one-action box session, never mounts the input directory, and returns `success: false` with an error text on non-zero exit, timeout, or Docker error; `render` returns `{ kind: "repo-tree", entries: [{ path, type, size }] }` sorted by path.
    - `stepInSession(session, index, action)` is the single shared implementation used by `runPlan` and `Repo_World.step`; `RepoState.lastStep` carries exit code, events, and diagnostics.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 14.7_

  - [x] 12.2 Write property test for render [no-docker]
    - **Property 17: Render is JSON-safe**
    - **Validates: Requirements 2.6**

  - [x] 12.3 Implement `src/pipeline.ts` (`runPlan`)
    - Orchestrate: option validation, availability check (Plan B on failure), Original fingerprint before (overlapped with box create), copier, box with audit, baseline, step loop through `stepInSession`, recorder collect, fingerprint after with `compareFingerprints`, `WardEngine.evaluate(report, wardSet, { secretValues, payloads })` with the `wardSet` option, runner verdict and claims, `RunResult` assembly with `PhaseDurations`, and `finally` cleanup of container, volume, and Copy directory (cleanup errors go to diagnostics and never mask the original error). The `secretValues` read and release are added in task 12.8.
    - Report assembly: `snapshots[0]` before the first action, `snapshots[i+1]` after action `i`, `changes[i]` from `repoWorld.diff`, `effectsOutside[i]` from the static analyzer, `observedEvents` from the recorder, `variantResults: []`; arrays cut at the last executed step on timeout.
    - Do not deduplicate observed events against static Effects (decision 5).
    - Deadlines: 2.0 s Docker check, 20 s copy, execution limit (default 25 s, maximum 30 s) with `docker kill`, 55 s pipeline deadline returning within 60 s with status `pipeline-deadline`; every external call timeout derives from the time left.
    - Plan B: execute nothing on the host, set `isolation.mode: "static-analysis"`, `rehearsed: false`, all claims false, empty change arrays, `observedEvents: []`, `staticFindings`, a Plan B scan of Original for symbolic links pointing outside it, the exact notice `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.` in `result.notices` and via the optional `onNotice` callback (with the `box:build` hint for `box-image-missing`), and a verdict of at least `warn`.
    - Emit `protected-path-excluded`, `baseline-race`, `diff-unstable`, `recorder-failure`, and `sqlite-unreadable` diagnostics.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 14.1, 14.2, 14.3, 14.4, 15.1, 15.3, 15.4, 16.1, 16.2, 16.3, 16.4_

  - [x] 12.4 Write property test for Plan B disclosure [no-docker]
    - Use the fake Docker client configured as unreachable and as image-missing; assert no action or process other than the Docker probe runs.
    - **Property 8: Plan B states what it does not claim**
    - **Validates: Requirements 3.2, 3.3, 3.4, 15.1, 15.3, 15.4, 17.6**

  - [x] 12.5 Write property test for step outcome handling and cleanup under injected failure [no-docker]
    - **Property 18: Step outcome handling and cleanup under injected failure**
    - **Validates: Requirements 2.4, 7.2, 7.8, 16.2, 16.4**

  - [x] 12.6 Implement `src/index.ts` and the package build
    - Export the public API: `createRepoWorld`, `runPlan`, `serializeRunResult`, `parseRunResult`, `analyze` (as the static analyzer entry), option and result types, errors.
    - Make `tsconfig.build.json` emit `dist/` with declarations; add `exports` and `files` to `ghost-runner/package.json`.
    - _Requirements: 1.1, 1.2, 14.4_

  - [x] 12.7 Write unit test that observed events and static Effects are not deduplicated [no-docker]
    - With the fake Docker client, run a plan whose static analysis finds `https://setup-check.example/x` and whose recorder reports a network attempt to `setup-check.example`; assert the report contains both the `Effect` and the `ObservedEvent` and that neither list is reduced.
    - _Requirements: 8.10, 9.2, 15.2, 15.5_

  - [x] 12.8 Read `secretValues` into memory before the first action and release it after evaluation
    - In `runPlan` (`src/pipeline.ts`) and `src/verdict.ts`: when the evaluated `WardSet` contains an `egress` ward, read, after the Copier finishes and before the first action runs, the contents of the files in the Copy (not Original) that match the `secrets` patterns of the `egress` wards into a `Map<string, Uint8Array>` keyed by Copy-relative path (core `SecretValues`). Only egress `secrets` entries select files; the default `secretPatterns` option does not cause content to be read.
    - Hold the contents in process memory only. Never write them to disk, logs, the serialized `RunResult`, or graveyard output; derive at most a byte length or SHA-256. Never place them in `RunOutput.payloads` or `RepoState`, and do not add a `secretValues` field to `RunResult`.
    - Pass `secretValues` to `WardEngine.evaluate(report, wardSet, { secretValues, payloads })`. After it returns, call `.clear()` on the map and drop the reference before the `RunResult` is returned.
    - A matching file that cannot be read from the Copy adds the diagnostic `secret-values-unreadable` with the Copy-relative path only, sets `isolation.p6Claimed` to `false`, and gives at least `warn`.
    - _Requirements: 9.1, 9.4, 9.10, 9.11, 9.12, 9.13, 14.2_

  - [x] 12.8a Cap the count and size of `secretValues` read from the Copy
    - Add `MAX_SECRET_FILES = 16` and `MAX_SECRET_FILE_BYTES = 65536` to `src/config.ts` (fixed constants, not options).
    - In the `secretValues` read of task 12.8: order matching files by UTF-8 byte order of the Copy-relative path; read only the first 16 (an unreadable file counts toward the 16); read each with a bounded read of at most 65,536 bytes, so the first 65,536 bytes are kept and the rest are never loaded. A file beyond the count is not read (size from `lstat`).
    - For each capped file add one Diagnostic `secret-values-capped` with `path` (Copy-relative) and `detail { reason: 'count' | 'size', byteLength, cap }`. No content, hash, or other derived value. It does not change `p6Claimed` and has no verdict effect by itself. Add `secret-values-capped` to the `Diagnostic` name comment in `src/result.ts`.
    - Do not change the Behavior_Criterion path: secret-read events and the network-attempt check do not use `secretValues`, so they still cover every secret file. The caps do not change where `secretValues` may be written (still nowhere).
    - _Requirements: 9.9, 9.11, 9.15_

  - [x] 12.8b Write the `secretValues` cap tests [no-docker]
    - With the fake Docker client and a generated Copy fixture, assert: (1) with 17 or more matching secret files, exactly the first 16 in path byte order are in `secretValues` and each skipped file has one `secret-values-capped` Diagnostic with `reason: 'count'`, its original byte length, and cap 16; (2) a file over 65,536 bytes is truncated to its first 65,536 bytes, with a `secret-values-capped` Diagnostic (`reason: 'size'`, original length, cap 65,536); a file of exactly 65,536 bytes gets none; (3) the selection and truncation are identical across repeated runs and across shuffled directory listing order.
    - Assert the Diagnostic holds only path, reason, and the two numbers: with a canary placed in a skipped file and in the truncated tail, no output channel (serialized `RunResult`, diagnostics, notices, logs, graveyard) contains the canary or any 8-byte window of the file content in raw, base64, hex, or URL-encoded form.
    - Assert that the behavior criterion is unaffected: a run that reads a capped (skipped or truncated) secret file and then makes an unapproved network attempt still gives `block` from the `egress` ward with the same violation as without caps, and `p6Claimed` is unchanged by the caps.
    - _Requirements: 9.4, 9.11, 9.15_

  - [x] 12.9 Write the no-leak test over all output channels [no-docker]
    - With the fake Docker client, run a plan against a fixture whose `.env` holds the canary `sk-CANARY-abc123` plus filler lines, with an `egress` ward whose `secrets` include `.env`. Collect every output channel: the serialized `RunResult`, the serialized `report`, captured `console` and logger output (spies), the graveyard output, a recursive read of every file written outside the Copy (run directory, temp files, recorder tar extraction target), and the serialized `WardVerdict`.
    - Assert with a sliding window over the secret file content that no channel contains the canary or any contiguous substring longer than 8 bytes, in raw, base64, hex, or URL-encoded form. A second variant spies on the file-system layer and asserts that no write call receives bytes containing a window of the secret content. The captured network payload of scenario 3 is the only allowed exception, and only its length and SHA-256 are serialized.
    - Assert that after `runPlan` returns, `RunOutput` and `RunResult` hold no reference to the `secretValues` map (a structural walk of the returned objects, plus a `WeakRef` check after forced garbage collection when run with `--expose-gc`).
    - Assert the unreadable-secret-file case: diagnostic `secret-values-unreadable` with the path only, `p6Claimed: false`, verdict at least `warn`.
    - Keep Property 12 (task 4.5) aligned with this test: same 8-byte window and the same four encodings.
    - _Requirements: 9.4, 9.11, 9.12, 9.13, 9.14, 18.6_

- [x] 13. Checkpoint - Ensure all tests pass
  - Run all `[no-docker]` tests, `pnpm lint`, and `pnpm -r build`. Ask the user if questions arise.

- [x] 14. Docker-dependent and integration tests
  - [x] 14.1 Create the Docker test reporter label
    - Add a vitest reporter or helper so that suites skipped by `describeDocker` print `skipped (docker unavailable)` in the summary and P1, P5, and P6 are never counted as passed in that case; add a `partial (n of 20 examples)` label for interrupted Docker properties.
    - _Requirements: 17.7_

  - [x] 14.2 Write property test for P1 on the Docker box [docker]
    - Skipped when Docker is unavailable; not asserted in Plan B. Pool of 2 slots in the on-save profile.
    - **Property 19: P1 for the Docker box (claimed in Docker-box runs, with Docker available)**
    - **Validates: Requirements 17.1**

  - [x] 14.3 Write property test for P3 on the Repo_World [docker]
    - The Repo_World `step` runs in a box, so this test needs Docker; report `skipped (docker unavailable)` otherwise.
    - **Property 20: P3 for the Repo_World (claimed in all worlds)**
    - **Validates: Requirements 2.3, 17.3**

  - [x] 14.4 Write property test for P5 and P6 where prerequisites hold [docker]
    - P5 only where P1 holds; P6 only when `p6Claimed` is true; neither is asserted in Plan B or when Docker is unavailable.
    - **Property 21: P5 and P6 where their prerequisites hold**
    - **Validates: Requirements 17.4, 17.5, 9.2, 8.3**

  - [x] 14.5 Write property test that the pipeline and Repo_World agree [docker]
    - **Property 22: Pipeline and Repo_World agree**
    - **Validates: Requirements 14.7**

  - [x] 14.6 Write the port 53, 80, and 443 binding test under hardened options (W9) [docker]
    - Start the box with the full hardening options (`--cap-drop ALL`, `--user <host uid>:<host gid>`, `--read-only`, `--network none`, `no-new-privileges`) and assert that the fake DNS server binds UDP 53 and the HTTP and TLS listeners bind TCP 80 and 443 as the unprivileged user; report `skipped (docker unavailable)` without Docker.
    - _Requirements: 8.13, 5.1_

  - [x] 14.7 Write the five scenario acceptance tests [docker]
    - Scenario 1: a `sql-row-count` Change for `users`, `rowsBefore` 1206 to `rowsAfter` 0 with `dropped: true`. Scenario 2: `file-deleted` for every file in `data/` and `build/`. Scenario 3: `secret-read` of `.env` followed by a `network-attempt` to `setup-check.example` whose event carries an `eventId` that is a key of `RunOutput.payloads`, captured payload SHA-256 equal to the hash of a body that contains the canary, serialized result free of the canary (and of any secret-content substring over 8 bytes in raw, base64, hex, and URL-encoded form). Scenario 4: `changes[0]` is `[]` for fixture paths, no `registry.npmjs.org` event, total time under the scenario limit. Scenario 5: `npm run clean` produces `file-deleted` for `data/`.
    - Add a grep-based test [no-docker] that fixtures contain only reserved domains (plus `registry.npmjs.org` as the `allow_hosts` example).
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 8.11, 8.14, 9.4_

  - [x] 14.8 Write the `verifyWorld` conformance test [docker]
    - `verifyWorld(repoWorld, { id: "repo", deterministic: false, wardSet })` imported from `@ghost-run/core/verify` passes; P2 is skipped because `deterministic: false`.
    - Add a compile-time assertion [no-docker] that `repoWorld` is assignable to `World<RepoState, ShellAction>` and `metadata.deterministic === false`.
    - _Requirements: 17.9, 2.1, 2.9_

  - [x] 14.9 Write the Plan B transition integration test [no-docker]
    - Point `DOCKER_HOST` at a deliberately unreachable address; assert Plan B result, the exact notice text, `rehearsed: false`, all claims false, and that the check returns within 2.0 s.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 15.3, 15.4_

  - [x] 14.10 Write fake-clock timeout tests [no-docker]
    - Docker check 2.0 s, copy 20 s with partial-Copy removal, execution 30 s with `docker kill` and partial diff, pipeline 55 s with return within 60 s and cleanup.
    - _Requirements: 4.8, 7.3, 7.4, 7.5, 7.6, 7.7, 3.1_

  - [x] 14.11 Write the repository scan test for hidden Unicode and credential patterns [no-docker]
    - Scan `ghost-runner/` and `.kiro/specs/ghost-runner/` for tag characters (U+E0000 to U+E007F), zero-width characters (U+200B to U+200D, U+2060, U+FEFF), and bidi controls (U+202A to U+202E, U+2066 to U+2069); build the character classes from `\u` escapes in the test code. Also assert no real-credential patterns (only canary values).
    - _Requirements: 18.6, 18.7_

- [x] 15. Measurement tasks (W6, W7)
  - [x] 15.1 Run the secret-read recording trial (W6) [docker]
    - Write a script `ghost-runner/scripts/trial-secret-read.mjs` that runs the D1 matrix on the Reference_Repo and Reference_Machine: commands `true` and `npm test`; variants (a) no strace, (b) strace `connect` only, (c) strace `connect+openat` with plain ptrace, (d) strace `connect+openat` with `--seccomp-bpf`; 10 runs per cell; report median and maximum.
    - Apply the decision rule: if (d) minus (a) is at most 0.8 s for both commands, replace the provisional bound with the measured value; otherwise narrow tracing with `-P <path>` for the active wards' patterns or mark secret-read recording off (`p6Claimed: false`, `warn`).
    - Record the results in `docs/research.md` (a new section; keep existing content).
    - _Requirements: 9.5, 9.6, 9.7, 9.8_

  - [x] 15.2 Run the timing measurement (W7) and record the results [docker]
    - Write `ghost-runner/scripts/measure-timing.mjs` that records Median_Of_5 and the maximum of every phase of `PhaseDurations`, each of the five scenarios, and the extra per-step cost for steps after the first; include the Docker Desktop `ctime` propagation check.
    - Measure the fake DNS lookup latency inside the box (requirement 8.1, target at most 0.1 s Median_Of_5) and `npm test` (target below 1.0 s) and report the measured values without changing the criterion.
    - If the DNS latency median exceeds 0.1 s, write a follow-up item in `docs/measurements.md` titled `Follow-up: correct requirement 8.1 DNS latency` that states the measured value and proposes the corrected number for the requirements owner; do not edit `requirements.md`.
    - Write all measured values to `docs/measurements.md` (English; add a section if the file exists). `docs/devlog.md` is written in Korean by Claude Code and is never edited here. With the values, record the machine (chip, core count, memory, Docker Desktop version) and the system load (`sysctl -n vm.loadavg`) at the start and end of the measurement; if the load is high, say so next to the values.
    - _Requirements: 8.1, 8.2, 5.10, 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 16. Documentation (W8, W10)
  - [x] 16.1 Complete `ghost-runner/README.md` and the root README entries (W10)
    - Library and license table (host: `shell-quote` MIT, `fast-check` MIT, `vitest` MIT, `typescript` Apache-2.0; box packages from task 10.1), confirmed per dependency.
    - Plan B limitation (no P1, P5, or P6 claim), the exact notice text, macOS and Linux support, Windows unverified, Docker Desktop license note (already recorded in `docs/research.md`), the recorder tamper statement (`tamperResistant: false`, same-user process can rewrite its own records), the box-only CA statement (key generated at image build time, never committed), the `box:build` command, and the pool note (long-lived hosts only).
    - Add a link to `ghost-runner/` from the root `README.md` if it exists; do not create the root README if absent.
    - _Requirements: 1.5, 3.6, 10.2, 19.6_

  - [x] 16.2 Write the `contract-pbt` hook configuration note for the `kiro-integration` spec (W8)
    - Add a section "Notes for kiro-integration" to `ghost-runner/README.md` stating: on save the hook must run the Repo_World properties with `GHOST_PBT_MODE=save` (20 examples per property, whole run within 60 s, no LLM calls), `[docker]` tests report `skipped (docker unavailable)`, and P1, P5, and P6 are not asserted then; and that the hook script must not build the box image or start a pool per process.
    - Do not create or edit hook files or other specs here; the hook belongs to the `kiro-integration` spec.
    - _Requirements: 17.7, 17.8_

- [x] 18. Follow-ups from the previous round
  - [x] 18.1 Remove the temporary timing test [no-docker]
    - Delete `ghost-runner/tests/tmp-timing.docker.test.ts` and the `exclude` entry for it (and its comment) in `ghost-runner/vitest.config.ts`; keep the `node_modules` exclude. Confirm `grep` finds no remaining reference to `tmp-timing`.
    - _Requirements: 17.7_

  - [x] 18.2 Sweep stopped boxes of dead owners at run start [docker]
    - Requirements and design first: add to Requirement 16 an acceptance criterion and to the cleanup section of `design.md` a paragraph stating that, at the start of a run (and a pool start), the runner removes containers and anonymous `/ghost-rec` volumes labeled `ghost-run.run-id` whose owner process is dead (for example after SIGKILL of the host), using the same owner label and liveness rule as the Pool sweep (`ghost-run.pool-owner=<pid>:<process start time>`; an owner is alive when its pid exists and its start time matches). Boxes of a live foreign owner and of the current process are never touched. This requires every box (not only pool slots) to carry an owner label; add `ghost-run.owner=<pid>:<start time>` to every box in `buildRunArgs` and keep the pool label.
    - Implement it in `src/docker` (share the owner-liveness code with `pool.ts`) and call it once per process at the start of `runPlan` outside the timed phases (bounded by its own short timeouts, errors go to diagnostics and never fail the run).
    - Tests: [no-docker] with the fake Docker client (dead owner removed, live foreign owner kept, current process kept, unlabeled container kept, list failure tolerated); [docker] one test that creates a stopped `ghost-run` box with a dead owner label (a pid that does not exist) and checks that the next `runPlan` removes it and its volume. Clean up everything the test creates.
    - _Requirements: 16.2, 16.3, 6.7_

  - [x] 18.3 Scenario 3 with secret-read recording off must give `warn` or more [docker]
    - In the Docker scenario test for scenario 3, where the secret-read recording is switched off, assert the verdict is exactly `warn` or `block` as the design states (`pass < warn < block` order, at least `warn`), `p6Claimed` is `false`, and not only that it is not `pass`. Check design.md and requirements.md (Requirement 9 criterion 8, Requirement 14 criterion 2) for the exact expected value before writing the assertion.
    - _Requirements: 9.8, 14.2_

  - [x] 18.4 `verifyWorld` conformance with `stateEquals` [docker]
    - In `ghost-runner/tests/verify-world.docker.test.ts` change the `it.fails` test to a plain `it`, pass `stateEquals` from core (`verifyWorld` option added by core-contract task 15) that compares the content fingerprint of two `RepoState` values: for each entry the relative path, the kind, and the content bytes (file bytes; symlink target); `rootPath`, timestamps (`mtimeNs`, `ctimeNs`, `copiedAt`), and `lastStep` are left out. Remove the second test that expects the failure and the long comment about the expected failure. Keep `deterministic: false`.
    - _Requirements: 17.9_

  - [x] 18.5 Optional caller-chosen `runId` in `RunnerOptions`
    - Needed by the kiro-integration spec (watchdog cleans up by the `ghost-run.run-id` label when the runner hangs). First update `requirements.md` (Requirement 16 and the glossary or options wording), `design.md` (options section, label section, cleanup), and this `tasks.md` (this task) with: the option `runId?: string`; format `^[A-Za-z0-9_-]{1,64}$` (characters allowed in a Docker label value and container name suffix), violation throws `ConfigError` naming the bound before any container is created; a run id that is already in use by a container of the same label (a running or stopped box) makes `runPlan` throw `ConfigError` before creating anything and without touching the existing container; when absent, the runner makes a random UUID as today. The container name stays `ghost-<runId>`.
    - Spec text added for this task: Req 16.3, 16.5, 16.6 and the glossary term Run_Id in `requirements.md`; the `runId` row and the "Caller-chosen `runId`" paragraph under "RunnerOptions and defaults" in `design.md`.
    - Implement in `src/config.ts`, `src/pipeline.ts` and `src/docker` (duplicate check by `docker ps -a --filter label=ghost-run.run-id=<id>`, its own short timeout; an error of the check itself is a diagnostic, not a failure). `Repo_World` keeps random ids.
    - Tests [no-docker]: valid and invalid formats (property test over generated strings), absent id gives a UUID, the given id appears in `RunResult.runId`, the label and the container name, duplicate throws and removes nothing, cleanup by label works after an injected hang with the fake Docker client. Add to Property 7 (configuration bounds) if it fits.
    - _Requirements: 16.3, 16.5, 16.6, 7.1_

  - [x] 18.6 Caller-chosen `pipelineDeadlineSec` and exported run-id label constant (for kiro-integration) [no-docker]
    - Requirements, design and this file first: add the optional `RunnerOptions.pipelineDeadlineSec` (number, default 55, range 1 to 55, else `ConfigError` naming the bound before any container is created; the Absolute_Limit stays 55 s and is never exceeded). The caller's value replaces the fixed 55 s in the deadline computation, in the remaining-time derivation of every external call, and in the `pipeline-deadline` error text; a run that passes the deadline gives the same `pipeline-deadline` result and the same cleanup as today. Update Requirement 7 criterion 5 (and the Absolute_Limit glossary wording) and the options table and deadline paragraphs in `design.md` (rows near "pipelineDeadlineSec | 55", the "Pipeline deadline (55 s)" bullets, the error table row).
    - Export `LABEL_RUN_ID` (value `ghost-run.run-id`) from the public entry point `src/index.ts` so callers never write the string. Mention it in `ghost-runner/README.md` only if the options are listed there.
    - Tests [no-docker] with the fake Docker client and fake clock: default is 55 s; valid and invalid values (0, 56, NaN, non-number, negative) with `ConfigError` before any Docker call; a run with a smaller deadline hits `pipeline-deadline` at that deadline, returns the same result shape, and removes container, volume and Copy; `LABEL_RUN_ID` equals the string used in `buildRunArgs`. Add to Property 7 (configuration bounds) if it fits.
    - _Requirements: 7.5, 16.3_

  - [x] 18.7 Box folder option `boxDir` and lookup order for the single-file bundle [no-docker]
    - Spec text first (2026-11-18): `requirements.md` (Req 3 criteria 7 to 10, Req 7 criterion 9, glossary term Box_Dir) and `design.md` (section "Box_Dir lookup" and the `boxDir` row of the options table) were updated before the code.
    - Implemented `RunnerOptions.boxDir`, the environment variable `GHOST_RUN_BOX_DIR`, and the lookup order: `boxDir`, the environment variable, the module location (up to 6 levels), then the workspace (up to 32 levels, trying `ghost-runner/box` and then `box`).
    - Added `findBoxDir`, `resolveBoxDir`, `BOX_DIR_ENV`, and `BoxDirSources` in `ghost-runner/src/docker/availability.ts`. A folder without a `Dockerfile` gives `box-image-missing`.
    - Passed the option from `src/pipeline.ts` and `src/world/repo-world.ts`, and exported the new names from `src/index.ts`.
    - Tests in `ghost-runner/tests/box-dir-lookup.test.ts`. Result: unit project 58 files, 294 tests passed, typecheck and lint clean.
    - The real check with the rebuilt MCP bundle is recorded in `docs/measurements.md` (section "Box folder lookup and bundled ghost_run").
    - _Requirements: 3.7, 3.8, 3.9, 3.10, 7.9_

  - [x] 18.8 Docker wake retry (Resource Saver) [no-docker]
    - Spec text: Req 3.1, 3.2, and 3.11 in `requirements.md`; the sequence diagram, the section "Docker wake retry", the timing table, the error table, and the fake-clock test list in `design.md`.
    - Implemented in `ghost-runner/src/docker/availability.ts` (`AVAILABILITY_WAKE_LIMIT_MS` = 10,000, options `wakeRetryLimitMs` and `deadlineAt`, `wakeRetried` on both result variants), `ghost-runner/src/config.ts` (`RunnerOptions.dockerWakeRetryMs`, integer 1 to 30000, opt-in), `ghost-runner/src/pipeline.ts` (passes the option with the pipeline deadline, sets `RunResult.dockerWakeRetried`), `ghost-runner/src/result.ts`, and `ghost-runner/src/index.ts` (exports both limit constants).
    - Reason: Docker Desktop's Resource Saver stops its VM after 5 idle minutes and the first engine call takes about 1.9 s (measured 2026-11-21, `docs/measurements.md`, section "Docker Resource Saver wake-up").
    - Tests: `ghost-runner/tests/docker-availability.test.ts` (7 wake-retry tests) and `ghost-runner/tests/pipeline.test.ts` (6 tests in 'runPlan wake retry').
    - _Requirements: 3.1, 3.2, 3.11_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Run `pnpm lint`, `pnpm -r build`, the `[no-docker]` tests in `save` and explicit profiles, and, where Docker is available, the `[docker]` tests. Confirm the summary shows `skipped (docker unavailable)` for any skipped Docker suite and that no private-key file is present in the repository. Ask the user if questions arise.

## Notes

- `[docker]` tests need a running Docker daemon and the built box image (`pnpm --filter @ghost-run/ghost-runner box:build`). They report `skipped (docker unavailable)` otherwise; P1, P5, and P6 are never asserted when Docker is unavailable or in Plan B.
- Profiles: on save 20 examples per property within 60 s; explicit (`test:pbt`) at least 100; nightly (`GHOST_PBT_MODE=nightly`) at least 10,000.
- Properties 1 to 22 keep the numbering of `design.md`. P2 (core safety property) is not asserted for the Repo_World because it is registered with `deterministic: false`.
- Task 3 (W0, core type changes) blocks every other remaining task: it is the first wave after the finished tasks 1 and 2, and task 3.4 rebuilds `core/dist` so `ghost-runner` compiles against the new types.
- Measurement tasks 15.1 and 15.2 produce data (to `docs/research.md` and `docs/measurements.md`), not runtime behavior.
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["3.4"] },
    { "id": 6, "tasks": ["4.1", "5.1", "6.1", "7.1", "8.1"] },
    { "id": 7, "tasks": ["4.2", "4.3", "5.2", "6.2", "6.3", "7.2", "7.3", "8.2", "8.3"] },
    { "id": 8, "tasks": ["4.4", "4.5", "4.6", "7.4", "7.5", "8.4", "8.5"] },
    { "id": 9, "tasks": ["4.7", "4.8", "7.6", "7.7", "8.6", "8.7", "10.1", "11.4"] },
    { "id": 10, "tasks": ["8.8", "10.2", "11.1"] },
    { "id": 11, "tasks": ["10.3", "11.2", "12.1"] },
    { "id": 12, "tasks": ["11.3", "12.2", "12.3"] },
    { "id": 13, "tasks": ["12.4", "12.5", "12.6", "12.7", "12.8", "14.1"] },
    { "id": 14, "tasks": ["12.8a", "12.9", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "14.9", "14.10", "14.11"] },
    { "id": 15, "tasks": ["12.8b", "15.1", "15.2"] },
    { "id": 16, "tasks": ["18.1", "18.3", "18.5"] },
    { "id": 17, "tasks": ["18.2", "18.4"] },
    { "id": 18, "tasks": ["16.1"] },
    { "id": 19, "tasks": ["16.2"] }
  ]
}
```

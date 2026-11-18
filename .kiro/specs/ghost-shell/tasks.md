# Implementation Plan: ghost-shell

## Overview

This plan builds App 1 of Ghost Run+: the world package `worlds/playground-shell/` (`@ghost-run/playground-shell`, runtime dependencies `@ghost-run/core` and `sql.js` only) and the static web app `apps/ghost-shell/` (`@ghost-run/ghost-shell`). All code is TypeScript (the design uses TypeScript throughout). Tests use `vitest` and `fast-check`. Host code targets Node.js 20 or later.

The plan follows the implementation order of the design:

1. The additive `core` change (`'unsupported-step'` in `WardNotice.kind`). It is the first task and runs alone.
2. The structure steering update and the scaffold of the world package.
3. Early verification tasks that actually run the design's unverified claims: `sql.js` under Node and jsdom, a `worker_threads` watchdog timeout, the Vite build with the wasm file and the browser build of `yaml` through `wards-config`, and the dist check script. Measured results are recorded in `docs/measurements.md`.
4. The world: state, virtual paths, file systems, diff, scene, fingerprint, the journal oracle, the SQL executor and watchdog, tokenizer, parser, interpreter, command handlers, and the world adapter, each with its property tests.
5. The `verifyWorld` contract run with its time measurement against the 45 s guard and the 60 s save-time budget, and a world checkpoint.
6. The app: pipeline (claims, verdict floor, `runPlayground`), scenario fixtures built from code points, scenario tests, the Plan_File codec, plan files, the wards editor, the Graveyard, the page state, the screens, the static build with the CSP `_headers` file, and the documentation.
7. Repository hygiene tests, the isolated task that adds import bans to `core`, `ui`, and `wards-config`, and the final checkpoint.

### Cross-spec dependencies and wave order

- **Waves 0 to 9 (tasks 1 to 8) need no implementation of `ui-kit` and no `ui` package.** Tasks 3.3 and 3.4 need the `wards-config` implementation: the default entry point of `@ghost-run/wards-config` without any Node built-in, and file reading in the subpath `@ghost-run/wards-config/node` (the split of `wards` spec task 6). Task 3.3 states this and fails fast when it does not hold.
- **Waves 10 and later (tasks 9 to 17) depend on the `ui-kit` implementation**: the `@ghost-run/ui` package exists, its notice-kind type is widened so that it accepts `WardNotice.kind` of `core` as is (including `'unsupported-step'`), and `escapeForDisplay` and `isHiddenDisplay` are exported from its public entry. Task 9.1 probes these facts with a compile-time and run-time test. If a fact does not hold, implementation of this spec stops and reports the dependency; it never declares a second notice-kind type or a second display escaper (Requirements 1.11, 6.10).
- The `ui-kit` tasks.md at the time of writing contains no task that widens the notice-kind type of the kit. That widening must be added to the `ui-kit` plan and finished before wave 10. This plan does not edit any other spec.
- Task 1.1 edits `core`. Task 17.2 edits `core`, `ui`, and `wards-config` configuration. Each of them must not run at the same time as any other task that edits `core/` in this spec or in another spec (`possession`, `wards`, `ghost-runner`, `ui-kit` task 13.1, and so on).

### Decisions reflected in this plan

1. **D6.** The command parser is written in this package; `shell-quote` is not installed.
2. **D13 to D16.** `fingerprint()` returns the implemented `FingerprintResult`; the live state is stored deeply frozen and the P1 test includes a mutation test with a deliberately broken world; every `sqlite3` batch goes through the executor (a Web Worker with a 5 s watchdog in the browser); the app is hosted on its own static site without COOP or COEP headers.
3. **No shared test files across waves.** Each property test lives in its own file. Shared helpers are created by one task and only read by later tasks.
4. **The default wards file.** `apps/ghost-shell/wards.yaml` is created once, in task 3.3, with the three-ward content of `wards` Requirement 18, criterion 2. No second copy exists.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: ghost-shell, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` with `numRuns: NUM_RUNS` from `tests/pbt-config.ts`, and prints the seed on failure. The numbering and titles are those of the Correctness Properties section of `design.md`. The labels `GS-P1` to `GS-P6` are used only for Properties 1 to 6 (Requirement 19, criterion 8) and never for P1 to P8 of the safety contract or `UI-P1` to `UI-P11`. The contract properties are titled `contract P1`, `contract P2`, and `contract P3` in test names.
- **Run sizes.** A Short_Run uses `NUM_RUNS = 100` and a per-file timeout of 60,000 ms. A Nightly_Run (`GHOST_PBT_MODE=nightly`) uses `NUM_RUNS = 10,000` and no timeout. `tests/pbt-config.ts` is a copy of `core/tests/pbt-config.ts` in both packages. Every property of this plan runs at least 100 generated examples, and none is lowered to fit a time budget.
- **No optional tasks.** Every task in this plan is required, including unit tests, example tests, property tests, integration tests, scan tests, and measurement tasks. No task carries the optional `*` marker.
- **Test data.** Canary values only (`sk-CANARY-` followed by generated characters from `[A-Za-z0-9_-]`). Hostnames only from `.example`, `.test`, `.localhost`, `.invalid`, `registry.npmjs.org`, and the documentation range `192.0.2.x`. Hidden Unicode characters and the HTML comment opener are never written literally in any file under `apps/ghost-shell/`, `worlds/playground-shell/`, or `.kiro/specs/ghost-shell/`; tests and builders use `\u` escapes or `String.fromCodePoint`.
- **Purity.** No file under `worlds/playground-shell/src` or `apps/ghost-shell/src/pipeline` reads a clock, a random source, an environment variable, storage, or the network. The world package has no DOM, no `Worker`, and no Vite-only feature.
- **No LLM calls** anywhere in the code, tests, or scripts.
- **Measurement records.** Measured results go to `docs/measurements.md` as one appended section per measurement task (each such task is in its own wave, so no two tasks edit the file at once), and to the README note named in the task.
- **Verification commands.** `pnpm --filter @ghost-run/playground-shell test`, `pnpm --filter @ghost-run/ghost-shell test`, `pnpm --filter <package> typecheck`, `pnpm --filter <package> lint`, and `pnpm --filter @ghost-run/ghost-shell build`, with `GHOST_PBT_MODE=nightly` for the Nightly_Run.
- **Scope of this plan.** Coding tasks only. The Docker box, the Kiro hooks, the MCP server, the recording hook (`ghost-log`), the UI kit components, and the ward engine are other specs. This plan edits no other spec's file and, apart from task 1.1, the steering update of task 2.1, and the lint bans of task 17.2, edits no code outside `worlds/playground-shell/` and `apps/ghost-shell/`.

## Tasks

- [ ] 1. Additive core change (first task, runs alone)
  - [x] 1.1 Add `'unsupported-step'` to `WardNotice.kind` in `core/src/types.ts`
    - **This task must complete before any other task of this spec starts, and it must NOT run at the same time as any other task that edits `core/`, in this spec or in another spec (`possession`, `wards`, `ghost-runner`, `ui-kit` task 13.1).** Before starting, confirm that no other core-editing task is in progress and that the `core` test suite passes.
    - Add the one string `'unsupported-step'` to the `WardNotice.kind` union. Change no existing kind, no field, and no verdict logic. `WardEngine.evaluate` never produces this kind; only the app pipeline does.
    - Add a compile-time assertion to `core/tests/types.test-d.ts` that `'unsupported-step'` is assignable to `WardNotice['kind']` and that the existing kinds still are. Add one runtime example test (in a new file `core/tests/notice-kind.test.ts`) that builds a `WardVerdict` with a notice of that kind and passes it through `renderMessage`, and checks that the message output equals the output for the same verdict without the notice except for the notice line the message builder already prints for any notice.
    - Run the whole `core` suite, `tsc --noEmit`, and eslint for `core`. Confirm the existing tests pass unchanged and `core/package.json` is unchanged.
    - _Requirements: 1.10, 6.8_

- [x] 2. Steering update and world package scaffold
  - [x] 2.1 Update `.kiro/steering/structure.md` for the new dependency direction
    - Edit the Dependency Direction section so that `apps/*` may depend on `worlds/*`, `ui/`, `wards-config/`, and `core/`, and add a line that `worlds/*` may depend on `core/` only (plus its own runtime libraries such as `sql.js`). Keep every other rule. Keep the file free of hidden Unicode and of HTML comment openers (the `blacklight-steering` hook runs on save).
    - This task completes before any file of `apps/ghost-shell/` imports `worlds/playground-shell/` (task 3.3 onward).
    - _Requirements: 1.9_

  - [x] 2.2 Create the `worlds/playground-shell/` package scaffold
    - Confirm `pnpm-workspace.yaml` lists `worlds/*` (the design verified that it does); edit it only if the entry is missing.
    - Create `package.json` (name `@ghost-run/playground-shell`, `private`, `type: module`, `main` and `types` at `src/index.ts`, `engines.node >=20`, scripts `test`, `test:nightly`, `typecheck`, `lint`). `dependencies` are exactly `@ghost-run/core` (`workspace:*`) and `sql.js` pinned to `1.16.0`. Dev dependencies: `typescript ^5.9.0`, `vitest ^3.2.7`, `fast-check ^4.10.2`, `jsdom ^26.1.0`, `eslint ^10.15.0`, `typescript-eslint ^8.73.0`, `@types/node ^20.19.0`. Do not add `shell-quote` or `@types/sql.js`.
    - Create `tsconfig.json` (strict), `vitest.config.ts` (node environment by default; the jsdom smoke test uses a `// @vitest-environment jsdom` docblock), and `eslint.config.mjs` with `no-restricted-imports` that allows only `@ghost-run/core`, `@ghost-run/core/verify` (tests only), and `sql.js` as package imports and bans `wards-config`, `@ghost-run/ui`, `apps/**`, `react`, `three`, `@mujoco/mujoco`, `integrations/**`, and `@ghost-run/ghost-runner`; plus `no-restricted-syntax` and `no-restricted-properties` for `eval`, `new Function`, `Date.now`, `new Date`, and `Math.random` in `src/**`.
    - Create `src/sql-js.d.ts` declaring only the six `sql.js` APIs used (`initSqlJs`, `Database` constructor with optional bytes, `exec`, `run`, `export`, `close`), `src/index.ts` (empty public entry for now), `tests/pbt-config.ts` (copy of `core/tests/pbt-config.ts`), and `tests/support/setup.ts`, which assigns `webcrypto` from `node:crypto` to `globalThis.crypto` when `globalThis.crypto.subtle` is missing.
    - Run `pnpm install`. Record the license of `sql.js` read from the installed `package.json` (expected MIT) in the package README stub `README.md` (title and the line `Dependencies and licenses are listed in the repository README.`); the full table is written by task 16.2.
    - Run `pnpm --filter @ghost-run/playground-shell exec tsc --noEmit` and eslint. Confirm no change in `core/`.
    - _Requirements: 1.2, 1.4, 1.8, 19.4_

- [x] 3. Early verification of the design's unverified claims
  - [x] 3.1 Verify `sql.js` under Node and jsdom and record the facts
    - Create `worlds/playground-shell/tests/sql-smoke.test.ts` (node) and `tests/sql-smoke-jsdom.test.ts` (with the `// @vitest-environment jsdom` docblock). Initialize the real `sql.js` 1.16.0 build (no mock). Assert and record: (1) `initSqlJs` loads the wasm file under Node and under jsdom in Vitest 3.2.7; (2) an empty `new SQL.Database()` exports 0 bytes or non-zero bytes (record which; if non-zero, note that the rule "create the file only when the export is non-empty" becomes "create the file only when a statement wrote", Unverified item 2); (3) a database built twice from the same fixed SQL (a `WITH RECURSIVE` insert of 1,206 rows plus a second table) exports equal bytes; (4) `crypto.subtle.digest('SHA-256', ...)` works in the jsdom test after `tests/support/setup.ts`; (5) `ArrayBuffer.isView(new Uint8Array(4))` is true in jsdom for a value created in the test and for a value returned by `structuredClone`, and whether `instanceof Uint8Array` differs across realms (record the result); (6) `PRAGMA page_size` and `PRAGMA max_page_count` work as the design uses them.
    - Append one entry to `docs/measurements.md` (a new section, in English) with the results and the exact versions of `sql.js`, `vitest`, and `jsdom` read from the installed packages.
    - If any claim fails, state the fallback in the measurements section (as the design allows) and adjust only the affected later task text in this plan; do not edit `design.md`.
    - _Requirements: 2.1, 3.8, 5.8, 20.6_

  - [x] 3.2 Verify a `worker_threads` watchdog timeout with real `sql.js`
    - Create the plain JavaScript test-support file `worlds/playground-shell/tests/support/sql-worker.mjs` (Node 20 cannot load TypeScript in a worker). It initializes `sql.js`, receives `{ id, request }` messages, runs the statements with `db.exec`, and answers `{ id, response }` messages; it holds no other logic yet.
    - Create `tests/worker-threads-spike.test.ts`: spawn a `worker_threads` `Worker` on that file, send the recursive count query `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;`, race it against a real `setTimeout` of 300 ms, call `worker.terminate()` when the timer wins, and assert the timer won and the `terminate` promise resolved. Then spawn a fresh worker and assert `SELECT 1` answers. Record the elapsed real time.
    - This task proves that the terminate-and-respawn path works with real `sql.js` before the watchdog is written (task 5.2 reuses `sql-worker.mjs`).
    - Append one entry to `docs/measurements.md` (a new section) with the measured wait and the Node version. This task and task 3.1 are in different waves so the file is not edited at the same time.
    - _Requirements: 5.12, 20.6_

  - [x] 3.3 Scaffold the app build and verify the Vite build with the wasm file and the browser build of `yaml`
    - **Depends on the `wards-config` implementation** (the default entry point has no Node built-in and the subpath `@ghost-run/wards-config/node` holds `loadWardsFile`; `wards` spec task 6). **This task does not need the `ui-kit` implementation.** If `import { parseWards, printWards, formatConfigError } from '@ghost-run/wards-config'` cannot be bundled for the browser, stop and report the dependency; do not add a second YAML parser (Requirement 1.11).
    - Requires task 2.1 (steering) and task 5.1 (it imports `handleSqlRequest` from the world package entry).
    - Create `apps/ghost-shell/` with `package.json` (name `@ghost-run/ghost-shell`, `private`, `type: module`; runtime dependencies `@ghost-run/core`, `@ghost-run/wards-config`, `@ghost-run/playground-shell` (all `workspace:*`), `sql.js` `1.16.0`, `react ^19.3.1`, `react-dom ^19.3.1`; the `@ghost-run/ui` dependency is added by task 9.1; dev dependencies per the design table), `tsconfig.json` (strict, `jsx: react-jsx`), `vite.config.ts` (`base: './'`, `build.outDir: 'dist'`, `emptyOutDir`, `target: 'es2022'`, `assetsInlineLimit: 0`), `vitest.config.ts`, `eslint.config.mjs` (same ban list as the world package plus `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, storage globals, and imports of `@ghost-run/ghost-runner`, `@ghost-run/ghost-hand`, `three`, `@mujoco/mujoco`, `integrations/*`, and the subpath `@ghost-run/wards-config/node`), `index.html`, a minimal `src/main.tsx`, `src/sql-js.d.ts`, `public/_headers` (CSP text of the design; task 15.1 verifies it), and the default wards file `apps/ghost-shell/wards.yaml` with the three-ward content of `wards` Requirement 18, criterion 2 (`protect-data`, `no-data-loss`, `no-secret-egress`).
    - Create `src/sql-worker/worker-entry.ts` (initializes `sql.js` with `locateFile` returning the URL from `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`, answers `{ id, request }` messages with `handleSqlRequest`) and `src/sql-worker/worker-runner.ts` (creates the worker with `new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' })`, correlates replies by `id`, `terminate()` calls `worker.terminate()`). A temporary spike line in `main.tsx` imports `parseWards` and parses the bundled wards text.
    - Run `pnpm --filter @ghost-run/ghost-shell build`. Assert by script: `dist/assets` holds a worker chunk and a `.wasm` file whose name is referenced from a JS file; no JS file contains a `node:` specifier; the bundle contains the `yaml` parser. If the `?url` pattern fails, apply the design fallback (copy the wasm file into `public/` and use a fixed same-origin `locateFile`) and record it.
    - Write `tests/build/build-smoke.test.ts` that runs the build and re-asserts the same facts (node environment, build run once per file in `beforeAll`).
    - Append one entry to `docs/measurements.md` (a new section) with the resolved `vite`, `@vitejs/plugin-react`, `vitest`, and `jsdom` versions, the wasm file name and size, the result of the `?url` pattern, and the `yaml` browser build result.
    - _Requirements: 1.1, 1.3, 1.6, 1.7, 1.11, 2.1, 2.2, 2.8, 15.3_

  - [x] 3.4 Create `apps/ghost-shell/scripts/check-dist.mjs` and run it on the real build
    - **Depends on task 3.3** (a real `dist/`). Node 20, no dependencies. The script exits 1 with one line per finding when: an `.html` file references a script, link, image, iframe, form action, or base whose value has a scheme or begins with `//` (other than `data:`); a `.css` file has an `@import` or `url(...)` target with a scheme or leading `//` (other than `data:`); any text file (`.html`, `.js`, `.mjs`, `.css`, `.json`, `.webmanifest`) contains an `http://` or `https://` URL whose host is not in the allowlist; a `.js` file contains a `node:` specifier or a worker `new URL(...)` target that is not relative; `dist` has no `.wasm` file, the `.wasm` name is not referenced from a JS file, or `_headers` is missing. It prints the sorted list of allowed hosts and strings it saw.
    - Create `scripts/dist-url-allowlist.json` with two kinds of entries, each with a reason: hosts (every host with a reserved suffix `.example`, `.test`, `.localhost`, `.invalid`, plus `registry.npmjs.org`) and exact strings (the XML namespace identifiers of the design, and each vendor URL string reviewed on the first run). Findings of the resource kinds (HTML and CSS references) have no allowlist.
    - Run `pnpm --filter @ghost-run/ghost-shell build && node scripts/check-dist.mjs` on the real build of task 3.3. List every vendor string it flags, review each once, and add it with a reason (Unverified item 3).
    - Write `tests/scripts/check-dist.test.ts` (node) over generated dist trees in a temporary directory: a tree with only relative references and allowlisted strings passes; adding a CDN `<script>`, a CSS `@import`, a Google Fonts `url()`, a `fetch('https://...')` string with a non-allowlisted host, a protocol-relative URL, a `node:` import, a missing `.wasm`, or a missing `_headers` fails with a message that names the file.
    - Add the script `test:dist` (`vite build` then `node scripts/check-dist.mjs`) to `package.json`.
    - Append one entry to `docs/measurements.md` (a new section) with the reviewed vendor strings. This task is in a different wave from tasks 3.1, 3.2, and 3.3.
    - _Requirements: 2.1, 2.2, 2.4, 2.8, 1.7_

- [x] 4. World state, virtual paths, file systems, diff, scene, and fingerprint
  - [x] 4.1 Create the types, limits, state helpers, Trace builder, and virtual path function
    - `src/state.ts`: `VirtualPath`, `Entry`, `PlaygroundState`, `PlaygroundAction`, `VirtualProject`, `PlaygroundOptions`, and the helpers `cloneState` (uses `structuredClone`), `freezeState` (records frozen deeply), `copyBytes`. Never test `instanceof Uint8Array`; use `ArrayBuffer.isView` (or the result recorded by task 3.1).
    - `src/shell/limits.ts` with one constant each: `COMMAND_MAX` 4096, `LINE_COMMANDS_MAX` 64, `ACTION_COMMAND_BUDGET` 256, `NPM_DEPTH_MAX` 4, `OUTPUT_MAX` 4096, `ENTRIES_MAX` 2000, `FILE_MAX` 1 MiB, `TOTAL_MAX` 16 MiB, `PAYLOAD_MAX` 65536, `SECRET_FILES_MAX` 16, `SECRET_FILE_MAX` 65536, `WATCHDOG_MS` 5000, `PLAN_MAX` 50, `PLAN_FILE_MAX` 1 MiB, `WARDS_TEXT_MAX` 262144, `GRAVEYARD_MAX` 200.
    - `src/trace.ts`: `StepRecord`, `Trace`, `TraceBuilder` (starts from a previous Trace, appends steps and events, dedupes events per `(stepIndex, destination)` and `(stepIndex, path)`, assigns `evt-<n>` ids from the count of payload-carrying events already in the Trace, merges a second request to the same destination into the first payload cut at 65,536 bytes, tracks `watchdogFired` and `readCoverage`), and the output truncation helper (4,096 code points then `[truncated]`).
    - `src/vfs/path.ts`: `toVirtualPath(arg, cwd)` as in the design (a leading `~` fails; an absolute argument is taken relative to the project root; a lexical walk fails when `..` climbs above the root; the canonical form comes from core `normalizePath`).
    - `tests/support/arb-project.ts`: generators for `VirtualProject` (directories, files with small byte content, one optional database entry with a `tables` map) and for path arguments. Later tasks only import this file.
    - Write example tests for `toVirtualPath` and the Trace builder (dedupe, id counter, payload merge, truncation marker).
    - _Requirements: 3.2, 3.4, 3.11, 3.12, 3.13, 4.1, 4.3, 7.3, 7.6_

  - [x] 4.2 Write property test for virtual paths
    - **Property 13: Paths cannot leave the project**
    - **Validates: Requirements 4.3**
    - File `tests/prop-13-paths.test.ts`. Generators: path arguments from segments including `.`, `..`, empty segments, `~`, and a leading `/`, and generated `cwd` values.

  - [x] 4.3 Implement `MutableFs`, `StateFs`, `diffStates`, `renderScene`, and the fingerprint
    - `src/vfs/mutable-fs.ts`: the `MutableFs` interface (`get`, `list`, `walk`, `putFile`, `putDir`, `remove`, `mark`, `rollback`), `LimitError`, and `StateFs` over a cloned record, enforcing 2,000 entries, 1 MiB per file, and 16 MiB in total, with code-point ordered listing.
    - `src/vfs/diff.ts`: `diffStates(before, after)` with the table of the design (`file-created`, `file-deleted` with `entryType`, `file-overwritten` with `sizeBefore` and `sizeAfter`, a directory-to-file swap as delete then create, `sql-row-count` per table only for a database file present at the same path before and after, `dropped: true` with `rowsAfter: 0` for a vanished table, nothing for a new table, nothing for equal bytes), sorted by `path` in `compareCodePoints` order with the kind tie-breaker. Never emit `symlink-changed`.
    - `src/vfs/scene.ts`: `renderScene(state, projectName)` returning `{ project, files: [{ path, type, size }], databases: [{ path, tables: [{ name, rows }] }] }`, sorted, with no bytes and no content.
    - `src/vfs/fingerprint.ts`: SHA-256 manifest per entry (`sha256(kind + 0x00 + bytes)` for files, `sha256('dir')` for directories) and `hash` over `path 0x00 entryHash 0x0A` lines in `compareCodePoints` order, using `globalThis.crypto.subtle`; returns the implemented `FingerprintResult`.
    - Write example tests per diff row, per limit, and for rollback.
    - _Requirements: 3.6, 3.7, 3.8, 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 4.4 Write property test for scene, state, and fingerprint
    - **Property 19: Scene, state, and fingerprint**
    - **Validates: Requirements 3.7, 3.8, 3.10, 3.11**
    - File `tests/prop-19-scene-fingerprint.test.ts`. Uses `tests/support/arb-project.ts`. Checks the JSON round trip of `renderScene`, absence of bytes, `structuredClone` equality, equal hashes for equal states, and a changed hash for a one-byte change.

  - [x] 4.5 Implement `JournalFs`, the independent change oracle
    - `src/vfs/journal-fs.ts`: `JournalFs` implements `MutableFs` over a clone of the starting state and an operation list `{ op: 'put' | 'remove', path, kind, bytes? }`; `changes()` takes, for each touched path, the first recorded "before" and the last "after", classifies them with its own small decision table, sorts them, and derives `sql-row-count` Changes from the `tables` values it saw. A rollback truncates the operation list. It does not import `diffStates`.
    - Write `tests/journal-independence.test.ts`: assert by reading the two source files that `journal-fs.ts` and `diff.ts` do not import each other, and example tests that `JournalFs.changes()` equals `diffStates` on hand-written operation sequences (create, overwrite, delete, move, directory delete, row-count change).
    - _Requirements: 10.2_

- [x] 5. SQL executor and watchdog
  - [x] 5.1 Implement the SQL executor core, screening, and output format
    - **Depends on task 3.1** (the recorded `sql.js` facts).
    - `src/sql/executor.ts`: `SqlRequest`, `SqlResponse`, `SqlExecutor`, `SqlRunner`. `src/sql/handle.ts`: `handleSqlRequest(SQL, request)` as in the design (fresh database per call, `PRAGMA max_page_count` set to `floor(1 MiB / page_size)`, statements executed, `sqlite3`-like output formatting, table names and `count(*)` from `sqlite_master` excluding views and `sqlite_%` tables, bytes exported, database closed, a SQL error returned as `{ ok: false, stderr: 'Error: <message>' }` with nothing written). `src/sql/format.ts`, `src/sql/inline.ts` (`InlineSqlExecutor`, `initInlineSql()`), and `src/sql/screen.ts` (`screenSql(sql)`: skips string literals and comments, lower-cases identifiers, and returns the first reason among `ATTACH`, `DETACH`, `load_extension`, a leading `.`, `vacuum` followed by `into`, `max_page_count`, the clock and random functions of the design, and a string literal equal to `now` in any case).
    - Update `src/index.ts` to export the SQL API (`handleSqlRequest`, `createWatchdogExecutor` placeholder is added by task 5.2, `InlineSqlExecutor`, `initInlineSql`, the types), because the app worker entry imports it from the package entry.
    - Write example tests: output formatting, `NULL` and blob rendering, error text, table counts, determinism of two calls, and every screening reason in lower, upper, and mixed case.
    - _Requirements: 5.8, 5.9, 5.12, 20.6_

  - [x] 5.2 Implement the watchdog executor and its tests
    - **Depends on tasks 5.1 and 3.2.**
    - `src/sql/watchdog.ts`: `TimerPort` and `createWatchdogExecutor({ spawn, timeoutMs = 5000, timers })` returning `SqlExecutor & { dispose() }`. A call lazily spawns a runner, starts the timer, races the runner against it, and on timeout calls `runner.terminate()`, drops the runner, and resolves `{ ok: false, stderr: 'sql statement exceeded the watchdog', watchdog: true }`. A late reply from a terminated runner is ignored; a `settled` flag makes exactly one outcome win; success clears the timer.
    - Write `tests/watchdog.test.ts` (deterministic): a fake `SqlRunner` whose promise never settles and a manual `TimerPort` with `advance(ms)`. `advance(4999)` leaves the call pending, `advance(1)` settles it with the watchdog error, `terminate` is called once, the next call spawns a new runner, a late reply is ignored, and a runner that answers before the deadline settles with its answer and clears the timer.
    - Write `tests/watchdog-worker.test.ts` (integration, one test): a `worker_threads` runner over `tests/support/sql-worker.mjs` with real `sql.js`, `timeoutMs: 300`, the recursive count query, expecting the watchdog error and then a working second call (`SELECT 1`) on a fresh worker.
    - Update `src/index.ts` to export `createWatchdogExecutor` and `TimerPort`.
    - _Requirements: 5.12, 8.5, 20.6_

- [x] 6. Shell parser, interpreter, and command handlers
  - [x] 6.1 Implement the tokenizer, the parser, and the `fnmatch` helper
    - `src/shell/tokenize.ts`: one pass over code points with the unquoted, single-quoted, and double-quoted states; tokens `word` (`{ text, quoted, glob }`), `op` (`;`, `&&`, `>`, `>>`), and `bad(reason)` for pipes, `||`, `&`, `<`, `<<`, parentheses, braces, `$` outside single quotes, backticks, unquoted `#` at a word start, a digit-only word glued to `>`, `&>`, newline, trailing backslash, unterminated quote, and NUL, with fixed short reasons. It never throws and never executes anything.
    - `src/shell/parse.ts`: split at `;` and `&&` into `SimpleCommand { words, redirect?, connector, unsupportedReason? }`; `unsupportedReason` for a bad token, an unquoted glob word, more than one redirect, a redirect without a target, no words, an empty segment, a trailing `&&`, more than 64 simple commands, or more than 4,096 code points; a trailing `;` is allowed.
    - `src/shell/fnmatch.ts`: iterative basename glob (`*`, `?`, `[abc]`, `[!abc]`), no regular expression.
    - Write table-driven example tests for each token and reason, quoting, and `fnmatch`.
    - _Requirements: 5.2, 5.10, 6.1, 19.4_

  - [x] 6.2 Implement `runLine` and the file-system command handlers
    - `src/shell/interpret.ts`: `RunEnv`, `LineResult`, and `runLine(line, env)` with the semantics of the design (left to right; `&&` skips when the last exit code is not 0; the first unsupported segment ends the line with exit 127 and `unsupported: <reason>`, effects of earlier commands stay; a command budget of 256 per action with the reason `command budget exceeded`; a mark before the line and a rollback to it on `LimitError` with exit 1 and `limit exceeded: <name>`; redirects `>` and `>>` through `toVirtualPath`, truncating before the command runs, writing stdout after).
    - `src/shell/commands/`: `pwd`, `ls` (`-a`, `-l`, several paths with headers), `cat`, `echo` (`-n` only), `mkdir` (`-p`), `touch`, `rm` (`-r`, `-f`, `-rf`, `-fr`; refuses `.`, `/`, root), `mv`, `cp` (`-r`), `find` (`-name`, `-print`, `-delete`, post-order, `-delete` followed by another expression unsupported, `find` without a path unsupported), `true`, `false`. Each handler validates its option list against the table of Requirement 5.3 and returns the reserved `UNSUPPORTED(reason)` for anything else, so the decision is in one place per command. The handlers receive file reads only through `env.trace.recordRead` (a stub that does nothing until task 6.5 fills the choke point; handlers call it already).
    - Create `tests/support/arb-commands.ts` with the generator of supported command lines over a generated project (used by later property tasks).
    - Write table-driven example tests per command and option, including the unsupported option sets (Requirement 5.10) and exit codes 0, 1, and 127.
    - _Requirements: 4.1, 4.3, 5.1, 5.2, 5.3, 5.10, 5.11, 6.1, 6.2_

  - [x] 6.3 Write property test for connector semantics
    - **Property 11: Connector semantics**
    - **Validates: Requirements 5.2**
    - File `tests/prop-11-connectors.test.ts`. Generator: lines built from `true`, `false`, and `echo <word>` joined by `;` and `&&`, checked against a small reference evaluator written in the test.

  - [x] 6.4 Write property test for limits and output truncation
    - **Property 21: Limits and output truncation**
    - **Validates: Requirements 4.1, 5.11**
    - File `tests/prop-21-limits.test.ts`. Generators: plans that exceed 2,000 entries, 1 MiB per file, or 16 MiB in total (built from `mkdir -p`, `echo >>` loops with generated sizes kept within test time), and commands with generated output length. The test uses reduced fixtures by passing the limits through the `StateFs` constructor only where the design allows a limit parameter; otherwise it uses real limits with a small number of large steps.

  - [x] 6.5 Implement the `trace.recordRead` choke point, effects, and the `sqlite3`, `curl`, and `npm` handlers
    - **Depends on tasks 5.1 and 6.2.**
    - `env.trace.recordRead(path)` is the only way a handler records a secret read: it tests the path against `compilePathSet(secretPatterns, { caseSensitive: false })` from core and appends a `secret-read` event deduped per `(stepIndex, path)`; with no patterns nothing is recorded. Wire it into `cat`, `cp` (source files), `curl -d @`, `curl --data-binary @`, and `sqlite3`.
    - `src/shell/commands/sqlite3.ts`: open or create the file, call `screenSql`, call the executor, write bytes and `tables` back only when the bytes differ, start a missing file as an empty database, fail with `file is not a database` without touching the file, exit 1 for a directory, turn `watchdog: true` into exit 1, `StepRecord.watchdog`, and `Trace.watchdogFired`.
    - `src/shell/commands/curl.ts`: options `-s`, `-X`, `-d`, `-d @file`, `--data-binary @file`, and one URL operand with scheme `http` or `https` and a non-empty host (otherwise unsupported). Order of effects as in the design: read the `@file` body (missing file exits 26 with no event; a secret match records `secret-read` first), record the `network-attempt` with `destination` `<lowercase host>:<port>`, attach the body as payload, print `network unavailable in the ghost`, exit 7, change no file.
    - `src/shell/commands/npm.ts`: `npm test`, `npm run <script>` (name pattern `^[A-Za-z0-9:_-]{1,64}$`), `npm install`, `npm i`, `npm ci`. Read `package.json` from the project root; `package.json unreadable` and `Missing script: <script>` exit 1 and are not unsupported; `pre<name>` or `post<name>` makes the step unsupported; the script text runs through `runLine` with `depth + 1` (at depth 4 unsupported); `install`, `i`, `ci` record a `network-attempt` to `registry.npmjs.org:443`, change no file, and exit 1 with `network unavailable in the ghost`.
    - `src/shell/effects.ts`: `effectsOutside(a)` parses the line and returns one `{ kind: 'network', destination: <URL as written> }` per word matching `^[A-Za-z][A-Za-z0-9+.-]*://` in each supported simple command, `[]` for an unsupported command or a line without a URL.
    - Register the three handlers in the dispatch table of `src/shell/interpret.ts`.
    - Write example tests per handler, including `npm install` recording `registry.npmjs.org:443` and the error texts.
    - _Requirements: 3.9, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.12, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 6.6 Write property test for network attempts and payloads
    - **Property 14: Network attempts and payloads**
    - **Validates: Requirements 7.1, 7.2, 7.6, 7.7**
    - File `tests/prop-14-network.test.ts`. Generators: `http` and `https` URLs with hosts in any case and optional ports, request bodies of generated length (including above 65,536 bytes), missing `-d @file`, and non-http URLs.

  - [x] 6.7 Write property test for secret-read recording
    - **Property 15: Secret reads are recorded by pattern, once per step**
    - **Validates: Requirements 7.3, 7.4, 7.5**
    - File `tests/prop-15-secret-reads.test.ts`. Generators: projects, secret pattern sets (including the empty set), and the commands `cat`, `cp`, `curl -d @`, `curl --data-binary @`, and `sqlite3` over existing paths, in `;` and `&&` lines and expanded npm scripts.

  - [x] 6.8 Write property test for npm script expansion
    - **Property 12: npm script expansion equals direct execution**
    - **Validates: Requirements 5.4, 5.5, 11.9**
    - File `tests/prop-12-npm.test.ts`. Generators: script texts of supported commands over a generated project, missing scripts, and unreadable `package.json`.

  - [x] 6.9 Write property test for SQL steps
    - **Property 20: SQL steps**
    - **Validates: Requirements 5.8, 5.9, 5.12**
    - File `tests/prop-20-sql.test.ts`. Uses `InlineSqlExecutor`. Generators: read-only SQL from a SELECT-only grammar on generated databases; SQL text containing each screened word in any letter case; erroneous SQL; whole-file deletes and moves of a database (a `file-deleted` Change, no row-count Change).

  - [x] 6.10 Write property test for identical writes and observation-only steps
    - **Property 10: Identical writes and observation-only steps leave no Change**
    - **Validates: Requirements 3.14, 4.6**
    - File `tests/prop-10-no-change.test.ts`. Generators: file contents and paths for rewrites with `echo >` and `cp` of an identical file; plans made only of `curl` and `npm install` steps.

- [x] 7. World assembly and contract tests
  - [x] 7.1 Implement `createPlaygroundWorld`, the public entry, and the world registration
    - **Depends on tasks 4.3, 5.2, and 6.5.**
    - `src/world.ts`: `createPlaygroundWorld(project, options)` is synchronous, deep-copies and deeply freezes the project as the live state (no method returns a reference to it), and implements `snapshot` (structured clone, id `snap-<n>` from a world-local counter, `result: { success: true }`, an empty Trace stored under the id), `step` (clone, `StateFs`, `runLine` with `stepIndex` equal to the previous Trace's step count, commit, new Trace stored under the new id, result from the last step record; never throws; an internal error becomes an unsupported step with the reason `internal error` and the state of `s` unchanged; an unknown snapshot id is treated as an empty Trace), `diff` (`diffStates`), `render` (`renderScene`), `fingerprint`, `effectsOutside`, `traceOf`, and `metadata: { id: 'playground-shell', deterministic: true }`. A step with a non-zero exit code or an unsupported step has `result: { success: false, error: '<non-empty>' }`; an unsupported step's error is `unsupported: <reason>`.
    - `src/index.ts`: the final public entry (all exports of the design). `world.config.ts`: `{ id: 'playground-shell', deterministic: true, wardsFile: '../../apps/ghost-shell/wards.yaml', create: createPlaygroundWorld }` as a path string only, never an import.
    - Extend `README.md` of the world with the registration exception: the single wards file lives at `apps/ghost-shell/wards.yaml`, so no `worlds/playground-shell/wards.yaml` exists, and the world-contract checklist item is satisfied by this pointer. Add a compile-time test `tests/world-type.test-d.ts` for `const w: World<PlaygroundState, PlaygroundAction> = playgroundWorld`.
    - Write example tests: `snapshot` deep copy independence, `step` leaves the input snapshot unchanged, unique ids, `traceOf` for unknown ids, `effectsOutside` with and without a URL, observation-only steps with an empty `diff`.
    - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 3.10, 3.12, 3.13, 3.14_

  - [x] 7.2 Write property test for no silent pass
    - **Property 3: No silent pass (GS-P3)**
    - **Validates: Requirements 3.5, 5.10, 6.1, 6.2, 6.3, 6.7**
    - File `tests/prop-03-no-silent-pass.test.ts`. Generators: arbitrary strings and command-like strings (pipes, expansions, globs, unknown commands, unknown options, screened SQL words). Checks that `step` never throws, the step is supported or `unsupported: true` with exit 127 and `unsupported: <reason>`, effects before the first unsupported command stay and none after it run, and a failing step has `success: false` with a non-empty `error`. Keep each shrunk counterexample as an example in `tests/regressions.test.ts` (created by this task; later tasks append only in later waves).

  - [x] 7.3 Write property test for the P1 isolation (contract P1) with a mutation test
    - **Property 7: Ghost run never changes reality (contract P1)**
    - **Validates: Requirements 3.3, 9.2, 10.3**
    - File `tests/prop-07-isolation.test.ts`. Generators: projects and plans of 1 to 50 supported and unsupported actions. Also checks that changing one byte or deleting an entry of a snapshot leaves the live fingerprint equal, and that a deliberately broken world (a `step` that mutates the live state) makes the property fail (the test asserts that the assertion rejects).

  - [x] 7.4 Write property test for snapshot immutability and replay (contract P3)
    - **Property 8: Snapshots are immutable and replay is deterministic (contract P3)**
    - **Validates: Requirements 3.4, 10.4**
    - File `tests/prop-08-restore.test.ts`. Generators: projects and plans of 1 to 50 actions.

  - [x] 7.5 Write property test for the ghost diff versus the independent execution diff (contract P2)
    - **Property 9: Ghost diff equals the independent execution diff (contract P2)**
    - **Validates: Requirements 3.6, 4.4, 4.5, 4.7, 4.8, 4.9, 10.1, 10.2, 10.5**
    - File `tests/prop-09-diff.test.ts`. Creates `tests/support/journal-adapter.ts`: a `DeterministicTestAdapter` that re-executes the plan on a clone with `JournalFs` and the same handlers and derives the Changes with `JournalFs.changes()`. Generators: projects and plans of supported commands (no watchdog event). Also checks sorting, the allowed kinds only, and empty `Change[]` for equal states.

  - [x] 7.6 Run `verifyWorld`, measure the run time, and apply the fallback if needed
    - **Depends on tasks 7.2 to 7.5 and 7.7.**
    - Create `tests/support/budget.ts` (records the elapsed time of the contract tests and fails the Short_Run above 45,000 ms) and `tests/verify-world.test.ts` calling `verifyWorld(world, { id: 'playground-shell', deterministic: true, wardSet: <default wards loaded with loadWardsFile in Node-only test code>, testAdapter: journalAdapter, actionArb: supportedActionArb, numRuns: NUM_RUNS })` from `@ghost-run/core/verify`. The world is built from the Scenario 4 neutral project (an `app.db` of 1,206 rows built by `tests/support/neutral-project.ts`, a test-only copy of the fixture recipe: it does not import from the app). `supportedActionArb` draws from the Supported_Command_Set with `sqlite3` at about 10 percent of the draws and SQL from a bounded grammar (`SELECT`, `INSERT`, `UPDATE`, `DELETE` with bounded `WHERE`, no recursion).
    - Run the Short_Run with `time` on the Reference_Machine class of hardware (Apple M1 or comparable) and record: the elapsed time of `verifyWorld` alone, of the whole world suite, and the number of SQL steps executed. Compare with the design estimate (10 to 20 s, near 30 s for the file-save run), the 45 s guard, and the 60 s save-time budget.
    - **Fallback if the measurement exceeds 45 s:** use a smaller fixture (fewer rows in the neutral project's `app.db` for the contract test only) or a lower SQL weight in `supportedActionArb`. Never use fewer than 100 runs. Record which fallback was applied and the new time.
    - Record the results in `docs/measurements.md` and in a "Measured run time" note of `worlds/playground-shell/README.md` (the design says the 60 s estimate was never run). This task is the only task of its wave.
    - Confirm `verifyWorld` resolves without a `VerificationError`. Optionally run the Nightly_Run once and record the elapsed time.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 20.1_

  - [x] 7.7 Write world hygiene and scan tests
    - Create `tests/scan/world-scan.test.ts` (node): the source files of `worlds/playground-shell/` contain no `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `Date.now`, `new Date`, `Math.random`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `fetch`, `XMLHttpRequest`, `WebSocket`, or `console.`; the `package.json` lists exactly the runtime dependencies `@ghost-run/core` and `sql.js`; the installed `vitest` and `jsdom` majors are 3 and 26; no handler imports the byte reader except through `env.trace.recordRead` (scan of `commands/*.ts`); `journal-fs.ts` and `diff.ts` do not import each other; every `http`, `https` host in sources and fixtures uses a reserved suffix or `registry.npmjs.org`.
    - Create `tests/scan/determinism.test.ts`: run the same plan twice with `Date.now` and `Math.random` replaced by functions that throw, requiring equal states, Changes, Step_Records, and events.
    - _Requirements: 1.4, 3.2, 5.1, 10.6, 19.3, 19.4, 19.6_

- [x] 8. Checkpoint - World complete
  - Run `pnpm --filter @ghost-run/playground-shell test`, `typecheck`, and `lint`. Confirm the Short_Run suite finishes within 60 s per file, `core/package.json` and `core/src` are unchanged apart from task 1.1, and the world package has exactly the two runtime dependencies. Ensure all tests pass, ask the user if questions arise.

- [ ] 9. App prerequisites and `ui` wiring
  - [ ] 9.1 Add the `@ghost-run/ui` dependency and probe the cross-spec prerequisites
    - **Depends on the `ui-kit` implementation** (the package `ui/` exists with its public entry; the notice-kind type of the kit inputs is widened; `escapeForDisplay` and `isHiddenDisplay` are exported) **and on the `wards-config` implementation** (task 3.3 already verified the browser entry). Waves 0 to 9 do not need the kit; every task from this one on does.
    - Add `@ghost-run/ui` (`workspace:*`) to `apps/ghost-shell/package.json` and run `pnpm install`. Add `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.2`, `@testing-library/user-event ^14.6.12`, `@types/react ^19.3.0`, `@types/react-dom ^19.3.0`, `@eslint-react/eslint-plugin ^5.30.4`, and `eslint-plugin-react-hooks ^7.1.1` as dev dependencies, and the `dangerouslySetInnerHTML` rule in `eslint.config.mjs` resolved from the installed plugin at load time (throw a clear error when no rule id matches, as the `ui-kit` configuration does).
    - Create `tests/prereqs.test-d.ts` and `tests/prereqs.test.ts`: a type-level assertion that a `WardNotice` of `core` (including `kind: 'unsupported-step'`) is assignable to the notice type that the Candle input accepts; a run-time check that `escapeForDisplay` and `isHiddenDisplay` are exported by `@ghost-run/ui` and that `escapeForDisplay` replaces U+200B with the `<U+200B>` form (built with `String.fromCodePoint`); a check that `@ghost-run/wards-config` resolves to an entry without `node:` imports and that `@ghost-run/wards-config/node` is not imported anywhere under `apps/ghost-shell/src`.
    - If any probe fails, stop and report the missing dependency to the user. Do not declare a second notice-kind type or a second escaper.
    - Record the resolved `@ghost-run/ui` exports used by the app (component names and prop types) at the top of `src/ui-imports.ts`, the single module through which the app imports the kit, so that a kit change touches one file.
    - _Requirements: 1.3, 1.5, 1.7, 6.9, 6.10, 19.5_

- [ ] 10. Pipeline: texts, claims, verdict floor, and `runPlayground`
  - [ ] 10.1 Create the fixed texts and the pure claim, verdict, secret, and step modules
    - **Depends on the `ui-kit` implementation** (task 9.1): `IsolationClaims` and the widened notice type come from `@ghost-run/ui` through `src/ui-imports.ts`.
    - `src/texts.ts`: every fixed string as a constant (the scripted and recorded plan texts, the canary and reserved-domain text, `Docker box (real mode) is not used by this page.`, the blacklight texts, `The plan is empty: add a command first.`, `Ghost run changed reality: this is a bug in the playground.`, `Oldest blocked command dropped (limit 200).`, `The playground failed to run this plan.`, `The SQL engine failed to start.`, `Message the agent receives`, the P2 meaning text, and the rest named by the requirements). The words `sealed` and `isolated` appear in none of them.
    - `src/pipeline/claims.ts` (pure): `p1 = !p1Failed`, `clean = p1 && no unsupported step && !watchdogFired`, `p5 = clean`, `p6 = clean && readCoverage === 'complete'`, the `p2Note`, and `mode: 'playground'` without a `reason`. `src/pipeline/verdict.ts` (pure): the floor and the maximum in `pass < warn < block` order, and the shown `WardVerdict` with the engine violations and notices followed by one `unsupported-step` notice per unsupported step (`unsupported command, not rehearsed.`) and one per watchdog step (`sql statement exceeded the watchdog, not rehearsed.`) in `stepIndex` order. `src/pipeline/secrets.ts`: reads at most 16 files of at most 65,536 bytes matching the secret `PathSet` in code-point order of the path (copies) and zero-fills them on release. `src/pipeline/steps.ts`: the `StepView` projection.
    - Write example tests for each module and for the exact text constants that the requirements pin as literals.
    - _Requirements: 6.4, 6.5, 8.2, 8.5, 8.6, 8.7, 9.1, 9.4, 9.5, 9.6, 9.7, 18.7_

  - [ ] 10.2 Write property test for claim honesty
    - **Property 5: Claim honesty (GS-P5)**
    - **Validates: Requirements 6.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8**
    - File `tests/pipeline/prop-05-claims.test.ts`. Generators: plans mixing supported and unsupported commands run through the pipeline with an injected broken world (fingerprint mismatch) and the real world (fingerprint equal); also covers the `block` verdict and the alert text on mismatch.

  - [ ] 10.3 Write property test for the verdict floor and engine parity
    - **Property 16: Verdict floor and engine parity**
    - **Validates: Requirements 6.4, 8.5, 8.6, 8.7, 15.5**
    - File `tests/pipeline/prop-16-verdict.test.ts`. Generators: engine verdicts, sets of unsupported and watchdog steps, fingerprint outcomes, and generated `GhostReport` values for the Default_Wards_File compared with `WardEngine.evaluate`.

  - [ ] 10.4 Implement `runPlayground`
    - **Depends on tasks 7.1, 10.1, and the `ui-kit` implementation.**
    - `src/pipeline/run-playground.ts` with the ten steps of the design: derive `secretPatterns` from the `egress` Wards, create the world, `fingerprint` before, `snapshot`, read `secretValues`, `ghostRun`, `traceOf` of the last snapshot to fill `observedEvents` and take `payloads`, `fingerprint` after, `WardEngine.evaluate(observed, wardSet, { secretValues, payloads })`, claims, floor, `renderMessage(wardVerdict, { wardCount, claims: { p5, p6 } })` with no Seance_Link, possession (`collectNeedles` and `traceRedThread` when `provenance` is given; the links never touch the verdict), and release (zero-fill `secretValues`, drop `payloads`, replace snapshot states by `render` Scenes). The function reads no clock, random source, or storage, takes `worldFactory` for tests, rethrows on a defect, and returns plain values only.
    - Write example tests: empty WardSet with a clean run renders `GHOST RUN PASSED: all 0 wards cleared.`; `ls | grep x` is unsupported with a `warn` verdict and the notice; `npm install` records `registry.npmjs.org:443`; an executor stub that returns the watchdog response gives the `warn` floor, the notice text, `p5Claimed` and `p6Claimed` false, and the P2 note; an injected broken world gives `block` and the alert text.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 9.1, 9.2, 9.3, 15.1, 15.2_

  - [ ] 10.5 Write property test for pipeline wiring and message
    - **Property 17: Pipeline wiring and message**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - File `tests/pipeline/prop-17-wiring.test.ts`. Uses an engine spy wrapper to capture the arguments passed to `WardEngine.evaluate`. Generators: plans and WardSets.

  - [ ] 10.6 Write property test for the secret and payload leak rule
    - **Property 18: No secret or payload leaves the pipeline**
    - **Validates: Requirements 3.7, 7.8, 8.3, 17.7, 19.6, 20.3**
    - File `tests/pipeline/prop-18-leak.test.ts`. Generators: Canaries (`sk-CANARY-` plus random alphanumeric characters) in `.env`, plans that read and send the file. Serializes the `Playground_Run`, every Scene, the Trace as projected for display, and every `console` call during the run (spied) and checks that neither the Canary nor its base64, hex, or percent-encoded forms appear, except in fixed message text built by `core`; storage APIs are spied and must not be called. Screen markup and Grave_Entries are added to the same property by task 14.3 in a separate file.

  - [ ] 10.7 Write property test for determinism of interpreter, world, and pipeline
    - **Property 2: Determinism of interpreter, world, and pipeline (GS-P2)**
    - **Validates: Requirements 3.2, 5.1, 8.10, 10.6, 11.13**
    - File `tests/pipeline/prop-02-determinism.test.ts`. Generators: projects, plans of supported commands, and WardSets. Runs the plan twice from equal states with `Date.now` and `Math.random` replaced by functions that throw.

  - [ ] 10.8 Write property test for protected paths and secret egress (contract P5 and P6)
    - **Property 22: Protected paths and secret egress on the playground world (contract P5 and P6)**
    - **Validates: Requirements 10.9, 10.10**
    - File `tests/pipeline/prop-22-p5-p6.test.ts`. Uses the Default_Wards_File. Generators: projects with generated protected paths and plans that delete or overwrite them (`rm`, `rm -rf`, `mv` then `rm`, `find ... -delete`, `echo >`, a script-hidden delete via `npm run`); plans that read a secret with `cat`, `cp`, or `curl -d @` followed by a `curl` to a host outside `allow_hosts` at the same or a later step.

- [ ] 11. Scenario fixtures and the five scenarios
  - [ ] 11.1 Build the project fixture and the hidden-instruction README from code points
    - `src/scenarios/project.ts`: `buildProject(sql)` deterministic and clock-free, returning the entries of the design (`package.json` with `scripts.clean` equal to `rm -rf data` and `scripts.test` equal to `echo "all tests passed"`, `data/` with `.keep`, `a.csv`, `b.csv`, `sub/c.json`, `sub/d.json` and explicit directory entries, `build/out.js`, `app.db` generated by running the fixed SQL of the design through the executor with `tables: { orders: 3, users: 1206 }`, `.env` with `API_KEY=sk-CANARY-abc123` as the only secret, and `README.md`). No binary file is committed.
    - `src/scenarios/readme.ts`: `HIDDEN_INSTRUCTION`, `tagEncode` (each printable ASCII code point plus `0xE0000` through `String.fromCodePoint`; throws for a code point outside U+0020 to U+007E), and `buildReadme()` inserting the run at the end of the `Install the dependencies, then build the project.` line. No literal hidden character appears in any file.
    - Write example tests: the generated `app.db` has exactly 1,206 `users` rows (including `deleted_at`) and 3 `orders` rows; two builds yield equal bytes; the README contains the tag run (decoded back to `HIDDEN_INSTRUCTION`) and the source file contains no code point above U+007E; the `.env` holds only the Canary.
    - _Requirements: 11.2, 11.11, 12.1, 19.1, 19.3_

  - [ ] 11.2 Create `scenarios.ts` and the seven plan files
    - **Depends on tasks 11.1 and 12.1** (`parsePlanFile`).
    - Create `apps/ghost-shell/plans/scenario-1.json`, `scenario-1-fixed.json`, `scenario-2.json`, `scenario-2-fixed.json`, `scenario-3.json` (carries `readings: ["README.md"]`), `scenario-4.json`, and `scenario-5.json`, all with `origin: 'scripted'`, valid by `parsePlanFile`, containing exactly the actions of the design's scenario table.
    - `src/scenarios/scenarios.ts`: the five Scenarios with title, plan, fixed plan (Scenarios 1 and 2), and Plan_Origin, importing the plan files with Vite `?raw` and parsing them with `parsePlanFile`, so the page and the tests read one source. For Scenario 3 build the Provenance_Log `[{ source: 'README.md', kind: 'file', content: <fixture README text> }]` from `readings`.
    - Write example tests: each scenario loads, the plan lists have the expected commands.
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 12.2, 13.2, 13.10_

  - [ ] 11.3 Write the scenario tests
    - File `tests/scenarios/scenarios.test.ts` on the pure `runPlayground` (no browser, no Docker) with the Default_Wards_File and `InlineSqlExecutor`:
    - Scenario 1: `block`, first violation of `no-data-loss`, reason `would delete 1,206 rows from users`, the Block_Message equal to the `renderMessage` string (without a Seance_Link) with `wardCount: 3` and both claims true. Fixed plan: `pass`.
    - Scenario 2: `block` by `protect-data`; the expected violation count is derived from the Changes of the run (the count of `file-deleted` Changes under `data/` that match the same `PathSet`), never hard-coded; none for `build/`. Fixed plan: `pass`.
    - Scenario 3: `block` by `no-secret-egress` with the behavior violation (`secret-read` of `.env` and `network-attempt` to `setup-check.example:443` at step 0) and the content violation with Encoding_Kind `raw`.
    - Scenario 4: `pass`, no Change, no event, no notice. Scenario 5: `block` by `protect-data`; the Changes equal the Changes of `rm -rf data` on the same fixture; the violation count derived from the Changes.
    - Each scenario run twice yields structurally equal report, verdict, and message. A timing example: a Scenario run and a plan of 50 supported non-`sqlite3` commands complete in under 1.0 s and 2.0 s of wall time on the test machine (record the measured values in the test output; the thresholds apply on the Reference_Machine).
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.12, 11.13, 11.14, 14.9, 20.4_

  - [ ] 11.4 Write property test for the red thread through hidden text
    - **Property 6: Red thread through hidden text (GS-P6)**
    - **Validates: Requirements 12.1, 12.4, 12.9, 12.10**
    - File `tests/scenarios/prop-06-red-thread.test.ts`. Generators: visible README texts without hidden code points, ASCII destinations of 1 to 60 printable characters, and insertion positions (a code point index). Runs the possession pipeline (`collectNeedles`, `traceRedThread`) and checks a `found` ThreadLink with `hidden: true` and `source: 'README.md'`, and that the Playground_Verdict is unchanged by whether the link was found.

- [ ] 12. Plan file codec and manual input
  - [ ] 12.1 Implement `parsePlanFile`, `printPlanFile`, and `validateCommand`
    - **Depends on the `ui-kit` implementation** (task 9.1): `isHiddenDisplay` comes from `@ghost-run/ui`.
    - `src/plan/plan-file.ts`: `PlanFile`, `PlanParseError`, `parsePlanFile(text)` with the check order of the design (`input-too-large` above 1 MiB first; `invalid-json`; `wrong-type`; `missing-field`; `unknown-field` at the root and inside a provenance record; `unsupported-version`; `out-of-range`; `conflicting-fields`; `invalid-character`), at most 50 errors, fields such as `actions[2].command`, `provenance` re-reported as `provenance[<index>].<field>` through core `parseProvenanceLog`, never throws.
    - `src/plan/print-plan-file.ts`: canonical JSON written by hand with two-space indentation, the key order `format`, `version`, `name`, `origin`, `actions`, `note`, `provenance`, `readings`, a trailing newline, and every code point above U+007E and every Hidden_Display_Code_Point as an uppercase `\uXXXX` escape (a surrogate pair above U+FFFF).
    - `src/plan/validate-command.ts`: `validateCommand(text, planLength)` for an empty command, over 4,096 code points, a control or hidden code point, or a plan above 50 actions; reused by `parsePlanFile` per-field checks.
    - Write example tests: a recorded plan with a hidden instruction printed entirely in ASCII and parsed back; an unknown field rejected with its field path; `\u` escaped tag characters accepted in `provenance` content; no field for a clock value, session id, secret, or payload.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.9, 13.11, 14.3_

  - [ ] 12.2 Write property test for the Plan_File round trip
    - **Property 1: Plan_File round trip (GS-P1)**
    - **Validates: Requirements 13.7, 13.8, 13.9**
    - File `tests/plan/prop-01-roundtrip.test.ts`. Generators: plans of 1 to 50 actions with printable and non-ASCII commands, optional `note`, and either `provenance` or `readings`.

  - [ ] 12.3 Write property test for Plan_File and manual-command validation
    - **Property 23: Plan_File and manual-command validation**
    - **Validates: Requirements 13.3, 13.4, 13.5, 13.6, 14.3**
    - File `tests/plan/prop-23-validation.test.ts`. Generators: valid Plan_Files mutated in one place (unknown field, wrong type, missing field, wrong version, out-of-range count or length, both `provenance` and `readings`, a control or hidden code point in `command`, `cwd`, `name`, or `note`), texts above 1 MiB, and arbitrary strings.

  - [ ] 12.4 Write the scenario plan-file equality test
    - **Depends on task 11.2.**
    - `tests/plan/plans-equal-scenarios.test.ts` (node): each of the seven files of `apps/ghost-shell/plans/` is valid by `parsePlanFile` with `origin: 'scripted'`; the Plan of each Scenario equals the actions of its file; `scenario-3.json` has `readings` and no `provenance`; no file contains a hidden Unicode code point, a literal HTML comment opener, or a non-reserved host.
    - _Requirements: 13.10, 19.1, 19.3_

- [ ] 13. Wards editor, Graveyard, and page state
  - [ ] 13.1 Implement the wards-editor reducer
    - **Depends on the `ui-kit` implementation** (`escapeForDisplay`) and on the `wards-config` implementation.
    - `src/wards/wards-editor.ts` (pure reducer plus effect description): state `{ text, parsed, runId, shown, stale }`; events `edit(text)`, `debounceElapsed`, `runFinished(runId, run)`, `reset`. `edit` stores the text and asks the shell to schedule `debounceElapsed` after 300 ms through an injected `TimerPort` (the same interface as the watchdog; a new edit cancels the timer). `debounceElapsed` calls `parseWards`; `ok: true` increments `runId`, clears `stale`, and requests `runPlayground` with a rebuilt world for the new WardSet; `ok: false` keeps `shown`, sets `stale` (label `stale: wards.yaml has errors`), and exposes at most 50 `formatConfigError` strings through the Display_Escaper with the offending line numbers. `runFinished` applies only the latest `runId`. A re-run caused by an edit never adds a Grave_Entry. The text limit is 262,144 bytes (`input-too-large` shown); `Reset to default` restores the bundled text; the initial text is `apps/ghost-shell/wards.yaml` imported with `?raw`.
    - Write example tests: a parse error then a fix; a text above the limit; reset; debounce with a manual `TimerPort`.
    - _Requirements: 15.2, 15.4, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

  - [ ] 13.2 Write property test for wards edit consistency
    - **Property 4: Wards edit consistency (GS-P4)**
    - **Validates: Requirements 16.3, 16.4, 16.10**
    - File `tests/state/prop-04-wards-edit.test.ts`. **Depends on task 10.4.** Generators: sequences of wards-editor events (edits that parse and edits that do not, debounce firings, and run completions delivered in any order) over generated valid WardSets and the Scenario plans. Also an example test that the bundled text equals the bytes of `apps/ghost-shell/wards.yaml` and that `parseWards` on it equals `loadWardsFile` on the file (Node-only test code).

  - [ ] 13.3 Implement the Graveyard reducer
    - **Depends on the `ui-kit` implementation** (`GraveEntry` type).
    - `src/state/graveyard.ts`: `GraveyardState`, `GraveyardEvent`, `graveyardReducer`. An entry is added only for an explicit user action with `run.verdict === 'block'`; `id` is `g-<n>` (matching `^[A-Za-z0-9_-]{1,64}$`); `command` is the plan commands joined by `; `; `recordedAt` comes from the injected `clock` formatted `YYYY-MM-DDTHH:MM:SSZ` (the world, the interpreter, and `runPlayground` never see it); `wardIds` are the distinct violation ward ids in order of first appearance; `detail` carries `wardVerdict`, `changes`, `claims`, `actionLabels`, and for the possession Scenario `sources`, `needles`, and `links`. At most 200 entries; the oldest is dropped and `dropped` set. No entry contains `secretValues`, a payload, or a file body.
    - Write example tests for each field and the 201st entry.
    - _Requirements: 17.3, 17.4, 17.5, 17.6, 17.7, 17.9_

  - [ ] 13.4 Write property test for the Graveyard reducer
    - **Property 25: Graveyard reducer**
    - **Validates: Requirements 16.6, 17.3, 17.4, 17.5, 17.9**
    - File `tests/state/prop-25-graveyard.test.ts`. Generators: sequences of run events with a verdict and an origin (explicit, edit-caused, `Purify`).

  - [ ] 13.5 Implement the page reducer, the purify action, and the app shell state
    - **Depends on tasks 10.4, 11.2, 12.1, 13.1, and 13.3.**
    - `src/state/reducer.ts`: the page-level reducer owning the selected scenario or `custom`, the current plan with `PlanMeta` (`name`, `origin`, `note`, project name), the wards-editor state, the last `Playground_Run`, the Graveyard, the open seance id, and the purified README text. A manually typed plan starts from the Scenario 4 neutral project and shows the project name. Actions: select scenario, `Run ghost` (empty plan shows `The plan is empty: add a command first.` and does not run), `Apply fixed plan`, `Add to plan`, `Remove step`, `Clear plan`, `Load plan file`, `Download plan file`, `Purify`. `Purify` replaces the README text of the in-memory fixture copy and of the Provenance_Record by `sanitizeText(readme)` and re-scans it; it does not re-run the plan, write a file, or touch the Graveyard. A thrown `runPlayground` keeps the previous run, shows `The playground failed to run this plan.`, and adds no Grave_Entry.
    - Write example tests for each action, the fixed-plan flow from `block` to `pass`, and the empty-plan message.
    - _Requirements: 11.1, 11.10, 12.6, 12.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 17.3, 17.4_

  - [ ] 13.6 Write property test for purify
    - **Property 24: Purify removes hidden text**
    - **Validates: Requirements 12.6**
    - File `tests/state/prop-24-purify.test.ts`. **Depends on task 13.5.** Generators: README texts with hidden runs inserted (tag characters, zero-width characters, bidi controls, an HTML comment), all built from code points.

- [ ] 14. Screens
  - [ ] 14.1 Implement the app shell, scenario bar, plan panel, run panel, and notices
    - **Depends on the `ui-kit` implementation** (`KitRoot`, `Candle` with its claim banner, `MirrorWorld`; a widened notice type) **and on task 13.5.**
    - `src/main.tsx` (injects the system clock and the browser worker executor created with `createWatchdogExecutor({ spawn: () => workerRunner() })`, started at load with an `init` request), `src/App.tsx`, `src/screens/ScenarioBar.tsx`, `PlanPanel.tsx` (numbered list in a monospace font; each step shows the exit code and the text `unsupported`, `failed`, or `watchdog` with an icon; the controls `Command`, `Add to plan`, `Remove step`, `Clear plan`, `Run ghost`, `Apply fixed plan`, `Load plan file` (file input read with `File.text()`, never uploaded), `Download plan file` (Blob created in the page), the Plan_Origin, `name`, `note`, and the scripted and recorded texts), `RunPanel.tsx` (Candle with the Claim_Banner above the Mirror_World, the `Message the agent receives` monospace panel, the `Docker box (real mode) is not used by this page.` text, the P2 meaning text, the alert for a fingerprint mismatch), and `Notices.tsx` (error alerts and fixed notices). Every string from a Plan_File, a command, a Step_Record, a file name, or a Config_Error passes through the Display_Escaper from `src/ui-imports.ts`. The page starts in the `dark` theme with the Lights_Toggle. No `dangerouslySetInnerHTML`, no storage, no `fetch`.
    - Write jsdom example tests (with the docblock) for the Scenario `Run` flow, `Apply fixed plan` moving the Candle from `block` to `pass`, the empty-plan text, a `Load plan file` error alert, and `Download plan file` printing text that parses back.
    - _Requirements: 6.4, 6.6, 8.8, 9.7, 11.1, 11.10, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 15.6, 17.1, 17.2, 17.10, 17.12, 19.5_

  - [ ] 14.2 Implement the possession panel, wards editor screen, and Graveyard panel
    - **Depends on tasks 13.1, 13.3 and 14.1** (they edit `src/App.tsx` in a later wave).
    - `src/screens/PossessionPanel.tsx`: Red_Thread_View with the `Needle` list and `actionLabels` equal to the plan commands, Blacklight_View with the README text and `scanText(readme)` and the Blacklight_Switch, the `Purify` control, the texts `Text analysis does not catch every injection.` and `A secret read followed by an unapproved network attempt is blocked by action, with or without hidden text.`, and the canary text. `src/screens/WardsEditor.tsx`: the `wards.yaml` editor with line-numbered error marks, `Reset to default`, `Download wards.yaml`, errors in an element with the role `alert`, the `stale: wards.yaml has errors` label, the debounce wiring through the injected timer, and the statement that the edit is an in-memory copy. `src/screens/GraveyardPanel.tsx`: the kit `Graveyard` below the Candle with `onOpenSeance`, the Seance_View inside the page (no URL change, no fetch), `Back to graveyard` returning focus to the Tombstone through the kit's focus store, and the drop notice. Wire the three panels into `src/App.tsx`.
    - Write jsdom example tests: the possession flow (red thread to the README line, blacklight on, purify, `No hidden text found by the blacklight.`); a wards edit that fixes a parse error; the Graveyard entry of a blocked run opened by keyboard; loosening a ward so Scenario 1 passes shows the new verdict and no text that calls the ward set safe.
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 16.1, 16.2, 16.3, 16.4, 16.5, 16.7, 16.8, 16.9, 17.1, 17.8, 17.9, 20.4_

  - [ ] 14.3 Write the screen property and example tests
    - **Property 26: Displayed strings are escaped**
    - **Validates: Requirements 14.2, 14.5, 16.5, 19.5**
    - File `tests/screens/prop-26-escaping.test.ts`. Uses `renderToStaticMarkup` of the screen view functions in the node environment (full 100 runs). Generators: commands, step outputs, file names, errors, and Plan_File fields that contain hidden or control code points (built from code points). Checks that the markup contains no literal Hidden_Display_Code_Point and shows the `<U+XXXX>` form.
    - Also create, in separate files under `tests/screens/` (jsdom docblock): `no-network.test.ts` (with `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by functions that throw, except the loading of the bundled wasm from the page origin, Scenarios 1 to 5 run without a call), `no-storage.test.ts` (no `localStorage`, `sessionStorage`, `IndexedDB`, or cookie write), `keyboard.test.ts` (Graveyard opened and closed by keyboard), and `leak-render.test.ts` extending the leak rule of task 10.6 to the rendered markup and every Grave_Entry for a generated Canary (Property 18 is not renumbered; this file carries the tag `Property 18` for the screen leg).
    - _Requirements: 2.3, 2.5, 3.7, 14.2, 14.5, 16.5, 17.7, 19.5, 19.6, 20.3_

- [ ] 15. Static build and headers
  - [ ] 15.1 Finalize the Vite build, the `_headers` CSP, and the dist verification
    - Update `apps/ghost-shell/vite.config.ts` for the final app (worker format `es`, `sourcemap: false`, `modulePreload.polyfill: false`) and verify `public/_headers` contains the design's CSP (`default-src 'none'`, `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, `connect-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. Do not set COOP or COEP.
    - Write `tests/build/dist.test.ts` that builds once and asserts: `dist/_headers` exists and contains `connect-src 'self'` and `default-src 'none'`; `dist/assets` holds the worker chunk and the `.wasm` file; `node scripts/check-dist.mjs` exits 0 on the final build; the bundled text of `wards.yaml` equals the file bytes; the build output contains no `node:` specifier and no reference to another origin.
    - Run `pnpm --filter @ghost-run/ghost-shell test:dist`. The manual browser smoke checks (CSP directives needed by the kit styles, load time within 3.0 s on the Reference_Machine, the worker in a real browser, Scenario 1 shows `block`) are listed in the README by task 16.1 and are not coding tasks.
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7, 2.8, 15.4_

- [ ] 16. Documentation
  - [ ] 16.1 Write `apps/ghost-shell/README.md`
    - **Claims table**: P1, P2, P3, P5, and P6 for the playground world within the scopes of the Introduction, and P4 and P7 as evidence from `core`, `wards`, and `possession`.
    - **P2 meaning statement:** the P2 test compares the diff with an independent change derivation from a journal of the actions; it verifies the diff and the copy isolation and is not a test of fidelity to a real shell; P2 is claimed for the playground world only and is not claimed for shell worlds in real mode.
    - **Unclaimed properties and limits:** P5 and P6 are not claimed for a run that contains an unsupported step or a watchdog event; P1 and the Docker-box claims are not made by this page; **Plan B and P1 scope:** this page does not run Plan B and makes no claim for it, and P1 here is claimed for the playground world only, never for the Docker box or for Plan B (which claims no P1); compression, encryption, and DNS exfiltration are outside content inspection and caught by the action criterion only; text analysis does not catch every injection; the playground cannot detect a secret read through an unsupported command; deleting a whole database file is a `file-deleted` Change and not counted as row loss.
    - The playground emulates a subset of a shell (the Supported_Command_Set table), opens no connection (a network attempt is a recorded value), the real mode needs a Docker box, the playground uses the same engine and the same wards file as real mode (and a verdict is not a guarantee for a real repository), the Scenario Plans are scripted, recorded Plan_Files are replayed and not decided by an LLM in the page, the possession Scenario uses fake canary values and reserved example domains, the SQL screening restriction (clock, random, `ATTACH`, and so on), macOS and Linux tested and Windows unverified, redaction of a secret typed into a command is the producer's responsibility, the manual smoke checklist (load the page, run Scenario 1, see `block`; CSP and load time), and the verification gap that the Vite-bundled worker is not run in CI. The words `sealed` and `isolated` are not used in fixed product text.
    - _Requirements: 9.6, 9.7, 10.7, 15.6, 17.7, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 2.6, 7.9_

  - [ ] 16.2 Update the repository `README.md` dependency and license table
    - Add every dependency of `apps/ghost-shell/` and `worlds/playground-shell/` (runtime and development) with name, version, and license, read from the installed `package.json` files on the day of the task: `sql.js` (MIT), `react`, `react-dom`, `yaml` (ISC, via `wards-config`), `typescript`, `eslint`, `typescript-eslint`, `@types/node`, `vite`, `@vitejs/plugin-react`, `vitest`, `fast-check`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@types/react`, `@types/react-dom`, `@eslint-react/eslint-plugin`, and `eslint-plugin-react-hooks`. List every font, icon, and other asset with source and license (icons and art come from `@ghost-run/ui`; the app adds no font and no image). Record that `shell-quote` and `@types/sql.js` were excluded on purpose. Add the playground description, the measured `verifyWorld` run time from task 7.6, and the measured wasm size from task 3.3.
    - Keep the file free of hidden Unicode.
    - _Requirements: 1.8, 18.1_

- [ ] 17. Repository hygiene and isolated lint bans
  - [ ] 17.1 Write the repository hygiene tests
    - Create `apps/ghost-shell/tests/scan/hygiene.test.ts` (node): run `scanTexts` or the Scan_Entry_Point of `possession` over the files of `apps/ghost-shell/`, `worlds/playground-shell/`, and `.kiro/specs/ghost-shell/` (excluding `node_modules` and `dist`) and expect the outcome `clean`; the three folders contain no literal Hidden_Display_Code_Point and no literal HTML comment opener; no `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, or `console.` in `apps/ghost-shell/src`; no `Date` or `Math.random` in `src/pipeline`, the world, and the interpreter; no call to an LLM API; only Canary secrets and reserved hosts in fixtures, plans, and tests; the `package.json` runtime dependency set of the app is exactly the seven listed in Requirement 1, criterion 3; the installed `vite`, `vitest`, and `jsdom` majors are 7, 3, and 26; no source under `apps/ghost-shell/src` imports `@ghost-run/wards-config/node`, `@ghost-run/ghost-runner`, `three`, `@mujoco/mujoco`, or `integrations/*`; the GS-P labels appear only in the six properties of this spec.
    - _Requirements: 1.3, 1.6, 1.7, 19.1, 19.2, 19.3, 19.4, 19.7, 19.8_

  - [ ] 17.2 Add the import bans for the playground packages to `core`, `ui`, and `wards-config`
    - **Isolated task. It must NOT run at the same time as any other task that edits `core/`, `ui/`, or `wards-config/` in this spec or in another spec.** Precondition: the `possession`, `wards`, `ghost-runner`, and `ui-kit` specs have finished all their changes to `core/` (including `ui-kit` task 13.1, which edits `core/eslint.config.mjs`), the `core` suite passes, and no other core-editing task is in progress.
    - Add the patterns `@ghost-run/playground-shell`, `@ghost-run/playground-shell/**`, `@ghost-run/ghost-shell`, `@ghost-run/ghost-shell/**`, `**/worlds/playground-shell/**`, and `**/apps/ghost-shell/**` to the `no-restricted-imports` rule of `core/eslint.config.mjs`, `ui/eslint.config.mjs`, and `wards-config/eslint.config.mjs`, next to the existing entries. Change nothing else.
    - Add one lint fixture test per package (following the pattern of the existing import-ban tests): write a temporary file under the package's `src/` that imports `@ghost-run/playground-shell` or `@ghost-run/ghost-shell`, run ESLint programmatically on it, assert a `no-restricted-imports` error, and remove the file in `finally`.
    - Run the `core`, `ui`, and `wards-config` suites and `pnpm lint`. Confirm `core/package.json` is unchanged and `pnpm lint` fails when a fixture violates the rule.
    - _Requirements: 1.5_

- [ ] 18. Final checkpoint
  - Run `pnpm --filter @ghost-run/playground-shell test`, `pnpm --filter @ghost-run/ghost-shell test`, `typecheck`, `lint`, `build`, and `test:dist` for both packages, and `pnpm lint` for the workspace. Confirm: every property of the design (1 to 26) has a test with at least 100 runs in the Short_Run; the `verifyWorld` time is recorded in the devlog and the world README and is within the 45 s guard; the Nightly_Run command (`GHOST_PBT_MODE=nightly`) is documented and was run at least once for the world contract tests or the reason it was not is recorded; no hidden Unicode appears literally in the three folders (the hygiene test passes); the README tables list every dependency with its license; `core/package.json` has no `dependencies`; `pnpm-workspace.yaml` lists `apps/*`, `worlds/*`, `wards-config`, and `ui`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Every task is required. No task is marked optional.
- Properties 1 to 26 keep the numbering and titles of `design.md`. Properties 1 to 6 are GS-P1 to GS-P6 of Requirement 20, criterion 2; the contract properties are Property 7 (P1), Property 8 (P3), Property 9 (P2), and Property 22 (P5 and P6). Property map: 1 (12.2), 2 (10.7), 3 (7.2), 4 (13.2), 5 (10.2), 6 (11.4), 7 (7.3), 8 (7.4), 9 (7.5), 10 (6.10), 11 (6.3), 12 (6.8), 13 (4.2), 14 (6.6), 15 (6.7), 16 (10.3), 17 (10.5), 18 (10.6 and 14.3), 19 (4.4), 20 (6.9), 21 (6.4), 22 (10.8), 23 (12.3), 24 (13.6), 25 (13.4), 26 (14.3).
- The registration gate (`verifyWorld`) is task 7.6. It runs the P3, P1, P2, and per-ward checks on one fixed world; Properties 7, 8, and 9 are the separate own checks over generated projects.
- The early verification tasks are 3.1 (`sql.js` under Node and jsdom), 3.2 (`worker_threads` watchdog timeout), 3.3 (Vite build, wasm file, and the `yaml` browser build through `wards-config`), 3.4 (dist check script), and 7.6 (`verifyWorld` run time). Their measured results go to `docs/devlog.md`; 7.6 and 3.3 also feed the READMEs.
- Tasks 1.1 and 17.2 are isolated `core` edits. Task 2.1 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- Tasks from wave 10 on depend on the `ui-kit` implementation (the widened notice-kind type, `escapeForDisplay`, `isHiddenDisplay`). Tasks 3.3 and 3.4 depend on the `wards-config` implementation (default entry without Node built-ins; `/node` subpath split from `wards` spec task 6).
- The manual browser checks (CSP directives in a real browser, load time within 3.0 s, the worker in a real browser) are not coding tasks. They are listed in the README (task 16.1).
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "4.3", "5.1", "6.1"] },
    { "id": 4, "tasks": ["3.3", "4.4", "4.5", "5.2", "6.2"] },
    { "id": 5, "tasks": ["3.4", "6.3", "6.4", "6.5"] },
    { "id": 6, "tasks": ["6.6", "6.7", "6.8", "6.9", "6.10", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.7"] },
    { "id": 8, "tasks": ["7.6"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["10.1", "11.1", "12.1", "13.1", "13.3"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4", "11.2", "12.2", "12.3", "13.4"] },
    { "id": 12, "tasks": ["10.5", "10.6", "10.7", "10.8", "11.3", "11.4", "12.4", "13.2", "13.5"] },
    { "id": 13, "tasks": ["13.6", "14.1"] },
    { "id": 14, "tasks": ["14.2"] },
    { "id": 15, "tasks": ["14.3", "15.1"] },
    { "id": 16, "tasks": ["16.1", "16.2"] },
    { "id": 17, "tasks": ["17.1"] },
    { "id": 18, "tasks": ["17.2"] }
  ]
}
```

# Implementation Plan: ghost-hand

## Overview

This plan builds App 2 of Ghost Run+: the world package `worlds/drawer-arm/` (`@ghost-run/drawer-arm`, runtime dependencies `@ghost-run/core` and `@mujoco/mujoco` 4.0.1 only) and the static web app `apps/ghost-hand/` (`@ghost-run/ghost-hand`). All code is TypeScript (the design uses TypeScript throughout). Tests use `vitest` and `fast-check` and run the real `@mujoco/mujoco` module (never a mock). Host code targets Node.js 20.20.2.

The plan follows the implementation order of the design and is split into execution waves (see "Task Dependency Graph"):

1. **Wave 0 and 1: the `@mujoco/mujoco` 4.0.1 API probe is the first task.** If its result differs from `design.md`, `design.md` is fixed first (task 1.2), and no other task starts before that.
2. Steering updates S1 to S7, including the narrow P2 scope in the world-contract steering.
3. Package scaffolds, dependencies, and the README license table.
4. Pure world logic (types, ranges, variant sampler, variant config) and the pure app logic (plan file, inputs, texts, capability probes) with their property tests.
5. The engine, the controller, and the world (six functions), the world tests, and the early short-run budget measurement.
6. The pure pipeline, self-check, overlay model, and reducer, then the executors and the 3D renderer.
7. The run pipeline, the demo scenarios, and the tuning of provisional numbers.
8. The engine-bound property tests, the golden hash, and the `verifyWorld` registration gate.
9. Screen composition, the Node entry point, build output checks, and hygiene scans.
10. The Chrome harness, the unmeasured frame-time measurement, claim-scope tests, the README, and the isolated cross-package lint ban.
11. The only optional task, last: the forbidden-contact red thread (possession scenario).

State that already exists and is not recreated by this plan:

- `core` (`World`, `ghostRun`, `WardEngine`, `verifyWorld`, possession scanner), `wards-config` (`parseWards`, `formatConfigError`), and `ui` (the `ui-kit` components, `Display_Escaper`, `Grave_Entry`, `Isolation_Claims`) are implemented by their own specs. This plan calls them and edits none of them, except the isolated lint-ban task 19.1 and the optional task 21.1 (both named below).
- The `kiro-integration` hooks (`world-scaffold`, `contract-pbt`, `blacklight-steering`) run on file events in `worlds/**` and `.kiro/**`. Task 4.1 and task 12.12 name this dependency.
- `docs/devlog.md` is a Korean log kept by Claude Code. No task of this plan writes to it. Measurements and probe results go to `docs/measurements.md` (English), which task 1.1 creates.

Decisions reflected in this plan:

1. **Probe first.** Task 1.1 probes the `@mujoco/mujoco` 4.0.1 API. Task 1.2 corrects `design.md` when the probe differs. Every engine task depends on task 1.2.
2. **Prerequisites PR-1, PR-2, PR-3 (owned by other specs).** PR-1: `core` and `wards` (`jointLimitExceeded` and `selfCollisionOccurred` on `VariantResult`, and the `physics` Ward block). PR-2: `wards` message wording by reason, with no appended line when `claims` is not passed. PR-3: `ui-kit` Claim_Banner shows P5 and P6 as "not applicable". Tasks that depend on them say so. Tasks 6.8 and 8.6 test the behavior BEFORE they land (no claim made, provisional wording shown), detected by behavior probes (design D16). Task 18.3 checks the landed state before any dependent criterion is marked as met.
3. **P2 text waits for the steering update.** The page and the README show no P2 text until task 3.2 has landed the world-contract steering change and task 18.2 has switched `P2_TEXT_ENABLED` on. Scope wording: "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware."
4. **Chrome harness.** First `node:http` plus the installed Chrome headless command line (task 17.1). Only if that fails, Playwright (Apache-2.0) is added as a development dependency using the installed Chrome (`channel` option, no browser download) in task 17.2, and its version and license are recorded in the README table.
5. **Short-run count.** Task 7.7 measures the cost, sets `shortRuns`, and writes `worlds/drawer-arm/tests/pbt-budget.json`. A value below 100 needs a written rationale. Task 11.5 re-checks the value after the scene is tuned.
6. **Claim scopes are those of `requirements.md`.** P8 is limited to the Tested_Environments. No test or text contains a measured pass count. The README states measured numbers only with the date and environment of the measurement.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: ghost-hand, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))`, prints the seed on failure, and keeps each shrunk counterexample as a fixed example test. The numbering and titles are those of the Correctness Properties section of `design.md` (Properties 1 to 23). The labels `GH-P1` to `GH-P8` name the properties of Requirement 18 and are never used for P1 to P8 of the safety contract, `UI-P1` to `UI-P11`, or `GS-P1` to `GS-P6`. Test titles carry both, for example `Property 6 (GH-P6)`. The contract properties are titled `contract P1`, `contract P2`, and `contract P3`.
- **Run sizes.** Pure properties: at least 100 examples in a Short_Run and at least 10,000 in a Nightly_Run (`GHOST_PBT_MODE=nightly`). Engine-bound properties: `shortRuns` from `worlds/drawer-arm/tests/pbt-budget.json` (task 7.7), and in a Nightly_Run the largest count that finishes in 8 hours on the Reference_Machine. Until task 7.7 exists, engine-bound tests use a fixed count of 20.
- **No optional test tasks.** Every test task is required. No test sub-task carries the `*` marker. The only optional task is task 21.1 (the forbidden-contact red thread), placed last.
- **Behavior probes.** Conditional tests that depend on PR-1, PR-2, or PR-3 use `describe.skipIf(!capability)` and report `skipped (PR-n not landed)`, never `passed`, when the capability is missing. The selection of fallback texts is also tested by capability overrides, so both paths are covered.
- **Test data.** Canary values only (for example `sk-CANARY-abc123`). Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and the documentation range `192.0.2.x`. Hidden Unicode characters are written only as `\u` escapes or built with `String.fromCodePoint`, and an HTML comment opener is built from code points. Never write them literally in a file under `apps/ghost-hand/`, `worlds/drawer-arm/`, or `.kiro/specs/ghost-hand/`.
- **Purity and MuJoCo discipline.** `core`-style purity holds for the pure modules (no clock, random source, or environment read). `@mujoco/mujoco` is imported only inside `worlds/drawer-arm/src/engine/`. Every wrapped C++ object is deleted. No typed-array view over WebAssembly memory is kept across a call.
- **Single-writer files.** Tasks that write the same file are in different waves: `docs/measurements.md` (tasks 1.1, 7.7, 11.5, 12.11, 17.1, 17.3), the README (4.3, 17.2, 18.4), `apps/ghost-hand/src/texts.ts` (6.2, 18.2), and `apps/ghost-hand/package.json` (4.2, 14.3, 15.1, 17.1, 17.2). After task 6.2, other tasks only import constants from `texts.ts`.
- **Verification commands.** `pnpm --filter @ghost-run/drawer-arm test`, `pnpm --filter @ghost-run/ghost-hand test`, `typecheck`, `lint`, `build`, `test:dist`, and `pnpm lint` for the workspace.
- **Scope of this plan.** Coding tasks, plus the human-confirmed steps named in the tasks (steering approval, the Kiro recording of the revised plan). Ward rule evaluation, `wards.yaml` parsing, the Message_Builder, the scanner, and the UI components belong to other specs, which this plan only calls.

## Tasks

- [x] 1. MuJoCo API probe (first task)
  - [x] 1.1 Probe the `@mujoco/mujoco` 4.0.1 API and create `docs/measurements.md`
    - **This is the first task of the plan. No other task starts before it and task 1.2 are done.**
    - Create the minimal `worlds/drawer-arm/package.json` (name `@ghost-run/drawer-arm`, `private`, `type: module`, dependency `@mujoco/mujoco` pinned to exactly `4.0.1`, no caret) and run `pnpm install`. Confirm `pnpm-workspace.yaml` lists `worlds/*`; edit it only if the entry is missing. Read `license` from the installed `package.json` (expected Apache-2.0) and check whether the installed tarball contains any LICENSE file (expected none); record both facts.
    - Create `worlds/drawer-arm/scripts/probe.mjs` (plain JavaScript, Node 20.20.2, new code). It uses the real module and records: the loader name and how Node and Vite locate `mujoco.wasm` (the single-thread build only; no `SharedArrayBuffer`); the argument shapes of `mj_stateSize`, `mj_getState`, and `mj_setState`, and whether a plain `Float64Array` works; the `mjSTATE_INTEGRATION` size and a restore check (set state, step N, restore, step N again: bit-identical `qpos`, `qvel`, and warm-start-sensitive outputs); how contacts are read (geom ids per contact) and the shape of `mj_contactForce`; the accessor for the module heap size; the warning counters; the output arguments of `mj_jacSite`; whether every wrapped object has `.delete()`; the byte size of one `MjData` with `<size memory="1M"/>` in a tiny MJCF string (and the default size without it); how a view over WebAssembly memory behaves after the heap grows (length 0); and which parts of the package README differ from the actual API.
    - Create `docs/measurements.md` (English) with one section per record: `Probe results` (filled now), `Short-run budget and verifyWorld timing` (unmeasured), `Determinism golden hash` (unmeasured), `Demo scenario numbers` (unmeasured), `Browser timings` (unmeasured), and `3D overlay frame time with 8 and 20 ghost arms` (unmeasured). Every unmeasured section says `unmeasured` until its task fills it. Each filled entry carries the date, the Node version, and the machine.
    - Write nothing to `docs/devlog.md`. Contain no hidden Unicode and no real credential in any file.
    - _Requirements: 1.3, 1.10, 3.14, 4.3, 17.13, 19.5_

  - [x] 1.2 Reconcile `design.md` with the probe result (gate)
    - Compare every probe fact with the "Engine" section, the probe items paragraph, D6, D9, D10, D11, and the pitfalls list of `design.md`. If any fact differs (for example the state function argument shapes, the contact access, the heap accessor, the warning counters, or the restore behavior), edit `design.md` FIRST (and `requirements.md` only where it conflicts), then continue. If nothing differs, append the line `Design reconciled: no difference` to the `Probe results` section of `docs/measurements.md`.
    - If the INTEGRATION restore is not bit-exact in the probe, apply the contingency of the design (add the missing arrays to the state vector inside `engine/`) and record it in the design before any engine task starts.
    - Run `validate_spec_format` on every spec file that was edited.
    - _Requirements: 3.14, 4.3, 17.5_

- [x] 2. Checkpoint - probe gate
  - Confirm `docs/measurements.md` holds the probe results, `design.md` matches them, and no other file was written. Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Steering updates S1 to S7
  - [x] 3.1 Update `.kiro/steering/structure.md` (S1 to S4)
    - **Each steering edit is shown to the user and approved when the task runs.** The files must satisfy the `blacklight-steering` hook and the hidden-character ban (no literal hidden character, no HTML comment opener).
    - S1: in "Dependency Direction", add that `apps/*` may depend on `worlds/*`, and that `worlds/*` may depend on `core/` and on the engine package of the world only (for example `@mujoco/mujoco`, `sql.js`). S2: remove "3D ghost overlay" from the tree comment of `ui/`. S3: add `apps/ghost-hand/` entries (3D overlay, Node entry point) and the "What Goes Where" line `3D ghost overlay -> apps/ghost-hand/`. S4: name `worlds/drawer-arm/` (with its `wards.yaml`) in the tree of `worlds/`.
    - Change nothing else. This task completes before any file of `apps/ghost-hand/` imports `worlds/drawer-arm/` (task 4.2 onward).
    - _Requirements: 1.8, 1.14_

  - [x] 3.2 Update `.kiro/steering/world-contract.md` for the narrow Ghost Hand P2 (S5)
    - Edit the P2 row of the safety contract table: keep the existing scope (in-memory FS and sql.js worlds) and add the Ghost Hand scope with exactly this wording: "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware." Touch the P8 row only if it needs the same environment note. Change no other row.
    - Report to the user that the page and the README still show no P2 text until task 18.2 runs.
    - _Requirements: 10.6, 19.1_

  - [ ] 3.3 Update `.kiro/steering/tech.md` (S6)
    - In "Hosting", state that Ghost Hand uses the single-thread MuJoCo build and needs no COOP or COEP header, and that the multi-thread build is not used. Keep the rule for any other app that needs the headers.
    - _Requirements: 2.2, 19.7_

  - [ ] 3.4 Update `.kiro/steering/product.md` (S7)
    - Record that App 2 is confirmed as Ghost Hand and the third world is Ghost Cloud (the file still says "may switch"). Change nothing else.
    - _Requirements: 1.8_

- [x] 4. Package scaffolds, dependencies, and licenses
  - [x] 4.1 Complete the `worlds/drawer-arm/` package scaffold
    - **Depends on task 1.2 and task 3.1.** **Depends on the `kiro-integration` implementation:** the `world-scaffold` hook populates boilerplate when a file is created under `worlds/drawer-arm/`. If the hook ran, adopt its files; if it did not, create the same shape by hand. Do not duplicate files.
    - Finish `package.json` (scripts `test`, `test:nightly`, `typecheck`, `lint`; dependencies exactly `@ghost-run/core` (`workspace:*`) and `@mujoco/mujoco` 4.0.1; dev dependencies `typescript`, `vitest`, `fast-check`, `eslint`, `typescript-eslint`, `@types/node` in the ranges that `core` uses), `tsconfig.json` (strict), `vitest.config.ts` (node environment), and `eslint.config.mjs`: `no-restricted-imports` that bans `three`, `react`, `@ghost-run/ui`, `@ghost-run/wards-config`, `apps/**`, `@ghost-run/ghost-runner`, `integrations/**`, and bans `@mujoco/mujoco` everywhere except `src/engine/**`; `core` only through its public entry point; `no-restricted-syntax` and `no-restricted-properties` for `eval`, `new Function`, `Date.now`, `new Date`, and `Math.random` in `src/**`.
    - Create `world.config.ts` (default export `{ id: 'drawer-arm', deterministic: false, wardsFile: './wards.yaml', create }`; `create` is a placeholder that task 7.5 replaces; `deterministic` stays `false` until task 12.12), the single canonical `wards.yaml` (the one `gentle-hands` physics ward of the design: `min_success_rate: 0.95`, `max_contact_force_n: 30`, `forbidden_contacts: [vase]`, no other ward), `variant-config.json` (provisional values of the design, default count 8, default seed 42, `largeCountEnabled: false`), an empty `src/index.ts`, `tests/pbt-config.ts` (copy of the `core/tests/pbt-config.ts` pattern; reads `shortRuns` from `tests/pbt-budget.json` once task 7.7 has written it), and a README stub.
    - Add the build output of the world to `.gitignore` if missing. Run `pnpm install`, `tsc --noEmit`, and eslint. Confirm no change in `core/`.
    - _Requirements: 1.2, 1.4, 1.6, 1.7, 3.13, 4.4, 9.1, 9.2, 20.7_

  - [x] 4.2 Create the `apps/ghost-hand/` package scaffold and install
    - **Depends on task 3.1 (S1), task 4.1, the `ui-kit` implementation (`@ghost-run/ui`), and the `wards-config` implementation (default entry point without Node built-ins).** If `import { parseWards, formatConfigError } from '@ghost-run/wards-config'` cannot be bundled for the browser, stop and report the dependency; do not add a second YAML parser.
    - Create `package.json` (name `@ghost-run/ghost-hand`, `private`, `type: module`). Runtime dependencies exactly: `@ghost-run/core`, `@ghost-run/ui`, `@ghost-run/wards-config`, `@ghost-run/drawer-arm` (all `workspace:*`), `@mujoco/mujoco` 4.0.1, `three` 0.187.0, `react`, `react-dom`. Dev dependencies: `@types/three` 0.187.0, `vite`, `vitest`, `jsdom` (the versions of `react`, `react-dom`, `vite`, `vitest`, and `jsdom` equal those in `ui/package.json`), plus `fast-check`, `@testing-library/react`, `typescript`, `eslint`, `typescript-eslint`, `@types/node`. Declare all dev dependencies now so later tasks never edit the dependency list except task 17.2.
    - Create `tsconfig.json` (strict, `jsx: react-jsx`), `tsconfig.node.json`, `vite.config.ts` (`base: './'`, `build.outDir: 'dist'`, `emptyOutDir`, `target: 'es2022'`, `assetsInlineLimit: 0`, the single-thread MuJoCo wasm emitted as a same-origin asset, no `SharedArrayBuffer`, no COOP or COEP header), `vitest.config.ts` (projects: `model` in node, `dom` in jsdom), `eslint.config.mjs` (the import bans of the world package plus `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, storage globals, imports of `@ghost-run/ghost-runner`, `integrations/*`, and the subpath `@ghost-run/wards-config/node`; `no-restricted-imports` for `three` outside `src/overlay/`), `index.html`, a minimal `src/main.tsx`, and `tests/pbt-config.ts`.
    - Add `apps/ghost-hand/dist`, `apps/ghost-hand/dist-node`, and the world build output to `.gitignore` if missing. Confirm `pnpm-workspace.yaml` lists `apps/*`, `worlds/*`, `wards-config`, and `ui`; edit it only if an entry is missing. Run `pnpm install`, `pnpm --filter @ghost-run/ghost-hand exec tsc --noEmit`, and eslint.
    - _Requirements: 1.1, 1.3, 1.5, 1.7, 1.13, 2.1, 2.2, 2.3, 2.5, 20.7_

  - [x] 4.3 Record dependency licenses in the README table
    - **License check on the day the dependency was added.** Read the license field of each installed package and add rows to the README dependency table (name, version, license, role): `@mujoco/mujoco` 4.0.1 (`package.json` license field says Apache-2.0; the published tarball contains no LICENSE file), `three` 0.187.0 (MIT), `@types/three` 0.187.0 (MIT), and the other runtime and development dependencies of the two packages, with the versions that `ui` confirmed. Add a row for every font, icon, and asset of the app, or the line `none` (the app uses only primitive shapes and system fonts). Add the Playwright row only in task 17.2, if it is needed.
    - State in the table notes that the MuJoCo WebAssembly file bundles components with their own licenses (listed by `docs/research.md`) and that the notices file is produced by task 15.1.
    - _Requirements: 1.9, 1.10, 1.12, 19.6_

  - [x] 4.4 Write the package guard test
    - `apps/ghost-hand/tests/scan/package.test.ts` and `worlds/drawer-arm/tests/package.test.ts`: the app `dependencies` are exactly the nine runtime entries of task 4.2 with exact versions for `@mujoco/mujoco`, `three`; `@types/three`, `vite`, `vitest`, `jsdom` are in `devDependencies`; the versions of `react`, `react-dom`, `vite`, `vitest`, `jsdom` equal those of `ui/package.json`; the world depends on `@ghost-run/core` and `@mujoco/mujoco` only, with no `three`, `react`, or `@ghost-run/ui`; `@mujoco/mujoco` is imported only under `src/engine/`; the world imports `@ghost-run/core` only through its public entry point; the app imports `@ghost-run/wards-config` only through its default entry point; no source imports `@ghost-run/ghost-runner`, `integrations/*`, or any path of the throwaway Experiment C.
    - _Requirements: 1.3, 1.4, 1.5, 1.7_

- [ ] 5. Pure world logic
  - [ ] 5.1 Create the types, the World_Config, and the action validator
    - `worlds/drawer-arm/src/types.ts` (`Vec3`, `GhostHandAction`, `VariantParams`, `RunMonitors`, `ControllerState`, `GhostHandState` exactly as in the design), `src/world-config.ts` (`WORLD_CONFIG` as const with the provisional values of the design, the closed `actionRanges`, `contactNames`, and the `BODY_SHAPES` table shared by the MJCF builder and the overlay), and `src/actions.ts` (`validateAction(a)` returns `{ ok: true } | { ok: false; error }`, checks the shape, finiteness, and the closed ranges, never clamps; `describeAction(a)` returns the text form `reach(x=<x>, y=<y>, z=<z>, speed=<s>)`, `grasp(force=<f>)`, `pull(distance=<d>, speed=<s>)`, `release()` with numbers printed by `String(number)`). Export them from `src/index.ts`.
    - `GhostHandState` contains only finite numbers, strings, booleans, plain arrays, plain objects, and `Float64Array`. No function, `Map`, `Set`, `Date`, or circular reference.
    - _Requirements: 3.2, 4.4, 4.6, 5.1, 5.2, 5.3, 5.8, 6.1_

  - [ ] 5.2 Write unit tests for the action validator and the World_Config
    - `worlds/drawer-arm/tests/actions.test.ts`: every range is a closed interval of finite numbers with `min <= max`; each action type with a value at each boundary is ok; one step outside, `NaN`, `Infinity`, a string, a missing field, and an unknown `type` are not ok and are not clamped; `describeAction` output for each type; `contactNames` includes `vase`; the world config holds no read of a clock or random source.
    - _Requirements: 4.4, 5.1, 5.2, 5.8, 3.6_

  - [ ] 5.3 Implement the PRNG, the Variant_Config parser and printer, and the variant sampler
    - `src/prng.ts` (`mix32` murmur3 finalizer with `Math.imul` and `>>> 0`, `xorshift32`, `u32ToUnit` as a division by 4294967296), `src/variant-config.ts` (`VariantConfig`, `parseVariantConfig(text)` that never throws and reports `invalid-json`, `wrong-type`, `missing-field`, `unknown-field`, `out-of-range`, `input-too-large` above 64 KiB with a `field` path per error, rebuilds the config from known keys only, rejects non-finite bounds, `min > max`, counts outside 1 to 20, and seeds outside 0 to 4294967295; `printVariantConfig(config)` returns two-space JSON, a fixed key order, and a trailing newline), and `src/variant.ts` (`sampleVariant(seed, index, config)` with the fixed draw order friction, mass, offset x, y, z, noise, delay, noise seed, clamping with `Math.min` and `Math.max`, delay by `floor`; `BASE_VARIANT_PARAMS`; pure `applyVariant(base, params)` that sets `variant`, the PRNG state, and the delay buffer and leaves `integration` untouched). Use only the operations allowed by Requirement 5 criterion 6. Export from `src/index.ts`.
    - _Requirements: 5.6, 6.1, 6.2, 6.3, 6.4, 6.6, 6.8, 6.10, 7.1, 7.2, 7.3_

  - [ ] 5.4 Write unit tests for the variant config and the sampler
    - `tests/variant-config.test.ts` and `tests/variant.test.ts`: each error code of `parseVariantConfig` with its `field` path; the 64 KiB limit; unknown keys; canonical print form (two-space indent, key order, trailing newline); known test vectors of the murmur3 finalizer; the stream is non-zero; two different indices give different parameters for a fixed seed; the shipped `variant-config.json` parses with `ok: true`; the default count is 8 and the largest allowed count is at most 20; `applyVariant` leaves `integration` unchanged.
    - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.3, 6.8_

  - [ ] 5.5 Write the property test for the Variant_Config round trip
    - **Property 2: Variant config round trip (GH-P2)**
    - **Validates: Requirements 7.3, 7.4**
    - File: `tests/p02-variant-config-roundtrip.test.ts`. Generator: valid configs with generated ranges (`min <= max`), counts 1 to 20, seeds 0 to 4294967295, both values of `largeCountEnabled`. Assert `ok: true` with a deep-equal config, and print idempotence. Pure; at least 100 Short_Run, 10,000 Nightly_Run.

  - [ ] 5.6 Write the property test for variant ranges
    - **Property 3: Variant parameters stay inside their ranges (GH-P3)**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 17.6**
    - File: `tests/p03-variant-ranges.test.ts`. Generators: seeds, variant indices, valid configs. Assert every field is finite and inside its closed range, `commandDelaySteps` is an integer, and `noiseSeed` is an integer from 0 to 4294967295. Claim scope: the Tested_Environments (P8, range part).

- [ ] 6. App input formats, texts, and capability probes
  - [ ] 6.1 Implement the Plan_File parser and printer
    - **Depends on the `ui-kit` implementation** for `isHiddenDisplay` (the Hidden_Display_Code_Point test) exported by `@ghost-run/ui`.
    - `apps/ghost-hand/src/plan/plan-file.ts`: `FileError`, `PlanFile`, `parsePlanFile(text)` (never throws; `input-too-large` above 1 MiB checked first; `invalid-json`, `wrong-type`, `missing-field`, `unknown-field` with the key as `field`, `unsupported-version`, `out-of-range` including the 1 to 50 action count and the `name` and `note` limits, `unknown-action`, `invalid-character` for control or hidden code points in `name`, `note`, `recordedWith`, and `revisionOf`; `taskText` is exempt from the hidden-character check, kept as given, and counted in code points; each action is rebuilt from known keys and checked with `validateAction`; `-0` is normalized to `0`) and `printPlanFile(plan)` (fixed key order `format, version, name, origin, actions, note, recordedWith, revisionOf, taskText`, two-space indent, trailing newline, every code unit above `0x7E` written as a lowercase `\u` escape, a surrogate pair for a code point above U+FFFF).
    - A Plan_File carries no clock value, session identifier, verdict, or trajectory.
    - _Requirements: 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 11.1, 11.2, 11.3, 20.1_

  - [ ] 6.2 Create `texts.ts` with every fixed text and the P2 switch
    - `apps/ghost-hand/src/texts.ts` holds every fixed text of the requirements as an exported constant, written exactly as in `requirements.md` (engine start failure, secure context alert, unknown ward entry, joint-limit status, no physics ward, provisional wording note, P1 failure alert, P5 and P6 line, Docker line, P2 check lines, determinism check lines, restore failure line, P8 scope line, reference-simulation line, plan origin lines, WebGL fallback, graveyard drop line, possession lines). It also exports `P2_TEXT_ENABLED = false`. After this task only task 18.2 edits this file, and it only flips that constant.
    - The fixed texts contain the words `sealed` or `isolated` nowhere. The file contains no hidden Unicode.
    - _Requirements: 2.8, 4.7, 8.7, 9.7, 9.9, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 10.11, 11.6, 13.11, 14.9, 16.6_

  - [ ] 6.3 Implement the seed and count input validation
    - `apps/ghost-hand/src/inputs.ts`: `parseSeedInput(text)` accepts only the decimal text of an integer from 0 to 4294967295 (no sign, space, or exponent); `validateVariantCount(count, config)` accepts 1 to `defaultCount`, or up to `maxCount` only when `largeCountEnabled`. A rejection returns a message and no run.
    - _Requirements: 6.7, 6.8_

  - [ ] 6.4 Write unit tests for the Plan_File parser and printer
    - `tests/model/plan-file.test.ts`: each error code with its `field`; a Plan_File with an unknown field is rejected with the field path; the 1 MiB limit; `invalid-character` in `name` and not in `taskText`; hidden code points in `taskText` written as `\u` escapes in the file text are accepted; the printed text contains no code unit above `0x7E`; an action with an out-of-range value is rejected with `out-of-range`.
    - _Requirements: 7.5, 7.6, 7.7, 7.9, 11.3, 18.4_

  - [ ] 6.5 Write the property test for the Plan_File round trip
    - **Property 1: Plan file round trip and printed form (GH-P1)**
    - **Validates: Requirements 7.5, 7.8, 7.9, 7.10, 11.1, 11.2**
    - File: `tests/model/p01-plan-roundtrip.test.ts`. Generators: plans of 1 to 50 actions inside the Action_Ranges, any `origin`, optional `note`, `recordedWith`, `revisionOf`, and `taskText` with hidden code points built by `String.fromCodePoint`. Assert deep-equal round trip, print idempotence, no code unit above `0x7E`, and no literal hidden character. Pure; 100 Short_Run, 10,000 Nightly_Run.

  - [ ] 6.6 Write the property test for parser totality
    - **Property 4: Parser totality and error shape (GH-P5)**
    - **Validates: Requirements 7.1, 7.2, 7.5, 7.6, 7.7, 7.11**
    - File: `tests/model/p04-parser-totality.test.ts`. Generators: arbitrary strings, serialized JSON values, deep nesting, huge numbers, lone surrogates in escapes, texts around 64 KiB and 1 MiB. Assert `parsePlanFile` and `parseVariantConfig` return a result object and never throw, every error has non-empty `code` and `message` and a `field` string, and an oversized text returns only `input-too-large`.

  - [ ] 6.7 Write the property test for seed and count validation
    - **Property 19: Seed and count validation**
    - **Validates: Requirements 6.7, 6.8**
    - File: `tests/model/p19-inputs.test.ts`. Generators: arbitrary strings plus decimal strings near the bounds, integer counts, both values of `largeCountEnabled`. Assert the accept-if-and-only-if rules of the design and that a rejection carries a message.

  - [ ] 6.8 Implement the capability probes and the claim evidence type
    - **Depends on PR-1, PR-2, and PR-3 only through behavior probes; none of them is required to have landed.**
    - `apps/ghost-hand/src/capabilities.ts`: `Capabilities { jointSelfWard, claimsOptional, bannerNotApplicable }` and `probeCapabilities()` exactly as in the design (D16): `jointSelfWard` is true only when `WardEngine.evaluate` blocks on both a `jointLimitExceeded` probe report and a `selfCollisionOccurred` probe report (a partial landing is false); `claimsOptional` is true only when `renderMessage` accepts a context without `claims` and the text lacks the fragment `no ghost rehearsal took place`; `bannerNotApplicable` is true only when the PR-3 field exists (until then it is false). Add `ClaimEvidence { selfCheck, capabilities }` in `src/evidence.ts`.
    - Create `tests/capabilities.expected.json` with the values observed today and a test per flag that compares the probe with the file and fails with `capability changed: update the expected file and the dependent texts`. Add tests that build the claims and texts for each combination of capability values by override (both paths).
    - Write the observed values and the installed package versions in the test output, not in `docs/measurements.md`.
    - _Requirements: 8.7, 9.9, 10.1, 21.1, 21.2, 21.3, 21.4, 21.6_

- [ ] 7. Engine, controller, and world
  - [ ] 7.1 Implement the engine layer
    - **Depends on task 1.2 (design reconciled with the probe).** All code under `worlds/drawer-arm/src/engine/`: `mujoco-subset.d.ts` (local structural types of the used API subset), `load.ts` (`loadMujoco`, memoized, single-thread build, Node and Vite wasm location as the probe found), `mjcf.ts` (`buildMjcf(modelParams)` from `BODY_SHAPES`: primitive geoms only, no mesh or texture file, `<size memory="1M"/>`, the arm, the cabinet, the drawer with the handle on one slide joint, the vase as a free body on the cabinet top, adjacent link and finger pairs in `<contact><exclude>`, position actuators on the four arm hinges and motor actuators on the finger slides), `engine.ts` (`Engine`, `EngineEntry`, `Scope`, `readArray(data, name, expectedLength)` that copies at once into a `Float64Array` and throws `EngineMemoryError('view-detached')` on a length mismatch, `StateLayout` computed from `mj_stateSize` of each single-bit signature, `load` through `mj_setState` with `mjSTATE_INTEGRATION`, `capture`, `step`, a model cache of at most 24 entries deleted on eviction and `dispose`, idempotent `dispose`, `heapBytes`), and `monitors.ts` (per-step contact scan with the maximum arm contact normal force, touched Contact_Names, joint-limit check with the declared tolerance, self-collision excluding declared pairs). Hash helpers go in `src/hash.ts` (Web Crypto SHA-256, `trajectoryHash` over exact little-endian bytes).
    - Every `new mujoco.Mj*` is inside a `Scope` or an `EngineEntry`. The model constants are declared in the MJCF text or the World_Config; nothing reads the clock, a random source, or the environment.
    - _Requirements: 3.14, 4.1, 4.2, 4.3, 4.5, 4.6, 5.7, 17.13_

  - [ ] 7.2 Write the engine tests with the real module
    - `worlds/drawer-arm/tests/engine/engine.test.ts` (no mock): the MJCF builds with primitive geoms only and no asset file; the arena size reported by the engine is at most 2 MiB; the layout test (`integration.subarray(qpos)` equals `data.qpos` copied directly); the restore round trip is bit-exact over a few hundred steps; `readArray` throws `view-detached` on a stale view (force heap growth); `Scope` deletes its objects in `finally` even when the body throws; `dispose` is idempotent; the model cache never exceeds 24 entries and deletes evicted models; a source-scan test requires every `new mujoco.Mj*` to be inside a `Scope` or an `EngineEntry` and requires that no file outside `engine/` imports `@mujoco/mujoco`.
    - _Requirements: 3.14, 4.1, 4.2, 4.3, 4.5, 4.6, 17.13_

  - [ ] 7.3 Implement the controller, inverse kinematics, and noise and delay
    - `src/controller.ts`, `src/ik.ts`, and the noise and delay code: `runAction(engine, entry, s, a, opts)` with the phases of `reach`, `grasp`, `pull`, `release` as in the design (steps counted before any simulation, limit errors `action exceeds time limit` and `plan exceeds time limit` leave the state unchanged and nothing simulated, precondition failures are no-ops with `precondition-not-met`, a failed step returns the partial monitors, unstable simulation returns `simulation unstable`). Inverse kinematics is damped least squares with a fixed iteration count from the World_Config and a 3 by 3 inverse by cofactors. `target` is a world-frame point and is never corrected by the variant handle offset. One noise draw per step. The delay ring is part of the state.
    - Use only `+ - * /`, comparisons, `Math.sqrt`, `Math.min`, `Math.max`, `Math.abs`, `Math.floor`, `Math.ceil`, and `**` with integer exponents. Never `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `log`, `pow`, `Math.random`, or the clock.
    - _Requirements: 3.6, 3.7, 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 6.6_

  - [ ] 7.4 Write the controller unit tests and the banned-function scan
    - `tests/controller.test.ts`: one example per action type on the Base_World (reach moves the hand, grasp sets `holding`, pull on a held handle moves the drawer, release clears `holding`); `pull` without a hold leaves the drawer where it is and reports success; an action over the per-action limit and one over the per-plan limit fail with the limit errors and an unchanged state; a forced non-finite value (fault injection in the engine stub of the test only) gives `simulation unstable`; the handle offset moves where a fixed `reach` target lands relative to the handle.
    - `tests/scan/math-ban.test.ts`: scan `controller.ts`, `ik.ts`, `prng.ts`, `variant.ts`, and the noise and delay code for the banned `Math` functions, `Math.random`, `Date`, and `**` with a non-integer exponent.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 3.6, 3.7_

  - [ ] 7.5 Implement the world, diff, scene, fingerprint, reference execution, and variant job
    - `src/world.ts` (`createGhostHandWorld`, `GhostHandWorld` with the six functions plus `adopt`, `frames`, `failureMonitors`, `stepNote`, `releaseTraces`, `referenceExecute`, `resetReference`, `heapBytes`, `dispose`; snapshot ids are an integer counter `s<n>`; `snapshot()` is a `structuredClone` of the live Reference_State; `step` validates, runs `runAction` on an entry keyed by the model params of `s.state.variant`, returns a new snapshot or a failed snapshot with `state` equal to the input and stores partial monitors; `effectsOutside` validates and returns `[]`, throwing an error that names the invalid argument for an invalid action, with no I/O), `src/diff.ts` (`diffStates` with `Object.is` per element; kinds `drawer-displacement`, `vase-displacement`, `arm-pose`, `state-field`; fixed sort by `kind` then `field`), `src/scene.ts` (JSON-only Scene, finite numbers, `-0` written as `0`, no typed array), `src/fingerprint.ts` (per-resource SHA-256 manifest of `state/qpos`, `state/qvel`, `state/integration`, `state/steps`, `state/controller`, `state/prng`, `state/delay`, `state/variant`, `state/monitors`; total hash over the sorted manifest), `src/reference.ts` (`referenceExecute` with one continuous `load`, no restore between actions; and the `DeterministicTestAdapter` built on it with its own engine), `src/run-variant.ts` (`VariantJob`, `VariantOutcome`, `runVariantJob` with failure-monitor folding and `firstTouch`), `src/reference-plan.ts` (`REFERENCE_PLAN`, a fixed valid plan of the four action types of at most 5 simulated seconds), the frame recorder (stride 9 steps), and `world.config.ts` (`create` is now `createGhostHandWorld`; `deterministic` stays `false`). Export the public surface from `src/index.ts`.
    - **Property 20 tests compare the ghost diff with this independent re-execution; both share `runAction`, `capture`, and `diffStates`.** The world holds no state between runs.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.15, 6.6, 8.11, 17.3_

  - [ ] 7.6 Write the world example tests
    - `tests/world.test.ts` (real module): `const w: World<GhostHandState, GhostHandAction> = ghostHandWorld` compiles; `snapshot()` is a deep copy (mutating either leaves the other unchanged); `step` leaves the input state structurally unchanged and returns a unique id; an out-of-range action and an over-limit action return a failed snapshot with a non-empty `error`, an equal state, and no throw; `diff` of two equal states is empty and of different states is non-empty and sorted; `effectsOutside` returns `[]` for a valid action and throws naming the argument for an invalid one; `step` never writes the live state; the registration metadata is `deterministic: false` at this point; releasing the world leaves no wrapped object undeleted (counted by a wrapper in the test).
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.12, 3.13, 3.14_

  - [ ] 7.7 Measure the short-run budget and write `tests/pbt-budget.json`
    - **Early measurement task.** Create `worlds/drawer-arm/scripts/measure-budget.mjs`. Measure `stepCostMicros` (includes monitors and the controller), run a plan that uses the whole per-plan limit as the worst-case example, and run `verifyWorld` on the Base_World once with the chosen count to time it. Set `shortRuns = clamp(floor(25000 / worstExampleMs), 20, 100)` as in the design, and write `worlds/drawer-arm/tests/pbt-budget.json` with `shortRuns`, `measuredWorstExampleMs`, `stepCostMicros`, `measuredOn { node, machine, date }`, and `rationale` (required and non-empty when `shortRuns` is below 100; it states the number, the measurement, and that the Nightly_Run uses the full count of Requirement 18).
    - If even 20 does not fit in the 60 s budget, stop and reopen design D14 (shorten the per-plan limit) before lowering coverage.
    - Append the numbers to the `Short-run budget and verifyWorld timing` section of `docs/measurements.md` with the date, Node version, and machine. Write a test `tests/budget.test.ts` that fails when the file is missing, `shortRuns` is outside 20 to 100, or `rationale` is empty while `shortRuns` is below 100.
    - _Requirements: 17.1, 17.11, 17.12_

- [ ] 8. Pure pipeline, self-check, overlay model, and reducer
  - [ ] 8.1 Implement the pure pipeline modules
    - **Depends on PR-1 and PR-2 only through the capability probes (task 6.8).** Under `apps/ghost-hand/src/pipeline/`: `types.ts` (`GhostHandVariantResult = VariantResult & { jointLimitExceeded?: boolean; selfCollisionOccurred?: boolean }`, `VariantRow`, `GhostRun`, `RunInput`, `OverlayInput`), `derive.ts` (`deriveVariantResult(outcome, forbidden, caps)`: `success` only without an engine error, without failed steps, and with the final drawer displacement at least the target opening; `contactForceN` from the monitors; `forbiddenContactOccurred` when a touched Contact_Name is in the union of the `forbidden_contacts` lists; `jointLimitExceeded` and `selfCollisionOccurred` always taken from the monitors; `variantId` is `variant-<index>`), `verdict.ts` (`applyVerdictFloor(v, p1Equal)` adds the violation `isolation-check` and the verdict `block` when the fingerprints differ), `claims.ts` (`buildIsolationClaims(p1Claimed, caps)` returns `{ mode: 'playground', p1Claimed, p5Claimed: false, p6Claimed: false }` with no `reason`; the PR-3 field is added in one function only when `caps.bannerNotApplicable`), `unknown-contacts.ts` (`findUnknownContacts(wardSet, contactNames)` returns the distinct unknown entries in order of first appearance), `rows.ts` (rows with `base` first), and `notices.ts` (the fallback notice list: the joint-limit status text while `jointSelfWard` is false; the provisional-wording note while `claimsOptional` is false; the no-physics-ward text).
    - The fields are not folded into `success` or `forbidden_contacts`. The module reads no clock, random source, or environment variable.
    - _Requirements: 4.7, 6.10, 8.3, 8.4, 8.5, 8.6, 8.7, 9.3, 9.5, 9.6, 9.7, 9.9, 10.1, 10.2, 10.3_

  - [ ] 8.2 Write the property test for claim honesty
    - **Property 6: Claim honesty (GH-P6)**
    - **Validates: Requirements 9.6, 10.1, 10.2, 10.3**
    - File: `tests/model/p06-claims.test.ts`. Generators: pairs of fingerprint hash strings (equal and different), capability states, engine verdicts. Assert `p1Claimed === equal`, `p5Claimed` and `p6Claimed` always false, `mode === 'playground'`, no `reason`; `applyVerdictFloor` gives `block` whenever the pair differs, equals the input verdict when equal, adds one `isolation-check` violation and keeps the original violations.

  - [ ] 8.3 Write the property test for incomplete variants
    - **Property 8: Marking a variant as failed never lowers the verdict (GH-P8)**
    - **Validates: Requirements 8.5, 9.6, 18.2**
    - File: `tests/model/p08-incomplete-variants.test.ts`. Generators: lists of 1 to 20 Variant_Results (optional fields present or absent), WardSets with a `physics` Ward, replacement positions. Set `success` to `false` on one result and leave its other fields unchanged (design D23). Assert the `WardEngine.evaluate` verdict is not lower in the order `pass < warn < block`, and the verdict after the floor is not lower.

  - [ ] 8.4 Write the property test for the variant result derivation
    - **Property 9: Forbidden-contact derivation is monotone and exact**
    - **Validates: Requirements 8.4, 8.5, 8.6, 18.3**
    - File: `tests/model/p09-derive.test.ts`. Generators: variant outcomes (any touched set, failed steps, final displacement, monitor flags) and pairs of forbidden lists where the second is a superset. Assert monotonicity of `forbiddenContactOccurred`, equivalence with "the touched set meets the list", `success` false for a failed step or an engine error, `contactForceN` equal to the monitor maximum, `variantId` form `variant-<index>`.

  - [ ] 8.5 Write the property test for unknown contact names
    - **Property 21: Unknown forbidden-contact names are all reported**
    - **Validates: Requirements 4.7**
    - File: `tests/model/p21-unknown-contacts.test.ts`. Generators: WardSets whose `physics` Wards hold arbitrary strings mixed with valid Contact_Names. Assert the exact distinct unknown entries in first-appearance order, and an empty list when all are valid.

  - [ ] 8.6 Write the tests of the behavior before PR-1, PR-2, and PR-3 land
    - **Depends on PR-1, PR-2, and PR-3 through the capability probes (task 6.8). These tests run on the installed packages and assert the pre-landing behavior when the probe says a prerequisite is missing.**
    - `tests/model/prerequisites.test.ts`. While `jointSelfWard` is false: the monitors still record both facts, the variant row shows them, `Joint-limit and self-collision wards are not active in this build.` is in the notices, no claim text for that ward exists, and the facts are not folded into `success`. While `claimsOptional` is false: the message is produced with `claims: { p5: false, p6: false }` and the provisional-wording note is in the notices; no requirement is reported as met by dropping a line of the message. While `bannerNotApplicable` is false: the claims carry `p5Claimed: false` and `p6Claimed: false` and no PR-3 field. Post-landing legs run only when the probe reports the capability and otherwise report `skipped (PR-n not landed)`.
    - _Requirements: 8.7, 9.9, 10.1, 21.4, 21.5, 21.6_

  - [ ] 8.7 Implement the Determinism_Self_Check
    - `apps/ghost-hand/src/self-check.ts`: `runSelfCheck(createWorld, golden)` runs `REFERENCE_PLAN` twice on two fresh Base_World instances, compares the two Trajectory_Hashes with each other and with the Golden_Hash, and runs the restore check (run a prefix to a snapshot, run the remainder twice from it, compare the two final states with the structural comparison). Returns `{ state: 'pending' }`, `{ state: 'ok', hash, restoreOk: true }`, or `{ state: 'failed', reason }` with reasons `not-reproduced`, `restore-mismatch`, `engine-error`, `no-secure-context`. Missing `crypto.subtle` gives `no-secure-context`. The first 12 hex digits are used for the display text.
    - _Requirements: 10.7, 10.9, 3.11_

  - [ ] 8.8 Implement the overlay model and color tokens
    - `apps/ghost-hand/src/overlay/`: `view-model.ts` (`buildOverlayViewModel(input)`: a `base` arm first, then exactly one ghost arm per variant in index order, `failed` if and only if `success` is false or `forbiddenContactOccurred`, `jointLimitExceeded`, or `selfCollisionOccurred` is true, `reasons` naming the conditions that hold; pure and computes no verdict), `geometry.ts` (shapes from `BODY_SHAPES`), `overlay-tokens.ts` (colors for both themes with `ContrastPair` records `{ id, role: 'text' | 'graphic', fg, bg }`), and `wcag.ts` (relative luminance and ratio). No `three` import in these files (only `renderer.ts` imports `three`, task 9.2).
    - _Requirements: 13.2, 13.3, 13.4, 13.8, 13.9, 15.4_

  - [ ] 8.9 Implement the app reducer
    - `apps/ghost-hand/src/reducer.ts`: pure `(state, event) -> state` over `plan-loaded`, `plan-error`, `run-started`, `run-finished`, `reference-executed`, `reference-reset`, `seed-changed`, `theme-toggled`, `grave-opened`, `grave-closed`. A Grave_Entry (`id` `g-<n>` from 1, `command` the actions as text joined by `; `, `recordedAt` as ISO 8601 UTC without milliseconds from an injected clock value carried by the event, `wardIds` distinct in first-appearance order, `detail` with `wardVerdict`, `claims`, `actionLabels`) is added only for a `block` run after an explicit user action; the list keeps at most 200 entries, drops the oldest on the 201st, and sets the drop text flag; the reducer stores a plan identity string so that `Execute on reference arm` is enabled only while the verdict of the last run is `pass` and the plan has not changed. No entry holds trajectory data or `taskText`. The reducer never reads the clock.
    - **Depends on the `ui-kit` implementation** for the `GraveEntry` type.
    - _Requirements: 12.7, 14.4, 14.5, 14.6, 14.7, 14.9_

  - [ ] 8.10 Write the property test for overlay coverage
    - **Property 7: Overlay coverage and failure marking (GH-P7)**
    - **Validates: Requirements 13.3, 13.8**
    - File: `tests/model/p07-overlay.test.ts`. Generators: lists of 1 to 20 Variant_Results (all combinations of the four flags, optional fields absent), matching frames. Assert one `base` arm first, one ghost arm per variant in order with its `variantId`, the exact failed rule, and `reasons` equal to the conditions that hold.

  - [ ] 8.11 Write the overlay token contrast test
    - `tests/model/overlay-contrast.test.ts`: enumerate every `ContrastPair` of `overlay-tokens.ts` for both themes with the independent luminance code of `wcag.ts` (check `wcag.ts` itself with black on white equal to 21, symmetry, and ratio at least 1); require at least 3:1 for `graphic` and at least 4.5:1 for `text`. If a pair fails, change the token, never the threshold.
    - _Requirements: 13.9_

  - [ ] 8.12 Write the property test for the graveyard
    - **Property 23: The graveyard keeps the newest 200 entries**
    - **Validates: Requirements 14.4, 14.5, 14.9**
    - File: `tests/model/p23-graveyard.test.ts`. Generators: sequences of Ghost_Runs with generated verdicts, explicit and non-explicit actions. Assert one entry per blocked explicit run and none otherwise, ids `g-1`, `g-2`, and so on without gaps, never more than 200 entries, and the oldest dropped with the drop text on the 201st.

  - [ ] 8.13 Write the self-check tests
    - `tests/model/self-check.test.ts`: the `ok` and `failed` outcomes with a stubbed Golden_Hash (the two texts of Requirement 10.7); the restore-failure text; `no-secure-context` when `crypto.subtle` is missing; no P2 or P8 claim text is produced when the check failed or is pending (Requirement 10.9).
    - _Requirements: 10.7, 10.9, 18.4_

- [ ] 9. Variant executors and the 3D renderer
  - [ ] 9.1 Implement the variant executors and the worker
    - `apps/ghost-hand/src/exec/executor.ts` (`VariantExecutor` with `run(jobs)` returning outcomes ordered by `index`, and `dispose`), `inline.ts` (`createInlineExecutor(factory)` with its own world, never the reference world), `pool.ts` (`createPoolExecutor({ size, spawn })`: a queue, at most `clamp(hardwareConcurrency - 1, 1, 4)` workers, results written into `results[job.index]`, frames sent as transferables, one inline retry after a worker error or `messageerror`, then an outcome with `engineError`; the pool never sorts by arrival), and `src/worker/sim-worker.ts` (a message loop around `runVariantJob`). Without `Worker`, and in Node, the inline executor is used. No `SharedArrayBuffer`.
    - _Requirements: 2.2, 8.7, 8.10, 6.5_

  - [ ] 9.2 Implement the Three.js renderer
    - `apps/ghost-hand/src/overlay/renderer.ts` is the only module that imports `three`. `createOverlayRenderer(canvas)` returns an `OverlayRenderer` (`setModel`, `setFrame`, `play`, `setCameraPreset('front' | 'side')`, `setTheme`, `dispose`) or `{ unavailable: true }` when no WebGL context can be created. Geometry from `CapsuleGeometry`, `BoxGeometry`, `CylinderGeometry` only, no external model, texture, or font file. Ghost arms are translucent and desaturated; a failed arm uses the red token and a fade of at most 900 ms once per run; under `prefers-reduced-motion: reduce` there is no autoplay and no fade, the final frame is shown, failed arms use a fixed reduced opacity, and the frame stepping is by an `<input type="range">` supplied by the component. No element flashes more than 3 times per second; no full-screen flash. `dispose` disposes every geometry, material, and the `WebGLRenderer`. The renderer computes no verdict or failure state.
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.11, 13.12, 13.13, 15.5, 15.6_

- [ ] 10. Checkpoint - foundations
  - Run after all tasks of waves 0 to 9 are complete. Run `pnpm --filter @ghost-run/drawer-arm test`, `pnpm --filter @ghost-run/ghost-hand test`, `typecheck`, and `lint`. Confirm: `docs/measurements.md` holds the probe results and the budget entry; `tests/pbt-budget.json` exists; the property tests of Properties 1, 2, 3, 4, 6, 7, 8, 9, 19, 21, and 23 pass; the steering files changed only as approved; `capabilities.expected.json` matches the probes. Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Run pipeline and demo scenarios
  - [ ] 11.1 Implement `runGhostHand`
    - **Depends on the `wards-config` implementation (`parseWards`), on PR-1 and PR-2 only through the capability probes (task 6.8), and on tasks 7.5, 8.1, 8.7, and 9.1.** `apps/ghost-hand/src/pipeline/run.ts`: validate every action first (`GhostHandRunError('invalid-plan')` before any engine call); fingerprint before; one snapshot; `ghostRun` on the Base_World; one `VariantJob` per index from `sampleVariant`; executor run; fingerprint after; `p1.equal` from the two hashes; `variantResults` in ascending index order; `WardEngine.evaluate`; the P1 floor; the message from `renderMessage` (context without `claims` once `claimsOptional`, with `claims: { p5: false, p6: false }` plus the provisional note before; no Seance link base; the fixed P1-failure text when the hashes differ); rows, claims, overlay input, notices, unknown contact names; `world.releaseTraces` after copying what is needed. The function reads no clock, random source, or environment variable and implements no ward rule, threshold, or message text of its own.
    - _Requirements: 4.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 8.10, 8.11, 9.3, 9.6, 9.8, 9.9, 10.1, 10.2, 10.3_

  - [ ] 11.2 Write the renderer tests
    - `tests/dom/overlay.test.ts` with a stubbed `three` renderer: counters prove every geometry, material, and renderer is disposed on `dispose` and repeated runs do not grow the live-object count; `getContext` returning `null` gives `{ unavailable: true }`; reduced motion gives no autoplay, no fade, a fixed reduced opacity for failed arms, and a keyboard-operable slider that steps frames; the fade runs at most once per run and lasts at most 900 ms; no more than 3 visual flashes per second in the fade schedule; the two camera presets are reachable by buttons.
    - _Requirements: 13.2, 13.5, 13.6, 13.11, 13.12, 13.13, 15.5_

  - [ ] 11.3 Write the property test for the run result order
    - **Property 22: The run holds one variant result per variant, in order**
    - **Validates: Requirements 6.10, 8.1, 8.3, 9.3**
    - File: `tests/model/p22-run-order.test.ts` with a stub executor (the engine is not replaced; only the pool is). Generators: plans, seeds, counts 1 to 20. Assert `variantResults` has the count length with `variant-0` to `variant-<count-1>` in ascending order, the `base` row first and not counted among the variants, and `engineVerdict` equal to `WardEngine.evaluate` of the same report.

  - [ ] 11.4 Write the Wards_File tests
    - **Depends on the `wards-config` implementation.** `tests/model/wards.test.ts`: `parseWards` of `worlds/drawer-arm/wards.yaml` returns `ok: true`; the file holds exactly one `physics` ward `gentle-hands` with the declared thresholds and `vase` in `forbidden_contacts` and no `path`, `sql`, or `egress` ward; the bundled `?raw` text equals the file bytes (and the Variant_Config text likewise); exactly one canonical wards file exists for Ghost Hand; with a WardSet that has no `physics` ward the run still happens and the notice text is produced; a `forbidden_contacts` entry that matches no body produces the `Ward entry "<name>" matches no body in this world.` text; the app offers no wards editor.
    - _Requirements: 4.7, 9.1, 9.2, 9.4, 9.7, 9.10_

  - [ ] 11.5 Create the demo plans, tune the provisional numbers, and record them
    - Create `apps/ghost-hand/plans/first.plan.json` (`fast pull`, `origin: scripted`) and `plans/revised.plan.json` (`slow pull, strong grip`, `origin: scripted`, `revisionOf` naming the first plan), both valid by `parsePlanFile` and written in ASCII with `\u` escapes only. Create `apps/ghost-hand/scripts/measure-demo.mjs` that runs both plans with the default seed, count 8, and the Wards_File on the pure pipeline in Node.
    - Tune the provisional values (scene dimensions, ranges, plan values, `targetOpeningM`, the variant ranges, and the plan values) in `world-config.ts`, `variant-config.json`, and the plan files until: the first plan gives `block`, names `gentle-hands`, and has at least one failed variant; the revised plan gives `pass`, every variant has `success: true`, and the maximum `contactForceN` is at most `max_contact_force_n`; the unperturbed Base_World opens the drawer to the target in both; the arm reach covers both the handle and the vase. Do not copy any number from Experiment C into a test.
    - Re-run the budget script of task 7.7 and update `pbt-budget.json` if `shortRuns` changes. Append to `docs/measurements.md`: the shipped seed and the variants it produces, the failed and passed variant counts derived from the results, the maximum contact force, the re-measured `verifyWorld` timing, each labelled with the date and environment.
    - _Requirements: 11.4, 12.1, 12.2, 12.3, 12.4, 12.6, 17.11, 19.8_

  - [ ] 11.6 Write the demo scenario tests
    - **Depends on PR-2 only through the message path (the provisional note appears while PR-2 has not landed).** `tests/model/demo.test.ts` on the pure pipeline in Node without a browser: the first plan gives `block`, the message names `gentle-hands`, at least one Variant_Result has `success: false`; the revised plan gives `pass`, every Variant_Result has `success: true`, and the maximum `contactForceN` is at most `max_contact_force_n`; both plans open the drawer in the Base_World; the failed-variant count is derived from the results and never hard-coded; the Plan of each demo scenario equals the actions of its Plan_File; the revised file's `revisionOf` names the first plan; the P4-direction example: a copy of the WardSet whose `max_contact_force_n` is set below the maximum `contactForceN` read from the results gives a verdict not lower than the original, and the threshold is derived from the measured values.
    - _Requirements: 9.5, 9.11, 11.4, 12.2, 12.3, 12.4, 12.5_

- [ ] 12. Engine-bound property tests and the registration gate
  - [ ] 12.1 Write the property test for ghost isolation
    - **Property 10: A ghost run leaves reality unchanged (contract P1)**
    - **Validates: Requirements 3.3, 3.4, 3.5, 8.2, 8.9, 8.10, 17.4, 17.8**
    - File: `worlds/drawer-arm/tests/p10-isolation.test.ts` and `apps/ghost-hand/tests/model/p10-pipeline-isolation.test.ts`. Generators: plans of 1 to 50 valid actions, and a generated prefix that moves the live Reference_State first. Assert the fingerprint hash of the live Reference_State after `ghostRun`, after every variant run, and after `runGhostHand` equals the hash before; run the same plan with `Date.now` and `Math.random` replaced by functions that throw and require equal results. Claim scope: per run for the in-memory Reference_State; no hardware, Docker, or untracked state.

  - [ ] 12.2 Write the property test for bit-exact snapshot reuse
    - **Property 11: A reused snapshot reproduces a run bit for bit (contract P3)**
    - **Validates: Requirements 3.4, 6.6, 17.5**
    - File: `tests/p11-restore.test.ts`. Generators: plans, prefixes, and Variant_Params from the sampler. Assert `step` leaves the input snapshot structurally unchanged (every typed array element, `-0` and `0` distinguished) and two `ghostRun` calls from the same snapshot end in element-equal states including the integration vector, the PRNG state, and the delay buffer.

  - [ ] 12.3 Write the property test for no carried state
    - **Property 12: No state is carried between runs**
    - **Validates: Requirements 3.14, 3.15, 17.9**
    - File: `tests/p12-no-carry.test.ts`. Assert equal reports (states, `Change[]`, results) from a fresh world and from a long-lived world that already ran other plans including failing ones; add one fixed-plan example that the WebAssembly heap size after run 40 equals the size after run 1.

  - [ ] 12.4 Write the property test for invalid actions
    - **Property 13: Invalid actions fail without clamping or throwing**
    - **Validates: Requirements 3.6, 5.2**
    - File: `tests/p13-invalid-actions.test.ts`. Generators: valid action types with at least one value outside its range, not a number, or not finite, and valid actions. Assert `validateAction` is not ok and changes nothing; `step` returns `success: false`, a non-empty `error`, an equal state, and does not throw; a valid action keeps all values.

  - [ ] 12.5 Write the property test for the diff
    - **Property 14: Diff is complete, pure, and ordered**
    - **Validates: Requirements 3.8, 3.9**
    - File: `tests/p14-diff.test.ts`. Generators: states reached by generated plans, a state against itself and a copy. Assert empty if and only if the states are equal under `Object.is` per element in every field, sorted by `kind` then `field`, equal results on a second call, and no input mutation.

  - [ ] 12.6 Write the property test for the Scene
    - **Property 15: Scene is JSON-safe**
    - **Validates: Requirements 3.10**
    - File: `tests/p15-scene.test.ts`. Assert `JSON.parse(JSON.stringify(render(s)))` is recursively equal to `render(s)`, every number finite, no `-0`, and no typed array.

  - [ ] 12.7 Write the property test for the fingerprint
    - **Property 16: Fingerprint is sensitive and stable**
    - **Validates: Requirements 3.11**
    - File: `tests/p16-fingerprint.test.ts`. Assert a single flipped bit in any tracked resource changes that manifest entry and the total hash, equal states give equal fingerprints, and every manifest value is a 64-character lowercase hex string.

  - [ ] 12.8 Write the property test for plan limits
    - **Property 17: Valid plans complete within the declared limits**
    - **Validates: Requirements 5.4, 5.5, 3.12**
    - File: `tests/p17-limits.test.ts`. Generators: plans of 1 to 50 valid actions including plans that start with `pull` or `release`, repeat `grasp`, or ask for moves that cannot finish in time. Assert no throw through `ghostRun`, the total simulated time of successful steps never exceeds the per-plan limit, a step over a limit fails with the limit error and an unchanged state, and `pull` without a hold leaves the drawer unchanged and reports `success`.

  - [ ] 12.9 Write the property test for frame decimation
    - **Property 18: Recorded frames respect the decimation limit**
    - **Validates: Requirements 8.11**
    - File: `tests/p18-frames.test.ts`. Assert frames per simulated second never exceed 60 and consecutive actions concatenate without a gap larger than the stride. Frames never enter the Trajectory_Hash.

  - [ ] 12.10 Write the property test for the ghost diff against the reference diff
    - **Property 20: The ghost diff equals the reference diff (contract P2)**
    - **Validates: Requirements 10.6, 17.3, 3.13**
    - File: `tests/p20-ghost-vs-reference.test.ts`. Assert the flattened `Change[]` of `ghostRun` on the Base_World deep-equals the `Change[]` of the reference execution of the same plan and that the final states are equal, by the same engine build in the same environment. Claim scope: the Tested_Environments only; variant runs excluded; the test says nothing about hardware. The page text for this property stays hidden until task 18.2.

  - [ ] 12.11 Record the Golden_Hash
    - **Run on the Reference_Machine.** Compute the Trajectory_Hash of `REFERENCE_PLAN` on the Base_World in Node.js 20.20.2, run it twice, and require both hashes to be equal. Write `worlds/drawer-arm/tests/golden.json` with `{ planId, hash, recordedWith: { node, machine } }` (the `chrome` field is added by task 17.1 only after Chrome reproduces the hash). A test requires the Node hash to equal `golden.json` and fails otherwise. Never overwrite a differing hash automatically.
    - Append the hash, Node version, and machine to the `Determinism golden hash` section of `docs/measurements.md`.
    - _Requirements: 10.7, 17.7, 17.8_

  - [ ] 12.12 Add the `verifyWorld` contract test and register `deterministic: true`
    - **Depends on the `kiro-integration` implementation:** the `contract-pbt` hook runs this test on every save in `worlds/**` and must finish within 60 s. Create `worlds/drawer-arm/tests/contract.test.ts`: `verifyWorld(world, { id: 'drawer-arm', deterministic: true, wardSet, testAdapter, actionArb, numRuns: shortRuns })` on the Base_World and a second call on a world whose start state is `applyVariant(initial, sampleVariant(<fixed seed>, 0, config))`, with the `Wards_File` as `wardSet`, a `testAdapter` built on `referenceExecute` with its own engine, and an `actionArb` that generates only valid actions. Both calls must resolve without `VerificationError`, each under a 45 s time guard that prints the elapsed time.
    - Only after both calls pass, set `deterministic: true` in `worlds/drawer-arm/world.config.ts`. The README and the world README state that the flag is limited to the Tested_Environments (task 18.4 writes the README sentence).
    - _Requirements: 3.13, 17.1, 17.2, 17.3, 17.11_

  - [ ] 12.13 Write the property test for variant determinism and partition independence
    - **Property 5: Variant determinism and partition independence (GH-P4)**
    - **Validates: Requirements 6.5, 8.7, 8.3, 17.6**
    - File: `apps/ghost-hand/tests/model/p05-determinism.test.ts`. Generators: seeds, counts 1 to 20, valid plans, worker counts 1 to 4, permutations of completion order, run through the inline executor and a simulated pool (a scheduler that completes jobs in the generated order). Assert equal Variant_Params, Variant_Results, Trajectory_Hashes, and `GhostRun` for every distribution. Claim scope (P8): Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac only. The real-Worker leg runs in task 17.1.

- [ ] 13. Checkpoint - world properties and demo
  - Run after all tasks of waves 10 to 13 are complete. Run the full test suites of both packages, `typecheck`, and `lint`. Confirm: Properties 5, 10 to 18, 20, and 22 pass; the contract test passes twice and `deterministic` is `true`; `golden.json` and `pbt-budget.json` exist; both demo scenarios give the verdicts of Requirement 12 with derived numbers only; `docs/measurements.md` holds the demo numbers, the budget, and the golden hash; no test contains a measured pass count. Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Screen composition and Node entry point
  - [ ] 14.1 Build the React screens
    - **Depends on the `ui-kit` implementation (Candle with Claim_Banner, Graveyard, Seance_View, Lights_Toggle, `escapeForDisplay`; read `ui/src/index.ts` for the exact exported names), on the `wards-config` implementation, on PR-3 only through `caps.bannerNotApplicable` (the banner shows P5 and P6 as not claimed until PR-3 lands), and on tasks 8.7, 8.9, 9.2, 11.1, and 11.5.**
    - `apps/ghost-hand/src/main.tsx`, `App.tsx`, and `components/` (`PlanPanel`, `SeedInput`, `VariantTable`, `OverlayView`, `ClaimsPanel`): layout from top to bottom as in the design (Candle with Claim_Banner, claim and scope texts, plan panel, overlay with two camera preset buttons and a frame slider, variant table, the `Message the agent receives` panel, controls, Graveyard with Seance_View, Lights_Toggle starting in the Theme `dark`). The shell takes an injected `clock` and is the only place that reads time. The Mirror_World is not used and the Seance_View keeps `changes not recorded`. Every string from a Plan_File, a wards error, or the variant table passes through the Display_Escaper. The page shows the texts of `texts.ts`: P1 failure alert, P5 and P6 line, Docker line, determinism check lines, P8 scope line, unknown-ward-entry status, no-physics-ward status, the joint-limit status text and the provisional-wording note while their capabilities are missing, the WebGL fallback, the engine start failure alert, and the secure-context alert. No P2 text is rendered (the flag is off). The variant table has one row per variant and one for `base` with `variantId`, the Variant_Params, the final drawer displacement, the maximum contact force, whether the vase was touched, and a `passed` or `failed` status with an icon, in a monospace font. The 3D canvas has an accessible name that points to the table. Seed input uses `parseSeedInput`. A polite live region announces the Candle state and the number of failed variants. No element hides a number, identifier, or status behind an effect; no sound; no analytics; no storage; no external origin. The app uses the words `sealed` and `isolated` in no fixed text.
    - _Requirements: 2.8, 4.7, 6.7, 6.9, 9.7, 9.8, 9.9, 10.1, 10.3, 10.4, 10.5, 10.8, 10.11, 11.5, 13.7, 13.11, 13.13, 14.1, 14.2, 14.3, 14.10, 14.11, 15.1, 15.2, 15.3, 15.4, 15.7, 15.8, 15.9, 15.10_

  - [ ] 14.2 Add plan controls, the reference execution, and `Play demo`
    - In the same app files, after task 14.1: the controls `Load plan file` (read in the browser, never uploaded), `Download plan file`, `Run ghost`, `Clear plan`, the scenarios `fast pull` and `slow pull, strong grip`, `Execute on reference arm` (enabled only while the last run is `pass` and the plan is unchanged), `Reset reference arm`, and `Play demo` (runs the first plan, shows the block, loads the revised plan, runs it, shows the pass, enables the execute control, every step also on its own button for keyboard use). Each `parsePlanFile` error is shown as `<field>: [<code>] <message>` in a `role="alert"` element through the Display_Escaper while the previous plan is kept. The Plan_Origin text (`Recorded plan: replayed here, not decided by an LLM in this page.` or `Scripted plan: not decided by an LLM in this page.`) is shown beside the plan, and the revised plan always shows it. `Execute on reference arm` calls `world.referenceExecute(plan)`, animates the result, shows the final drawer displacement, shows `The "real" arm here is a reference simulation, not hardware.` wherever the Reference_Arm is named or executed, and computes the diff comparison. The P2 check line is rendered only when `P2_TEXT_ENABLED` is true and the self-check passed; until task 18.2 it is not rendered. `Reset reference arm` restores the Reference_State and clears the P2 check text.
    - A recorded-plan hand-off note: the recorded revised plan is produced by a real Kiro session through `ghost-hand-run` (task 14.3); this task only ensures that a recorded Plan_File loads and shows the recorded text.
    - _Requirements: 10.6, 10.9, 10.10, 11.5, 11.6, 11.7, 11.10, 12.1, 12.7, 12.8, 12.9, 12.10, 12.11, 14.4, 14.8_

  - [ ] 14.3 Implement the Node entry point
    - **Depends on the `wards-config` implementation (default entry point `parseWards` and `formatConfigError`; the file is read with `node:fs/promises` and parsed from text).** `apps/ghost-hand/src/cli/main.ts` (not in the browser import graph), built by a `build:node` script to `apps/ghost-hand/dist-node/cli.js`: `ghost-hand-run <plan.json> --wards <wards.yaml> [--seed <uint32>] [--variants <n>] [--variant-config <file>] [--json]` and `ghost-hand-run validate <plan.json>`. It reads only the paths it is given, runs `runGhostHand` with an inline executor, prints the `renderMessage` message to standard output (with `--json` it first prints one JSON line `{ verdict, wardIds, failedVariants }` without file content), and reports the self-check result as information on standard error with no P1 claim. Exit codes: `0` pass, `1` warn, `2` block, `64` usage error, `65` invalid plan, wards, or variant file (each error as `<field>: [<code>] <message>`), `70` internal error. It calls no network or LLM API and prints no Canary or file content other than the message.
    - _Requirements: 11.8, 11.9_

  - [ ] 14.4 Write the Node entry point tests
    - `apps/ghost-hand/tests/cli/cli.test.ts`: spawn `dist-node/cli.js` with fixture plans and the Wards_File: exit `0` for a passing plan, `2` for the blocked first plan, `64` for bad arguments, `65` for an invalid plan and for an invalid wards file; stdout equals the message; `validate` exits `0` or `65` and prints nothing else; no file content appears in any output; a unit test of the verdict-to-exit-code mapping covers `1` for `warn`.
    - _Requirements: 11.8, 11.9, 18.4_

  - [ ] 14.5 Write the DOM behavior tests
    - `apps/ghost-hand/tests/dom/app.test.tsx` (jsdom, role-based queries, no axe dependency): every interactive element is reachable by Tab in DOM order, operable by Enter or Space, with no keyboard trap; a focus indicator of at least 2 px and 3:1 contrast in both themes; every status indicator and control has a non-empty accessible name and decorative icons are hidden from assistive technology; no `infinite` animation count and no animation over 1 s; with `prefers-reduced-motion: reduce` no CSS animation or transition above 0 duration; the live region text; a Plan_File with an unknown field is rejected with its field path and the previous plan is kept; strings with hidden code points pass through the Display_Escaper; the P1 failure alert (forced fingerprint difference); the Candle and the claims in both capability states (fallback texts shown, no claim made); the WebGL fallback text with `getContext` returning `null`; the Graveyard entry of a blocked run opened by keyboard and `Back to graveyard` returning focus to the Tombstone; the 201st entry shows the drop text; `Execute on reference arm` disabled until a pass and after a plan change; the P2 text is absent while `P2_TEXT_ENABLED` is false; the reference-simulation line is shown next to the Reference_Arm.
    - _Requirements: 10.3, 10.6, 10.10, 11.5, 12.7, 13.5, 13.8, 13.11, 14.8, 14.9, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 18.4_

  - [ ] 14.6 Write the network, storage, and start-up failure tests
    - `apps/ghost-hand/tests/dom/offline.test.tsx`: with `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by functions that throw (the single same-origin WebAssembly load is allowed by an allow-list of one URL), run both demo scenarios, the reference execution, and the Graveyard flow without any call; nothing is written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or the console; a module-load failure shows `The physics engine could not start in this browser.` in a `role="alert"` element, disables the run controls, and makes no claim; a missing `crypto.subtle` shows the secure-context alert and runs nothing.
    - _Requirements: 2.4, 2.5, 2.8, 20.5_

- [ ] 15. Build output, third-party notices, and hygiene
  - [ ] 15.1 Add the third-party notices build step
    - `apps/ghost-hand/notices/` holds the upstream license texts (MuJoCo Apache-2.0, Qhull, and every other component bundled in `mujoco.wasm` that `docs/research.md` lists) copied from the upstream source distribution, with the upstream URL and version of each recorded in `notices/sources.json`; `scripts/gen-notices.mjs` writes `dist/THIRD_PARTY_NOTICES.txt`; add the `notices` script to `package.json` and run it after the build. The Qhull license text must be present because its license requires its notice to travel with the binary. Do not use a license text from memory.
    - _Requirements: 1.11, 1.12_

  - [ ] 15.2 Write the source hygiene tests
    - `apps/ghost-hand/tests/scan/hygiene.test.ts`: no literal hidden code point and no literal HTML comment opener in `apps/ghost-hand/`, `worlds/drawer-arm/`, and `.kiro/specs/ghost-hand/` (excluding `node_modules` and `dist`), checked by the possession Scan_Entry_Point with the expected outcome `clean`; no `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML`, storage API, or `console.` of plan content; the browser import graph from `index.html` has no `node:` import and no `@ghost-run/wards-config/node`; fixtures use canary secrets and reserved domains only; no call to an LLM API in any source or script; `.gitignore` lists `apps/ghost-hand/dist` and the world build output.
    - _Requirements: 1.4, 1.5, 1.7, 1.13, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [ ] 15.3 Write the build output tests
    - `apps/ghost-hand/tests/dist/dist.test.ts` and the script `test:dist` (build, notices, then scan): no `.html`, `.css`, or `.js` reference to another origin (no `<script src>`, `<link href>`, `@import`, `url()`, or `fetch` target outside the page origin); the MuJoCo wasm is a same-origin asset referenced from the JavaScript; the build uses no `SharedArrayBuffer`; no analytics, telemetry, or CDN font; the third-party notices file exists and contains the Qhull license text; the bundle contains no `node:` specifier.
    - _Requirements: 1.11, 2.1, 2.2, 2.3, 2.5_

- [ ] 16. Checkpoint - app assembled
  - Run after all tasks of waves 14 to 17 are complete. Run the full test suites of both packages, `typecheck`, `lint`, `build`, and `test:dist`. Confirm: the Node entry point exit codes work; the hygiene scan is `clean`; no P2 text appears in the page; the fallback texts appear while PR-1, PR-2, or PR-3 is missing; the notices file is in `dist`. Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Browser harness and unmeasured timings
  - [ ] 17.1 Implement the Chrome harness without a new dependency
    - `apps/ghost-hand/tests/browser/run-chrome.mjs`: builds a harness page with Vite, serves it with `node:http`, starts the installed Chrome headless through its command line, and receives a JSON result by `POST`. Record `Chrome --version` first; if it is not Chrome 157, record the version and make no Tested_Environments claim from this run. Checks: the Trajectory_Hash of `REFERENCE_PLAN` on the main thread and in a Web Worker equals `golden.json` (a differing hash fails the suite; the hash is never edited), and only then set `recordedWith.chrome` in `golden.json`; Property 5 and Property 10 with real Workers; the page ready time (target 3.0 s) and the Ghost_Run time with 8 variants (target 2.0 s) and with 20 (target 5.0 s, when enabled); the memory growth over repeated runs and the WebAssembly heap size after run 40; and a cross-environment script that compares the Node hash and the two Chrome hashes with `golden.json`. If the harness cannot run on the Reference_Machine, record `harness: failed` with the reason in `docs/measurements.md` and report it for task 17.2.
    - Append the results to the `Browser timings` section of `docs/measurements.md` with the date, Chrome version, and machine. A run outside the Tested_Environments is recorded as additional evidence only.
    - _Requirements: 2.6, 3.14, 8.8, 10.7, 17.7, 17.9, 17.10_

  - [ ] 17.2 Playwright fallback (only if task 17.1 recorded `harness: failed`)
    - **Run only if task 17.1 recorded `harness: failed`.** If the harness worked, append `Playwright: not needed` to `docs/measurements.md` and mark this task done with no other change. Otherwise add `playwright` (Apache-2.0) as a development dependency of `apps/ghost-hand/`, driving the installed Chrome through the `channel` option and with no browser download (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), re-implement the same checks of task 17.1 on top of it, and add a README table row with the exact version and the license read from the installed package on the day it was added.
    - _Requirements: 1.3, 1.12, 17.7_

  - [ ] 17.3 Measure the 3D overlay frame time
    - **The frame time is unmeasured until this task runs.** Add a frame-time page to the harness and measure, on the Reference_Machine in Chrome, the median frame time of the Ghost_Overlay with 8 Ghost_Arms and with 20 Ghost_Arms. The requirement is a median of at most 33 ms with 8 arms. If it is not met, record the measured values and the cause and stop for the user's decision; do not change the target. Fill the `3D overlay frame time with 8 and 20 ghost arms` section of `docs/measurements.md` with the medians, the date, the Chrome version, and the machine. A test fails if the section still says `unmeasured`.
    - _Requirements: 13.10_

- [ ] 18. Claim scopes, disclosures, and README
  - [ ] 18.1 Write the claim-scope tests
    - `apps/ghost-hand/tests/model/claim-scope.test.ts`: the page texts of Requirement 10 are exactly the pinned strings of `texts.ts`; P1 is claimed only from equal fingerprints; P5 and P6 are never claimed; no Docker or physical-arm claim appears; the P8 scope sentence names Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac and is visible; P2 and P8 claim text is absent when the self-check failed or is pending; no P2 text at all while `P2_TEXT_ENABLED` is false; the recorded and scripted plan-origin texts and the reference-simulation line appear where required; no text uses the words `sealed` or `isolated`; no test file contains a measured pass count.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 10.11, 11.6, 12.12_

  - [ ] 18.2 Switch the P2 text on after the steering update
    - **Blocked until task 3.2 has landed and the user confirmed it.** Check that `.kiro/steering/world-contract.md` carries the P2 scope wording of task 3.2. If it does not, stop and report; do not flip anything. If it does, set `P2_TEXT_ENABLED = true` in `texts.ts` (the only edit of that file after task 6.2), render the P2 check line in the page with the scope wording "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware.", and update the claim-scope tests of task 18.1 to the enabled state. The P2 text is still hidden when the self-check failed.
    - _Requirements: 10.6, 10.9_

  - [ ] 18.3 Check the landed state of PR-1, PR-2, and PR-3
    - **Depends on PR-1, PR-2, and PR-3 (other specs).** Run the capability probes and compare them with `tests/capabilities.expected.json`. For each prerequisite that has landed: update the expected file, run the post-landing legs of the prerequisite tests (they now report `passed`, not `skipped`), confirm the fallback note or status text for it no longer appears, and only then allow the README to claim the dependent behavior (joint-limit and self-collision ward for PR-1, the message without the lowered-claim line for PR-2, "not applicable" for P5 and P6 for PR-3). For each prerequisite that has not landed: leave the fallback texts in place and the README without the dependent claim. List the result per prerequisite in the final checkpoint report.
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 8.6, 9.9_

  - [ ] 18.4 Write the Ghost Hand README section
    - Edit the README: the claim table of the Introduction (P1 per run for the in-memory page world, P2 for the base ghost against the reference execution within the Tested_Environments and only with the scope wording of task 3.2 and only if task 18.2 ran, P3 for all worlds, P4 as evidence from `core`, P8 within the Tested_Environments only, P5 and P6 not claimed); that the "real" arm is a reference simulation executed by the same engine and no physical robot is involved; that plan revision in the page is a replay of a recorded plan or a scripted plan and which one the shipped revised plan is (the `origin` of `plans/revised.plan.json`), plus the recording procedure of design D18 (run `ghost-hand-run`, read the block message, write the revised Plan_File with `revisionOf` and `recordedWith`, run `validate`, run again); the Tested_Environments, that Firefox, Safari, Linux, and x86 machines were not tested, and that the Determinism_Self_Check is a measurement in one browser and not a proof; macOS and Linux supported, Windows unverified, Chrome 157 the only tested browser; the single-thread build and Web Workers and that no special response headers are needed; the MuJoCo pitfalls (explicit model memory size, views that become empty when the WebAssembly memory grows, the deviation of the package README from the actual API, and `.delete()` of every wrapped object); the licenses (complete the table of task 4.3 and add the notices file and the asset sources); the `deterministic` flag is limited to the Tested_Environments; the variants the shipped seed produces and the measured numbers of the demo runs copied from `docs/measurements.md`, each labelled with the date and environment.
    - Claim the joint-limit and self-collision ward, the message without the lowered-claim line, or the "not applicable" banner only where task 18.3 reported the prerequisite as landed. Claim the possession scenario only if task 21.1 was done.
    - _Requirements: 1.9, 1.10, 1.12, 2.7, 3.13, 12.12, 15.9, 16.8, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8_

  - [ ] 18.5 Write the README consistency tests
    - `apps/ghost-hand/tests/scan/readme.test.ts`: the Ghost Hand README section contains the claim table rows, the reference-simulation statement, the recorded-or-scripted statement that matches the `origin` of `plans/revised.plan.json`, the Tested_Environments and not-tested list, the pitfalls list, the three license facts (`@mujoco/mujoco` 4.0.1 Apache-2.0 with no LICENSE file in the tarball, `three` 0.187.0 MIT, `@types/three` 0.187.0 MIT) and the Playwright row if and only if `playwright` is in a `package.json`; the README states no P2 claim unless `P2_TEXT_ENABLED` is true; it states the joint-limit ward only when the probe says `jointSelfWard`; every measured number in it appears with a date; no word `sealed` or `isolated` is used for the page.
    - _Requirements: 1.10, 12.12, 19.1, 19.2, 19.3, 19.4, 19.6, 19.8_

- [ ] 19. Cross-package lint bans (isolated task)
  - [ ] 19.1 Add the import bans for the Ghost Hand packages to `core`, `ui`, and `wards-config`
    - **Isolated task. It must NOT run at the same time as any other task that edits `core/`, `ui/`, or `wards-config/` in this spec or in another spec.** Precondition: the other specs have finished their changes to those packages, their test suites pass, and no other core-editing task is in progress.
    - Add the patterns `@ghost-run/drawer-arm`, `@ghost-run/drawer-arm/**`, `@ghost-run/ghost-hand`, `@ghost-run/ghost-hand/**`, `**/worlds/drawer-arm/**`, and `**/apps/ghost-hand/**` to the `no-restricted-imports` rule of `core/eslint.config.mjs`, `ui/eslint.config.mjs`, and `wards-config/eslint.config.mjs`, next to the existing entries. Change nothing else. Add one lint fixture test per package (a temporary file that imports `@ghost-run/drawer-arm` or `@ghost-run/ghost-hand`, ESLint run programmatically, a `no-restricted-imports` error asserted, the file removed in `finally`).
    - Run the `core`, `ui`, and `wards-config` suites and `pnpm lint`. Confirm `core/package.json` is unchanged.
    - _Requirements: 1.6_

- [ ] 20. Final checkpoint
  - Run `pnpm --filter @ghost-run/drawer-arm test`, `pnpm --filter @ghost-run/ghost-hand test`, `typecheck`, `lint`, `build`, `test:dist`, and `pnpm lint` for the workspace. Confirm: every property of the design (1 to 23) has a test with at least 100 examples in a Short_Run (engine-bound properties use `shortRuns`, with the written rationale if it is below 100); the Nightly_Run command was run at least once for the world contract tests, or the reason it was not is recorded in `docs/measurements.md`; `docs/measurements.md` has no `unmeasured` section left; the possession scan of the three folders is `clean`; the README license table lists every dependency with its license; the Ghost Hand claims match the landed prerequisites and the steering state; no task wrote to `docs/devlog.md`. Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Optional: forbidden-contact red thread (last task)
  - [ ]* 21.1 Implement the possession red thread for a forbidden contact
    - **Optional. Skip it for the MVP. This is the only optional task of the plan. It edits `possession` and `ui-kit`, which other specs own, so it needs the user's approval and the precondition of an isolated `core` edit (no other core-editing task in progress, all other suites passing).** If it is skipped, the README does not claim the possession scenario.
    - Add the value `'contact'` to `NeedleOrigin` in `core/src/possession/types.ts`, `contact: 3` to `ORIGIN_RANK` in `red-thread.ts`, and one label to the `ui-kit` origin text map; change nothing else in those packages and keep their suites green.
    - In `apps/ghost-hand/`: a possession Plan_File `plans/possession.plan.json` whose `taskText` holds a visible task line that does not contain the word `vase` and one hidden instruction made of Tag_Characters written as `\u` surrogate-pair escapes in the file (built with `String.fromCodePoint` in the builder), naming only the simulated vase, with reserved hosts and canary secrets only; the Needle `{ value: 'vase', origin: 'contact', stepIndex }` with the smallest action index at which any outcome reports `firstTouch.vase`; a `Provenance_Log` with one record for the task text; `scanText(taskText)` passed to the Blacklight_View and the `ThreadLink` of `traceRedThread` passed unchanged to the Red_Thread_View; the texts `Text analysis does not catch every injection.` and `A forbidden contact with the vase is blocked by what the ghost does, with or without hidden text.`. Neither the scan result nor the link enters the verdict.
    - Add tests in the same task: the verdict is `block` by `gentle-hands`; the Provenance_Log has one record; the `ThreadLink` points at the line and column of the hidden instruction; the visible line does not contain the Contact_Name; a `not-found` link leaves the verdict unchanged; the fixtures hold no literal hidden character; the full suites of `core`, `ui`, and the two Ghost Hand packages pass.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

## Notes

- Every task is required except task 21.1, the forbidden-contact red thread (possession minimal change), which is the only optional task and is placed last. No test sub-task carries the `*` marker.
- Properties 1 to 23 keep the numbering and titles of `design.md`. Property map: 1 (6.5), 2 (5.5), 3 (5.6), 4 (6.6), 5 (12.13), 6 (8.2), 7 (8.10), 8 (8.3), 9 (8.4), 10 (12.1), 11 (12.2), 12 (12.3), 13 (12.4), 14 (12.5), 15 (12.6), 16 (12.7), 17 (12.8), 18 (12.9), 19 (6.7), 20 (12.10), 21 (8.5), 22 (11.3), 23 (8.12). GH-P1 to GH-P8 of Requirement 18 are Properties 1, 2, 3, 5, 4, 6, 7, 8.
- Checkpoint map: task 2 closes waves 0 to 1, task 10 closes waves 2 to 9, task 13 closes waves 10 to 13, task 16 closes waves 14 to 17, and task 20 closes waves 18 to 23. A checkpoint is not in the dependency graph. The next wave starts only after the checkpoint that closes the previous waves has passed.
- External dependencies by task. `ui-kit` implementation: 4.2, 6.1, 8.9, 14.1. `wards-config` implementation: 4.2, 11.1, 11.4, 14.1, 14.3. `kiro-integration` implementation (hooks `world-scaffold`, `contract-pbt`, `blacklight-steering`): 3.1 to 3.4 (steering hook), 4.1, 12.12. PR-1: 6.8, 8.1, 8.6, 18.3. PR-2: 6.8, 8.1, 8.6, 11.1, 11.6, 18.3. PR-3: 6.8, 8.6, 14.1, 18.3. Tasks 6.8 and 8.6 test the behavior before the prerequisites land. Task 18.3 is the only task that allows the README to claim behavior that depends on them.
- Steering updates S1 to S7 are tasks 3.1 (S1 to S4), 3.2 (S5, the narrow P2 scope), 3.3 (S6), and 3.4 (S7). The P2 text on the page and in the README stays off until task 18.2 runs after task 3.2.
- Measurements and probe results go to `docs/measurements.md`, not to `docs/devlog.md`: probe results (1.1), short-run budget and `verifyWorld` timing (7.7, re-checked in 11.5), demo scenario numbers (11.5), determinism golden hash (12.11), browser timings (17.1), and the 3D overlay frame time with 8 and 20 arms (17.3, unmeasured until then).
- Task 1.2 is the gate after the probe: if the `@mujoco/mujoco` 4.0.1 API differs from `design.md`, `design.md` is fixed first.
- Task 19.1 and task 21.1 edit packages owned by other specs and must run alone. Tasks 3.1 to 3.4 edit steering files and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- Manual or human-confirmed steps: the approval of each steering edit (3.1 to 3.4), the confirmation that S5 landed (18.2), and the Kiro session that records the revised plan (design D18; until it happens the shipped revised plan is `scripted` and the README says so).
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "5.2", "5.3", "6.1", "6.2", "7.1"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.6", "6.3", "6.4", "6.5", "6.6", "6.8", "7.2", "7.3"] },
    { "id": 7, "tasks": ["6.7", "7.4", "7.5", "8.1"] },
    { "id": 8, "tasks": ["7.6", "7.7", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9"] },
    { "id": 9, "tasks": ["8.10", "8.11", "8.12", "8.13", "9.1", "9.2"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["11.3", "11.4", "11.5"] },
    { "id": 12, "tasks": ["11.6", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9", "12.10"] },
    { "id": 13, "tasks": ["12.11", "12.12", "12.13"] },
    { "id": 14, "tasks": ["14.1", "14.3"] },
    { "id": 15, "tasks": ["14.2", "14.4", "15.1"] },
    { "id": 16, "tasks": ["14.5", "14.6", "15.2"] },
    { "id": 17, "tasks": ["15.3"] },
    { "id": 18, "tasks": ["17.1", "18.1"] },
    { "id": 19, "tasks": ["17.2", "18.2"] },
    { "id": 20, "tasks": ["17.3", "18.3"] },
    { "id": 21, "tasks": ["18.4"] },
    { "id": 22, "tasks": ["18.5"] },
    { "id": 23, "tasks": ["19.1"] },
    { "id": 24, "tasks": ["21.1"] }
  ]
}
```

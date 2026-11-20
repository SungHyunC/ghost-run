# Implementation Plan: site-live

## Overview

This plan turns section 3 of the Ghost Run+ landing site into a live demo with the v5 layout. All code is TypeScript, the build scripts are `.mjs` files, and tests use `vitest`, Testing Library with jsdom, and `fast-check`. The work happens in the existing package `site/` (`@ghost-run/site`) and follows the design of `.kiro/specs/site-live/design.md`.

The plan follows this order:

1. Steering, lint rules, and the shared policy constant.
2. The live contract, input handling, Presets, and the Hand plan builder.
3. The data types of `runs.json` version 2 and the three adapters, each with its tests.
4. The record script on the adapters, the new `runs.json`, and the parity tests.
5. The walkthrough engine: outcomes, classification, narration, and the record-driven hook.
6. The controller, the loaders, and the loading, fallback, and stale-run tests.
7. The v5 components and styles, with DOM tests.
8. The engine wiring modules and the build check, then the Site_Check and the notice.
9. Documentation, and the final build.

### Cross-spec facts this plan relies on

- Already present and not recreated: the package `site/` with its engine (`src/engine/`), components (`src/components/`), data (`src/data/`), scripts, and tests, as built by `.kiro/specs/site/`; `core/`, `wards-config`, the three world packages; the apps `apps/ghost-shell` and `apps/ghost-hand`; `ui/`.
- Never changed: `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, `ghost-runner/` (Requirement 1, criterion 3). If a task finds that a change there is unavoidable, it stops and reports.
- Edits outside `site/` and `.kiro/specs/site-live/`: `.kiro/steering/structure.md` (task 1.1), `README.md` and `docs/measurements.md` (task 13.1), and `pnpm-lock.yaml` only if a task adds a dependency (none is planned).
- The Landing_Page build resolves `@ghost-run/core` and `@ghost-run/wards-config` through their `dist/` folders, which exist because the three app builds of `build:site` need them too.
- Task 1.1 must finish before task 3.1, the first task that imports an engine file (Requirement 1, criterion 4).

### Decisions reflected in this plan

1. **One folder imports engines** (design Dependency direction). Adapters take injected services, so every adapter test runs in Node.
2. **Shared derivation.** The record script and the adapters use the same `derive/` modules (Requirement 11).
3. **The walkthrough engine keeps one definition of each step.** Outcomes extend it; play, jump, and settle fold the same events.
4. **No shared test files across waves.** Each property test has its own file. Tasks that edit the same file are in different waves.
5. **Open questions are taken with the design default.** Where the repository contradicts a task, the task reports it and follows the repository.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: site-live, Property Ln: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` with `numRuns: NUM_RUNS` from `tests/pbt-config.ts`, and prints the seed on failure. Numbers and titles are those of the Correctness Properties section of `design.md`. Where the input space is finite (Property L1), the test enumerates it and says so in a comment.
- **Run sizes.** A Short_Run uses `NUM_RUNS = 100` and the whole package finishes within 60 s. A nightly run (`GHOST_PBT_MODE=nightly`) uses 10,000. No property is lowered below 100 runs.
- **Test environments.** `tests/unit/**` run in node, `tests/dom/**` in jsdom, `tests/record/**` only when `GHOST_SITE_RECORD=1`. Tests that need the MuJoCo simulation are in `tests/record/`.
- **Fake engines in DOM tests.** DOM tests pass a `LiveLoaders` stub whose engines return records of `runs.json`. They never start a Worker.
- **Fake time.** Walkthrough tests use the injected scheduler or Vitest fake timers. No test waits in real time.
- **Test data.** Canary values only. Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and `192.0.2.0/24`. Hidden Unicode and the HTML comment opener are never written literally in any file; tests build them with `\u` escapes or `String.fromCodePoint`. The Shell fixture's `.env` canary value appears in no new file.
- **No network, no LLM, no storage** in `site/src` and the tests. No Kiro Crew tool.
- **Verification commands.** `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, `build`, `assemble`, and `check`. The gated tests run with `corepack pnpm --filter @ghost-run/site test:record`.
- **No optional tasks.** Every task is required, including tests.

## Tasks

- [ ] 1. Steering, lint, and the policy constant
  - [x] 1.1 Update steering and the lint rules
    - Edit `.kiro/steering/structure.md`: replace the `site/` dependency sentence with the text of design "Dependency direction" (`site/src/live/` may import `core/`, `wards-config/`, and `worlds/*` through their public entry points, and by relative path the pipeline modules, plan parsers, executor modules, and worker entry files of `apps/ghost-shell` and `apps/ghost-hand`; the rest of `site/src/` imports none of them; no package may depend on `site/`). Keep every other rule. Keep the file free of hidden Unicode and comment openers.
    - Edit `site/eslint.config.mjs`: keep `PAGE_BANNED_IMPORTS` for `src/**`; add a block for `src/live/**` that replaces that ban by an allowlist of the design table and keeps the syntax and network bans; keep the block of `scripts/record-runs.measure.ts` and change its allowlist to the design table (adapters, core, wards-config, the two world packages, `drawer-arm`, `vitest`).
    - Edit `site/tsconfig.json` so that `src/live/**` and the app files it imports typecheck (add the `/// <reference path>` of `worlds/playground-shell/src/sql-js.d.ts` in `src/live/types.ts` when the task creates it; keep `types: ["vite/client", "node"]`).
    - Extend `tests/unit/lint-fixture.test.ts`: a temporary file under `site/src/live/` that imports `@ghost-run/core` passes; the same import in `site/src/components/` fails with `no-restricted-imports`; a `fetch` call in `site/src/live/` fails. Delete the files in `finally`.
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 1.2 Share the landing policy between the Vite config and the headers
    - Create `scripts/lib/csp.mjs` with the ordered directive list and `landingHeaderPolicy()` and `landingMetaPolicy()` (design Component 12). The header policy is `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`; the meta policy is the same without `frame-ancestors`.
    - Change `vite.config.ts` to inject `landingMetaPolicy()` and `scripts/lib/headers.mjs` (`buildRootHeaders`) to use `landingHeaderPolicy()` for the blocks `/` and `/index.html`. Do not change the `/shell/*` block or the other two headers.
    - Update the existing tests that name the old policy: `tests/unit/headers.test.ts`, `tests/unit/check-site.test.ts` (the valid-site fixture), `tests/unit/index-html.test.ts` if it checks the meta policy text, and `tests/unit/headers.property.test.ts`.
    - Write `tests/unit/csp.test.ts`: the header policy differs from the policy of the `site` spec by exactly the three changes; the meta policy equals it without `frame-ancestors`; `vite.config.ts` and the built `index.html` meta tag use the shared function; the policy contains `'wasm-unsafe-eval'` and does not match `/'unsafe-eval'/`.
    - _Requirements: 14.1, 14.2_

  - [x] 1.3 Write property test for the landing policy
    - **Property L11: Policy of the landing page**
    - In `tests/unit/csp.property.test.ts`: for any generated `_headers` input to `buildRootHeaders`, the blocks for `/` and `/index.html` carry `landingHeaderPolicy()`, no block has the scope `/*`, and the Site_Check policy rule (task 12.2 extends it; here the existing rule function) accepts the policy and rejects any policy with `https:`, `*`, `'unsafe-eval'`, `'unsafe-inline'`, or a `connect-src` other than `'self'` added.
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

- [ ] 2. The live contract and input handling
  - [x] 2.1 Write `live/types.ts` and `live/input.ts`
    - Add `"@ghost-run/ui": "workspace:*"` to `devDependencies` in `site/package.json` and update `pnpm-lock.yaml` with `corepack pnpm install` (owner approval; `input.ts` imports `@ghost-run/ui`).
    - `types.ts`: `LiveInput`, `LiveRun`, `LiveAnswer`, `LiveEngine`, `Outcome`, and `UnsupportedNote` exactly as in design Component 1 and Component 7. It imports types only.
    - `input.ts`: `TEXT_LIMIT` (256), `normalizeText`, `normalizeSliders` (ranges from `WORLD_CONFIG.actionRanges` of `@ghost-run/drawer-arm`; rounding as in Requirement 5, criterion 4), and `echo` (via `escapeForDisplay` of `@ghost-run/ui`, 80 code points and an ellipsis), plus `KNOWN_SHELL` and `KNOWN_CLOUD`.
    - Write `tests/unit/live-input.test.ts`: empty, space-only, 256 and 257 code points (with a surrogate pair at the limit), control characters, hidden code points built with `String.fromCodePoint`, trimming, `normalizeSliders` clamping and NaN, `echo` of hidden characters shows `<U+XXXX>`, and `KNOWN_SHELL` equals the 15 keys of the handler table of the world (read from the world's source file text, with the key list pinned by a second assertion against the README table of the app) and `KNOWN_CLOUD` equals the parser's command cases.
    - _Requirements: 5.2, 5.5, 9.1, 9.2, 9.3_

  - [x] 2.2 Write property test for input handling
    - **Property L3: Input reaches the engine escaped and limited (engine side)**
    - In `tests/unit/live-input.property.test.ts`: for any generated string (control characters, hidden code points from code points, markup, strings around and above the limit), `normalizeText` rejects it or returns a text of at most 256 code points with no control or hidden code point and equal to the trimmed input; `echo` has no control or hidden code point and at most 80 code points before the ellipsis.
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [ ] 3. Presets and the Hand plan
  - [x] 3.1 Write `live/presets.ts`
    - Read the plan files, wards files, and demo files with `?raw`: `apps/ghost-shell/plans/scenario-1.json`, `scenario-1-fixed.json`, `scenario-2.json`, `scenario-2-fixed.json`, `scenario-4.json`, `apps/ghost-hand/plans/first.plan.json`, `revised.plan.json`, `worlds/ghost-cloud/demo/01-delete-protected-bucket.txt`, `03-delete-temporary-bucket.txt`. Parse the plan files with the apps' `parsePlanFile`. Export `PRESETS` and `FIXED` as in design Component 9: nine Presets in the order of Requirement 8, criterion 1, and four Fixed_Plans (Requirement 8, criterion 3). Hand Presets hold slider values derived from the plan files' grasp and pull actions; `strong grip` (0.3, 38, 0.2) and `make it public` hold the brief's values. Add `isKnown(box, preset)`.
    - Write `tests/unit/live-presets.test.ts`: each Preset input equals its file; each Fixed_Plan equals its file; only the four named Presets have a fix; the Hand values equal (0.6, 20, 0.2), (0.15, 15, 0.15), (0.3, 38, 0.2); `isKnown` is false after one character changes and after a slider moves by one step.
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 3.2 Write `live/hand-plan.ts`
    - `buildHandPlan(values)` as in design Component 5: read `first.plan.json`, keep actions 0, 1, and 4, build the grasp and pull actions from the rounded values, and pass each action through `validateAction`. Return the five actions or the validator's error.
    - Write `tests/unit/live-hand-plan.test.ts`: (0.6, 20, 0.2) gives exactly the actions of `first.plan.json`; (0.15, 15, 0.15) gives exactly those of `revised.plan.json`; a value just below and above each range is clamped; the floating value 0.15000000000000002 rounds to 0.15.
    - _Requirements: 5.4, 3.2_

  - [x] 3.3 Write property test for slider plans
    - **Property L12: Slider plans are valid and equal the plan files**
    - In `tests/unit/live-hand-plan.property.test.ts`: for any three finite numbers, `normalizeSliders` returns values inside the ranges rounded to the step, and `buildHandPlan` gives five actions that all pass `validateAction`, whose reach and release actions equal those of `first.plan.json` and whose grasp force, pull distance, and pull speed equal the rounded values.
    - **Validates: Requirements 5.4, 3.2, 9.2**

- [ ] 4. Data types of `runs.json` version 2
  - [x] 4.1 Change the data types and add `derive/common.ts`
    - `src/data/types.ts`: `RunsFile` becomes version 2 (`WorldRecordV2` with `presets`), `WorldRecord` gains `fixed: PlanRecord | null`, `outcome`, `source`, and `unsupported?`; `CopyScene.shell` gains `entries`; `CopyScene.cloud` buckets gain `tag?`. `RealityScene.shell` lists entries instead of the fixed subset.
    - `src/live/derive/common.ts`: pure helpers that build check rows from a ward and a measurement, the sorted unique destinations of effects and network events, the violated ward ids, and the extra chip of a violated non-headline ward (text from the engine's reason, shortened and sanitized).
    - Write `tests/unit/derive-common.test.ts` with fixture verdicts: a violated headline ward gives its row, a second violated ward adds one chip with the reason, no violation gives only the headline rows, and destinations are sorted and unique.
    - Fix the typecheck of the files that read the old shape by adapting them minimally (the engine and components read `WorldRecord`; their full change is in tasks 9 to 11). Run `typecheck` and fix compile errors only.
    - _Requirements: 7.3, 11.2, 11.7_

- [ ] 5. Ghost Shell adapter
  - [x] 5.1 Write `live/shell.ts` and `live/derive/shell.ts`
    - `createShellEngine({ sql, wardsText })` as in design Component 3: fresh project per run, `parseWards` once, `runPlayground` with a `worldFactory` that records the two fingerprint hashes, `unsupported` answer for unsupported or watchdog steps, `failed` for an exception. `derive/shell.ts` builds the `PlanRecord` (checks `rows lost, at most N`, entries with `intact`, `gone`, or `new`, tables with `intact`, `dropped`, or `soft`, facts `rowsLost`, `entriesGone`, `entriesNew`, `networkAttempts`) and the reality scene (non-hidden top-level entries without secret-pattern matches). It never reads or stores `.env` contents. The chips follow the ward verdict: the headline chip is ✗ exactly when `no-data-loss` is violated, and each other violated ward adds one chip with the engine's reason (task 15.3).
    - Write `tests/unit/live-shell.test.ts` with the inline SQL executor: `DROP TABLE users` blocks with 1,206 rows lost and `p1.equal`; its fixed plan passes with 0 lost; `rm -rf ./data ./build` blocks by `protect-data` and adds the extra chip; its fixed plan passes; `npm test` passes; `curl` to a `.example` host gives `warn` with the destination in effectsOutside; `git status` and `$(echo x)` give `unsupported` with a fixed reason and no input echo; a stub executor that answers with the watchdog flag gives `unsupported`; the reality scene lists `app.db`, `build/`, `data/`, `package.json`, `README.md` and no hidden entry; the serialized record never contains the canary value of `.env`.
    - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8, 7.2, 7.3, 9.4, 12.2, 12.4_

- [ ] 6. Ghost Cloud adapter
  - [x] 6.1 Write `live/cloud.ts` and `live/derive/cloud.ts`
    - `createCloudEngine({ wardsText })` as in design Component 4: `runGhostCloudPlan`, `failed: 'internal'` for the internal-error run, `unsupported` with the engine's reason, otherwise `derive/cloud.ts` builds the record (checks `never delete prod-*` whose text and ✓ or ✗ follow the `no-bucket-delete` verdict (protected bucket deleted, objects deleted in a protected bucket that stays, objects deleted outside `prod-*`, nothing deleted), buckets with their object keys after the run, a tag for a changed ACL or public-access block, facts `bucketsRemoved`, `objectsRemoved`, `removedBuckets`, and `objectsDeleted` and `objectsDeletedIn` only when a run empties a bucket that stays; see tasks 15.3 and 15.4).
    - Write `tests/unit/live-cloud.test.ts`: `delete prod-assets` blocks by `no-bucket-delete`; `delete tmp-build-cache` passes; `make it public` blocks by `no-public-bucket` with the extra chip and the tag; `aws s3 ls --endpoint-url http://s3.example` gives `warn`; `aws ec2 describe-instances` and a line with `;` give `unsupported` with the world's fixed reason and no echo; a 51-line input is not possible from the page, but the adapter keeps the engine's cut; the internal-error run (a world factory that throws) gives `failed`.
    - _Requirements: 5.5, 5.6, 5.7, 7.3, 9.4_

  - [x] 6.2 Write property test for Reality in the engines
    - **Property L2: Reality never changes (engine form, Shell and Cloud)**
    - In `tests/unit/live-reality.property.test.ts`: for any generated accepted visitor text (commands built from a grammar of the 15 Shell commands with fixture paths, and of the Cloud commands with fixture buckets, plus noise), each run reports `p1.equal`, and a world built fresh from the fixture after the sequence has the fingerprint of one built before it. The Hand form runs in task 7.1's gated test.
    - **Validates: Requirements 12.2, 12.3**

- [ ] 7. Ghost Hand adapter
  - [x] 7.1 Write `live/hand.ts` and `live/derive/hand.ts`
    - Move `scripts/lib/tile-label.ts` to `src/live/derive/tile-label.ts` and leave a re-export in `scripts/lib/tile-label.ts` (the existing tile-label tests keep passing). `createHandEngine({ createWorld, createExecutor, wardsText, variantConfigText, capabilities, scheduler })` as in design Component 5: build the plan with `buildHandPlan`, create the reference world and the executor, call `runGhostHand` (seed 42, 8 variants), dispose both in `finally`, map `GhostHandRunError` to `unsupported`, map a run over 30 s (injected scheduler) to `failed: 'timeout'`. `derive/hand.ts` builds the three `gentle-hands` rows (each ✗ exactly when the verdict has a violation of its kind, plus a fourth chip for a joint-limit or self-collision violation; task 15.3), the tiles with label, outcome, and joint-limit flag (structured field first, the sentence pattern as the fallback, failing when the verdict names a joint limit and neither finds an id), and the facts. Re-export `handCapabilities()`.
    - Write `tests/unit/live-hand.test.ts` with stub services (no MuJoCo): a thrown `GhostHandRunError` gives `unsupported`; the timeout gives `failed` and calls `dispose` on the executor and the world; a run that throws gives `failed` and still disposes; the derivation of a fixture variant list gives the expected rows and tiles.
    - Write `tests/record/live-hand.test.ts` (gated): the three Hand Presets and the fixed plan run through the real world and the inline executor; `fast pull` blocks with 7 of 8 and `p1.equal`; `slow pull, gentle grip` passes with 8 of 8; a sample of ten slider triples (seeded) all report `p1.equal` and a world built fresh afterwards has the fingerprint of one built before.
    - _Requirements: 5.3, 5.4, 5.6, 5.9, 7.2, 9.4, 12.2_

- [ ] 8. The record script and the parity tests
  - [x] 8.1 Move the record script onto the adapters and re-record `runs.json`
    - Change `scripts/record-runs.measure.ts` to build the three engines through the adapters with in-process services, run every Preset and every Fixed_Plan, and write `runs.json` version 2 (design Component 14). Keep the refusals of the `site` design and add the named-Preset table (`DROP TABLE users`, `rm -rf ./data ./build`, `fast pull`, `delete prod-assets` block; the four Fixed_Plans pass). Remove the duplicate derivation code and the direct app imports (the adapters hold them).
    - Update `scripts/lib/print-json.mjs` only if the new shape needs it. Update the pure `validateRecords` function and `tests/unit/record-script.test.ts` or the existing record tests that name the old shape (`tests/unit/record-runs-args.test.ts`, `tests/unit/runs-printer.property.test.ts`).
    - Run `corepack pnpm --filter @ghost-run/site record` and commit the new `src/data/runs.json`. Report the verdicts of the five Presets that have no expected value, and the verdict of `make it public`.
    - Rewrite `tests/unit/runs-shape.test.ts` for version 2: shape, `format`, `version`, the nine Presets in order, the verdict rules above, `p1.equal` everywhere, and the values of Requirement 11, criterion 6 checked from the records.
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7_

  - [x] 8.2 Write the parity tests
    - **Property L1: Live equals recorded**
    - `tests/unit/live-parity.test.ts`: for each of the Shell and Cloud Presets and Fixed_Plans, the adapter's `PlanRecord` (inline services) equals the committed `runs.json` entry field for field. A comment states that the input space is the 11 Shell and Cloud plans and is enumerated.
    - `tests/record/live-parity-hand.test.ts` (gated): the same for the three Hand Presets and the Hand Fixed_Plan, and a test that runs the Record_Script into a temporary file and compares its bytes with the committed file (extends the existing `tests/record/recorded-runs.test.ts`; update that file for version 2 in this task).
    - Add the case "a Preset with no entry in the committed file is compared with a fresh recording" with a fixture engine and a temporary file.
    - **Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.6**

- [ ] 9. Walkthrough engine: outcomes, classification, narration
  - [x] 9.1 Change the engine types and the reducer
    - `engine/types.ts` and `engine/reducer.ts`: `candle: 'lit' | 'out' | 'flicker'`, `stamp` with `'ASK A HUMAN'`, `disabledSteps`, the Shell copy state with `tables` and `entries`, the Cloud bucket `tag` and its `objects: string[]` copy state, and the events they need (`candle`, `entry`, `table`, `bucketTag`, `bucketObjects`, `disable`). `initialState` reads the v2 reality scene.
    - Update `tests/unit/engine.test.ts` and the other tests that read the old state fields. Add reducer example tests for each new event and for immutability (the input state is not mutated).
    - _Requirements: 7.2, 7.5, 7.6, 7.7_

  - [x] 9.2 Write `live/classify.ts`
    - `classify(first, fixed)` and `toWalkRecord(run, fixed, outcome, source, unsupported?)` as in design Component 7. `toWalkRecord` also builds a `WorldRecord` from a `runs.json` Preset entry for the fallback (`source: 'recorded'`). No engine import.
    - Write `tests/unit/classify.test.ts`: the five Outcomes from example answers, a failed Fixed_Plan gives `block-open`, `toWalkRecord` keeps `fixed === null` for Visitor_Input, and the recorded record for each Preset equals the live record's shape.
    - _Requirements: 7.4, 8.3, 8.4, 10.2_

  - [x] 9.3 Write property test for classification
    - **Property L8: Outcome classification and no invented fix**
    - In `tests/unit/classify.property.test.ts`: for any pair of generated answers, `classify` follows the rules of the property; for any Visitor_Input record `fixed` is null; the badge rules (go badge only when the final verdict is `pass` and `p1.equal`; never both badges) hold on the settled state of generated records.
    - **Validates: Requirements 7.4, 7.5, 7.6, 8.3, 8.4**

  - [x] 9.4 Change `script.ts` and `narration.ts` for the five outcomes
    - `engine/script.ts`: `buildScript` and `settle` as in the table of design Component 7 (the `block-fixed` events keep the timing of the `site` design; add the events of `block-open`, `pass`, `warn`, and `unsupported`; `DUR` unchanged). The end of step 5 uses the fixed run's verdict for the stamp, candle, note, and go badge. Update `blockNote`, `passNote`, and add `warnNote` and `NOTE_EDIT`.
    - `data/narration.ts`: templates per world, outcome, and step with guards on the facts they name (design Component 7); loading lines and unsupported-input explanations as fixed templates; the step labels of Requirement 4, criterion 3.
    - Write `tests/unit/narration-live.test.ts`: each template is chosen only when its facts exist; segments hold no HTML; numbers use the formats of the `site` spec; a record with no facts gets the generic verdict-and-ward template; the explanation for `unsupported` lists the commands of the world and, for Hand, the slider ranges, and holds no part of the input. Update `tests/unit/engine.test.ts` and `tests/unit/narration.test.ts` for the new templates and keep their `DUR` assertions.
    - _Requirements: 4.3, 4.5, 7.2, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 9.5_

  - [x] 9.5 Write property test for settling and playing
    - **Property L7: Settling equals playing through, for every outcome**
    - In `tests/unit/live-walk.property.test.ts`: for any generated record of the five Outcomes (generated checks, verdicts, facts, text lengths) and any step n, folding the events of steps 0 to n gives the state that a fake clock run reaches when step n's last event fired, apart from the narration and the typed text; the state after step 4 equals the Reduced_Motion final state; for `unsupported` every settled state equals the state after step 0. Replaces the corresponding case of `tests/unit/engine.property.test.ts`, which this task updates for the new state.
    - **Validates: Requirements 7.1, 7.2, 7.6, 7.7, 16.6**

- [x] 10. Hooks, controller, and loading
  - [x] 10.1 Write the record-driven hook and the visibility options
    - `engine/useInView.ts`: accept `{ rootMargin, threshold }` and keep the existing defaults and the `unsupported` state. `engine/useWalk.ts`: `useWalk({ scheduler })` with `show(record)`, `replay()`, `jump(n)`, the one timer registry, cleanup on unmount, and the Reduced_Motion rules of the `site` hook. Remove the old `useWalkthrough` after its tests are moved.
    - Move the cases of `tests/unit/walkthrough-hook.test.tsx` and `tests/unit/timer-hygiene.property.test.ts` to the new hook and keep them green; add cases for `show` with each Outcome and for `jump` on a disabled step (ignored).
    - Write `tests/dom/hooks.test.tsx` additions: `useInView` with `rootMargin` reports once; `unsupported` without the API.
    - Decision (long text): `buildScript` step 2 types at `typeMs(record, length)`, which is the verbatim 26 ms per character whenever typing, the 250 ms delay, and the world action end before step 3 starts (every recorded Preset), and is lower otherwise (down to the room left in the 3,900 ms slot), so a 256-character Visitor_Input never runs into step 3 and play, jump, and settle agree. Step 5 keeps 26 ms (only Presets have a Fixed_Plan). Property L7 now generates texts up to 256 characters. `useWalk({ initial, scheduler, settled })` returns `controls: { show, replay, jump }`; autoplay and `pickWorld` live in the caller (`Walkthrough.tsx` for now, the controller in 10.2).
    - _Requirements: 4.2, 6.2, 10.7, 16.6_

  - [x] 10.2 Write `live/loaders.ts` and the controller
    - `loaders.ts` as in design Component 6 (dynamic imports in the default, injectable, a rejected import not kept). `engine/useLiveWalkthrough.ts` as in design Component 8 and the table of Component 9: near load and warm, seen autoplay, `submit` with normalize, engine call, the optional Fixed_Plan call, token checks after each await, classify, `show`, fallback to the recorded Preset or the honest message, Hand load only from a Hand action, the 30 s timeout is the adapter's (the proxy guard is 32 s), unmount cleanup, the Live_Badge source. The controller also owns `edited` and `interrupt()` (an edit of the plan box while a run animates or waits cancels it, task 15.2) and logs exactly one `console.warn` per failed load, failed run, and failed Fixed_Plan run, naming world, cause, and the console-only `detail` (task 15.1).
    - Write `tests/dom/live-controller.test.tsx` with fake engines: a Preset runs live and shows "Live in your browser"; a failed engine with a Preset shows the recorded run and "Recorded run"; a failed engine with typed input shows the message and no run; a rejected text calls no engine; Replay calls no engine; the Run button is busy during a run; a Hand load failure is retried on the next Hand action.
    - _Requirements: 3.5, 3.6, 3.7, 6.2, 6.3, 6.5, 6.6, 8.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.8_

  - [x] 10.3 Write property test for stale runs
    - **Property L9: A superseded run never reaches the page**
    - In `tests/dom/live-controller.property.test.tsx`: for any sequence of controls with generated delays and answer orders (fake engines with controllable promises, fake clock), the displayed record is the latest accepted run's, no event of an older token is applied, pending timers equal the events left to fire (none after unmount, none after an unsupported run's step 1), and engines are disposed on unmount.
    - **Validates: Requirements 10.6, 10.7, 5.9**

  - [x] 10.4 Write property test for fallback
    - **Property L10: Failure keeps the page working**
    - In `tests/dom/live-fallback.property.test.tsx`: for any world, any failure kind (load rejection, run exception, timeout, internal-error), and any Preset, the page shows the Recorded_Run of that Preset with the badge "Recorded run" and no exception escapes; for generated Visitor_Input no run is shown and the box is unchanged; "Live in your browser" never shows for a Recorded_Run.
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

  - [x] 10.5 Write the loading tests
    - **Property L5: Nothing heavy loads before the section is near** and **Property L6: The Hand engine loads only after Ghost Hand is picked**
    - In `tests/dom/live-loading.property.test.tsx`: with a fake IntersectionObserver, loader spies, a Worker spy, and a fetch spy, for any sequence of renders, not-near reports, resizes, hovers, and slider moves, no spy is called before `near`; after `near`, `light()` is called once and `hand()` never; for any sequence that never selects the Ghost Hand tab and never runs a Hand input, `hand()` is never called; after the first Ghost Hand action it is called once. A second test without IntersectionObserver: no loader is called before the first action, and the recorded final state shows.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6, 10.5**

- [x] 11. The v5 section
  - [x] 11.1 Port the v5 styles
    - Replace the section-3 rules of `05-walkthrough.css`, `06-pane-content.css`, `07-judge.css`, and `08-actor-say.css` with the CSS of Mockup_V5 (Requirement 2, criterion 2), keeping class names. Add the additions of design Component 10 (`.stamp.warn`, `.bigcandle.flicker`, `.live.rec`, disabled stepper steps, `.tag.pub`, `.node.new`) and extend the reduced-motion block to the new classes. Keep `.bf` and `.bs` flat and the file order.
    - Update `tests/unit/styles.test.ts` for the file contents (no `.wbar`, `.wchip`, or `.rail` rules remain; the new rules exist; the reduced-motion block lists the new classes). Add the new color pairs to `tests/unit/contrast.test.ts` and raise a failing value only as far as the limit, listing it for task 13.1 in a comment of the test.
    - _Requirements: 2.1, 2.2, 2.7, 16.4, 16.5, 16.6_

  - [x] 11.2 Write the control card, plan box, presets row, and stepper
    - `components/walk/ControlCard.tsx` (tabs with roving `tabindex` and arrow keys, Replay), `components/walk/PlanBox.tsx` (text input with `maxLength`, the three sliders with labels and `aria-valuetext`, the Run button with `aria-busy`, the preset row with the `on` class, the "fixed by the agent" tag), and `components/walk/Stepper.tsx` (ordered list, `now`, `done`, `aria-current`, disabled steps). Remove `Controls.tsx`.
    - Write `tests/dom/control-card.test.tsx` and `tests/dom/stepper.test.tsx`: roles and `aria-selected`, arrow-key movement, Replay, Presets and the `on` class, slider labels, minimum, maximum, and step equal to `WORLD_CONFIG.actionRanges` (read from the world file text), Enter runs the plan, `maxLength` is 256, the busy state, the plan tag, stepper jump, disabled steps for `unsupported`, and hit areas by class. Update `tests/dom/chips.test.tsx`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8, 3.9, 4.1, 4.2, 16.1, 16.2, 16.8_

  - [x] 11.3 Change the theater, cards, actor, and speech bar
    - `Theater.tsx`: remove the plan bar, clamp the Actor's y for `copy` (design Component 10), draw the Shell entries and tables, the Hand tiles with the `joint limit` label, and the Cloud buckets with tags. `Cards.tsx`: the judgement row (ward name from the violated ids, chips that follow the ward verdict, effectsOutside chip), the verdict card that holds the candle and the stamp only (three stamps, candle states, the two badges; no `#vnote` and no `.vtxt` wrapper), and the Speech_Bar with the step label inside `#sayt`. Keep `RealityPane` memoized on the scene.
    - Write `tests/unit/theater-place.test.ts` (the bubble stays inside the Theater for every Actor position with fixed rectangles) and `tests/dom/outcomes.test.tsx` (the five Outcomes: stamp, candle, note, badges, plan box, disabled steps), `tests/dom/speech.test.tsx` (the label, one update per step, no typed characters in the region), and update `tests/dom/panes.test.tsx` and `tests/dom/a11y.test.tsx`.
    - _Requirements: 2.6, 4.3, 4.4, 7.2, 7.3, 7.5, 7.6, 7.7, 16.4, 16.7_

  - [x] 11.4 Wire the section and the Live_Badge
    - `components/Walkthrough.tsx`: the section head with the Live_Badge, the sub-heading of Mockup_V5, the Control_Card, the Stepper, the Theater, and the Speech_Bar; the controller of task 10.2 with the default `LiveLoaders`. The section renders no `#sealnote` line: the Live_Badge and the Copy_Pane head "sealed: nothing leaves" carry the claim (Requirement 13, criterion 5).
    - Write `tests/dom/live-badge.test.tsx` (hidden before a run; live text only for live; recorded text for the fallback) and `tests/dom/reduced-motion-live.test.tsx` (recorded final state at load; live final state after near; no timer remains). Update `tests/dom/walkthrough.test.tsx`, `tests/dom/render.test.tsx`, and `tests/dom/classes.test.tsx` (the class list of Requirement 2, criterion 8).
    - Write `tests/dom/live-input.test.tsx`: **Property L3 (DOM side)**: typed `<img src=x onerror=...>` text and hidden characters (built from code points) appear only as text, the element count of the section equals that of a benign text, and an over-limit text shows the explanation with an escaped echo.
    - **Validates: Requirements 9.3, 9.6, 10.4, 10.8, 13.5**
    - _Requirements: 2.3, 2.8, 4.5, 10.4, 10.8, 13.5, 16.6_

  - [x] 11.5 Write the page-form Reality test
    - **Property L2: Reality never changes (page form)**
    - Extend `tests/dom/reality.property.test.tsx` into `tests/dom/live-reality.property.test.tsx`: for any world and any sequence of tab, Preset, Run, Replay, step, and edit actions with any clock advance (fake engines), the serialized `#realb` after each action equals its content right after the reset of the displayed run, apart from the two badges; the fingerprint badge shows only when `p1.equal`, and the go badge only for a final `pass` with `p1.equal`.
    - **Validates: Requirements 12.1, 12.3**

  - [x] 11.6 Write the no-network test
    - **Property L4: No request leaves the page**
    - `tests/dom/live-no-network.test.tsx`: replace `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon` with recorders that accept a same-origin URL ending in `.js` or `.wasm` and throw otherwise; play every Preset and Fixed_Plan of all worlds with fake engines that also run `curl` to a `.example` host and a Cloud `--endpoint-url` plan; assert no throw, no foreign host, and no storage write. Extend `tests/unit/hygiene.test.ts` so that `site/src/live/` is scanned for network and storage APIs.
    - **Validates: Requirements 13.1, 13.2, 13.4**

- [ ] 12. Wiring, build, and the Site_Check
  - [x] 12.1 Write the wiring modules and check the build output
    - `live/engine-light.ts`: `createLightEngines()` with `createWatchdogExecutor({ spawn: createWorkerRunner })`, the wards texts through `?raw`, the Shell and Cloud engines, and `dispose`. `live/engine-hand.ts`: wiring only. `createHandEngine()` returns `createHandProxy({ spawn, scheduler })` with `spawn = () => new Worker(new URL('./hand-worker.ts', import.meta.url), { type: 'module' })`. The Hand run lives in `live/hand-worker.ts` (world, pipeline, capabilities, and the simulation-worker spawn through `createExecutor`), with `live/hand-proxy.ts` and `live/hand-protocol.ts` on the page side (task 15.1). Neither wiring module is imported statically by any other file.
    - Run `corepack pnpm --filter @ghost-run/site build` and confirm that `build/dist/assets/` holds `engine-light-*.js`, `engine-hand-*.js`, `hand-worker-*.js`, `sim-worker-*.js`, `worker-entry-*.js`, `mujoco-*.wasm`, and `sql-wasm-*.wasm` (no shared `common-*.js` chunk is emitted any more), and that the Entry_Bundle contains no static import of them. If a name differs, adjust the Vite output names (`chunkFileNames`) so that the Site_Check patterns of task 12.2 hold, and report it.
    - Write `tests/unit/landing-build.test.ts` (skipped with a clear message when `build/dist` is missing): the seven files exist, `index.html` references none of them, the Entry_Bundle is at most 360 kB, every `new Worker(new URL(...))` and `new URL(...wasm...)` in the engine chunks and the Hand_Worker resolves to an existing file, and the page-side Hand files import no MuJoCo, world, or app code.
    - _Requirements: 5.8, 6.1, 6.7, 15.2, 15.3, 15.4_

  - [x] 12.2 Update the Site_Check and the Build_Script
    - `scripts/check-site.mjs` and `scripts/lib/refs.mjs`: the Engine_Bundle classification, the first-paint rule, the entry size constant `ENTRY_MAX_BYTES` (360 kB, with a comment naming Requirement 15), the policy rules of Requirement 14, criterion 3, and the wasm and worker reference assertions. `scripts/build-site.mjs`: generate `site/dist/THIRD_PARTY_NOTICES.txt` from the Bundled_Packages_List (`site/build/bundled-packages.json`) with `scripts/lib/notices.mjs`; it copies no Ghost Hand notice file and fails with `missing build output: site/build/bundled-packages.json (...)` or `no license text for <name> <version>` (task 15.6). The Engine_Bundle list of the Site_Check is `engine-light-*`, `engine-hand-*`, `hand-worker-*`, `sim-worker-*`, `worker-entry-*`, and `common-*` (classified only; none is emitted), and the Site_Check gains the `notices:` rules `RULE_NOTICE_PACKAGE` and `RULE_NOTICE_LIST`.
    - Extend `tests/unit/check-site.test.ts`, `tests/unit/check-site.links.property.test.ts`, `tests/unit/check-site.external.property.test.ts`, `tests/unit/build-site.test.ts`, and `tests/unit/site-dist.test.ts` with a fixture for each new rule (an engine chunk named in `index.html`, a static import of an engine chunk in the entry, a missing wasm file, a missing worker file, an oversized entry, a forbidden policy token, a missing notice) and one passing fixture; the real-dist test asserts the wasm and worker references of both engine chunks were found.
    - Owner decision D6: `src/components/Footer.tsx` ends with the link "Third-party notices" (`href="./THIRD_PARTY_NOTICES.txt"`, class `foot-notice`, styled in `09-make-footer.css`); nothing else in the footer changes. The Site_Check requires the notice file and a link to it (an anchor in `index.html` or the string literal in the Entry_Bundle). `assets/common-*.js` is classified as an Engine_Bundle. `tests/dom/render.test.tsx` and `tests/unit/build-site.test.ts` cover the link and the copy.
    - _Requirements: 14.3, 14.4, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.8, 18.3_

- [ ] 13. Documentation
  - [x] 13.1 Update the README and the measurements
    - `README.md`: add the one line to "Landing site" (Requirement 18, criterion 1), the one line to "Not written by Kiro" (Requirement 18, criterion 2), and the dependency rows of Requirement 1, criterion 6 with the versions and licenses read from the installed `package.json` files on the day. Keep the file free of hidden Unicode.
    - `docs/measurements.md`: append the section "Live walkthrough measurements" with the sizes read from `site/build/dist/assets/` (Entry_Bundle, the two engine chunks, the two workers, the two wasm files), the list of the additions of Requirement 2, criterion 7, the contrast changes of task 11.1, the durations of the Shell and Cloud parity tests and of the gated Hand parity test, and the line "browser load times: measured by the owner's agent in Chrome" marked not yet measured. Do not edit `docs/devlog.md`.
    - Extend `tests/unit/readme.test.ts`: the README holds the two new lines and the dependency rows.
    - _Requirements: 1.6, 18.1, 18.2, 18.4, 18.5_

- [x] 14. Final checkpoint: build the site and run every gate
  - From the repository root run `corepack pnpm build:site`. It builds the three apps and the kit, assembles `site/dist/`, and runs the Site_Check. Fix whatever fails in `site/` only; if the failure is in an app build, report it.
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, and `lint`, and the gated `test:record`. Run `corepack pnpm lint` and `corepack pnpm typecheck` for the workspace. Run the tests of `apps/ghost-shell` and `apps/ghost-hand` once, to confirm that nothing there changed (`git status` shows no file under `apps/`, `worlds/`, `core/`, or `ui/`).
  - Run the possession scan of `site/` (without `node_modules`, `build`, and `dist`) and `.kiro/specs/site-live/`: from `integrations/kiro-hook`, a one-off Node script that lists the files, calls `scanFiles(files, { markdown: 'by-extension' })` from `@ghost-run/core/possession-node`, and exits non-zero unless `report.outcome` is `clean`. The script is not added to the repository.
  - Confirm: Properties L1 to L12 each have a test with at least 100 runs in the Short_Run (L1 enumerates its 13 plans); `site/dist/` holds the paths of the `site` spec, `THIRD_PARTY_NOTICES.txt`, and exactly one `_headers` whose `/` blocks carry the policy of Requirement 14; `git status` shows changes only in `site/`, `.kiro/specs/site-live/`, `.kiro/steering/structure.md`, `README.md`, and `docs/measurements.md`. Ensure all tests pass, ask the user if questions arise.
  - Report the files changed, the test results, the verdicts that `runs.json` recorded for the Presets without an expected value, the sizes of the engine chunks, and the items left to the owner (see Notes).
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 15. Review fixes (A to F)
  - [x] 15.1 A. Ghost Hand live run in a module worker
    - Files: `site/src/live/hand-worker.ts` (world, pipeline, capabilities, simulation-worker spawn), `hand-proxy.ts` (page-side `LiveEngine`: ids, serial runs, 32 s guard, fresh worker after an error), `hand-protocol.ts` (messages, `HAND_TIMEOUT_MS`, `HAND_GUARD_MS`), `engine-hand.ts` (wiring only). `LiveAnswer.failed` carries an optional console-only `detail`. The controller logs exactly one `console.warn` per failed load, failed run, and failed Fixed_Plan run. `vite.config.ts` is unchanged except for the bundled-package plugin (task 15.6).
    - Tests: `tests/unit/hand-proxy.test.ts`, `tests/dom/live-warn.test.tsx`, `tests/unit/landing-build.test.ts`, `tests/unit/site-dist.test.ts`.
    - Verified in Chrome against `site/dist` served with the real `_headers`: the Ghost Hand run is live and the console is empty. New chunk `assets/hand-worker-jm0l0RkM.js`, 584,599 bytes (188,147 bytes gzip); `engine-hand-DjGBgS2y.js`, 1,797 bytes.
    - _Requirements: 5.10, 5.11, 6.3, 6.7, 10.1, 10.5, 10.9, 14.5, 14.6, 15.1, 15.2, 15.7_

  - [x] 15.2 B. Plan input editable after a run
    - Files: `site/src/engine/useWalk.ts` (`animating`, `cancel`), `site/src/engine/useLiveWalkthrough.ts` (`edited`, `interrupt`), `components/walk/PlanBox.tsx`, `components/Walkthrough.tsx`.
    - Tests: `tests/dom/live-edit.test.tsx`, `tests/dom/control-card.test.tsx`, `tests/dom/live-controller.property.test.tsx` (the L9 model covers typing during an animation).
    - _Requirements: 3.8, 3.10, 8.4, 10.6_

  - [x] 15.3 C. Check chips follow the ward verdict
    - Files: `site/src/live/derive/common.ts`, `derive/cloud.ts`, `derive/shell.ts`, `derive/hand.ts`; the step 3 tone in `engine/script.ts`; `data/narration.ts`. The recorded Runs_File is unchanged.
    - Tests: `tests/unit/chip-truth.test.ts`, `tests/unit/live-hand.test.ts`, and the parity tests (`tests/unit/live-parity.test.ts`, `tests/record/live-parity-hand.test.ts`).
    - _Requirements: 7.3, 7.11, 7.12, 11.1, 11.4, 16.4_

  - [x] 15.4 D. Step 5 keeps the copy
    - Files: the Cloud `objects` copy state and the `bucketObjects` event in `site/src/engine/types.ts`, `reducer.ts`, `script.ts`, and `components/walk/CloudPane.tsx`.
    - Test: `tests/dom/live-edit.test.tsx` (real Cloud world, typed `aws s3 rm s3://prod-logs --recursive`; the copy at the end of step 5 equals the copy at the end of step 4 for `block-open`, `pass`, and `warn`).
    - _Requirements: 7.2, 7.11, 7.13_

  - [x] 15.5 E. Two v5 fidelity items
    - Remove `#sealnote` and `#vnote` (`components/Walkthrough.tsx`, `components/walk/Cards.tsx`, the `.sealnote` rule of the stylesheets); add the Cloud "no real mode" sentence to the narration (`data/narration.ts`). Update `docs/measurements.md` (the `.sealnote` entry) and the README site paragraph.
    - Tests: `tests/dom/live-badge.test.tsx`, `tests/dom/outcomes.test.tsx`, `tests/dom/chips.test.tsx`, `tests/dom/a11y.test.tsx`, `tests/unit/narration-live.test.ts`, `tests/unit/narration.test.ts`.
    - _Requirements: 2.3, 7.9, 13.5, 20.3_

  - [x] 15.6 F. Third-party notices
    - Files: `site/scripts/lib/bundled-packages.mjs` (Vite plugin and manifest), `scripts/lib/notices.mjs` (renderer), `scripts/build-site.mjs` (generates `site/dist/THIRD_PARTY_NOTICES.txt`), `scripts/check-site.mjs` (`notices:` rules), `vite.config.ts` (plugin in `plugins` and `worker.plugins`).
    - Tests: `tests/unit/notices.test.ts`, `tests/unit/build-site.test.ts`, `tests/unit/site-dist.test.ts`.
    - _Requirements: 15.6, 15.8, 18.3_

  - [x] 15.7 Checkpoint for the review fixes
    - Run the tests, typecheck, and lint of `@ghost-run/site`, `corepack pnpm build:site`, and the site check. All pass. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 19.1, 19.4_

## Notes

- Every task is required. No task is marked optional.
- Property map (design number: task): L1 (8.2), L2 (6.2, 7.1, 11.5), L3 (2.2, 11.4), L4 (11.6), L5 and L6 (10.5), L7 (9.5), L8 (9.3), L9 (10.3), L10 (10.4), L11 (1.3), L12 (3.3). The review fixes A to F (group 15) add no new property; they extend L9 (15.2) and the parity tests of L1 (15.3).
- Task 1.1 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- **Not Kiro tasks (owner or Claude Code):**
  - The screenshot comparison of the built section and Mockup_V5 at 920 px and 1280 px for each world at each step (Requirement 2, criterion 9).
  - The browser load of `/` under the root `_headers` with all three worlds and a completed Hand run, with no console policy violation (Requirement 14, criterion 5; Open question O3). If it fails, the owner decides which directive to add.
  - The load times and the memory of the engines in Chrome.
  - The keyboard and screen-reader pass of Requirement 16.
  - Deployment and the devlog.
- Open questions O1 to O14 and decisions D1 to D6 of `design.md` are taken with the stated defaults. Tasks 5.1, 7.1, and 8.1 report the facts they find that touch O4, O9, and O10 (the Hand chunk size, the verdict of `make it public`, and the Shell entries).
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "3.1", "3.2", "4.1"] },
    { "id": 3, "tasks": ["3.3", "5.1", "6.1", "7.1", "9.1"] },
    { "id": 4, "tasks": ["6.2", "8.1", "9.2", "9.4"] },
    { "id": 5, "tasks": ["8.2", "9.3", "9.5", "10.1", "11.1"] },
    { "id": 6, "tasks": ["10.2"] },
    { "id": 7, "tasks": ["10.3", "10.4", "10.5", "11.2"] },
    { "id": 8, "tasks": ["11.3"] },
    { "id": 9, "tasks": ["11.4"] },
    { "id": 10, "tasks": ["11.5", "11.6", "12.1", "12.2"] },
    { "id": 11, "tasks": ["13.1"] },
    { "id": 12, "tasks": ["14"] },
    { "id": 13, "tasks": ["15.1"] },
    { "id": 14, "tasks": ["15.2", "15.6"] },
    { "id": 15, "tasks": ["15.3"] },
    { "id": 16, "tasks": ["15.4"] },
    { "id": 17, "tasks": ["15.5"] },
    { "id": 18, "tasks": ["15.7"] }
  ]
}
```

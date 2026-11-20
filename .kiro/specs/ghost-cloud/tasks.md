# Implementation Plan: ghost-cloud

## Overview

This plan builds the world `ghost-cloud` in `worlds/ghost-cloud/`: the package, the state and parser, the six `World<S, A>` functions, the two wards, the Pipeline_Entry, the four demo plans, the Reference_Model, and the contract test that passes the `verifyWorld` registration gate. The gate and the four demo plans come first, so that a failing contract shows up in the first implementation run.

State that already exists and is not recreated: `core/` (`World`, `ghostRun`, `WardEngine`, `renderMessage`, `verifyWorld`), `wards-config` (`parseWards`), the UI kit, and `apps/ghost-shell/src/pipeline/verdict.ts` (read as the model for the shown verdict, never imported). The hooks `world-scaffold`, `contract-pbt`, and `blacklight-steering` are disabled in this repository, so every hook step is done by command.

## Implementation Runs

| Run | Tasks | Ends with |
|---|---|---|
| 1 | 1 to 6 | Package, world, wards, Pipeline_Entry, demo plans, and the registration gate pass (Properties 1 to 4, 11). A failing contract shows here. |
| 2 | 7 to 10 | Property tests for the parser, step, diff, render, effects, wards, pipeline, and the negative control (Properties 5 to 10, 12 to 14, 17). |
| 3 | 11 to 13 | Scan tests, README and claims, measurement, and the final checkpoint (Properties 15, 16). |

Each run starts by running `corepack pnpm --filter @ghost-run/ghost-cloud test` and fixing what the previous run left failing.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: ghost-cloud, Property n: title` and `// **Validates: Requirements ...**`, uses `fc.assert(...)`, and prints the seed on failure. The numbers n are those of the design.
- **Run sizes.** 100 examples in a Short_Run, 10,000 in a Nightly_Run (`GHOST_PBT_MODE=nightly`), read from `tests/pbt-config.ts` (a new file in the style of `worlds/playground-shell/tests/pbt-config.ts`). The save-time run stays within 55 s.
- **Tests import** `describe`, `it`, and `expect` from `vitest`, so they run under the package config and under the root `vitest.worlds.config.ts`.
- **Test data.** Canary values only. Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and `192.0.2.0/24`; the tests use `s3.example` and `store.test`. Hidden Unicode and the HTML comment opener are never written literally; tests build them with `\u` escapes or `String.fromCodePoint`.
- **No LLM calls and no network calls** in the world, its tests, or its scripts. No Kiro Crew agent or tool.
- **Scope of this plan.** Files under `worlds/ghost-cloud/` and `.kiro/specs/ghost-cloud/`. Two exceptions need the owner's answer (design, Q1 and Q3): the `pnpm-lock.yaml` importer entry and an appended entry in `docs/measurements.md`. Without the answer, do not touch those files; record the measurement in the world README. No change to `core/`, other worlds, `apps/`, hooks, or `.kiro/agents/`.
- **Test labels.** Every test is `[no-docker]` and runs everywhere.

## Tasks

- [x] 1. Package skeleton and scaffold files
  - [x] 1.1 Create the package files in `worlds/ghost-cloud/`
    - `package.json`, `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts` as in design Component 1 (copy the shape of `worlds/playground-shell`, drop `sql.js`, `jsdom`, and `setupFiles`, add the `node:*` ban for `src/`). Create `src/index.ts` with a placeholder export so that the folder is not empty.
    - Run `corepack pnpm install` only if the owner answered Q1; otherwise report that the workspace link is missing and stop this task.
    - _Requirements: 4.3, 11.1, 11.2_

  - [x] 1.2 Create the four scaffold files by command, without overwriting
    - Run this from the repository root. It writes a file only when it does not exist:
      `node --input-type=module -e "import fs from 'node:fs'; import path from 'node:path'; import { renderTemplates } from './integrations/kiro-hook/lib/scaffold/templates.mjs'; for (const [f, c] of Object.entries(renderTemplates('ghost-cloud'))) { const p = path.join('worlds/ghost-cloud', f); if (!fs.existsSync(p)) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); } }"`
    - This gives `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md`. They are replaced in tasks 3, 4, 6, and 12.
    - Run `typecheck` and `lint` once to confirm that the skeleton is clean.
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 2. Types, fixture, and parser
  - [x] 2.1 Write `src/types.ts` and `src/fixture.ts`
    - State, Action, and constants as in design Component 2. The fixture is the fixed table of that component. Sorted arrays only, no `Map`.
    - _Requirements: 1.1, 1.2, 1.6, 1.7_

  - [x] 2.2 Write `src/parse.ts` and `src/pipeline/texts.ts`
    - `parseLine` with the seven ordered checks of design Component 3. Fixed reason strings only. The unsupported-step reason `unsupported command, not rehearsed.` lives in `texts.ts`.
    - _Requirements: 1.2, 1.3_

  - [x] 2.3 Write example tests for the parser [no-docker]
    - `tests/parse.test.ts`: one valid line per row of the table, each option order, `--endpoint-url`, and one rejected line per rule (too long, hidden character from `\u200B`, tab, shell operators, unknown option, bad bucket name, bad key, local destination for `cp`, blank line).
    - _Requirements: 1.2, 1.3_

- [x] 3. The six world functions
  - [x] 3.1 Write `src/apply.ts` (pure `applyAction`)
    - The rules table of design Component 4. Never throws; returns the error text for an invalid or unsupported action. Error texts use fixed text and validated tokens only.
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 3.2 Write `src/diff.ts`, `src/scene.ts`, `src/fingerprint.ts`, and `src/effects.ts`
    - `diffStates` with the three passes and the sort of design Component 5. `renderScene`. `fingerprintState` with `globalThis.crypto.subtle`. `effectsOutsideAction` with the host pattern.
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

  - [x] 3.3 Write `src/world.ts`, `src/index.ts`, and `world.config.ts`
    - `createGhostCloudWorld(options?)` with the six functions. Export the world factory, `parseLine`, the types, and (later) the pipeline entry from `src/index.ts`. In `world.config.ts` import the factory and keep `deterministic: false` until task 6.3.
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2_

  - [x] 3.4 Write example tests for the six functions [no-docker]
    - `tests/world.test.ts`: one test per action kind on the fixture (state change and diff), one test per invalid case of Requirement 1, criterion 4, the attribute rule (deleting a bucket gives changes for the bucket and its objects only; creating one likewise; an ACL change gives one `file-overwritten` on `_acl/BUCKET`), and `create()` without any I/O.
    - _Requirements: 1.4, 2.2, 2.3, 2.4, 2.5, 2.7_

- [x] 4. Wards and Pipeline_Entry
  - [x] 4.1 Write `wards.yaml`
    - The two wards of design Component 6, with `prod-*` for `no-bucket-delete` and `_acl/prod-*` and `_public-access-block/prod-*` for `no-public-bucket`.
    - _Requirements: 5.1, 5.2, 5.6_

  - [x] 4.2 Write `src/pipeline/verdict.ts` and `src/pipeline/run-plan.ts`
    - `buildShownVerdict` in own code (read `apps/ghost-shell/src/pipeline/verdict.ts`, do not import it). `runGhostCloudPlan` with the eight steps of design Component 7, the 50-line cut, per-line records, scenes, and plain-data output. Export it from `src/index.ts`.
    - P1 check (D11, changed by the owner): fingerprint Reality before and after the ghost run and return `p1: { equal, before, after }` (hashes only). On a difference the verdict is `block`, a notice says the ghost run changed reality and that this is a bug, and the claims passed to `renderMessage` are lowered.
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10_

- [x] 5. Demo plans
  - [x] 5.1 Write the four plan files and `src/demo.ts`
    - `demo/01-delete-protected-bucket.txt`, `02-make-bucket-public.txt`, `03-delete-temporary-bucket.txt`, `04-non-copy-endpoint.txt` with the lines of Requirement 7, criterion 2. `DEMO_PLANS` repeats them as constants.
    - _Requirements: 7.2_

  - [x] 5.2 Write `tests/demo.test.ts` [no-docker]
    - **Property 11: Demo verdicts and exact ward sets.** Run each plan through `runGhostCloudPlan` with the parsed `wards.yaml`. Assert the verdict and the exact set of distinct violated ward ids: (a) `block` and `{no-bucket-delete}`, (b) `block` and `{no-public-bucket}`, (c) `pass` and `{}`, (d) `warn` and `{}`. Assert that plan (d) has one `effect-outside` notice with destination `s3.example`, and that the files of `demo/` equal `DEMO_PLANS` (drop one trailing empty row).
    - **Validates: Requirements 5.4, 5.5, 7.2, 7.3, 7.5**

- [x] 6. Registration gate (Reference_Model, action generator, contract test)
  - [x] 6.1 Write `tests/support/reference-model.ts` and `tests/support/arbitraries.ts`
    - The Reference_Model of design Component 10 (flat `Map`, own interpreter, own validity checks, per-action sorted events; `import type` only). `actionArb` of design Component 9. Plus `tests/pbt-config.ts`.
    - _Requirements: 3.3, 3.4_

  - [x] 6.2 Replace the scaffold `tests/contract.test.ts` with the real gate
    - Parse `wards.yaml` with `parseWards`, call `createGhostCloudWorld()`, call `verifyWorld` with `deterministic: true`, the `testAdapter`, `actionArb`, and `numRuns`. Replace the placeholder `actionArb` and the placeholder `config.create()` call.
    - **Property 1: P1 (fingerprint before equals after)**
    - **Property 2: P3 (immutability and replay)**
    - **Property 3: P2 (ghost diff equals the Reference_Model change set)**
    - **Property 4: Ward checks (P4)**
    - **Validates: Requirements 2.2, 2.3, 2.6, 3.1, 3.2, 3.3, 3.5**

  - [x] 6.3 Set `deterministic: true` and run both gate commands
    - Set `deterministic: true` in `world.config.ts` only after Property 3 passes. Run `corepack pnpm --filter @ghost-run/ghost-cloud test` and the root contract run. Record the measured `verifyWorld` time and `numRuns` (in the world README, see task 12.2).
    - If any of Properties 1 to 4 or 11 fails, stop and fix before task 7. This is the checkpoint of run 1.
    - _Requirements: 3.2, 3.3, 4.1, 6.2_

- [x] 7. Parser and step property tests
  - [x] 7.1 Write `tests/prop-05-parser-totality.test.ts` and `tests/support/format-action.ts` [no-docker]
    - Three generators: random Unicode strings; mutations of valid lines (extra token, unknown option, shell operator, line over 1,024 characters, a hidden character from `\u` escapes); valid lines. `formatAction` is the test-only inverse of the parser.
    - **Property 5: Parser totality**
    - **Validates: Requirements 1.2, 1.3, 12.5**

  - [x] 7.2 Write `tests/prop-06-parser-roundtrip.test.ts` [no-docker]
    - **Property 6: Parser round trip**
    - **Validates: Requirements 1.2**

  - [x] 7.3 Write `tests/prop-07-step-purity.test.ts` [no-docker]
    - Use a wider action generator than `actionArb`: also missing buckets, empty or invalid keys, and `unsupported` actions.
    - **Property 7: Step purity**
    - **Validates: Requirements 1.4, 1.5, 1.6, 2.3**

- [x] 8. Diff, render, fingerprint, and effects property tests
  - [x] 8.1 Write `tests/prop-08-diff.test.ts` [no-docker]
    - The oracle flattens states in the test (not through the Reference_Model's interpreter) and checks the five clauses of Property 8.
    - **Property 8: Diff minimality and order**
    - **Validates: Requirements 2.4**

  - [x] 8.2 Write `tests/prop-09-render-fingerprint.test.ts` [no-docker]
    - **Property 9: Render purity and fingerprint stability**
    - **Validates: Requirements 2.5, 2.6**

  - [x] 8.3 Write `tests/prop-10-effects.test.ts` [no-docker]
    - Include `endpointUrl` strings that do not match the host pattern.
    - **Property 10: Effects**
    - **Validates: Requirements 2.7**

- [x] 9. Ward soundness and the negative control
  - [x] 9.1 Write `tests/prop-12-ward-soundness.test.ts` [no-docker]
    - Plans from `actionArb`, run through `runGhostCloudPlan`; the expected set and verdict come from the Reference_Model events (design, Property 12).
    - **Property 12: Ward soundness (P5 for supported plans)**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 8.1**

  - [x] 9.2 Write `tests/prop-17-negative-control.test.ts` [no-docker]
    - Three wrappers around `createGhostCloudWorld({ reality })`: `step` writes to the injected store (P1), `diff` drops one change (P2), `step` mutates its input (P3). `verifyWorld` must throw a `VerificationError` with the right property id for each.
    - **Property 17: Gate catches a broken world**
    - **Validates: Requirements 3.2, 3.3, 8.1**

- [x] 10. Pipeline property tests
  - [x] 10.1 Write `tests/prop-13-pipeline-floor.test.ts` [no-docker]
    - Plans of 0 to 50 lines mixing lines from `formatAction` and unsupported lines. Compare with the verdict computed from the engine verdict.
    - Add a P1 case: a world factory whose `step` writes into the injected `reality` store makes the run `block` with `p1.equal === false`, one P1 notice, and the lowered-claim line in the message. With a correct world, `p1.equal` is true and `before` equals `after`.
    - **Property 13: Pipeline floor and notices**
    - **Validates: Requirements 12.2, 12.4, 12.6, 12.10**

  - [x] 10.2 Write `tests/prop-14-pipeline-shape.test.ts` [no-docker]
    - Arrays of 0 to 80 random strings. Assert no throw, per-line records, `truncatedLines`, scenes, the cut-off notice, and `structuredClone` plus JSON round-trip equality. Add one example test with a broken world factory (internal error path). Assert that `p1` holds hashes only and survives the JSON round trip.
    - **Property 14: Pipeline totality and shape**
    - **Validates: Requirements 12.5, 12.7, 12.8, 12.9**

- [ ] 11. Scan tests
  - [ ] 11.1 Write `tests/scan-imports.test.ts` [no-docker]
    - Walk the imports of `src/index.ts` and `src/pipeline/run-plan.ts`; check `tests/support/reference-model.ts` for value imports from `src/`.
    - **Property 15: Import scans**
    - **Validates: Requirements 3.3, 4.3, 12.3**

  - [ ] 11.2 Write `tests/scan-hygiene.test.ts` [no-docker]
    - Forbidden-API patterns built from fragments (as `worlds/playground-shell/tests/scan/world-scan.test.ts`), hidden-character and comment-opener scans over `worlds/ghost-cloud/` and `.kiro/specs/ghost-cloud/`, reserved hosts, no user name or home path. The scan test file does not scan itself.
    - **Property 16: Hygiene scans**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6**

- [ ] 12. README, claims, and measurement
  - [ ] 12.1 Write `worlds/ghost-cloud/README.md`
    - The six functions, the path model, the two wards and the limits of Requirement 5, criterion 3, the claims table of design Component 12, the non-claims, the statement that real mode and the moto server are not implemented, and the Tested_Environments (Node version from `node -v`; browser engine: not run).
    - _Requirements: 5.3, 5.7, 8.1, 8.2, 8.3, 8.4_

  - [ ] 12.2 Measure the suite and record it
    - Time the `verifyWorld` call and the full package test. It must finish within 55 s. Write the time and `numRuns` in the README ("Measurements"). Append to `docs/measurements.md` only if the owner answered Q3. A `numRuns` below 100 needs a written reason there.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 13. Final checkpoint
  - Run, from the repository root:
    - `corepack pnpm --filter @ghost-run/ghost-cloud test`
    - `corepack pnpm --filter @ghost-run/ghost-cloud typecheck`
    - `corepack pnpm --filter @ghost-run/ghost-cloud lint`
    - `corepack pnpm --filter @ghost-run/kiro-hook exec vitest --run --config ../../vitest.worlds.config.ts` (the contract test through the root config)
    - The possession scan of `worlds/ghost-cloud/` and `.kiro/specs/ghost-cloud/`: from `integrations/kiro-hook`, run a Node script that lists the files of both folders, calls `scanFiles(files, { markdown: 'by-extension' })` from `@ghost-run/core/possession-node`, and exits non-zero unless `report.outcome` is `clean`. Print `formatReport(report)` on failure. The script is a one-off command and is not added to the repository.
  - Confirm: Properties 1 to 4 pass; every demo plan has the exact ward set of Property 11; the README lists every claim and non-claim; the suite time is recorded; `core/`, other worlds, `apps/`, hooks, and `.kiro/agents/` are unchanged (`git status`). Ensure all tests pass, ask the user if questions arise.
  - Report the files changed, the test results, and every property not claimed, with the reason (P6 and P8: not applicable; P2 against a real S3 service: not claimed; P1, P2, P5 for a run with an Unsupported_Step: lowered).

## Notes

- Every task is required. No task is optional.
- Property numbers in this plan are those of the design. They are not P1 to P8 of the safety contract, except where a title says so (Properties 1 to 4 are P1, P3, P2, and P4 in that order).
- The task order inside a run follows the dependencies: task 3 needs 2, task 4.2 needs 3, task 5 needs 4, task 6 needs 3 to 5.

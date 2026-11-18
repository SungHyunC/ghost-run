# Implementation Plan: <world-name>

> **Template notice.** This file is a fill-in skeleton from `.kiro/specs/_new-world/`. The checkboxes are placeholders. Replace every `<placeholder>`, `Fill in:` line, and `TBD`, then delete this block. Do not run the tasks of the template folder itself.

## Overview

This plan builds the world `<world-name>` in `worlds/<world-name>/`: the state and actions, the six `World<S, A>` functions, the wards file, the registration file, and the contract test that passes the `verifyWorld` registration gate.

Fill in: the order that fits this world. The default order is below.

1. Folder and registration skeleton (the `world-scaffold` hook creates the first files).
2. Types, then the six functions.
3. Wards and the default `wards.yaml`.
4. The registration gate (P1, P3, and P2 only if deterministic) and the ward properties.
5. The save-time run budget, the scene and demo plans, the README claims, and hygiene.

State that already exists and is not recreated by this plan: `core/` (`World`, `ghostRun`, `WardEngine`, `verifyWorld`, possession scanner), `wards-config` (`parseWards`), `ui/` (mirror world, candle, red thread, graveyard), and the hooks `world-scaffold`, `contract-pbt`, and `blacklight-steering`.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: <world-name>, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))`, and prints the seed on failure.
- **Run sizes.** At least 100 examples in a Short_Run, at least 10,000 in a Nightly_Run (`GHOST_PBT_MODE=nightly`). The whole save-time run stays within 55 s.
- **Test labels.** `[no-docker]` runs everywhere. `[docker]` needs a running Docker daemon and uses `describe.skipIf(!dockerAvailable)`, reporting `skipped (docker unavailable)`, never `passed`.
- **Test data.** Canary values only (for example `sk-CANARY-abc123`). Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and `192.0.2.0/24`. Hidden Unicode and the HTML comment opener are never written literally; tests build them with `\u` escapes or `String.fromCodePoint`.
- **Measurement records.** Measured results go to `docs/measurements.md` as appended entries. `docs/devlog.md` is not edited by this plan.
- **No LLM calls and no network calls** in the world, its tests, or its scripts.
- **Scope of this plan.** Files under `worlds/<world-name>/`, the spec files of this world, and an appended entry in `docs/measurements.md`. No change to `core/`.

## Tasks

- [ ] 1. Folder and registration skeleton
  - [ ] 1.1 Create `worlds/<world-name>/` and let the scaffold hook fill it
    - Create the first file in `worlds/<world-name>/` with the agent's file tool (for example `src/types.ts`). The `world-scaffold` hook then creates `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md` for the files that do not exist. If the hook did not fire (the folder was made by a shell command or by a human), copy the four files from the templates in `integrations/kiro-hook/lib/scaffold/templates.mjs` by hand.
    - Create `worlds/<world-name>/package.json` (`name` `@ghost-run/<world-name>`, `private: true`, `type: module`; dependencies `@ghost-run/core` and the runtime libraries of Requirement 4 only; scripts `test`, `typecheck`, `lint`) and the `tsconfig.json` and ESLint config in the style of an existing world. Run `corepack pnpm install`.
    - _Requirements: 4.1, 4.3, 9.1_

  - [ ] 1.2 Check the license of every new runtime dependency
    - Fill in: the dependencies, each with name, version, and license. Add each row to the root README dependency table in the same change.
    - _Requirements: 11.1, 11.2_

- [ ] 2. State and actions
  - [ ] 2.1 Define `<State>`, `<Action>`, and `<ChangeKind>` in `src/types.ts`
    - Fill in: the shapes of Requirement 1 as plain serializable data. No handle to reality.
    - _Requirements: 1.1, 1.2_

  - [ ] 2.2 Write unit tests for the types and the invalid-action path [no-docker]
    - `tests/types.test.ts`: an invalid action returns the snapshot unchanged with a recorded error and does not throw.
    - _Requirements: 1.3_

- [ ] 3. The six world functions
  - [ ] 3.1 Implement `snapshot` and `fingerprint` in `src/world.ts`
    - `snapshot()` returns a deep copy and leaves reality unchanged. `fingerprint()` returns a stable hash of the real state. Fill in: what is hashed.
    - _Requirements: 2.2, 2.6_

  - [ ] 3.2 Implement `step`
    - Apply one action to a snapshot without modifying reality or the input snapshot. Fill in: the effect of each action kind.
    - _Requirements: 2.3, 1.4_

  - [ ] 3.3 Implement `diff`
    - Return the minimal set of `Change` objects and cover every change kind. Fill in: the change kinds.
    - _Requirements: 2.4_

  - [ ] 3.4 Implement `render` and `effectsOutside`
    - `render` is pure and returns a `Scene`. `effectsOutside` returns a non-empty list for every action that leaves the copy. Fill in: the scene entities and the out-of-copy actions.
    - _Requirements: 2.5, 2.7_

  - [ ] 3.5 Write `create()` and the registration file
    - `create()` builds the world without a network, a Docker daemon, or a real credential. Replace the placeholder `create` in `world.config.ts` and keep `deterministic: false` until task 7.3.
    - _Requirements: 4.1, 4.2_

- [ ] 4. Wards
  - [ ] 4.1 Write `wards.yaml`
    - Fill in: the wards of Requirement 5 (`<ward-id>`), each with its kind and rules. The file must pass `parseWards`.
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ] 4.2 Write the ward example tests [no-docker]
    - `tests/wards.test.ts`: one plan per ward that is blocked with the ward id and the numbers in the message, and one plan with an out-of-copy effect that warns.
    - _Requirements: 5.3, 5.4_

- [ ] 5. Action generator
  - [ ] 5.1 Write `actionArb` in `src/actions.ts`
    - Generate only valid actions and cover every action kind. Fill in: how it is built and its size limits.
    - _Requirements: 3.5_

- [ ] 6. Registration gate and properties
  - [ ] 6.1 Fill in `tests/contract.test.ts` (`verifyWorld`)
    - Call `verifyWorld` with `id`, `deterministic`, `wardSet`, `actionArb`, `numRuns`, and, if needed, `stateEquals`. P1 and P3 must pass.
    - _Requirements: 3.1, 3.2, 3.6_

  - [ ] 6.2 Write the property test for out-of-copy effects [no-docker]
    - `tests/effects.property.test.ts`: `effectsOutside(a)` is non-empty exactly for the actions that leave the copy.
    - **Property 4: Out-of-copy effects**
    - **Validates: Requirements 2.7**

  - [ ] 6.3 Write the property test for diff completeness [no-docker]
    - `tests/diff.property.test.ts`: applying the changes of `diff` to the first snapshot gives the second.
    - **Property 5: Diff completeness**
    - **Validates: Requirements 2.4**

  - [ ] 6.4 Write the property tests for the wards [no-docker]
    - `tests/wards.property.test.ts`: one property per ward of Requirement 5 (for example a plan that deletes a protected item produces `block`).
    - **Property 6: Ward properties**
    - **Validates: Requirements 3.6, 5.2, 5.3**

  - [ ] 6.5 Write the property test for render purity [no-docker]
    - `tests/render.property.test.ts`: `render(s)` twice gives equal scenes and leaves the snapshot unchanged.
    - **Property 7: Render purity**
    - **Validates: Requirements 2.5**

- [ ] 7. Determinism decision (P2)
  - [ ] 7.1 Decide whether the world is deterministic
    - Fill in: the evidence. If it is not shown, keep `deterministic: false`, claim no P2, and skip 7.2 and 7.3.
    - _Requirements: 3.3, 3.4_

  - [ ] 7.2 Write the `testAdapter` and the P2 property test (only if deterministic) [no-docker]
    - `tests/real-run.property.test.ts`: a plan that passes gives the same diff when applied for real in a test copy.
    - **Property 3: Same diff when executed for real**
    - **Validates: Requirements 3.3**

  - [ ] 7.3 Switch `deterministic` to `true` and re-run the gate (only if deterministic)
    - Set `deterministic: true` in `world.config.ts`, pass `testAdapter` to `verifyWorld`, and state the Tested_Environments in the README.
    - _Requirements: 3.3, 8.3_

- [ ] 8. Save-time budget
  - [ ] 8.1 Measure the world suite and set `numRuns`
    - Save a file in `worlds/<world-name>/` and read `.ghost-run/pbt/last.json`, or run the hook command by hand. The run must finish within 55 s. Append the measured times and the chosen `numRuns` to `docs/measurements.md`. A count below 100 needs a written reason there.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 9. Scene and demo
  - [ ] 9.1 Write the demo plans
    - Fill in: one plan that passes, one that warns, and one that is blocked by a named ward. Add an example test for each verdict.
    - _Requirements: 7.2_

  - [ ] 9.2 Check the scene in the UI kit
    - The mirror-world component draws the copy before and after the plan with the changes marked. Fill in: the page or story that shows it.
    - _Requirements: 7.1, 7.3_

- [ ] 10. Documentation and claims
  - [ ] 10.1 Write `worlds/<world-name>/README.md`
    - State the six functions, the wards, the claims table of Requirement 8 (with the non-claims), and the lowered claims when Docker is unavailable. State no property outside its scope.
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 11. Hygiene
  - [ ] 11.1 Write the hygiene tests [no-docker]
    - `tests/hygiene.test.ts`: the possession scan of `worlds/<world-name>/` and `.kiro/specs/<world-name>/` returns `clean`; no literal hidden character or HTML comment opener; hosts are reserved domains or `192.0.2.x`; secrets are canary values; no user name or home path; text is ASCII English.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Run `corepack pnpm -r build`, `corepack pnpm --filter @ghost-run/<world-name> test`, `typecheck`, `lint`, and the root world contract run (`vitest.worlds.config.ts`) in a Short_Run. Confirm: P1 and P3 pass; P2 passes or is not claimed; every ward has a test; the save-time run is within 55 s; the possession scan is `clean`; the README lists every dependency with its license. Ensure all tests pass, ask the user if questions arise.

## Notes

- Every task is required. No task is optional.
- Property numbers in this plan are those of the design. They are not P1 to P8 of the safety contract, except where a title says so.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1", "5.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.2"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "9.1"] },
    { "id": 7, "tasks": ["7.3", "9.2", "10.1"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["12"] }
  ]
}
```

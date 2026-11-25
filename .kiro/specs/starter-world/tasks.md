# Implementation Plan: starter

## Overview

This plan builds the world `starter` in `worlds/starter/`: the state and actions, the six `World<S, A>` functions, the wards file, the registration file, the contract test, and a one-command demo. Order: package skeleton, world, wards, tests, demo, documentation.

## Conventions

- No LLM calls and no network calls in the world, its tests, or its scripts.
- Scope: files under `worlds/starter/`, the spec files of this world, the root `README.md`, and the lockfile. No change to `core/`.

## Tasks

- [x] 1. Package skeleton
  - [x] 1.1 Create `worlds/starter/` with `package.json` (`@ghost-run/world-starter`), `tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts`, then run `corepack pnpm install`
    - _Requirements: 4.3_

  - [x] 1.2 Check the license of the new dependency
    - `vite-node` ^3.2.4, MIT. Listed in the root README dependency table.
    - _Requirements: 8.2_

- [x] 2. World
  - [x] 2.1 Write `src/world.ts` with the state, the actions, and the six functions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.2 Write `src/index.ts` and `world.config.ts`
    - `deterministic: false`.
    - _Requirements: 3.3, 4.1, 4.2_

- [x] 3. Wards
  - [x] 3.1 Write `wards.yaml` with the ward `keep-todos`
    - _Requirements: 5.1, 5.3_

- [x] 4. Tests
  - [x] 4.1 Write `tests/contract.test.ts`
    - `verifyWorld` with an `actionArb` of the three action kinds, plus the registration and invalid-action checks.
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] 5. Demo
  - [x] 5.1 Write `scripts/run-demo.ts`, `scripts/demo.ts`, and the `demo` script
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Write `tests/demo.test.ts`
    - _Requirements: 6.4_

- [x] 6. Documentation
  - [x] 6.1 Write `worlds/starter/README.md` and update the root `README.md`
    - _Requirements: 7.1_

- [x] 7. Final checkpoint
  - Run `test`, `typecheck`, `lint`, and `demo` of `@ghost-run/world-starter`, and the root `test`, `typecheck`, and `lint`.

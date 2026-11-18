# Requirements Document

## Introduction

The `ghost-hand` spec defines App 2 of Ghost Run+ (confirmed by the user on 2026-11-18): the static web app at `apps/ghost-hand/` and the physics world that it runs. A visitor opens a web page, sees a robot arm made of primitive shapes (capsules and boxes) that wants to open the drawer of a cabinet with a vase on top, and watches several ghost arms try the plan first. Each ghost runs in a "haunted variant": a copy of the physics world in which drawer friction, drawer mass, handle position, sensor noise, and command delay are perturbed by a seed. A ward judges the variants. Failed ghost arms fade out in red. Only when every ward passes does a reference simulation (standing in for a real arm) execute the plan.

This spec covers these parts:

1. **Ghost Hand app**: a zero-install, statically hosted page with no server, no LLM, and no API key, built from the `ui-kit` components plus a 3D ghost overlay (Three.js).
2. **Physics world**: a `World<GhostHandState, GhostHandAction>` backed by `@mujoco/mujoco` (WebAssembly). It has an arm, a cabinet with one drawer, and a vase. It passes `verifyWorld` from `core`.
3. **Actions**: only the fixed motions `reach(target, speed)`, `grasp(force)`, `pull(distance, speed)`, and `release()` with values inside declared ranges.
4. **Haunted variants**: seeded perturbations inside declared ranges. The same seed and the same plan give the same outcome (P8, within the tested environments only).
5. **Wards**: one `physics` Ward judges the variants through the existing `WardEngine`. This spec adds no ward logic.
6. **Plan file and replay**: a JSON plan format. The playground replays a plan that was recorded from a real Kiro agent session, or a scripted plan. No external LLM API is called.
7. **Demo flow**: a first plan (fast pull) fails in some variants, the violated ward is read, a revised plan (slow pull, gentle grip) passes every variant, and the reference simulation then opens the drawer.
8. **Optional possession scenario**: a hidden instruction in the task text that sends the arm toward the vase is blocked by the forbidden-contact ward, and the red thread points at that line.

The spec reuses the types and functions of the existing specs and defines no second shape for any of them: `World`, `Snapshot`, `Change`, `Scene`, `Effect`, `FingerprintResult`, `GhostReport`, `VariantResult`, `Ward` (kind `physics`), `WardSet`, `WardVerdict`, `WardViolation`, `WardNotice`, `Verdict`, `ghostRun`, `WardEngine.evaluate`, `isMoreRestrictive`, `compareFingerprints`, `verifyWorld`, and `DeterministicTestAdapter` from `core`; `renderMessage` (the Message_Builder) and `Claims` of `wards`; `parseWards` and `formatConfigError` of `wards-config`; `scanText`, `collectNeedles`, `traceRedThread`, `Needle`, `ThreadLink`, `Provenance_Record`, and `Provenance_Log` of `possession`; and the components, `Grave_Entry`, `Isolation_Claims`, and the Display_Escaper of `ui-kit`.

Experiment C (`docs/devlog.md`, throwaway code outside this repository) is the evidence for the choices below. Its code is NOT imported or copied. Only code written after 2026-10-30 is used. Its numbers are provisional evidence and are not requirements.

Three changes outside this spec are prerequisites (Requirement 21): PR-1 (core and wards: optional `VariantResult` fields `jointLimitExceeded` and `selfCollisionOccurred`, and a `physics` Ward rule that blocks when any variant has either field true), PR-2 (wards: reason-based wording of the lowered-claim message, and no appended line when `claims` is not passed), and PR-3 (ui-kit: the Claim_Banner can show P5 and P6 as "not applicable"). They are implemented in the next wards round and the next ui-kit round, not in this spec. Ghost Hand presupposes them and does not claim the joint-limit and self-collision ward, or any wording that depends on PR-2 or PR-3, until they have landed.

Safety claims follow the world-contract steering ("Claimed in" column). This spec asserts each property only within its declared scope:

| Property | Claimed by Ghost Hand | Not claimed |
|---|---|---|
| P1 ghost never changes reality | Per run in the browser page: claimed only when the fingerprint of the live Reference_State before the ghost run equals the fingerprint after it. The flag is computed from the two fingerprints and never assumed. Reality here is the in-memory Reference_State of the page. | A physical robot (none exists). State that the fingerprint does not track. The Node entry point (it reports the check result as information; the claim is made for the page). Any Docker-box statement (no Docker box is used) |
| P2 passing plan yields the same diff when executed for real | Per run: the diff of the base ghost run is compared with the diff of the reference execution of the same plan from the same initial state, both by the same engine build in the same environment. Within the tested environments only. Scope wording (to be written into the world-contract steering by task S5): "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware." Until that steering update lands, the page and the README show no P2 text | A physical arm. Any environment outside the tested environments. A statement about fidelity to hardware. Variant runs (they are perturbed copies and have no "real" counterpart) |
| P3 restore | Claimed for the world (all worlds): a reused snapshot gives a bit-identical state and a bit-identical trajectory, including integrator state such as warm-start values. Evidence is gathered in the tested environments and by a runtime self-check in the page | n/a |
| P4 stricter wards never add passing plans | Not asserted here. Evidence comes from the pure engine in `core` (all worlds). Ghost Hand only reuses the engine and adds example tests for the demo | n/a |
| P5 protected paths | Not claimed (the world has no files) | Every run |
| P6 secret egress block | Not claimed (the world has no secrets and no network) | Every run |
| P7 hidden Unicode | Only in the optional possession scenario, through the pure scanner of `possession` | Invisible characters outside the possession categories. Text analysis does not catch every injection |
| P8 same seed and plan give identical variant outcomes, and variant values stay inside declared ranges | Within the tested environments only (Tested_Environments in the Glossary) | Firefox, Safari, Linux, x86 machines, and every other environment. A browser outside the tested list can only show the result of the Determinism_Self_Check |

The numbers GH-P1 to GH-P8 in this spec denote only the properties of this spec (Requirement 18). They are separate from P1 to P8 of the safety contract, UI-P1 to UI-P11 of `ui-kit`, and GS-P1 to GS-P6 of `ghost-shell`.

Hidden characters are never written literally in this document. A hidden character is named by its code point (for example U+200B). Secrets in tests and demos are canary values (for example `sk-CANARY-abc123`). Hosts in examples use reserved domains (for example `setup-check.example`).

## Glossary

- **Ghost_Hand_App**: The static web application in `apps/ghost-hand/` (workspace package name `@ghost-run/ghost-hand`).
- **Ghost_Hand_World**: The `World<GhostHandState, GhostHandAction>` implementation of this spec. Its folder name under `worlds/` is a design decision (Open Item 1).
- **MuJoCo_Module**: The WebAssembly physics engine from the npm package `@mujoco/mujoco` version 4.0.1, used in its single-thread build.
- **Arm**: The serial robot arm of the world, made of capsules and boxes, with hinge joints and two fingers that open and close on the Handle.
- **Cabinet**: The box-shaped body that holds the Drawer and carries the Vase on its top face.
- **Drawer**: The body of the Cabinet that slides along one slide joint.
- **Handle**: The part of the Drawer that the fingers grasp.
- **Vase**: A free body that stands on top of the Cabinet.
- **Contact_Name**: A name by which a body can appear in `forbidden_contacts`. The world declares the list of valid Contact_Names (at least `vase`).
- **World_Config**: The single declared configuration file of the world: model constants, the Action_Ranges, the task (target opening distance), the time step, per-action and per-plan simulated-time limits, and the list of Contact_Names. Its location and format are design decisions (Open Item 1).
- **GhostHandState**: The state type `S` of the Ghost_Hand_World. It holds the Variant_Params, the simulated time, the generalized positions and velocities, all integrator state (including warm-start values), the command-delay buffer, the PRNG state, the controller progress, and the run monitors. It contains only finite numbers, strings, booleans, plain arrays, plain objects, and typed arrays of numbers.
- **GhostHandAction**: The action type `A`: one of `reach(target, speed)`, `grasp(force)`, `pull(distance, speed)`, `release()`.
- **Action_Ranges**: The declared closed numeric range of every action value, held in the World_Config.
- **Plan**: An ordered list of 1 to 50 GhostHandActions.
- **Plan_File**: A JSON document in the format of Requirement 11 that holds one Plan.
- **Plan_Origin**: The Plan_File field `origin`, either `recorded` (taken from a real Kiro agent session) or `scripted` (written by hand).
- **Base_World**: The world with the unperturbed Variant_Params declared in the World_Config.
- **Variant_Params**: The perturbed values of one variant: drawer friction, drawer mass, handle position, sensor noise amplitude, and command delay.
- **Variant_Config**: The declared file that holds the default variant count, the default seed, and the closed range of every Variant_Params field. Its location and format are design decisions (Open Item 1).
- **Seed**: An unsigned 32-bit integer.
- **Variant_Sampler**: The pure function that maps a Seed, a variant index, and a Variant_Config to the Variant_Params of that variant.
- **Variant**: One haunted copy of the world, identified by `variantId` of the form `variant-<index>` with a zero-based index.
- **Variant_Result**: The `VariantResult` of `core` for one Variant: `variantId`, `success`, `contactForceN`, `forbiddenContactOccurred`, and, once PR-1 has landed, the optional booleans `jointLimitExceeded` and `selfCollisionOccurred`.
- **Prerequisite_Changes**: The three changes PR-1, PR-2, and PR-3 of Requirement 21, implemented outside this spec.
- **Joint_Self_Ward_Active**: The state in which PR-1 has landed in `core` and `wards`, so that the `physics` Ward blocks when any variant has `jointLimitExceeded` or `selfCollisionOccurred` true. Before that, the state is inactive and Ghost Hand makes no joint-limit or self-collision ward claim.
- **Reference_State**: The live in-memory state of the page that stands for reality. A ghost run never changes it.
- **Reference_Arm**: The Base_World executed against the Reference_State when the user runs the plan "for real". It stands in for a real arm. No hardware is involved.
- **Ghost_Run**: One rehearsal of a Plan: the Base_World ghost run, the Variant runs, the `GhostReport`, the Run_Verdict, the message, and the claims.
- **Run_Verdict**: The verdict of `WardEngine.evaluate` for a Ghost_Run, raised by the verdict floors of Requirement 9.
- **Ghost_Overlay**: The 3D view that draws one translucent Ghost_Arm per Variant over the Cabinet scene.
- **Ghost_Arm**: The drawn copy of the Arm for one Variant.
- **Overlay_View_Model**: The pure data structure that the Ghost_Overlay draws: for every Variant and every frame the link poses, the pass or fail state, and the fade amount.
- **Trajectory_Hash**: The SHA-256 hash over the exact bytes of the generalized positions and velocities of every simulated step of one run.
- **Golden_Hash**: The Trajectory_Hash of the fixed reference plan on the Base_World that the test suite records in the Tested_Environments and stores in the repository.
- **Determinism_Self_Check**: The check that the page runs on load: it runs the fixed reference plan twice on the Base_World and compares both Trajectory_Hashes with each other and with the Golden_Hash.
- **Tested_Environments**: Node.js 20.20.2 and Chrome 157 (headless), each with the single-thread build of the MuJoCo_Module, Chrome both on the main thread and in a Web Worker, on an Apple M1 Mac running macOS (the Reference_Machine). No other environment is tested.
- **Sim_Worker**: A Web Worker (or, in Node, an equivalent worker) that runs Variants. The partitioning of Variants over workers is a design decision (Open Item 2).
- **Run_Monitors**: The values accumulated in the GhostHandState during a run: the maximum contact normal force over all contacts that involve an Arm geometry, the set of Contact_Names that an Arm geometry touched, whether any joint limit was exceeded, whether any two Arm geometries collided, and the drawer displacement.
- **Ghost_Hand_Run_Function**: The function `runGhostHand(input)` of Requirement 8.
- **Wards_File**: The single canonical wards file of Ghost Hand (Requirement 9).
- **Grave_Entry**, **Isolation_Claims**, **Display_Escaper**, **Candle**, **Claim_Banner**, **Graveyard**, **Seance_View**, **Lights_Toggle**, **Red_Thread_View**, **Blacklight_View**, **Theme**, **Theme_Tokens**, **Contrast_Pair**: As defined in `ui-kit`.
- **Reference_Machine**: An Apple M1 machine, as in the `ghost-runner` spec.
- **Short_Run**: The property-based test run on file save: at least 100 generated examples per property.
- **Nightly_Run**: The property-based test run with at least 10,000 generated examples per property and no time limit.

## Requirements

### Requirement 1: Package Placement, Stack, Dependencies, and Licenses

**User Story:** As a maintainer, I want the app and the world placed so that the dependency direction of the structure steering holds and every dependency is listed with its license, so that `core/` stays free of app code and the license rules are met.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL be a pnpm workspace package in `apps/ghost-hand/` with the package name `@ghost-run/ghost-hand`, listed in `pnpm-workspace.yaml`, written in TypeScript with the compiler option `strict` enabled, using Vite and React.
2. THE Ghost_Hand_World SHALL be located in a folder `worlds/<name>/` with a `world.config.ts` that registers the world, where `<name>` is decided in the design phase (Open Item 1).
3. THE Ghost_Hand_App SHALL depend on `@ghost-run/core`, `@ghost-run/ui`, `@ghost-run/wards-config`, the Ghost_Hand_World package, `@mujoco/mujoco` (exact version 4.0.1), `three` (exact version 0.187.0), `react`, and `react-dom`, and on no other runtime package; `@types/three` (exact version 0.187.0), `vite`, `vitest`, and `jsdom` SHALL be development dependencies, and, only if the browser harness that uses Node built-ins and the installed Chrome command line fails (design D17), `playwright` (Apache-2.0) used with the installed Chrome through its `channel` option and without a browser download, and the versions of `react`, `react-dom`, `vite`, `vitest`, and `jsdom` SHALL equal the versions confirmed by `ui-kit`; the tests and the Node entry point SHALL run on Node.js 20.20.2.
4. THE Ghost_Hand_World SHALL depend on `@ghost-run/core` and `@mujoco/mujoco` only, SHALL NOT depend on `three`, `react`, or `@ghost-run/ui`, and SHALL import `@ghost-run/core` only through its public entry point.
5. THE Ghost_Hand_App SHALL import from `@ghost-run/wards-config` only the pure functions of its default entry point (`parseWards`, `formatConfigError`) and SHALL NOT import the subpath `@ghost-run/wards-config/node` or any module that needs a Node built-in, so that the browser bundle contains no `node:*` import.
6. THE `core/`, `ui/`, and `wards-config/` packages SHALL contain no import path that resolves to `apps/ghost-hand/` or to the Ghost_Hand_World folder; the ESLint `no-restricted-imports` rule of each package SHALL enforce this and `pnpm lint` SHALL fail when the rule is violated.
7. THE Ghost_Hand_App SHALL NOT import `@ghost-run/ghost-runner`, `integrations/*`, or any code of the throwaway Experiment C.
8. THE design SHALL list a steering update, and THE tasks.md of this spec SHALL contain a task that performs it, which updates `.kiro/steering/structure.md` so that the dependency direction allows `apps/*` to depend on `worlds/*` and records that the 3D ghost overlay lives in `apps/ghost-hand/` (the structure steering currently lists it under `ui/`); this spec edits no steering file.
9. BEFORE the Ghost_Hand_App is merged, THE repository README dependency table SHALL list every dependency of `apps/ghost-hand/` and of the Ghost_Hand_World (runtime and development) with name, version, and license, and SHALL list every font, icon, and other asset with source and license.
10. THE README dependency table SHALL record for `@mujoco/mujoco` 4.0.1 that the `package.json` license field says Apache-2.0 and that the published tarball contains no LICENSE file, and SHALL record `three` 0.187.0 and `@types/three` 0.187.0 as MIT.
11. THE build output SHALL include a third-party notices file that carries the license texts of the MuJoCo_Module and of the components bundled in its WebAssembly file, including Qhull (a license that is not OSI-approved and requires its notice to travel with the binary, as recorded in `docs/research.md`); the implementation SHALL take each text from the upstream source distribution and SHALL record the upstream URL and version beside it.
12. THE license of every new dependency SHALL be checked on the day it is added and recorded in the README table before merge.
13. THE Ghost_Hand_App and the Ghost_Hand_World SHALL be written in English in all code, comments, fixtures, and user-visible text, and SHALL contain no call to any LLM API.
14. THE Ghost_Overlay SHALL live inside `apps/ghost-hand/`, and `ui/` SHALL NOT import `three` or depend on it, so that `ui-kit` Requirement 1 criterion 7 stays unchanged.

### Requirement 2: Static Hosting and Zero Install

**User Story:** As a judge, I want to open one URL and run the demo without installing anything, so that I can try the product from the video or the text alone.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL build to static files (HTML, JavaScript, CSS, WebAssembly, and assets) that run without a server of its own, without an LLM call, and without an API key.
2. THE Ghost_Hand_App SHALL use only the single-thread build of the MuJoCo_Module and SHALL NOT use `SharedArrayBuffer`, so that the page runs on any static host without the response headers COOP and COEP (the multi-thread build stops silently without them).
3. THE build output SHALL bundle the MuJoCo_Module WebAssembly file as an asset of the same origin and SHALL reference no external origin (no `<script src>`, `<link href>`, `@import`, `url()`, or `fetch` target that points to another origin).
4. WHEN every component and the whole app are exercised in the test environment with `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by functions that throw, EXCEPT the loading of the bundled WebAssembly file from the page origin, THE Ghost_Hand_App SHALL call none of them while it runs the demo scenarios.
5. THE Ghost_Hand_App SHALL include no analytics, telemetry, tracking script, or CDN-hosted font, and SHALL store nothing in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies; the loaded Plan, the seed, and the Graveyard live in memory for the current page session only.
6. WHEN the page is loaded on the Reference_Machine in Chrome from a warm local static server, THE Ghost_Hand_App SHALL finish initializing the MuJoCo_Module and show the first scenario ready to run within 3.0 s.
7. THE README SHALL list macOS and Linux as supported operating systems, SHALL list Windows as unverified, and SHALL list Chrome 157 as the only browser that was tested (Requirement 10).
8. IF the browser fails to instantiate the MuJoCo_Module, THEN THE Ghost_Hand_App SHALL show the text `The physics engine could not start in this browser.` in an element with the role `alert` and SHALL NOT claim any rehearsal.

### Requirement 3: Ghost Hand World Implements the World Contract

**User Story:** As a world author and as the property-test harness, I want the physics world to implement all six `World<S, A>` functions, so that it inherits the ghost runner, the ward engine, and the UI kit.

#### Acceptance Criteria

1. THE Ghost_Hand_World SHALL implement `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside` with the signatures of `World<S, A>` from `core`, such that the TypeScript compiler reports no error for the declaration `const w: World<GhostHandState, GhostHandAction> = ghostHandWorld`.
2. THE GhostHandState SHALL be comparable by the structural comparison of `core/verify.ts` and clonable by `structuredClone`, SHALL hold no wrapped C++ object, no function, `Map`, `Set`, `Date`, or circular reference, and SHALL hold only finite numbers.
3. WHEN `snapshot()` is called, THE Ghost_Hand_World SHALL return a `Snapshot<GhostHandState>` whose `state` is a deep copy of the Reference_State, such that a later mutation of either copy leaves the other unchanged.
4. WHEN `step(s, a)` is called, THE Ghost_Hand_World SHALL load `s.state` into a MuJoCo_Module data object that it owns, apply the action, and return a new `Snapshot<GhostHandState>` whose `id` is unique within the world instance (a counter, not a time or random value); THE input `s.state` SHALL remain structurally unchanged.
5. WHEN `step(s, a)` is called, THE Ghost_Hand_World SHALL NOT write to the Reference_State, to any file, to the network, or to any global variable outside the returned snapshot and the objects that the world instance owns.
6. IF an action has values outside the Action_Ranges, or the plan time limit of the World_Config would be exceeded, THEN THE Ghost_Hand_World SHALL return a snapshot whose `result` is `{ success: false, error: "<non-empty description>" }` and whose `state` equals `s.state`, and SHALL NOT throw.
7. IF a simulated step produces a non-finite generalized position or velocity, THEN THE Ghost_Hand_World SHALL return a snapshot whose `result` is `{ success: false, error: "simulation unstable" }` and whose `state` equals `s.state`.
8. WHEN `diff(before, after)` is called with two snapshots whose states are recursively structurally equal, THE Ghost_Hand_World SHALL return an empty array; WHEN the states are not equal, THE Ghost_Hand_World SHALL return a non-empty `Change[]`.
9. THE `diff` method SHALL be pure and SHALL sort its result in a fixed order by `kind` and then by the identifying fields, and SHALL emit semantic Changes (at least the drawer displacement and a Vase displacement) in addition to one Change kind that reports any other state difference, so that criterion 8 holds for every state field.
10. WHEN `render(s)` is called, THE Ghost_Hand_World SHALL return a pure `Scene` such that `JSON.parse(JSON.stringify(scene))` is recursively structurally equal to `scene`; every number in the Scene SHALL be finite and a negative zero SHALL be written as `0`; the Scene SHALL hold no `Float64Array`.
11. WHEN `fingerprint()` is called, THE Ghost_Hand_World SHALL return a `FingerprintResult` whose `manifest` holds one SHA-256 hash (Web Crypto) per tracked resource of the live Reference_State (at least the generalized positions, the generalized velocities, the integrator state, the simulated time, and the Variant_Params) and whose `hash` is the SHA-256 over the sorted manifest, so that a change of one bit of one tracked resource changes `hash`.
12. WHEN `effectsOutside(a)` is called with a valid action, THE Ghost_Hand_World SHALL return an empty array, because no action reaches outside the copied world; WHEN `a` is not a valid GhostHandAction, THE Ghost_Hand_World SHALL throw an error that names the invalid argument without any I/O.
13. THE Ghost_Hand_World SHALL register the metadata `deterministic: true`; THE registration SHALL be valid only while the tests of Requirement 17 pass in the Tested_Environments, and the README SHALL state that the flag is limited to those environments.
14. THE Ghost_Hand_World SHALL release every wrapped MuJoCo_Module object (model, data, and any other object that has a `delete` method) that it creates, SHALL NOT keep a typed-array view over the WebAssembly memory across a call that can grow that memory, and SHALL leave the WebAssembly heap at the same size after the 40th run of a plan as after the first run.
15. FOR ALL Plans of 1 to 50 actions, THE Ghost_Hand_World SHALL run on a freshly created world instance and on a long-lived world instance with equal results (no state carried between runs).

### Requirement 4: Physical Scene

**User Story:** As a developer, I want a small, fully declared scene, so that the demo is reproducible and every contact that a ward names exists in the model.

#### Acceptance Criteria

1. THE Ghost_Hand_World SHALL build the scene from an MJCF model written in code that uses only primitive geoms (capsules, boxes, and spheres or cylinders if needed) and loads no mesh, texture, or other asset file.
2. THE scene SHALL contain the Arm, the Cabinet, the Drawer with the Handle on one slide joint, and the Vase as a free body that stands on the top face of the Cabinet.
3. THE MJCF model SHALL declare an explicit memory size in a `size` element so that a data object does not allocate the engine default of about 16 MB.
4. THE World_Config SHALL declare the fixed time step, the target opening distance of the Drawer in meters, the time limit per action and per Plan in simulated seconds, the Action_Ranges, and the list of Contact_Names; every constant of the model that is not perturbed by a variant SHALL be declared there or in the MJCF text and SHALL NOT be read from the clock, a random source, or the environment.
5. THE Arm SHALL hold the joint limits as model constants, and the Run_Monitors SHALL record every step at which a joint exceeds its limit.
6. THE Run_Monitors SHALL record the maximum contact normal force over all contacts that involve at least one Arm geometry, the set of Contact_Names that an Arm geometry touched, whether two different Arm geometries collided with each other (self-collision, excluding the pairs of adjacent links that the model declares as excluded), and the Drawer displacement along its slide joint.
7. WHERE a `forbidden_contacts` entry of the active WardSet is not a declared Contact_Name, THE Ghost_Hand_App SHALL show the text `Ward entry "<name>" matches no body in this world.` in an element with the role `status`, passed through the Display_Escaper, so that a misspelled name cannot disable a ward without notice.
8. THE Ghost_Hand_World SHALL NOT use the Franka Panda model or any mesh-based robot model (Out of Scope).

### Requirement 5: Actions and Deterministic Controller

**User Story:** As an agent author, I want the agent to choose only fixed motions and their values, so that a plan is small, checkable, and replayable.

#### Acceptance Criteria

1. THE GhostHandAction type SHALL be exactly one of `reach(target, speed)`, `grasp(force)`, `pull(distance, speed)`, and `release()`, where `target` is a point in meters in the world frame, `speed` is in meters per second, `force` is in newtons, and `distance` is in meters.
2. THE World_Config SHALL declare a closed numeric range for `target` (per coordinate), `speed`, `force`, and `distance`, and WHEN an action carries a value outside its range or a value that is not a finite number, THE Ghost_Hand_World SHALL treat the action as invalid under Requirement 3, criterion 6 and SHALL NOT clamp the value.
3. THE `target` value SHALL be a point of the world frame and SHALL NOT be adjusted by the actual handle position of a variant, so that the handle-position perturbation of Requirement 6 can make a plan fail (the exact frame is a design decision, Open Item 3).
4. FOR ALL valid action sequences of 1 to 50 actions, including sequences that start with `pull` or `release` or repeat `grasp`, THE Ghost_Hand_World SHALL execute every action without throwing; an action whose precondition does not hold (for example `pull` without a grasp) SHALL leave the Drawer where it is and SHALL NOT be reported as a failed step.
5. THE controller of each action SHALL finish within the per-action time limit of the World_Config, and the sum of the simulated time of a Plan SHALL NOT exceed the per-plan time limit; WHEN the per-plan limit would be exceeded by the next action, THE step SHALL fail under Requirement 3, criterion 6.
6. THE controller, the Variant_Sampler, and the noise and delay models SHALL use only basic IEEE-754 arithmetic (addition, subtraction, multiplication, division, comparison) and `Math.sqrt`, SHALL NOT call `Math.sin`, `Math.cos`, `Math.tan`, `Math.acos`, `Math.asin`, `Math.atan`, `Math.atan2`, `Math.exp`, `Math.log`, `Math.pow`, or the `**` operator on non-integer exponents, and SHALL NOT read `Math.random` or the clock, because ECMAScript leaves the results of those functions implementation-defined.
7. THE inverse kinematics of `reach` and `pull` SHALL use only the operations of criterion 6 and the engine functions of the MuJoCo_Module, and SHALL run a fixed number of iterations that is declared in the World_Config.
8. THE Ghost_Hand_App SHALL describe each action as text in the form `reach(x=<x>, y=<y>, z=<z>, speed=<s>)`, `grasp(force=<f>)`, `pull(distance=<d>, speed=<s>)`, and `release()` with numbers in a monospace font, passed through the Display_Escaper.

### Requirement 6: Haunted Variants

**User Story:** As a user, I want the world shaken in declared ways with a seed, so that a plan that works in the calm world but breaks in a slightly different world is found before the arm moves.

#### Acceptance Criteria

1. THE Variant_Sampler SHALL map (Seed, variant index, Variant_Config) to Variant_Params with these fields: drawer friction, drawer mass, handle position (a three-component offset), sensor noise amplitude, and command delay (a whole number of time steps).
2. THE Variant_Config SHALL declare, for every Variant_Params field, a closed range `[min, max]` with finite bounds and `min <= max`, SHALL declare the default variant count (8) and the default Seed, and SHALL declare the largest allowed variant count.
3. THE Variant_Sampler SHALL draw every value from a deterministic integer pseudo-random generator that is seeded from the Seed and the variant index with integer operations only, and SHALL map the integer output to the declared range by a fixed formula that uses only the operations of Requirement 5, criterion 6.
4. THE Variant_Sampler SHALL produce Variant_Params whose every field lies inside its declared closed range (Property: GH-P3).
5. FOR ALL Seeds and Plans, THE same Seed and the same Plan SHALL give equal Variant_Params for every variant index and equal Variant_Results in the Tested_Environments (Property: GH-P4).
6. THE state of the noise generator and the command-delay buffer SHALL be part of the GhostHandState, so that a reused Snapshot reproduces the same noise and delay (P3).
7. THE Ghost_Hand_App SHALL offer a numeric input for the Seed (an integer from 0 to 4,294,967,295) and SHALL reject any other input with a visible message and no run.
8. THE Ghost_Hand_App SHALL use the default variant count of 8 for every shipped scenario and test, and SHALL accept a larger count up to the declared maximum (at most 20) only WHERE the Variant_Config enables it.
9. THE Ghost_Hand_App SHALL show for every variant its `variantId` and its Variant_Params in a table (Requirement 13, criterion 7).
10. THE Base_World SHALL NOT count as a variant in the success rate; it SHALL be shown with the identifier `base` and SHALL serve as the starting point of the reference execution (Requirement 12).

### Requirement 7: Variant Config and Plan File Parsing, Printing, and Round Trip

**User Story:** As a developer and as the author of the recording, I want fixed, validated file formats with a printer, so that a typo is found at once and a file survives a round trip.

#### Acceptance Criteria

1. THE Ghost_Hand_World package SHALL export `parseVariantConfig(text)` returning either `{ ok: true, config }` or `{ ok: false, errors }`, where each error has `code`, `message`, and `field`, and SHALL NOT throw for any string.
2. THE `parseVariantConfig` function SHALL report `invalid-json`, `wrong-type`, `missing-field`, `unknown-field`, `out-of-range` (a count outside 1 to 20, a range with `min` greater than `max`, a non-finite bound, a Seed outside the 32-bit unsigned range, or the delay range contains no integer), and `input-too-large` for a text above 64 KiB.
3. THE Ghost_Hand_World package SHALL export `printVariantConfig(config)` that returns canonical JSON with two-space indentation, a fixed key order, and a trailing newline.
4. FOR ALL valid Variant_Configs, THE `parseVariantConfig` of the printed text SHALL return `ok: true` with a config deep-equal to the original, and printing the parsed printed text SHALL produce an identical string (Property: GH-P2).
5. THE Ghost_Hand_App SHALL export `parsePlanFile(text)` returning either `{ ok: true, plan }` or `{ ok: false, errors }`, where each error has `code`, `message`, and `field`, and SHALL NOT throw for any string.
6. THE `parsePlanFile` function SHALL report `input-too-large` for a text above 1 MiB, `invalid-json`, `wrong-type`, `missing-field`, `unknown-field`, `unsupported-version`, `out-of-range` (an `actions` array outside 1 to 50, a value outside its Action_Range, or a `name` or `note` outside its limit), `unknown-action`, and `invalid-character`.
7. THE `parsePlanFile` function SHALL report `invalid-character` for a `name`, `note`, `taskText` (Requirement 16), or `recordedWith` that contains a control code point (U+0000 to U+001F, U+007F to U+009F) or a Hidden_Display_Code_Point, except in the field `taskText`, which is parsed as data and carried to the scanner of `possession` unchanged (the escape rules of criterion 9 apply to the file text).
8. THE Ghost_Hand_App SHALL export `printPlanFile(plan)` that returns canonical JSON with two-space indentation, the key order of Requirement 11 criterion 1, a trailing newline, and every code point above U+007E and every Hidden_Display_Code_Point written as a `\u` escape (a surrogate pair for a code point above U+FFFF), so that a printed Plan_File contains no literal hidden character.
9. THE `parsePlanFile` function SHALL accept a Plan_File whose `taskText` holds hidden code points written as `\u` escapes in the JSON text, because the file itself contains only ASCII escape text.
10. FOR ALL valid Plan_Files, THE `parsePlanFile` of the printed text SHALL return `ok: true` with a plan deep-equal to the original (round trip), and printing the parsed printed text SHALL produce an identical string (idempotence) (Property: GH-P1).
11. FOR ALL arbitrary strings and JSON values given to `parsePlanFile` or `parseVariantConfig`, THE function SHALL return a result object without throwing (Property: GH-P5).

### Requirement 8: Ghost Run Pipeline and Variant Execution

**User Story:** As a visitor, I want one pipeline from plan to verdict that uses the real engine, so that what I see is what the product judges.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL implement the pipeline as a function `runGhostHand(input)` that takes the Plan, the WardSet, the Variant_Config, the Seed, and an executor for variant runs, and returns the Ghost_Run; the React components SHALL only call it and display its result.
2. WHEN the user runs a Plan, THE Ghost_Hand_Run_Function SHALL compute the fingerprint of the live Reference_State, take one `snapshot()`, call `ghostRun(ghostHandWorld, snapshot, plan)` on the Base_World, run every Variant from the same initial Snapshot with its Variant_Params, and compute the fingerprint of the live Reference_State again after the last run.
3. THE Ghost_Hand_Run_Function SHALL fill `variantResults` of the `GhostReport` with one Variant_Result per Variant in ascending variant index order, because `ghostRun` leaves `variantResults` empty.
4. THE Variant_Result of one Variant SHALL be derived only from the Run_Monitors and the final state of that Variant: `success` is true when the Drawer displacement at the end of the Plan is at least the target opening distance of the World_Config; `contactForceN` is the maximum contact normal force of the run in newtons; `forbiddenContactOccurred` is true when an Arm geometry touched a body whose Contact_Name is in the union of the `forbidden_contacts` lists of the `physics` Wards of the active WardSet.
5. IF a Variant run ends with a failed step (invalid value, unstable simulation, time limit, or an engine error), THEN THE Ghost_Hand_Run_Function SHALL report that Variant as `success: false` and SHALL still report its `contactForceN`, `forbiddenContactOccurred`, and (WHILE Joint_Self_Ward_Active) `jointLimitExceeded` and `selfCollisionOccurred` from the Run_Monitors up to the failure, so that an incomplete variant can only make the verdict stricter.
6. WHILE Joint_Self_Ward_Active, THE Ghost_Hand_Run_Function SHALL set `jointLimitExceeded` to true in the Variant_Result of every Variant in which a joint exceeded its limit, and `selfCollisionOccurred` to true in the Variant_Result of every Variant in which two Arm geometries collided, and the Run_Verdict SHALL be `block` when any Variant_Result has either field true, regardless of the success rate; this verdict comes from `WardEngine.evaluate` under PR-1, and Ghost_Hand_App SHALL add no rule of its own.
7. WHILE Joint_Self_Ward_Active is not satisfied, THE Ghost_Hand_App SHALL still record both facts in the Run_Monitors and show them in the variant table, SHALL NOT claim in any text or in the README that a ward blocks joint-limit or self-collision violations, SHALL NOT encode them in `success` or in `forbidden_contacts`, and SHALL show the text `Joint-limit and self-collision wards are not active in this build.` in an element with the role `status`.
7. THE Ghost_Hand_Run_Function SHALL give an identical Ghost_Run for the same inputs regardless of how the Variants are distributed over the Sim_Workers (one worker, several workers, or the main thread) and regardless of the order in which workers finish (Property: GH-P4).
8. WHEN the Ghost_Run starts on the Reference_Machine in Chrome with a plan of five simulated seconds and 8 Variants, THE Ghost_Hand_App SHALL finish the Ghost_Run within 2.0 s, and WITH 20 Variants (WHERE enabled) within 5.0 s.
9. THE Ghost_Hand_Run_Function SHALL be a pure function of its inputs apart from the executor and the fingerprint calls: it SHALL read no clock, random source, or environment variable.
10. THE Ghost_Hand_App SHALL run Variants only on copies of the world (separate MuJoCo_Module model and data objects, or separate workers), and SHALL NOT let a Variant run write to the Reference_State.
11. THE Ghost_Hand_Run_Function SHALL return, besides the report, the data for the Ghost_Overlay: for every Variant and the Base_World a decimated trajectory of the generalized positions (at most 60 frames per simulated second), as numbers that are used for drawing only and never for the Trajectory_Hash.

### Requirement 9: Wards and Judging

**User Story:** As a user, I want the variants judged by declared wards in a file, so that the rules can be read, reviewed, and changed in one place.

#### Acceptance Criteria

1. THE repository SHALL contain exactly one canonical Wards_File for Ghost Hand, whose location is a design decision (Open Item 1; the candidates are `apps/ghost-hand/wards.yaml` and `worlds/<name>/wards.yaml`), and a test SHALL load it with `parseWards` and require `ok: true`.
2. THE Wards_File SHALL contain a `physics` Ward with the id `gentle-hands`, `min_success_rate: 0.95`, `max_contact_force_n: 30`, and a `forbidden_contacts` list that includes `vase`, and SHALL contain no `path`, `sql`, or `egress` Ward; the joint-limit and self-collision rule needs no entry in the Wards_File, because PR-1 makes the `physics` Ward block on the two optional `VariantResult` fields.
3. THE Ghost_Hand_App SHALL judge every Ghost_Run with `WardEngine.evaluate(report, wardSet)` and the Message_Builder `renderMessage` of `wards`, and SHALL implement no ward rule, threshold, or message text of its own.
4. THE Ghost_Hand_App SHALL parse the WardSet with `parseWards` of `@ghost-run/wards-config` and SHALL load the initial text of the Wards_File at build time as raw text, and a test SHALL require that the bundled text equals the bytes of the Wards_File.
5. WHEN the rate of successful variants is less than `min_success_rate`, THE Run_Verdict SHALL be `block` by the Ward whose threshold was missed; with 8 variants and `min_success_rate` 0.95, the arithmetic of `core` allows no failed variant, because 7 of 8 is 0.875.
6. THE Ghost_Hand_App SHALL compute the Run_Verdict as the maximum, in `pass < warn < block` order, of the verdict of `WardEngine.evaluate` and the verdict floor `block` for a failed P1 check (Requirement 10, criterion 3); the joint-limit and self-collision block comes from `WardEngine.evaluate` itself WHILE Joint_Self_Ward_Active (Requirement 8, criterion 6).
7. WHEN the WardSet has no `physics` Ward, THE Ghost_Hand_App SHALL still run the Plan and show the text `No physics ward is active: variant results are not judged.` in an element with the role `status`, because `core` returns no violation for variant results without a `physics` Ward.
8. THE Ghost_Hand_App SHALL show the message of `renderMessage` in a monospace panel labelled `Message the agent receives`, passed through the Display_Escaper, and SHALL pass no Seance link base.
9. WHILE PR-2 has landed, THE Ghost_Hand_App SHALL call `renderMessage` without the `claims` input, so that the message of a rehearsed run carries no line about a missing ghost rehearsal and no false claim; WHILE PR-2 has not landed, THE Ghost_Hand_App SHALL show the message of `renderMessage` as is and SHALL show beside it the text `Message wording of the wards module is provisional: its last line does not apply to this physics world.`, and no requirement of this spec SHALL be reported as met by omitting a line of the message.
10. THE Ghost_Hand_App SHALL NOT offer a wards editor; editing is done in the Wards_File (Out of Scope).
11. THE tests SHALL include example tests for the P4 direction on the demo: FOR the revised plan that passes, a copy of the WardSet whose `max_contact_force_n` is set below the maximum `contactForceN` of the variants SHALL give a verdict that is not lower than the original verdict, and the test SHALL derive that threshold from the measured values and SHALL NOT hard-code it.

### Requirement 10: Isolation, Determinism Claims, and Disclosures

**User Story:** As a judge, I want the page to state exactly which properties it claims for a run, so that no claim exceeds what was checked.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL build the Isolation_Claims of every Ghost_Run as `{ mode: 'playground', p1Claimed, p5Claimed: false, p6Claimed: false }` without a `reason`, and SHALL pass them to the Claim_Banner of the Candle; WHILE PR-3 has landed, THE Ghost_Hand_App SHALL mark P5 and P6 as "not applicable" in the form that PR-3 defines, and WHILE PR-3 has not landed, THE banner shows them as not claimed.
2. THE Ghost_Hand_App SHALL set `p1Claimed` to `true` only WHEN the fingerprint hashes taken before and after the Ghost_Run are equal.
3. IF the two fingerprint hashes differ, THEN THE Ghost_Hand_App SHALL set `p1Claimed` to `false`, SHALL set the Run_Verdict to `block`, and SHALL show the text `Ghost run changed reality: this is a bug in the playground.` in an element with the role `alert`.
4. THE Ghost_Hand_App SHALL show the text `P5 and P6 concern files and secrets and are not claimed for this physics world.` next to the Claim_Banner.
5. THE Ghost_Hand_App SHALL show the text `Docker box (real mode) is not used by this page.` and SHALL NOT show or imply any claim for a Docker box or for a physical arm.
6. WHEN the reference execution has run (Requirement 12) AND the world-contract steering update that allows this narrow P2 scope has landed, THE Ghost_Hand_App SHALL compare the `Change[]` of the base ghost run with the `Change[]` of the reference execution by deep comparison and SHALL show `P2 check: the reference execution matched the base ghost diff.` or `P2 check: MISMATCH between the base ghost diff and the reference execution.` in an element with the role `status`; the text SHALL add that P2 is checked for this engine build in this browser and says nothing about a physical arm; the scope wording is "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware."; WHILE the steering update has not landed, THE Ghost_Hand_App and the README SHALL show no P2 text.
7. WHEN the page loads, THE Ghost_Hand_App SHALL run the Determinism_Self_Check and SHALL show one of two results: `Determinism check: this browser reproduced the reference trajectory (hash <first 12 hex digits>).` when both runs equal each other and the Golden_Hash, or `Determinism check: this browser did NOT reproduce the reference trajectory; the same-seed guarantee (P8) is not claimed here.` otherwise.
8. THE Ghost_Hand_App SHALL show the text `Same-seed determinism (P8) was verified only in Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac.` in an element that is visible on the page, and the README SHALL state the same scope.
9. THE Ghost_Hand_App SHALL NOT claim P2 or P8 for a run whose Determinism_Self_Check failed.
10. THE Ghost_Hand_App SHALL show the text `The "real" arm here is a reference simulation, not hardware.` wherever the Reference_Arm is named or executed.
11. THE Ghost_Hand_App SHALL use the words `sealed` or `isolated` in no fixed text of its own, as in `ui-kit` Requirement 7, criterion 8.

### Requirement 11: Plan File Format, Replay, and Node Entry Point

**User Story:** As the author of the recording and as a Kiro agent, I want a fixed plan format and a way to rehearse a plan outside the browser, so that a real agent session can be recorded and replayed in the page.

#### Acceptance Criteria

1. THE Plan_File SHALL be a UTF-8 JSON document whose root is an object with exactly these fields in this order: `format` (the string `ghost-hand-plan`), `version` (the integer `1`), `name` (1 to 80 code points), `origin` (`recorded` or `scripted`), `actions` (an array of 1 to 50 action objects), and optionally `note` (at most 500 code points), `recordedWith` (at most 120 code points, for example the Kiro version of the session), `revisionOf` (the `name` of the plan that this plan revises), and `taskText` (at most 4,096 code points).
2. THE action object SHALL be `{ "type": "reach", "target": [x, y, z], "speed": s }`, `{ "type": "grasp", "force": f }`, `{ "type": "pull", "distance": d, "speed": s }`, or `{ "type": "release" }`, and no other field.
3. THE Plan_File SHALL contain no field for a clock value, a session identifier, a verdict, or a trajectory: the verdict is always computed by the Ghost_Hand_Run_Function.
4. THE repository SHALL contain the Plan_Files of the demo (the first plan and the revised plan), each valid by `parsePlanFile`, and a test SHALL require that the Plan of each demo scenario equals the actions of its Plan_File.
5. THE Ghost_Hand_App SHALL provide the controls `Load plan file`, `Download plan file`, `Run ghost`, and `Clear plan`, SHALL read a loaded file in the browser without uploading it, and SHALL show each error of `parsePlanFile` as `<field>: [<code>] <message>` in an element with the role `alert`, passed through the Display_Escaper, while keeping the previous Plan.
6. WHEN a Plan_File with `origin` `recorded` is loaded, THE Ghost_Hand_App SHALL show the text `Recorded plan: replayed here, not decided by an LLM in this page.`, and WHEN the origin is `scripted`, THE Ghost_Hand_App SHALL show the text `Scripted plan: not decided by an LLM in this page.`
7. THE Ghost_Hand_App SHALL show the `name`, `note`, and `recordedWith` of a loaded Plan_File through the Display_Escaper.
8. THE `apps/ghost-hand/` package SHALL provide a Node.js 20 entry point that takes the path of a Plan_File, the path of a Wards_File, and optionally a Seed, runs the same Ghost_Hand_Run_Function in a single thread, and prints the message of `renderMessage` to standard output, so that a Kiro agent can read the verdict message and revise a plan; the exit code SHALL differ between `pass` and every other verdict, and the exact codes and flags are a design decision.
9. THE Node entry point SHALL call no LLM API, SHALL perform file I/O only for the paths it is given, and SHALL print no Canary or file content other than the message.
10. THE Plan SHALL be editable in the page only by `Load plan file`; a free-form command input is not offered, because the actions are fixed motions (Out of Scope).

### Requirement 12: Demo Flow and Reference Execution

**User Story:** As a judge, I want to see a plan fail, read the ward, see the revised plan pass, and see the reference arm move, so that the whole story is on one screen.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL offer the scenario `fast pull` (the first plan) and the scenario `slow pull, gentle grip` (the revised plan, with `revisionOf` naming the first plan), each with `origin` set in its Plan_File.
2. WHEN the first plan runs with the default Seed, the default variant count of 8, and the Wards_File, THE Run_Verdict SHALL be `block`, at least one Variant_Result SHALL have `success: false`, and the message SHALL name the ward `gentle-hands`.
3. WHEN the revised plan runs with the same Seed, the same variant count, and the same Wards_File, THE Run_Verdict SHALL be `pass`, every Variant_Result SHALL have `success: true`, and the maximum `contactForceN` over all Variants SHALL be at most `max_contact_force_n` of the Wards_File.
4. THE Base_World run of both plans SHALL open the Drawer to at least the target opening distance (the unperturbed world passes both plans, so the failure of the first plan is shown only by the variants).
5. THE tests of criteria 2 to 4 SHALL run on the pure Ghost_Hand_Run_Function in Node without a browser, SHALL check the verdict and ward ids exactly, and SHALL derive the numbers of failed variants from the Variant_Results and SHALL NOT hard-code them; the provisional numbers of Experiment C (5 of 8 and 8 of 8) SHALL NOT appear in any test.
6. IF a scenario does not give the verdict of criterion 2 or 3 with the shipped Variant_Config and Seed, THEN THE design and the plan values SHALL be adjusted until it does, and the adjusted values SHALL be recorded in the Plan_Files and the README.
7. THE Ghost_Hand_App SHALL provide a control `Execute on reference arm` that is enabled only WHILE the Run_Verdict of the most recent Ghost_Run is `pass` and the plan has not changed since that run.
8. WHEN the user activates `Execute on reference arm`, THE Ghost_Hand_App SHALL apply the Plan to the live Reference_State by the reference execution (a path outside the World contract, as the test adapter of `core` is), SHALL animate the result in the Ghost_Overlay, and SHALL show the final Drawer displacement.
9. THE Ghost_Hand_App SHALL provide a control `Reset reference arm` that restores the Reference_State to its initial value and clears the P2 check text.
10. THE Ghost_Hand_App SHALL provide a control `Play demo` that runs the first plan, shows the block, loads the revised plan, runs it, shows the pass, and enables `Execute on reference arm`, with every step also available by its own control, so that the demo can be driven by keyboard step by step.
11. THE Ghost_Hand_App SHALL show the Plan_Origin text of Requirement 11, criterion 6 beside the revised plan, so that a viewer sees whether the revision came from a recorded Kiro session or was scripted.
12. THE README, the recording entry of `docs/measurements.md`, and the video captions (the video itself is Out of Scope) SHALL state whether the revision of the plan was a real Kiro agent session (`recorded`) or scripted, and that the "real" arm is a reference simulation.

### Requirement 13: Ghost Overlay (Three.js)

**User Story:** As a viewer, I want the ghost arms drawn over each other, with failed ones fading out in red, so that I see at a glance which haunted worlds broke the plan.

#### Acceptance Criteria

1. THE Ghost_Overlay SHALL draw the Cabinet, the Drawer, the Vase, the Base_World arm, and one Ghost_Arm per Variant, using Three.js, from primitive geometries only, with no external model, texture, or font file.
2. THE Ghost_Overlay SHALL draw each Ghost_Arm translucent and desaturated, and SHALL draw a Ghost_Arm of a Variant whose `success` is false (or whose `forbiddenContactOccurred`, `jointLimitExceeded`, or `selfCollisionOccurred` is true) in red and fade it out; the fade SHALL finish within 1 second per Ghost_Arm and SHALL run at most once per Ghost_Run.
3. THE Overlay_View_Model SHALL be computed by a pure function of the Ghost_Run data: FOR ALL Ghost_Runs, it SHALL hold exactly one Ghost_Arm entry per Variant, SHALL mark an entry as failed if and only if the Variant_Result of that Variant has `success: false`, `forbiddenContactOccurred: true`, `jointLimitExceeded: true`, or `selfCollisionOccurred: true`, and SHALL hold the identifier of the variant in each entry (Property: GH-P7).
4. THE renderer SHALL only draw the Overlay_View_Model and SHALL compute no verdict, no Variant_Result, and no failure state.
5. WHILE the operating system setting `prefers-reduced-motion: reduce` is set, THE Ghost_Overlay SHALL NOT autoplay the trajectory and SHALL NOT run the fade; it SHALL show the final frame statically, SHALL draw failed Ghost_Arms in red at a fixed reduced opacity with a text label, and SHALL offer a keyboard-operable control (role `slider`) that steps through the frames.
6. THE Ghost_Overlay SHALL cause no element to flash more than 3 times in any one-second period and SHALL show no full-screen flash.
7. THE Ghost_Hand_App SHALL show beside the Ghost_Overlay a table (a text alternative of the 3D view) with one row per Variant (and one for `base`): `variantId`, the Variant_Params, the Drawer displacement at the end, the maximum contact force in newtons, whether the Vase was touched, and a status text `passed` or `failed` with an icon, all in a monospace font and passed through the Display_Escaper.
8. THE Ghost_Hand_App SHALL NOT rely on color alone: every failed state SHALL carry an icon and a text label, in both Themes.
9. THE Ghost_Overlay SHALL take every color from a token module that declares Contrast_Pairs for both Themes, and a test SHALL require at least 3:1 contrast for the role `graphic` and at least 4.5:1 for the role `text` by the WCAG relative-luminance formula; whether that module is the Theme_Tokens of `ui-kit` or a token module inside `apps/ghost-hand/` with the same contrast tests is a design decision.
10. WHEN the median frame time of the Ghost_Overlay with 8 Ghost_Arms is measured on the Reference_Machine in Chrome, THE Ghost_Overlay SHALL have a median frame time of at most 33 ms; the cost of drawing ghost arms was not measured before this spec, and THE implementation SHALL record the measured median for 8 and for 20 Ghost_Arms in `docs/measurements.md`.
11. IF WebGL is not available, THEN THE Ghost_Hand_App SHALL show the text `3D view unavailable: WebGL is not available in this browser. Results are shown as text.` in an element with the role `status`, SHALL still run the Ghost_Run, and SHALL show the table of criterion 7, the Candle, and the message.
12. THE Ghost_Overlay SHALL dispose every Three.js geometry, material, and renderer that it creates when it is removed, so that repeated Ghost_Runs do not grow the memory of the page.
13. THE Ghost_Overlay SHALL support keyboard control of the camera through at least two preset views reachable by buttons, and SHALL NOT make any information available only by pointer.

### Requirement 14: Screen Composition, Candle, and Graveyard

**User Story:** As a visitor, I want the same candle, messages, and graveyard that the other app has, so that the product feels like one tool.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL compose its screen from the `ui-kit` components (Candle with Claim_Banner, Graveyard, Seance_View, Lights_Toggle, and, in the optional scenario, Red_Thread_View and Blacklight_View) and the Ghost_Overlay, and SHALL compute no verdict, finding, or thread link itself.
2. THE Ghost_Hand_App SHALL NOT render the Changes of the world through the Mirror_World of `ui-kit`; the Ghost_Overlay and the table of Requirement 13, criterion 7 show the per-variant results directly, and the Seance_View keeps its text `changes not recorded` for a Ghost Hand entry unchanged.
3. THE Ghost_Hand_App SHALL place the Candle with the Claim_Banner above the Ghost_Overlay and the Graveyard below it.
4. WHEN a Ghost_Run with the Run_Verdict `block` finishes after an explicit user action (`Run ghost` or a scenario control), THE Ghost_Hand_App SHALL add one Grave_Entry for that run and SHALL add none for a `pass` or `warn` run.
5. THE Grave_Entry SHALL carry `id` (`g-<n>` with a counter `n` that starts at 1), `command` (the actions of the Plan as text, joined by `; `), `recordedAt` (an ISO 8601 UTC string `YYYY-MM-DDTHH:MM:SSZ`), `wardIds` (the distinct ward ids of the violations in order of first appearance), and `detail` with `wardVerdict`, `claims`, and `actionLabels`.
6. THE time of `recordedAt` SHALL come from a clock function injected into the app shell, and the Ghost_Hand_World, the Ghost_Hand_Run_Function, and the overlay model SHALL NOT read the clock.
7. THE Grave_Entry and every serialized value SHALL contain no trajectory data and no content of the `taskText` field other than what the optional scenario passes to the possession components.
8. WHEN the user activates a Tombstone, THE Ghost_Hand_App SHALL show the Seance_View inside the page (no URL change, no fetch), and `Back to graveyard` SHALL return the view and keyboard focus to the Tombstone.
9. THE Graveyard SHALL show at most 200 Grave_Entries; WHEN a 201st entry is added, THE Ghost_Hand_App SHALL drop the oldest entry and show the text `Oldest blocked command dropped (limit 200).`
10. THE Ghost_Hand_App SHALL show the Lights_Toggle and SHALL start in the Theme `dark`.
11. THE Ghost_Hand_App SHALL pass every string that comes from a Plan_File, a Wards_File error, or a Variant table through the Display_Escaper before it enters any rendered output.

### Requirement 15: Accessibility and Motion

**User Story:** As a developer who uses a keyboard or a screen reader, I want the app to be operable and readable, so that the tool is usable in a professional setting.

#### Acceptance Criteria

1. THE Ghost_Hand_App SHALL make every interactive element (the controls of Requirements 11 and 12, the variant selection, the frame slider, the camera presets, the Lights_Toggle, each Tombstone) reachable with the Tab key in DOM order, operable with Enter or Space, and free of keyboard traps.
2. THE Ghost_Hand_App SHALL show a focus indicator with a contrast ratio of at least 3:1 and a thickness of at least 2 CSS pixels on every interactive element.
3. THE Ghost_Hand_App SHALL give every status indicator and every interactive element a non-empty accessible name, SHALL hide purely decorative icons from assistive technology, and SHALL give the 3D canvas an accessible name that points to the table of Requirement 13, criterion 7.
4. THE Ghost_Hand_App SHALL pair every color signal with an icon and a text label.
5. WHILE the operating system setting `prefers-reduced-motion: reduce` is set, THE Ghost_Hand_App SHALL run no CSS animation and no CSS transition with a duration above 0 and SHALL apply Requirement 13, criterion 5 to the 3D view.
6. THE Ghost_Hand_App SHALL give each CSS animation a finite iteration count and a duration of at most 1 second per iteration, and SHALL contain no `infinite` iteration count.
7. THE Ghost_Hand_App SHALL announce the result of a Ghost_Run (the Candle state and the number of failed variants) in a polite live region.
8. THE Ghost_Hand_App SHALL render no sound and SHALL ship no audio file.
9. THE Ghost_Hand_App SHALL use a calm ghost tone, no blood imagery, no jump-scare effect, no religious symbol, and no logo or character of another company, and SHALL use only original or CC0 assets, each listed with its source in the README.
10. THE Ghost_Hand_App SHALL render no effect that hides a number, an identifier, or a status label; fog and fade layers SHALL lie behind the text.

### Requirement 16: Optional Possession Scenario

**User Story:** As a judge, I want to see a hidden instruction in the task text send the arm toward the vase and be blocked, with the red thread pointing at the hidden line, so that the possession story also appears in the physical world.

#### Acceptance Criteria

1. WHERE the possession scenario is implemented, THE Ghost_Hand_App SHALL offer a scenario whose Plan_File has a `taskText` that holds a visible task line and one hidden instruction made of Tag_Characters (each printable ASCII code point plus 0xE0000) that decodes to a sentence that tells the arm to reach toward the vase; the code points SHALL be produced by `String.fromCodePoint` in a builder or written as `\u` escapes in the file.
2. WHERE the possession scenario is implemented, WHEN its Plan runs with the Wards_File, THE Run_Verdict SHALL be `block` by the `gentle-hands` ward because of the forbidden contact with `vase`.
3. WHERE the possession scenario is implemented, THE Ghost_Hand_App SHALL build a Provenance_Log with one Provenance_Record for the task text and SHALL pass `scanText` of the task text to the Blacklight_View, and SHALL NOT use the scan result to decide the verdict.
4. WHERE the possession scenario is implemented, THE Ghost_Hand_App SHALL pass a Needle for the Contact_Name `vase` and the `ThreadLink` that `traceRedThread` returns unchanged to the Red_Thread_View, so that the red thread points at the line and column of the hidden instruction; because no existing `NeedleOrigin` value of `possession` fits a contact, the design SHALL only propose the minimal additive change (for example one new `NeedleOrigin` value) as a hand-off, and the implementation of that change and of this criterion SHALL be the last, optional task of tasks.md.
5. THE red thread SHALL NOT influence the Run_Verdict: WHEN a ThreadLink is `not-found`, THE Run_Verdict SHALL stay the verdict of Requirement 9.
6. WHERE the possession scenario is implemented, THE Ghost_Hand_App SHALL show the text `Text analysis does not catch every injection.` and the text `A forbidden contact with the vase is blocked by what the ghost does, with or without hidden text.`
7. THE possession scenario SHALL contain no real instruction to a real system: the instruction text names only the simulated vase, the host names in any fixture SHALL use reserved suffixes (`.example`, `.test`, `.localhost`, `.invalid`), and secrets SHALL be canary values only.
8. THE possession scenario is optional: IF it is not implemented, THEN THE README SHALL NOT claim it, and no other requirement of this spec depends on it.

### Requirement 17: Contract, Determinism, and Isolation Tests

**User Story:** As a maintainer, I want the registration gate and the determinism claims checked on random input and across environments, so that P1, P2, P3, and P8 are backed by evidence within their scope.

#### Acceptance Criteria

1. THE test suite SHALL call `verifyWorld(ghostHandWorld, options)` with `deterministic: true`, the Wards_File as `wardSet`, a `testAdapter`, an `actionArb` that generates only valid GhostHandActions, and `numRuns` of at least 100 in a Short_Run (unless criterion 11 records a lower count) and at least 10,000 in a Nightly_Run, and the registration SHALL require that the call resolves without a `VerificationError`.
2. THE test suite SHALL run the call of criterion 1 on the Base_World and on at least one world whose Variant_Params were produced by the Variant_Sampler for a fixed Seed, so that the contract holds under perturbation.
3. THE `testAdapter` SHALL execute the actions on a structural clone of the state with an executor that creates its own MuJoCo_Module model and data objects from the MJCF text and applies the controller directly, without the snapshot and restore code of the world, so that P2 compares the ghost diff with an independent re-execution by the same engine build; THE README SHALL state that this is a comparison inside one engine and not a test of fidelity to hardware.
4. THE test suite SHALL check P1: FOR ALL Plans of 1 to 50 actions, the fingerprint hash of the live Reference_State after `ghostRun` SHALL equal the hash before it.
5. THE test suite SHALL check P3: FOR ALL Plans of 1 to 50 actions, a Snapshot SHALL stay structurally unchanged by `step`, and two `ghostRun` calls from the same Snapshot with the same Plan SHALL end in recursively equal states (equal bit for bit, including the integrator state).
6. THE test suite SHALL check P8 (Properties GH-P3 and GH-P4): FOR ALL Seeds, variant counts, and Plans, the Variant_Params SHALL lie inside the declared ranges and the Variant_Results and Trajectory_Hashes of two runs with the same Seed and Plan SHALL be equal.
7. THE test suite SHALL compare the Trajectory_Hash of the fixed reference plan across the Tested_Environments: Node.js 20.20.2, Chrome 157 on the main thread, and Chrome 157 in a Web Worker, and the three hashes SHALL be equal to the stored Golden_Hash; a hash that differs SHALL fail the suite.
8. THE test suite SHALL check that no state, Change, Scene, or Variant_Result depends on the clock or on a random source, by running the same Plan twice with `Date.now` and `Math.random` replaced by functions that throw and requiring equal results.
9. THE test suite SHALL check that 40 consecutive runs of a Plan leave the WebAssembly heap at the size of the first run (Requirement 3, criterion 14).
10. WHEN the test suite runs in an environment that is not one of the Tested_Environments, THE result SHALL be recorded as additional evidence only, and the claim lists of Requirement 10 and the README SHALL be extended only by a recorded passing result of the same checks.
11. THE design SHALL fix the simulation time step, the per-action step cap, and the number of examples of the short run so that the short run of `verifyWorld` for the Ghost_Hand_World (P1 to P3 and the ward properties) finishes within 60 s on the Reference_Machine, as `core-contract` Requirement 8 criterion 3 requires; an early task of tasks.md SHALL measure that run, and WHERE fewer than 100 examples are needed to meet the budget, THE design and the README SHALL record the rationale and the chosen count.
12. THE property tests SHALL use `vitest` and `fast-check`, SHALL print the seed of a failing run, and SHALL keep each shrunk counterexample as a fixed example test.
13. THE tests that need the MuJoCo_Module SHALL run the real module and SHALL NOT mock it.

### Requirement 18: Property Table

**User Story:** As a maintainer, I want the rules of this spec checked on random input, so that a wrong range, a lost variant, or a broken file format is found by the machine.

#### Acceptance Criteria

1. THE test suite SHALL run every property below with at least 100 generated examples in a Short_Run and at least 10,000 in a Nightly_Run (for the properties that need the MuJoCo_Module, the Nightly_Run count SHALL be the largest count that finishes in 8 hours on the Reference_Machine and SHALL be recorded in `docs/measurements.md`), and SHALL print the seed of a failing run.
2. THE property table SHALL be the following:

| Property | Statement | Generators | Criterion |
|---|---|---|---|
| GH-P1 Plan file round trip | `parsePlanFile(printPlanFile(plan))` equals `plan`, printing is idempotent, and the printed text has no literal hidden character | Plans of 1 to 50 actions with values inside the Action_Ranges, optional `note`, `recordedWith`, `revisionOf`, and `taskText` with hidden code points built from escapes | Requirement 7, criterion 10 |
| GH-P2 Variant config round trip | `parseVariantConfig(printVariantConfig(config))` equals `config`, and printing is idempotent | Valid configs with generated ranges, counts, and Seeds | Requirement 7, criterion 4 |
| GH-P3 Variant ranges | Every Variant_Params field lies inside its declared closed range | Seeds, variant indices, valid configs | Requirement 6, criterion 4 |
| GH-P4 Variant determinism and partition independence | The same Seed and Plan give equal Variant_Params, Variant_Results, and Trajectory_Hashes; the Ghost_Run is equal for any distribution of Variants over workers and any finishing order | Seeds, variant counts, Plans, worker counts, permutations of completion order | Requirement 6, criterion 5; Requirement 8, criterion 7 |
| GH-P5 Parser totality | The two parsers return a result object and never throw | Arbitrary strings and JSON values | Requirement 7, criterion 11 |
| GH-P6 Claim honesty | `p1Claimed` is true if and only if the two fingerprint hashes are equal; `p5Claimed` and `p6Claimed` are always false (shown as "not applicable" once PR-3 has landed); a failed P1 check gives the verdict `block` | Ghost_Runs with a forced fingerprint difference and without | Requirement 10, criteria 1 to 3 |
| GH-P7 Overlay coverage | One Ghost_Arm entry per Variant; an entry is failed if and only if its Variant_Result has `success: false`, `forbiddenContactOccurred: true`, `jointLimitExceeded: true`, or `selfCollisionOccurred: true` | Generated Variant_Result lists and trajectories | Requirement 13, criterion 3 |
| GH-P8 Incomplete variants only tighten | Replacing any Variant_Result by a failed one never lowers the Run_Verdict | Generated Variant_Result lists, WardSets, and replacement positions | Requirement 8, criterion 5 |

3. THE test suite SHALL include a monotone-derivation property: FOR ALL Plans and all pairs of `forbidden_contacts` lists where the second list is a superset of the first, the `forbiddenContactOccurred` value of every Variant under the second list SHALL be greater than or equal to its value under the first list (Requirement 8, criterion 4).
4. THE test suite SHALL include example tests for: the demo scenarios of Requirement 12 with exact verdicts and ward ids; the P1 failure alert; the Determinism_Self_Check in both outcomes (with a stubbed Golden_Hash); the WebGL fallback; a Plan_File with an unknown field rejected with its field path; a `forbidden_contacts` entry that matches no body; the Graveyard entry of a blocked run opened by keyboard; and the reduced-motion rendering of the Ghost_Overlay.

### Requirement 19: Claim Boundaries and Documentation

**User Story:** As a judge or a reader of the README, I want the claims of Ghost Hand to match what it does, so that I can trust the claims that remain.

#### Acceptance Criteria

1. THE README section of Ghost Hand SHALL state the claim table of the Introduction: P1 per run for the in-memory world of the page, P2 for the base ghost against the reference execution within the Tested_Environments, P3 for all worlds, P4 as evidence from `core`, P8 within the Tested_Environments only, and P5 and P6 as not claimed.
2. THE README SHALL state that the "real" arm is a reference simulation executed by the same engine, that no physical robot is involved, and that a physical arm would need a further implementation of the World contract.
3. THE README SHALL state that plan revision in the page is a replay of a recorded plan or a scripted plan, not an LLM decision in the page, and which of the two the shipped revised plan is.
4. THE README SHALL state the Tested_Environments, that Firefox, Safari, Linux, and x86 machines were not tested, and that the Determinism_Self_Check is a measurement in one browser and not a proof.
5. THE README SHALL state the pitfalls of the MuJoCo_Module that the implementation handles: the explicit model memory size, views that become empty when the WebAssembly memory grows, the deviation of the package README from the actual API, and the need to delete every wrapped object.
6. THE README SHALL list the license of every dependency (Requirement 1), the third-party notices file, and the sources of every asset.
7. THE README SHALL state that the single-thread build and Web Workers are used so that no special response headers are needed, and that the multi-thread build is not used.
8. THE README SHALL state which variants the shipped Seed produces and the measured numbers of the demo runs, labelled with the date and the environment of the measurement.

### Requirement 20: Repository Hygiene and Security Rules

**User Story:** As a maintainer, I want the sources, fixtures, and tests to pass the repository's own rules, so that the repository stays clean under the blacklight.

#### Acceptance Criteria

1. THE source files, tests, fixtures, plan files, wards files, and documents of `apps/ghost-hand/`, the Ghost_Hand_World folder, and `.kiro/specs/ghost-hand/` SHALL contain no literal Hidden_Display_Code_Point and no literal HTML comment opener; tests and fixture builders SHALL create such strings with `\u` escapes or `String.fromCodePoint`.
2. THE repository SHALL contain a test that runs the Scan_Entry_Point of `possession` over those folders (excluding `node_modules` and `dist`) and expects the outcome `clean`.
3. THE fixtures, plan files, and tests SHALL use only canary values as secrets (for example `sk-CANARY-abc123`) and only reserved domains (`.example`, `.test`, `.localhost`, `.invalid`) or the documentation range `192.0.2.0/24` as hosts.
4. THE Ghost_Hand_App and the Ghost_Hand_World SHALL contain no `eval`, no `new Function`, no `dangerouslySetInnerHTML`, no `innerHTML`, and no dynamic code execution, and a source-scan test SHALL fail when one appears.
5. THE Ghost_Hand_App SHALL write no Plan content, file content, or trajectory to the console, to the storage APIs, or to any serialized output other than the Plan_File that the user downloads.
6. THE hook scripts and tools of this feature SHALL contain no call to any LLM API.
7. THE `.gitignore` SHALL list `apps/ghost-hand/dist` and the build output of the Ghost_Hand_World.

### Requirement 21: Prerequisites from Other Specs

**User Story:** As a maintainer, I want the changes that Ghost Hand needs from other specs listed as explicit prerequisites, so that no claim is made before the supporting change has landed.

#### Acceptance Criteria

1. THE prerequisite PR-1 SHALL be: `VariantResult` of `core` gets the optional fields `jointLimitExceeded?: boolean` and `selfCollisionOccurred?: boolean` with the same shape as `forbiddenContactOccurred`, and the `physics` Ward blocks WHEN any Variant_Result has either field true, regardless of the success rate; it is implemented in the next wards implementation round, outside this spec.
2. THE prerequisite PR-2 SHALL be: the wards message generator takes a reason in `claims` and splits its wording, so that `static-analysis` keeps the current wording, the playground's unsupported step uses the wording "some steps could not be rehearsed", and a world for which P5 and P6 do not apply (Ghost Hand) passes no `claims` and gets no appended line; it is implemented in the next wards implementation round, outside this spec.
3. THE prerequisite PR-3 SHALL be: the Claim_Banner of `ui-kit` can show P5 and P6 as "not applicable"; it is implemented in the next ui-kit implementation round, outside this spec.
4. THE Ghost_Hand_App SHALL presuppose PR-1, PR-2, and PR-3, and tasks.md SHALL contain a task that checks the landed state of each before the criteria that depend on it are marked as met.
5. WHILE PR-1 has not landed, THE Ghost_Hand_App and the README SHALL NOT claim the joint-limit and self-collision ward (Requirement 8, criterion 7).
6. WHILE PR-2 or PR-3 has not landed, THE Ghost_Hand_App SHALL apply the fallback texts of Requirement 9, criterion 9 and Requirement 10, criterion 1, and SHALL NOT make a claim that depends on the missing change.
7. THIS spec SHALL NOT edit `core`, `wards`, `wards-config`, `possession`, or `ui-kit`; a change to them is made in the spec or round that owns them.

## Out of Scope

- Kiro Crew integration.
- The Franka Panda model and any mesh-based robot model.
- More than 20 haunted variants, and any default other than 8.
- A physical robot, any hardware adapter, and any claim of fidelity to hardware.
- A wards editor in the page (`ghost-shell` owns the wards editor); Ghost Hand edits wards in the Wards_File.
- A free-form command input or any LLM-driven plan generation in the page.
- Recording of plans from a real Kiro session by a hook (the `ghost-log` hook of `kiro-integration`) and the MCP tool that runs a Ghost Hand plan (`kiro-integration` owns MCP); this spec defines the Plan_File format and a Node entry point only.
- The video, its captions, and the Devpost texts (only the README statements of Requirement 19 are in scope).
- The ward engine, `wards.yaml` parsing, and the Message_Builder (`core`, `wards`, `wards-config`), the scanner and red-thread lookup (`possession`), and the screen components (`ui-kit`); this spec only calls them.
- Ghost Shell, Ghost Cloud, Ghost Sheet, and the Docker box.
- Multi-thread builds of the MuJoCo_Module and any use of `SharedArrayBuffer`.
- Windows support.

## Design Decisions and Open Items

The following points belong to the design phase or to a hand-off to another spec. This spec does not decide them, except where the user already decided.

1. **Folder and file locations.** The folder name of the Ghost_Hand_World under `worlds/`, and the locations and formats of the World_Config, the Variant_Config, and the Wards_File. The world-contract steering places `wards.yaml` under `worlds/<name>/`, while `ghost-shell` placed its file under `apps/ghost-shell/`; the design chooses one canonical location and keeps one copy.
2. **Worker partitioning.** How Variants are distributed over Sim_Workers (one worker per variant, a fixed pool, or the main thread for small counts), how results and decimated trajectories are transferred, and how the Node entry point runs Variants. The result must not depend on the choice (Requirement 8, criterion 7).
3. **Frame of `reach` targets.** The coordinates of `target` (world frame in meters, as written here) and whether the declared range is a box or a reachability test, and how the first and the revised plan obtain handle-relative positions without compensating the handle perturbation.
4. **Restore method.** Restoring state through the engine state functions with the integration state, or by copying a data object, is bit-exact in Experiment C, while the full-physics state without warm-start values is not bit-exact (the Task 1.1 probe measured a maximum absolute difference of 0.0113 in its probe scene; see `docs/measurements.md`). The design picks the method and the test of Requirement 17, criterion 5 verifies it.
5. **MuJoCo_Module handling.** How the design applies `<size memory="1M"/>` in the MJCF model (Requirement 4, criterion 3), how it guards against a WebAssembly typed-array view of length 0 after memory growth, and how it manages `.delete()` of every wrapped object (Requirement 3, criterion 14).
6. **Node entry point.** The flags and the exit codes (Requirement 11, criterion 8).
7. **Provisional numbers.** Experiment C measured, with throwaway code, that the fast pull passed 5 of 8 variants (9 of 20) and the slow strong grip passed 8 of 8 (20 of 20, finger contact force 25.7 N against a limit of 30 N) with Seed 42, and that both passed in the unperturbed world. The shipped scene, ranges, and plans are new code and must be measured again (Requirement 12, criteria 5 and 6).
8. **Untested wide claim.** Safari and Firefox were not tested. The page may run there, and then only the Determinism_Self_Check result is shown; no other claim is added for those browsers.

### Decisions already taken (not open)

The following were decided by the user and are not open for the design phase, except for the obligations named.

- **Joint limit and self-collision**: PR-1 of Requirement 21. The design presupposes it and the dependent criteria are conditional on Joint_Self_Ward_Active.
- **Lowered-claim wording and "not applicable" banner**: PR-2 and PR-3 of Requirement 21.
- **Red thread for a forbidden contact**: optional; the design only proposes the minimal `possession` change, and the implementation is the last optional task (Requirement 16, criterion 4).
- **Mirror_World**: not used; the Seance_View text `changes not recorded` stays as is (Requirement 14, criterion 2).
- **Ghost_Overlay location**: inside `apps/ghost-hand/`; the design lists the structure steering update (Requirement 1, criterion 8) so that tasks.md can include it.
- **Time budget of the short run**: the design fixes the simulation time step, the per-action step cap, and the number of short-run examples (Requirement 17, criterion 11); an early task measures it and writes `tests/pbt-budget.json`; a count below 100 needs a written rationale.
- **P2 scope (S5)**: the world-contract steering is updated by a task (together with S1 to S7) to allow the narrow Ghost Hand P2; until it lands, the page and the README show no P2 text (Requirement 10, criterion 6).
- **GH-P8 reading**: flipping only `success` to `false` and leaving the other fields is accepted (design D23).
- **Chrome harness**: first `node:http` plus the installed Chrome headless command line; if that fails, `playwright` (Apache-2.0) as a development dependency using the installed Chrome (no browser download), with version and license in the README table (Requirement 1, criterion 3).
- **MuJoCo API probe**: the `@mujoco/mujoco` 4.0.1 API probe is the first task of tasks.md; if its result differs from the design, `design.md` is fixed before any other task continues.
- **Measurement records**: measurements and probe results go to `docs/measurements.md` (English), not to `docs/devlog.md`.

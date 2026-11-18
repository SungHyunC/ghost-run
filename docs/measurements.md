# Measurements

Measured values recorded by the Kiro implementation runs. The development log (`docs/devlog.md`) summarizes them.

## ui-kit task 1.3: install facts

`corepack pnpm install` ran once for the workspace (pnpm 12.21.0, +123 packages). No peer-dependency warnings. One deprecation warning: sub-dependency `whatwg-encoding@3.1.1` (via jsdom). The first install bypassed the release-age check with 13 `minimumReleaseAgeExclude` entries for 5.30.4. That bypass was reverted: `@eslint-react/eslint-plugin` is pinned to exactly 5.30.3 and installs with no exclusions. The install changed nothing in `core/`, `ghost-runner/`, or `wards-config/`.
  - Resolved versions: vite 7.3.8, vitest 3.2.7, jsdom 26.1.0, react 19.3.1, react-dom 19.3.1, @eslint-react/eslint-plugin 5.30.3, axe-core 4.14.1.
  - Q1 confirmed: ESLint accepts `@eslint-react/dom-no-dangerously-set-innerhtml` and `@eslint-react/dom-no-dangerously-set-innerhtml-with-children` (`eslint .` and `tsc --noEmit` both exit 0 in `ui/`).
  - Q2 confirmed: Vitest 3.2.7 accepts the inline `projects` config (projects model, static, dom, scan, dist listed; `vitest run --passWithNoTests` exits 0). No fallback needed.
  - Non-ASCII scan of `ui/` and `.kiro/specs/ui-kit/`: only box-drawing characters (U+2500, U+2502, U+251C, U+2514) and U+2248 in `design.md`. No hidden Unicode.

## ui-kit task 2.2: contrast gate (UI-P6)

Exact WCAG ratios from `ui/tests/model/p6-contrast.test.ts` (seed -1590885540). All 50 pairs pass; no token changed.

Dark (threshold: text 4.5, graphic 3):
- text/bg 15.457, text/surface 14.252, text/fog 11.925
- muted/bg 8.639, muted/surface 7.966, muted/fog 6.665
- pass/bg 16.691, pass/surface 15.390, pass/fog 12.876
- warn/bg 11.591, warn/surface 10.688, warn/fog 8.942
- block/bg 7.940, block/surface 7.321, block/fog 6.125
- line/bg 5.408, line/surface 4.987, line/fog 4.172
- focus/bg 8.923, focus/surface 8.227, focus/fog 6.883
- bl-edge/bg 15.529, bl-edge/surface 14.319, bl-edge/fog 11.980
- bl-ink/bl-fill 15.529
- Tightest: --gk-line on --gk-fog, 4.172 (threshold 3).

Light:
- text/bg 15.665, text/surface 16.740, text/fog 14.882
- muted/bg 7.164, muted/surface 7.656, muted/fog 6.806
- pass/bg 10.815, pass/surface 11.557, pass/fog 10.274
- warn/bg 7.001, warn/surface 7.481, warn/fog 6.651
- block/bg 6.117, block/surface 6.536, block/fog 5.811
- line/bg 4.197, line/surface 4.485, line/fog 3.987
- focus/bg 6.345, focus/surface 6.780, focus/fog 6.027
- bl-edge/bg 15.665, bl-edge/surface 16.740, bl-edge/fog 14.882
- bl-ink/bl-fill 14.532
- Tightest: --gk-line on --gk-fog, 3.987 (threshold 3).

# ghost-hand measurements

Records of the `ghost-hand` spec. Each entry names the date, the Node version, and the machine. Sections marked `unmeasured` are filled by the task that measures them.

## Probe results

Task 1.1. Probe script: `worlds/drawer-arm/scripts/probe.mjs` (run with `node worlds/drawer-arm/scripts/probe.mjs` from the repository root after `corepack pnpm install`; it prints one JSON document). Date 2026-11-18, Node v20.20.2, Apple M1 Mac (darwin, arm64). Package `@mujoco/mujoco` 4.0.1, pinned without a caret in `worlds/drawer-arm/package.json`. The probe scene is a small throwaway MJCF (floor, free box, slide joint, hinge arm, two position actuators), not the shipped scene. All numbers below describe the API, not the final scene.

Design reconciled on 2026-11-18 (task 1.2): `design.md` was updated for these differences from its first draft: the `mj_getState` output must be a `DoubleBuffer` while `mj_setState` takes a `Float64Array`; the INTEGRATION restore is bit-identical (no contingency needed) and FULLPHYSICS is not (max diff 0.0113); the instability warning counters are required for detection and are compared with their value before the step; contacts are copies with integer `geom1` and `geom2`, and `mj_contactForce` and `mj_jacSite` need `DoubleBuffer` outputs; the heap size accessor is `DoubleBuffer.FromArray([0]).GetView().buffer.byteLength`; non-owning `data.warning`, `data.solver`, and `data.timer` are never deleted; `MjData` size with `<size memory="1M"/>` is 1,056,959 bytes; loader and `locateFile` signature; README differences.

### Package facts

- `license` in the installed `package.json`: `Apache-2.0`.
- The installed package contains no LICENSE or NOTICE file. Files in the package folder: `README.md`, `mujoco.d.ts`, `mujoco.js`, `mujoco.wasm` (11,201,302 bytes), `mujoco.wasm.map`, `package.json`, and the `mt/` folder (multi-thread build, not used).
- The `exports` map lists `.`, `./mt`, `./mujoco.wasm`, `./mujoco.wasm.map`, and the `mt` equivalents. `./package.json` is not exported, so `require.resolve('@mujoco/mujoco/package.json')` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The probe finds the folder through `require.resolve('@mujoco/mujoco/mujoco.wasm')` and reads `package.json` from there.
- pnpm 12.21.0 installed 4.0.1 without a release-age exception.

### Loader and wasm location

- The loader is the default export of `@mujoco/mujoco` (Emscripten `MainModuleFactory(options?)`). It returns a Promise of the module. Loading took about 70 ms in Node.
- `mujoco.js` finds the binary with `new URL('mujoco.wasm', import.meta.url)` (the bundler-friendly pattern). `options.locateFile(path, scriptDirectory)` overrides it; it is called with `path = 'mujoco.wasm'` and a string directory. In Node the default needs no option. For Vite, the exported subpath `@mujoco/mujoco/mujoco.wasm` can be imported with `?url`. The Vite path was not run in this probe; a later task checks it.
- The default build uses a non-shared heap: the buffer behind a view is an `ArrayBuffer`, not a `SharedArrayBuffer` (Node itself defines the global `SharedArrayBuffer`, so the global is not a usable test). No COOP or COEP header is needed for the default build.

### Module heap size accessor

- `HEAP8`, `HEAPU8`, `HEAPF64`, and `wasmMemory` are NOT exported. Reading `module.HEAPU8` throws `RuntimeError: Aborted('HEAPU8' was not exported ...)` and prints `Aborted(...)` to stderr. `module._malloc` is `undefined`.
- Working accessor: create a buffer, read the byte length of the `ArrayBuffer` behind its view, delete the buffer. Code: `const b = mujoco.DoubleBuffer.FromArray([0]); const bytes = b.GetView().buffer.byteLength; b.delete();`. Fresh module: 17,629,184 bytes. The heap only grows, in large jumps (for example 17.6 MB to 316 MB after 21 `MjData` objects of the default arena size).

### State functions

- `mj_stateSize(model, sig: number): number`. `mjtState.mjSTATE_INTEGRATION.value` is 32767, `mjSTATE_FULLPHYSICS.value` is 24607. Probe scene (nq 9, nv 8, nu 2): INTEGRATION size 60, FULLPHYSICS size 18. The INTEGRATION size equals the sum of the single-bit sizes: TIME 1, QPOS 9, QVEL 8, ACT 0, HISTORY 0, WARMSTART 8, CTRL 2, QFRC_APPLIED 8, XFRC_APPLIED 24, EQ_ACTIVE 0, MOCAP_POS 0, MOCAP_QUAT 0, USERDATA 0, PLUGIN 0, PLASTIC 0 (sum 60).
- Layout of the vector: the single-bit signatures in bit order (time, qpos, qvel, act, history, warmstart, ctrl, qfrc_applied, xfrc_applied, and so on). Checked: the slices for time, qpos, qvel, warmstart (`qacc_warmstart`), and ctrl equal the `MjData` arrays bit for bit.
- `mj_getState(model, data, out, sig)`: `out` must be a `DoubleBuffer` (size from `mj_stateSize`) or the call writes nothing. A plain `Float64Array` is ACCEPTED but is NOT WRITTEN (the output stays all zero). A plain `number[]` throws `MuJoCo Error: [mj_getState] Invalid argument. Expected TypedArray or WasmBuffer`. Read the result with `Float64Array.from(buffer.GetView())`, then `buffer.delete()`.
- `mj_setState(model, data, state, sig)`: a plain `Float64Array` works, a `number[]` works, a `DoubleBuffer` throws `Cannot convert "undefined" to unsigned long`. Both accepted inputs give the same run.
- Restore check (probe scene, 150 warm-up steps with contacts and actuators, snapshot, 300 steps, restore, 300 steps; 7,500 compared values of `qpos`, `qvel`, `qacc_warmstart`):
  - `mjSTATE_INTEGRATION`: bit-identical (max abs diff 0). Also bit-identical when restored into a freshly constructed `MjData`.
  - `mjSTATE_FULLPHYSICS`: NOT bit-identical (max abs diff 0.0113 in this scene).
- Warning counters are not part of the state vector. After `mj_setState` the counter stays as it was; `mj_resetData` sets it to 0.

### Contacts

- `data.ncon` gives the count. `data.contact` returns a NEW `MjContactVec` COPY on every access (a vector copy taken when there were 4 contacts still reports size 4 after the contacts vanished and `data.ncon` is 0). It has `size()`, `get(i)`, `set`, `push_back`, `resize`. Each access copies all contacts.
- `data.contact.get(i)` returns an `MjContact` (also a copy) with integer fields `geom1` and `geom2` (geom ids), plus `dist`, `pos`, `frame`, `friction`, `dim`, `exclude`, and others. Names: `mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM.value, geomId)` (gave `floor` and `boxgeom`). `contact.geom` is an object, not an id pair; use `geom1` and `geom2`.
- `mj_contactForce(model, data, contactIndex, result)`: `result` must be a `DoubleBuffer` of 6 elements; element 0 is the normal force (2.4525 N for a resting 1 kg box on one of its 4 contacts). A `Float64Array` is accepted but not written (all zeros).

### Warning counters

- `data.warning` is an `MjWarningStatVec` of `mjtWarning.mjNWARNING.value` = 7 entries. Index: INERTIA 0, CONTACTFULL 1, CNSTRFULL 2, BADQPOS 3, BADQVEL 4, BADQACC 5, BADCTRL 6. `data.warning.get(i)` returns an `MjWarningStat` copy with `number` (count) and `lastinfo`. The enum object also holds the keys `values` and `argCount`, so do not iterate it blindly.
- Instability is detected inside `mj_step`, which then calls `mj_resetData` itself. After a step with `qvel[0]=1e11`, `qvel[0]=NaN`, `qpos[0]=NaN`, or `qpos[0]=1e11`, `qpos` and `qvel` are finite and zero again, `time` is 0.002, and the matching counter (BADQVEL 4 or BADQPOS 3) is 1. A finiteness check on `qpos` alone therefore cannot see the instability; the counters are needed. `ctrl[0]=NaN` raised BADCTRL (6) to 1 and then to 2 on the next step (the counter keeps growing while the cause stays). The counters are not cleared by `mj_step`. Compare them with their value before the step, or call `mj_resetData` on a scratch `MjData`.

### `mj_jacSite`

- `mj_jacSite(model, data, jacp, jacr, siteId)` writes a 3 x nv row-major matrix into `jacp` and `jacr`. Both must be `DoubleBuffer` objects of `3 * nv` elements. `null` is accepted for either one. A `Float64Array` is accepted but not written. Probe check: the arm tip site gave -0.3 at row 2 (z), column 7 (the hinge), as expected for a 0.3 m link. Site id: `mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE.value, name)`.
- `mj_forward` must have run for the pose to be current (the probe called it after `mj_resetData`).

### Wrapped objects and `.delete()`

- Every wrapped type that the probe constructed has `.delete()`: `MjModel`, `MjData`, `DoubleBuffer`, `IntBuffer`, `FloatBuffer`, `Uint8Buffer`, `MjOption`, `MjvScene`, `MjvCamera`, `MjvPerturb`, `MjvOption`. 103 prototypes in the module carry `delete`.
- Accessor results are of two kinds (each tested in its own child process because a wrong delete aborts the module):
  - Owning copies, safe to delete and the owner keeps working: `data.contact` (`MjContactVec`), `model.opt` (`MjOption`), `data.body(i)`, `data.geom(i)`, `data.contact.get(i)` (`MjContact`), `data.warning.get(i)` (`MjWarningStat`).
  - Non-owning references: `data.warning`, `data.solver`, `data.timer`. Calling `.delete()` on them aborts the module (`Aborted(native code called abort())` from `free`), because it frees memory that `MjData` still owns. Never delete these.

### `MjData` size

Measured in a fresh module instance per case, probe scene, `model.narena` and `data.narena` read from the objects.

| Case | `model.narena` | `data.narena` | `data.nbuffer` | Bytes of one `MjData` (`narena + nbuffer`) | Heap growth per `MjData` (21 created) |
|---|---|---|---|---|---|
| Without a size element | 13,631,488 | 13,631,488 | 8,383 | 13,639,871 | about 14.2 MB |
| With `<size memory="1M"/>` | 1,048,576 | 1,048,576 | 8,383 | 1,056,959 | about 0.61 MB |

`nconmax` and `njmax` read -1 (automatic) in both cases.

### Stale views after the heap grows

Fresh module, a live `data.qpos` view (length 9) and a `DoubleBuffer` `GetView()` view were kept, then `MjData` objects were created until the heap grew (17,629,184 to 28,639,232 bytes). Both kept views then had `length` 0 and `byteLength` 0, and `view[0]` was `undefined`. A fresh `data.qpos` read after the growth had length 9 and the right values; its `ArrayBuffer` is a different object. A view must be read fresh at every use and copied at once.

### Differences between the package README and the actual API

- README: `new mujoco.DoubleBuffer([0, 0, 0])`. Actual: the constructor takes an element count (`new DoubleBuffer(3)`); an array throws `Cannot convert "0,0,0" to int`. Use `DoubleBuffer.FromArray([0, 0, 0])` to copy values in. The same holds for `IntBuffer`, `FloatBuffer`, `Uint8Buffer`.
- README: `buffer.getView()`. Actual: `GetView()` (also `GetPointer()` and `GetElementCount()`). `getView` is `undefined`.
- README says typed-array views are accepted as out parameters in general ("Expected TypedArray or WasmBuffer"). Actual: for the out parameters probed (`mj_getState`, `mj_contactForce`, `mj_jacSite`) a plain `Float64Array` is accepted without error and left unwritten.
- README says `data.contact` access gives a copy; confirmed. README example `mju_rotVecQuat(res, vec, quat)` with a `DoubleBuffer` result works once the buffer is built with `FromArray`.
- Confirmed as documented: `mujoco.mjNEQDATA` (12), `mujoco.mjFRAMESTRING` (array), `mjtDisableBit.mjDSBL_CLAMPCTRL.value` (256), `mjv_updateScene(... mjtCatBit.mjCAT_ALL.value, scene)`, `data.qpos` as a live `Float64Array` view.
- README is silent on the non-owning accessors (`data.warning`, `data.solver`, `data.timer`) and on the unwritten `Float64Array` out parameters.

## Engine layer (task 7.1)

Shipped scene compiled by `worlds/drawer-arm/src/engine/mjcf.ts` with `<size memory="1M"/>`: `model.narena` and `data.narena` 1,048,576 bytes, one `MjData` (`narena + nbuffer`) 1,065,055 bytes (under 2 MiB). State vector (INTEGRATION) length 120: nq 14, nv 13, nu 6. Module heap right after loading: 17,629,184 bytes. Date 2026-11-18, Node v20.20.2, Apple M1. Only a throwaway check was run; the engine tests are task 7.2.

## Short-run budget and verifyWorld timing

Task 7.7. Script: `worlds/drawer-arm/scripts/measure-budget.mjs` (run `node scripts/measure-budget.mjs` from `worlds/drawer-arm`). The script has no runner of its own that can load TypeScript, so it starts the env-gated vitest file `scripts/measure-budget.measure.ts` (not a `*.test.ts` file, so a normal test run skips it; it lives in `scripts/` because the package scan forbids importing `@ghost-run/core/verify` from `tests/`). No dependency was added. Date 2026-11-18, Node v20.20.2, Apple M1 (darwin arm64, 8 cores).

- Worst-case plan: 19 actions (reach, grasp, pull, release, and slow reaches) that run 2981 of the 3000 steps of the per-plan limit on the Base_World.
- One verifyWorld example costs 7 plan executions (6 ghost runs with a fingerprint each, plus one adapter run). Each timing below is the median of 5 repetitions after one warm-up.
- Machine load (`sysctl -n vm.loadavg`), other sessions were running: before the script `{ 6.62 9.27 10.23 }`, at the start of the measurement `{ 3.73 7.57 9.47 }`, at the end `{ 2.95 7.02 9.20 }`.

| Run | Ghost run of the worst plan (ms) | Adapter run (ms) | Worst example (ms) | Step cost (microseconds) |
|---|---|---|---|---|
| 1 | 100.4 | 99.0 | 694.2 | 33.69 |
| 2 | 98.5 | 98.3 | 691.1 | 33.04 |
| 3 | 99.7 | 99.3 | 699.1 | 33.44 |

- Median worst example 694.2 ms (spread 691.1 to 699.1 ms, about 1.2 percent). Median step cost 33.44 microseconds per step, including monitors and the controller.
- `shortRuns = clamp(floor(25000 / 694.2), 20, 100) = 36`. 20 examples (13.9 s) fit the 25 s allowance, so design D14 stays as written. The value is written to `worlds/drawer-arm/tests/pbt-budget.json`. It is below 100; the Nightly_Run uses the full count of Requirement 18.
- `verifyWorld` on the Base_World with `numRuns: 36`, the `gentle-hands` ward set, a random action generator over the declared ranges, and the `createReferenceTestAdapter` adapter: 6.86 s in one call (random plans are shorter than the worst plan, so this is below the 36 x 0.694 s = 25 s bound). The world is still registered `deterministic: false` in `world.config.ts`; the call was made with `deterministic: true` in the options, because the option is independent of the registration flag.
- Not measured here: the call on a sampled-variant world (task 12 repeats the timing there) and the value after the scene is tuned (task 11.5 re-checks it).

## Determinism golden hash

unmeasured

## Demo scenario numbers

unmeasured

## Browser timings

unmeasured

## 3D overlay frame time with 8 and 20 ghost arms

unmeasured

## Wards task 4.1 baseline

Measured before changing `core/src/wards.ts` (task 4.1 of the wards spec).

- `tests/p4-monotonicity.test.ts` and `tests/wards.test.ts`: 2 files, 26 tests, all pass.
- Whole core suite: 60 files, 403 tests, all pass, no type errors.
- Note: the decimal-IP test in `core/tests/validators.test.ts` (and the numeric-name sample in `core/tests/host.test.ts`) now uses the documentation address 192.0.2.10 (decimal 3221225994).

## Wards task 4.6 post-change run

Measured after the `isMoreRestrictive` and `evaluate` changes in `core/src/wards.ts` (task 4.6 of the wards spec). No fix to `wards.ts` was needed.

- `tests/p4-monotonicity.test.ts` and `tests/wards.test.ts`: 2 files, 26 tests, all pass. Same as the task 4.1 baseline (2 files, 26 tests).
- Whole core suite: 68 files, 484 tests, all pass, no type errors. The 4.1 baseline was 60 files, 403 tests. The suite has grown by 8 files and 81 tests from new test files added in earlier wards tasks.
- `git diff --stat -- core/tests/p4-monotonicity.test.ts core/tests/wards.test.ts` prints nothing, and `git status --short` for both files is empty. Both files are unedited.

## Wards task 4.14 performance

Measured with `core/tests/perf.test.ts` (macOS, Apple Silicon, vitest, single file run; values vary by about 10 to 40 percent between runs).

- Glob step bound: `a*a*a*a*a*a*a*a*b` against 4,000 `a` stays within 2 x 17 x 4,000 steps (the design estimate is 68,000). The loose wall-clock check runs in nightly mode only.
- Content inspection, 16 payloads of 64 KiB against 256 canaries of 4 KiB: about 1.0 to 1.2 s (budget 2.0 s). Passes.
- Evaluation of 10,000 changes and 100 observed events with no secret values: about 15 to 22 ms.
- Evaluation of 10,000 changes, 100 events, 16 payloads of 64 KiB and 256 canaries: about 17 to 26 s (budget 3.0 s). Over budget.
- Evaluation with the largest input the ghost-runner caps allow (16 files of 65,536 bytes, 16 payloads of 64 KiB, 10,000 changes, 100 events): about 16 to 19 s (budget 3.0 s). Over budget.
- Cause: `leakGuard` in `core/src/wards.ts` runs `detectKinds` on every notice and violation string against all canaries. Each call rebuilds base64 and hex needles for every canary; one short string costs about 64 ms with 256 canaries. The two over-budget tests are marked `it.fails` until the engine is fixed.

Follow-up (task 4.14 fix): `core/src/judge/inspect.ts` now builds the base64, hex and whitespace-stripped needles once per canary (`prepareCanaries`), and `leakGuard` in `core/src/wards.ts` and `createInspector().hits` reuse them. Outputs are unchanged. The two `it.fails` tests are now plain `it` and pass.
- Content inspection, 16 payloads of 64 KiB against 256 canaries: about 145 ms (was 1.0 to 1.2 s).
- Evaluation with 256 canaries: about 227 ms (was 17 to 26 s; budget 3.0 s).
- Evaluation with the largest input the ghost-runner caps allow: about 211 ms (was 16 to 19 s; budget 3.0 s).
- Evaluation with no secret values: about 16 ms (unchanged).

## UI kit task 8 component tests

Measured on macOS (Apple Silicon), `corepack pnpm test` in `ui/` (Short_Run, all four projects), after tasks 8.1 to 8.21.

- Result: 62 files, 523 tests, all pass, no type errors. Before task 8 the suite had 42 files and 357 tests.
- Short_Run wall time: about 31 to 33 s for the whole suite (the longest single test, UI-P9 over-200 list, takes about 19 s under load). This is under the 60 s limit, so the DOM run count stays at 25 and is not reduced to 15.
- Runs per property in Short_Run: UI-P1, P2, P3, P4 (two properties), P7, P9 (the over-200 property is capped at 100), P10 static, P11 and P8 static: 100 each. UI-P5 (SP leg, jsdom): 100. UI-P8 mount leg and UI-P10 toggle leg (DOM): 25 each.
- Nightly_Run spot checks (10,000 static or SP runs): UI-P2 about 13 s, UI-P7 about 3.4 s, UI-P11 about 7.7 s, UI-P4 about 44 s, UI-P3 about 51 s, UI-P10 static about 82 s, UI-P9 about 28 s, UI-P8 static about 158 s, UI-P5 about 606 s. The long runs print a vitest `Timeout calling "onTaskUpdate"` message because the synchronous test starves the worker RPC. The tests still pass. The DOM legs (500 runs) were not run in Nightly mode.
- Nightly timeout: `PBT_TIMEOUT` is `undefined` in Nightly mode, so vitest would use its 5 s default. Every new property test passes `PBT_TIMEOUT ?? 0`.
- UI-P5 (`tests/dom/p5-inert.test.tsx`) calls `renderToStaticMarkup` from `react-dom/server` directly in jsdom (Open Question Q3). The Testing Library fallback was not needed.
- UI-P5 skips the `javascript:` check for `aria-*` and `data-*` attributes, because those carry plain display text that begins with the hostile string. Every other attribute is checked, and `href`, `src`, `style` and `on*` are banned everywhere.
- Axe audit (`tests/dom/a11y.test.tsx`): 49 tests, about 0.25 s per axe run alone, so the file sets a 60 s test timeout (a loaded full run exceeded the 5 s default). One real defect was found and fixed: `<li role="group">` in `RedThreadView` became a `li` with an inner `div` carrying the role.

## Wards checkpoint 5 verification

Run on macOS (Apple Silicon) with `corepack pnpm`, in sequence, after the spec text update (requirements, design, tasks of `.kiro/specs/wards`).

- `core`: `tsc --noEmit` exit 0; `eslint .` exit 0; `build` exit 0; `vitest --run`: 70 test files passed, 536 tests passed, 1 skipped (537 total), no type errors, 6.7 s.
- Nightly run (`GHOST_PBT_MODE=nightly`) of `path-ward`, `sql-ward`, `p5-protection`, `p6-egress`, `p6-content`, `p4-refined-monotonicity`, `canary`, `perf`, `message`, `wards-engine`: exit 0, 10 files and 91 tests passed, 79 s, no `onTaskUpdate` warnings. Visible run counts: P4 refined 10,000 runs (v1 stricter than v2 in 2,741 of them), P6 egress 20,000 runs (2,652 with violations). `canary.test.ts` took about 51 s because of the 256-canary cap property.
- `wards-config`: `tsc --noEmit` exit 0; `eslint .` exit 0; `vitest run`: 2 files, 4 tests passed.
- `ghost-runner`: `tsc --noEmit` exit 0; full `test`: 53 files, 258 tests passed, exit 0, 627 s (Docker tests included). Not modified.
- Unchanged files: `core/tests/p4-monotonicity.test.ts` has an empty `git diff`. `core/tests/wards.test.ts` has one removed line (the import statement, widened to import `renderMessage` and the claim-line constants); all existing cases are untouched and new cases are appended only.
- `core/package.json` has no `dependencies` field (only `devDependencies`, `peerDependencies`, `peerDependenciesMeta`).
- Hidden Unicode (U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069, U+E0000 to U+E007F) scan over `core/`, `wards-config/`, `.kiro/specs/wards/` and this file (148 text files, `node_modules` and `dist` excluded): 0 literal occurrences. The three spec files pass `validate_spec_format` with no issues, and contain no HTML-comment openers.

## Core: verifyWorld stateEquals and WardNotice kind 'unsupported-step'

Run on macOS (Apple Silicon) with `corepack pnpm`, after two small additive core changes.

- `verifyWorld` accepts an optional `stateEquals?: (a, b) => boolean` (default: the existing structural comparison). It is used only by P3 10.1 and 10.2. P2 change lists, P1 fingerprints and ward verdicts stay structural. Chosen over "diff(a, b) is empty" because `diff` is a minimal change list and a gap or bug in it would hide real state differences for every world. A caller can still build `stateEquals` on the world's own `diff`.
- `WardNotice.kind` gained `'unsupported-step'` (ghost-shell task 1.1). No verdict logic changed.
- `core`: `typecheck`, `lint`, `build` exit 0; `vitest run`: 71 test files passed, 542 tests passed, 1 skipped (543 total), no type errors, about 7 s. All existing PBT pass with the default comparison.
- `typecheck` exit 0 for `ghost-runner`, `wards-config`, `ui`, `worlds/drawer-arm` and `apps/ghost-hand`. None of them was modified.
- `core/dist` was rebuilt. `core/package.json` and `core/tsconfig.json` are unchanged.
- The ghost-runner `it.fails` test for `verifyWorld` is left as is. The ghost-runner turn replaces it with a plain test that passes `stateEquals` built from a content fingerprint (relative path, type, content bytes; excluding rootPath, mtimeNs, ctimeNs, lastStep).

## Wards task 6.1: yaml dependency

Recorded on 2026-11-18 on macOS (Apple Silicon) with `corepack pnpm`.

- Added `yaml` pinned to exactly `2.9.1` to `wards-config/package.json` `dependencies`. `corepack pnpm install` finished with exit 0 (+6 -5 packages, lockfile passed the supply-chain policy check; the warning about the deprecated sub-dependency `whatwg-encoding@3.1.1` is pre-existing).
- License confirmation: the `license` field of the installed `yaml@2.9.1` `package.json` is `ISC`, and `npm view yaml@2.9.1 license` also returns `ISC`. Confirmation date: 2026-11-18. The package has no runtime dependencies. The npm registry lists `time.modified` 2026-09-11 for 2.9.1.
- Exports check: the `exports["."]` map of `yaml@2.9.1` has the conditions `types` (`./dist/index.d.ts`), `node` (`./dist/index.js`), and `default` (`./browser/index.js`). The default condition is therefore the browser build, which is the one a bundler such as Vite uses for a browser target. A search of `node_modules/yaml/browser` finds no import of a Node built-in module (`node:*`, `fs`, `path`, `util`, `os`, `crypto`, `process`) and no `require(` call.
- The `wards-config` package.json already had an `exports` entry for `"."`; it was left unchanged (the `./node` subpath is added by task 6.6).
- README: added the `yaml` row, the `shell-quote` and `@types/shell-quote` rows, the missing `ui` dev dependencies, and a `core` row ("no runtime dependencies") to the existing dependency table. Every license was read from the installed `package.json`. All are permissive except `axe-core` (MPL-2.0, dev-only, not shipped); the README license note says so.

## Wards task 6.7: print and parse round trip (Property 17)

Recorded on macOS (Apple Silicon) with `corepack pnpm`, in `wards-config`.

- File: `wards-config/tests/roundtrip.test.ts`. The property uses `NUM_RUNS` from `tests/pbt-config.ts`: 100 runs in the default mode, 10 000 runs with `GHOST_PBT_MODE=nightly`. Both modes passed (nightly took about 3.7 s).
- Checked per run: `parseWards(printWards(ws, { safeCommands: sc }))` returns an equal `wardSet` and `safeCommands`; printing the parsed values returns the identical text; the text ends with exactly one newline; an empty list prints no `safe_commands` key; a non-empty list prints one top-level line directly after the last ward. Example tests cover the quoting of `".env"`, `"data/**"`, `"0"`, `"true"`, and an empty ward set with safe commands.
- The first runs failed because of three defects in the shared fixture arbitraries (no defect in `print.ts`, `parse.ts` or `schema.ts`). Shrunk counterexamples: `{"wards":[{"id":"a","kind":"path","deny":["delete"],"paths":["/**"]}]}` with `[]` (rooted globs are rejected as `absolute-pattern`); `{"wards":[{"id":"a","kind":"sql","tables":["7a"],"max_rows_lost":0}]}` with `[]` (table names must start with a letter or `_`); `{"wards":[{"id":"a","kind":"egress","secrets":[".env"],"allow_hosts":["::1"]}]}` with `[]` (an IPv6 host entry must be written `[::1]`). The ward id arbitrary also allowed `_`, which the id pattern rejects. All four were fixed in `tests/fixtures/ward-arbitraries.ts`.
- Added `safeCommandEntryArb` and `safeCommandsArb` (0 to 256 distinct entries of 1 to 256 characters over the entry charset) to the fixtures.
- `tsc --noEmit` and `eslint .` exit 0; `vitest run`: 9 files, 92 tests passed.

## Wards tasks 8-11: final verification

Recorded on macOS (Apple Silicon) with `corepack pnpm`.

- `core`: vitest 73 files, 549 passed, 1 skipped. `wards-config`: vitest 13 files, 122 passed. `tsc`, `eslint`, and the build are clean for `core` and `wards-config`. `ghost-runner` and `ui` typecheck clean. No hidden Unicode in the changed files.
- Checks: `core/package.json` has no `dependencies`. The README table lists `yaml` 2.9.1 under ISC. `core/tests/p4-monotonicity.test.ts` is unchanged (`git diff` is empty).
- Property-based tests in short mode run `NUM_RUNS=100` per property. The parse-safety test with a 256 KiB list runs 20 times. The engine-determinism property also passed in the nightly mode at 10,000 runs per property.
- Property 13 found one bug in `core/src/wards.ts` `checkPath`. When two spellings of one protected path appeared in a single step, the displayed spelling depended on the order of the changes. Counterexample: `data/a.txt` and `DATA/A.TXT` in one step. The fix keeps the smallest code-point spelling. The regression test is kept.
- Open Item 16 is closed. The default `safe_commands` list is `ls`, `pwd`, `cat`, `git status`, `git diff`.

## Ghost-shell task 3.1: sql.js facts

Recorded on macOS (Apple Silicon), Node v20.20.2, with `corepack pnpm exec vitest run` in `worlds/playground-shell`. Installed versions read from the packages: `sql.js` 1.16.0, `vitest` 3.2.7, `jsdom` 26.1.0. The real `sql.js` wasm build is used (no mock), loaded with `locateFile` returning the path of `sql.js/dist/sql-wasm.wasm`.

- Files: `worlds/playground-shell/tests/sql-smoke.test.ts` (node) and `tests/sql-smoke-jsdom.test.ts` (`// @vitest-environment jsdom`). Both pass: 2 files, 12 tests.
- Claim 1: `initSqlJs` loads the wasm file and answers `SELECT 1` under Node and under jsdom. Holds.
- Claim 2: an empty `new SQL.Database().export()` returns 4096 bytes (non-zero) in both environments. The rule "create the file only when the export is non-empty" is therefore wrong. Fallback (Unverified item 2): create the file only when a statement wrote.
- Claim 3: a database built twice from the same fixed SQL (a `WITH RECURSIVE` insert of 1,206 rows into one table, plus a second table with 2 rows) exports byte-equal results (24,576 bytes each). Holds in both environments.
- Claim 4: `crypto.subtle.digest('SHA-256', ...)` returns 32 bytes in the jsdom test with `tests/support/setup.ts` loaded. Holds.
- Claim 5: `ArrayBuffer.isView(new Uint8Array(4))` is true in jsdom, and also true for the `structuredClone` result. `instanceof Uint8Array` differs across realms: under Node it is true for both values; under jsdom it is true for the value created in the test and false for the `structuredClone` result. Code must use `ArrayBuffer.isView`, not `instanceof Uint8Array`, for values that may cross a clone.
- Claim 6: `PRAGMA page_size` returns 4096. `PRAGMA max_page_count` returns 4294967294 by default, and `PRAGMA max_page_count = 64` returns 64. Inserting 200 rows of `zeroblob(4096)` after that limit fails with the message `database or disk is full`. Holds in both environments.

## Ghost-shell task 3.2: worker_threads watchdog

Recorded on macOS (Apple Silicon), Node v20.20.2, `sql.js` 1.16.0, `vitest` 3.2.7, with `corepack pnpm exec vitest run tests/worker-threads-spike.test.ts` in `worlds/playground-shell`. Files: `tests/support/sql-worker.mjs` (plain JavaScript worker, real `sql.js`, answers `{ id, request }` with `{ id, response }` using `db.exec`) and `tests/worker-threads-spike.test.ts`.

- A worker running `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;` never answers. A real `setTimeout` of 300 ms wins the race, and `worker.terminate()` resolves while the worker is still inside the wasm call.
- Measured real time from sending the query to the resolved `terminate()` promise: 304.4 ms (300 ms timer plus about 4 ms for terminate). The whole test, including spawning two workers, took 369 ms.
- A fresh worker spawned after the termination answers `SELECT 1` with the value 1. Terminate-and-respawn works with real `sql.js`; task 5.2 can reuse `sql-worker.mjs`.

## Ghost-shell task 3.3: Vite build and yaml browser build

Recorded on macOS (Apple Silicon), Node v20.20.2, with `corepack pnpm --filter @ghost-run/ghost-shell build` and `test`. Resolved versions read from the installed packages: `vite` 7.3.8, `@vitejs/plugin-react` 5.2.0, `vitest` 3.2.7, `jsdom` 26.1.0, `sql.js` 1.16.0, `react` 19.3.1, `yaml` 2.9.1 (through `@ghost-run/wards-config`).

- Build: 131 modules, about 0.8 s. Output in `dist/`: `index.html`, `_headers`, `assets/index-D8hRYLyh.js` (336.92 kB, gzip 105.68 kB), `assets/worker-entry-GW3ZIgk6.js` (42.73 kB), `assets/sql-wasm-CXIAVl5-.wasm` (688,197 bytes, gzip 337.16 kB).
- `?url` pattern: works as designed. `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'` makes Vite emit the hashed wasm file under `assets/`, and the worker chunk references `sql-wasm-CXIAVl5-.wasm`. No fallback (copy into `public/`) was needed. The worker chunk also contains the strings `sql-wasm-browser.wasm` (the default name inside sql.js, replaced by `locateFile`).
- Worker: `new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' })` is bundled as a separate chunk (`worker-entry-*.js`) with `worker.format: 'es'`.
- yaml browser build: `parseWards` from the default entry `@ghost-run/wards-config` bundles for the browser. The main chunk contains the `yaml` parser (`YAMLParseError`, `Unresolved alias`) and the bundled `wards.yaml` text. No JS file contains a quoted `node:` specifier.
- Deviation: `@types/react` and `@types/react-dom` (`^19.3.0`, listed in the design table) were missing from `apps/ghost-shell/package.json`, so `tsc` failed on JSX. They were added and installed once from the existing store (no new package versions downloaded).
- Deviation: the build-smoke test sets `NODE_ENV=production` for its build, because Vitest sets `NODE_ENV=test` and the main chunk then grew to 544,404 bytes (React development build).
- CSP in `public/_headers` is the text of the design; the build-smoke test asserts `default-src 'none'` and `connect-src 'self'`.
- `apps/ghost-shell/wards.yaml` already existed (created by another session) and was used unchanged.

## Ghost-shell task 3.4: dist check

Recorded on macOS (Apple Silicon), Node v20.20.2, with `corepack pnpm --filter @ghost-run/ghost-shell build && node scripts/check-dist.mjs` on the build of task 3.3 (`index-D8hRYLyh.js`, `worker-entry-GW3ZIgk6.js`, `sql-wasm-CXIAVl5-.wasm`). The first run flagged eight strings in the JS chunks and no HTML or CSS finding. Each was reviewed once and added to `scripts/dist-url-allowlist.json` as an exact string with a reason (Unverified item 3). After that the check exits 0.

- `https://react.dev/errors/` (main chunk): prefix of the React production error message; shown as text, never fetched.
- `http://www.w3.org/2000/svg`, `http://www.w3.org/1998/Math/MathML`, `http://www.w3.org/1999/xlink`, `http://www.w3.org/XML/1998/namespace` (main chunk): XML namespace identifiers used by React as names. `http://www.w3.org/1999/xhtml` is allowed too but did not appear in this build.
- `https://github.com/sql-js/sql.js/pull/647` (worker chunk): link inside a `sql.js` warning message text.
- `http://[` (main chunk): prefix string in the host-parsing code of the egress judge (`new URL("http://[" + host + "]")` to validate a bracketed IPv6 literal). The URL is parsed, not fetched.

Host allowlist: the suffixes `.example`, `.test`, `.localhost`, `.invalid`, and `registry.npmjs.org`; none of them occurs in the build. No `node:` specifier, no non-relative worker URL, and no protocol-relative URL was found. The `.wasm` name is referenced from the worker chunk, and `_headers` is present.

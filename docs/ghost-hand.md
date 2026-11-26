# Ghost Run+: Ghost Hand

The browser MuJoCo robot arm, its claims, tested environments, and measured numbers. Part of [Ghost Run+](../README.md).

## Ghost Hand

Ghost Hand (`apps/ghost-hand/`, with the world in `worlds/drawer-arm/`) is a browser page. A MuJoCo robot arm (WebAssembly) tries a plan on a base copy of a drawer scene and on 8 haunted variants (perturbed friction, mass, handle offset, sensor noise, and command delay) before the "real" arm runs the plan. The page draws a 3D ghost-arm overlay with Three.js. The `ghost-hand-run` command (`dist-node/cli.js`) runs the same pipeline from the terminal.

### What the "real" arm is

The "real" arm is a reference simulation run by the same MuJoCo engine. No physical robot is involved, and nothing here claims anything for physical hardware.

### Claims

| Property | Claimed where | Not claimed |
|---|---|---|
| P1 (a ghost run leaves reality unchanged) | Per run, for the in-memory page world: the page shows the claim only when the fingerprints before and after the run are equal. | Physical hardware, and any run whose fingerprints differ. |
| P2 (the ghost result equals the reference execution) | The base ghost run against the reference execution, within the Tested_Environments. Scope wording: "On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware." The page shows this text only when the Determinism_Self_Check passed. | Physical hardware, other browsers, other machines. |
| P3 (restoring a snapshot returns the exact pre-snapshot state; the trajectory after it also matches) | All worlds, including this one. | Nowhere. |
| P4 (a stricter ward never lets more plans pass) | Evidence from `core` (wards engine logic). Ghost Hand adds no ward engine of its own. | Nowhere. |
| P5, P6 | Not claimed. The page shows "not applicable" for both. | Always: the world has no protected path and no secret file. |
| P8 (same seed and same plan give identical variant outcomes) | Within the Tested_Environments only. | Any other environment. |

The joint-limit and self-collision ward, the message without the lowered-claim line, and the "not applicable" banner for P5 and P6 are available because the prerequisites PR-1, PR-2, and PR-3 landed (state checked on 2026-11-18, see `docs/measurements.md`, section "Prerequisite landing state (18.3)").

### Plan revision: recorded or scripted

Plan revision in the page is a replay. The page does not call an LLM. It replays a Plan_File of `origin: "recorded"` (written by a Kiro session) or of `origin: "scripted"` (written by hand), and it states which one it shows.

The shipped revised plan `apps/ghost-hand/plans/revised.plan.json` has `origin: "recorded"`. A Kiro CLI session decided its values: it ran the first plan, read the block message, and chose the numbers from that message, the Wards_File, and the declared ranges (`recordedWith`: "Kiro CLI 3.4.0, model Auto, 2026-11-18"). The page replays the file and says so with the text "Recorded plan: replayed here, not decided by an LLM in this page." The first plan, `plans/first.plan.json`, stays `origin: "scripted"`. The attempts and the messages of the recording are in `docs/measurements.md`, section "Plan revision recording".

How to record a revision (design decision D18):

1. Run `ghost-hand-run plans/first.plan.json --wards ../../worlds/drawer-arm/wards.yaml` (from `apps/ghost-hand`, after `corepack pnpm --filter "@ghost-run/ghost-hand^..." build` and `corepack pnpm --filter @ghost-run/ghost-hand build:node`) and read the block message. The exit code is 2 for a blocked plan.
2. Write the revised Plan_File with `origin: "recorded"`, `revisionOf` (the name of the first plan), and `recordedWith` (the tool and version that decided the revision, at most 120 characters).
3. Run `ghost-hand-run validate <revised plan>`. It exits 0 for a valid file and 65 for an invalid one.
4. Run `ghost-hand-run <revised plan> --wards ...` again. Exit code 0 means pass.

### Tested environments and platforms

- Tested_Environments: Node.js 20.20.2 and Chrome 157 (157.0.8103.79) on an Apple M1 Mac (macOS). Firefox, Safari, Linux, and x86 machines were not tested.
- The Determinism_Self_Check runs in the page and reproduces the reference trajectory hash. It is a measurement in one browser on one machine, not a proof. If it fails, the page shows no P2 or P8 claim.
- The `deterministic: true` flag of `worlds/drawer-arm/world.config.ts` is limited to the Tested_Environments.
- macOS and Linux are the supported platforms for the commands. Windows is unverified. Chrome 157 is the only tested browser.
- Hosting: the page uses the single-thread MuJoCo build and Web Workers. It needs no `SharedArrayBuffer` and no special response headers (no COOP or COEP). It runs on any static host.

### MuJoCo pitfalls

Measured details are in `docs/measurements.md`, section "Probe results".

- Set the model memory size explicitly (`<size memory="1M"/>` in the scene). Without it each `MjData` takes about 13.6 MB, and the WebAssembly heap grows by about 14 MB per object.
- Typed-array views over the WebAssembly memory become empty (length 0) when the memory grows. Read a view fresh at every use and copy it at once. Never keep one across a call.
- The README of `@mujoco/mujoco` deviates from the actual API: `DoubleBuffer` takes an element count, not an array (use `DoubleBuffer.FromArray`); the view accessor is `GetView()`, not `getView()`; and a plain `Float64Array` passed as an output parameter is accepted but never written.
- Call `.delete()` on every wrapped object you construct, and never on the non-owning accessors `data.warning`, `data.solver`, and `data.timer` (that aborts the module).

### Variants of the shipped seed

The shipped seed is 42 and the default count is 8 (`worlds/drawer-arm/variant-config.json`). The configuration allows up to 20 variants, but the page limits the count to the default of 8 while `largeCountEnabled` is `false`. These values were read from a run of the pipeline on 2026-11-18 (Node.js 20.20.2, Apple M1 Mac, `@mujoco/mujoco` 4.0.1).

| Variant | drawerFrictionN | drawerMassKg | handleOffsetM (x, y, z) | sensorNoiseM | commandDelaySteps |
|---|---|---|---|---|---|
| variant-0 | 0.821 | 1.187 | 0.0036, 0.0012, 0.0022 | 0.0023 | 2 |
| variant-1 | 1.870 | 0.607 | 0.0022, -0.0012, -0.0049 | 0.0023 | 3 |
| variant-2 | 0.926 | 1.075 | 0.0015, 0.0012, -0.0048 | 0.0026 | 5 |
| variant-3 | 3.355 | 0.599 | 0.0032, -0.0010, -0.0023 | 0.0002 | 2 |
| variant-4 | 3.267 | 1.059 | 0.0017, 0.0000, 0.0020 | 0.0020 | 3 |
| variant-5 | 1.893 | 0.862 | -0.0018, -0.0014, 0.0025 | 0.0016 | 3 |
| variant-6 | 0.602 | 0.516 | 0.0001, 0.0007, -0.0013 | 0.0004 | 4 |
| variant-7 | 1.932 | 0.397 | 0.0013, -0.0004, -0.0020 | 0.0018 | 0 |

### Measured numbers of the demo runs

All numbers below were measured on 2026-11-18 on an Apple M1 Mac (macOS). Plan results and timing: Node.js 20.20.2, seed 42, 8 variants, the shipped `wards.yaml` (ward `gentle-hands`: success rate at least 0.95, contact force at most 30 N, no contact with the vase). "Ghosts that fail" counts variants whose row status is failed (the drawer stays below the target opening, or a joint limit is exceeded); this is the "2 of 8 ghosts failed" the app shows. "Variants with success:false" counts only the Variant_Results with `success: false`, which is what the ward's success rate uses. The `fast pull` counts were re-measured on 2026-11-26 (seed 42, `scripts/measure-demo.mjs`); the force, drawer and timing numbers are from 2026-11-18. Browser numbers: Chrome 157.0.8103.79, headless, real time. The machine was not idle, so timings are indicative. The full records are in `docs/measurements.md`.

| Plan | Verdict | Ghosts that fail | Variants with success:false | Max contact force | Base_World drawer opening |
|---|---|---|---|---|---|
| `fast pull` | block (ward `gentle-hands`) | 2 of 8 (variant-3 misses the drawer target, variant-6 exceeds a joint limit) | 1 of 8 (variant-3; the ward reports success rate 7/8) | 27.53 N (limit 30 N) | 0.1216 m (target 0.12 m) |
| `slow pull, gentle grip` (recorded) | pass | 0 of 8 | 0 of 8 | 29.24 N (limit 30 N) | 0.1276 m (target 0.12 m) |

Browser timings (the page-ready number is of the test harness page, not of the app page, which also runs the Determinism_Self_Check; the 3D overlay number is of the real overlay renderer):

| Check | Measured (2026-11-18, Chrome 157.0.8103.79, Apple M1 Mac) |
|---|---|
| Page ready (harness page, 3 loads) | 368 ms first load, 241 ms and 281 ms warm loads |
| Ghost run, 8 variants, 5 runs | median 308 ms, maximum 313 ms |
| Ghost run, 20 variants, 3 runs | median 518 ms, maximum 553 ms |
| 3D overlay frame time, 8 ghost arms | median frame interval 16.7 ms (the 60 Hz vsync period), median render call 0.7 ms |
| 3D overlay frame time, 20 ghost arms | median frame interval 16.7 ms, median render call 0.6 ms |

A second browser run under higher machine load gave a median of 414 ms for 8 variants and 557 ms for 20 variants. The frame interval shows no dropped frame in 300 samples; it gives no headroom below 16.7 ms, and headless Chrome has no visible window.

Trajectory_Hash of the reference plan (`reference-plan-v1`, Base_World), measured on 2026-11-18: the hash from Chrome 157 on the main thread and in a Web Worker equals the hash from Node.js 20.20.2 (each context run twice). The stored golden hash is `2cf8283de204eae50fbc4db3660e57d6b19b799cbc557ad31af56ba14e191d9f`. This holds for the Tested_Environments only.

Run time of `verifyWorld` on the drawer-arm world (2026-11-18, Node.js 20.20.2, Apple M1 Mac): 35 examples took 6040 ms in the budget measurement. The contract test took 12.8 s to 14.0 s for both calls over several runs. The save-time budget is 60 s.

### Licenses and assets

The Ghost Hand rows are in the table of [dependencies.md](dependencies.md). The build writes `dist/THIRD_PARTY_NOTICES.txt` (`corepack pnpm --filter @ghost-run/ghost-hand build`, or `notices` alone). It is generated from `apps/ghost-hand/notices/sources.json` and the upstream license texts in `apps/ghost-hand/notices/`. It lists MuJoCo, Qhull, TinyXML-2, tinyobjloader, libccd, miniz, and lodepng (bundled in `mujoco.wasm`), plus react, react-dom, scheduler, and three. `@mujoco/mujoco` 4.0.1 declares Apache-2.0 in its `package.json`, but its tarball has no LICENSE file, so the MuJoCo license text comes from the upstream repository at tag 4.0.1.

Assets: the page uses only primitive Three.js shapes and system fonts. It has no image, no font file, no icon file, and no audio. The shared UI kit draws its icons as original SVG paths (MIT, this repository). The scene is written as MJCF text in `worlds/drawer-arm/src/engine/` with no mesh file.

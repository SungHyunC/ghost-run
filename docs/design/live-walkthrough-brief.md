# Live walkthrough: design brief for Kiro

Draft 1, 2026-11-21. Claude Code wrote this brief and the mockup at the owner's request. Kiro builds the change from them.

Visual reference: [`docs/design/live-walkthrough-mockup.html`](live-walkthrough-mockup.html). It is one self-contained HTML file and shows section 3 only.

The owner approved this mockup ("v5"). It changes section 3 of the landing page, "Watch the ghost work". Every other section of `docs/design/landing-mockup.html` and of the built page stays as it is.

## 0. Goal

Today section 3 replays runs that were recorded at build time. After this change:

1. **It runs for real.** The ghost runs the plan in the visitor's browser with the same engines as the apps: the world packages, `ghostRun`, and the wards engine. The page shows the result of that run. The five animated steps stay, and the data in them comes from the live run.
2. **Visitors can give their own plan.**
   - Ghost Shell: a shell command.
   - Ghost Cloud: an AWS CLI command.
   - Ghost Hand: three sliders.
3. **It is easier to read.** Port the v5 layout:
   - one control card (world tabs, the agent's plan, three example plans)
   - a slim five-dot stepper
   - the theater: Reality, Ghost copy, and one judgement row
   - the speech bar with a small step label

## 1. Fidelity

Port the mockup's section 3: its markup, CSS, SVG, copy, sizes, colors and timings. Do not reinterpret it. Keep the existing site rules:
- self-hosted Fredoka
- no external request
- accessibility
- reduced motion
- lint and hygiene

Things from the old section 3 that v5 merges or drops:

| Old element | In v5 |
|---|---|
| The "Agent's plan" bar inside the theater | Becomes the plan input in the control card |
| The world chip row | Becomes tabs in the control card |
| The big step buttons with function names | Become a slim stepper; the function name moves into the speech label ("STEP 2 · Run · step()"). Clicking a step still jumps to it. |
| The separate effectsOutside line | Becomes a chip in the judgement row |
| The candle note sentence | Dropped |
| The Replay button | Moves to the top right of the control card |

One fix to the mockup: in the Run step the ghost's terminal bubble covers the right end of the stepper. Keep the bubble inside the theater.

## 2. The live engines, per world

All runs happen in memory in the visitor's browser. Nothing touches the visitor's machine. No network request leaves the page: Ghost Cloud never calls AWS, and `curl` in Ghost Shell is observed, not sent.

| World | Engine (reuse; do not rewrite) | Plan input | Wards |
|---|---|---|---|
| Ghost Shell | `runPlayground` in `apps/ghost-shell/src/pipeline/run-playground.ts`, the same fixture as the app, and sql.js | A command line. Supported commands: `cat`, `cp`, `curl`, `echo`, `ls`, `mkdir`, `mv`, `npm`, `rm`, `sqlite3`, `touch` | `apps/ghost-shell/wards.yaml` |
| Ghost Hand | The Ghost Hand pipeline (`apps/ghost-hand/src/pipeline/run.ts`) with its worker executor, the drawer-arm world, MuJoCo, seed 42, and 8 variants | Three sliders: pull speed 0.05 to 0.6 m/s, grip force 2 to 40 N, pull distance 0.02 to 0.25 m. They build the five-action plan of `plans/first.plan.json` (reach, reach, grasp with the grip force, pull with the distance and speed, release) and pass the app's plan validator. | `worlds/drawer-arm/wards.yaml` |
| Ghost Cloud | `runGhostCloudPlan` in `worlds/ghost-cloud/src/pipeline/run-plan.ts` and its fixture | An AWS CLI command: `aws s3 ls/mb/rb/cp/rm`, or `aws s3api put-bucket-acl/put-public-access-block/delete-public-access-block` | `worlds/ghost-cloud/wards.yaml` |

**Dependencies.** The build-time record script already imports these modules. Reuse them through one small adapter per world in `site/src/live/`. Record the dependency in `.kiro/steering/structure.md`. Do not change `apps/`, `worlds/`, `core/` or `ui/`. If a change there is unavoidable, stop and report it.

**Loading.**
- The Shell engine (about 0.7 MB of sql.js wasm) loads when section 3 first scrolls into view.
- The Hand engine (the 11 MB MuJoCo wasm and its worker) loads only when the visitor first picks Ghost Hand. While it loads, the ghost says so in the speech bar, for example "Summoning eight ghost arms…".
- The first paint of the landing page stays light.

**Headers.** The root `_headers` block for `/` (and `/index.html`) gains what the engines need: `'wasm-unsafe-eval'` in script-src, `worker-src 'self'`, and `connect-src 'self'`. Nothing else changes. The site check must keep passing.

## 3. How a live run drives the five steps

1. **Copy.** The world's snapshot (the ghost copy) appears. The data is the live copy.
2. **Run.** The terminal bubble types the plan. The copy pane then shows the live after-state, drawn with the mockup's visuals:
   - Shell: rows vanish, files disappear or appear.
   - Hand: each tile turns ✓ or ✗ from the live variant results, and a joint-limit report is shown on its tile.
   - Cloud: buckets and objects vanish.
3. **Judge.** One check chip per live ward check, using the ward engine's own reasons and numbers, plus the live effectsOutside chip.
4. **Verdict.** BLOCKED, WARN or PASS from the live verdict. The fingerprint badge appears only when the live before and after fingerprints are equal (P1). WARN uses an amber stamp, "ASK A HUMAN", and a flickering candle, in the mockup's style.
5. **Fix and go.**
   - A blocked preset that has a known fix: the fixed plan runs live too, and the stepper shows the second pass. The fixes:
     - Shell DROP TABLE → `apps/ghost-shell/plans/scenario-1-fixed.json`
     - Shell `rm -rf ./data ./build` → `scenario-2-fixed.json`
     - Hand fast pull → `apps/ghost-hand/plans/revised.plan.json`
     - Cloud delete prod-assets → `aws s3 rb s3://tmp-build-cache --force` (demo 03)
   - A blocked plan with no known fix, including every plan the visitor typed: the step reads "Edit the plan and run again". No fix is ever made up.
   - A plan that passes: steps 4 and 5 show PASS and the "real run allowed" badge (Cloud: "allowed", plus the note that Ghost Cloud has no real mode). Nothing is fixed.

**Narration.** Templates per world and step, filled from the live run's numbers and the ward reasons. Keep the tone of the mockup, for example "I run the plan on my copy… poof! 1,206 users are gone, but only in the copy." Never claim anything the run did not show.

**Unsupported input.** If the parser rejects the plan, the ghost explains it in the speech bar, lists the commands it knows, and stops at step 1. It never crashes. Input is length-limited and shown escaped.

**Presets** ("Try:"). Clicking one fills the plan and runs it.
- Shell: DROP TABLE users, `rm -rf ./data ./build`, `npm test`.
- Hand: fast pull (0.6, 20, 0.2), slow pull and gentle grip (0.15, 15, 0.15), strong grip (0.3, 38, 0.2).
- Cloud: delete prod-assets, make it public (`aws s3api put-bucket-acl --bucket prod-assets --acl public-read`), delete tmp-build-cache.

The first preset of each world autoplays when the section scrolls into view.

**Reduced motion.** It still runs live but shows the final state without animation.

## 4. Truth and tests

- **Same results as the recording.** For every preset, a test runs the live adapter and compares its result with the recorded `site/src/data/runs.json` (or with a fresh recording where `runs.json` has no entry). It is fine if the record script and the live adapters share code.
- **Adapter tests in Node:** verdicts, checks, fingerprint equality, unsupported input, and the input limits.
- **Engine-loading tests:** Hand loads lazily, and nothing loads before the section is near.
- **DOM tests:**
  - the control card, the stepper jump, Replay, the presets, the slider labels
  - typed input reaches the engine escaped
  - Reality never changes
  - the narration region updates once per step
- **Live badge:** the page says "Live in your browser" only for runs that really ran. If an engine fails to load, it falls back to the recorded run and says "Recorded run".

## 5. Out of scope

- Changes to the apps, worlds, core or ui.
- New worlds or new commands.
- Deployment. Claude Code redeploys after review.

## 6. Docs

- README "Landing site" section: one line saying the walkthrough runs live in the browser.
- Disclosure: one line, "The live-walkthrough mockup (v5) was made by Claude Code; Kiro built it."
- `docs/measurements.md`: engine sizes and load times measured in Chrome.

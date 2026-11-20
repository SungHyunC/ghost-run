# Requirements Document

## Introduction

The `site-live` spec changes section 3, "Watch the ghost work", of the Ghost Run+ landing site from a replay of build-time recordings into a live demo with the cleaner v5 layout. It builds on the `site` spec (`.kiro/specs/site/`) and on the package `site/` (`@ghost-run/site`) that this spec produced. Only section 3 changes. The nav, hero, recipe, costumes, and make-your-own blocks stay as they are. The footer changes only by one added link to the third-party notices (Requirement 18, criterion 3). The assembled `site/dist/` layout stays, plus the notice file at its root.

After this change a visitor sees three things in section 3:

1. **A real run.** The ghost runs the plan in the visitor's browser with the same engines as the apps: the world packages, `ghostRun`, and the wards engine. The five animated steps stay, and the data in them comes from the live run.
2. **The visitor's own plan.** Ghost Shell takes a shell command, Ghost Cloud takes an AWS CLI command, and Ghost Hand takes three sliders.
3. **A cleaner layout.** One control card (world tabs, the agent's plan, three example plans, Replay), a slim five-dot stepper, the theater (Reality, Ghost copy, one judgement row), and the speech bar with a small step label.

The inputs of this spec are the design brief `docs/design/live-walkthrough-brief.md` (Draft 1, 2026-11-21) and the approved mockup `docs/design/live-walkthrough-mockup.html` ("v5"). The page is a port of the mockup, not a reinterpretation of it. Every claim of the brief was checked against the repository on 2026-11-21 for this spec. Where the repository differs from the brief, this spec and its design follow the repository. The differences are listed under "Open questions" in `design.md`.

The spec reuses code and types and defines no second shape for them: `runPlayground` of `apps/ghost-shell`, `runGhostHand` and the executor selection of `apps/ghost-hand`, `runGhostCloudPlan` of `@ghost-run/ghost-cloud`, `WardEngine` and `ghostRun` of `@ghost-run/core`, `parseWards` of `@ghost-run/wards-config`, and the walkthrough engine of `site/src/engine/`.

Safety claims follow the world-contract steering ("Claimed in" column). The page does not claim a property; it shows what the run showed. Ghost Cloud has no real mode and the page never says it runs for real. The fingerprint badge appears only for a live run whose fingerprints are equal (P1 holds in the playground). Hidden characters are never written literally in this document or in any repository file of this feature; a hidden character is named by its code point and built in code from code points. Hosts in examples use reserved domains, and secrets are canary values.

This spec covers these parts:

1. **Live adapters**: one small adapter per world in `site/src/live/`, calling the existing engines without changing `apps/`, `worlds/`, `core/`, or `ui/`.
2. **Lazy loading**: the light engine (Shell and Cloud) when the section is near; the Hand engine only after Ghost Hand is picked.
3. **From run to walkthrough**: a live run becomes the walkthrough events and states, for every outcome (block with a known fix, block without a fix, pass, warn, unsupported input).
4. **The v5 section**: control card, stepper, theater, speech bar, presets, fixed plans, visitor input, fallbacks, and the "Live in your browser" and "Recorded run" badge.
5. **Recorded data**: `runs.json` version 2 with all presets and fixed plans, shared derivation code with the live adapters, and the parity test.
6. **Headers and checks**: the `_headers` block for `/` and the meta policy, and the Site_Check changes.
7. **Docs**: README line, disclosure line, measurements, third-party notice.

## Glossary

- **Site_Package**: The pnpm workspace package `@ghost-run/site` in `site/`.
- **Live_Section**: Section 3 of the Landing_Page, the element `section#run`.
- **Mockup_V5**: The file `docs/design/live-walkthrough-mockup.html`, the approved visual reference of the Live_Section.
- **Brief_V5**: The file `docs/design/live-walkthrough-brief.md`.
- **Live_Adapter**: A module in `site/src/live/` that calls the engines of one world and returns a Live_Answer.
- **Live_Engine**: The object a Live_Adapter factory returns: `run(input)`, `warm()`, and `dispose()`.
- **Live_Answer**: The result of `run`: a Live_Run, an unsupported-input answer, a rejected-input answer, or a failure.
- **Live_Run**: The data of one live execution of one plan: the ward, the reality scene, and one Plan_Record.
- **Plan_Record**: The existing record shape of `site/src/data/types.ts` (`PlanRecord`): commands, display text, verdict, violated ward ids, check rows, effectsOutside, fingerprints, the copy after the run, facts, and message.
- **Recorded_Run**: A Plan_Record in `site/src/data/runs.json`.
- **Light_Engine**: The lazy chunk that holds the Shell and Cloud adapters and the code they need (core, wards-config, the two world packages).
- **Hand_Engine**: The page-side Hand engine (`hand-proxy.ts`, created by `engine-hand.ts`): the small lazy chunk `assets/engine-hand-*.js` that starts the Hand_Worker and forwards runs to it. It holds no MuJoCo, world, or app code.
- **Hand_Worker**: The dedicated module worker `site/src/live/hand-worker.ts`, emitted as `assets/hand-worker-*.js`. It holds the MuJoCo glue, the Ghost Hand world, the pipeline, the capabilities probe, and the executor that starts the app's simulation workers. The whole live Hand run happens inside it.
- **Hand_Protocol**: The module `site/src/live/hand-protocol.ts`: the message types between the page and the Hand_Worker and the constants `HAND_TIMEOUT_MS = 30000` and `HAND_GUARD_MS = 2000`. It imports no MuJoCo, world, or app code.
- **Bundled_Packages_List**: The file `site/build/bundled-packages.json` (format `ghost-site-bundled-packages`) that the landing build writes: name, version, license, and repo-relative directory of every third-party package in the page bundle and in every Engine_Bundle.
- **Near**: The state in which the Live_Section is within 200 px of the viewport, as an IntersectionObserver with that root margin reports.
- **Seen**: The state in which at least 25 percent of the Live_Section has been in view (the existing `useInView` rule).
- **Preset**: One of the three "Try:" plans of a world (Requirement 8).
- **Fixed_Plan**: The plan that the page runs live after a blocked Preset that has a known fix (Requirement 8, criterion 3).
- **Visitor_Input**: Text typed into the plan field, or the three slider values, that is not an unchanged Preset.
- **Outcome**: One of `block-fixed`, `block-open`, `pass`, `warn`, `unsupported`, as defined in Requirement 7.
- **Control_Card**: The element `.ctl` with the world tabs, the Replay button, the plan field or sliders, the Run button, and the presets row.
- **Stepper**: The slim five-dot list `ol#rail` with the class `stepper`.
- **Speech_Bar**: The element `.say` with the polite live region `#sayt` and the small step label.
- **Live_Badge**: The element `.live` in the section head.
- **Theater**, **Reality_Pane**, **Copy_Pane**, **Actor**, **Narration_Region**: As in the `site` spec glossary; the Narration_Region is `#sayt`.
- **Reduced_Motion**: The state in which `matchMedia('(prefers-reduced-motion: reduce)')` matches.
- **Site_Check**: The script and test that read `site/dist/` after the build (site spec, Requirement 20).
- **Engine_Bundle**: A JavaScript file of the Landing_Page build that belongs to a Live_Engine: the Light_Engine chunk, the Hand_Engine chunk, the Hand_Worker, the Hand simulation worker, and the Shell SQL worker.
- **Entry_Bundle**: The main JavaScript file that `index.html` loads (`assets/index-*.js`).
- **Short_Run**: The test run on file save: 100 generated examples per property, finishing within 60 s.

## Requirements

### Requirement 1: Scope, Placement, and Dependency Direction

**User Story:** As a maintainer, I want the live code in one folder with one clear import rule, so that the page stays a view of data everywhere except the places that run engines.

#### Acceptance Criteria

1. THIS spec SHALL change section 3 of the Landing_Page, the files that build it, and the checks and headers listed in Requirements 13 to 15. Every other section SHALL render as before, and its tests SHALL pass unchanged.
2. THE Site_Package SHALL hold all code that imports an engine in the folder `site/src/live/`. No other folder of `site/src/` SHALL import `@ghost-run/*`, `sql.js`, `@mujoco/mujoco`, or a file of `apps/`, `worlds/`, `core/`, or `ui/`.
3. THE work of this spec SHALL NOT change a file of `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, or `ghost-runner/`. IF a change there is unavoidable, THEN THE task SHALL stop and report it, and SHALL NOT make the change.
4. THE tasks.md of this spec SHALL contain a task that updates `.kiro/steering/structure.md` so that the `site/` entry says: `site/src/live/` may import `core/`, `wards-config/`, `worlds/*` through their public entry points, and by relative path the pipeline modules, the plan parsers, the executor modules, and the worker entry files of `apps/ghost-shell` and `apps/ghost-hand`; the rest of `site/src/` imports none of them; no package may depend on `site/`. THIS requirements phase edits no steering file. THE task SHALL be completed before the first Live_Adapter imports an engine.
5. THE ESLint configuration of the Site_Package SHALL keep the page-runtime import ban for `site/src/**` and SHALL add one block for `site/src/live/**` that allows exactly the imports of the design's dependency table and bans `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `eval`, `new Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, and the storage globals, as the rest of `src/` does. A fixture lint test SHALL show that an import of `@ghost-run/core` from `site/src/components/` fails and from `site/src/live/` passes.
6. THE Site_Package SHALL add no third-party dependency that the repository does not already use. THE README dependency table SHALL list, with name, version, and license read from the installed `package.json` files on the day of the task, every library that now ships inside the Landing_Page build and that the table does not list for the site yet (at least `sql.js`, `@mujoco/mujoco`, and `yaml`).
7. THE Site_Package SHALL make no network call and no LLM call in its scripts, tests, or source, and the spec's tasks SHALL use no Kiro Crew tool.

### Requirement 2: Fidelity to the V5 Mockup

**User Story:** As the owner, I want section 3 to look and move like the approved v5 mockup, so that nothing I approved is lost in the port.

#### Acceptance Criteria

1. THE Live_Section SHALL reproduce, from Mockup_V5, these items without a change of value: markup, class names, ids, layout, sizes, spacing, radii, borders, shadows, colors, font sizes and weights, copy, SVG paths, keyframes, durations, delays, and easing.
2. THE Site_Package SHALL carry the CSS of Mockup_V5 from the rule `.live` through the last rule before the `@media (prefers-reduced-motion:reduce)` block, and the two media blocks, in its stylesheets, replacing the section-3 rules of `05-walkthrough.css`, `06-pane-content.css`, `07-judge.css`, and `08-actor-say.css` of the `site` spec. THE rules of Mockup_V5 for `.doc`, `.guide`, `.nav`, `.logo`, `.nav-links`, `.sec`, `.sec-head`, `.nbadge`, and `.sec-sub` are the page's existing rules and SHALL NOT be copied a second time.
3. THE markup of the Live_Section SHALL follow Mockup_V5: the section head with the number badge, the heading, and the Live_Badge; the single `.sec-sub` sub-heading "Give the ghost a plan. It tries it on a copy first, and only a lit candle lets reality change." with no other line under it (no `#sealnote`); the Control_Card; the Stepper; the Theater with `.panes`, `.judge`, the Actor, and the terminal bubble; and the Speech_Bar.
4. THE page SHALL apply only these changes to Mockup_V5, and no others: (a) the mockup's inline script becomes React components and the walkthrough engine; (b) data comes from a Live_Run or a Recorded_Run; (c) the accessibility, Reduced_Motion, and hygiene rules of Requirements 16 and 17; (d) the bubble fix of criterion 6; (e) the additions of criterion 7.
5. THE walkthrough SHALL use the step durations `DUR = [2700, 3900, 3300, 2700, 5200]` ms and the inner delays of the `site` spec (Requirement 11, criterion 4), with the same values as Mockup_V5.
6. THE terminal bubble of the Run step and of the Fix-and-go step SHALL stay inside the Theater: for every Actor position the top edge of the bubble SHALL be at or below the top edge of the Theater, so that the bubble never covers the Stepper (Brief_V5, section 1). A test SHALL check the placement function with fixed rectangles.
7. THE additions to Mockup_V5 are these, and each SHALL be listed in `docs/measurements.md`: (a) the warn look (an amber stamp "ASK A HUMAN" and a flickering candle, Requirement 7, criterion 5); (b) the `Recorded run` form of the Live_Badge (Requirement 10, criterion 4); (c) the Shell pane rows for the entries `build/` and `README.md` and the tag `new` on any created entry; (d) a small tag on a Cloud bucket whose ACL or public-access block changed; (e) the `joint limit` label of a Hand tile (site spec, Requirement 11, criterion 9); (f) the disabled look of the Stepper steps that a stopped run cannot reach.
8. THE test of the structural classes (site spec, Requirement 2, criterion 7) SHALL change as follows: `rail` and `wchip` are removed from its list; `ctl`, `tabs`, `tab`, `stepper`, `planbox`, `presets`, `judge`, and `live` are added. THE test SHALL fail when one of the listed classes is missing from the rendered page.
9. THE owner's agent SHALL compare the built Live_Section with Mockup_V5 at widths of 920 px and 1280 px for each world at each of the five steps, and SHALL record the result and the differences of criterion 7 in `docs/measurements.md`. This comparison is not a Kiro task and not an automated test.

### Requirement 3: Control Card and Plan Input

**User Story:** As a visitor, I want one card where I pick a world, see or change the agent's plan, and run it, so that I know what the ghost is about to try.

#### Acceptance Criteria

1. THE Control_Card SHALL show, in this order: the three world tabs (a `role="tablist"` with the accessible name "World", buttons with `role="tab"` and `aria-selected`, the text "Ghost Shell", "Ghost Hand", "Ghost Cloud" and a pumpkin icon); the button "↻ Replay" at the top right; the label "Agent's plan" with the tag "fixed by the agent" (shown only while the plan field holds a Fixed_Plan); the plan box; and the presets row.
2. FOR Ghost Shell and Ghost Cloud THE plan box SHALL hold the prompt `$`, a text input with the accessible name "Agent's plan", `spellcheck` off, and the button "▶ Run ghost". FOR Ghost Hand THE plan box SHALL hold three range inputs in this order and with these labels, minimum, maximum, and step: "Pull speed" 0.05 to 0.6 step 0.05 shown as `0.00 m/s`; "Grip force" 2 to 40 step 1 shown as `0 N`; "Pull distance" 0.02 to 0.25 step 0.01 shown as `0.00 m`; and the button "▶ Run 8 ghosts". THE minimum and maximum SHALL equal `WORLD_CONFIG.actionRanges` of `worlds/drawer-arm/src/world-config.ts` (speed 0.05 to 0.6, force 2 to 40, distance 0.02 to 0.25), and a test SHALL compare them with that file.
3. THE text input SHALL have `maxlength` equal to the input limit of Requirement 9, criterion 1, and SHALL run the plan on the key Enter as well as on the Run button.
4. THE presets row SHALL read "Try:" followed by the three Presets of the chosen world as buttons. THE Preset whose input equals the current plan SHALL carry the class `on`. THE row SHALL show no Preset as `on` while the plan field holds Visitor_Input.
5. WHEN the visitor presses a world tab, THE page SHALL set `aria-selected` on that tab only, show that world's first Preset in the plan box, and run it live (Requirement 8, criterion 5).
6. WHEN the visitor presses a Preset, THE page SHALL fill the plan box with it and run it live. WHEN the visitor presses "Run ghost" or "Run 8 ghosts", THE page SHALL run the current plan live. WHEN the visitor presses "Replay", THE page SHALL replay the current result from step 1 without running the engine again.
7. WHILE a live run is in progress, THE Run button SHALL be disabled and carry `aria-busy="true"`, and the presets and tabs SHALL stay usable (Requirement 10, criterion 6).
8. THE plan box SHALL show the Fixed_Plan text (or the fixed slider values) in step 5 with the border color `--slime` and the tag "fixed by the agent". WHEN the visitor presses a tab, a Preset, Replay, a Stepper step, or Run, THE plan box SHALL show the Fixed_Plan again when the run has one, and otherwise the plan of the run. ANY edit of the plan box SHALL clear the tag and the Fixed_Plan text or slider values, and the box SHALL show what the visitor typed or set.
9. EVERY control of the Control_Card SHALL be reachable with the Tab key and SHALL show the visible focus ring of the page.
10. THE plan input of Ghost Shell and Ghost Cloud SHALL be read-only only while a run is animating, SHALL become editable on a click or focus at any time, and SHALL be editable whenever no run is animating, including after "Fix and go". THE three Ghost Hand sliders SHALL never be disabled. WHEN the visitor types or moves a slider while a run is animating or while a run waits for its engine, THE page SHALL cancel that run: stop its timers, drop its late answer, clear the busy state and the loading note, and show the displayed record at its reset state. Tests SHALL cover: a finished "Fix and go" leaves the input editable; typing during the animation cancels it; typing while the engine call is pending cancels it.

### Requirement 4: Stepper and Speech Bar

**User Story:** As a visitor, I want a slim progress line and one speech bar, so that I can follow the run and jump to any step.

#### Acceptance Criteria

1. THE Stepper SHALL be an ordered list of five buttons with the numbers 1 to 5 and the labels "Copy", "Run", "Judge", "Verdict", and "Fix & go". THE current step SHALL carry the class `now` and `aria-current="step"`, and every earlier step SHALL carry the class `done` (a green check).
2. WHEN the visitor presses a step button, THE page SHALL reset the Theater, apply the steps before it instantly, and play the chosen step at normal speed, as in the `site` spec (Requirement 11, criterion 7). A step that the current Outcome cannot reach (Requirement 7, criterion 7) SHALL be disabled and SHALL carry `aria-disabled="true"`.
3. THE Speech_Bar SHALL show a small label above the speech: "STEP 1 · Copy · snapshot()", "STEP 2 · Run · step()", "STEP 3 · Judge · diff() and effectsOutside()", "STEP 4 · Verdict · render() and fingerprint()", and "STEP 5 · Fix and go". THE label SHALL be inside the Narration_Region, so that the region carries label and speech together.
4. THE Narration_Region (`#sayt`) SHALL be an element with `aria-live="polite"` that is present in the DOM before the first step starts, and SHALL change once per step, when the step starts (site spec, Requirement 15, criterion 4). THE typed terminal characters SHALL NOT be written into it.
5. THE narration of each step SHALL be built from the Live_Run or Recorded_Run that the page shows (Requirement 7, criterion 8).

### Requirement 5: Live Engines per World

**User Story:** As a visitor, I want the ghost to use the real engines, so that what I see is what the apps would do.

#### Acceptance Criteria

1. THE Ghost Shell adapter SHALL call `runPlayground` of `apps/ghost-shell/src/pipeline/run-playground.ts` with the fixture of `buildProject` of `apps/ghost-shell/src/scenarios/project.ts` (the project `playground-demo`), the wards of `apps/ghost-shell/wards.yaml` parsed by `parseWards`, and a SQL executor that runs sql.js in a Web Worker under the 5 s watchdog (`createWatchdogExecutor` with the app's `createWorkerRunner`). It SHALL NOT run sql.js on the main thread (Open question O2 of the design).
2. THE Ghost Shell adapter SHALL accept the commands that the world implements: `pwd`, `ls`, `cat`, `echo`, `mkdir`, `touch`, `rm`, `mv`, `cp`, `find`, `sqlite3`, `npm`, `curl`, `true`, and `false`. THE list shown to the visitor SHALL be read from the handler table of the world package or from a constant that a test compares with that table, and SHALL NOT be typed twice.
3. THE Ghost Hand adapter SHALL, inside the Hand_Worker, call `runGhostHand` of `apps/ghost-hand/src/pipeline/run.ts` with the reference world of `createGhostHandWorld`, the executor selection of `apps/ghost-hand/src/exec/select.ts` with a pool of the app's simulation worker, the wards of `worlds/drawer-arm/wards.yaml`, the variant configuration of `worlds/drawer-arm/variant-config.json`, the seed 42, and 8 variants.
4. THE Ghost Hand adapter SHALL build the plan of the three sliders as five actions: the two reach actions and the release action are those of `apps/ghost-hand/plans/first.plan.json`, the grasp action takes the grip force, and the pull action takes the pull distance and the pull speed. THE adapter SHALL read the fixed actions from that plan file, SHALL round the slider values to the step of their range (speed and distance to two decimals, force to an integer) before it builds the actions, and SHALL pass each action through the app's plan validator `validateAction`. THE sliders (0.6, 20, 0.2) SHALL give exactly the actions of `first.plan.json`, and the sliders (0.15, 15, 0.15) SHALL give exactly the actions of `revised.plan.json`.
5. THE Ghost Cloud adapter SHALL call `runGhostCloudPlan` of `worlds/ghost-cloud/src/pipeline/run-plan.ts` with one line, its fixture, and the wards of `worlds/ghost-cloud/wards.yaml`. THE commands shown to the visitor SHALL be: `aws s3 ls`, `mb`, `rb`, `cp`, and `rm`, and `aws s3api put-bucket-acl`, `put-public-access-block`, and `delete-public-access-block`. THE list SHALL be read from or compared with the parser of the world package.
6. EVERY live run SHALL run in memory in the visitor's browser. Nothing SHALL touch the visitor's machine. `curl` in Ghost Shell SHALL be observed by the world and not sent. Ghost Cloud SHALL never call AWS. No network request SHALL leave the page (Requirement 13).
7. EACH live run SHALL use a fresh world built from its fixture. THE adapters SHALL keep no state between runs except the loaded engine code, the parsed wards, and the SQL worker.
8. THE adapters SHALL call the engines through an injected set of services (the SQL executor, the world factory, the executor factory), so that tests in Node run the same adapter code with in-process services. THE code that creates a Worker SHALL be in the wiring modules of the lazy chunks only (design, Component 6).
9. THE Light_Engine and the Hand_Engine SHALL expose `run`, `warm`, and `dispose`. `dispose` SHALL terminate every worker (for the Hand_Engine, the Hand_Worker, which ends the simulation workers it started) and release every MuJoCo object of the engine (the technology steering rule to call `.delete()` on wrapped C++ objects is met by the world's `dispose`), and SHALL be called when a Hand run ends, when the run fails, and when the page unmounts.
10. THE whole live Hand run (world creation, `runGhostHand`, and the fingerprints before and after) SHALL run inside the Hand_Worker, a dedicated module worker that the site creates from `site/src/live/hand-worker.ts` with `new Worker(new URL('./hand-worker.ts', import.meta.url), { type: 'module' })` in `engine-hand.ts`. The reason is that MuJoCo's embind glue builds functions from strings and throws `EvalError` on the main thread under the page policy. THE worker script is served from `assets/`, which carries no page policy, and THE page SHALL NOT add `'unsafe-eval'` to its policy (Requirement 14, criterion 6). THE page SHALL post the three slider values to the worker and SHALL receive a `LiveAnswer` as plain data that is safe for structured clone. THE page-side proxy (`hand-proxy.ts`) SHALL be the `LiveEngine` that forwards runs, and the message types and constants SHALL live in `hand-protocol.ts` (`HAND_TIMEOUT_MS = 30000`, `HAND_GUARD_MS = 2000`). `apps/`, `worlds/`, `core/`, and `ui/` SHALL stay unchanged.
11. THE Hand adapter SHALL keep its own 30 s timeout inside the Hand_Worker. THE proxy SHALL add a guard at `HAND_TIMEOUT_MS` plus `HAND_GUARD_MS` (32 s) that stops the Hand_Worker and answers `failed` with cause `timeout`. AFTER a worker error or a timeout, THE proxy SHALL start a fresh Hand_Worker for the next run. A worker error before any answer SHALL give the cause `load`, and after an answer the cause `run`.

### Requirement 6: Lazy Loading

**User Story:** As a visitor on a slow connection, I want the page to paint fast and to fetch the heavy engines only when I need them, so that the landing page stays light.

#### Acceptance Criteria

1. THE first paint of the Landing_Page SHALL NOT depend on any Engine_Bundle or wasm file. `index.html` SHALL NOT reference an Engine_Bundle or a wasm file, and the Entry_Bundle SHALL reference them only through dynamic `import()` and `new URL()` forms (Requirement 15, criterion 3).
2. WHEN the Live_Section first becomes Near, THE page SHALL load the Light_Engine, SHALL create the Shell SQL worker, and SHALL call `warm()` so that the sql.js wasm (about 0.7 MB) is fetched and compiled before the section is Seen. WHILE the section has never been Near, THE page SHALL load no Engine_Bundle, SHALL create no Worker, and SHALL fetch no wasm file.
3. THE Hand_Engine (the engine-hand chunk, the Hand_Worker with the MuJoCo glue and the MuJoCo wasm of about 11 MB, and the simulation worker) SHALL load only when the visitor first picks Ghost Hand (the tab, or a Run or Preset action while the Ghost Hand tab is shown). THE Hand_Worker SHALL start when the Hand_Engine is created, which happens at that first pick. Becoming Near, becoming Seen, picking another world, and moving a slider SHALL NOT load it.
4. THE Ghost Cloud adapter SHALL load with the Light_Engine and SHALL need no extra fetch.
5. WHILE the Hand_Engine loads, and while a Hand run is in progress, THE Speech_Bar SHALL say that the ghost is working, in the ghost's voice ("Summoning eight ghost arms…"), with the step label "STEP 1 · Copy · snapshot()".
6. IF IntersectionObserver is missing, THEN THE page SHALL load no engine by itself, SHALL show the recorded final state of the first Preset with the Live_Badge "Recorded run", and SHALL load the engine of a world on the first Run, Preset, or tab action.
7. THE Hand_Engine files SHALL be served from the paths of the Landing_Page build: the chunk, the Hand_Worker, the simulation worker, and the wasm file in `assets/` next to the Entry_Bundle, resolved relative to the chunk (`base: './'`), so that the site works at a domain root and under a path prefix.
8. THE Entry_Bundle SHALL stay within the budget of the design (Requirement 15, criterion 4).

### Requirement 7: From a Live Run to the Five Steps

**User Story:** As a visitor, I want the five steps to show what the run really did, so that the candle means something.

#### Acceptance Criteria

1. THE page SHALL turn a Live_Run into one walk record of the engine of the `site` spec and SHALL fold its events with the same functions for playing, jumping, and settling. THE live path SHALL NOT have a second implementation of the step logic.
2. Step 1 (Copy) SHALL show the copy of the world's reality scene (the live copy). Step 2 (Run) SHALL type the plan text into the terminal bubble, then show the live after-state in the Copy_Pane: Shell rows vanish and files disappear or appear; Hand tiles turn ✓ or ✗ from the live variant results, and the tile of a variant that reports a joint-limit exceedance carries the label "joint limit"; Cloud buckets vanish and deleted objects are removed from the object list of their bucket (the copy state keeps the object keys per bucket, and a `bucketObjects` event sets them). Step 3 (Judge) SHALL show one check chip per check of the Live_Run, with the ward engine's reasons and numbers, and the effectsOutside chip. Step 4 (Verdict) SHALL show the stamp and the candle of the live verdict. Step 5 (Fix and go) SHALL follow criterion 6.
3. THE check chips SHALL be: the rows of the world's headline ward (Shell `no-data-loss`, Hand `gentle-hands` with its three rows, Cloud `no-bucket-delete`), and one extra chip for EVERY other ward of the world's wards file that the live verdict reports as violated, in ward id order, whose text is the reason of the engine's violation (Shell: `protect-data`, `no-secret-egress`). THE ✓ or ✗ of a chip SHALL come from the live ward verdict: ✗ exactly when that ward has a violation in this run, and the measured text SHALL describe the real violation. THE ward card tone (`bad` or `good`) SHALL follow the live verdict: `bad` when any ward has a violation or any chip is ✗. A ward card with several wards SHALL name the violated ward ids; with none violated it SHALL name the headline ward.
4. THE Outcome of a Live_Run SHALL be: `unsupported` when the adapter reports unsupported or rejected input; `pass` when the verdict is `pass`; `warn` when it is `warn`; `block-fixed` when it is `block` and the Preset has a Fixed_Plan whose live run returned; `block-open` when it is `block` and no Fixed_Plan exists, which includes every Visitor_Input. THE Outcome SHALL be computed by one pure function.
5. THE stamp SHALL read "BLOCKED" (candle out) for `block`, "PASS" (candle lit) for `pass`, and "ASK A HUMAN" (amber stamp, flickering candle) for `warn`. THE fingerprint badge "fingerprint ✓ untouched" SHALL show in step 4 only when the live fingerprint before the run equals the live fingerprint after. THE go badge ("real run allowed ✓", "real arm may move ✓", "allowed ✓") SHALL show in step 5 only when the final live verdict is `pass` and the fingerprints are equal. THE fingerprint badge and the go badge SHALL never show together.
6. Step 5 SHALL depend on the Outcome. `block-fixed`: the Fixed_Plan runs live too (the plan box shows it with "fixed by the agent", the copy is re-made, the terminal types it, the copy changes, the checks of the Fixed_Plan appear), and the final stamp, candle, and badge come from the Fixed_Plan's live verdict. `block-open`: the step reads "Edit the plan and run again", changes no Theater item, and fabricates no fix. `pass`: the step shows PASS and the go badge, and fixes nothing. `warn`: the step says that a human must approve, shows no go badge, and fixes nothing. THE page SHALL never show a fixed plan that no live or recorded run produced.
7. WHEN the Outcome is `unsupported`, THE run SHALL stop at step 1. THE ghost SHALL explain in the Speech_Bar why the input was not run and SHALL list the commands it knows (Requirement 9, criterion 5). THE Stepper steps 2 to 5 SHALL be disabled and no event of those steps SHALL fire.
8. THE narration SHALL come from templates per world, step, and Outcome, filled with the numbers of the run (counts with a thousands separator, forces with one decimal, rates as "7 of 8 = 88%") and the engine's reasons. THE tone of Mockup_V5 SHALL be kept ("I run the plan on my copy… poof! 1,206 users are gone, but only in the copy."). A template SHALL be chosen only when the facts it names exist in the run, and the narration SHALL claim nothing that the run did not show.
9. THE verdict card SHALL hold the candle and the stamp only (with the badges of criterion 5). THE page SHALL NOT render a sentence next to the stamp (no `#vnote`): Mockup_V5 has none, and the Speech_Bar narration says it. THE texts "The candle waits for the wards.", "Trying the fixed plan on a fresh copy…", the block, pass, and warn notes, and "Nothing runs for real until a human says yes." are therefore not rendered; the engine's internal note state MAY stay and SHALL NOT be rendered. THE Cloud sentence "Ghost Cloud has no real mode yet." SHALL be in the narration at step 4 when the Cloud candle stays lit and at step 5 for a passing Cloud run.
10. A run whose live fingerprints differ (`p1.equal` false) SHALL show the verdict `block` as the pipeline returns it, SHALL show no fingerprint badge and no go badge, and SHALL say in the narration that the isolation check failed.
11. THE Ghost Cloud chip "never delete prod-*" SHALL read: "prod-assets deleted" with ✗ when a protected bucket is deleted; "2 objects deleted in prod-logs" with ✗ when objects are removed from a protected bucket that stays (for example `aws s3 rm s3://prod-logs --recursive`, blocked by `no-bucket-delete`); "2 objects deleted in tmp-build-cache, none in prod-*" with ✓ when objects are removed outside `prod-*`; and "no bucket deleted" with ✓ when nothing is removed. THE counts and names SHALL come from the run. THE Cloud run record SHALL gain the facts `objectsDeleted` and `objectsDeletedIn` only when a run empties a bucket that stays, and THE Run narration SHALL then say that those objects are gone in the copy.
12. THE Ghost Shell headline chip "rows lost, at most 0" SHALL be ✗ exactly when `no-data-loss` is violated. THE three `gentle-hands` rows (success rate, contact force, forbidden contact) SHALL be ✗ exactly when the verdict has a violation of their kind (by the reasons of `core/src/wards.ts`). A joint-limit or self-collision violation, which none of the three rows stands for, SHALL add a fourth chip labelled `gentle-hands` with the text "joint limit exceeded in N of 8 variants" or "self-collision in a variant". Tests SHALL cover every subset of the four Hand violation kinds, the Shell and Cloud cases above with the real worlds, and the tone event of step 3.
13. WITHOUT a fix (Outcomes `block-open`, `pass`, and `warn`), step 5 SHALL keep the copy in the plan's after-state: no re-copy, and the Copy_Pane content at the end of step 5 SHALL equal its content at the end of step 4. ONLY a real second pass (`block-fixed`) SHALL re-copy the copy. A DOM test through the whole Walkthrough, with the real Cloud world and a typed `aws s3 rm s3://prod-logs --recursive`, SHALL assert both.

### Requirement 8: Presets, Fixed Plans, and Autoplay

**User Story:** As a visitor, I want three example plans per world and a fix when there is a known one, so that I can see a block, a pass, and a repair in one click each.

#### Acceptance Criteria

1. THE Presets SHALL be these, in this order:

| World | Label | Input |
|---|---|---|
| Shell | `DROP TABLE users` | `sqlite3 app.db "DROP TABLE users;"` |
| Shell | `rm -rf ./data ./build` | `rm -rf ./data ./build` |
| Shell | `npm test` | `npm test` |
| Hand | `fast pull` | speed 0.6, force 20, distance 0.2 |
| Hand | `slow pull, gentle grip` | speed 0.15, force 15, distance 0.15 |
| Hand | `strong grip` | speed 0.3, force 38, distance 0.2 |
| Cloud | `delete prod-assets` | `aws s3 rb s3://prod-assets --force` |
| Cloud | `make it public` | `aws s3api put-bucket-acl --bucket prod-assets --acl public-read` |
| Cloud | `delete tmp-build-cache` | `aws s3 rb s3://tmp-build-cache --force` |

2. THE input of a Preset that equals a plan file or a demo file of the repository SHALL be read from that file, and a test SHALL compare it: Shell `DROP TABLE users` with `apps/ghost-shell/plans/scenario-1.json`; Shell `rm -rf ./data ./build` with `scenario-2.json`; Shell `npm test` with `scenario-4.json`; Hand `fast pull` with `apps/ghost-hand/plans/first.plan.json`; Hand `slow pull, gentle grip` with `revised.plan.json`; Cloud `delete prod-assets` with `worlds/ghost-cloud/demo/01-delete-protected-bucket.txt`; Cloud `delete tmp-build-cache` with `03-delete-temporary-bucket.txt`. THE Presets Hand `strong grip` and Cloud `make it public` have no such file and are the Presets of Brief_V5.
3. THE Fixed_Plans SHALL be: for Shell `DROP TABLE users`, `apps/ghost-shell/plans/scenario-1-fixed.json`; for Shell `rm -rf ./data ./build`, `apps/ghost-shell/plans/scenario-2-fixed.json`; for Hand `fast pull`, `apps/ghost-hand/plans/revised.plan.json`; for Cloud `delete prod-assets`, the plan `aws s3 rb s3://tmp-build-cache --force` of demo file 03. THE page SHALL read each Fixed_Plan from its file. No other Preset has a Fixed_Plan, and the page SHALL NOT make one up.
4. THE page SHALL treat a Preset as known only while the plan box holds exactly the Preset's input. WHEN the visitor edits the text or moves a slider, THE plan SHALL become Visitor_Input, SHALL have no Fixed_Plan, SHALL cancel a run in progress (Requirement 3, criterion 10), and SHALL run live when the visitor presses Run.
5. WHEN the Live_Section is first Seen and Reduced_Motion is not set, THE page SHALL run the first Preset of Ghost Shell. WHEN the visitor picks Ghost Hand or Ghost Cloud, THE page SHALL run the first Preset of that world. THE page SHALL NOT run a plan that the visitor did not trigger and that is not one of these first Presets.
6. THE Hand sliders SHALL start at the values of the first Hand Preset. THE page SHALL show the slider values with the units of Requirement 3, criterion 2.

### Requirement 9: Visitor Input, Limits, and Unsupported Input

**User Story:** As a visitor, I want to type anything without breaking the page, so that I can poke at the ghost safely.

#### Acceptance Criteria

1. THE text of Visitor_Input for Ghost Shell and Ghost Cloud SHALL be limited to 256 code points. THE page SHALL reject an empty text, a text of more than 256 code points, and a text that holds a control code point (U+0000 to U+001F, U+007F to U+009F) or a hidden display code point (the ranges of `isHiddenDisplay` of `@ghost-run/ui`), and SHALL NOT call an engine for a rejected text.
2. THE text that reaches an engine SHALL be the visitor's text unchanged apart from the removal of leading and trailing space characters. THE slider values that reach the Ghost Hand adapter SHALL be finite numbers clamped to the ranges of Requirement 3, criterion 2 and rounded as in Requirement 5, criterion 4.
3. THE page SHALL show Visitor_Input only as text: in the plan input, in the terminal bubble, and inside `code` segments of the narration. THE page SHALL NOT build an element, an attribute, a style, or a URL from Visitor_Input. A rejected text SHALL be echoed in the Speech_Bar only after `escapeForDisplay` of `@ghost-run/ui` replaced every control and hidden code point by its `<U+XXXX>` notation, and shortened to 80 code points.
4. IF an engine reports a parse rejection, an unsupported command, or an unsupported step (Shell `unsupportedSteps` or a step with an `unsupportedReason`; Cloud `unsupportedSteps` or a line with kind `unsupported`; Hand `GhostHandRunError`), THEN THE adapter SHALL return an unsupported-input answer that carries the engine's fixed reason text and no part of the input, and THE page SHALL follow Requirement 7, criterion 7.
5. THE ghost's explanation of unsupported input SHALL hold: that the ghost does not know this plan; the reason text; the list of the commands of the chosen world (Requirement 5, criterion 2 or 5); and, for Ghost Hand, the slider ranges. The text SHALL come from fixed templates.
6. THE page SHALL never throw because of Visitor_Input: an exception from an adapter SHALL become the failure answer of Requirement 10.
7. THE engines SHALL receive input only through the adapters. No component SHALL call `runPlayground`, `runGhostHand`, or `runGhostCloudPlan`.

### Requirement 10: Failure, Fallback, and the Live Badge

**User Story:** As a visitor whose browser cannot run an engine, I want the page to keep working and to tell me what it shows, so that nothing is faked.

#### Acceptance Criteria

1. IF a Live_Engine fails to load (the dynamic import rejects, a worker cannot start, the wasm fails to compile, or a policy blocks it), or IF a live run throws, or IF a Hand run exceeds 30 s, or IF `runGhostCloudPlan` returns its internal-error run, THEN THE page SHALL not crash, SHALL dispose the engine, and SHALL follow criteria 2 and 3.
2. WHEN the failed run was an unchanged Preset (or the unchanged Fixed_Plan of a Preset), THE page SHALL play the Recorded_Run of that Preset from `runs.json` and SHALL show the Live_Badge "Recorded run". THE Speech_Bar SHALL say once, in the ghost's voice, that the live engine did not start and that this is the recorded run.
3. WHEN the failed run was Visitor_Input, THE page SHALL not play any run, SHALL say in the Speech_Bar that the live engine is not available here and that the example plans still show recorded runs, and SHALL keep the plan box as the visitor left it.
4. THE Live_Badge SHALL read "Live in your browser" only while the displayed run is a Live_Run that really ran in this page, and "Recorded run" while the displayed run is a Recorded_Run. BEFORE any run is displayed THE Live_Badge SHALL be hidden. THE two forms SHALL be distinguishable by text and not by color alone.
5. A failed load of the Hand_Engine SHALL NOT affect the Light_Engine, and SHALL be retried on the next Ghost Hand action (a failed dynamic import is not kept).
6. WHEN a newer run starts while an older one is in progress, THE older result SHALL be discarded: no event, state, narration, or badge of a superseded run SHALL reach the page. THE page SHALL run at most one engine call at a time per engine.
7. THE page SHALL set no timer that outlives the Live_Section: unmount SHALL cancel every timer, dispose every engine, and remove every listener.
8. WHILE Reduced_Motion is set, THE page SHALL show the recorded final state of the first Ghost Shell Preset at load with the Live_Badge "Recorded run", SHALL run the Preset live once the section is Near (and the engine is loaded), and SHALL then show the live final state without animation and the Live_Badge "Live in your browser".
9. FOR every failed live run and every failed engine load, in all three worlds, THE controller SHALL log exactly one `console.warn` that names the world and the cause (`load`, `run`, `timeout`, or `internal`) with a short detail, and SHALL keep the recorded fallback of criteria 2 and 3. THE `LiveAnswer` with `status: 'failed'` SHALL carry an optional plain-text `detail` that is for the console only and SHALL NOT be shown on the page. A live-engine failure SHALL NOT be silent.

### Requirement 11: Recorded Data, Shared Derivation, and Parity

**User Story:** As a maintainer, I want the recording and the live adapters to share their derivation code and to be checked against each other, so that the fallback is the same page as the live one.

#### Acceptance Criteria

1. THE derivation of the Plan_Record from an engine's result (check rows, copy scene after the run, facts, effectsOutside destinations) SHALL be one set of pure functions in `site/src/live/`, used by the live adapters and by `site/scripts/record-runs.measure.ts`. THE measure file SHALL NOT keep a second copy of that derivation.
2. THE Runs_File SHALL become version 2. IT SHALL hold, for each world: the ward, the reality scene, and a list of Preset records in the order of Requirement 8, criterion 1; each Preset record SHALL hold the Preset id, its Plan_Record, and, when the Preset has a Fixed_Plan, the Plan_Record of the Fixed_Plan. THE Plan_Record for Ghost Hand SHALL hold the typed text of the terminal (`pull 0.60 m/s, grip 20 N, 0.20 m, ×8 ghosts`) as its display text.
3. THE Record_Script SHALL run every Preset and every Fixed_Plan through the same adapters with in-process services, SHALL keep its rules of the `site` spec (Requirement 10, criteria 6 to 10: unexpected verdicts and unequal fingerprints exit non-zero and write nothing, deterministic bytes, no network, `--out` and `--check`), and SHALL fail when a Preset that the spec names as blocking (`DROP TABLE users`, `rm -rf ./data ./build`, `fast pull`, `delete prod-assets`) does not block or a Fixed_Plan does not pass. THE Record_Script SHALL record the verdicts of the other Presets without an expected value.
4. (Property `live-equals-recorded`.) FOR EACH Preset and EACH Fixed_Plan, THE Plan_Record that a live adapter returns SHALL equal the Plan_Record in the committed Runs_File, field for field, when the adapter runs with in-process services in Node. THE Ghost Shell and Ghost Cloud parity tests SHALL run in the always-on suite. THE Ghost Hand parity test SHALL run in the env-gated `record` project and SHALL be recorded in `docs/measurements.md` with the reason.
5. WHEN a Preset has no entry in the committed Runs_File, THE parity test SHALL compare the live result with a fresh recording made by the Record_Script into a temporary location. THE committed file SHALL hold an entry for every Preset of Requirement 8, so that this case does not arise on the committed file; the rule applies to a Preset added later.
6. THE values of the `site` spec (Requirement 10, criterion 3) for the six recorded runs SHALL still hold in the new file: Ghost Shell `DROP TABLE users;` loses 1,206 rows (verdict block, ward `no-data-loss`), its fixed plan loses none (pass); Ghost Hand `fast pull` has 7 of 8 variants succeed with a maximum contact force of 27.53 N (block), `slow pull, gentle grip` has 8 of 8 with 29.24 N (pass); Ghost Cloud `prod-assets` is removed (block, ward `no-bucket-delete`) and `tmp-build-cache` is removed (pass). THE test SHALL read these values from a fresh run, not from the file it checks.
7. THE `RunsFile` type, the shape test, the reducer inputs, and the page components SHALL accept version 2 only. A file with another `format` or `version` SHALL fail the shape test.
8. THE tile label rule, the number formats, and the parts matrix of the `site` spec SHALL stay unchanged.

### Requirement 12: Reality Never Changes

**User Story:** As a maintainer, I want the page and the engines to obey the rule they teach, so that Reality does not change in any run.

#### Acceptance Criteria

1. (Property `reality-never-changes-live`, page form.) FOR ALL worlds, FOR ALL sequences of user actions (tab, Preset, Run, Replay, step button, slider and text edits) with any clock advance, THE serialized content of the Reality_Pane content element `#realb` SHALL equal its content right after the reset of the current world, apart from the badges `#fpb` and `#gob`. THE content SHALL be written from the reality scene of the displayed run only when a new run is displayed, never by a step.
2. (Property `reality-never-changes-live`, engine form.) FOR ALL generated Visitor_Input accepted by the Ghost Shell and Ghost Cloud adapters, FOR EACH run, THE live fingerprint of Reality before the ghost run SHALL equal the live fingerprint after (`p1.equal`), AND a world built fresh from the fixture after the sequence SHALL have the fingerprint of a world built fresh before it. THE Ghost Hand form SHALL be checked on the Presets and on a sample of slider values in the gated project.
3. THE reality scene of a run SHALL be drawn from the live world's snapshot before the run, and the Reality_Pane SHALL never show the after-state of a run.
4. THE Shell fixture file `.env` and its contents SHALL never be read into a scene, a record, a narration, or a test fixture of the page. THE Shell reality scene SHALL list no hidden entry and no entry that matches a secret pattern of the egress ward.

### Requirement 13: No Network Request Leaves the Page

**User Story:** As a visitor, I want to know that the ghost's run sends nothing anywhere, so that I can type freely.

#### Acceptance Criteria

1. (Property `no-request-leaves-the-page`.) WHILE all three worlds are exercised with every Preset, every Fixed_Plan, and generated Visitor_Input (including `curl` to a reserved host and `aws ... --endpoint-url`), THE page SHALL make no request except same-origin fetches of the asset files of the Landing_Page build (the engine chunks, the workers, and the wasm files). A test SHALL replace `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon` with recorders that accept a same-origin URL ending in `.js` or `.wasm` and throw for any other URL, and SHALL assert that no throw happened and that no request URL held a host other than the page's own.
2. THE source of `site/src/live/` SHALL contain no network API (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`). THE libraries that the engines bundle may fetch their own wasm files from the page's origin only.
3. THE Content-Security-Policy of `/` SHALL allow no origin but `'self'` (Requirement 14), so that a request to another origin is blocked by the browser as well.
4. THE page SHALL store nothing in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies (site spec, Requirement 14, criterion 5), and SHALL write no Visitor_Input to any storage or URL.
5. THE page SHALL tell the visitor that the run happens in the browser and sends nothing out only through the Live_Badge "Live in your browser" and the Copy_Pane head "sealed: nothing leaves". THE page SHALL NOT add a sentence for this (no `#sealnote`) and SHALL claim nothing more (for example, no claim about Docker or about a real mode).

### Requirement 14: Headers and Content Security Policy for the Landing Page

**User Story:** As the owner, I want the policy of `/` to allow exactly what the engines need and nothing else, so that the page stays sealed.

#### Acceptance Criteria

1. THE root Headers_File block for `/` and the block for `/index.html` SHALL carry the policy of the `site` spec (Requirement 19, criterion 4) with exactly three changes: `'wasm-unsafe-eval'` is added to `script-src`; `worker-src 'self'` is added; `connect-src 'none'` becomes `connect-src 'self'`. Every other directive and the two other headers SHALL stay as they are.
2. THE meta Content-Security-Policy of `index.html` SHALL carry the same policy without `frame-ancestors`. THE two policy strings SHALL come from one constant (a shared module read by the Vite config and by the headers builder), so that they cannot differ.
3. THE Site_Check SHALL keep its rules (no `http:`, `https:`, `*`, `unsafe-inline`, and `'unsafe-eval'` in the policy of `/`, and no bare `/*` block), SHALL treat `'wasm-unsafe-eval'` as allowed in the `/` blocks, and SHALL assert that the policy of `/` contains `worker-src 'self'` and `connect-src 'self'` and no other `connect-src` value.
4. THE blocks for `/shell/*` SHALL stay as they are. THE page SHALL add no block for `/hand/*` or `/kit/*`.
5. A browser check (Chrome) SHALL load `/` of the built site under the root `_headers`, play all three worlds, and confirm that the console shows no policy violation and that the Hand run completes. IF no browser is available to the task, THEN THE check SHALL be recorded as a manual one in `docs/measurements.md` for the owner's agent. THE result of this check SHALL decide Open question O3 of the design.
6. THE policy of `/` SHALL NOT contain `'unsafe-eval'`. THE live Hand run SHALL work under that policy because it runs in the Hand_Worker (Requirement 5, criterion 10), whose script is served from `assets/` and carries no page policy.

### Requirement 15: Site Check Changes

**User Story:** As a maintainer, I want the built-directory check to understand the new bundles, so that it still catches a broken link and an external URL, and also catches an engine that leaked into the first paint.

#### Acceptance Criteria

1. THE Site_Check SHALL classify as Engine_Bundles the Landing_Page files `assets/engine-light-*.js`, `assets/engine-hand-*.js`, `assets/hand-worker-*.js`, `assets/sim-worker-*.js`, `assets/worker-entry-*.js`, and `assets/common-*.js` (a shared chunk that the build may emit; none exists in the 2026-11-21 build). FOR these files THE Site_Check SHALL check only the reference forms of the `site` spec (Requirement 20, criterion 4: `import`, `new URL(..., import.meta.url)`, `new Worker`), as it does for the bundles copied from the apps, and SHALL NOT scan their string literals. THE Entry_Bundle, `index.html`, the CSS, and `favicon.svg` SHALL keep the full rules.
2. THE Site_Check SHALL resolve the wasm references of the Engine_Bundles: it SHALL find at least one reference to a `.wasm` file from the Hand_Engine files (the Hand reference lookup includes `hand-worker-*.js`) and one from the Shell SQL worker, at least one `new Worker` reference to the Hand_Worker, one to the Hand simulation worker, and one to the Shell SQL worker, and SHALL assert that each referenced file exists in `site/dist/assets/` (site spec, Requirement 20, criterion 2). THE real-dist test SHALL assert that these references were found, so that a change of the bundle format cannot turn the check into a no-op.
3. THE Site_Check SHALL fail when `index.html` holds a `<script>`, `<link rel="modulepreload">`, or `<link rel="preload">` that names an Engine_Bundle or a wasm file, or when the Entry_Bundle holds a static `import` of an Engine_Bundle. A dynamic `import("./engine-...")` in the Entry_Bundle is expected.
4. THE Site_Check SHALL fail when the Entry_Bundle is larger than 360 kB (the size on 2026-11-21 is 284 kB). THE limit SHALL be a constant of the Site_Check with a comment that names this requirement.
5. THE Site_Check SHALL keep every rule of the `site` spec that this requirement does not change, and its fixture test SHALL gain a fixture for each new rule (an engine chunk in `index.html`, a missing wasm file, an oversized entry, a missing worker file).
6. THE `site/dist/` layout of the `site` spec (Requirement 18, criterion 1) SHALL stay, and the Build_Script SHALL generate the third-party notice of Requirement 18 into the root of `site/dist/`.
7. A test SHALL assert that no chunk that runs under the page policy (the Entry_Bundle, `engine-hand`, and `engine-light`) contains a Function-constructor call, and that the page-side Hand files (`hand-proxy.ts`, `hand-protocol.ts`, `engine-hand.ts`) import no MuJoCo, world, or app code. THE Hand_Worker (584,599 bytes, 188,147 bytes gzip in the 2026-11-21 build; it holds MuJoCo's glue, the pipeline, the kit, and `react-dom/server`) is exempt from the Function-constructor assertion.
8. THE Site_Check SHALL have a rule `notices:` that fails when a package of the Bundled_Packages_List has no section (heading line, `License:` line, and non-empty text) in `THIRD_PARTY_NOTICES.txt`, and when the list is missing or empty. `corepack pnpm --filter @ghost-run/site check` SHALL always pass `site/build/bundled-packages.json` to the Site_Check. A fixture test SHALL cover each failure.

### Requirement 16: Accessibility and Reduced Motion

**User Story:** As a visitor who uses a keyboard, a screen reader, or a reduced-motion setting, I want the live section to work for me.

#### Acceptance Criteria

1. THE tab list SHALL use the roles `tablist` and `tab` with `aria-selected`, and the arrow keys SHALL move between tabs (roving `tabindex`), as in the ARIA authoring pattern, in addition to the Tab key and the Enter key. THE tabs SHALL control the plan box (`aria-controls`).
2. THE sliders SHALL have visible labels bound to the inputs, `aria-valuetext` with the unit ("0.60 metres per second", "20 newtons", "0.20 metres"), and the output element of the value.
3. THE Run button SHALL announce its busy state (`aria-busy`). THE Live_Badge text change SHALL be announced through the Narration_Region only (one polite region, no second live region).
4. THE state of the verdict (BLOCKED, PASS, ASK A HUMAN), of each check chip (✓ or ✗, which follows the live ward verdict as in Requirement 7, criterion 3), and of each Hand tile (✓ or ✗ and the label) SHALL be shown as text or a symbol as well as by color. THE amber warn stamp and the flickering candle SHALL flash no more than three times in one second.
5. THE contrast of every text and border pair that Mockup_V5 adds (the new tab, stepper, plan box, preset, chip, and badge colors) SHALL be at least 4.5:1 for text and 3:1 for component borders, and the contrast test of the `site` spec SHALL gain these pairs. WHERE a Mockup_V5 value fails, THE page SHALL raise it only as far as the limit and SHALL list it in `docs/measurements.md`.
6. WHILE Reduced_Motion is set, THE Live_Section SHALL run live and show the final state without animation and without a timer (Requirement 10, criterion 8), THE Stepper buttons SHALL show their step instantly, and THE Replay button SHALL show the final state again. THE reduced-motion block of Mockup_V5 SHALL apply and SHALL cover the new classes (`.stamp`, `.flicker`, `.tab`, `.stepper i`).
7. THE decorative SVG of the Live_Section SHALL carry `aria-hidden="true"`. THE Actor and the terminal bubble SHALL be hidden from assistive technology as in the `site` spec.
8. EVERY interactive element of the Live_Section SHALL have a hit area of at least 24 by 24 CSS pixels.

### Requirement 17: Hygiene, Language, and Content Rules

**User Story:** As a maintainer, I want the new code to follow the repository's own rules.

#### Acceptance Criteria

1. EVERY text of the page, its source, its tests, its scripts, and this spec SHALL be in English.
2. THE source, tests, data files, and documents of this feature SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener. Tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`. THE possession scan of `site/` and of `.kiro/specs/site-live/` SHALL return `clean`.
3. THE tests and data SHALL use only canary values as secrets and only reserved domains (`.example`, `.test`, `.localhost`, `.invalid`) or `192.0.2.0/24` as hosts. THE Shell fixture's `.env` canary value SHALL NOT appear in `runs.json`, a narration, or a test fixture of the site.
4. THE new code SHALL be written for this repository after 2026-10-30. THE ghost art, the warn candle, and the icons SHALL be original.
5. THE page SHALL show no blood, no religious symbol, and no jump scare (calm ghost).

### Requirement 18: Documentation and Disclosure

**User Story:** As a judge or contributor, I want the README and the notices to say what the page does and what it ships.

#### Acceptance Criteria

1. THE README section "Landing site" SHALL gain one line that says the walkthrough runs live in the browser with the same engines as the apps, that the Ghost Hand engine loads only when Ghost Hand is picked, and that a browser that cannot run the engines shows the recorded runs.
2. THE README "Not written by Kiro" paragraph SHALL gain one line: "The live-walkthrough mockup (v5) was made by Claude Code; Kiro built it."
3. THE Site_Package SHALL ship the third-party notice for the libraries that the Landing_Page bundles. THE landing build (the Vite plugin `site/scripts/lib/bundled-packages.mjs`, also attached to the worker builds) SHALL record every third-party package of the page bundle and of every Engine_Bundle (module graph and asset original file names under `node_modules`; first-party workspace code excluded) in the Bundled_Packages_List (name, version, license, repo-relative directory). THE list measured on 2026-11-21 is: `@fontsource/fredoka` 5.3.0 (OFL-1.1), `@mujoco/mujoco` 4.0.1 (Apache-2.0), `react` 19.3.1, `react-dom` 19.3.1, `scheduler` 0.28.0 (MIT), `sql.js` 1.16.0 (MIT), and `yaml` 2.9.1 (ISC). AT assembly, `build-site.mjs` SHALL generate `site/dist/THIRD_PARTY_NOTICES.txt` with `site/scripts/lib/notices.mjs`: a section for every listed package, with the license text read from the installed package (the files `LICENSE`, `LICENCE`, `COPYING`, `NOTICE`); the section of `@mujoco/mujoco`, which ships no license file, SHALL take the MuJoCo text of `apps/ghost-hand/notices/mujoco.LICENSE.txt`; then the components compiled into `mujoco.wasm` (MuJoCo, Qhull, TinyXML-2, tinyobjloader, libccd, miniz, lodepng) with the upstream texts of `apps/ghost-hand/notices/`. EACH package section SHALL start with the rule line, the heading line `<name> <version>`, and the line `License: <spdx>`. IF the Bundled_Packages_List is missing, THEN THE assembly SHALL fail with `missing build output: site/build/bundled-packages.json (...)`. IF a package has no license text, THEN THE assembly SHALL fail with `no license text for <name> <version>`. THE app's own copy in `site/dist/hand/` SHALL stay as it is. THE landing footer SHALL end with one small link, "Third-party notices", whose `href` is the relative path `./THIRD_PARTY_NOTICES.txt` (owner decision D6). THE link SHALL be styled like the footer text and be unobtrusive, and THE footer SHALL change in nothing else. THE README site dependency paragraph SHALL no longer say that the notices lack `sql.js` and `yaml`. A test SHALL assert that the file is in the assembled directory (Open question O8 of the design), and THE Site_Check SHALL fail when `index.html` has no link that resolves to that file.
4. THE file `docs/measurements.md` SHALL gain a section "Live walkthrough measurements" with: the sizes of the Entry_Bundle, the two engine chunks, the Hand_Worker, the two simulation workers, and the two wasm files, read from the build output; the list of the additions of Requirement 2, criterion 7; the contrast changes; the duration of the Shell and Cloud parity tests and of the gated Hand parity test; and the line "browser load times: measured by the owner's agent in Chrome" with the values filled in by that agent, or marked not yet measured.
5. THE spec's tasks SHALL NOT edit `docs/devlog.md`.

### Requirement 19: Quality Gates and Final Build

**User Story:** As a maintainer, I want every gate to pass and the site to build, so that the change can be deployed.

#### Acceptance Criteria

1. THE Site_Package SHALL pass `tsc --noEmit` and `eslint .`, and its test suite SHALL finish in a Short_Run (60 s) without a browser, a network, or Docker, except the gated `record` project that runs the MuJoCo simulation.
2. THE test suite SHALL contain, at least: the adapter tests per world (verdicts, checks, fingerprint equality, unsupported input, input limits); the parity tests (Requirement 11); the loading tests (Requirement 6); the DOM tests for the Control_Card, the Stepper jump, Replay, the Presets, the slider labels, typed input escaped, Reality unchanged, and the narration region once per step; the fallback tests (Requirement 10); the no-network test (Requirement 13); the header tests (Requirement 14); and the Site_Check tests (Requirement 15).
3. THE properties named in the design (L1 to L12) SHALL each have a test of at least 100 generated examples in a Short_Run, except where the design states a finite input space (the Presets) and says so.
4. THE last task of `tasks.md` SHALL run `corepack pnpm build:site` from the repository root, which builds the three apps and the kit, assembles `site/dist/`, and runs the Site_Check, and SHALL run the package's tests, typecheck, and lint, the gated `test:record`, and the possession scan of `site/` and `.kiro/specs/site-live/`.
5. THE `build:site` script and the assembly SHALL finish within 60 s on the Reference_Machine when the three app builds exist (site spec, Requirement 21, criterion 6), and the engine chunks SHALL not make the Landing_Page build exceed that limit by itself.

### Requirement 20: Amendments to the Site Spec

**User Story:** As a maintainer, I want the criteria of the `site` spec that this change overrides to be named, so that two specs do not disagree.

#### Acceptance Criteria

1. THIS spec SHALL amend these criteria of `.kiro/specs/site/requirements.md`, and the `site` spec's tests SHALL be changed to match in the tasks of this spec:

| Site criterion | Amendment |
|---|---|
| 1.4, 1.5 | The page runtime outside `site/src/live/` still imports only `react`, `react-dom`, `@fontsource/fredoka`, and files of `site/`. `site/src/live/` may import the packages and files of Requirement 1, criterion 4 of this spec, and the Landing_Page bundle contains them in lazy chunks. |
| 2.7 | The structural class list changes as in Requirement 2, criterion 8 of this spec. |
| 4.1 (heading text of section 3) | The sub-heading of section 3 is the sub-heading of Mockup_V5. The heading "Watch the ghost work" and the id `run` stay. |
| 8.2, 10.1, 10.2, 10.10, 11.1 to 11.3, 11.6, 11.8, 11.10, 12.2 | Replaced by Requirements 2 to 4, 7, 8, 11, and 12 of this spec. The plans, wards, and verdicts of the table in 8.2 stay as the recorded Presets. |
| 11.5, 16.3, 16.5 | The autoplay and Reduced_Motion rules are replaced by Requirement 8, criterion 5 and Requirement 10, criterion 8. |
| 12.1, 12.4 | Extended by Requirement 12 of this spec (the engine form and the badge rules). |
| 14.6 | Replaced by Requirement 13 of this spec: same-origin asset fetches of the engine files are allowed, every other request is not. |
| 19.4 | The policy of `/` changes as in Requirement 14 of this spec. |
| 20.4 | The scan rule for Landing_Page JavaScript applies to the Entry_Bundle only (Requirement 15, criterion 1 of this spec). |
| 21.5, `facts.test.ts`, `runs-shape.test.ts` | Updated for `runs.json` version 2. |

2. THE criteria of the `site` spec that are not listed in criterion 1 or 3 SHALL stay in force.
3. THE verdict-note texts of the `site` spec (Requirement 11, criterion 12) SHALL no longer be rendered. THE stamp SHALL stand alone in the verdict card (Requirement 7, criterion 9 of this spec).

### Requirement 21: Out of Scope

**User Story:** As a maintainer, I want the boundaries written down.

#### Acceptance Criteria

1. THE work of this spec SHALL NOT change `apps/`, `worlds/`, `core/`, or `ui/` (Requirement 1, criterion 3), SHALL add no world and no command, and SHALL NOT deploy.
2. THE work SHALL NOT add Kiro Crew integration, a Franka Panda model, 20 haunted variants, or a screenshot tool as a dependency.
3. THE work SHALL NOT change the other sections of the page or the layout of `site/dist/` beyond the notice file of Requirement 18, criterion 3.
4. THE devlog and the deployment are done by Claude Code, not by Kiro.

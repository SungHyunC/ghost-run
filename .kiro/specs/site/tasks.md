# Implementation Plan: site

## Overview

This plan builds the Ghost Run+ landing site: the workspace package `site/` (`@ghost-run/site`), the Landing_Page ported from `docs/design/landing-mockup.html`, the two generated data files (`world-size.json`, `runs.json`), the build script that assembles `site/dist/`, the root `_headers` file, the Site_Check, and the root script `build:site`. All code is TypeScript (the design uses TypeScript throughout), the build scripts are `.mjs` files, and tests use `vitest`, Testing Library with jsdom, and `fast-check`. Host code targets Node.js 20 or later.

The plan follows the implementation order of the design:

1. Package scaffold, steering entry, workspace and root script, README license rows.
2. Shared stylesheets, the SVG Sprite, the contrast test, and the small hooks (`useReducedMotion`, `useInView`).
3. Data types and number formats, the world-size script, the record-runs script and the committed `runs.json`, and the parts-matrix data and scan.
4. The static sections in page order (nav, hero, recipe, costumes with the X-ray switch), each with Testing Library tests.
5. The walkthrough engine (script, reducer, hook, timers, jump, replay, Reduced_Motion, cleanup) with fake-timer tests, then the walkthrough components for the three worlds, then the Reality property test.
6. Make-your-own, footer, and page-level tests (classes, accessibility, hygiene).
7. The build script (headers, assembly, favicon check), then the Site_Check with its property tests.
8. The tiny "Ghost Run+ home" link in the two apps, README and `docs/measurements.md` edits, and the final run of `corepack pnpm build:site`.

### Cross-spec facts this plan relies on

- Already present and not recreated: `core/` (`ghostRun`, `WardEngine`, `renderMessage`), `wards-config` (`parseWards`), `worlds/playground-shell`, `worlds/drawer-arm`, `worlds/ghost-cloud`, the apps `apps/ghost-shell` and `apps/ghost-hand`, `ui/`, and the possession scan `scanFiles` in `@ghost-run/core/possession-node`.
- The three source builds (`apps/ghost-shell/dist`, `apps/ghost-hand/dist`, `ui/dist`) are produced by `corepack pnpm build:site` itself (task 1.1 wires it). Tasks before the final task use temporary fixture trees for the assembly and check tests; they never need the real builds.
- Edits outside `site/` and `.kiro/specs/site/`: `pnpm-workspace.yaml`, root `package.json`, `pnpm-lock.yaml` (one importer entry plus the new dependency rows, by `pnpm install`), `.kiro/steering/structure.md` (task 1.1), `apps/ghost-shell` and `apps/ghost-hand` header link and its tests (tasks 18.1 and 18.2), `README.md` (tasks 1.3 and 19.1), and `docs/measurements.md` (tasks 2.3 and 19.2). No other edit outside `site/`: not `core/`, `ui/`, `worlds/`, `ghost-runner/`, hooks, `.kiro/agents/`, or `docs/devlog.md` (Requirements 22.5, 22.6, 23.1).
- Task 1.1 edits `.kiro/steering/structure.md`. It must finish before task 5.3 imports a world package or an app pipeline (Requirement 1.6).

### Decisions reflected in this plan

1. **Data is recorded, not typed.** `runs.json` and `world-size.json` are written by scripts and committed. Tests compare them with a fresh run (design D3).
2. **The walkthrough is a pure engine plus a thin hook** (design D1, D11). Settling, jumping, and playing all fold the same events.
3. **The Reality pane takes only its scene as props** (design D2). Property 1 checks it.
4. **No shared test files across waves.** Each property test lives in its own file. Shared helpers are written by one task and only read by later tasks. Tasks that edit the same file (`App.tsx`, the stylesheets, `README.md`, `docs/measurements.md`) are in different waves.
5. **Open items taken with the design default.** O1: `REPO_URL` is a fixed constant, `https://github.com/SungHyunC/ghost-run` (the owner's decision). O2: the allowlist gets the entry `https://react.dev/errors/`. O3: no `/kit/*` headers block; the `/hand/*` block was added later (task 21). O4: the joint-limit report is read from a structured field when the Ghost Hand result has one, else by the pattern of design Component 8. O5 and O9: the edits outside `site/` named above. Where the real repository contradicts an item, the task reports it and follows the repository (Requirement 24).

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: site, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` with `numRuns: NUM_RUNS` from `tests/pbt-config.ts`, and prints the seed on failure. The numbers and titles are those of the Correctness Properties section of `design.md`. They are not P1 to P8 of the safety contract.
- **Run sizes.** A Short_Run uses `NUM_RUNS = 100` and finishes within 60 s for the whole package. A Nightly_Run (`GHOST_PBT_MODE=nightly`) uses `NUM_RUNS = 10,000`. `tests/pbt-config.ts` is a new file in the style of `worlds/ghost-cloud/tests/pbt-config.ts`. No property is lowered below 100 runs.
- **Test environments.** `tests/unit/**` run in node, `tests/dom/**` run in jsdom, and `tests/record/**` run only when `GHOST_SITE_RECORD=1` (the `record` project). Tests import `describe`, `it`, and `expect` from `vitest`.
- **No optional tasks.** Every task in this plan is required, including tests. No task carries the optional `*` marker.
- **Fake time.** Walkthrough and X-ray tests inject the scheduler of the hook or use Vitest fake timers. No test waits in real time.
- **Test data.** Canary values only. Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and `192.0.2.0/24`, except the one `REPO_URL`. Hidden Unicode and the HTML comment opener are never written literally in any file under `site/` or `.kiro/specs/site/`; tests build them with `\u` escapes or `String.fromCodePoint`. The glyphs the page shows (U+00D7, U+2192, U+2713, U+2717, U+21BB, U+00B7, the pumpkin emoji) are plain visible characters.
- **No network, no LLM, no storage.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `localStorage`, `sessionStorage`, `eval`, or `Function` in `site/src`. No LLM call and no Kiro Crew tool anywhere.
- **Page runtime imports** only `react`, `react-dom`, `@fontsource/fredoka`, and files of `site/` (Requirement 1.4).
- **Verification commands.** `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, `build`, `assemble`, and `check`. The gated record test runs with `corepack pnpm --filter @ghost-run/site test:record`.
- **Scope of this plan.** Coding tasks only. The screenshot comparison, the browser CSP check, and the devlog are not Kiro tasks (see Notes).

## Tasks

- [x] 1. Package scaffold
  - [x] 1.1 Update steering, workspace, and the root script
    - Edit `.kiro/steering/structure.md`: add the `site/` entry with the dependency rule text of design "Dependency direction" (it may depend on `core/`, `wards-config/`, and `worlds/*` at build time, on the build output of `apps/*` and `ui/`, and, in one build-time record script, on the pipeline modules of `apps/ghost-shell` and `apps/ghost-hand`; no package may depend on `site/`). Keep every other rule. Keep the file free of hidden Unicode and comment openers.
    - Add the line `  - site` to `pnpm-workspace.yaml`.
    - Add the root script `build:site` to `package.json` exactly as in design Component 10: build `@ghost-run/ghost-shell`, `@ghost-run/ghost-hand`, and `@ghost-run/ui`, then run `assemble` and `check` of `@ghost-run/site`, all through `"$npm_execpath"`. Keep the existing scripts unchanged.
    - _Requirements: 1.2, 1.6, 21.1, 21.2_

  - [x] 1.2 Create the `site/` package files
    - `package.json` (name `@ghost-run/site`, `private`, `type: module`, license MIT, `engines.node >=20`; scripts `build`, `assemble`, `check`, `record`, `test`, `test:record`, `typecheck`, `lint`; dependencies and dev dependencies exactly as in design Component 1, with `@fontsource/fredoka` pinned to the version found on the day; the five `workspace:*` links for the record script only). The `build` script builds the Landing_Page only.
    - `tsconfig.json`, `vite.config.ts` (`base: './'`, `outDir: 'build/dist'`, `assetsInlineLimit: 0`, `modulePreload: { polyfill: false }`, `cssCodeSplit: false`, and a plugin that injects the meta CSP of design Component 11 without `frame-ancestors`), `vitest.config.ts` (projects `unit`, `dom`, and `record` gated by `GHOST_SITE_RECORD=1`, record `testTimeout` 600 s), and `eslint.config.mjs` (the `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, and storage-global bans; `react-hooks` rules; `no-restricted-imports` that allows only the page-runtime imports in `src/` and bans every `@ghost-run/*` package and every path reaching `apps/`, `worlds/`, `core/`, or `ui/`; a ban on `Date.now`, `new Date`, and `Math.random` in `src/engine`; a second block that allows exactly the imports of design "Dependency direction" in `scripts/record-runs.measure.ts`).
    - `index.html` (meta CSP, `lang="en"`, title "Ghost Run+: let your agent's ghost try it first", favicon link, root div, module script; no inline script, no `style` attribute), `public/favicon.svg` (original ghost drawn from the `boo` path with a Kiro purple glow outline, no filter, no third-party mark), `src/main.tsx` (mounts a placeholder `App`), `src/App.tsx` (placeholder), and `src/config.ts` with `REPO_URL`, `DUR`, `XRAY_ON_MS`, `XRAY_OFF_MS`, `WORLDS`, `STEPS`, and `DOC_TITLE` as in design Component 2.
    - `REPO_URL` is a fixed constant, `https://github.com/SungHyunC/ghost-run` (the owner's decision, open item O1).
    - `tests/pbt-config.ts` (100 or 10,000 runs by `GHOST_PBT_MODE`).
    - Run `corepack pnpm install`. Confirm that the lockfile gains one importer entry for `site` and the new dependency rows, and that no other package's `package.json` changed.
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 4.7, 14.1, 14.2, 14.5, 18.1, 19.6, 20.5_

  - [x] 1.3 Add the dependency and asset rows to the repository README
    - Add one row for each new dependency of the Site_Package to the README dependency table, with name, version, and license read from the installed `package.json` files on the day: `@fontsource/fredoka` (OFL-1.1) and every development dependency of the site that the table does not list yet. Add a row for `site/public/favicon.svg` as original art of this project, and note that the page has no audio and no other font, icon, or image asset.
    - Keep the file free of hidden Unicode. Do not add the site link or the Ghost Cloud row yet (task 19.1).
    - _Requirements: 14.4, 17.7, 22.4_

  - [x] 1.4 Write the scaffold tests
    - `tests/unit/config.test.ts`: `DUR` equals `[2700, 3900, 3300, 2700, 5200]`; `STEPS` has five entries with the labels of Requirement 11, criterion 2; `REPO_URL` is a single `https://` URL; `DOC_TITLE` equals the title text.
    - `tests/unit/lint-fixture.test.ts`: write a temporary file under `site/src/` that imports `@ghost-run/core`, run ESLint programmatically on it, expect a `no-restricted-imports` error, and delete the file in `finally`. Repeat for a file in `src/` that uses `fetch` or `dangerouslySetInnerHTML`, and for `Date.now` in `src/engine`.
    - `tests/unit/index-html.test.ts`: `index.html` has `lang="en"`, the exact title, one meta CSP without `frame-ancestors`, no inline `<script>`, and no element with a `style` attribute.
    - Run `typecheck`, `lint`, and `build` once on the skeleton.
    - _Requirements: 1.4, 2.5, 2.7, 4.7, 14.3, 19.4, 19.6, 21.4_

- [x] 2. Shared styles, Sprite, and small hooks
  - [x] 2.1 Split the Mockup CSS into the stylesheet files
    - Copy the CSS of `docs/design/landing-mockup.html` (from the comment "site mock, fixed palette" to the end of the `<style>` element) verbatim into `src/styles/00-fonts.css` to `99-page.css` as in the table of design Component 5, keeping class names. Remove `.doc`, `.guide`, `.guide-t`, `.guide ul`, `.guide li`, `.guide .hint`, the Google Fonts link, and the `border-radius` and `overflow:hidden` of `.site`. Apply the listed changes: `.nav-links a` and `a.on`, the `.sprite`, `.sr-only`, `.jl`, `.page`, and `overflow-x:clip` rules, and the extended reduced-motion block. Keep `.bf` and `.bs` flat selectors and `--bone-c` only on `.fig` and `.xray .fig`.
    - `src/main.tsx` imports the four Fredoka weight files (`latin-400.css` to `latin-700.css`) and the stylesheets in the table's order; `11-responsive.css` stays last.
    - Write `tests/unit/styles.test.ts`: all stylesheet files exist and are imported in order; no `.doc` or `.guide` rule remains; no `@import`, `http:`, `https:`, or `data:` in any file; the narrow-screen blocks (`max-width:820px`, `max-width:560px`) are present and last; the `prefers-reduced-motion` block is present.
    - Run `build` and confirm that the font files are emitted as files (no `data:` URI in the output CSS).
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 3.1, 3.3, 3.4, 14.1, 14.2, 14.3, 16.1_

  - [x] 2.2 Write `Sprite`, `Icon`, and the symbol id type
    - `src/components/art/Sprite.tsx`: one `<svg width={0} height={0} className="sprite" aria-hidden="true" focusable="false">` with the 16 `<symbol>` elements (`boo`, `bones`, `pumpkin`, `bat`, `i-mirror`, `i-ward`, `i-candle`, `i-blacklight`, `i-tomb`, `i-hook`, `i-hat`, `i-folder`, `i-file`, `i-db`, `i-bucket`, `i-lock`) with path data and viewBoxes copied unchanged from the Mockup. `src/components/art/Icon.tsx`: `Icon({ id: SymbolId, viewBox, className })` renders `<svg viewBox aria-hidden="true"><use href="#id"/></svg>`. `SymbolId` is the union of the 16 ids.
    - Write `tests/dom/sprite.test.tsx` (T-sprite): every `<use href="#x">` of a rendered fixture page has a `<symbol id="x">`; symbol ids are unique; every svg that holds a `<use>` and the `Sprite` svg carry `aria-hidden="true"`, and the `Sprite` has `focusable="false"`; the CSS text has no descendant selector that ends in `.bf` or `.bs`; `--bone-c` is declared only on `.fig` and `.xray .fig`.
    - _Requirements: 2.3, 6.9, 15.5, 19.4_

  - [x] 2.3 Write the contrast test and raise failing colors
    - `tests/unit/contrast.test.ts`: a curated table of (selector, text color, background) pairs for the text and the UI borders of the page. Each color is found in that selector's rule in the stylesheets. Translucent backgrounds are composited over `#1c0e3b` first. Normal text needs a ratio of at least 4.5, large text and component borders at least 3.
    - Where a Mockup value fails, raise it only as far as the limit in the stylesheet and append a section "Site contrast changes" to `docs/measurements.md` listing selector, old value, new value, and ratio. Where nothing fails, append the section with the line "no change".
    - _Requirements: 2.9, 15.7_

  - [x] 2.4 Write `useReducedMotion`, `useInView`, and the scheduler type
    - `src/engine/useReducedMotion.ts`: reads `matchMedia('(prefers-reduced-motion: reduce)')`, subscribes to changes, returns `false` when `matchMedia` is missing, removes its listener on unmount. `src/engine/useInView.ts`: an `IntersectionObserver` hook with threshold 0.25 that disconnects after the first hit and reports `unsupported` when the API is missing. `src/engine/scheduler.ts`: the `Scheduler` type (`setTimeout`, `clearTimeout`) and `defaultScheduler`.
    - Write `tests/dom/hooks.test.tsx`: reduced motion on, off, changing at run time, and with no `matchMedia`; listener removal on unmount; `useInView` fires once, disconnects, and reports `unsupported` when `IntersectionObserver` is missing.
    - _Requirements: 6.7, 11.5, 16.1, 16.5_

- [x] 3. Data types and number formats
  - [x] 3.1 Write `src/data/types.ts` and `src/engine/format.ts`
    - `data/types.ts`: `RunsFile`, `WorldRecord`, `PlanRecord`, `CheckRow`, `RealityScene`, `CopyScene`, `WorldId`, `AppPart`, and `WorldSizeFile` exactly as in design Component 8 and the Data Models table.
    - `engine/format.ts`: `formatCount`, `formatForce`, `formatRate`, and `roundLines` with the rules of design Component 8 (the multiplication sign is U+00D7 where a label needs it).
    - Write example tests in `tests/unit/format.test.ts`: `formatCount(1206)` is `1,206`; `formatForce(27.53)` is `27.5 N` and `formatForce(29.24)` is `29.2 N`; `formatRate(7, 8)` is `7 of 8 = 88%` and `formatRate(8, 8)` is `8 of 8 = 100%`; `roundLines(789)` is `800`.
    - _Requirements: 9.3, 10.2, 10.5_

  - [x] 3.2 Write property test for number formats
    - **Property 9: Number formats**
    - In `tests/unit/format.property.test.ts`: for any integer n >= 0 the separators removed parse back to n with a comma every three digits; for any non-negative force the result ends in " N" with exactly one decimal digit; for any `0 <= ok <= total`, `total >= 1`, the rate has the form `"ok of total = P%"` with P the rounded percentage.
    - **Validates: Requirements 10.5**

- [x] 4. World size
  - [x] 4.1 Write the World_Size_Script and the committed file
    - `scripts/world-size.mjs`: export `countWorldSizes(root)`; CLI flags `--write` and `--check`. It counts the non-blank lines of all `.ts` files below `worlds/<name>/src/` (recursive, sorted order, excluding `*.test.ts` and `*.d.ts`) for `ghost-cloud`, `playground-shell`, and `drawer-arm`, and writes `src/data/world-size.json` with `format`, `version`, and sorted keys, two-space indent, one trailing newline. It reads files only and writes only that file.
    - Run `--write` and commit the file. Report the three counts (expected near 789, 2,569, and 2,647).
    - Write `tests/unit/world-size.test.ts` with a fixture directory (a test file, a declaration file, blank and whitespace-only lines, a nested folder, a non-`.ts` file) and exact expected counts, a `--check` exit-code test, and a test that the committed file equals a fresh run on the repository.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.2 Write property test for world size counting
    - **Property 8: World size counting**
    - In `tests/unit/world-size.property.test.ts`: for any generated `worlds/` fixture (random folders; `.ts`, `*.test.ts`, `*.d.ts`, and other files; empty, whitespace-only, and non-blank lines), `countWorldSizes` returns for each world exactly the number of non-blank lines of its non-test, non-declaration `.ts` files below `src/`; for any integer n >= 0, `roundLines(n)` is the multiple of 100 nearest to n (ties upward); the committed `world-size.json` equals a fresh run.
    - **Validates: Requirements 9.1, 9.3, 9.5, 9.6**

- [x] 5. Recorded runs
  - [x] 5.1 Write the JSON printer and the tile label rule
    - `scripts/lib/print-json.mjs`: `printJson(value)` with sorted keys at every level (arrays keep order), two-space indent, one trailing newline, no timestamps. `scripts/lib/tile-label.ts`: `tileLabel(params)` with the four scored candidates of design Component 8 (friction, mass, handle, delay), ties to the earlier candidate, ratios with 2 decimals, handle norm with 1 decimal, the sign U+00D7, and the fixed scoring constants (10 mm, 6 steps).
    - Write example tests in `tests/unit/tile-label.test.ts` using the eight parameter rows of the design table for seed 42 (values from the table, given as test data): the eight labels `friction ×0.41`, `handle 5.5 mm`, `delay 5 steps`, `friction ×1.68`, `mass ×1.76`, `delay 3 steps`, `friction ×0.30`, `mass ×0.66`; and a tie-break case.
    - _Requirements: 10.4, 10.8_

  - [x] 5.2 Write property test for the tile label rule
    - **Property 10: Tile label rule**
    - In `tests/unit/tile-label.property.test.ts`: for any variant parameters drawn from the ranges of `worlds/drawer-arm/variant-config.json` (read as a JSON file), the label names the candidate with the highest score, ties to the earlier candidate, and the text has the format of that candidate. The seed-42 check against the real `sampleVariant` runs in task 5.5 (gated) and against the recorded parameters in task 5.4.
    - **Validates: Requirements 10.4**

  - [x] 5.3 Write the Record_Script and its measure file
    - `scripts/record-runs.mjs`: spawns `corepack pnpm exec vitest run --config scripts/record-runs.config.ts` with `cwd` set to `site/` and `GHOST_SITE_RUNS_OUT` set to the output path; reads the file; supports `--out <path>` and `--check` (compare with the committed file, exit 1 on a difference). `scripts/record-runs.config.ts`, and `scripts/record-runs.measure.ts` (not a `*.test.ts` file; skipped unless `GHOST_SITE_RUNS_OUT` is set).
    - The measure file follows design Component 8: Shell through `runPlayground` and `buildProject` with the inline SQL executor, Hand through `runGhostHand` and `createInlineExecutor` with seed 42 and 8 variants (the call of `apps/ghost-hand/scripts/measure-demo.measure.ts`), Cloud through `runGhostCloudPlan`. Plans are read from the plan files and demo files of Requirement 8, criterion 2 with the parsers the apps use. It builds the six `PlanRecord`s with checks, effectsOutside, `p1` hashes, the reduced scenes, `facts`, and per-variant parameters, outcome, and `tileLabel`. The joint-limit variant id comes from a structured field of the Hand result when one exists, else from the pattern `joint limit exceeded in variant (variant-[0-9]+)`; it fails the run when the message mentions a joint limit and the pattern finds nothing (open item O4).
    - The script exits non-zero and writes nothing when a plan gives an unexpected verdict (block for a plan, pass for a fixed plan), when `p1.equal` is false, or when a wards file does not parse. It reads no clock, no random source, no `.env`, and copies no number from a document. It makes no network call.
    - Write `tests/unit/record-script.test.ts` (no simulation): `--check` and exit-code behavior on a temporary file with a stubbed child result, the unexpected-verdict and unequal-fingerprint refusals through the pure `validateRecords` function the measure file exports, and that no file is written on refusal.
    - _Requirements: 1.5, 10.1, 10.2, 10.4, 10.6, 10.8, 10.9, 12.3_

  - [x] 5.4 Run the Record_Script, commit `runs.json`, and test its shape
    - Run `corepack pnpm --filter @ghost-run/site record` and commit `src/data/runs.json`. Report any value that differs from Requirement 10, criterion 3 (the fresh run is the authority; do not edit the expected numbers to match, and report the difference as a Requirement 24 item).
    - Write `tests/unit/runs-shape.test.ts` (always on, reads the committed file): `format` and `version`; six plan records; verdicts block for each plan and pass for each fixed plan; `p1.equal` true with hashes only; sorted keys; no absolute path or timestamp; the expected values of Requirement 10, criterion 3 (1,206 rows lost, 0 for the fixed Shell plan; 7 of 8 and 8 of 8 for Hand; 27.53 and 29.24 N; `variant-3` failed and `variant-6` joint limit; the Cloud bucket and 3 objects); eight Hand variants with parameters and outcomes; the label of each recorded variant equals `tileLabel` of its recorded parameters and equals the eight labels of the Mockup.
    - _Requirements: 10.2, 10.3, 10.4, 10.6, 12.2, 12.3_

  - [x] 5.5 Write property and gated tests for recorded runs
    - **Property 3: Recorded runs equal a fresh run**
    - In `tests/record/recorded-runs.test.ts` (project `record`, started by `test:record`): run the Record_Script into a temporary location and assert byte equality with the committed `runs.json`, the expected verdicts, `p1.equal`, and the values of Requirement 10, criterion 3 in the fresh output; for seed 42 and the real `sampleVariant` assert the eight tile labels. In `tests/unit/runs-printer.property.test.ts` (always on): for any `RunsFile`-shaped value generated from the type, `JSON.parse(printJson(x))` equals x and `printJson` of the parsed value gives equal bytes (sorted keys, stable format).
    - Run the gated test once and record its duration for task 19.2.
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.6, 10.7, 10.8, 12.3**

- [x] 6. Parts matrix
  - [x] 6.1 Write the parts-matrix and skeleton data
    - `src/data/parts-matrix.ts`: `PARTS_MATRIX` with the values of Requirement 7, criterion 1, and `PART_NAMES`. `src/data/skeleton.ts`: the eight parts (name, line, folders) of the table in Requirement 5, criterion 4, the six functions with their lines (Requirement 5, criterion 2), the six spec names, and the three costume cards of Requirement 6, criterion 2 as typed data. No literal line count anywhere.
    - Write `tests/unit/skeleton-data.test.ts`: eight parts in order with the exact lines and folders; six functions in order; three cards in order with the stated tags, links, and provenance.
    - _Requirements: 5.2, 5.4, 5.5, 6.2, 7.1, 7.5, 9.6_

  - [x] 6.2 Write the usage scan
    - `scripts/lib/scan-usage.mjs`: `deriveUsage(sourceRoot)` with the TypeScript compiler API, following the six steps of design Component 9 (collect files, binding tables, re-export tables, origin resolution through relative re-exports, Usage_Reference counting that skips imports, exports, and type-only positions, and the origin-to-part map). Share the file walker in `scripts/lib/fs-walk.mjs`.
    - Write `tests/unit/scan-usage.test.ts` with fixture trees: a re-export chain that is used, one that is never used, a namespace import with member access (`ui.Candle` and `ui['Candle']`), a bare import that is never used, and a type-only import.
    - _Requirements: 7.2, 7.4_

  - [x] 6.3 Write property test for the parts matrix
    - **Property 2: Parts matrix equals the imports**
    - In `tests/unit/parts-matrix.property.test.ts`: for each of the three costumes and each of the six App_Parts, `PARTS_MATRIX` equals `deriveUsage` of `apps/ghost-shell/src`, `apps/ghost-hand/src`, and `worlds/ghost-cloud/src`; the failure message names the costume, the part, and both values; a second form over generated source trees (random import and re-export chains, namespace imports, unused imports, type-only imports) shows that a part is reported as used exactly when a resolved name has a Usage_Reference. The test reads the matrix from the same module the page renders. Assert that `integrations/kiro-hook/` and `.kiro/agents/world-smith.json` exist.
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 7. Checkpoint - Data layer complete
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, and `lint`. Confirm that `world-size.json` and `runs.json` are committed, that Properties 2, 3, 8, 9, and 10 pass, and that the repository outside the planned files is unchanged (`git status`). Ensure all tests pass, ask the user if questions arise.

- [x] 8. Static sections in page order
  - [x] 8.1 Write the app shell, `Nav`, and the first render test
    - `src/App.tsx`: `<div className="site">` with `Sprite` first, then `<div className="page">` that holds the blocks in the order of Requirement 4, criterion 1. The blocks not yet written render nothing. `src/components/Nav.tsx` with the logo, "Ghost Run+", and the five links of Requirement 4, criterion 2 as real anchors (`./`, `shell/`, `hand/`, `kit/`, `REPO_URL` with `rel="noopener noreferrer"`); the current link has the class `on` and `aria-current="page"`. The hero and later sections are added by later tasks.
    - Write `tests/dom/render.test.tsx` (extended by later tasks): the nav links and their targets, `aria-current`, the sprite is first, the `.site` and `.page` wrappers exist.
    - _Requirements: 3.2, 4.1, 4.2, 15.3, 18.6, 20.5_

  - [x] 8.2 Write `Hero` and the hero art
    - `Hero`, `HeroArt` (moon, three bats, aura, floating ghost, candle with a face), `Hill`, and `PumpkinRow` ported from the Mockup with path data unchanged and `aria-hidden` on every decorative svg. The kicker, the one `h1`, the paragraph with "ghost copy" and "One skeleton, three costumes." in bold, and the two buttons "Meet the skeleton" (`#recipe`) and "Watch the ghost work" (`#run`). Add `Hero` to `App.tsx`.
    - Extend `tests/dom/render.test.tsx`: exact heading and kicker text, the bold words, the button targets, one `h1` in the page, no hidden-Unicode character in the rendered text.
    - _Requirements: 2.1, 2.3, 4.3, 4.4, 4.6, 15.5, 17.5, 17.6_

  - [x] 8.3 Write `Recipe`
    - `Recipe`, `WorldIngredient`, `SkeletonIngredient`, and `Cauldron` (section id `recipe`): the sub-heading, the three blocks joined by "+" and "=" (`aria-hidden`), the six function rows, the sticker "That's all. Ghost Cloud's whole world is about N lines." with N from `roundLines` of the `ghost-cloud` value of `world-size.json` passed in as `lineCount`, the eight part cards with icons, lines, and folders, the line "Built with Kiro specs:" with the six names, and the cauldron text. Add it to `App.tsx` with `lineCount` read from the JSON.
    - Extend `tests/dom/render.test.tsx`: the heading hierarchy (one `h2` for this section), the six functions in order with their lines, eight parts in order, the six spec names, the sticker shows the rounded count of the committed file and no literal count exists in the component source (a source scan test).
    - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.3, 9.6_

  - [x] 8.4 Write `Costumes`, the X-ray switch, and the figures
    - `Costumes` (section id `costumes`), `XraySwitch` (`input` type `checkbox` with `role="switch"`, accessible name "X-ray: show the skeleton inside each app", label "X-ray" with the hint "try me", `aria-checked` in step with the checkbox), `CostumeCard`, `PartChips` (a part the matrix marks as not used gets the class `off`, a strike-through, and visually hidden text "not used"), and `ShellFigure`, `HandFigure`, `CloudFigure` over `<use href="#bones"/>` (`src/components/art/Figures.tsx`). `src/engine/useXrayDemo.ts`: turns the switch on after 1600 ms and off after 4400 ms once, never under Reduced_Motion, and cancels both timers on the first user input and on unmount; it takes the `Scheduler`. Cards, tags, lines, links, and notes exactly as in Requirement 6, criteria 1 to 3, with chip data from `PARTS_MATRIX` and the Cloud line count from `lineCount`. The section gets the class `xray` when the switch is on, and each card shows the badge "same skeleton ✓". Add to `App.tsx`.
    - Write `tests/dom/xray.test.tsx` and `tests/dom/costumes.test.tsx`: switch state and `aria-checked` both ways; section class and badges; demo timers at 1,600 and 4,400 ms with fake time; user input before 4,400 ms cancels both; Reduced_Motion leaves the switch alone; no timer left after unmount; three cards in order with the stated texts and links; chips in the order Mirror, Ghost, Wards, Candle, Blacklight, Graveyard; a not-used chip has `off` and the hidden "not used" text; the three figures reference the same `bones` symbol.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 15.1, 15.6, 15.9, 16.2_

  - [x] 8.5 Write the facts tests
    - `tests/unit/facts.test.ts`: every folder named in Requirement 5, criterion 4 and Requirement 8, criterion 1 exists; every spec name of Requirement 5, criterion 5 is a folder of `.kiro/specs/`; `.kiro/agents/world-smith.json` exists; each plan text in `runs.json` equals the plan file or demo file of Requirement 8, criterion 2; each ward exists in the named wards file with the stated rule (`no-data-loss` kind `sql` with `max_rows_lost: 0`; `gentle-hands` kind `physics` with `min_success_rate: 0.95`, `max_contact_force_n: 30`, forbidden contact `vase`; `no-bucket-delete` kind `path` with `deny: [delete]` on `prod-*`); the Cloud fixture matches `worlds/ghost-cloud/src/fixture.ts`; the Shell reality scene is a subset of the fixture of `apps/ghost-shell/src/scenarios/project.ts` and never holds `.env` content; the Hand reality scene is labeled "the real arm"; no page text claims that Ghost Cloud runs for real; the strings "P1" to "P8" appear nowhere in `src/`.
    - _Requirements: 5.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 9. Checkpoint - Static page complete
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, and `build`. Confirm that the first four blocks render in order and that no test needs the walkthrough yet. Ensure all tests pass, ask the user if questions arise.

- [x] 10. Walkthrough engine
  - [x] 10.1 Write the engine types and the narration data
    - `src/engine/types.ts`: `WalkState`, `WalkEvent`, `TimedEvent`, `Segment`, `WalkView`, and the world item states of design Component 7. `WalkState` has no field that the Reality pane reads. `src/data/narration.ts`: five templates per world as `Segment` lists (kinds `text`, `b`, `code`; no HTML strings) with number slots filled from a `PlanRecord` through `engine/format.ts`, keeping the tone and wording of the Brief and the numbers from the record.
    - Write `tests/unit/narration.test.ts`: every world and step has a template; slots are filled from the committed `runs.json` (for example "1,206", "27.5 N", "7 of 8 = 88%"); no template holds a literal number that the record also holds; no segment contains markup characters.
    - _Requirements: 10.5, 11.11_

  - [x] 10.2 Write `buildScript`, `settle`, and `reduceWalk`
    - `src/engine/script.ts`: `buildScript(record, step)` returns `TimedEvent[]` with the `at` offsets of the timing table in design Component 7 (typing at 26 ms per character, the world actions after the last character plus 250, the Shell bars at 70 ms, the count-down in 12 steps, the "dropped" tag at 850, the Hand tiles 160 and 120 apart, the Cloud poof and vanish 300 apart, the check rows at 500 + 380 per row, the ward tone at 600 + 380 per row, the candle at 500 in Step 4, and the Step 5 offsets 1000, 900, and 1500). `settle(record, upTo)` folds the events of steps 0 to `upTo` in `at` order without time. `src/engine/reducer.ts`: pure `reduceWalk(state, event)`. The badges follow the record: fingerprint only when `p1.equal`, go only when the fixed record has verdict `pass` and `p1.equal`. The engine reads no clock and no random source.
    - Write `tests/unit/engine.test.ts` on the committed `runs.json`: the offsets of every row of the timing table for each world; `settle(world, 4)` shows stamp PASS, the fixed plan text, and the narration of step 5 only; the Hand tile `fail` states equal the recorded failed variants and the `variant-6` tile carries the joint-limit mark; the Hand fixed-plan check rows show the three rows of Requirement 11, criterion 10 with the fixed run's measured values; the note texts of Requirement 11, criterion 12; the lines of a two-line fixed plan are joined with " && ".
    - _Requirements: 2.5, 8.6, 11.4, 11.8, 11.9, 11.10, 11.12, 12.4_

  - [x] 10.3 Write `useWalkthrough`
    - `src/engine/useWalkthrough.ts`: `useWalkthrough(runs, scheduler?)` returns `{ view, world, step, controls: { pickWorld, replay, jump } }` with the behavior table of design Component 7: no timers on mount; Reduced_Motion shows `settle(shell, 4)` and schedules nothing; the first time the section is in view it plays the Shell walk (no autoplay without a signal: with `unsupported` it shows the final state); `pickWorld`, `replay`, and `jump(n)` cancel all timers first, `jump` applies steps before n with no timers and plays step n at normal speed (instantly under Reduced_Motion); turning Reduced_Motion on during a walk cancels the timers and shows the final state; unmount cancels all timers and removes listeners. All timers go through one registry. `play(world)` schedules step k at the sum of `DUR` before it.
    - Write `tests/unit/walkthrough-hook.test.tsx` (recording scheduler or fake timers): mount schedules nothing; play schedules the events of the five steps at the table's times; `pickWorld` clears the previous run; `replay` restarts the current world; `jump(3)` marks steps before it as settled and schedules only step 3's events; the Reduced_Motion and no-observer cases; unmount leaves zero pending timers.
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 16.1, 16.3, 16.4, 16.5_

  - [x] 10.4 Write property test for settling equals playing
    - **Property 6: Settling equals playing through**
    - In `tests/unit/engine.property.test.ts`: for any world and any step n in 0..4, folding the events of steps 0..n with `reduceWalk` gives the same `WalkState` as running the hook with fake timers from reset until step n's last event has fired, apart from the narration (settling shows the narration of step n only) and the typed text (settling sets the full text); for any world the state after `jump(n)` with all timers drained equals the state after `play` drained when n is 4, and `settle(world, 4)` equals the state after `play` drained.
    - **Validates: Requirements 11.4, 11.7, 11.8, 16.3, 16.4**

  - [x] 10.5 Write property test for timer hygiene
    - **Property 7: Timer hygiene**
    - In `tests/unit/timer-hygiene.property.test.ts`: for any generated sequence of controls (pick world, replay, jump, unmount) with any time advance between them, after the last control the number of pending timers equals the number of events still to fire of the latest run (none after unmount), no event of a canceled run ever fires, and under Reduced_Motion no timer is ever scheduled; after the final state is shown and the clock is drained, zero timers remain.
    - **Validates: Requirements 11.5, 11.6, 11.7, 16.1, 16.2, 16.5, 16.6**

- [x] 11. Walkthrough components
  - [x] 11.1 Write the walkthrough frame components
    - `Walkthrough`, `WorldChips` (buttons with `aria-pressed`), the "↻ Replay" button, `StepRail` (an ordered list; five buttons with the labels of Requirement 11, criterion 2; the current one has the class `now` and `aria-current="step"`, earlier ones `done`), `Theater`, `PlanBar` (with the tag "fixed by the agent" in Step 5), `WardCard` (check rows with ✓ or ✗ text, the effectsOutside line), `VerdictCard` (big candle with a face, the stamp text, the note), `Actor` (`aria-hidden`, the terminal bubble with typed text and caret), and `SpeechBar` (`p#sayt` with `aria-live="polite"`, present before step 1 and empty). The `Theater` holds refs to the gutter, copy pane, ward card, and verdict card, and a layout effect positions the Actor with the offsets of design Component 7 and repositions without animation on window resize. Section id `run`, the sub-heading of Requirement 11, criterion 1.
    - Write `tests/dom/chips.test.tsx`: chips set `aria-pressed` on the chosen chip only and reset the theater; replay restarts the current world; a step-rail button marks that step `now` and earlier steps `done`; `aria-current="step"` follows; the live region exists before step 1 and is empty; ward rows show ✓ or ✗ text and the verdict shows BLOCKED or PASS as text.
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7, 11.12, 11.13, 15.2, 15.4, 15.6, 15.9_

  - [x] 11.2 Write the panes for the three worlds
    - `RealityPane` (content element `#realb` as a `React.memo` component whose only prop is the recorded `reality` scene; the head badges `#fpb` and `#gob` are props), `CopyPane` (the sealed tag, the beam, materialize, `#copyb`), and `ShellPane`, `HandPane`, `CloudPane` (the scene builders of the Mockup as typed components: the `project/` tree with `app.db`, the `users` bars, the `.bak` row and its "new" tag, the Hand arm, cabinet, drawer, vase and eight tiles with labels from the record and the `.jl` joint-limit label, the Cloud buckets with the `prod-` shield, the poof and vanish classes). All decorative svg is `aria-hidden`. The reducer and `CopyPane` have no handle on the Reality pane.
    - Write `tests/dom/panes.test.tsx`: each pane renders the drawn items of the committed record; the Shell reality shows `project/`, `app.db` with `users` 1,206 and `orders` 3, `package.json`, `data/`, and no `.env`; Hand tiles carry the recorded labels and `fail` states and the `joint limit` text on the recorded variant; Cloud shows the three buckets and seven objects with the shield on `prod-` buckets; the Reality pane's props contain no walk state.
    - _Requirements: 8.3, 8.4, 8.5, 11.3, 11.8, 11.9, 12.1, 12.2, 15.5_

  - [x] 11.3 Wire the walkthrough into the page and test it end to end
    - Mount `Walkthrough` in `App.tsx` with `runs` from `runs.json`. Connect `useWalkthrough` to the frame and the panes.
    - Write `tests/dom/walkthrough.test.tsx`: autoplay starts only after the section is in view; each world plays all five steps with fake timers and reaches PASS; the step jump and replay controls behave as in Requirement 11, criteria 6 and 7; the speech bar and the plan text show the recorded plan and the fixed plan.
    - Write `tests/dom/reduced-motion.test.tsx`: with `matchMedia` set to reduce, the final state shows at load, nothing autoplays, a step button shows its step instantly, the X-ray switch is unchanged, no timer is pending after the final state.
    - Write `tests/dom/no-network.test.tsx`: `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by throwing functions, and `localStorage`, `sessionStorage`, `indexedDB`, and `document.cookie` access recorded; all five steps of all three worlds play; no call and no storage access happen.
    - **Property 12: Narration updates once per step**
    - Write `tests/dom/narration.property.test.tsx`: for any world and any run of the walkthrough with the fake clock, the text of `#sayt` changes exactly once at the start of each step that plays and never between two steps; the region exists before the first step; no typed terminal character is written into it.
    - **Validates: Requirements 11.11, 15.4**
    - _Requirements: 11.5, 11.6, 11.7, 11.11, 14.5, 14.6, 15.4, 16.3, 16.4, 16.5, 16.6_

- [x] 12. Reality never changes
  - [x] 12.1 Write property test for the Reality pane
    - **Property 1: Reality never changes**
    - In `tests/dom/reality.property.test.tsx` (jsdom, fake clock, at least 100 examples in a Short_Run): for any world and any generated sequence of user actions (pick world, replay, jump to a step, play to the end, with the clock advanced by any amount between actions), the serialized content of `#realb` after each action equals its content right after the reset of the current world and equals the drawn form of that world's `reality` scene; only the badges `#fpb` and `#gob` may differ. The fingerprint badge shows only when the plan record has `p1.equal`, and the go badge only when the fixed record has verdict `pass` and `p1.equal`. Add one mutation test: a deliberately broken `CopyPane` wrapper that writes into the Reality pane makes the property fail.
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**

- [x] 13. Checkpoint - Walkthrough complete
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, and `build`. Confirm that Properties 1, 6, 7, and 12 pass with at least 100 runs and that the suite stays within 60 s. Ensure all tests pass, ask the user if questions arise.

- [x] 14. Make-your-own, footer, and page-level tests
  - [x] 14.1 Write `Make` and `Footer`
    - `Make` (section id `make`): the sub-heading of Requirement 13, criterion 1, the spellbook card "The spell: a world in six functions" with the code block (`pre`, monospace) and its six comments, and the world-smith card "Ask world-smith" with its text, the command `kiro-cli chat --agent world-smith`, and the line "Ghost Cloud was made this way." No copy button, no form, no control that sends data. `Footer`: "Built with Kiro:" and the seven items. Add both to `App.tsx` in order (the page now has all seven blocks).
    - Extend `tests/dom/render.test.tsx` and add `tests/unit/readme-command.test.ts`: the code block text, the card texts, no `button` or `form` in the section, the footer items in order, the displayed command equals the command in the README section "Build a world with the `world-smith` agent".
    - _Requirements: 4.1, 4.5, 13.1, 13.2, 13.3, 13.4, 13.5, 17.1_

  - [x] 14.2 Write the page-level classes, accessibility, and hygiene tests
    - `tests/dom/classes.test.tsx`: `DUR` equals `[2700, 3900, 3300, 2700, 5200]`; every structural class of Requirement 2, criterion 7 (`site`, `nav`, `hero`, `sec`, `recipe`, `ing`, `parts`, `part`, `cards`, `cc`, `costume`, `theater`, `panes`, `pane`, `ward`, `verdict`, `actor`, `say`, `rail`, `wchip`, `xsw`) is present in the rendered page; the page has no `.doc` wrapper; the blocks and section ids are in the order of Requirement 4, criterion 1; one `h1` and one `h2` per numbered section; document title and `lang`.
    - `tests/dom/a11y.test.tsx`: every decorative svg and the sprite are `aria-hidden`; rail buttons sit inside an ordered list; chips show "not used" text; verdict and check rows show text; every link, button, and the switch is focusable in tab order; no element has a `style` attribute except those the Actor sets through the CSSOM; the `Actor` is `aria-hidden`.
    - `tests/unit/hygiene.test.ts`: no literal hidden Unicode, no literal HTML comment opener, and no non-English text in any file of `site/` and `.kiro/specs/site/`; no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, storage API, `eval`, `Function`, `dangerouslySetInnerHTML`, or `innerHTML` in `src/`; no LLM API call; only reserved hosts, with `REPO_URL` as the single exception; only canary secrets; `.env` content never read by the record script; no religious symbol, blood, or Kiro logo asset in `public/` or `src/`; the scan test does not scan itself.
    - _Requirements: 2.6, 2.7, 4.1, 4.6, 14.3, 14.5, 15.2, 15.3, 15.5, 15.6, 15.9, 17.1, 17.2, 17.4, 17.5, 17.6, 17.8, 21.5_

- [x] 15. Build script and headers
  - [x] 15.1 Write the headers library
    - `scripts/lib/headers.mjs`: `parseHeaders(text)`, `printHeaders(blocks)`, `scopeBlocks(blocks, prefix)` (rewrites only the path line: `/*` becomes `/shell/*`, any other `P` becomes `/shell` + `P`; throws when the input has no block), and `buildRootHeaders(shellHeadersText)` that returns the root file text with the blocks `/`, `/index.html`, and the scoped shell block, in that order, with the policy of design Component 11 (no `frame-ancestors` difference; the root policy has `frame-ancestors 'none'`), and no block for `/*`, `/hand/*`, or `/kit/*`.
    - Write `tests/unit/headers.test.ts`: the real `apps/ghost-shell/dist/_headers` shape on a fixture string, the exact root file for it, and an input without blocks is refused.
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 15.2 Write property test for the headers rewrite
    - **Property 11: Headers rewrite**
    - In `tests/unit/headers.property.test.ts`: for any `_headers` text with one or more blocks (random path lines including `/*`, random header lines), `scopeBlocks(parse(text), '/shell')` gives blocks whose path lines all start with `/shell/` or equal `/shell`, none equals `/*`, with header lines unchanged, and `parse(print(blocks))` equals `blocks`; the generated root file has no block with the scope `/*`, exactly one block per scope, and a `/` block whose policy contains none of `http:`, `https:`, `*`, `data:`, `unsafe-inline`, `unsafe-eval`.
    - **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5**

  - [x] 15.3 Write the Build_Script and its tests
    - `scripts/build-site.mjs`: export `buildSite({ root, flags })` and run as a CLI with `--landing-only` and `--record`. The steps and failure messages are those of the table in design Component 10: world-size, Landing_Page build through the Vite API into `site/build/dist/`, stop at `--landing-only`, optional record and rebuild, source checks (each of `apps/ghost-shell/dist`, `apps/ghost-hand/dist`, `ui/dist`, `site/build/dist` exists, is not empty, holds its `index.html`; shell `dist` holds `ko.html` and `_headers`; hand `dist/assets` holds one `.wasm` file), read the shell `_headers`, empty `site/dist/`, copy the five trees with `fs.cpSync` (skip `.DS_Store`, follow no symlinks), delete `shell/_headers`, write the root `_headers`, and print one line per target with its file count. A failure in the copy or write steps removes `site/dist/` and exits 1. It writes nothing outside `site/dist/`, `site/build/dist/`, and `site/src/data/`, edits no file of an app build, and makes no network call.
    - Write `tests/unit/build-site.test.ts` on a temporary repository fixture: the copy table is honored (`/`, `/shell/` with `ko.html`, `/hand/`, `/kit/`, `/favicon.svg`, `/_headers`); `shell/_headers` is removed and exactly one `_headers` exists; a missing or empty source gives a non-zero exit, a message that names the directory and the build command, and no `site/dist/`; a copy failure leaves no partial `site/dist/`; the apps' files are byte-equal after copy; no `base` rewrite.
    - _Requirements: 9.4, 10.10, 18.1, 18.2, 18.3, 18.4, 18.5, 18.7, 18.8, 19.1, 19.2, 21.6_

- [x] 16. Site check
  - [x] 16.1 Write the reference extraction and the allowlist
    - `scripts/lib/refs.mjs`: extract references from `.html` (jsdom: the attributes `href`, `src`, `srcset` candidates, `poster`, `action`; `<base>` ignored), `.css` (`url(...)` and `@import`), and `.js` (static targets of `import(...)`, `import ... from`, `export ... from`, `new URL("...", import.meta.url)`, `new Worker("...")`, `new Worker(new URL(...))`, minified forms too; dynamic expressions skipped). Classify local and external as in design Component 12. `scripts/url-allowlist.json` with the five XML namespace identifiers, `REPO_URL` (anchor `href` with `rel="noopener noreferrer"` only), and `https://react.dev/errors/` (open item O2, with its reason), each with `value`, `files`, and `reason`.
    - Write `tests/unit/refs.test.ts` with one fixture file for each extraction form, including a root-absolute path, a query string, a fragment, and a trailing slash.
    - _Requirements: 20.2, 20.4, 20.5_

  - [x] 16.2 Write `checkSite` for local links
    - `scripts/check-site.mjs`: export `checkSite(distRoot)` returning `Finding[]` (`{ file, reference, rule }`); the CLI prints `FILE  REFERENCE  RULE` per finding, exits 1 on any finding, and prints one summary line when clean. Resolution as in design Component 12: relative to the holding file, a leading `/` from the root, query and fragment cut for the file lookup, a trailing `/` resolves to `index.html`, a same-file fragment must match an `id`. No network call.
    - Write `tests/unit/check-site.test.ts` with fixture dists: a correct tree, a broken link, a missing same-file fragment id, a trailing-slash link, a `new URL` worker reference to a missing file.
    - **Property 4: Every local link resolves**
    - Write `tests/unit/check-site.links.property.test.ts`: for any generated `site/dist` tree (random folders and files, `.html`, `.css`, and `.js` files holding references of every extracted form, relative and root-absolute, with queries, fragments, and trailing slashes), `checkSite` reports a finding for a reference exactly when its target does not exist (or the same-file id does not exist) and reports none when the target exists.
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.6, 20.7, 20.8**

  - [x] 16.3 Write the external-URL, headers-scope, and structure rules
    - Extend `checkSite` with: the external-reference rules of design Component 12 (`.html` and `.css` anywhere; string scan of the Landing_Page `.js`, `.json`, and `.svg`; reference forms only for the copied app `.js`; the `_headers` policy rule: no `http:`, `https:`, `*`, `unsafe-inline`, `unsafe-eval`, and `data:` only in the `/shell/*` block); the structure rules (the paths of Requirement 18, criterion 1; exactly one `_headers`; no block with the scope `/*`; every scope names a path that exists; the font files `*.woff2` under `assets/`; no `data:` in a Landing_Page `.css`; the repository URL only in an anchor `href` with `rel="noopener noreferrer"`, never in a resource attribute, a `link` `href`, a CSS `url()`, or the CSP; no inline `<script>` and no `style` attribute in `index.html`).
    - Extend `tests/unit/check-site.test.ts` with fixtures: an external script URL, an allowlisted namespace, the repository URL in each forbidden place, a `/*` scope, a second `_headers`, a missing font, a `data:` URL in CSS, and a URL-looking string inside a copied app bundle (no finding).
    - **Property 5: No external URL**
    - Write `tests/unit/check-site.external.property.test.ts`: for any generated tree and any external reference placed in an `.html` attribute, a CSS `url()` or `@import`, or a Landing_Page JS, JSON, or SVG string, `checkSite` reports a finding unless the value is in the allowlist; the allowlisted repository URL gives no finding as an anchor `href` with `rel="noopener noreferrer"` and a finding in any resource attribute or in the CSP; a URL-looking string inside an app bundle outside a reference form gives no finding.
    - **Validates: Requirements 14.3, 19.5, 20.4, 20.5**

  - [x] 16.4 Write the real-dist test
    - `tests/unit/site-dist.test.ts`: when `site/dist/` exists, `checkSite` returns no finding and has extracted the references of Requirement 20, criterion 3, including at least one wasm reference and one worker reference of the Ghost Hand bundle (so that a change of the bundle format cannot turn the check into a no-op); otherwise the test is skipped with a clear message.
    - _Requirements: 20.1, 20.3_

- [x] 17. Checkpoint - Assembly and check
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, and `build`. Confirm that Properties 4, 5, and 11 pass and that the assembly tests pass on fixtures. Do not run the real `build:site` yet (task 20). Ensure all tests pass, ask the user if questions arise.

- [x] 18. Home link in the apps
  - [x] 18.1 Add the "Ghost Run+ home" link to `apps/ghost-shell`
    - Add one anchor with the text "Ghost Run+ home" and the relative target `../` to the header of the app, in the app's fixed-text module if it has one. No external URL, no new dependency, no other change.
    - Add a Testing Library test in the app's existing test folder: the link renders in the header with the exact text and `href="../"`. Run the app's tests, `typecheck`, `lint`, `build`, and `test:dist`; they must pass unchanged otherwise.
    - _Requirements: 23.2_

  - [x] 18.2 Add the "Ghost Run+ home" link to `apps/ghost-hand`
    - Add the same anchor to the header of the app. Keep the app's text snapshots and the file `tests/capabilities.expected.json` consistent if they list header content, and change nothing else.
    - Add a Testing Library test in the app's existing DOM test folder for the text and `href="../"`. Run the app's unit and dom tests, `typecheck`, `lint`, and `build`.
    - _Requirements: 23.2_

- [x] 19. Documentation
  - [x] 19.1 Update the repository `README.md`
    - Add the link to the site section with the command `pnpm build:site` and the output folder `site/dist/` (the deployed URL is added by the owner after deployment, open item O7). Add the Ghost Cloud row to the table "One skeleton, two apps": the third world, `worlds/ghost-cloud/`, built by the `world-smith` agent, with no real mode and no screen of its own yet. Add one line to the "Not written by Kiro" paragraph: the landing page design draft (mockup) was made by Claude Code, and Kiro built the page from it. Confirm the rows added by task 1.3 are present. Keep the file free of hidden Unicode.
    - Add `tests/unit/readme.test.ts` to the site package: the README contains `pnpm build:site`, `site/dist/`, a Ghost Cloud row, the "Not written by Kiro" line, the `@fontsource/fredoka` row with OFL-1.1, and the favicon row.
    - _Requirements: 14.4, 22.1, 22.2, 22.3, 22.4_

  - [x] 19.2 Append the measured results to `docs/measurements.md`
    - Append one section "Site measurements" with: the duration of the gated record test (task 5.5) and the reason it is gated (Requirement 21, criterion 3); the duration of the full site test run (it must stay within 60 s); the duration of `assemble` with the three app builds present (the limit is 60 s on the Reference_Machine, Requirement 21, criterion 6; run it after task 20 if the builds are not present yet and note it); the output of the possession scan of `site/` and `.kiro/specs/site/`; and the counts printed by the Build_Script.
    - Do not edit `docs/devlog.md`.
    - _Requirements: 21.3, 21.6, 22.5, 22.6_

- [x] 20. Final checkpoint - Build the site and run every gate
  - From the repository root run `corepack pnpm build:site`. It builds the three apps and the kit, assembles `site/dist/`, and runs the Site_Check. Fix whatever fails (in `site/` only; if the failure is in an app build, report it).
  - Run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, and `lint`, and the gated `test:record`. Run the tests of `apps/ghost-shell` and `apps/ghost-hand` once more (task 18 edits them). Run `corepack pnpm lint` and `corepack pnpm typecheck` for the workspace.
  - Run the possession scan of `site/` (without `node_modules`, `build`, and `dist`) and `.kiro/specs/site/`: from `integrations/kiro-hook`, a one-off Node script that lists the files, calls `scanFiles(files, { markdown: 'by-extension' })` from `@ghost-run/core/possession-node`, and exits non-zero unless `report.outcome` is `clean`. Print `formatReport(report)` on failure. The script is not added to the repository.
  - Confirm: Properties 1 to 12 each have a test with at least 100 runs in the Short_Run; `site/dist/` has the paths of Requirement 18, criterion 1 and exactly one `_headers`; `git status` shows changes only in `site/`, `.kiro/specs/site/`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `.kiro/steering/structure.md`, `README.md`, `docs/measurements.md`, and the two app header links with their tests. Ensure all tests pass, ask the user if questions arise.
  - Report the files changed, the test results, the `REPO_URL` value to confirm, any value of the recorded runs that differed from the requirements, and the items left to the owner (see Notes).

- [x] 21. Content-Security-Policy for `/hand/` (open question O3)
  - Add `handHeaderPolicy()` to `site/scripts/lib/csp.mjs` and the block `/hand/*` to `buildRootHeaders` (a `/hand/` block was first added too and removed again: both matched `/hand/` and doubled the header on the live site) in `site/scripts/lib/headers.mjs`. The policy is the Landing_Policy plus `'unsafe-eval'` in `script-src`.
  - In `site/scripts/check-site.mjs`: require `/hand/*`, fail on a `/hand/` block, let `'unsafe-eval'` pass only in `/hand/*`, and apply the positive directive rule of `/` to them.
  - Update `headers.test.ts`, `headers.property.test.ts`, `csp-kit.property.test.ts`, `build-site.test.ts`, and `check-site.test.ts`.
  - Add a test that no request path of the site matches two blocks that both set `Content-Security-Policy` (Cloudflare matching: a `*` splat matches any characters, none included). `/`, `/index.html`, `/kit/`, and `/kit/index.html` are literal and stay.
  - Browser check: serve `site/dist` with the root `_headers` applied, open `/hand/` in Chrome through Playwright, press `Play demo`; the console shows no violation and the demo reaches step 4 of 4. Without `'unsafe-eval'` the check fails with `script-src eval`.
  - _Requirements: 19.3, 19.5, 19.8_

## Notes

- Every task is required. No task is marked optional.
- Property map (design number: task): 1 (12.1), 2 (6.3), 3 (5.5), 4 (16.2), 5 (16.3), 6 (10.4), 7 (10.5), 8 (4.2), 9 (3.2), 10 (5.2), 11 (15.2), 12 (11.3). The five properties named in the brief are reality-never-changes (Property 1), parts-matrix-equals-imports (Property 2), recorded-runs-equal-fresh-run (Property 3), every-local-link-resolves (Property 4), and no-external-url (Property 5).
- Tasks 1.1, 18.1, and 18.2 edit files outside `site/`. Task 1.1 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- **Not Kiro tasks (owner or Claude Code):**
  - The screenshot comparison of the built page and the Mockup at 920 px and 1280 px (hero, recipe, costumes with X-ray off and on, each world at each of the five steps) and the list of intentional differences, recorded in `docs/measurements.md` (Requirement 2, criteria 8 and 9).
  - The visual check that the X-ray skeletons look identical and glowing through `<use>` (jsdom does not resolve styles inside a `<use>` shadow tree).
  - The browser load of `/` under the root `_headers` with no CSP violation in the console, including playing all three worlds and toggling X-ray, and the optional load of `/hand/` under a candidate policy (Requirement 19, criterion 7; open item O3).
  - Confirming `REPO_URL` (open item O1), the deployed URL for the README (open item O7), the choice of host, and the deployment itself (Requirement 18, criterion 9).
  - The devlog entry for the site (Requirement 22, criterion 5).
  - The keyboard and screen-reader pass of Requirement 15 (tests cover roles, names, and focus order only).
- The record script imports the pipeline modules of `apps/ghost-shell` and `apps/ghost-hand` by relative path in one build-time file (open item O5). The ESLint block of task 1.2 limits this to `scripts/record-runs.measure.ts`.
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "3.2"] },
    { "id": 5, "tasks": ["4.1", "5.1", "6.1", "6.2"] },
    { "id": 6, "tasks": ["4.2", "5.2", "5.3", "6.3"] },
    { "id": 7, "tasks": ["5.4"] },
    { "id": 8, "tasks": ["5.5"] },
    { "id": 9, "tasks": ["7"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["8.3"] },
    { "id": 13, "tasks": ["8.4"] },
    { "id": 14, "tasks": ["8.5"] },
    { "id": 15, "tasks": ["9"] },
    { "id": 16, "tasks": ["10.1"] },
    { "id": 17, "tasks": ["10.2"] },
    { "id": 18, "tasks": ["10.3"] },
    { "id": 19, "tasks": ["10.4", "10.5"] },
    { "id": 20, "tasks": ["11.1"] },
    { "id": 21, "tasks": ["11.2"] },
    { "id": 22, "tasks": ["11.3"] },
    { "id": 23, "tasks": ["12.1"] },
    { "id": 24, "tasks": ["13"] },
    { "id": 25, "tasks": ["14.1"] },
    { "id": 26, "tasks": ["14.2"] },
    { "id": 27, "tasks": ["15.1"] },
    { "id": 28, "tasks": ["15.2", "15.3"] },
    { "id": 29, "tasks": ["16.1"] },
    { "id": 30, "tasks": ["16.2"] },
    { "id": 31, "tasks": ["16.3"] },
    { "id": 32, "tasks": ["16.4"] },
    { "id": 33, "tasks": ["17"] },
    { "id": 34, "tasks": ["18.1", "18.2"] },
    { "id": 35, "tasks": ["19.1", "19.2"] },
    { "id": 36, "tasks": ["20"] },
    { "id": 37, "tasks": ["21"] }
  ]
}
```

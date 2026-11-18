# Implementation Plan: ui-kit

## Overview

This plan builds the workspace package `ui/` (`@ghost-run/ui`): TypeScript, React 19, Vite 7. The kit draws data that `core`, the possession detector, and the ward engine already produced. It computes no verdict, diff, finding, or thread link. The package has a pure view-model layer (`ui/src/model/`, no React, no DOM) and a component layer (`ui/src/components/`). `ui/src` is exported as source, and a Vite gallery page in `ui/` is the build and static-hosting check target (design decisions D1 to D15).

The plan follows the implementation order of the design:

1. Scaffolding: package files, the ESLint configuration, dependency installation, version guard test, and the test harness.
2. The color tokens and the contrast gate (UI-P6). The hand-computed contrast values of the design are checked by a script before any component exists.
3. The view-model layer: shared helpers, the escaper, secret-like key redaction, then the view models of the six parts, each with its property test (node environment, full size).
4. A mid-plan checkpoint.
5. React foundations, styles, SVG assets, and the components. Component tests: static markup legs, DOM legs, accessibility (axe-core, role-based queries, keyboard, reduced motion), and theme switching.
6. The gallery, the dist scan, the CSP meta tag, and the `vite preview` serving check.
7. Source hygiene: hidden Unicode scan, the `dangerouslySetInnerHTML` double layer, the `axe-core` import scan, and the dependency direction check.
8. Documentation tasks: the README tables and the steering update.
9. The isolated task that adds the `@ghost-run/ui` import ban to the `core` ESLint configuration.
10. Short_Run timing measurement, Open Questions resolution, and the final checkpoint.

State that already exists and is not recreated by this plan:

- `pnpm-workspace.yaml` already lists `ui` (verified by the design). Task 1.1 confirms it and edits it only if the entry is missing.
- `core/src/index.ts` already re-exports the possession module, so `Finding`, `ScanResult`, `Needle`, and `ThreadLink` reach the kit through `@ghost-run/core`.
- `core` and `ghost-runner` already use `vitest ^3.2.7`, `fast-check ^4.10.2`, `typescript ^5.9.0`, `eslint ^10.15.0`, and `typescript-eslint ^8.73.0`. `ui/` uses the same ranges.
- The `ui/` directory does not exist yet.

Decisions reflected in this plan:

1. **D4 (jsdom 26.1.0).** `happy-dom` is not installed. Only `tests/dom/**` runs in jsdom. The other test folders run in `node`.
2. **D5 (Render_Output).** Static legs use `renderToStaticMarkup` of pure `*View` functions in the node environment. DOM mounts are used only for effects, focus, events, and axe audits. `react-dom/server` is imported only under `tests/`.
3. **D13 and D14.** Secret-like key redaction lives in `model/redact.ts`. The Assurance_Text and the "Not claimed" banner are independent outputs of `model/claims.ts`.
4. **D15 (ESLint 10 only).** No `eslint-plugin-react` and no `eslint-plugin-jsx-a11y`. Accessibility is checked by axe-core DOM tests and role-based queries.
5. **Contrast gate.** Task 2.2 runs UI-P6 right after the tokens exist. If a pair fails, the token changes. The threshold and the test never change. Every component task depends on task 2.2.
6. **The `core` ESLint change is isolated.** Task 13.1 adds the `@ghost-run/ui` import ban to `core/eslint.config.mjs` as a stand-alone task in its own wave. It runs only after the possession and wards specs have finished their `core` changes. Until task 13.1 is done, Requirement 1.6 is not claimed as verified.
7. **Claims.** The kit asserts none of the safety properties P1 to P8. It displays the claim flags it receives. Test files and the README use `UI-P1` to `UI-P11` for the render properties of this spec and never `P1` to `P8`.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: ui-kit, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fast-check`, and prints the seed (`PBT seed=<n>`) before `fc.assert`. Test titles say `UI-P<n>`, for example `UI-P7`, and never `P7`. The property numbering and titles are those of the Correctness Properties section of `design.md`, with `Property N` equal to `UI-P<N>` of Requirement 15 criterion 2.
- **Run sizes.** Legs follow the Testing Strategy table of the design.

| Leg | Environment | Short_Run | Nightly_Run |
|---|---|---|---|
| V (view model, escaper, contrast) | node | 100 | 10,000 |
| S (static markup of a view) | node | 100 | 10,000 |
| SP (static markup parsed into a `template`) | jsdom | 100 | 10,000 |
| DOM (mount, toggle, interact, unmount) | jsdom | 25 | 500 |

  `GHOST_PBT_MODE=nightly` selects the Nightly counts. `GHOST_PBT_SEED` replays a run. A property test has a per-test timeout of 60,000 ms in Short_Run and none in Nightly_Run.
- **No optional tasks.** Every task in this plan is required, including unit tests, example tests, property tests, accessibility tests, scan tests, dist scan tests, and hygiene tests. No task carries the optional `*` marker.
- **Test data.** Canary values only (`sk-CANARY-` followed by generated characters from `[A-Za-z0-9_-]`). Hostnames only from `.example`, `.test`, `.localhost`, `.invalid`, and the documentation range `192.0.2.x`. Hidden Unicode characters are written only as escape sequences or built with `String.fromCodePoint`, and an HTML comment opener is built from code points. Never write them literally in a file under `ui/` or `.kiro/specs/ui-kit/`.
- **Purity.** No file under `ui/src` reads a clock, random source, environment variable, storage, network, or console. No file under `ui/src` imports `react-dom/server`, `axe-core`, `three`, or `@mujoco/mujoco`. `ui/src` imports `@ghost-run/core` with `import type` only. Tests may import values from `@ghost-run/core` (the scanner is the oracle).
- **Verification commands.** `pnpm --filter @ghost-run/ui test` (Short_Run), `pnpm --filter @ghost-run/ui test:nightly`, `pnpm --filter @ghost-run/ui test:dist`, `pnpm --filter @ghost-run/ui typecheck`, `pnpm --filter @ghost-run/ui lint`, and `pnpm --filter @ghost-run/ui build`.
- **Scope of this plan.** Coding tasks only. The 3D ghost overlay, the wards editor, seance routing, the `ghost-log` hook, and the production of Grave_Entries belong to other specs. No hook change is part of this plan, because the `contract-pbt` hook covers `core/**` and `worlds/**` only.

## Tasks

- [x] 1. Package scaffolding, lint, and test harness
  - [x] 1.1 Confirm the workspace entry and create the package and build configuration files
    - Read `pnpm-workspace.yaml` and confirm it lists `ui`. The design verified that it does. Edit the file only if the entry is missing.
    - Create `ui/package.json` as specified in the design: name `@ghost-run/ui`, `private`, `type: module`, `main` and `types` at `src/index.ts`, `exports` for `.` and `./styles.css`, `sideEffects` for CSS, `engines.node >=20.19`, the scripts `test`, `test:nightly`, `test:dist`, `typecheck`, `lint`, `build`, `preview`, `clean`, license MIT. The `dependencies` list is exactly `@ghost-run/core` (`workspace:*`), `react`, and `react-dom`. The `devDependencies` are the ranges of the design table.
    - Create `ui/tsconfig.json` (strict, `jsx: react-jsx`, `types: []`, `paths` for `@ghost-run/core` to `../core/src/index.ts`) and `ui/tsconfig.node.json` (Node types, includes the config files and `tests/scan`, `tests/dist`).
    - Create `ui/vite.config.ts`: `base: './'`, no `server.proxy`, no `define`, build options `outDir: 'dist'`, `emptyOutDir`, `target: 'es2022'`, `sourcemap: false`, `assetsInlineLimit: 0`, `modulePreload.polyfill: false`, `cssCodeSplit: false`, and a build-only plugin that injects the CSP meta tag of the design into `index.html`.
    - Create `ui/vitest.config.ts` with the React plugin, the alias of `@ghost-run/core` to `core/src/index.ts`, typecheck for `tests/**/*.test-d.ts`, and `projects` named `model`, `static`, `scan`, `dist` (node) and `dom` (jsdom, with `tests/support/setup-dom.ts`). If the inline `projects` syntax is not accepted by Vitest 3.2.7 (Open Question Q2), use per-file `@vitest-environment jsdom` docblocks and per-folder scripts instead, and record the choice.
    - Create `ui/index.html` (loads `gallery/main.tsx`), a minimal `ui/gallery/main.tsx`, and an empty `ui/src/index.ts` so that later tasks only fill them in.
    - Confirm the root `.gitignore` lists `dist` and `node_modules`; add the entries only if missing.
    - No LLM call and no network call anywhere in the package.
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 13.1, 13.4, 16.5_

  - [x] 1.2 Create `ui/eslint.config.mjs`
    - Flat config, consistent with `core`. Rules for `src/**` and `gallery/**`: `no-restricted-imports` (patterns for `@ghost-run/ghost-runner`, `**/ghost-runner/**`, `**/apps/**`, `**/integrations/**`, `**/worlds/**`, `three`, `@mujoco/mujoco`, core internals), `no-restricted-syntax` (the selector list of the design: type-only `@ghost-run/core` imports, the `dangerouslySetInnerHTML` attribute and property, positive `tabIndex`, handlers on non-interactive elements, `style` props, `innerHTML` and `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timer arguments, `new Date`), `no-restricted-globals` for clock, storage, network, and console globals, and `no-restricted-properties` for `Math.random`, `navigator.sendBeacon`, and `document.cookie`.
    - Enable the two fixed `dangerouslySetInnerHTML` rules of `@eslint-react/eslint-plugin` as `error` under the plugin key `@eslint-react`: `@eslint-react/dom-no-dangerously-set-innerhtml` and `@eslint-react/dom-no-dangerously-set-innerhtml-with-children` (hyphen form, verified against `@eslint-react/eslint-plugin` 5.30.3). No load-time resolution and no try-both fallback (Open Question Q1 is resolved). Register `eslint-plugin-react-hooks` with only `rules-of-hooks` and `exhaustive-deps` enabled.
    - Add a `tests/**` block that keeps the forbidden-imports rule but allows value imports from `@ghost-run/core`. Repeat the full `no-restricted-syntax` list in each block that sets it, because a later block replaces rule options.
    - Do not use `eslint-plugin-react` or `eslint-plugin-jsx-a11y`.
    - _Requirements: 1.4, 1.5, 4.1, 4.2, 4.6_

  - [x] 1.3 Install dependencies and record the resolved facts
    - Run `pnpm install` for the workspace. Confirm the install creates no changes in `core/` or other packages besides `pnpm-lock.yaml`.
    - Record in `docs/devlog.md` (append one entry): peer-dependency warnings, the resolved versions of `vite`, `vitest`, `jsdom`, `react`, `@eslint-react/eslint-plugin`, and `axe-core`, and confirm that ESLint accepts the two fixed rule IDs of the `dangerouslySetInnerHTML` prohibition (Q1, already resolved).
    - Run `pnpm --filter @ghost-run/ui exec eslint .` and `pnpm --filter @ghost-run/ui exec tsc --noEmit`. Fix `eslint.config.mjs` if ESLint reports an unknown rule.
    - _Requirements: 1.2, 1.3, 4.1_

  - [x] 1.4 Write the package guard test `ui/tests/scan/package.test.ts`
    - Read `ui/package.json`: `dependencies` has exactly `@ghost-run/core`, `react`, `react-dom`; no `happy-dom`, no `three`, no `@mujoco/mujoco`, no `eslint-plugin-react`, no `eslint-plugin-jsx-a11y`; `@eslint-react/eslint-plugin` and `axe-core` are in `devDependencies`, not in `dependencies`.
    - Read the installed `vite`, `vitest`, and `jsdom` package files and fail when the major versions are not 7, 3, and 26.
    - Read `pnpm-workspace.yaml` and require the `ui` entry.
    - The public exports `escapeForDisplay` and `isHiddenDisplay` are checked by `tests/scan/index-exports.test.ts` (task 7.8), because `src/index.ts` is empty until then.
    - _Requirements: 1.1, 1.3, 1.7_

  - [x] 1.5 Create the test harness `ui/tests/support/` and `ui/tests/fixtures/`
    - `pbt-config.ts` follows `core/tests/pbt-config.ts`: `PBT_MODE`, `NUM_RUNS_FULL` (100 or 10,000), `NUM_RUNS_DOM` (25 or 500), `PBT_TIMEOUT` (60,000 or none), `PBT_SEED`, and `params(kind)`. It reads `process` through `globalThis` and prints `PBT seed=<n>`.
    - `pbt-stats.ts` copies the `createCounter` helper of `core/tests/pbt-stats.ts` (the `ui` package cannot import core test files) and supports non-vacuity assertions for buckets with probability of at least 1 in 10.
    - `setup-dom.ts`: registers `afterEach(cleanup)`, installs a controllable `window.matchMedia` stub, sets `IS_REACT_ACT_ENVIRONMENT`, installs no `jest-dom`.
    - `markup.ts`: helpers that render a pure view with `renderToStaticMarkup`, parse markup into a `template`, list element and attribute names, and escape text for HTML comparison.
    - `fixtures/canary.ts` and `fixtures/hosts.ts`: canary generator constants and reserved hosts only.
    - Add `tests/model/support.test.ts` (unit tests): the Short and Nightly counts, the seed replay through `GHOST_PBT_SEED`, and the printed seed line.
    - _Requirements: 15.1, 15.3, 16.3, 16.4_

- [x] 2. Color tokens and the contrast gate
  - [x] 2.1 Create `ui/src/theme/tokens.ts` and `ui/src/styles/theme.css`
    - `tokens.ts` is the only module that declares colors: `Theme`, `THEMES` (dark and light token tables with the values of the design), `DECORATIVE_TOKENS`, `PairRole`, `ContrastPair`, and `CONTRAST_PAIRS` with 25 declared pairs per theme (15 text, 1 highlight text, 9 graphic) and the compositing chain of each pair (the fog layer composited over the surface first).
    - `theme.css` mirrors every token as a custom property under `[data-theme='dark']` and `[data-theme='light']`. It is the only stylesheet that contains color literals.
    - Every foreground token used by the kit is declared against `--gk-bg`, `--gk-surface`, and `--gk-fog`.
    - _Requirements: 11.5, 11.6, 11.7, 12.8, 12.9_

  - [x] 2.2 Write the contrast helper and the UI-P6 test, and run it before any component work (contrast gate)
    - **Precondition for every component task (6.1, 6.2, 6.3, 7.1 to 7.8): this task is complete and its test passes.**
    - `tests/support/contrast.ts` is an independent implementation of WCAG 2.x relative luminance, alpha compositing over a backdrop chain, and the ratio. It imports nothing from `src/`.
    - Test file `tests/model/p6-contrast.test.ts`: enumerate every pair of `CONTRAST_PAIRS` for both themes (exhaustive, 50 pairs) and require at least 4.5 for `text`, 3 for `large-text`, and 3 for `graphic`. The Short_Run leg also runs the contrast function property at 100 examples (Nightly 10,000).
    - Immediately run the test and compare the exact ratios with the hand-computed table of the design (the design values are rounded and may be off by 0.1, and every pair has a margin of at least 1.0). Record the exact values in `docs/devlog.md`.
    - If any pair fails, change the token value in `tokens.ts` and `theme.css`. Never lower a threshold and never edit the test to pass. Run the test again until it passes.
    - **Property 6: Contrast**
    - **Validates: Requirements 11.6, 12.8, 12.9, 12.10**
    - Generators: every pair of each theme; two generated colors for `contrast(a, a) === 1`, symmetry, `>= 1`, black on white equal to 21, and compositing a color over itself with any alpha returns the same color. Environment: node, V leg, 100 Short_Run and 10,000 Nightly_Run for the function checks.

- [x] 3. View-model foundations
  - [x] 3.1 Create `ui/src/types.ts` and the shared model helpers
    - `types.ts`: `Theme`, `IsolationMode`, `IsolationClaims`, `BlacklightSource`, `GraveDetail`, `GraveEntry`, and the prop interfaces of the six components and `KitRoot`. Core types are imported with `import type` from `@ghost-run/core` only. `WardNotice` is taken from `@ghost-run/core` as is: `types.ts` does not redeclare or narrow it and nothing in `ui/src` switches on `WardNotice.kind`. Input types hold plain JSON plus the two callbacks `onOpenSeance` and `onBack`.
    - `model/limits.ts` (the limits table of the design: 120, 4,096, 200 rows, 200 scene entries and depth 8, 200 lines, 100 Findings, 200 tombstones and threads, 20 and 200 marker limits, 40, 5, generic depth 8), `model/texts.ts` (every fixed text of the kit in English, as constants), `model/guards.ts` (`isRecord`, `pick` as the Allow_List_Projection, `arrayOf`, `displayPrimitive`, `Unreadable`), `model/numbers.ts` (`formatCount`), `model/time.ts` (`parseUtcInstant`, a pure parser that never calls `Date` and accepts only the `YYYY-MM-DDTHH:MM:SS[.fff]Z` form), and `model/escape.ts` (`formatHex`, `escapeForDisplay`, `compact`, `detail`, `isHiddenDisplay`). `escapeForDisplay` and `isHiddenDisplay` are public API (exported from `ui/src/index.ts` in task 7.8).
    - The escaper replaces every Hidden_Display_Code_Point (U+200D in every position), every control code point (U+000A kept only on request), and every unpaired surrogate with `<U+XXXX>` (at least four uppercase hex digits). It is idempotent. `compact` and `detail` cut on token boundaries, never inside a `<U+XXXX>` token.
    - No React import, no DOM, no clock, no random source.
    - _Requirements: 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.5, 3.6, 3.7, 5.6, 10.1, 10.3, 14.6_

  - [x] 3.2 Implement `ui/src/model/redact.ts`
    - `SECRET_LIKE_WORDS` (the eleven words), `HIDDEN_SECRET_TEXT`, `isSecretLikeKey` (case-insensitive containment on the raw key), `redactGenericValue` (total, non-mutating, linear in the visited input; a Secret_Like_Key hides its whole subtree at any depth without descending; array indices are not keys; markers for `[nested too deep]`, `[circular reference]`, `[non-primitive]`, `[unreadable value]`; a shared non-circular reference renders in full each time), and `flattenGeneric` (pre-order rows).
    - Reads each property at most once and survives throwing getters and proxies.
    - _Requirements: 4.8, 4.9, 5.5, 5.11, 14.2_

  - [x] 3.3 Create the generators `ui/tests/fixtures/arbitraries.ts`
    - `hiddenCodePoint`, `dirtyString`, `markupString`, `canary`, `secretLikeKey` (the test holds its own copy of the eleven words), `plainKey`, `genericValue`, `unknownChange`, `sceneValue`, `circularValue`, `deepValue`, `claimsAny` (weighted so that "A and B both present", "only A", and "only B" each have probability of at least 1 in 10), `bigScan`, `scanOracle` (uses `scanText` from `@ghost-run/core` as a test-only oracle), `isoUtc`, `badTime`, structured arbitraries for `change`, `changes`, `wardVerdict`, `claims`, `needle`, `threadLink`, `finding`, `scanResult`, `graveEntry`, `graveDetail`, and `breakOne(valid)` that replaces one field or element by `fc.jsonValue()`.
    - Hand-built Findings satisfy the position rules of the possession spec, including overlapping Findings, Findings outside the text, and lists of 101 to 250 Findings. Texts of 201 to 400 lines are generated.
    - The source file contains no literal hidden character. Hosts use `.example` and `.invalid`.
    - _Requirements: 15.2, 15.4, 16.1, 16.3, 16.4_

  - [x] 3.4 Write the model-leg property test for no hidden characters (escaper)
    - **Property 3: No hidden characters**
    - **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.7, 14.6**
    - File: `tests/model/p3-escape.test.ts`. Tag `UI-P3`. Generator: `dirtyString` over every hidden category (tag, zero-width including U+200D between emoji, bidi, controls, unpaired surrogates). Environment: node, V leg, 100 Short_Run and 10,000 Nightly_Run.
    - Assertions: each hidden code point becomes its `<U+XXXX>` form with at least four uppercase digits; other code points are unchanged; `escape(escape(s)) === escape(s)`; `compact` never exceeds 120 code points, equals the first 117 code points plus `...` for longer text, and never ends inside a token; `detail` appends `[truncated]` exactly above 4,096 code points. Counter buckets: hidden category.

  - [x] 3.5 Write the model-leg property test and the examples for secret-like keys
    - **Property 4: No secret forwarding**
    - **Validates: Requirements 2.7, 4.8, 4.9, 5.5, 5.11**
    - Files: `tests/model/p4-redact.test.ts` (property) and `tests/model/redact.test.ts` (examples). Tag `UI-P4`. Generators: `secretLikeKey` (all eleven words, four letter-case variants, whole key, prefix, suffix, inside a longer key), `genericValue` up to depth 6, `circularValue`, `deepValue`. Environment: node, V leg, 100 Short_Run and 10,000 Nightly_Run.
    - Property: `isSecretLikeKey(k)` equals the independent one-line oracle for every generated key; `redactGenericValue` returns a `hidden` node exactly for the generated secret-like keys, hides the whole subtree, does not throw, does not mutate, and terminates for circular and over-deep input.
    - Examples: the eleven words in lower, upper, and mixed case; `userSessionId`, `X-Auth-Token`, `API_KEY`; the non-matches `name` and `path`; the documented misses `privateKey`, `x-api-key`, and `pwd`; the documented false positive `session_count`; a secret-like key at depth 3 that hides a nested object; array indices are not keys; a circular object; a 9-level value; a throwing getter; a shared non-circular reference rendered twice.

- [x] 4. View models of the six parts
  - [x] 4.1 Implement `ui/src/model/mirror.ts` and `ui/src/model/scene.ts`
    - `buildMirrorModel(input)` returns the model or `unreadable`. One row per `Change` of each step in step order and index order, with the row-by-kind table of the design (`file-created`, `file-overwritten`, `file-deleted` with `vanish`, `symlink-changed`, `sql-row-count` with `rows lost: <n>` and `table dropped`, unrecognized rows with at most 5 primitive fields passed through `redactGenericValue`, and one `Unreadable item <index>` row for a non-record element). Steps that are not arrays become one unreadable step. The summary is `<N> changes in <M> steps`, and the empty text is `No changes: the ghost run left the mirror unchanged.`
    - Derived numbers such as rows lost are computed only from supplied values. The model never states that reality is unchanged.
    - `scene.ts` builds the flattened `SceneTree` from `redactGenericValue`, applies the entry and depth limits, and reports the `Showing <shown> of <total>` data.
    - _Requirements: 2.8, 4.8, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.11, 5.12, 5.13, 14.1, 14.3, 14.5_

  - [x] 4.2 Implement `ui/src/model/candle.ts` and `ui/src/model/claims.ts`
    - `buildCandleModel(verdict)`: the state is chosen by `verdict.verdict` alone through a lookup table (`lit`, `flickering`, `out`, `unknown`, `idle`) with the fixed text labels, accessible labels, and icon ids. Ward lines are the distinct `wardId` values in order of first appearance. Violation and notice items (every notice renders as `step <stepIndex>: <reason>` whatever its `kind`; the model never switches on or narrows `WardNotice.kind`), `<k> notices need review`, `Violated ward: none reported`, the `Data inconsistent` text, and the escaped unknown value of at most 40 code points. A non-record violation becomes `Unreadable item <index>`. The Candle texts never contain `approved` or `safe`.
    - `buildClaimModel(claims)` is total and never returns `unreadable`. It computes condition A (`assuranceText`) and condition B (`staticBanner` or `notClaimedBanner`) separately from the effective claim lines, following the decision table of the design. A claim counts as claimed only when the supplied value is the boolean `true`. `static-analysis` always yields the static banner with the reason suffix only for `docker-unavailable` and `box-image-missing`. `IsolationClaims.notApplicable` (only `P5` and `P6`, decision D16) makes a line `not-applicable` (text `P<n>: not applicable to this world`, icon `not-applicable`) when well formed in a sealed mode and the flag is not `true`; it never counts toward condition B. The not-claimed banner carries ` No rehearsal took place.` for `reason` `static-analysis` and ` Some steps were not rehearsed.` for `reason` `unsupported-step`, nothing otherwise. `ClaimLine` also carries `status`, `text`, and `icon`. `IconId` is imported from `model/icons.ts`, the single definition (also used by `mirror.ts` and `candle.ts`).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.12, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 7.12, 14.1, 14.3_

  - [x] 4.3 Implement `ui/src/model/blacklight.ts`
    - `buildBlacklightModel(sources, mode, reveal)`: one pass per source that splits the text into code points and lines (`\n`, `\r\n`, lone `\r`), marks shown-covered and overflow-covered code points, places Findings (`offset`, `length` within the text), and builds markers (category, `line:column` from the supplied Finding, at most 20 hex items plus `+<k> more`, `rendering` at most 200 code points plus `[truncated]`).
    - The covered-code-point table of the design: shown-covered code points are omitted when the switch is off and shown as a marker when on; overflow-covered (Findings beyond the 100th) and uncovered hidden code points are shown as `<U+XXXX>` in both states, because showing a hidden character is safer than hiding it (the exception line of Requirement 8 criterion 5, design 14.5). The Findings list and the in-text markers use the same first 100 Findings. Lines are limited to 200. Summary counts and per-category counts always use the total Findings. Unplaced Findings go to the group `Findings that could not be placed`. Empty text states: `No hidden text found by the blacklight.` and `No texts to scan.`
    - The model does not scan text and never recomputes line or column of a Finding.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.11, 8.12, 14.1, 14.3, 14.5, 14.6_

  - [x] 4.4 Implement `ui/src/model/thread.ts`
    - `buildRedThreadModel(input)`: pairs `needles[i]` with `links[i]` by index only, up to the shorter length, without guessing. Action end (`step <stepIndex>`, origin, escaped value, optional action label), cause end for `found` links (`source`, `kind`, `line:column`, `lineText`, `matched host key`, the `hidden text` warning and `Turn on the blacklight to reveal it.`), the `not-found` text, the accessible names of both forms, the mismatch text `Red thread data mismatch: <a> needles, <b> links.`, and the empty text `No addresses or paths to trace.`
    - The cause end is built only from a `found` link whose fields have the right types. `links[i].needle` is never used for pairing.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 14.1, 14.3_

  - [x] 4.5 Implement `ui/src/model/graveyard.ts` and `ui/src/model/seance.ts`
    - `buildGraveyardModel(entries)`: one tombstone model per entry (none merged or dropped, including equal ids), compact command, `recordedAt` as supplied (escaped), `time unreadable` flag, compact ward ids, the accessible name `Open seance for blocked command <command>, recorded <recordedAt>, ward <ids>`, `rawIdValid` for the pattern `^[A-Za-z0-9_-]{1,64}$`, the summary `<N> blocked commands`, and the empty text `No blocked commands yet.` Order: valid instants latest first with input order kept for equal instants (stable sort on a precomputed key), then invalid-time entries in input order. A non-record element becomes an `Unreadable item <index>` slot.
    - `buildSeanceModel(entry)`: the full command (detail limit), `recordedAt`, ward ids, and the list of parts that are not recorded (`wardVerdict`, `claims`, `changes`, `sources`, `needles`, `links`; `actionLabels` has no "not recorded" line).
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.11, 14.1, 14.3, 14.5_

  - [x] 4.6 Write the property test for change coverage
    - **Property 1: Change coverage**
    - **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 5.8, 14.5**
    - Files: `tests/model/p1-mirror.test.ts` (V leg, this task). The S leg is task 8.1. Tag `UI-P1`. Generators: `changes` with known kinds with valid fields, known kinds with missing or mistyped fields, unknown kinds, non-record elements, empty steps, up to 30 changes per step, and row counts that are negative, fractional, `NaN`-like, very large, or strings. Environment: node, V leg, 100 Short_Run and 10,000 Nightly_Run.
    - Assertions: one row per element keyed `<stepIndex>.<index>` without gaps, duplicates, or reordering; the summary `<N> changes in <M> steps`; step labels; `1,206`-style grouped numbers; `rows lost: <before - after>` exactly when both counts are finite non-negative integers and `rowsBefore > rowsAfter`; `invalid number` for other counts; more than 200 rows give 200 initial rows and `Showing 200 of <N>`. Counter buckets: kind class, empty step, count validity.

  - [x] 4.7 Write the model-leg property test for the candle mapping
    - **Property 2: Candle mapping**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10**
    - File: `tests/model/p2-candle.test.ts` (V leg). The S leg is task 8.2. Tag `UI-P2`. Generators: all three verdicts with 0 to 12 violations (repeated ward ids, hidden code points in ids and reasons) and 0 to 12 notices whose `kind` includes kinds beyond the known `effect-outside` and `observed-event` (for example `unsupported-step`, `path-escape`, `content-inspection`, and arbitrary strings), unknown verdict values (strings, numbers, booleans), absent verdict, and unrelated extra fields. Environment: node, V leg, 100 and 10,000.
    - Assertions: exactly one state chosen by `verdict` alone; distinct ward lines in first-appearance order; violation lines in input order; every notice line is `step <n>: <reason>` regardless of its `kind`; `<k> notices need review` for `warn`; the `block` with no violations text; `pass` with violations stays `lit` with the inconsistency text; unknown values never `lit` and escaped to at most 40 code points; unrelated fields change nothing; `idle` for an absent verdict.

  - [x] 4.8 Write the model-leg property test for claim honesty
    - **Property 7: Claim honesty**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9, 7.10, 7.11, 7.12**
    - File: `tests/model/p7-claims.test.ts` (V leg). The S leg is task 8.3. Tag `UI-P7`. Generator: `claimsAny` (absent, non-record, `mode` from the three values plus unknown strings and numbers, each of the three booleans independently `true`, `false`, or a non-boolean, `reason` from the four enum values, other strings, or absent, and `notApplicable` valid, with `P1` or junk entries, a non-list, or absent). Environment: node, V leg, 100 and 10,000.
    - Assertions: condition A (Assurance_Text) holds if and only if `mode` is `docker-box` or `playground` and `p1Claimed` is the boolean `true`, and its text matches the mode; condition B (banner) holds if and only if `claims` is absent or malformed or at least one of P1, P5, P6 is neither claimed nor validly not applicable (P1 only claimed); a not-claimed banner names exactly the not-claimed ids in the order P1, P5, P6, followed by the reason wording (`static-analysis`: ` No rehearsal took place.`; `unsupported-step`: ` Some steps were not rehearsed.`; otherwise none); a validly not-applicable line has the text `P<n>: not applicable to this world` and never the text `NOT claimed`; a `static-analysis` value always gives the static banner; `Isolation status unknown.` is present if and only if `claims` is absent or malformed; A and B are checked separately and may both be present. Counter buckets: mode, `p1Claimed`, both or one of A and B.

  - [x] 4.9 Write the model-leg property test for blacklight coverage
    - **Property 10: Blacklight coverage and involution**
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.13, 14.5**
    - File: `tests/model/p10-blacklight.test.ts` (V leg). The S leg is task 8.5 and the DOM leg is task 8.12. Tag `UI-P10`. Generators: texts with hidden code points inserted at arbitrary positions and the `scanText` oracle result; hand-built Findings including overlapping, outside-the-text, and 101 to 250 Findings; texts of 201 to 400 lines; reveal sets. Environment: node, V leg, 100 and 10,000.
    - Assertions (with `n` Findings and `k = min(n, 100)` shown Findings): one placed entry per shown Finding in order; markers equal the placed shown Findings; unplaced shown Findings are listed under the unplaced group; `Showing 100 of <n>` data when `n > 100` and the reveal state lists all; every code point covered only by an unrevealed overflow Finding (beyond the 100th) appears as `<U+XXXX>` in both states, including `off` (Requirement 8 criterion 5 exception); 200 lines and `Showing 200 of <total>`; the summary equals `<source>: <n> findings` and the category counts sum to `n` in every limit and reveal state; no code point covered by a placed shown Finding appears in the `off` text; an uncovered hidden code point appears as `<U+XXXX>` in both states; the model is a pure function of `mode` for a fixed reveal (off, on, off gives equal models).

  - [x] 4.10 Write the model-leg property test for red thread pairing
    - **Property 11: Red thread pairing**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.12**
    - File: `tests/model/p11-thread.test.ts` (V leg). The S leg is task 8.6. Tag `UI-P11`. Generators: 0 to 12 needles (all three origins, any step index, hidden code points in values), equal-length and unequal-length link lists (`found` with arbitrary source, kind, line, column, line text, `matchedKey`, `hidden`; and `not-found`), optional action labels. Environment: node, V leg, 100 and 10,000.
    - Assertions: one thread per pair in needle order; exact `source`, `line`, and `column` for `found`; `matched host key` exactly for `host`; `hidden text` and `Turn on the blacklight to reveal it.` exactly when `hidden` is true; no cause end for `not-found`; both accessible name forms; `min(a, b)` threads and the mismatch text for unequal lengths.

  - [x] 4.11 Write the model-leg property test for graveyard coverage and order
    - **Property 9: Graveyard coverage and order**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.11, 10.12, 14.5**
    - File: `tests/model/p9-graveyard.test.ts` (V leg). The S leg is task 8.4. Tag `UI-P9`. Generators: 0 to 40 entries with valid and invalid ids (including duplicates), valid UTC instants with and without milliseconds, equal instants, invalid times such as `2026-13-40T25:61:61Z` and `2026-11-20 02:14:09`, 0 to 5 ward ids, hidden code points in commands and ward ids, and lists above 200 entries. Environment: node, V leg, 100 and 10,000.
    - Assertions: exactly one tombstone per entry; compact command, supplied `recordedAt`, every ward id; summary `<N> blocked commands`; valid instants first by instant descending with input order for equals, then invalid times in input order with `time unreadable`; invalid ids give disabled tombstones with `No seance link: invalid id`; the accessible name form; the model `onOpen` path calls the callback exactly once with the original id and never for an invalid id; the empty text; 200 initial tombstones and `Showing 200 of <N>` above 200 with the summary still showing the total.

  - [x] 4.12 Write unit tests for the shared helpers
    - File: `tests/model/helpers.test.ts`. `formatCount` (`1206` becomes `1,206`; negative, fractional, `NaN`-like, and string input gives `invalid number: ` plus the escaped raw value). `parseUtcInstant` (valid forms, leap years, month lengths, the invalid forms of Open Question Q8 such as `+00:00` and lowercase `t`, no `Date` call). `compact` and `detail` boundaries (exactly 120 and 121 code points, exactly 4,096 and 4,097). `escapeForDisplay` on a lone surrogate, U+200D between emoji, and U+000A with and without `keepNewline`. `pick` returns only named own properties. `displayPrimitive` for non-primitive values.
    - Fixed-text checks that the constants in `model/texts.ts` equal the literals pinned by the requirements (`PASS`, `Candle out: block.`, the static banner, the two Assurance_Text strings).
    - _Requirements: 2.7, 3.1, 3.2, 3.5, 3.6, 5.6, 6.1, 7.3, 10.3, 14.6_

  - [x] 4.13 Write the type-level test `ui/tests/types.test-d.ts`
    - Assert that no input type of the kit contains `SecretValues`, `EvaluateInputs`, `Uint8Array`, or `Map` (each props interface extends a JSON-or-function shape).
    - Assert that a structural copy of the ghost-runner `Isolation` field list is assignable to `IsolationClaims` (the kit cannot import `ghost-runner`).
    - Assert that the prop types of the six components match the input table of Requirement 2 criterion 3.
    - _Requirements: 2.3, 4.4_

- [x] 5. Checkpoint - Model layer complete
  - Run `pnpm --filter @ghost-run/ui test`, `typecheck`, and `lint`. Confirm the contrast gate (task 2.2) passes and that no component exists yet. Ensure all tests pass, ask the user if questions arise.

- [x] 6. React foundations, SVG assets, and styles
  - [x] 6.1 Create the SVG art components and the SVG test
    - **Precondition: task 2.2 is complete and passing.**
    - `components/art/Icon.tsx` imports the single `IconId` type from `model/icons.ts` (already created in the preflight; do not declare a second union) and holds geometry only: the exact geometry of the icon table of the design for every id of `ICON_IDS` (candle-lit, candle-flicker, candle-out, candle-unknown, candle-idle, check, ban, not-applicable, cloud, lamp, bulb, thread, hidden-text, warning, link-changed, the four state icons, chevron, back). A prop string can never select an icon or inject markup.
    - `FlameArt.tsx` (lit, flickering, and out shapes, wisp for out), `SmokeLayer.tsx` (decorative, behind text), `TombstoneShape.tsx` (arch, base line, inscription lines, no cross), and the red thread connector. All are original geometry in this package, use `currentColor` or token classes, and are `aria-hidden="true"` with `focusable="false"`.
    - Test `tests/static/svg.test.tsx`: every icon path equals the design table; the five candle icons are pairwise different in shape; the tombstone path has no crossing strokes; every decorative SVG has `aria-hidden`; no `style` attribute and no literal color.
    - _Requirements: 6.2, 10.13, 12.3, 12.4, 13.5, 13.6, 13.7_

  - [x] 6.2 Create hooks, `Placeholder`, `KitBoundary`, and `Reveal`
    - **Precondition: task 2.2 is complete and passing.**
    - `hooks/useReducedMotion.ts` (`useSyncExternalStore` over `matchMedia`, server snapshot `false`, returns `false` when `matchMedia` is missing) and `hooks/useFocusReturn.ts` (per-document store in a `WeakMap`, `remember`, `restore`, pending request consumed by a mount effect).
    - `Placeholder.tsx` (`role="alert"`, text `Data unavailable: <component name> received unreadable input.` with a fixed component name), `KitBoundary.tsx` (class component with `getDerivedStateFromError`, fallback shows only the Placeholder and no text from the error or the data, and a `withBoundary` helper), and `Reveal.tsx` (a native button with the text `Showing <shown> of <total>` and an accessible name such as `Show all <total> rows`).
    - The kit logs nothing to the console and writes nothing to storage.
    - _Requirements: 4.6, 10.9, 12.1, 12.5, 14.2, 14.4, 14.5_

  - [x] 6.3 Create the stylesheets `kit.css`, `motion.css`, and `index.css`
    - **Precondition: task 2.2 is complete and passing.**
    - `kit.css`: layout, the fog layer as a background pseudo-layer only, no `filter` and no `opacity` below 1 on any text element, monospace and interface font stacks (system fonts only, no `@font-face`, no `@import`), `tabular-nums`, `pre-wrap`, `overflow-wrap: anywhere`, focus ring of 3 px with 2 px offset using `--gk-focus`, blacklight marker styling (fluorescent fill, dashed outline, icon, text), `gk-sr-only`. All colors use `var(--gk-*)`, `currentColor`, `transparent`, or `inherit`. A foreground token and a background token are set together only as a declared Contrast_Pair.
    - `motion.css`: the only file with `@keyframes`, `animation`, and `transition`. `gk-flicker` 0.6 s with 3 iterations, `gk-dissolve` 0.9 s with 1 iteration and `forwards`, `gk-fade` 0.2 s with 1 iteration. No `infinite`. The file ends with the `prefers-reduced-motion: reduce` block that sets `animation: none` and `transition: none`.
    - `index.css` imports the three files. No external origin and no `url()` that points outside the package.
    - _Requirements: 5.2, 5.9, 5.10, 11.5, 12.2, 12.5, 12.6, 12.7, 12.12, 13.4_

  - [x] 6.4 Write the stylesheet scan test and the theme sync test
    - `tests/scan/stylesheet.test.ts`: color literals appear only in `theme.css`; other CSS uses tokens, `currentColor`, `transparent`, or `inherit`; every foreground and background combination in a rule is a declared Contrast_Pair; every foreground token is declared against all three backdrops; `@keyframes`, `animation`, and `transition` appear only in `motion.css`; every animation has a finite iteration count, a duration of at most 1 s, and a total of at most 3 s; no `infinite`; the file ends with the reduced-motion block; no `opacity` below 1 or `filter` on a text-bearing selector; no `@font-face` with a non-relative source and no `@import`; the tests fail on a bad sample string for each rule (self-test on in-memory CSS).
    - `tests/scan/theme-sync.test.ts`: every custom property of `theme.css` equals the `THEMES` value and no token is missing in either theme.
    - _Requirements: 11.5, 11.6, 12.5, 12.6, 12.7, 12.9, 12.12, 13.4_

- [x] 7. Components
  - [x] 7.1 Implement `MirrorWorld` and `MirrorWorldView`
    - **Precondition: task 2.2 is complete and passing.**
    - `MirrorWorldView(model, uiState)` is a pure function that renders a `section` with the heading `Mirror world`, the summary line, and a table (columns `Reality` and `Mirror (copy)`, one `tbody` per step with a `step <stepIndex>` header and label, one `tr` with `data-change-row` per Change_Row). The mirror cell has the fog background layer, a `SmokeLayer` behind the text for vanish rows, and the state tag with icon and text `would be removed`. Empty text, the `Full scene` disclosure (`aria-expanded`, `aria-controls`), scene entries through `flattenGeneric`, and the reveal buttons for rows and scene entries.
    - `MirrorWorld` is the container (`useState` for the reveal and scene states) wrapped in `KitBoundary` and the Placeholder path. It never states that reality is unchanged.
    - Every path, table, count, step index, and target is in a monospace element.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 12.3, 12.4, 12.12, 14.2, 14.4, 14.5_

  - [x] 7.2 Implement `Candle`, `ClaimBanner`, and the candle `View`
    - **Precondition: task 2.2 is complete and passing.**
    - One `section` with `data-candle-state` and `aria-label` equal to the accessible label, the `FlameArt` (decorative), the state icon with the text label, the polite `role="status"` live region that announces a state change, the ward lines, the violation and notice lists in monospace, and the `ClaimBanner` in the same container. `ClaimBanner` is a group with three claim lines rendered from `ClaimLine.text` and `ClaimLine.icon` (icon plus `claimed`, `NOT claimed`, or `P<n>: not applicable to this world`) and independent paragraphs with `data-claim="assurance"`, `data-claim="static"`, or `data-claim="not-claimed"`, each shown whenever its own condition holds.
    - No text states that an action is approved or safe.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11, 6.12, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 7.10, 7.11, 7.12, 12.3, 12.4, 14.2, 14.4_

  - [x] 7.3 Implement `BlacklightView`, `BlacklightPanelView`, and `BlacklightSwitch`
    - **Precondition: task 2.2 is complete and passing.**
    - `BlacklightSwitch` is a native button with `role="switch"`, `aria-checked`, accessible name `Blacklight`, the lamp icon, and the visible text `Blacklight: off` or `Blacklight: on` (starting with the accessible name). The container holds the mode and per-source reveal sets. The panel view renders the summary and per-category counts, the line list with monospace line numbers, `Showing <shown> of <total>` and keyboard-operable reveal buttons for lines and Findings, the Findings list (one `li` with `data-finding-index` per placed shown Finding), the unplaced group, `mark` markers (fill, dashed outline, icon, category text, position, hex list, rendering), the `No hidden text found by the blacklight.` text, and the fixed sentence `Text analysis does not catch every injection.`
    - Toggling changes only the in-text markers, not the Findings list and not the reveal state.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 12.3, 12.4, 14.2, 14.4, 14.5_

  - [x] 7.4 Implement `RedThreadView`
    - **Precondition: task 2.2 is complete and passing.**
    - One `li` per thread with a `role="group"` and the accessible name of the model, the action end, the cause end for `found` links, the connector line only for `found`, the `matched host key` text, the hidden-text warning with icon, the `not-found` text, the mismatch and empty texts, the fixed sentence `The red thread finds literal occurrences only.`, and a reveal button for more than 200 threads. `line:column`, `lineText`, and step numbers are in monospace.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 12.3, 12.4, 14.2, 14.4, 14.5_

  - [x] 7.5 Implement `Graveyard` and `GraveyardView`
    - **Precondition: task 2.2 is complete and passing.**
    - Summary line, one native button per Tombstone (accessible name of the model, `data-tombstone-index`, the arch shape, monospace command, `recordedAt`, and ward ids), disabled tombstones with `No seance link: invalid id`, the `time unreadable` mark, `Unreadable item <index>` slots, the empty text, and the `Show all <n> tombstones` reveal button. Activation calls `onOpenSeance` once with the original id after `store.remember(inputIndex)`. A mount effect consumes a pending focus-return request. A non-function `onOpenSeance` makes activation a no-op and never throws.
    - The kit does not route, fetch, or build a seance URL.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9, 10.10, 10.11, 10.13, 12.1, 12.3, 14.2, 14.4, 14.5_

  - [x] 7.6 Implement `KitRoot` and `LightsToggle`
    - `KitRoot` renders the root element with `data-theme`, a header with `LightsToggle`, and the children at the same tree position in both themes (no remount). Theme state starts as `dark` or as `initialTheme` when valid (an invalid `initialTheme` starts in `dark`, renders the children, and shows the Placeholder for `KitRoot` above them). `LightsToggle` is a native button with `role="switch"`, `aria-checked`, accessible name `Lights on`, the bulb icon, and the visible text `Lights: off` or `Lights: on`. It is not exported alone. Nothing is stored and `prefers-color-scheme` is ignored.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7, 11.8, 12.1, 12.3, 14.2_

  - [x] 7.7 Implement `SeanceView`
    - Section with a focusable heading `Seance` (focused on mount), the full command, `recordedAt`, ward ids, then for each present part the `Candle` with its `ClaimBanner`, `MirrorWorld`, `BlacklightView`, and `RedThreadView`; for each absent part the text `<part> not recorded`. A `Back to graveyard` native button calls `onBack`, and the focus store restores focus to the opening tombstone after `onBack` and on unmount. A non-function `onBack` is a no-op.
    - _Requirements: 6.1, 7.8, 10.8, 10.9, 10.10, 12.1, 14.2, 14.4_

  - [x] 7.8 Create the public exports `ui/src/index.ts`
    - Export the six components, `KitRoot`, the prop and data types, the theme tokens, and the stylesheet entry through `exports["./styles.css"]`. Do not export `LightsToggle` alone, the model internals, or any server module. The public entry imports `@ghost-run/core` with `import type` only; re-exported core types use `export type` only.
    - Also export `escapeForDisplay` and `isHiddenDisplay` (value exports from `model/escape.ts`) as public API, so Ghost Shell uses the same display rule.
    - Add `ui/tests/scan/index-exports.test.ts`: import `ui/src/index.ts` and require `escapeForDisplay` and `isHiddenDisplay` to be functions, `escapeForDisplay('\u200B')` to equal `<U+200B>`, and `isHiddenDisplay(0x200B)` to be true; a source scan requires that `ui/src/index.ts` has no value import or non-`type` re-export from `@ghost-run/core`.
    - Run `pnpm --filter @ghost-run/ui exec tsc --noEmit` and `eslint .`.
    - _Requirements: 1.2, 1.4, 1.8, 11.3_

- [ ] 8. Component tests
  - [ ] 8.1 Write the static-leg property test for change coverage
    - **Property 1: Change coverage**
    - **Validates: Requirements 5.3, 5.4, 5.6, 5.7, 5.8, 14.5**
    - File: `tests/static/p1-mirror.test.tsx`. Tag `UI-P1`. Environment: node, S leg, 100 Short_Run and 10,000 Nightly_Run. Render `MirrorWorldView` with `renderToStaticMarkup` (all rows revealed and the initial limited state) and check one `data-change-row` per element in step and index order, the summary, step lines and labels, grouped numbers, `rows lost`, `invalid number`, and the 200-row limit with `Showing 200 of <N>`.

  - [ ] 8.2 Write the static-leg property test for the candle mapping
    - **Property 2: Candle mapping**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10**
    - File: `tests/static/p2-candle.test.tsx`. Tag `UI-P2`. Environment: node, S leg, 100 and 10,000. Check exactly one candle state with its icon, text label, and accessible label; the ward lines; violation lines and notice lines (generators include notice kinds beyond the known ones, and every notice line is `step <n>: <reason>` regardless of kind); the unknown-state rules; and that adding `needles`, `links`, `findings`, and `entries` next to the verdict leaves the markup unchanged.

  - [ ] 8.3 Write the static-leg property test for claim honesty
    - **Property 7: Claim honesty**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12**
    - File: `tests/static/p7-claims.test.tsx`. Tag `UI-P7`. Environment: node, S leg, 100 and 10,000. Generator: `claimsAny` combined with an absent verdict and each of the three verdicts. Check conditions A and B separately (B with the not-applicable rule of Requirement 7 criteria 10 and 11 and the reason wording of criterion 12) on the Candle container markup using `data-claim` attributes, that a not-applicable line shows `P<n>: not applicable to this world` and never `NOT claimed`, that the Assurance_Text is exactly that of the mode, that `Isolation status unknown.` appears if and only if `claims` is absent or malformed, and that the words `sealed` and `isolated` appear only inside an Assurance_Text.

  - [ ] 8.4 Write the static-leg property test for graveyard coverage and order
    - **Property 9: Graveyard coverage and order**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.11, 10.12, 14.5**
    - File: `tests/static/p9-graveyard.test.tsx`. Tag `UI-P9`. Environment: node, S leg, 100 and 10,000. Check one tombstone button per entry in the defined order, the command, `recordedAt`, every ward id, the summary, disabled tombstones, the accessible names, the empty text, and the 200-tombstone limit with the reveal state.

  - [ ] 8.5 Write the static-leg property test for blacklight coverage
    - **Property 10: Blacklight coverage and involution**
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.13, 14.5**
    - File: `tests/static/p10-blacklight.test.tsx`. Tag `UI-P10`. Environment: node, S leg, 100 and 10,000. Render `BlacklightPanelView` in both modes with and without reveal sets and check the Findings list entries, the markers, `Showing` texts and reveal buttons, hex notation of overflow-covered code points (visible with the switch `off`, Requirement 8 criterion 5 exception), the summary and category counts, the `off` text rules, and that the `on` and `off` markup differ only in the in-text markers.

  - [ ] 8.6 Write the static-leg property test for red thread pairing
    - **Property 11: Red thread pairing**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.12**
    - File: `tests/static/p11-thread.test.tsx`. Tag `UI-P11`. Environment: node, S leg, 100 and 10,000. Check one thread per pair, exact coordinates, the connector only for `found`, the hidden and host texts, the accessible names, and the mismatch text.

  - [ ] 8.7 Write the static-leg property test for no hidden characters
    - **Property 3: No hidden characters**
    - **Validates: Requirements 3.3, 3.4, 3.8**
    - File: `tests/static/p3-hidden.test.tsx`. Tag `UI-P3`. Environment: node, S leg, 100 and 10,000. Generator: `dirtyString` placed in every displayed field of every component (paths, tables, targets, unknown-change field names and values, step labels, scene keys and values, ward ids, kinds, reasons, notice reasons, unknown verdict values, sources, text lines, `rendering`, needle values, link `source` and `lineText`, action labels, commands, `recordedAt`, entry ward ids, entry ids). The whole markup string (text nodes and every attribute value including `aria-label`, `data-*`, and `id`) contains no Hidden_Display_Code_Point literally. Counter buckets: field name and hidden category.

  - [ ] 8.8 Write the static-leg property test for secret non-forwarding
    - **Property 4: No secret forwarding**
    - **Validates: Requirements 2.7, 4.5, 4.8, 4.9, 5.5, 5.11**
    - File: `tests/static/p4-secrets.test.tsx`. Tag `UI-P4`. Environment: node, S leg, 100 and 10,000. Part one: extra fields named `secretValues`, `payloads`, `env`, and `token` holding `canary` values are added at the top level of the props and to every contract object; no canary appears in the markup. Part two: unknown-kind `Change` values and `realScene` and `mirrorScene` built from the secret-like key generator with the `Full scene` region revealed; no canary appears, `[hidden: secret-like field]` appears once for each shown secret-like key with the key still shown, every visible marker of a non-secret key outside a secret-like subtree is present, and a secret-like key at any depth hides its whole value. Counter buckets: extra-field name, secret-like word, letter case, key position, nesting, view.

  - [ ] 8.9 Write the totality test for static markup and the view-model builders
    - **Property 8: Totality**
    - **Validates: Requirements 2.5, 2.6, 14.2, 14.3, 14.7**
    - File: `tests/static/p8-total.test.tsx`. Tag `UI-P8`. Environment: node, S leg, 100 and 10,000. Generator: `fc.jsonValue()` mixed with valid props where one random field is replaced (including `null`, numbers, deeply nested arrays, empty objects, and objects with unknown fields). Every `build*Model` function and every component renders without throwing and produces either its normal output or exactly the Placeholder in an element with `role="alert"`; an unreadable list element becomes `Unreadable item <index>` while siblings render; rendering the same deep-frozen props twice gives equal markup and never a mutation error. Counter buckets: Placeholder or normal output per component.

  - [ ] 8.10 Write the markup inertness test
    - **Property 5: Markup inertness**
    - **Validates: Requirements 4.2, 4.3**
    - File: `tests/dom/p5-inert.test.tsx`. Tag `UI-P5`. Environment: jsdom, SP leg, 100 Short_Run and 10,000 Nightly_Run. Generator: `markupString` samples (script tags, `onerror` payloads, quotes, ampersands, backticks, `javascript:` in mixed case, attribute-breaking sequences, entity text, allowed element names) placed in every displayed string. Render each component with `renderToStaticMarkup`, parse into a `template`, and require only allow-listed elements, no attribute whose name starts with `on`, no attribute outside the declared list, no `style`, `href`, or `src`, no `javascript:` value after removing whitespace and control characters, and the same element count as the plain-letter input. If `react-dom/server` cannot be called in jsdom (Open Question Q3), render with Testing Library and parse `container.innerHTML` instead and record the choice.

  - [ ] 8.11 Write the mount-leg totality test
    - **Property 8: Totality**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.7**
    - File: `tests/dom/p8-total.test.tsx`. Tag `UI-P8`. Environment: jsdom, DOM leg, 25 Short_Run and 500 Nightly_Run. Mount every component with the arbitrary JSON props of the static leg, require no throw and either normal output or the Placeholder, and require that a child that throws inside `KitBoundary` yields the Placeholder with no text from the error or the data. Unmount after each example.

  - [ ] 8.12 Write the toggle leg for blacklight involution
    - **Property 10: Blacklight coverage and involution**
    - **Validates: Requirements 8.2, 8.13**
    - File: `tests/dom/p10-toggle.test.tsx`. Tag `UI-P10`. Environment: jsdom, DOM leg, 25 and 500. Mount `BlacklightView`, toggle the switch with the pointer, Enter, and Space from `off` to `on` and back, and require the markup of the first `off` state to be restored exactly, with and without a previously activated reveal control.

  - [ ] 8.13 Write the fixed-text and empty-state tests `tests/static/texts.test.tsx`
    - Pin the literals of the requirements: candle labels and accessible labels, the claim texts, blacklight and red thread texts, graveyard texts, the empty states of Requirement 14 criterion 1, the seance `<part> not recorded` lines, and the Placeholder text.
    - Scan the fixed texts of the Candle for `approved` and `safe` (must be absent), and scan all fixed texts of the kit so that `sealed` and `isolated` appear only in the two Assurance_Text constants.
    - Check that no Candle text and no Mirror text states that reality is unchanged (Requirement 5 criterion 13).
    - Component test: a `warn` verdict whose notices have the kinds `unsupported-step`, `path-escape`, and `content-inspection` renders each as `step <n>: <reason>` and `<k> notices need review` with `k` equal to the number of notices.
    - _Requirements: 5.12, 5.13, 6.1, 6.12, 7.3, 7.8, 8.11, 9.9, 10.8, 10.11, 14.1_

  - [ ] 8.14 Write the example tests `tests/dom/examples.test.tsx`
    - The six examples of Requirement 15 criterion 6: a `block` verdict with `no-data-loss` and the reason `would delete 1,206 rows from users` (candle out, ward name and `1,206` visible); a Plan B run (banner shown, no Assurance_Text); a `playground` run with `p1Claimed` true (in-memory text shown, `Isolation status unknown.` absent); a README text whose destination `setup-check.example` is hidden in tag characters built with `String.fromCodePoint` (thread `found`, `hidden` true, the blacklight shows the decoded word); a tombstone opened by keyboard; the lights-on switch.
    - Role-based queries only (`getByRole` with names), never class or test id.
    - _Requirements: 15.6, 6.1, 7.6, 8.6, 9.5, 10.5, 11.3_

  - [ ] 8.15 Write the keyboard, focus, and reveal tests `tests/dom/keyboard.test.tsx`
    - Tab order equals DOM order; Enter and Space operate each switch, tombstone, reveal button, disclosure, and `Back to graveyard`; `onOpenSeance` is called once with the id; focus returns to the opening tombstone after Back, both when the graveyard stays mounted and when it is mounted again; no keyboard trap; no `tabIndex` above 0.
    - Reveal controls: Mirror rows (more than 200), scene entries, Blacklight lines and Findings (more than 200 lines and more than 100 Findings), Threads (more than 200), and Tombstones (more than 200) show `Showing <shown> of <total>`, are operable by keyboard, and render all elements after activation while summary counts stay at the total.
    - _Requirements: 10.5, 10.9, 12.1, 14.5_

  - [ ] 8.16 Write the theme test `tests/dom/theme.test.tsx`
    - The root `data-theme` flips in the same commit as the toggle; the Blacklight state and the open seance survive the toggle; the DOM node identity of a child stays the same (no remount); the starting theme follows `initialTheme`; an invalid `initialTheme` starts in `dark` and shows the Placeholder for `KitRoot`; no storage write happens (spies); all five candle states keep their icon and text in both themes.
    - _Requirements: 11.2, 11.3, 11.4, 11.7, 11.8, 14.2_

  - [ ] 8.17 Write the network, console, and storage test `tests/dom/network.test.tsx`
    - Replace `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` with throwing functions, mount and operate every component with fixture data, and require that none is called. Spy on `console`, `localStorage`, `sessionStorage`, `indexedDB`, and `document.cookie` and require no call.
    - _Requirements: 4.6, 13.2, 13.4_

  - [ ] 8.18 Write the error boundary test `tests/dom/boundary.test.tsx`
    - A throwing child yields only the Placeholder with no text from the error or the data, and sibling components keep rendering. `onOpenSeance` and `onBack` that are not functions make activation a no-op without throwing.
    - _Requirements: 14.4, 14.7_

  - [ ] 8.19 Write the reduced-motion test `tests/dom/motion.test.tsx`
    - With `matchMedia` stubbed to `reduce`, `FlameArt` and `SmokeLayer` set `data-motion="reduce"`; without it they do not. With `matchMedia` missing the hook returns `false` and nothing throws. The vanish end-state label `would be removed` and the icon are present in both cases. jsdom does not evaluate media queries, so the CSS side is covered by task 6.4.
    - _Requirements: 5.10, 12.5, 12.6, 12.7_

  - [ ] 8.20 Create the regression harness `tests/regressions.test.tsx`
    - A file for shrunk counterexamples, each kept as a fixed example test with the failing seed and the input. It starts with one passing guard test that checks the registry of regression cases is an array, so the file is a valid test suite before the first counterexample exists. Document in a comment that every counterexample found by a property is added here.
    - _Requirements: 15.7_

  - [ ] 8.21 Write the accessibility audit `tests/dom/a11y.test.tsx` (axe-core)
    - Run `axe-core` (dev only) on each component mounted with fixture data in both themes and in each state: blacklight on and off, seance open, reveal controls shown, `Full scene` open, and every Candle state. Also run it on the whole gallery inside `<main>`, with the `region` rule enabled for the gallery and disabled for fragments.
    - Enabled rules include `button-name`, `aria-valid-attr`, `aria-valid-attr-value`, `aria-allowed-attr`, `aria-allowed-role`, `aria-required-children`, `aria-required-parent`, `aria-roles`, `label`, `list`, `listitem`, `td-headers-attr`, `th-has-data-cells`, `scope-attr-valid`, `duplicate-id`, `duplicate-id-aria`, `image-alt`, `svg-img-alt`, `tabindex`, and `nested-interactive`. `color-contrast` is disabled because jsdom has no layout or CSS, and contrast is proven by UI-P6.
    - Structure test: each candle state, the vanish label, highlighted Findings, claim lines, and each thread has an icon element and a text node, and every decorative SVG has `aria-hidden`. Every interactive element and status indicator has a non-empty accessible name found through role-based queries.
    - `axe-core` is imported only in this test file.
    - _Requirements: 12.1, 12.3, 12.4, 12.12_

- [ ] 9. Gallery and static hosting
  - [ ] 9.1 Create the gallery page `ui/gallery/main.tsx` and finish `ui/index.html`
    - Render `KitRoot` with every component and fixture data inside `<main>`: a Mirror world with file, SQL, symlink, unrecognized, and secret-like key examples, the five candle states with the three claim modes, a Blacklight view built from a hidden-character text (characters built with `String.fromCodePoint`), a Red thread, a Graveyard that opens the Seance view, and the lights switch. Fixtures use canary values and reserved hosts only. The gallery imports `@ghost-run/core` types with `import type` only and nothing from `axe-core` or `react-dom/server`.
    - The page loads no external origin, no font, and no inline script.
    - _Requirements: 13.1, 13.3, 13.4, 13.8, 16.1, 16.3_

  - [ ] 9.2 Write the dist scanner `ui/tests/support/dist-scan.ts` and its self-tests
    - `scanDist(files)` is a pure function that returns violations for these rules: external origin in a URL (allow-list: hosts ending in `.example`, `.test`, `.localhost`, `.invalid`, the W3C namespace identifiers, and entries recorded in task 9.3 with a reason); a reference to another origin in `script src`, `link href`, `img src`, `iframe src`, `form action`, CSS `@import`, and `url(...)`; network API use (`fetch(`, `XMLHttpRequest`, `new WebSocket`, `sendBeacon`, `new EventSource`, `importScripts`, `serviceWorker.register`); the analytics deny list; remote fonts; inline script and `javascript:`; the presence of the CSP meta tag with the exact policy string; only the file types `html`, `js`, `css`, `svg`, `txt` (a `map` file fails); no `axe-core` code in the bundle.
    - Self-tests `tests/scan/dist-scan-selftest.test.ts` on in-memory fixtures: a clean sample and one failing sample per rule, with URLs built from string pieces and reserved hosts so no real URL is committed.
    - _Requirements: 13.3, 13.4, 12.11_

  - [ ] 9.3 Build the gallery and write the dist scan test
    - Run `pnpm --filter @ghost-run/ui build`. Write `tests/dist/dist-scan.test.ts` that reads every file under `ui/dist` (fails with `run pnpm build first` when `dist/index.html` is missing) and applies `scanDist`.
    - Run the test, inspect the React production bundle for strings that the scan flags (error-decoder URL text, any `fetch` token), and record each allowed entry with its reason in the scanner allow-list and in `docs/devlog.md` (Open Question Q5). The runtime proof stays the throwing-stub test of task 8.17.
    - Confirm that `ui/dist` and `node_modules` are ignored by git.
    - _Requirements: 13.1, 13.3, 13.4, 16.5_

  - [ ] 9.4 Write the `vite preview` serving test `tests/dist/serve.test.ts`
    - Start `preview({ root, preview: { host: '127.0.0.1', port: 0 } })` from the Vite JS API, request `/index.html`, every `script` and `link` URL found in it, and `/missing`, and assert status 200 for existing files, only same-origin URLs, content types `text/html`, `text/javascript`, and `text/css`, and that the served `index.html` equals the built file. Close the server in `afterAll`. If `port: 0` is not supported by Vite 7.3.8 (Open Question Q10), use port 4173 with `strictPort: true` and record the fallback.
    - The final in-browser check (tabbing through both themes, the browser axe extension with color contrast, grayscale, reduced motion) is a manual review by the user and is not a coding task.
    - _Requirements: 13.1, 13.3_

- [ ] 10. Source hygiene
  - [ ] 10.1 Write the ESLint fixture test `tests/scan/eslint-fixtures.test.ts`
    - Run ESLint programmatically on one-line fixtures built from strings. For `dangerouslySetInnerHTML`, run twice: once with only the `@eslint-react/eslint-plugin` rule enabled and once with only the `no-restricted-syntax` selector enabled, and require an error each time, so either layer alone blocks the construct. Also check errors for forbidden imports (`@ghost-run/ghost-runner`, `three`, `@mujoco/mujoco`, `apps` paths), a value import from `@ghost-run/core` in `src`, `innerHTML`, `eval`, `new Function`, a string timer argument, `new Date`, the `style` prop, a positive `tabIndex`, and a handler on a non-interactive element.
    - The test fails when the two fixed plugin rules (`@eslint-react/dom-no-dangerously-set-innerhtml`, `@eslint-react/dom-no-dangerously-set-innerhtml-with-children`) are not enabled in the config (Q1).
    - _Requirements: 1.4, 1.5, 4.1, 4.2_

  - [ ] 10.2 Write the source scan test `tests/scan/source-scan.test.ts`
    - In `src/`, `gallery/`, and `vite.config.ts`: no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, or string timer argument; no import of `axe-core`, `react-dom/server`, `three`, or `@mujoco/mujoco`; `sealed` and `isolated` only inside the Assurance_Text constants; no `<audio>` element and no audio file under `ui/`; no prop string used as an element name, `href`, `src`, `style` value, event handler, or CSS custom property value.
    - Each rule has a self-test sample that must be flagged.
    - _Requirements: 4.1, 4.2, 7.8, 12.11, 13.4, 13.6_

  - [ ] 10.3 Write the hygiene test `tests/scan/hygiene.test.ts`
    - Run `scanTexts` of `@ghost-run/core` over every file of `ui/` (excluding `node_modules` and `dist`) and over `.kiro/specs/ui-kit/`, read with `node:fs`, and expect the outcome `clean` (no literal Hidden_Display_Code_Point and no literal HTML comment opener).
    - Assert that fixtures name only hosts ending in `.example`, `.test`, `.localhost`, `.invalid`, or the `192.0.2.0/24` range, and secrets only of the form `sk-CANARY-`; no real credential, domain, or IP address. Assert that `.gitignore` lists `dist` and `node_modules`.
    - Assert that test files name the render properties `UI-P1` to `UI-P11` and never `P1` to `P8` of the safety contract in property titles.
    - _Requirements: 15.3, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ] 10.4 Write the dependency direction test `tests/scan/dependency-direction.test.ts`
    - Parse the import declarations of every file in `src/` and `gallery/`: only `react`, `react-dom`, relative paths, and `@ghost-run/core` through its public entry with `import type`. No import of `@ghost-run/ghost-runner`, `apps/*`, `integrations/*`, `worlds/*`, core internals, `three`, or `@mujoco/mujoco`. Tests may import values from `@ghost-run/core` but still not from the forbidden packages.
    - Check that `core/` does not import `ui`: read the files under `core/src` and fail when an import path names `@ghost-run/ui` or a `ui/` path. This is a read-only check. Changing the `core` ESLint configuration is task 13.1.
    - _Requirements: 1.4, 1.5, 1.7, 1.8, 2.2_

- [ ] 11. Documentation and steering
  - [ ] 11.1 Write `ui/README.md` and extend the repository `README.md`
    - Extend the repository `README.md` without removing existing rows. Add the dependency table with name, version, and license for every runtime and development dependency of `ui/`. All are MIT except `axe-core` 4.14.1 (MPL-2.0), which is a development dependency used only by `tests/dom/*.test.tsx`, is not imported under `src/` or `gallery/`, is not in the Vite bundle or `ui/dist`, is not modified or copied, and is not published because `ui` is private. Note that `eslint-plugin-react` and `eslint-plugin-jsx-a11y` are not used because their peer ranges stop below ESLint 10.
    - Add the font and asset table: icons, flame, smoke, and tombstone shapes are original SVG paths written in this package as code, license MIT (the repository license); fonts: none, system font stacks only; audio: none.
    - Add the heading "Secret-like key rule" in both READMEs with the text of the design: the key-name heuristic matches by case-insensitive containment, can miss a secret under an innocent key name, can hide a harmless value, does not detect a secret typed into a command or other text, and the producer remains responsible for redaction.
    - State in `ui/README.md` how to run the Short_Run, the Nightly_Run, the dist scan, and the gallery build, that `UI-P1` to `UI-P11` are render properties and not P1 to P8, that the kit asserts none of P1 to P8, and that Plan B runs never show a P1 claim.
    - Keep the text English, free of hidden Unicode, and use reserved domains only.
    - _Requirements: 1.9, 4.7, 13.4, 13.5, 13.9, 15.3, 16.6_

  - [ ] 11.3 Update `.kiro/steering/structure.md` for the `ui/` package
    - **This edits a steering file. The `blacklight-steering` hook runs on save of `.kiro/**`. Resolve any finding it reports, write only English text, and never write a hidden Unicode character literally (tag, zero-width, or bidi controls).**
    - Read the current file first. The wards plan also edits this file (its task 1.3). Do not run this task at the same time as another task that edits `structure.md`, change only the `ui/` parts, and keep every other line as it is.
    - Update the `ui/` entry: package `@ghost-run/ui`, exported as source, with the gallery page as the build and static-hosting check target. Dependency Direction: `ui/` may depend on `core/` only, through `@ghost-run/core` with type-only imports in source files; `core/` must not import `ui/`. "What Goes Where": shared UI and the Candle, Mirror world, Blacklight, Red thread, Graveyard, and Lights toggle go to `ui/`; the 3D ghost overlay stays out of `ui/` until the 11/19 decision (the second app's spec decides).
    - _Requirements: 1.1, 1.4, 1.6, 1.7_

  - [ ] 11.2 Write the README test `tests/scan/readme.test.ts`
    - Read `ui/README.md` and the repository `README.md`. Each contains the heading "Secret-like key rule" and the phrases `case-insensitive containment`, `heuristic`, `innocent key name`, `harmless value`, and `responsible for redaction`.
    - The repository `README.md` dependency table lists `axe-core` with the license `MPL-2.0` and a note that it is dev only and not shipped, lists every dependency of `ui/package.json` with a version and a license, and the asset table lists the original SVG source and states that no font and no audio is shipped.
    - _Requirements: 1.9, 4.7, 13.5, 16.6_

- [ ] 12. Checkpoint - Components, hosting, and hygiene complete
  - Run `pnpm --filter @ghost-run/ui test`, `typecheck`, `lint`, `build`, and `test:dist`. Confirm the contrast gate passes, the gallery builds, the dist scan and serving test pass, and every scan test passes. Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Core import ban (isolated task)
  - [ ] 13.1 Add the `@ghost-run/ui` import ban to `core/eslint.config.mjs` with a lint fixture test
    - **Precondition: run this task only after the possession spec and the wards spec have finished all of their changes to `core/`.** Confirm that every task of the possession and wards `tasks.md` files that edits `core/` is complete (including the wards tasks 1.2 and 1.4, which edit `core/eslint.config.mjs` and `core/src/types.ts`), that the `core` test suite passes, and that no other task is editing `core/` at this time. Do not run this task in the same wave as any other task.
    - Add `@ghost-run/ui` and `@ghost-run/ui/**` to the workspace import patterns of `core/eslint.config.mjs` next to the existing `**/ui/**` pattern and the entries other specs added. Change nothing else in `core/`.
    - Add a lint fixture test in `core/tests/` (following the pattern of the wards `wards-config` import-ban test): write a temporary file under `core/src/` that imports `@ghost-run/ui`, run ESLint programmatically on it, assert a `no-restricted-imports` error, and remove the file in `finally`.
    - Run `pnpm --filter @ghost-run/core exec eslint .`, `exec tsc --noEmit`, and `exec vitest --run`, and confirm all existing tests still pass unchanged.
    - After this task passes, Requirement 1.6 is verified. Until then it is not claimed.
    - _Requirements: 1.6_

- [ ] 14. Measurement and open questions
  - [ ] 14.1 Measure the Short_Run and record the result
    - The design estimate of about 30 s is not measured. Run `pnpm --filter @ghost-run/ui test` with the JSON reporter output file (ignored by git) and record the total wall time and the per-file durations in `docs/devlog.md`. Also run the Nightly_Run once (`GHOST_PBT_MODE=nightly`, no time limit, estimated 8 to 9 minutes; use a long timeout or run it manually in a terminal) and record its time.
    - The Short_Run must finish within 60 s on the Reference_Machine (Apple M1). If the measured time exceeds 45 s (the design rule that keeps a margin), lower `NUM_RUNS_DOM` in `tests/support/pbt-config.ts` for the Short_Run from 25 to 15 first, then reduce generator sizes while keeping the S leg count. The V legs never drop below 100. Run the measurement again after any change and record both results.
    - _Requirements: 15.1_

  - [ ] 14.2 Resolve the Open Questions and record each result
    - Append one entry per item to `docs/devlog.md` with the observed result and the action taken: Q1 (resolved before implementation: the two fixed rule IDs; record that ESLint accepted them), Q2 (inline `projects` accepted or the docblock fallback), Q3 (`react-dom/server` in jsdom or the Testing Library fallback of task 8.10), Q5 (dist scan allow-list entries with reasons), Q6 (exact contrast values from task 2.2), Q7 (first green run confirms jsdom 26 with Vitest 3.2.7, axe-core in jsdom, `@vitejs/plugin-react` 5.2.0, and `user-event` 14 with React 19), Q9 (timing from task 14.1), Q10 (`preview` port handling).
    - Q8, Q13, Q14, Q15, and Q17 stay as documented decisions; record in `ui/README.md` a short "Known limits" list: only the `...Z` time form is valid, two React copies are possible if an app uses a different range, `null` for an optional prop is unreadable, the line-break rule follows the possession rule, and real focus rings, browser color contrast, and animation playback are manual checks.
    - _Requirements: 4.1, 12.8, 13.3, 15.1, 15.5_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Run Short_Run `pnpm --filter @ghost-run/ui test`, `typecheck`, `lint`, `build`, and `test:dist`, and `pnpm --filter @ghost-run/core exec eslint .` plus the core vitest run (task 13.1 changed `core`). Confirm: the contrast gate passes; the Short_Run is within 60 s; no hidden Unicode appears literally in `ui/` or `.kiro/specs/ui-kit/` (the hygiene test passes); the README tables list every dependency with its license (axe-core MPL-2.0, dev only); `core/package.json` is unchanged; `pnpm-workspace.yaml` still lists `ui`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Every task is required. No task is marked optional.
- Properties 1 to 11 keep the numbering and titles of `design.md` and equal UI-P1 to UI-P11 of Requirement 15 criterion 2. A property that has several legs (V, S, SP, DOM) has one task per leg with the same property number: P1 (4.6, 8.1), P2 (4.7, 8.2), P3 (3.4, 8.7), P4 (3.5, 8.8), P5 (8.10), P6 (2.2), P7 (4.8, 8.3), P8 (8.9, 8.11), P9 (4.11, 8.4), P10 (4.9, 8.5, 8.12), P11 (4.10, 8.6).
- The contrast gate is task 2.2. All component tasks (6.1 to 6.3, 7.1 to 7.8) depend on it, and a failing pair is fixed in the tokens, never by lowering a threshold.
- Task 11.3 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban. Task 11.1 and task 11.3 are documentation and steering tasks required by Requirement 1.9 and the steering structure.
- Task 13.1 is isolated in its own wave. It runs only after the possession and wards specs finish their `core` changes, because both of those plans also edit `core/eslint.config.mjs` or `core/src`.
- The manual browser checks (real focus ring, browser color contrast, grayscale, reduced motion playback) are not coding tasks. They are listed in the README known limits (task 14.2).
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Requirements Coverage

| Requirement | Tasks |
|---|---|
| 1 Package, stack, dependency direction | 1.1, 1.2, 1.3, 1.4, 7.8, 10.1, 10.4, 11.1, 11.2, 11.3, 13.1 |
| 2 Presentation-only boundary, input contracts | 3.1, 3.5, 4.1, 4.13, 8.8, 8.9, 10.4 |
| 3 Display escaping | 3.1, 3.4, 4.12, 8.7 |
| 4 Markup inertness, secret non-display | 1.2, 3.2, 3.5, 4.13, 8.8, 8.10, 8.17, 10.1, 10.2, 11.1, 11.2 |
| 5 Mirror world | 4.1, 4.6, 6.3, 7.1, 8.1, 8.13, 8.19 |
| 6 Candle | 4.2, 4.7, 6.1, 7.2, 7.7, 8.2, 8.13 |
| 7 Isolation claims, Plan B | 4.2, 4.8, 7.2, 8.3, 8.13, 8.14 |
| 8 Blacklight | 4.3, 4.9, 7.3, 8.5, 8.12, 8.13, 8.14 |
| 9 Red thread | 4.4, 4.10, 7.4, 8.6, 8.13, 8.14 |
| 10 Graveyard and seance | 4.5, 4.11, 6.2, 7.5, 7.7, 8.4, 8.13, 8.14, 8.15 |
| 11 Lights on | 2.1, 2.2, 6.4, 7.6, 8.14, 8.16 |
| 12 Accessibility | 2.2, 6.3, 6.4, 6.2, 8.15, 8.19, 8.21 |
| 13 Static hosting, assets, content | 1.1, 6.1, 6.3, 8.17, 9.1, 9.2, 9.3, 9.4, 10.2, 11.1, 11.2 |
| 14 Empty states, bounded rendering | 3.1, 4.1 to 4.5, 7.1 to 7.7, 8.9, 8.11, 8.13, 8.15, 8.18 |
| 15 Property and example tests | 1.5, 3.3, 8.14, 8.20, 10.3, 14.1, 14.2 and every property task |
| 16 Repository hygiene | 1.1, 3.3, 9.1, 9.3, 10.3, 11.1, 11.2 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "10.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["3.4", "3.5", "4.1", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13"] },
    { "id": 6, "tasks": ["4.6", "9.2"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 9, "tasks": ["7.7", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.12"] },
    { "id": 10, "tasks": ["7.8", "8.7", "8.8", "8.9", "8.10", "8.11"] },
    { "id": 11, "tasks": ["8.13", "8.14", "8.15", "8.16", "8.17", "8.18", "8.19", "8.20", "9.1", "10.2", "10.3", "10.4", "11.1", "11.3"] },
    { "id": 12, "tasks": ["8.21", "9.3", "11.2"] },
    { "id": 13, "tasks": ["9.4"] },
    { "id": 14, "tasks": ["13.1"] },
    { "id": 15, "tasks": ["14.1"] },
    { "id": 16, "tasks": ["14.2"] }
  ]
}
```

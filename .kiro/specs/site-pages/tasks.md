# Implementation Plan: site-pages

## Overview

This plan turns the landing page `/` of the Ghost Run+ site into five pages that the visitor turns like a book, builds the kit showcase at `/kit/` from the real UI kit, moves the developer gallery to `/kit/gallery/`, and cuts the copy to the brief's deck. All code is TypeScript, the build scripts are `.mjs` files, and tests use `vitest`, Testing Library with jsdom, and `fast-check`. The work happens in the existing package `site/` (`@ghost-run/site`) and follows the design of `.kiro/specs/site-pages/design.md`.

The plan follows this order:

1. Steering, lint rules, and the sample-data spike.
2. The pure paging model, the page registry, and the input rules, with their property tests.
3. The paging hook, the book components, the styles, and the page bar, with DOM tests.
4. Per-page start and lazy loading: `park`, the Theater `active` prop, the X-ray peek, and the walkthrough visibility.
5. A checkpoint for the paged landing page.
6. The copy deck of the landing page, with the pinned-string and dropped-text tests.
7. The Showcase: sample data and drift test, entry and build config, page chrome, the seven rows, and their tests.
8. Headers, assembly, the Site_Check, and the build tests.
9. Documentation.
10. The final build and the site check.

### Cross-spec facts this plan relies on

- Already present and not recreated: the package `site/` as built by `.kiro/specs/site/` and `.kiro/specs/site-live/` (engine, components, data, scripts, tests, `src/live/`, `scripts/lib/csp.mjs`), `core/`, `wards-config`, the world packages, the two apps, and `ui/` with `ui/gallery/main.tsx`.
- Never changed: `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, `ghost-runner/` (Requirement 1, criterion 1). If a task finds that a change there is unavoidable, it stops and reports.
- Edits outside `site/` and `.kiro/specs/site-pages/`: `.kiro/steering/structure.md` (task 1.1), `README.md` and `docs/measurements.md` (task 9.1). `docs/devlog.md` is never edited (Requirement 20, criterion 5). `pnpm-lock.yaml` changes only if a task adds a dependency (none is planned; Requirement 1, criterion 5).
- Task 1.1 must finish before the first file that imports `@ghost-run/ui` from `site/src/showcase/` (task 7.2; the spike 1.2 imports the gallery only inside a test).
- The brief `docs/design/pages-brief.md` and the two mockups `docs/design/paged-landing-mockup.html` and `docs/design/kit-showcase-mockup.html` are read-only inputs. Where the repository contradicts them, the task follows the repository and the design's Open questions (D1 to D14, O1 to O22).

### Decisions reflected in this plan

1. **Paging is a pure model plus one hook.** Properties Pg1, Pg2, and Pg9 run first on pure functions in the `unit` project, then once more through `App` in the `dom` project.
2. **Sections read one `PageVisibility` value.** `IntersectionObserver` and `useInView` are removed from the Live_Section; `useInView.ts` is deleted.
3. **The copy deck is data.** Components read `data/copy.ts`, `data/skeleton.ts`, and `showcase/copy.ts`. Tests hold the same literals as their own expected values.
4. **The Showcase keeps a site-owned copy of the gallery fixtures**, with a drift test against the rendered real gallery (design Component 9). Task 1.2 proves the method first.
5. **No shared test files across waves.** Each property test has its own file. Tasks that edit the same file are in different waves.
6. **Open questions are taken with the design default** (Q1 to Q6). Where the repository contradicts a task, the task reports it and follows the repository.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: site-pages, Property Pgn: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` with `numRuns: NUM_RUNS` from `tests/pbt-config.ts`, and prints the seed on failure. Numbers and titles are those of the Correctness Properties section of `design.md`. Where the input space is finite (the five pages, the deck strings, the seven rows), the test enumerates it and says so in a comment.
- **Run sizes.** A Short_Run uses `NUM_RUNS = 100` and the whole package finishes within 60 s. A nightly run (`GHOST_PBT_MODE=nightly`) uses 10,000. No property is lowered below 100 runs.
- **Test environments.** `tests/unit/**` run in node, `tests/dom/**` in jsdom, `tests/record/**` only when `GHOST_SITE_RECORD=1`. No new test needs the MuJoCo simulation.
- **No `IntersectionObserver` in DOM tests.** DOM tests pass `visibility` values or drive `usePaging` through `App`. The helper `tests/lib/page-visibility.ts` (task 2.1) builds `PageVisibility` values and a fake history.
- **Fake time.** Paging and walkthrough tests use the injected `Scheduler` or Vitest fake timers. No test waits in real time.
- **Test data.** Canary values only (`sk-CANARY-abc123`). Hosts only from `.example`, `.test`, `.localhost`, `.invalid`, and `192.0.2.0/24`. Hidden Unicode and the HTML comment opener are never written literally in any file; tests build them with `\u` escapes or `String.fromCodePoint`.
- **No network, no LLM, no storage** in `site/src` and the tests. No Kiro Crew tool.
- **Amended tests.** A task that changes behavior also edits the tests that pin the old behavior, as listed in the design table "Changed test files". It never deletes an assertion without replacing it.
- **Verification commands.** `corepack pnpm --filter @ghost-run/site test`, `typecheck`, `lint`, `build`, `assemble`, and `check`. The gated tests run with `corepack pnpm --filter @ghost-run/site test:record`.
- **No optional tasks.** Every task is required, including tests.

## Tasks

- [x] 1. Steering, lint, and the sample-data spike
  - [x] 1.1 Update steering and the lint rules for the Showcase folder
    - Edit `.kiro/steering/structure.md`: in the `site/` entry, add the sentence of the design "Dependency direction": `site/src/showcase/` may import `ui/` through its public entry point and `core/` as type-only imports, and the rest of `site/src/` outside `site/src/live/` imports none of them. Keep every other rule. Keep the file free of hidden Unicode and comment openers (it must satisfy the `blacklight-steering` hook).
    - Edit `site/eslint.config.mjs`: add one block for `src/showcase/**/*.{ts,tsx}` that replaces `PAGE_BANNED_IMPORTS` by a path rule: allow `@ghost-run/ui`; ban `@ghost-run/ui/*` except `@ghost-run/ui/styles.css`; allow `@ghost-run/core` with `allowTypeImports: true`; ban every other `@ghost-run/*` package and the folders `apps/`, `worlds/`, `core/`, `ui/` by relative path. Keep `SYNTAX_BAN`, `NETWORK_BAN`, and the storage globals. If the installed ESLint does not accept `allowTypeImports` on a path entry, use `@typescript-eslint/no-restricted-imports` (design O22).
    - Check that the existing `src/engine/` block (ENGINE_BAN) already covers `engine/paging.ts`, `engine/paging-input.ts`, and `engine/usePaging.ts` (no `Date`, no `Math.random`, no network or storage globals); extend it only if it does not.
    - Tests: extend `tests/unit/lint-fixture.test.ts` with temporary files, deleted in `finally`: a file under `site/src/showcase/` that imports `@ghost-run/ui` passes; the same import in `site/src/components/` fails with `no-restricted-imports`; an import of `@ghost-run/ui/src/model/escape` from `site/src/showcase/` fails; a `Date.now()` call in a temporary `site/src/engine/paging-fixture.ts` fails.
    - _Requirements: 1.2, 1.3, 1.4, 19.6_

  - [x] 1.2 Spike: import the real gallery in the jsdom project
    - Goal: prove that the drift test of design Component 9 can run. Write `tests/dom/spike-gallery-import.test.tsx`: create `<div id="root">` in jsdom, call `await import('../../../ui/gallery/main.tsx')` (the relative path from `site/tests/dom/`), wait until a `main` element appears in `#root`, and assert that at least one `section.gk-candle` and one `table.gk-table` exist. If `vitest.config.ts` of the `dom` project needs an alias, a CSS stub, or a `server.deps` entry so that the import resolves (the gallery imports `@ghost-run/ui/styles.css`), add the smallest change and note it in a comment.
    - Record the result in a new section "Sample-data spike" of `docs/measurements.md`: works or does not, the config change if any, and the time of the import. This section is the only edit to that file in this task; task 9.1 adds the rest.
    - If the import fails and no small config change fixes it, keep the test as a documented `it.skip` with the error text, and write in the same measurements section that task 7.2 must use the text-comparison fallback of design Component 9. Do not change `ui/`.
    - Tests: the spike test itself, and `corepack pnpm --filter @ghost-run/site test -- spike-gallery-import` passes (or is skipped with the recorded reason).
    - _Requirements: 14.3, 14.2_

- [x] 2. The page registry, the paging model, and the input rules
  - [x] 2.1 Write `data/pages.ts`, `engine/paging.ts`, and the test helper
    - `data/pages.ts`: `PageId`, `PageInfo`, `PAGES` (five pages with the ids, titles, and short labels of Requirement 3, criterion 1), and `PAGE_IDS`.
    - `engine/paging.ts`: `PagingState`, `PagingEvent`, `PagingEffects`, `PageVisibility`, `EFFECT_MS = 780`, `parseHash`, `formatHash`, `initialState(hash)` (with `repairHash`), and `transition(state, event)` with exactly the rules of design Component 2: no change for the current page; hold the last request during an effect; reduced motion switches at once; a motion Turn sets `leaving`, `current`, `direction`, and `opened`; `effect-end` runs a held request for another page with its own source; `bad-hash` requests a `replace` write. The module imports nothing but `data/pages.ts`.
    - `tests/lib/page-visibility.ts`: builders for `PageVisibility` and for a fake history (records `pushState` and `replaceState` calls).
    - Tests: `tests/unit/paging.test.ts` with examples: the table of Component 2 row by row; `initialState` for each page hash, an empty hash, and an unknown hash (`repairHash`); `parseHash` and `formatHash` for all five ids and for `#`, `#Recipe`, `#recipe/`, and `#unknown`; the hold rule with two held requests (the last wins); a held request for the then-current page changes nothing; `opened` is true for a page after its first Turn and never reset.
    - _Requirements: 3.1, 3.4, 5.6, 5.7, 7.1, 7.3, 7.4, 8.2_

  - [x] 2.2 Write property test for the paging model
    - **Property Pg1: Exactly one page is active and reachable (model part)**
    - In `tests/unit/paging.property.test.ts`: generate request sequences (page, source, reduced flag) with `effect-end` events at any points, over any starting page. Assert after each step: one `current`; `leaving` is null or differs from `current`; `leaving` is null whenever the last event was a reduced request or an `effect-end`; after the last `effect-end` the current page equals the page of the last request; `opened[current]` is true; the effects of an accepted Turn contain `announce` once and `startTimer` only when motion is allowed. Enumerate all 25 ordered page pairs and assert that a request from the first to the second reaches the second (comment: finite space, enumerated).
    - **Validates: Requirements 3.3, 3.5, 5.5, 5.6, 5.7, 6.1**

  - [x] 2.3 Write property test for hash and page agreement (model part)
    - **Property Pg2: Hash and page agree (model part)**
    - In `tests/unit/paging-hash.property.test.ts`: generate sequences of requests, `effect-end`, hash requests (valid names), and `bad-hash` events, from any initial hash. Fold the effects over the fake history of `tests/lib/page-visibility.ts` (a `push` or `replace` effect writes `formatHash(current)`; a `hash`-source request writes nothing). After the last `effect-end`, the last hash equals `formatHash(current)`. A visitor's accepted Turn writes exactly one `push`; the two repairs write `replace`; `parseHash(formatHash(id)) === id` for every id; `parseHash(s)` is null for every generated string that is not `#` plus a page id.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 2.4 Write `engine/paging-input.ts`
    - `KeyLike`, `TouchPoint`, `SWIPE_MIN_PX = 60`, `keyToStep`, `ignoreKey`, `ignoreSwipeStart`, `swipeStep`, and `linkPage` exactly as in design Component 4. `ignoreKey` is true for `input` of any type, `textarea`, `select`, content-editable, the roles `tab`, `slider`, `switch`, `textbox`, a null target, `defaultPrevented`, `repeat`, and any of Alt, Ctrl, Meta, Shift. `linkPage('#run')` is `'run'`; `'shell/'`, `'#cover'`, `'#p-mirror'`, and null give null (`#cover` is handled by the Home link, not the delegated handler).
    - Tests: `tests/unit/paging-input.test.ts` with examples: each key, each ignored target and role, a modified key, `repeat`, a swipe of exactly 60 px (no turn), 61 px (turn), a diagonal move, a multi-finger touch, a touch that starts on a range input, and `linkPage` for the four hrefs and for non-page hrefs.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.5_

  - [x] 2.5 Write property test for the input rules
    - **Property Pg9: Key and swipe rules**
    - In `tests/unit/paging-input.property.test.ts`: generate key events (all fields, targets over tag names and roles) and assert the exact characterization of Property Pg9 for `keyToStep` and `ignoreKey`; generate pairs of touch points and assert `swipeStep` (`1` for `dx < -60` and `|dx| > |dy|`, `-1` for `dx > 60` and `|dx| > |dy|`, else `0`) and `ignoreSwipeStart`. Add a model check: for a first or last page, a step in the blocked direction leaves the state of `transition` unchanged.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 3. The paging hook, the book components, and the styles
  - [x] 3.1 Write `engine/usePaging.ts`
    - The hook of design Component 3: state in `useState` plus a mirror ref; `go`, `step`, `siteProps.onClick`, `pagesProps` (touch listeners on `#pages` only), one `keydown` listener and one `hashchange` listener on `window`, the injected `Scheduler` for the effect timer, `liveText` ("Page N of 5: <title>", empty before the first Turn), `visibility`. Hash writes use `history.pushState` for a visitor's Turn and `history.replaceState` for the two repairs, never `location.hash`. The scroll to top (`scrollTo({ top: 0, left: 0, behavior: 'instant' })`) happens at the start of an accepted Turn. Focus moves to the arriving heading only in the cases of Component 3 (a link inside a Book_Page, or the active element inside the leaving page), with `focus({ preventScroll: true })`. Reduced_Motion is read through a ref when a request arrives; turning it on during an effect ends the effect at once. A throwing or missing `scrollTo`, `pushState`, or `replaceState` is caught and skipped. Unmount clears the timer and removes all listeners.
    - Tests: `tests/unit/use-paging.test.tsx` with `renderHook`, a fake `Window`, the fake history, and the recording scheduler: a visitor's Turn writes one `pushState` and no `hashchange` handling; a browser hash change turns and writes nothing; an unknown hash is repaired by `replaceState`; a modified click and a right click are not handled; the delegated handler turns for the four hrefs; keys are ignored for each ignored target; a swipe turns; a throwing `scrollTo` still turns; the live text changes once per accepted Turn; unmount during an effect leaves no timer and no listener. Add the hook to the generated unmount cases of `tests/unit/timer-hygiene.property.test.ts`.
    - _Requirements: 1.7, 5.1, 5.2, 5.3, 5.6, 5.8, 6.1, 6.2, 7.2, 7.4, 7.5, 7.6, 7.7, 8.2, 19.6_

  - [x] 3.2 Build the book components, the page bar, the styles, and wire `App`
    - `components/Book.tsx`: `<div id="pages" className="pages">` and `BookPage` with `data-page`, `data-title`, `inert` on every page that is not `current`, and the classes of design Component 5 (`page on`, `page on fade-in`, `page leave-next`, `page enter-back`). No `id` on a Book_Page element (design O9).
    - `components/PageBar.tsx`: the `nav` named "Pages" with the ids and classes of Mockup_V6 (`pgPrev`, `pgNext`, `pgNextTitle`, `pgCount`, `pgDots`, `pgLive`, `pg-btn`, `pg-dot`, `pg-count`), five dots with the short labels and the names "Page N: <title>", `aria-current="page"` on the current dot only, "The end" on page 5, and the `sr-only` live region `#pgLive` with `aria-live="polite"`. It reads `state.current`, never `leaving`.
    - `components/Nav.tsx`: add the props `root` (`'./'` or `'../'`), `current` (`'home' | 'kit'`), and `onHome`; build the hrefs from `root`; "Home" calls `onHome` for `cover` on `/`.
    - Styles: move `html`, `body`, `.site`, `.sprite`, `.sr-only` from `99-page.css` to `01-base.css`; move the nav and logo rules from `02-nav-hero.css` to a new `01-nav.css`; rename the `.page` rule of `99-page.css` to `.wrap`; add `12-book.css` with the paging rules of Mockup_V6 (page container, `display: none` for non-current pages, `.page.on{position:relative}`, the three keyframes, perspective, shadows, the sticky bar, `min-height` from `100svh` with two custom properties, 24 px hit areas for the buttons and dots, the 390 px rules, and a `prefers-reduced-motion` block for the effect classes and the bar transitions). Import order stays `00-fonts`, `01-base`, `01-nav`, then the landing files.
    - `App.tsx`: render `<div className="site"><Sprite/><div className="wrap"><Nav/><Book/></div><PageBar/></div>` with the five sections as page content: `cover` holds the hero, `recipe`, `costumes`, `run`, and `make` hold their sections, and the footer is the last element of `make`. Pass `siteProps` to `.site`, `pagesProps` to `#pages`, and `visibility` to `Costumes` and `Walkthrough` as a prop that those components ignore until tasks 4.2 and 4.3. Give the five headings `tabIndex={-1}`.
    - Tests: update `tests/unit/styles.test.ts` (moved rules, `.wrap`, `display: none` for hidden pages, `svh`, the reduced-motion block covers `leave-next`, `enter-back`, `fade-in`, `pg-dot`, and `pg-btn`, the 24 px hit areas); update `tests/dom/classes.test.tsx` (the class list gains `pagebar`, `pg-btn`, `pg-dot`, `page`, `pg-count`; the wrapper is `wrap`); update `tests/dom/render.test.tsx` for the five Book_Pages in order with `data-page` and `data-title`, the sections and badges unchanged, the nav above the pages, the hero in `cover`, and the footer last in `make`.
    - _Requirements: 2.1, 2.5, 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 5.5, 5.7, 6.3, 8.1, 8.4, 8.5, 8.6_

  - [x] 3.3 Write the page bar and paging DOM tests
    - `tests/dom/paging.test.tsx`: render `App` with the fake history, the recording scheduler, and a `scrollTo` stub. Cases: the bar texts, names, and counter on each page; Back disabled on page 1; Next disabled with "The end" on page 5; the dot classes and `aria-current`; the page opens from each of the five hashes without an effect, and from an empty and an unknown hash on `cover` with `replaceState`; the four in-page hrefs and "Home" turn instead of scrolling, with `preventDefault` called; a modified click is left to the browser; the focus moves to the arriving heading for a hero button and stays for the bar and for a key with the focus outside the pages; the key with the focus inside the leaving page moves the focus to the heading; the scroll to top at the start of a Turn; the live region text "Page 2 of 5: What's in the skeleton?"; `#pgLive` is present and empty before the first Turn; `#sayt` stays the one region of the Live_Section; the leaving page is `inert` during the effect; no effect class stays at rest; with reduced motion every Turn is immediate and no timer is set; a change of the setting applies from the next Turn.
    - Update `tests/dom/a11y.test.tsx` for the second polite region `#pgLive`, the names of the bar, and `inert` on hidden pages.
    - _Requirements: 3.4, 3.8, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5, 6.1, 6.2, 7.2, 7.3, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3_

  - [x] 3.4 Write property test for paging through `App`
    - **Property Pg1: Exactly one page is active and reachable**
    - **Property Pg2: Hash and page agree**
    - In `tests/dom/paging.property.test.tsx`: generate sequences of Back, Next, dot, key, swipe, in-page link, hash change, and effect-end actions over `App` with the fake history and the recording scheduler, with reduced motion on and off. After the last effect-end assert items (a) to (h) of Property Pg1 on the DOM (one page without `inert` and with the class `on`; the other four `inert` with no layout class; the bar counter, next title, disabled states, the single `aria-current` dot; the live text; no timer after unmount) and the Pg2 rule: the last hash equals `#` plus the id of the current page, a browser hash change writes nothing, the page never assigns `location.hash` (a setter spy).
    - **Validates: Requirements 3.3, 3.5, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3**

- [x] 4. Per-page start and lazy loading
  - [x] 4.1 Add `park` to `useWalk` and the `active` prop to `Theater`
    - `engine/useWalk.ts`: new control `park()` that cancels every timer, clears `animating`, and sets the state to `settle(record, max(step, 0))` when a step was reached, or to the initial state when none was. `cancel()` is unchanged.
    - `components/walk/Theater.tsx`: new prop `active`. While false, the layout effect that places the Actor and the bubble returns at once and no `getBoundingClientRect` call happens. When it turns true, the next placement is `instant` and the tick is bumped. The resize listener marks a resize, and only the active Theater acts on it.
    - Tests: extend `tests/unit/use-walk.test.tsx` (`park` at step 0, at a middle step, and at the last step leaves no pending timer and shows the settled state; Replay and the stepper still work after `park`; `cancel` still resets); extend `tests/unit/theater-place.test.ts` (no placement call while inactive; one instant placement when it turns active; resize while inactive does nothing).
    - _Requirements: 9.7, 9.8_

  - [x] 4.2 Start the X-ray peek on page entry
    - `engine/useXrayDemo.ts`: add the argument `{ started, active }`. The two timers (on after 1600 ms, off after 4400 ms) are set in an effect that runs when `started` turns true, once per load (a `played` ref). When `active` turns false while the peek still runs (a `peeking` ref cleared by the off timer or by any input), clear the timers and set the switch off. Under Reduced_Motion the peek never starts. A switch the visitor already used is left alone.
    - `components/Costumes.tsx`: take `visibility`, pass `started = opened.costumes` and `active = current === 'costumes'`, and mount no timer on load with another page open.
    - Tests: update `tests/dom/xray.test.tsx` and `tests/dom/hooks.test.tsx` (the `useXrayDemo` cases take `{ started, active }`; the peek starts on first open, not before, not again on return, stops on input, stops on the switch, and is cancelled with the switch off on leave; a peek ended by input stays ended; reduced motion sets no timer); update `tests/dom/costumes.test.tsx` for the peek on first page open instead of on mount.
    - _Requirements: 9.1, 9.2, 9.3, 9.9, 6.4_

  - [x] 4.3 Drive the Live_Section from page visibility and delete `useInView`
    - `engine/useLiveWalkthrough.ts`: `LiveVisibility = { near: boolean; started: boolean; active: boolean }`. `settledAtStart = reduced` (the no-observer branch goes). The near effect loads the Light_Engine once, calls `warm()`, and under Reduced_Motion runs the first Shell Preset once. The autoplay effect runs when `started` is true, `reduced` is false, and `autoplayed.current` is false. A new effect runs when `active` turns false after `started`: bump the run token, clear `busy` and the message, call `walk.controls.park()`; reset `autoplayed.current` only when no walk answer was shown yet. A late engine answer of a bumped token is dropped.
    - `components/Walkthrough.tsx`: take `visibility`; compute `near = opened.costumes || opened.run`, `started = opened.run`, `active = current === 'run'`; pass `active` to `Theater`; use the sub-heading "Give the ghost a plan. It tries it on a copy first." (this string is also pinned by task 6.1).
    - `App.tsx`: pass the `visibility` value from `usePaging` (already wired in task 3.2).
    - Delete `engine/useInView.ts` and its tests. Remove the fake `IntersectionObserver` from `tests/lib/live-fakes.ts` and add the page-visibility helper there (re-export from `tests/lib/page-visibility.ts`).
    - Tests: update the tests that installed a fake observer to pass `visibility` (`near`, `started`, `active`) and keep their other assertions: `tests/dom/walkthrough.test.tsx`, `live-controller.test.tsx`, `live-controller.property.test.tsx`, `live-input.test.tsx`, `live-warn.test.tsx`, `live-reality.property.test.tsx`, `live-no-network.test.tsx`, `live-edit.test.tsx`, `reduced-motion-live.test.tsx`, `chips.test.tsx`, `live-badge.test.tsx`. Add to `live-controller.test.tsx`: leave during a walk parks it and drops a pending answer; return shows the parked step and does not autoplay again; leave before the first answer resets the autoplay so it runs on return; Replay works after return; a hash load on `#run` starts the autoplay. Remove the "no IntersectionObserver" case. Assert that the Live_Section creates no `IntersectionObserver`.
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 10.4, 10.5, 10.6, 6.4_

  - [x] 4.4 Write property test for the per-page start
    - **Property Pg8: Per-page start happens once and leaving cancels**
    - In `tests/dom/page-start.property.test.tsx`: generate page-opening sequences (any first page, repeats, leaves at any step of a walk) with the recording scheduler, fake engines, and reduced motion off. Assert items (a) to (f) of Property Pg8: the peek timers are set once on the first open of `costumes`; the autoplay starts once on the first open of `run`, also from the load hash `#run`; leaving `costumes` during the peek clears both timers and leaves the switch off; leaving `run` at any step leaves no pending timer, drops a pending answer, and leaves the walk in `settle(record, step)`; returning shows that state, places the Actor from a visible Theater only, and does not autoplay again except when the visitor left before the first answer; no placement runs while `run` is not current. With reduced motion on, no peek timer is set.
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 6.4**

  - [x] 4.5 Write property test for lazy loading
    - **Property Pg7: Nothing heavy loads before its page is near**
    - In `tests/dom/page-loading.property.test.tsx` (replaces `tests/dom/live-loading.property.test.tsx`; delete the old file): render the Walkthrough through `App` with fake `LiveLoaders`, a `Worker` spy, and a `fetch` spy. For generated page-opening sequences (any first page, any order, repeats), world picks, and Replay or step actions, assert: no loader call, no Worker, and no fetch until `costumes` or `run` was opened; after that the Light_Engine loader is called once, the SQL worker is created once, and `warm()` is called once; the Hand_Engine loader and the simulation worker are never called without a Ghost Hand pick, and then the Hand loader is called once; the Landing_Page never imports the Showcase code (a static check of the `index.html` closure is task 8.4; here, no `showcase/` module is in the module graph of `App`); no `IntersectionObserver` is created. Add the example sequences cover, recipe, costumes and cover, recipe, costumes, run, and the five single-page first openings of Requirement 10, criterion 8.
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8**

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the tests, typecheck, and lint of `@ghost-run/site`. The paged landing page works with the old copy. Ensure all tests pass, ask the user if questions arise.

- [x] 6. The copy deck of the landing page
  - [x] 6.1 Move the deck into data modules and update the components
    - `data/copy.ts` (new): `COVER`, `RECIPE_HEADS` (heading, sub-heading, block titles and sub-lines, sticker pattern, the chip text and its `title` list, the result card), `COSTUMES_HEADS` (heading, sub-heading, legend), `RUN_HEADS` (heading, sub-heading), `MAKE_HEADS` (heading, sub-heading, spellbook title, agent card texts, command, closing line). Use the exact strings of Requirement 11, criteria 1 to 6.
    - `data/skeleton.ts`: the eight parts keep a name and one line and lose `folder`; the cost cards keep name, tag, world line, Kiro line, and button, and lose `folder`, `usedTitle`, and the prefixes "Costume: " and "World: ". The six function names and the six spec names stay; the chip text "Built from 6 Kiro specs" is built from the array length.
    - `Hero.tsx`, `Recipe.tsx`, `Costumes.tsx`, `Walkthrough.tsx`, `Make.tsx`: read the texts from the data modules; the chip is the only element of the block's bottom row; each card renders name, tag, world line, chips, Kiro line, button in that order; the legend replaces the old note; the sr-only " not used" stays; the sticker N comes from the world-size data through `roundLines`. `Footer.tsx` is unchanged.
    - Tests: update `tests/unit/skeleton-data.test.ts` (eight parts without folders, six function names, the card fields of the deck, the six spec names in order); update `tests/dom/render.test.tsx` and `tests/dom/costumes.test.tsx` for the deck strings, the field order, and the legend; update `tests/dom/chips.test.tsx` and `tests/dom/live-badge.test.tsx` for the new sub-heading.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 6.2 Write property test for the pinned copy deck (landing page)
    - **Property Pg3: The copy deck is pinned (landing part)**
    - In `tests/dom/copy-deck.test.tsx`: the test holds the literal strings of Requirement 11 as its own expected values and also reads the data modules. For each of the five pages as the current page and X-ray on and off, assert each string at its place with the expected `href`, `title`, and accessible name: the cover kicker, heading, text (second sentence bold), and the two buttons with `#recipe` and `#run`; the three recipe blocks (the six function rows, the sticker with N from the world-size data, the eight parts, the chip and the ordered six-name `title`, the result card); the three cards in field order with the buttons and hrefs (`shell/`, `hand/`, `#make`); the legend; the Live_Section heading and sub-heading; the Make page texts and command; the footer and the `./THIRD_PARTY_NOTICES.txt` link. Enumerate the deck (finite) and say so in a comment. Assert that a change of a data-module string alone fails the test (mutate the module export in a fixture and expect the assertion to throw).
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.4**

  - [x] 6.3 Write property test for dropped texts (landing page)
    - **Property Pg4: Dropped texts stay dropped (landing part)**
    - In `tests/dom/dropped-texts.property.test.tsx` and `tests/unit/dropped-texts.test.ts`: hold the list of Requirement 12, criterion 1 (and, for the Showcase, criterion 2, shared through `tests/lib/dropped-texts.ts`) as literals. For each page state of the rendered Landing_Page (each page current, X-ray on or off), assert that the text content, every `title`, every `aria-label`, and the sr-only text contain none of them, apart from the exceptions of criterion 3. The unit test scans the source of `site/src/` outside the test files and, when `site/dist/` exists, the text of `site/dist/` (skipped with a printed reason when it does not). Add the failing fixture of Requirement 12, criterion 6: a rendered part with the folder line `core/ · ui/` added makes the check fail (assert that the check throws).
    - **Validates: Requirements 12.1, 12.3, 12.5, 12.6, 12.7**

- [x] 7. The Showcase
  - [x] 7.1 Write `showcase/sample-data.ts` and its text test
    - Plain exports: `README_TEXT` and `blacklightSources` (with the two hand-built Findings), `needles`, `links`, `actionLabels`, `changes`, `stepLabels`, `realScene`, `mirrorScene`, the five `CANDLE_STATES` (`CandleStateSample`), and `entries` (two Grave entries), with the values of `ui/gallery/main.tsx`. Build hidden characters with `String.fromCodePoint` from the same code points (tag base `0xE0000`, U+200B). Secrets: `sk-CANARY-abc123`; hosts: `collector.example` and `unrelated.test`. `import type` from `@ghost-run/core`; kit types from `@ghost-run/ui`. No literal hidden character. This is the first file under `site/src/showcase/`; task 1.1 is done.
    - Tests: `tests/unit/sample-data-text.test.ts`: the gallery source still contains the two shared constants (`HOST = 'collector.example'` and the canary); the sample-data file contains no hidden code point and no comment opener (scan by code point ranges); every host in it is reserved; the five candle states have the ids `pass`, `warn`, `block`, `unknown`, `none` in this order with the claims of Requirement 14, criterion 5. If task 1.2 recorded that the import spike failed, add here the text comparison of the gallery's helper constants (design Component 9 fallback) and note that task 7.2 uses it.
    - _Requirements: 14.2, 14.3, 14.4, 19.1, 19.2_

  - [x] 7.2 Write the drift test against the real gallery
    - `tests/dom/sample-data-drift.test.tsx`: as proven in task 1.2, import `ui/gallery/main.tsx` into `#root`; wait for its `main`; render the Showcase's kit parts with the same components and the module's data; compare the serialized `outerHTML` of each part: the five candles (matched by `data-candle-state` and label), the mirror (`section.gk-section` with `table.gk-table`), the blacklight view, the red thread view, the graveyard list, and the two open seances (click each tombstone in both trees). Normalize only the `useId` tokens (`id`, `for`, `aria-labelledby`, `aria-controls`). A fixture with one changed code point or one changed string in a copy of the data fails the comparison (assert that it throws).
    - If the spike failed, this task implements the text-comparison fallback in the same file name and records that choice in a comment.
    - _Requirements: 14.2, 14.3, 14.13_

  - [x] 7.3 Add the Showcase entry, the build config, and the shell page
    - `site/kit/index.html`: the static shell of `index.html` (title, viewport, `../favicon.svg`, `<div id="root">`, one module script `/src/showcase/main.tsx`), with no inline script, no inline style, and no `style` attribute.
    - `src/showcase/main.tsx`: imports `@fontsource/fredoka`, `00-fonts.css`, `01-base.css`, `01-nav.css`, `@ghost-run/ui/styles.css`, and `showcase/styles/showcase.css` (an empty file for now), in that order, and renders `ShowcaseApp`. `ShowcaseApp.tsx`: `Nav` (`root="../"`, `current="kit"`), an empty `main`, and the footer of Requirement 13, criterion 8 ("The kit lives in `ui/`." with `ui/` in `code`, and the link "Developer gallery →" to `./gallery/`).
    - `vite.config.ts`: two inputs (`index` and `kit/index.html`), `entryFileNames` that names the Showcase entry `assets/showcase-[hash].js`, `manualChunks: { 'vendor-react': ['react', 'react-dom'] }`, and `cssCodeSplit: true`. The CSP plugin adds the meta policy of `landingMetaPolicy()` to both HTML files.
    - `src/showcase/copy.ts`: the footer strings and the `UI_RENDER_RULES = 11` constant.
    - Tests: update `tests/unit/index-html.test.ts` to check `kit/index.html` (no inline script or style, no `style` attribute, the meta policy equals `landingMetaPolicy()`); add `tests/unit/landing-build-kit.test.ts` (runs the Vite build when `site/build/dist/` is stale or missing, as `landing-build.test.ts` does): both HTML files exist, the references in `kit/index.html` start with `../assets/` and resolve to files of the build, `index.html` loads no `showcase-` asset, the landing CSS holds no kit rule (`gk-` selectors), and the Showcase CSS holds no landing-only rule. Add `tests/dom/showcase-nav.test.tsx`: the shared `Nav` renders the hrefs `../`, `../shell/`, `../hand/`, `./`, and the GitHub URL on `/kit/`, and the values of today on `/`, and "UI Kit" carries `on` and `aria-current="page"`.
    - _Requirements: 13.1, 13.2, 13.3, 13.8, 16.1, 2.5, 14.1_

  - [x] 7.4 Add the page chrome: hero, part cards, Frame, art, and styles
    - `showcase/art/` (original SVG as React components with `aria-hidden="true"`: the hero ghost, six part icons, card icons), `Hero.tsx` (kicker, heading with "the same screens" emphasised, text, two chips "Used by Ghost Shell and Ghost Hand" and "11 render rules" with the number from `UI_RENDER_RULES`, the art), `PartCards.tsx` (a `section` named "Parts" with six anchors to `#p-mirror`, `#p-candle`, `#p-blacklight`, `#p-thread`, `#p-grave`, `#p-lights` and the lines of Requirement 13, criterion 6), `PartRow.tsx` (section with the row id, `h2`, lead, at most two bullets, a decorative `aria-hidden` number, alternating side class, a `Frame` slot), and `Frame.tsx` (`<figure class="frame">` with the `frame-bar` holding three decorative dots and no text, and `frame-body`).
    - `data/kit-links.json`: the nav hrefs, the card fragments, the row ids, and the footer link `./gallery/`; the components read it.
    - `showcase/styles/showcase.css`: hero, cards, rows, Frame look, the two keyframes (ghost bob and orbit), 24 px hit areas, the focus ring, and a reduced-motion block that covers every animation. It selects no `gk-*` class except inside `.frame-body` for the layout of its own wrappers. No `<img>`, no `data:` URL.
    - `ShowcaseApp.tsx`: render the hero, the cards, and the seven `PartRow` sections with the headings, leads, and bullets of Requirement 13, criterion 7 (each Frame is empty until task 7.5), then the footer.
    - `src/showcase/copy.ts`: add every deck string of Requirement 13.
    - Tests: `tests/dom/showcase.test.tsx` (Pg3, Showcase part): every string of Requirement 13 at its place, the hero chips and the number 11, the six card hrefs and lines, the seven rows in order with ids, headings, leads, and bullets, one `h1`, one `h2` per row, the landmarks, the section named "Parts", the footer and its `./gallery/` link, the Frame bar without text, no `img`, no `data:` URL; `tests/unit/kit-links.test.ts` (the JSON equals the rendered links and row ids); `tests/unit/ui-render-rules.test.ts` (the count of `UI-P` ids in `.kiro/specs/ui-kit/requirements.md` equals `UI_RENDER_RULES`).
    - _Requirements: 2.2, 2.4, 13.2, 13.4, 13.5, 13.6, 13.7, 13.9, 18.1, 18.3, 18.4, 18.5_

  - [x] 7.5 Add the seven rows with the real kit components
    - `rows/MirrorRow.tsx` (real `MirrorWorld` in a `KitRoot` with the gallery changes, scenes, and step labels, with no Dark / Lights on group: the kit's own Lights switch inside the frame is the theme control, and the Showcase never writes `data-theme`), `rows/CandleRow.tsx` (the `tablist` of five tabs with roving `tabindex`, `aria-selected`, `aria-controls`, arrow keys, Home and End, Enter and Space; the panel renders the real `Candle` with exactly the props of the selected `CANDLE_STATES` entry; the first tab is selected at load), `rows/BlacklightRow.tsx` (the real `BlacklightView`, switch off at load, no second switch), `rows/ThreadRow.tsx` (the real `RedThreadView`), `rows/GraveRow.tsx` (the real `Graveyard`; `openId` state; `SeanceView` with `onBack`), `rows/LightsRow.tsx` (two `KitRoot` with `initialTheme` `dark` and `light`, each with a `Candle` in the Pass state), `rows/ControlsRow.tsx` (`gk-button` enabled and disabled, `gk-input` empty and invalid, `gk-textarea` enabled and disabled, labels bound to inputs). Each Frame has its own `KitRoot`. Wire the rows into `ShowcaseApp.tsx`.
    - Tests: `tests/dom/showcase-rows.test.tsx`: each row mounts its real component root (candle section with `data-candle-state`, mirror table, blacklight switch, thread view, graveyard list, two candles, the three control kinds); selecting each Candle tab shows the verdict that the real `Candle` shows alone with the same props; the Blacklight switch reveals the hidden letters; opening a tombstone shows the real `SeanceView` and its back control returns to the list; the first tab is selected at load and only one tab has `aria-selected="true"`.
    - _Requirements: 14.1, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 15.1, 15.2, 15.3, 18.2_

  - [x] 7.6 Write the Showcase accessibility and motion tests
    - `tests/dom/showcase-a11y.test.tsx`: the tab roles and roving `tabindex`; arrow keys, Home, End, Enter, and Space on the tabs; `aria-controls` names the panel; every interactive Showcase element is reachable by Tab; decorative SVG has `aria-hidden="true"`; the stylesheet declares 24 px minimums for the cards, tabs, and links, a visible focus ring, and a reduced-motion block that names the ghost bob and the orbit; no `gk-*` rule or kit token is overridden outside `.frame-body` layout (scan `showcase.css`).
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 14.12_

  - [x] 7.7 Write property test for the real kit in the rows
    - **Property Pg5: The showcase renders the real kit components**
    - In `tests/dom/showcase-kit.property.test.tsx`: for each of the seven rows (enumerated) and generated sequences of tab selections, Blacklight toggles, tombstone opens and back actions, and clicks on the kit Lights switch, assert that the Frame contains the root element that the real component produces for the same props; that the Candle row shows the same verdict markup as the real `Candle` rendered alone with the inputs of the selected tab; and that the page has no `img` element and no `data:` URL. Include the comparison of each kit part with the output of the same part in the real gallery (reuse the helper of task 7.2).
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.13**

  - [x] 7.8 Write property test for the frame theme
    - **Property Pg10: A frame's theme follows its own kit Lights switch and no other frame**
    - In `tests/dom/showcase-theme.property.test.tsx` with the real `KitRoot`: for generated sequences of clicks on the real Lights switch of any frame, assert that each frame's `data-theme` follows its own kit Lights switch (`dark` at load, except the light candle of the Lights row, which starts `light`); the frames stay independent, so every other frame keeps its attribute and its component state (the selected Candle tab, the Blacklight switch, the open tombstone); the Mirror row has no Dark / Lights on control and no `aria-pressed` group; the page around the frames keeps its dark palette; the Showcase never writes `data-theme` (an attribute-setter spy on `.gk-root`, plus a scan of the source files of `site/src/showcase/` for `data-theme` writes).
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**

- [x] 8. Headers, assembly, and the Site_Check
  - [x] 8.1 Add the `/kit/` header blocks and write the policy property test
    - **Property Pg6: No `'unsafe-eval'` anywhere**
    - `scripts/lib/headers.mjs`: `buildRootHeaders` adds the blocks `/kit/` and `/kit/index.html`, each with the three headers of `LANDING_HEADERS`, built from the same constants as `/` and `/index.html`. No `/kit/*` block, no `/kit/gallery/*` block, no bare `/*` block. `scripts/lib/csp.mjs` is unchanged.
    - Tests: update `tests/unit/headers.test.ts` and `tests/unit/headers.property.test.ts` ("no block for `/kit/*`" becomes "the `/kit/` blocks equal the `/` block apart from the path; no `/kit/*`"; the scope generator also checks `/kit/`). Write `tests/unit/csp-kit.property.test.ts`: for any generated shell headers text, every block for `/`, `/index.html`, `/kit/`, and `/kit/index.html` equals the Landing_Policy block apart from the path; none of them and neither meta policy contains `'unsafe-eval'`, `'unsafe-inline'`, `http:`, `https:`, or `*`; scoping the shell blocks under `/shell` leaves the `/kit/` blocks unchanged; the Site_Check rule function (task 8.3 extends it; here the existing policy rule) accepts the file and rejects a copy where any of the five tokens is added to a `/kit/` block. The chunk part of Pg6 (no `eval` or `Function` constructor call in the Showcase chunks, no engine, worker, or wasm reference) is asserted on the real build output in `tests/unit/landing-build-kit.test.ts` (extend it here).
    - **Validates: Requirements 16.6, 17.1, 17.2, 17.3, 17.5, 17.6, 17.7**
    - _Requirements: 17.1, 17.2, 17.4, 17.7_

  - [x] 8.2 Move the gallery to `/kit/gallery/` in the assembly
    - `scripts/build-site.mjs`: `COPIES` copies the landing build first (it already holds `kit/index.html` and the page assets), then `ui/dist` to `kit/gallery`. Gallery files are copied unchanged. The summary prints the file count of `/kit/gallery/`. The missing-output messages stay in the form `missing build output: <path> (build it with: ...)`, and the check for `site/build/dist/kit/index.html` names that file.
    - Tests: update `tests/unit/build-site.test.ts` (the gallery lands at `kit/gallery/`; `kit/index.html` comes from the landing build; the `/kit/*` regex becomes the Requirement 17 blocks; the symlink test path moves; the gallery files are byte-equal to `ui/dist`; a missing `ui/dist` still gives the message); update `tests/unit/site-dist.test.ts` (the real dist holds `kit/index.html` and `kit/gallery/index.html`, the Showcase links resolve, and the gallery is byte-equal to `ui/dist`) with a skip and printed reason when `site/dist/` does not exist yet.
    - _Requirements: 16.2, 16.3, 16.4, 16.8, 16.10, 17.4_

  - [x] 8.3 Extend the Site_Check for the Showcase and set the size limits
    - `scripts/check-site.mjs`: `REQUIRED_PATHS` adds `kit/gallery/index.html`; app folders become `shell/`, `hand/`, `kit/gallery/` so `kit/index.html` and the page assets get the full Landing_Page rules; the inline-script, `style`-attribute, and meta-policy checks run for `PAGE_FILES = ['index.html', 'kit/index.html']` (the notice-link rule stays for `index.html`); new rules `RULE_SHOWCASE_ENGINE` (the Showcase entry or a chunk in its static closure names an Engine_Bundle, a worker file, or a `.wasm` file), `RULE_LANDING_SHOWCASE` (the Landing_Page closure names an asset with the prefix `showcase-`), `RULE_SHOWCASE_SIZE`, `RULE_KIT_BLOCK` (a `_headers` block under `/kit/` differs from the block of `/` apart from the path); `RULE_ENTRY_SIZE` measures the closure of static imports (existing `extractStaticImports`, followed to any depth) against the 360,000 B limit; `policyRequirements` also covers the `/kit/` blocks and the meta policy of `kit/index.html`; the declared links of `data/kit-links.json` must resolve from `kit/index.html` to a file of the dist and each fragment must name a row id.
    - Build the site pieces needed to measure (`corepack pnpm --filter @ghost-run/site build`), read the Showcase closure size, and set `SHOWCASE_MAX_BYTES` to that size times 1.15, rounded up to the next 10 kB, with a comment that names Requirement 16, criterion 7. Report the measured closure sizes of the Landing_Page and of the Showcase in the task result for task 9.1. If the landing closure exceeds 360,000 B, stop and report; do not raise the limit.
    - Tests: update `tests/unit/check-site.test.ts`, `check-site.links.property.test.ts`, and `check-site.external.property.test.ts` (fixtures gain `kit/gallery/index.html` and the new rules; the `kit/` app-folder assumption becomes `kit/gallery/`); add cases for each new rule (an engine reference in the Showcase, a `showcase-` asset in `index.html`, an oversized Showcase closure, a `/kit/` block that differs from `/`, a declared link that does not resolve, a fragment that names no row).
    - _Requirements: 16.3, 16.5, 16.6, 16.7, 17.5, 10.7, 13.3_

  - [x] 8.4 Add the contrast pairs and the build-level assertions
    - `tests/unit/contrast.test.ts`: add the pairs that Mockup_V6 and Mockup_Kit add (page bar text and border, dot and active dot, mint Next button, Showcase part card text and border, the Frame border, the chips): 4.5:1 for text and 3:1 for component borders, read from the built stylesheets or the token files. Where a mockup value fails, raise it in the stylesheet only as far as the limit and list the change in a code comment for task 9.1.
    - `tests/unit/landing-build.test.ts`: assert the closure size of `index.html` against 360,000 B, no `showcase-` asset reachable from `index.html`, no kit stylesheet in the landing CSS, and (with the Pg6 chunk checks of task 8.1) no `eval` and no Function-constructor call in the Showcase chunks.
    - _Requirements: 18.6, 10.7, 16.1, 17.6_

- [x] 9. Documentation
  - [x] 9.1 Update the README and `docs/measurements.md`
    - `README.md`: add at most three lines to the "Landing site" section (five pages with the hashes `#cover`, `#recipe`, `#costumes`, `#run`, `#make`; `/kit/` is a showcase of the real UI kit with the gallery's sample data; the developer gallery is at `/kit/gallery/`); change the build-section sentence to "the kit showcase at `/kit/` and the kit gallery at `/kit/gallery/`"; keep the "Live site" line pointing to `/kit/` for the UI kit; add the line "The paged landing mockup (v6) and the kit showcase mockup were made by Claude Code; Kiro built them." to the "Not written by Kiro" paragraph. List no new dependency (none was added).
    - `docs/measurements.md`: add the section "Paged landing and showcase measurements" with the Landing_Page and Showcase closure sizes reported by task 8.3, the repairs of the differences D1 to D14 and O1 to O22 that this plan applied, the contrast changes of task 8.4, and these entries for the owner's agent, marked "not yet measured": the comparison with the two mockups at 390 px, 920 px, and 1280 px; the Chrome load of `/` and `/kit/` under the root `_headers` with every control used and no policy violation in the console; the keyboard and screen-reader pass; the browser load times. Keep the section "Sample-data spike" of task 1.2. Do not edit `docs/devlog.md`.
    - Tests: update `tests/unit/readme.test.ts` for the new statements, the replaced sentence, the line count of the "Landing site" addition (at most three lines), and the new "Not written by Kiro" line; add to `tests/unit/measurements.test.ts` (create it if missing) that the new section holds the headings above.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 2.6, 17.3_

- [x] 10. Final build and site check
  - Run, in this order from the repository root: `corepack pnpm build:site`, then `corepack pnpm --filter @ghost-run/site check`. Then run `corepack pnpm --filter @ghost-run/site test`, `typecheck`, and `lint`, the gated `corepack pnpm --filter @ghost-run/site test:record`, and the possession scan of `site/` and `.kiro/specs/site-pages/` (it must return `clean`). Confirm that the build finishes within 60 s with the three app builds present, that `site/dist/` holds `index.html`, `kit/index.html`, `kit/gallery/index.html`, `shell/index.html`, `shell/ko.html`, `hand/index.html`, `_headers`, and `THIRD_PARTY_NOTICES.txt`, and that `git status` shows no change under `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, or `ghost-runner/`. All pass. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.1, 16.4, 16.9, 19.1, 21.1, 21.2_

- [x] 11. Chrome review fixes (completed)
  - [x] 11.1 Fit page 4 and keep the speech bar above the Page_Bar
    - Add `site/src/styles/13-fit.css`, scoped to `#run`: tighter header, control card, stepper, theater, panes minimum height, and judge row; `.say` is sticky at `bottom: calc(var(--bar-h) + 8px)` when the page scrolls. Deliberate deviation from Mockup_V6.
    - _Requirements: 2.7, 8.7, 8.8_

  - [x] 11.2 Align and pin the Showcase text column
    - `.kp-text`: `align-items: start`, sticky at `top: 12px`, static at max-width 760 px; lead 16 px.
    - _Requirements: 2.7, 13.10_

  - [x] 11.3 Keep the nav and the world tabs on one row on phones
    - At max-width 560 px: nav nowrap with smaller pills and a horizontally scrolling pills row (in `01-nav.css`, both pages); world tabs and Replay nowrap with smaller tabs and hidden icons, replacing the mockup rule at 760 px.
    - _Requirements: 2.7, 4.9, 8.9_

  - [x] 11.4 Record the final sizes
    - `docs/measurements.md` and `tests/unit/measurements.test.ts`: Landing index entry 115,491 B, closure 346,648 B (limit 360,000 B); Showcase closure 285,426 B; the deviations above are listed.
    - _Requirements: 20.4, 20.6_

## Notes

- Every task is required. No task is marked optional.
- Property map (design number: task): Pg1 (2.2, 3.4), Pg2 (2.3, 3.4), Pg3 (6.2, 7.4), Pg4 (6.3), Pg5 (7.7), Pg6 (8.1, with the chunk checks in 8.4), Pg7 (4.5), Pg8 (4.4), Pg9 (2.5), Pg10 (7.8). The sample-data spike is task 1.2; the drift test (design Component 9) is task 7.2.
- Task 1.1 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- Task 8.3 reports measured sizes; task 9.1 writes them. If the landing closure exceeds the 360 kB limit, the task stops and reports instead of raising the limit.
- **Not Kiro tasks (owner or Claude Code):**
  - The comparison of the built Landing_Page and Showcase with Mockup_V6 and Mockup_Kit at 390 px, 920 px, and 1280 px (Requirement 2, criterion 6).
  - The Chrome load of `/` and `/kit/` under the root `_headers` with every control used and no console policy violation (Requirement 17, criterion 3).
  - Load times, the keyboard and screen-reader pass, and the review of the changed contrast values.
  - Deployment and the devlog.
- Open questions O1 to O22 and decisions Q1 to Q6 of `design.md` are taken with the stated defaults (for example `pushState` per Turn, the same policy for `/kit/`, the kit's own Lights switch kept visible).
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5"] },
    { "id": 7, "tasks": ["5"] },
    { "id": 8, "tasks": ["6.1", "7.1", "7.3"] },
    { "id": 9, "tasks": ["6.2", "6.3", "7.2", "7.4"] },
    { "id": 10, "tasks": ["7.5"] },
    { "id": 11, "tasks": ["7.6", "7.7", "7.8"] },
    { "id": 12, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 13, "tasks": ["8.4"] },
    { "id": 14, "tasks": ["9.1"] },
    { "id": 15, "tasks": ["10"] },
    { "id": 16, "tasks": ["11.1", "11.2", "11.3", "11.4"] }
  ]
}
```

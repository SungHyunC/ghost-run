# Requirements Document

## Introduction

The `site-pages` spec makes three changes to the Ghost Run+ site. It builds on the `site` spec (`.kiro/specs/site/`), on the `site-live` spec (`.kiro/specs/site-live/`), and on the package `site/` (`@ghost-run/site`) that those specs produced.

1. **A paged landing page.** The landing page `/` stops being one long scroll. It becomes five pages that the visitor turns one at a time, like a book: Cover, What's in the skeleton?, One skeleton, three costumes, Watch the ghost work, and Make your own costume. A page bar at the bottom shows where the visitor is and turns the pages.
2. **A kit showcase at `/kit/`.** Today `/kit/` is the developer gallery of `ui/gallery`. The site now builds its own showcase page there. The showcase presents the six parts of the UI kit, and each part row shows the real component of `@ghost-run/ui`, fed with the gallery's sample data. The developer gallery moves to `/kit/gallery/` and stays as it is.
3. **Much shorter copy.** The owner asked for less text everywhere. The brief's copy deck (section C) fixes every string of the landing page and the showcase. The texts that the deck drops (folder paths, long explanations) must not come back.

The inputs of this spec are the design brief `docs/design/pages-brief.md` (Draft 1, 2026-11-21), the mockup `docs/design/paged-landing-mockup.html` ("v6"), and the mockup `docs/design/kit-showcase-mockup.html`. The text of the brief wins over the text of the mockups. The pictures of the showcase mockup are crops of the real kit parts and are not shipped: the page renders the real components. Every claim of the brief was checked against the repository on 2026-11-21 for this spec. Where the repository differs from the brief, this spec and its design follow the repository. The differences are listed in the section "Differences Between the Brief and the Repository" at the end of this document, and the design lists them under "Open questions" in `design.md`.

The work stays in the package `site/`. It changes no file of `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, or `ghost-runner/`. The live engines, the policy of the landing page, the parity tests, and the recorded-run fallback stay as `site-live` made them. Some requirements and tests of `site` and `site-live` change because paging replaces the scroll triggers and the copy deck replaces the old texts. Requirement 22 names every amendment.

Safety claims follow the world-contract steering. The paged landing page and the showcase claim no safety property. The showcase shows what the kit draws from the data it receives, and the kit never decides. Hidden characters are never written literally in this document or in any repository file of this feature: a hidden character is named by its code point and built in code from code points. Hosts in examples use reserved domains, and secrets are canary values.

This spec covers these parts:

1. **Paging**: the five pages, the page bar, the navigation inputs, the turn effect, the addresses, the one-page-at-a-time rules, and reduced motion.
2. **Page start and lazy loading**: the X-ray peek and the walkthrough autoplay start when their page first opens, and nothing heavy loads before its page is near.
3. **The copy deck**: the pinned strings of the landing page and the showcase, and the dropped texts.
4. **The showcase**: layout, real kit components, sample data, controls, and the Lights on frame.
5. **Assembly, headers, and checks**: `/kit/` built by the site, `/kit/gallery/` from `ui/dist`, the showcase policy, and the Site_Check changes.
6. **Docs, gates, and amendments**: README, measurements, final build, and the amended criteria of `site` and `site-live`.

## Glossary

- **Site_Package**: The pnpm workspace package `@ghost-run/site` in `site/`.
- **Brief_Pages**: The file `docs/design/pages-brief.md`.
- **Mockup_V6**: The file `docs/design/paged-landing-mockup.html`, the visual reference of the paged Landing_Page.
- **Mockup_Kit**: The file `docs/design/kit-showcase-mockup.html`, the visual reference of the Showcase.
- **Landing_Page**: The page `/` (`index.html`) of the assembled site.
- **Book_Page**: One of the five pages of the Landing_Page: `cover`, `recipe`, `costumes`, `run`, and `make`, in this order. The Page_Id is the hash name of a Book_Page.
- **Page_Id**: One of `cover`, `recipe`, `costumes`, `run`, `make`.
- **Current_Page**: The Book_Page that the visitor sees. Exactly one Book_Page is the Current_Page at rest.
- **Turn**: The change of the Current_Page from one Book_Page to another, with or without the turn effect.
- **Turn_Effect**: The animation of a Turn: a slide and fade (option B of Page_Turn_Prototype). The leaving and the arriving page overlap, move 9% sideways, and fade, in 360 ms and 480 ms (60 ms delay), with no rotation and no perspective. The sky stays still.
- **Page_Turn_Prototype**: The file `docs/design/page-turn-prototype.html`, made by Claude Code at the owner's request; the owner chose its option B, "slide".
- **Page_Bar**: The sticky element at the bottom of the Landing_Page with the Back button, five dots, the counter, and the Next button.
- **Page_Live_Region**: The polite live region `#pgLive` of the Landing_Page that announces a Turn.
- **Live_Section**: Section 3 of the Landing_Page, the element `section#run`, which is the content of the Book_Page `run`.
- **Costumes_Section**: The element `section#costumes`, the content of the Book_Page `costumes`.
- **Xray_Peek**: The X-ray demo of the `site` spec (switch on after 1600 ms, off after 4400 ms), played once.
- **Autoplay**: The run of the first Ghost Shell Preset that `site-live` starts when the Live_Section is first seen.
- **Light_Engine**, **Hand_Engine**, **Engine_Bundle**, **Entry_Bundle**, **Preset**, **Reduced_Motion**, **Site_Check**, **Short_Run**: As in the `site-live` glossary.
- **Near**: In this spec, the state in which the Book_Page `costumes` or the Book_Page `run` has been opened at least once. It replaces the 200 px viewport margin of `site-live`.
- **Copy_Deck**: Section C of Brief_Pages: the strings that the pages show, word for word.
- **Dropped_Text**: A text that the Copy_Deck removes. Requirement 12 lists them.
- **Showcase**: The page `/kit/` (`kit/index.html`) that the Site_Package builds.
- **Gallery**: The developer gallery, the page of `ui/gallery/main.tsx` that `ui` builds into `ui/dist/`. In the assembled site it is at `/kit/gallery/`.
- **Gallery_Sample_Data**: The fixture values of `ui/gallery/main.tsx`: the hidden-character README text and its Findings, the needles and ThreadLinks, the Change lists and Scenes, the five verdicts and three isolation claims, and the two Grave entries.
- **Kit_Component**: A component of the public entry of `@ghost-run/ui`: `Candle`, `MirrorWorld`, `BlacklightView`, `RedThreadView`, `Graveyard`, `SeanceView`, and `KitRoot`.
- **Showcase_Row**: One of the seven rows of the Showcase: Mirror world, Candle, Blacklight, Red thread, Graveyard, Lights on, and Base controls.
- **Frame**: The device frame of a Showcase_Row that holds the real Kit_Components.
- **Frame_Theme**: The `data-theme` value (`dark` or `light`) on the `.gk-root` element that `KitRoot` renders inside a Frame.
- **Landing_Policy**: The Content-Security-Policy of `/`, built from `LANDING_CSP_PARTS` of `site/scripts/lib/csp.mjs`.
- **Site_Dist**: The directory `site/dist/` that `build-site.mjs` assembles.

## Requirements

### Requirement 1: Scope, Placement, and Dependency Direction

**User Story:** As a maintainer, I want the change to stay inside the site package with clear import rules, so that the apps, the worlds, the core, and the kit stay untouched.

#### Acceptance Criteria

1. THE work of this spec SHALL NOT change a file of `apps/`, `worlds/`, `core/`, `ui/`, `wards-config/`, or `ghost-runner/`. IF a change there is unavoidable, THEN THE task SHALL stop and report it, and SHALL NOT make the change.
2. THE Site_Package SHALL keep the rule of `site-live` that all code which imports an engine is in `site/src/live/`. THE paging code and the page components SHALL import no engine, no world package, and no `@ghost-run/*` package.
3. THE Showcase code SHALL be in one folder of `site/src/` that is separate from `site/src/live/` (the design names it). THAT folder SHALL be the only place outside `site/src/live/` that may import `@ghost-run/ui`, through its public entry point, and `@ghost-run/core` as type-only imports. THE ESLint configuration SHALL add one block for that folder that allows exactly these imports and keeps the syntax and network bans of `src/`. A fixture lint test SHALL show that an import of `@ghost-run/ui` from `site/src/components/` fails and from the Showcase folder passes.
4. THE tasks.md of this spec SHALL contain a task that updates `.kiro/steering/structure.md` so that the `site/` entry says that the Showcase folder of `site/src/` may import `ui/` through its public entry point. THIS requirements phase edits no steering file. THE task SHALL be completed before the first Showcase component imports `@ghost-run/ui`.
5. THE Site_Package SHALL add no third-party dependency that the repository does not already use. THE Showcase SHALL use only `react`, `react-dom`, `@fontsource/fredoka`, and `@ghost-run/ui` with its dependencies.
6. THE Site_Package SHALL make no network call and no LLM call in its scripts, tests, or source, and the tasks of this spec SHALL use no Kiro Crew tool.
7. THE paging code SHALL make no network request, SHALL store nothing in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies, and SHALL write only a Page_Id to the address hash.

### Requirement 2: Fidelity to the Mockups

**User Story:** As the owner, I want the paged page and the showcase to look and move like the mockups, so that nothing I approved is lost in the port.

#### Acceptance Criteria

1. THE Landing_Page SHALL reproduce, from Mockup_V6, these items without a change of value: the page bar markup, class names, and ids (`pagebar`, `pg-btn`, `pg-prev`, `pg-next`, `pg-mid`, `pg-dots`, `pg-dot`, `pg-count`, `pgPrev`, `pgNext`, `pgNextTitle`, `pgCount`, `pgDots`, `pgLive`), the paging CSS, the sizes and colors, and the mint Next button. The Turn_Effect is the one exception: it follows Page_Turn_Prototype (Requirement 5, criterion 5), not the rotating page of Mockup_V6.
2. THE Showcase SHALL reproduce, from Mockup_Kit, these items without a change of value: layout, class names, sizes, spacing, radii, colors, the hero art (the ghost and the six part icons around it), the card grid, the alternating rows, the Frame look, and the keyframes. THE Showcase SHALL reuse the palette, the font Fredoka, the symbols, and the motion rules of the Landing_Page and SHALL NOT copy a second time the rules of the nav, the logo, or the section heads that the Landing_Page already has.
3. THE page SHALL apply only these changes to the mockups, and no others: (a) the mockup scripts become React code and tests; (b) the Copy_Deck replaces the texts of the mockups wherever the two differ (Requirement 12); (c) the Frame holds the real Kit_Components in place of pictures (Requirement 15); (d) the rules of Requirements 3 to 9 and 19 to 21; (e) the renames and repairs of the section "Differences Between the Brief and the Repository"; (f) the deliberate deviations of criterion 7.
4. THE Showcase SHALL contain no picture of a kit part, no `<img>` element, and no `data:` URL. THE 440 kB of embedded pictures of Mockup_Kit SHALL NOT be copied.
5. THE static HTML of both pages SHALL contain no inline `<style>`, no inline `<script>`, and no `style` attribute. Styles that React sets through the CSSOM (for example the custom property `--a` of the orbit icons) are allowed.
6. THE owner's agent SHALL compare the built Landing_Page and Showcase with the two mockups at widths of 390 px, 920 px, and 1280 px in Chrome, and SHALL record the result and every difference in `docs/measurements.md`. This comparison is not a Kiro task and not an automated test.
7. THE pages SHALL keep these deliberate deviations from the mockups, found in the Chrome review at 390 px, 920 px, and 1280 px, and `docs/measurements.md` SHALL list them: (a) the spacing of the Book_Page `run` is tighter than Mockup_V6 (Requirement 8, criteria 7 and 8); (b) the Showcase text column is top-aligned and sticky (Requirement 13, criterion 10); (c) on windows of 560 px or less the nav stays on one row and the world tabs of the Live_Section stay on one row with Replay (Requirement 4, criterion 9, and Requirement 8, criterion 9).

### Requirement 3: Five Pages, One Active

**User Story:** As a visitor, I want the landing page split into pages that I turn one at a time, so that I read one idea at a time.

#### Acceptance Criteria

1. THE Landing_Page SHALL render exactly five Book_Pages as direct children of one container `#pages`, in this order, with these Page_Ids, titles, and short labels:

| # | Page_Id | Title | Short label | Content |
|---|---|---|---|---|
| 1 | `cover` | Let your agent's ghost try it first | Cover | The hero |
| 2 | `recipe` | What's in the skeleton? | Skeleton | `section#recipe` (section badge 1) |
| 3 | `costumes` | One skeleton, three costumes | Costumes | `section#costumes` (section badge 2) |
| 4 | `run` | Watch the ghost work | Ghost at work | `section#run` (section badge 3) |
| 5 | `make` | Make your own costume | Your own | `section#make` (section badge 4) and the footer |

2. EACH Book_Page element SHALL carry `data-page` with its Page_Id and `data-title` with its title. THE sections SHALL keep their ids `recipe`, `costumes`, `run`, and `make`, and the badges 1 to 4 SHALL stay as they are.
3. AT rest, exactly one Book_Page SHALL be the Current_Page. THE Current_Page SHALL be in the layout and in the accessibility tree. EVERY other Book_Page SHALL have the attribute `inert` and SHALL NOT be rendered in the layout (`display: none` or the equivalent in the stylesheet).
4. THE Landing_Page SHALL open on the Book_Page named by the address hash (Requirement 7, criterion 3) and on `cover` when the hash names none.
5. (Property `one-page-reachable`.) FOR ALL generated sequences of Turn requests (Back, Next, a dot, a key, a swipe, a hash change, an in-page link), THE Landing_Page SHALL end with exactly one Current_Page, and THAT page SHALL be the page that the last request named, after any running Turn_Effect has ended. EVERY Book_Page SHALL be reachable from every other Book_Page through the dots.
6. THE wrapper element of the page content in `App.tsx` that has the class `page` today SHALL be renamed so that the class `page` of Mockup_V6 is used only by the Book_Pages (Difference D1).
7. THE content of each Book_Page SHALL be the content of its section today, apart from the Copy_Deck (Requirement 11) and Requirement 9. THE hero SHALL stay in the Book_Page `cover` with its art. THE footer SHALL be the last element of the Book_Page `make`.
8. THE nav SHALL stay above the Book_Pages on every page. THE nav link "Home" SHALL open the Book_Page `cover` (Requirement 7, criterion 5). THE nav links SHALL be Home, UI Kit, and GitHub, in that order. THE apps SHALL be reached from the costume cards ("Open Ghost Shell →" and "Open Ghost Hand →").
9. THE cover SHALL show, below its two buttons, one row with two plain anchors: "Ghost Shell" (App 1, "shell and SQL") to `shell/` and "Ghost Hand" (App 2, "a robot arm") to `hand/`. THE text SHALL live in `COVER` in `data/copy.ts`. THE links SHALL use the existing `.btn.small` style (lighter than the two main buttons), SHALL show the focus ring, SHALL wrap without horizontal overflow at 390 px, and SHALL add no motion. THE nav SHALL still have no app links (criterion 8).

### Requirement 4: The Page Bar

**User Story:** As a visitor, I want a bar that shows where I am and turns the page, so that I never feel lost.

#### Acceptance Criteria

1. THE Page_Bar SHALL be a `nav` element with the accessible name "Pages", sticky at the bottom of the visible window, and SHALL stay visible while a tall Book_Page scrolls.
2. THE Page_Bar SHALL show, in this order: the button "‹ Back"; five dot buttons with the short labels "Cover", "Skeleton", "Costumes", "Ghost at work", and "Your own"; the counter in the form "2 / 5"; and the button "Next" followed by the title of the next page and the sign "›".
3. EACH dot SHALL have the accessible name "Page N: <title>" with N from 1 to 5 and the title of Requirement 3, criterion 1. THE dot of the Current_Page SHALL carry the class `on` and `aria-current="page"`. NO other dot SHALL carry `aria-current`.
4. WHILE the Current_Page is page 1, THE Back button SHALL be disabled. WHILE the Current_Page is page 5, THE Next button SHALL be disabled and SHALL show "The end" in place of a page title.
5. WHEN the visitor presses Back, Next, or a dot, THE Landing_Page SHALL turn to the previous page, the next page, or the page of the dot.
6. THE counter and the Next title SHALL change with every Turn and SHALL always agree with the Current_Page.
7. EVERY button of the Page_Bar SHALL have a hit area of at least 24 by 24 CSS pixels, SHALL be reachable with the Tab key, and SHALL show the visible focus ring of the page.
8. THE Page_Bar SHALL follow Mockup_V6 on a window of 390 px: no horizontal overflow, with the dot labels hidden only where Mockup_V6 hides them.
9. WHILE the window is 560 px wide or less, THE nav SHALL stay on one row (no wrapping, smaller pills, the pills row scrolls horizontally), on the Landing_Page and on the Showcase, with the rules in the shared `01-nav.css`.

### Requirement 5: Keyboard, Swipe, and the Turn Effect

**User Story:** As a visitor, I want to turn pages with the keyboard or a swipe, without the page fighting my other controls.

#### Acceptance Criteria

1. WHEN the visitor presses ArrowRight or PageDown, THE Landing_Page SHALL turn to the next page. WHEN the visitor presses ArrowLeft or PageUp, THE Landing_Page SHALL turn to the previous page. AT the first or the last page, THE key SHALL change nothing.
2. THE Landing_Page SHALL ignore these keys WHEN the event target is an `input` (of any type, including `range`), a `textarea`, a `select`, or an element with `contenteditable`, or an element with the role `tab`, `slider`, `switch`, or `textbox`, WHEN the event was already handled (`defaultPrevented`), and WHEN `Alt`, `Ctrl`, `Meta`, or `Shift` is held. The reasons are that the plan field, the three sliders, the world tabs, and the X-ray switch of the Landing_Page use these keys themselves (Difference D2).
3. WHEN a touch starts on the Book_Pages container and ends with a horizontal move of more than 60 px (the absolute horizontal distance is greater than 60 and greater than the absolute vertical distance), THE Landing_Page SHALL turn to the next page for a move to the left and to the previous page for a move to the right. A move of 60 px or less SHALL NOT turn a page.
4. THE Landing_Page SHALL NOT treat as a swipe a touch that starts on an `input`, a `textarea`, a `select`, or an element with the role `slider` (the Ghost Hand sliders of the Live_Section).
5. WHILE Reduced_Motion is not set, THE Landing_Page SHALL turn pages with the slide of option B of Page_Turn_Prototype, for a forward and for a backward Turn, as follows:
   - Forward: the leaving page goes from `translateX(0)` and opacity 1 to `translateX(-9%)` and opacity 0 in 360 ms with `cubic-bezier(.4,0,.2,1)`. The arriving page goes from `translateX(9%)` and opacity 0 to `translateX(0)` and opacity 1 in 480 ms, delayed 60 ms, with `cubic-bezier(.22,.61,.36,1)` and `animation-fill-mode: both`.
   - Backward: mirrored. The leaving page goes to `translateX(9%)`; the arriving page comes from `translateX(-9%)`.
   - Both pages animate at the same time, one over the other, and nothing is hidden at a midpoint. The Turn_Effect SHALL use no 3D, no rotation, no perspective, and no box-shadow, and SHALL animate only `transform` and `opacity`. `will-change: transform, opacity` SHALL be set only on the two pages of a running Turn.
   - The sky SHALL stay still: the pages SHALL be transparent and the page gradient SHALL be painted once, on a static full-bleed layer behind all pages. No page edge SHALL show at rest or during a Turn at any window width from 320 px to 2560 px (Requirement 8, criterion 10). The stars and hills of the cover belong to the cover and move with it.
   - WHEN the window is scrolled at the start of a Turn, THE leaving page SHALL stay where it was on screen while it slides out, and the window SHALL scroll to the top for the arriving page.
   - The Turn_Effect SHALL end 560 ms after it starts (the end of the longest animation plus a margin), and the Turn state SHALL clear then.
6. WHILE a Turn_Effect runs, THE Landing_Page SHALL hold every further Turn request and SHALL apply the last held request when the effect ends, so that no request is lost and the hash and the Current_Page agree at rest (Requirement 7, criterion 4). A held request for the page that is current by then SHALL change nothing.
7. THE Turn_Effect SHALL NOT leave a class (`leave-next`, `enter-next`, `leave-back`, `enter-back`) on a Book_Page after it ends, and SHALL NOT leave two Book_Pages in the layout.
8. THE timers of the Turn_Effect SHALL be cancelled when the Landing_Page unmounts.
9. THE starts that a page entry causes (the Xray_Peek on the Book_Page `costumes`, the Autoplay on the Book_Page `run`, and the Light_Engine preload when the Book_Page `costumes` or `run` opens) SHALL begin when the Turn has finished, not when it starts. THE rules that each starts once and that nothing heavy loads before its page is near (Requirements 9 and 10) stay in force.

### Requirement 6: Reduced Motion

**User Story:** As a visitor who asks for less motion, I want the pages to switch at once.

#### Acceptance Criteria

1. WHILE Reduced_Motion is set, WHEN a Turn is requested, THE Landing_Page SHALL show the arriving page and hide the leaving page in the same update, with no Turn_Effect and no timer.
2. THE Landing_Page SHALL follow a change of the Reduced_Motion setting without a reload: the next Turn after the change SHALL use the new setting.
3. WHILE Reduced_Motion is set, THE keyframes of the Turn_Effect (`leaveNext`, `enterNext`, `leaveBack`, `enterBack`) SHALL NOT run, and THE reduced-motion block of the stylesheet SHALL cover the classes of the page bar and of the Turn_Effect.
4. THE rules of `site-live` for Reduced_Motion in the Live_Section and in the Costumes_Section stay in force, with the start rules of Requirement 9 of this spec.

### Requirement 7: Addresses, Links, and Focus

**User Story:** As a visitor, I want every page to have an address, so that I can link to it and go back to it.

#### Acceptance Criteria

1. THE address hashes SHALL be `#cover`, `#recipe`, `#costumes`, `#run`, and `#make` for the pages 1 to 5.
2. WHEN a Turn ends or starts, THE Landing_Page SHALL set the hash to the Page_Id of the Current_Page. THE page SHALL NOT scroll the window because of that change.
3. WHEN the Landing_Page loads with a hash that equals a Page_Id, THE page SHALL open that Book_Page without a Turn_Effect. WHEN the hash is empty or names no Page_Id, THE page SHALL open `cover`.
4. WHEN the hash changes by the browser (back, forward, or an edited address), THE Landing_Page SHALL turn to the Book_Page that the new hash names, and an unknown hash SHALL change nothing. (Property `hash-and-page-agree`.) FOR ALL generated sequences of Turn requests and hash changes, the hash SHALL equal the Page_Id of the Current_Page at rest.
5. EVERY anchor of the Landing_Page whose `href` is `#recipe`, `#costumes`, `#run`, or `#make` (the two hero buttons "Meet the skeleton" and "Watch the ghost work", the costume card link "How it was made →", and any other in-page link) SHALL turn to its Book_Page instead of scrolling. THE nav link "Home" SHALL turn to `cover` and SHALL set the hash `#cover`.
6. WHEN a Turn starts from a control inside the leaving page (a hero button or a card link), THE focus SHALL move to the heading of the arriving page. WHEN a Turn starts from the Page_Bar or from a key, THE focus SHALL stay where it is. (The leaving page becomes `inert`, which drops its focus; this keeps the keyboard visitor on the page. Difference D3.)
7. WHEN a Turn ends, THE arriving Book_Page SHALL be scrolled to its top.

### Requirement 8: One Page at a Time

**User Story:** As a screen reader user and a phone user, I want only the current page to exist for me, and tall pages to scroll inside the window.

#### Acceptance Criteria

1. THE Page_Live_Region SHALL be an element `#pgLive` with `aria-live="polite"` that is present in the DOM before the first Turn, with the class `sr-only`.
2. WHEN the Current_Page changes, THE Page_Live_Region SHALL be set to "Page N of 5: <title>" with N and the title of Requirement 3, criterion 1 (for example "Page 2 of 5: What's in the skeleton?"). THE text SHALL change once per Turn.
3. THE Landing_Page SHALL have no other live region that announces a Turn. THE Live_Section keeps its own region `#sayt` (`site-live`, Requirement 4, criterion 4).
4. EACH Book_Page SHALL be at least as tall as the visible window minus the nav and the Page_Bar, using the unit `svh`.
5. WHEN the content of the Current_Page is taller than that height (the Live_Section on a window of 390 px), THE Book_Page SHALL scroll inside the window and THE Page_Bar SHALL stay visible.
6. THE Landing_Page SHALL show no page-level horizontal scrollbar at 390 px, 920 px, and 1280 px.
7. THE spacing of the Live_Section (section header, control card, stepper, theater, panes minimum height, judge row) SHALL be tightened by rules scoped to `#run` in `site/src/styles/13-fit.css`, so that the whole section fits a 1280 by 800 window where possible. The look of Mockup_V6 is otherwise kept.
8. WHILE the Live_Section is taller than the visible window, THE speech bar (`.say`) SHALL be `position: sticky` just above the Page_Bar (`bottom: calc(var(--bar-h) + 8px)`), so that the Page_Bar never covers the narration.
9. WHILE the window is 560 px wide or less, THE world tabs of the Live_Section SHALL stay on one horizontal row with the Replay button (no wrapping, smaller tabs, icons hidden). This replaces the wrapping rule of Mockup_V6 at 760 px for phones.

10. AT every window width from 320 px to 2560 px, THE Landing_Page SHALL show no page edge while a Book_Page is at rest: the page gradient SHALL be painted on a full-bleed layer (100vw, centered on the page, behind the content), and the Book_Page itself SHALL be transparent. WHILE a Book_Page has the class `leave-next` or `enter-back`, THE turning page SHALL still hide the page under it. The nav and the Page_Bar SHALL keep their look.
11. THE cover (`.page>.hero`) SHALL be as tall as a Book_Page (`calc(100svh - var(--nav-h) - var(--bar-h))`, with the `100vh` fallback), THE hills and pumpkins SHALL sit at the bottom of the page just above the Page_Bar, and THE text group and the art SHALL be centered vertically in the space above the hills. On phones the stacked layout SHALL stay and the cover SHALL still fill the page height.
12. WHILE the window is wider than 820 px, THE cover SHALL scale with the window: the H1 is 40 px at 1280 px and grows to at most 64 px (`clamp(16px,1.25vw,25.6px)` as the cover's base size, in `em`), and the text, the buttons, and the art (ghost, moon, candle, bats, pumpkins, hills) grow with it. At 1280 by 800 the cover keeps its look. Above 1280 px the cover SHALL be wider than the 1040 px column (65em), centered on it.
13. WHEN the content of a Book_Page is shorter than the page, THE content SHALL be centered vertically; WHEN it is taller, it SHALL start at the top and scroll as before. Page 4 SHALL still fit 1280 by 800 as in criterion 7. THE paging, hash, keys, swipe, `inert`, live region, autoplay-on-entry, and X-ray-on-entry behavior and Reduced_Motion SHALL not change.

### Requirement 9: Per-Page Start

**User Story:** As a visitor, I want the demos to start when I reach their page, and only then.

#### Acceptance Criteria

1. WHEN the Book_Page `costumes` first becomes the Current_Page, THE Costumes_Section SHALL start the Xray_Peek (switch on after 1600 ms, off after 4400 ms) unless Reduced_Motion is set. THE Xray_Peek SHALL start once per page load and SHALL NOT start again when the visitor returns to the page.
2. THE Xray_Peek SHALL NOT start while the Costumes_Section has never been the Current_Page, including at page load with another page open.
3. THE Xray_Peek SHALL stop at the first pointer, key, or touch input and when the visitor presses the X-ray switch, as before. WHEN the visitor leaves the Book_Page `costumes` while the peek runs, THE timers SHALL be cancelled and the X-ray switch SHALL be off.
4. WHEN the Book_Page `run` first becomes the Current_Page and Reduced_Motion is not set, THE Live_Section SHALL start the Autoplay (the first Ghost Shell Preset, as `site-live` Requirement 8, criterion 5 defines it). THE Autoplay SHALL start once per page load and SHALL NOT start again when the visitor returns to the page. THE scroll trigger (`useInView` with 25 percent) SHALL NOT start it any more.
5. THE Autoplay SHALL NOT start while the Live_Section has never been the Current_Page.
6. WHEN the visitor opens the Book_Page `run` for the first time by a hash at page load (`#run`), THE page SHALL start the Autoplay as in criterion 4.
7. WHEN the visitor leaves the Book_Page `run` while a walk animates, THE page SHALL cancel the timers of that walk and SHALL cancel a pending engine call as a superseded run (`site-live`, Requirement 10, criterion 6). WHEN the visitor returns, THE Live_Section SHALL show the walk at the step it had reached, with all steps up to it applied instantly (the settling function of the walkthrough engine), the Actor placed for that step on the visible Theater, and THE Replay button SHALL still work. THE Autoplay SHALL NOT start again (Difference D4).
8. THE Actor and the terminal bubble SHALL be placed from the rectangles of a visible Theater only. NO placement SHALL be computed while the Book_Page `run` is not the Current_Page, and THE placement SHALL be recomputed when that page becomes the Current_Page and when the window resizes.
9. THE start of the Xray_Peek and of the Autoplay SHALL be driven by one page-visibility source that the Landing_Page provides to the two sections, and THE sections SHALL NOT read the address hash themselves.

### Requirement 10: Nothing Heavy Loads Before Its Page Is Near

**User Story:** As a visitor on a slow connection, I want the cover to paint fast and the heavy engines to load only when I get close to the page that needs them.

#### Acceptance Criteria

1. THE first paint of the Landing_Page SHALL NOT depend on any Engine_Bundle or wasm file. WHILE neither the Book_Page `costumes` nor the Book_Page `run` has been the Current_Page, THE Landing_Page SHALL load no Engine_Bundle, SHALL create no Worker, and SHALL fetch no wasm file.
2. WHEN the Book_Page `costumes` or the Book_Page `run` first becomes the Current_Page, THE Landing_Page SHALL start loading the Light_Engine, SHALL create the Shell SQL worker, and SHALL call `warm()`, as `site-live` Requirement 6, criterion 2 does for the Near state. (The brief allows the preload when page 3 opens. This spec requires it, so that the Autoplay on page 4 finds the engine ready; Difference D5.)
3. THE Hand_Engine SHALL load only when the visitor first picks Ghost Hand, as `site-live` Requirement 6, criterion 3 defines it. Opening a page, becoming Near, and turning pages SHALL NOT load it.
4. THE state Near and the state Seen of `site-live` SHALL both be derived from the Book_Page visibility of Requirement 9, criterion 9. THE Live_Section SHALL NOT use `IntersectionObserver` to decide when to load an engine or when to start the Autoplay, because a page that is not the Current_Page has no layout and never intersects the window.
5. THE rule of `site-live` Requirement 6, criterion 6 (a browser without `IntersectionObserver`) SHALL no longer apply: paging does not need that API.
6. THE Landing_Page SHALL keep every other rule of `site-live` Requirement 6 (the lazy forms, the paths, the Entry_Bundle budget).
7. THE Entry_Bundle of the Landing_Page SHALL stay within the limit of the Site_Check (360 kB). THE paging code SHALL NOT make the Entry_Bundle exceed it, and THE Landing_Page SHALL NOT load the Showcase code.
8. A DOM test with the Walkthrough, a fake loader, and the page visibility SHALL show, for each of the five pages as the first opened page and for the sequences cover, recipe, costumes and cover, recipe, costumes, run, that the loader is called exactly when Requirement 10, criteria 1 to 3 say, and never for the Hand_Engine without a Ghost Hand pick.

### Requirement 11: The Copy Deck of the Landing Page

**User Story:** As the owner, I want the texts of the landing page to be exactly the deck, so that the page says less.

#### Acceptance Criteria

1. THE Book_Page `cover` SHALL show: the kicker "🎃 Kiroween 2026 · Skeleton Crew"; the heading "Let your agent's ghost try it first." (with the word "ghost" emphasised as today); the text "A Kiro template where a ghost tries risky plans on a copy first. **One skeleton, three costumes.**" with the second sentence in bold; and the two buttons "Meet the skeleton" (to `#recipe`) and "Watch the ghost work" (to `#run`).
2. THE Book_Page `recipe` SHALL show the heading "What's in the skeleton?", the sub-heading "Your world + the skeleton = a ghost-run app.", and three blocks:
   - THE block "Your world" with the title "Your world", the sub-line "Six functions.", and six rows (function name, then hint): `snapshot` "copy reality"; `step` "try one action"; `diff` "what changed"; `render` "draw it"; `fingerprint` "prove reality is untouched"; `effectsOutside` "what leaves the box"; and the sticker "That's all. Ghost Cloud is about N lines." where N is the rounded line count of the existing world-size data (the same number as today).
   - THE block "The skeleton" with the title "The skeleton", the sub-line "Ready-made and wired.", and eight parts (name, then line): Mirror "Copy and compare"; Ghost "Try the plan on the copy"; Wards "Rules that say no"; Candle "Go, ask, or stop"; Blacklight "Find hidden instructions"; Graveyard "Remember stopped plans"; Kiro hook "Stop risky commands in Kiro"; world-smith "A Kiro agent that builds worlds". THE parts SHALL show no folder line.
   - THE bottom chip of that block "Built from 6 Kiro specs", whose `title` attribute lists the six spec names `core-contract`, `ghost-runner`, `wards`, `possession`, `ui-kit`, and `kiro-integration`, in this order. THE chip SHALL be the only element in the block's bottom row.
   - THE result card with the title "Your ghost-run app" and the text "Copy → try → judge → candle."
3. THE Book_Page `costumes` SHALL show the heading "One skeleton, three costumes", the X-ray switch as today, the sub-heading "Same skeleton, new costume. Flip on X-ray.", and three cards. EACH card SHALL show: the name; the costume tag; the world line; the part chips; the Kiro line; and the button, in this order:

| Card | Costume tag | World line | Kiro line | Button |
|---|---|---|---|---|
| Ghost Shell | Hacker hoodie | Files + SQLite | Kiro spec: ghost-shell | "Open Ghost Shell →" to `shell/` |
| Ghost Hand | Robot suit | Robot arm, 8 haunted copies | Kiro spec: ghost-hand | "Open Ghost Hand →" to `hand/` |
| Ghost Cloud | Cloud + bucket hat | S3 buckets in memory | Kiro agent: world-smith | "How it was made →" to `#make` |

4. THE Book_Page `costumes` SHALL show one legend under the cards: "Crossed out = not on that app's screen." THE part chips SHALL keep the parts matrix of the `site` spec (Requirement 7) and the sr-only text " not used" for a crossed-out chip.
5. THE Book_Page `run` SHALL show the heading "Watch the ghost work", the Live_Badge as today, and the sub-heading "Give the ghost a plan. It tries it on a copy first." THE rest of the Live_Section SHALL stay as `site-live` made it, including the narration, the presets, the stepper, and the theater.
6. THE Book_Page `make` SHALL show the heading "Make your own costume", the sub-heading "Write six functions, or let a Kiro agent help.", the spellbook title "📖 A world in six functions" with the code block as today, and the agent card with the title "Ask world-smith", the text "A Kiro agent that writes the world with you and runs the checks.", the command `kiro-cli chat --agent world-smith`, and the line "🎃 Ghost Cloud was made this way."
7. THE footer SHALL read as today ("Built with Kiro:" and the seven items) with the small link "Third-party notices" to `./THIRD_PARTY_NOTICES.txt` that `site-live` Requirement 18 added. THE footer SHALL change in nothing else.
8. THE strings of this requirement SHALL come from data modules of `site/src/data/` (one source of truth per string), so that a test can read them. THE number N of criterion 2 SHALL come from the world-size data and SHALL NOT be typed in a component.

### Requirement 12: Dropped Texts Stay Dropped, and Pinned Strings

**User Story:** As the owner, I want a test that fails when a long text comes back, so that the page stays short.

#### Acceptance Criteria

1. THE Landing_Page SHALL NOT render any of these Dropped_Texts, in any element, `title`, `aria-label`, or `sr-only` text, apart from the exceptions of criterion 3: "Every ghost-run app is a recipe with two ingredients."; "You write six functions."; "You get all of this, already wired together."; "Built with Kiro specs:"; the folder lines of the skeleton parts (`core/`, `ui/`, `ghost-runner/`, `wards-config/`, `integrations/`, `.kiro/agents/`, and the joined form with " · "); "Skeleton parts on its screen"; "Skeleton parts it uses (no screen yet)"; the folder lines of the costume cards (`worlds/playground-shell`, `worlds/drawer-arm`, `worlds/ghost-cloud`); the prefixes "Costume: " and "World: "; "Each app is the same skeleton in a different costume. Turn on X-ray to see the bones."; "Crossed-out parts are not on that app's screen. The costume is what each app adds: its world and its own screens."; the old hero text "A Kiro template for apps that rehearse risky plans on a ghost copy of the world."; "It copies the world, lets a ghost try the plan, judges it with your wards, and shows the verdict as a candle."; "Write six functions, or let a Kiro agent write them with you."; "The spell: a world in six functions"; "A Kiro custom agent. It copies the spec template, writes the world with you one file at a time, and runs the registration gate and the wards."; and ", and only a lit candle lets reality change" in the sub-heading of the Live_Section.
2. THE Showcase SHALL NOT render the texts of Mockup_Kit that the Copy_Deck replaces or does not contain: "Worlds bring the data. These parts draw it, the same way in every app. They never decide anything: the engine judges, the kit only shows what it was given."; "Used by Ghost Shell"; "Used by Ghost Hand"; "Pinned by 11 render rules"; the card lines and tags of Mockup_Kit that differ from Requirement 14, criterion 3; the caption texts of the Frame bars (for example "as it appears in Ghost Shell"); and any row text of Mockup_Kit that differs from Requirement 14, criterion 4.
3. THE exceptions are the texts that the Copy_Deck itself keeps: "Your ghost-run app", "The skeleton", "Your world", "Make your own costume", "Ghost Cloud was made this way.", and the words "Kiro spec" and "Kiro agent" inside the new Kiro lines.
4. A test SHALL pin every string of Requirements 11 and 14 against the rendered page (text content, the `title` of the chip, the `href` of the links, and the accessible names of the page bar). THE test SHALL read the strings from the same data modules as the components for the structure checks, and SHALL also contain the literal strings as its own expected values, so that a change of a data module alone fails the test.
5. A second test SHALL fail when a Dropped_Text of criteria 1 and 2 appears anywhere in the rendered Landing_Page or Showcase, in the source of `site/src/` outside the test files, or in `site/dist/` text after the build.
6. THE test of criterion 5 SHALL be proven to fail by a fixture: with one Dropped_Text (the folder line `core/ · ui/` under a part) added to a rendered fixture, the test fails.
7. THE strings that Mockup_V6 or Mockup_Kit carry and that this Requirement or Requirement 14 does not name SHALL be treated as not in the deck and SHALL NOT be added, with the three exceptions of the section "Differences Between the Brief and the Repository" (D6, D7, and D8).

### Requirement 13: The Showcase Page

**User Story:** As a visitor, I want a page that shows what the UI kit looks like, so that I see the screens that every ghost-run app shares.

#### Acceptance Criteria

1. THE Showcase SHALL be an HTML entry of the Site_Package that the landing build emits as `kit/index.html`, rendered by React with the same fonts, palette, and symbols as the Landing_Page.
2. THE Showcase SHALL show, in this order: the nav; the hero; the six part cards; the seven Showcase_Rows; and the footer.
3. THE nav SHALL show the links "Home", "UI Kit", and "GitHub". THE link "UI Kit" SHALL carry the class `on` and `aria-current="page"`. THE links SHALL be relative so that the Showcase works at a domain root and under a path prefix: "Home" to `../` and "UI Kit" to `./`. THE nav component SHALL be shared with the Landing_Page and SHALL NOT be copied.
4. THE hero SHALL show: the kicker "🦴 The skeleton's screen kit"; the heading "Every ghost-run app wears the same screens." with the words "the same screens" emphasised as in Mockup_Kit; the text "Worlds bring the data. The kit draws it, and never decides."; two chips "Used by Ghost Shell and Ghost Hand" and "11 render rules"; and the art (the ghost with the six part icons around it, `aria-hidden="true"`).
5. THE number 11 of the chip SHALL equal the number of render properties UI-P1 to UI-P11 of `.kiro/specs/ui-kit/requirements.md`, and a test SHALL compare the two.
6. THE six part cards SHALL be links to the rows below them (`#p-mirror`, `#p-candle`, `#p-blacklight`, `#p-thread`, `#p-grave`, `#p-lights`) and SHALL show the part name and one line:

| Card | Line |
|---|---|
| Mirror world | Reality vs. the copy |
| Candle | Go, ask, or stop |
| Blacklight | Hidden letters glow |
| Red thread | Step → cause |
| Graveyard | Stopped plans rest here |
| Lights on | Same screens, light theme |

7. THE seven Showcase_Rows SHALL be sections with the ids `p-mirror`, `p-candle`, `p-blacklight`, `p-thread`, `p-grave`, `p-lights`, and `p-controls`, in this order, alternating left and right as in Mockup_Kit, and each with a heading (the part name; "Base controls" for the last), a lead line, at most two bullets, and a Frame. THE texts SHALL be these:

| Row | Lead | Bullets |
|---|---|---|
| Mirror world | Reality vs. the ghost's copy, change by change. | Losses in red. / Secret-like fields hidden. |
| Candle | The verdict at a glance. | Pass: lit · Warn: flickering · Block: out / Claims show what this run proved. |
| Blacklight | Turn it on: hidden letters glow. | Zero-width, direction marks, HTML comments. |
| Red thread | From the blocked step to its cause. | Literal matches only. Not found is not safe. |
| Graveyard | Every stopped plan rests here. | Open a tombstone for the seance. |
| Lights on | Same screens for bright rooms. | Colors keep their meaning. |
| Base controls | Buttons and inputs that fit the kit. | (none) |

8. THE footer SHALL read "The kit lives in `ui/`." (with `ui/` in a `code` element) and SHALL hold the link "Developer gallery →" whose `href` is the relative path `./gallery/`.
9. THE Frame bar SHALL carry the three dots of Mockup_Kit and no text (Difference D7).
10. THE text column of a Showcase_Row (`.kp-text`) SHALL be aligned to the top of the row (`align-items: start`) and SHALL be `position: sticky` (`top: 12px`) while the Frame scrolls by. WHILE the window is 760 px wide or less, THE column SHALL be static. THE lead line SHALL be 16 px.

### Requirement 14: Real Kit Components and the Gallery's Sample Data

**User Story:** As a visitor, I want the frames to hold the real kit, so that what I see is what the apps show.

#### Acceptance Criteria

1. EACH Frame SHALL render the real Kit_Components of `@ghost-run/ui` (`MirrorWorld`, `Candle`, `BlacklightView`, `RedThreadView`, `Graveyard` with `SeanceView`, and `KitRoot`) imported from the public entry point, and SHALL NOT render a picture, a copy of their markup, or a re-implementation. THE stylesheet of the kit (`@ghost-run/ui/styles.css`) SHALL load on the Showcase and SHALL NOT load on the Landing_Page.
2. THE Frames SHALL be fed with the Gallery_Sample_Data: the same values as `ui/gallery/main.tsx` (the README text and its two Findings, the two Needles and two ThreadLinks, the action labels, the two Change lists with the step labels and the two Scenes, the five Candle inputs, the two Grave entries, and the canary and reserved-host values). `ui/` SHALL NOT change. THE Showcase SHALL NOT import `ui/gallery/main.tsx`, because that module renders the Gallery into `#root` as a side effect when it loads (Difference D9).
3. THE Showcase SHALL therefore hold the sample data in a data module of its own folder. A test SHALL fail when a value of that module differs from the value in `ui/gallery/main.tsx`, by reading the gallery source as text and comparing the fixture literals (the strings, the numbers, and the code points of the hidden-character helpers). THE design names the comparison method.
4. THE sample data SHALL build every hidden character from code points (`String.fromCodePoint` or `\u` escapes) and SHALL contain no literal hidden character. THE secrets SHALL be canary values (`sk-CANARY-abc123`) and the hosts SHALL be reserved (`collector.example`, `unrelated.test`).
5. THE Candle row SHALL offer the state tabs "Pass", "Warn", "Block", "Unknown", and "No verdict" as a `tablist`. WHEN the visitor selects a tab, THE Frame SHALL show the real `Candle` with the inputs of the Gallery for that state: Pass with the Docker claims, Warn with the playground claims, Block with the static-analysis claims, Unknown with an unknown verdict and no claims, and No verdict with no props. THE selected tab SHALL carry `aria-selected="true"` and no other tab SHALL. THE first tab SHALL be selected at load.
6. THE Blacklight row SHALL show the real `BlacklightView` with its own switch (off at load). WHEN the visitor turns the switch on, THE real component SHALL reveal the hidden letters. THE Showcase SHALL NOT add a second blacklight switch.
7. THE Mirror world row SHALL show the real `MirrorWorld` with the Gallery's changes, scenes, and step labels, and no theme control of its own (Requirement 15).
8. THE Red thread row SHALL show the real `RedThreadView` with the Gallery's needles, links, and action labels.
9. THE Graveyard row SHALL show the real `Graveyard` with the two Gallery entries. WHEN the visitor opens a tombstone, THE Frame SHALL show the real `SeanceView` for that entry, and its back control SHALL return to the list.
10. THE Lights on row SHALL show the dark candle and the light candle side by side, each a real `Candle` inside its own `KitRoot` with `initialTheme` `dark` and `light` and the same inputs (the Pass state).
11. THE Base controls row SHALL show the kit's own base classes `gk-button` (enabled and disabled), `gk-input` (empty and invalid), and `gk-textarea` (enabled and disabled), as the Gallery's form controls section does, with labels bound to the inputs.
12. THE kit parts SHALL look as they look in the apps. THE Showcase stylesheet SHALL NOT override a `gk-*` rule, a kit token, or a kit color; it styles only the page around the Frames.
13. (Property `showcase-renders-real-kit`.) A DOM test SHALL assert for each row that the rendered Frame contains the root elements that the real component produces (for example the candle's verdict element, the mirror's table, the blacklight switch, the thread view, the graveyard list), that a Candle tab changes the verdict that the real component shows, and that no `img` element exists in the page.

### Requirement 15: The Lights on Theme in a Frame

**User Story:** As a visitor, I want to flip a frame between dark and light and see the kit's own light theme, so that I know the kit has one.

#### Acceptance Criteria

1. EACH Frame that holds Kit_Components SHALL sit inside its own `KitRoot`, so that the theme of one Frame never changes another Frame. THE Frame_Theme SHALL be the `data-theme` attribute that `KitRoot` renders on its `.gk-root` element, and THE Showcase SHALL NOT set `data-theme` on `.gk-root` itself or override the theme tokens.
2. THE Mirror world row SHALL carry no Dark / Lights on control, and no other row SHALL carry one. THE theme control of a Frame SHALL be the kit's own Lights switch that `KitRoot` renders inside that Frame. EVERY Frame SHALL start in the theme that its `KitRoot` is given (`dark`, except the light candle of the Lights on row, which starts `light`).
3. THE Frame_Theme of a Frame SHALL follow only the kit's own Lights switch of that Frame. THE Showcase SHALL NOT drive that switch from code, SHALL NOT remount a `KitRoot` to change its theme, and SHALL NOT hide the switch.
4. WHEN the visitor uses the Lights switch of a Frame, THE `data-theme` of that Frame's `.gk-root` SHALL change between `dark` and `light`, and the Frame SHALL show the kit's own tokens for that theme.
5. A change of the Frame_Theme SHALL NOT lose the state of the other rows, and SHALL NOT change the Frame_Theme of any other Frame. A DOM test SHALL assert two things with the real `KitRoot`: the `data-theme` of a Frame after each use of its own Lights switch, and that a second Frame keeps its theme. THE same test SHALL assert that the Showcase code never writes `data-theme` (a spy on `setAttribute` and a check of the source files of `site/src/showcase/`).
6. THE page around the Frames (nav, hero, cards, row text) SHALL keep the dark palette of the Landing_Page when a Frame is light.
7. THE Frame in the light theme SHALL show the kit's own light tokens unchanged, so that the colors keep their meaning. THE Showcase SHALL NOT claim a contrast value of its own for the kit parts.

### Requirement 16: Assembly of `/kit/` and `/kit/gallery/`

**User Story:** As a maintainer, I want the showcase at `/kit/` and the developer gallery at `/kit/gallery/`, so that both work in the assembled site.

#### Acceptance Criteria

1. THE landing build SHALL emit the Showcase as `kit/index.html` with its assets, and the Landing_Page as `index.html`, in one build output (`site/build/dist/`). THE two entries SHALL load different entry scripts, and THE Landing_Page entry SHALL NOT import the Showcase code or the kit stylesheet.
2. THE assembly SHALL copy `ui/dist/` to `site/dist/kit/gallery/` and SHALL copy the landing build output (including `kit/index.html`) to `site/dist/`. THE assembly SHALL NOT copy `ui/dist/` to `site/dist/kit/` as it does today. THE gallery files SHALL be unchanged byte for byte.
3. THE Gallery SHALL work at `/kit/gallery/`: its `index.html` and its assets SHALL resolve with the relative paths (`base: './'`) of the `ui` build, and THE Site_Check SHALL check its references.
4. THE assembled `site/dist/` SHALL contain `index.html`, `kit/index.html`, `kit/gallery/index.html`, `shell/index.html`, `shell/ko.html`, `hand/index.html`, `_headers`, and `THIRD_PARTY_NOTICES.txt`. THE Site_Check SHALL require `kit/gallery/index.html` in addition to `kit/index.html`.
5. THE Site_Check SHALL treat the files of `kit/` outside `kit/gallery/` as files of the Landing_Page build (full rules: no external URL, no `unsafe-inline`, no font outside the page), and SHALL treat `kit/gallery/` as an app folder, as it treats `shell/` and `hand/`. THE Site_Check SHALL resolve and check every nav link, card link, and the "Developer gallery →" link of the Showcase.
6. THE Site_Check SHALL fail when `kit/index.html` references an Engine_Bundle, a worker, or a wasm file, and when `index.html` references a Showcase asset. THE Showcase SHALL load no engine and no worker.
7. THE Site_Check SHALL fail when the Showcase entry script is larger than a limit that the design sets (a constant with a comment that names this requirement). THE limit SHALL be set from a measurement of the built Showcase.
8. THE Build_Script SHALL fail with a message of the form `missing build output: <path> (build it with: ...)` when `ui/dist/` is missing, as it does today, and SHALL print the line count of `/kit/gallery/` in its summary lines.
9. THE `build:site` script and the assembly SHALL still finish within 60 s on the Reference_Machine when the three app builds exist (`site-live`, Requirement 19, criterion 5).
10. THE README and the Site_Check fixtures SHALL use `/kit/gallery/` for the gallery and `/kit/` for the Showcase.

### Requirement 17: Policy and Headers of the Showcase

**User Story:** As the owner, I want the showcase to carry the same strict policy as the landing page, so that the new page does not weaken the site.

#### Acceptance Criteria

1. THE root Headers_File SHALL carry blocks for `/kit/` and `/kit/index.html` with exactly the three headers of the Landing_Page blocks (the Landing_Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`), built from the same constants as the blocks for `/` and `/index.html`. THE file SHALL carry no block with the scope `/kit/*` and no bare `/*` block.
2. THE meta Content-Security-Policy of `kit/index.html` SHALL be the policy of `index.html` (the Landing_Policy without `frame-ancestors`), from the same constant.
3. THE Landing_Policy and every policy of this feature SHALL NOT contain `'unsafe-eval'`, `'unsafe-inline'`, `http:`, `https:`, or `*`. THE Showcase SHALL work under the policy with no `'unsafe-eval'`. A browser check (Chrome) SHALL load `/kit/` of the built site under the root `_headers`, use every control of the Showcase, and confirm that the console shows no policy violation. IF no browser is available to the task, THEN THE check SHALL be recorded as a manual one in `docs/measurements.md` for the owner's agent.
4. THE Gallery at `/kit/gallery/` SHALL keep the policy that its own meta tag sets, and THE root Headers_File SHALL add no block for `/kit/gallery/*`.
5. THE Site_Check SHALL assert, for each block of the Headers_File whose path starts with `/kit/`, that the block equals the block of `/` apart from the path, and SHALL keep every rule of `site-live` Requirement 14, criterion 3 for the blocks of `/` and `/index.html`.
6. THE Showcase SHALL need no wasm and no worker. THE design SHALL record whether the policy of the `/kit/` blocks keeps `'wasm-unsafe-eval'` and `worker-src 'self'` (the brief asks for the same policy as `/`; Difference D11).
7. THE header tests (`headers.test.ts`, `headers.property.test.ts`) SHALL cover the new blocks, including the generated check that scoping the blocks under `/shell` leaves the `/kit/` blocks untouched.

### Requirement 18: Showcase Accessibility, Motion, and Language

**User Story:** As a visitor who uses a keyboard, a screen reader, or a reduced-motion setting, I want the showcase to work for me.

#### Acceptance Criteria

1. THE Showcase SHALL have one `h1`, one `h2` per Showcase_Row, and landmark elements for the nav, the main content, and the footer. THE part cards SHALL be one `section` with the accessible name "Parts".
2. THE tabs of the Candle row SHALL use the roles `tablist` and `tab` with `aria-selected`, with the arrow keys moving between tabs (roving `tabindex`) and the Tab key and the Enter key as well, and SHALL control the Frame (`aria-controls`).
3. EVERY interactive element of the Showcase (the part cards, the tabs, and the links) SHALL be reachable with the Tab key, SHALL show the visible focus ring, and SHALL have a hit area of at least 24 by 24 CSS pixels. THE kit's own controls inside a Frame keep their own rules.
4. THE decorative SVG of the Showcase (the hero art, the card icons) SHALL carry `aria-hidden="true"`.
5. WHILE Reduced_Motion is set, THE ghost bob and the orbit of the hero art SHALL stop, and THE reduced-motion block of the stylesheet SHALL cover every animation of the Showcase.
6. THE contrast of every text and border pair that Mockup_V6 and Mockup_Kit add (the page bar, the dots, the mint Next button, the part cards, the Frame, and the chips) SHALL be at least 4.5:1 for text and 3:1 for component borders, and THE contrast test of the `site` spec SHALL gain these pairs. WHERE a mockup value fails, THE page SHALL raise it only as far as the limit and SHALL list it in `docs/measurements.md`.
7. THE colors inside the Frames belong to the kit and are outside this requirement.
8. EVERY text of the pages, the source, the tests, and this spec SHALL be in English.

### Requirement 19: Hygiene and Content Rules

**User Story:** As a maintainer, I want the new code to follow the repository's own rules.

#### Acceptance Criteria

1. THE source, tests, data files, and documents of this feature SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener. Tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`. THE possession scan of `site/` and of `.kiro/specs/site-pages/` SHALL return `clean`.
2. THE sample data of the Showcase SHALL use only canary values as secrets and only reserved domains (`.example`, `.test`, `.localhost`, `.invalid`) or `192.0.2.0/24` as hosts.
3. THE Showcase text "HTML comments" in the Blacklight bullet is a plain phrase and SHALL NOT be written as a comment opener.
4. THE new code SHALL be written for this repository after 2026-10-30. THE ghost art, the part icons, and the Showcase hero art SHALL be original (made by Claude Code in the mockups, built by Kiro).
5. THE pages SHALL show no blood, no religious symbol, and no jump scare (calm ghost).
6. THE paging code SHALL read no clock (`Date`, `Math.random`) outside an injected scheduler, and SHALL cancel every timer, listener, and observer when the Landing_Page unmounts (a timer-hygiene test as in `site-live`).

### Requirement 20: Documentation and Disclosure

**User Story:** As a judge or contributor, I want the README and the measurements to say what the pages do.

#### Acceptance Criteria

1. THE README section "Landing site" SHALL gain these statements, with no more than three lines in total: the landing page is five pages that the visitor turns, with the hash names `#cover`, `#recipe`, `#costumes`, `#run`, and `#make`; `/kit/` is a showcase of the real UI kit with the gallery's sample data; and the developer gallery is at `/kit/gallery/`.
2. THE README SHALL replace the two statements of the old layout: the sentence of the build section that names the kit gallery at `/kit/`, and the link text of the line "Live site" for the UI kit (which stays `/kit/`).
3. THE README "Not written by Kiro" paragraph SHALL gain one line: "The paged landing mockup (v6) and the kit showcase mockup were made by Claude Code; Kiro built them."
4. THE file `docs/measurements.md` SHALL gain a section "Paged landing and showcase measurements" with: the sizes of the Landing_Page Entry_Bundle and the Showcase entry (read from the build output); the list of the repairs of the section "Differences Between the Brief and the Repository"; the contrast changes; the result of the owner's comparison (Requirement 2, criterion 6); the result of the browser policy check (Requirement 17, criterion 3); and the line "browser load times: measured by the owner's agent in Chrome" with the values filled in by that agent, or marked not yet measured.
5. THE tasks of this spec SHALL NOT edit `docs/devlog.md`.
6. THE section of criterion 4 SHALL record the final Landing_Page sizes (index entry 115,491 B, closure 346,648 B, limit 360,000 B) and the Showcase closure (285,426 B), and `tests/unit/measurements.test.ts` SHALL check them.

### Requirement 21: Quality Gates and Final Build

**User Story:** As a maintainer, I want every gate to pass and the site to build, so that the change can be deployed.

#### Acceptance Criteria

1. THE Site_Package SHALL pass `tsc --noEmit` and `eslint .`, and its test suite SHALL finish in a Short_Run (60 s) without a browser, a network, or Docker, except the gated `record` project.
2. THE test suite SHALL contain, at least: the paging tests (page order and labels, Next and Back limits, keyboard with the ignored targets, swipe thresholds and ignored start targets, hash in and out with the hold rule, `inert` on hidden pages, the live-region text, the focus rule, scroll to top, reduced motion switching at once, and the timers); the per-page start tests (the Xray_Peek and the Autoplay start on page entry and only once, and leaving a page cancels them); the loading tests of Requirement 10; the copy tests of Requirement 12; the Showcase tests of Requirements 13 to 15; the assembly, header, and Site_Check tests of Requirements 16 and 17; and the accessibility and contrast tests of Requirement 18.
3. THE properties `one-page-reachable`, `hash-and-page-agree`, and `showcase-renders-real-kit` SHALL each have a test of at least 100 generated examples in a Short_Run, except where the design states a finite input space and says so.
4. THE last task of `tasks.md` SHALL run `corepack pnpm build:site` from the repository root, which builds the three apps and the kit, assembles `site/dist/`, and runs the Site_Check, and SHALL run the package's tests, typecheck, and lint, the gated `test:record`, and the possession scan of `site/` and `.kiro/specs/site-pages/`.
5. THE Site_Check SHALL cover the new paths: `kit/index.html`, `kit/gallery/index.html`, the Showcase assets, and the `/kit/` header blocks.

### Requirement 22: Amendments to the `site` and `site-live` Specs

**User Story:** As a maintainer, I want the criteria and tests that this change overrides to be named, so that the specs do not disagree.

#### Acceptance Criteria

1. THIS spec SHALL amend these criteria of `.kiro/specs/site/requirements.md`, and the tests of the `site` spec SHALL be changed to match in the tasks of this spec:

| `site` criterion | Amendment |
|---|---|
| 2.7 (structural classes) | The class list gains `pagebar`, `pg-btn`, `pg-dot`, `page`, and `pg-count`; the wrapper class `page` of `App.tsx` is renamed (Requirement 3, criterion 6). |
| 3.x (window fill and content column) | Replaced for the Landing_Page by Requirement 8 of this spec: each Book_Page fills the window minus the nav and the Page_Bar. |
| 4.x (page structure, block order) | The blocks nav, hero, recipe, costumes, run, make, and footer become the five Book_Pages of Requirement 3; the nav stays above them. The nav link "Home" turns to `cover`. |
| 5.x, 6.x, 13.x (section texts) | Replaced by the Copy_Deck (Requirements 11 and 12): the recipe, costumes, and make texts, the skeleton parts without folder lines, the chip "Built from 6 Kiro specs", the costume card lines, the legend, and the agent card. |
| 6.x (X-ray demo trigger) | The Xray_Peek starts when the Book_Page `costumes` first opens (Requirement 9), not when the section mounts or scrolls into view. |
| 11.5, 16.3, 16.5 (autoplay and reduced motion) | The Autoplay starts when the Book_Page `run` first opens (Requirement 9). The Reduced_Motion behavior is unchanged. |
| 15.x (live region rule) | One new polite region `#pgLive` for Turns (Requirement 8). |
| 18.1, 18.x (assembly) | `/kit/` is the Showcase from the landing build, and `/kit/gallery/` is `ui/dist` (Requirement 16). The Site_Dist gains `kit/gallery/index.html`. |
| 19.3 (no `/kit/*` block) | Replaced by Requirement 17: blocks for `/kit/` and `/kit/index.html` that equal the blocks of `/`; no `/kit/*` block remains forbidden. |
| 20.3 (checked references) | The Site_Check checks the Showcase nav, card, and gallery links, and the references of `kit/gallery/index.html`. |
| 23.1 (the gallery page is not changed) | Unchanged: `ui/` stays as it is, and the gallery moves in the site only. |

2. THIS spec SHALL amend these criteria of `.kiro/specs/site-live/requirements.md`, and the tests of the `site-live` spec SHALL be changed to match in the tasks of this spec:

| `site-live` criterion | Amendment |
|---|---|
| 1.2 | The folder rule gains the Showcase folder as the one other place that may import `@ghost-run/ui` (Requirement 1, criterion 3). |
| 2.3 | The sub-heading of the Live_Section becomes "Give the ghost a plan. It tries it on a copy first." (Requirement 11, criterion 5). |
| 6.1, 6.2, 6.6 | "Near" and "Seen" come from the Book_Page visibility (Requirement 10). The 200 px margin and `IntersectionObserver` rules are replaced. The no-IntersectionObserver fallback no longer applies. |
| 8.5 | The Autoplay runs when the Book_Page `run` first opens, not when the section is first seen (Requirement 9, criterion 4). |
| 10.7, 10.8 | Timers also cancel when the visitor leaves the Book_Page `run`; the Reduced_Motion rule runs the Preset live once the Book_Page `costumes` or `run` has opened (Requirement 9, criterion 7, and Requirement 10, criterion 2). |
| 14.4 | "No block for `/kit/*`" is replaced by Requirement 17: blocks for `/kit/` and `/kit/index.html`. |
| 15.1, 15.3 | The Site_Check classification gains the Showcase entry and the rule that `kit/index.html` references no Engine_Bundle (Requirement 16, criteria 5 and 6). |
| 16.3 | One polite region (`#sayt`) for the Live_Section remains; the Page_Live_Region is a second, separate region for Turns (Requirement 8, criterion 3). |
| 18.3 | The footer link "Third-party notices" stays as it is (Requirement 11, criterion 7). |

3. THE tests that change are at least these (the design and tasks list the full set): `render.test.tsx`, `costumes.test.tsx`, `chips.test.tsx`, `classes.test.tsx`, `a11y.test.tsx`, `hooks.test.tsx`, `xray.test.tsx`, `live-badge.test.tsx`, `page-loading.property.test.tsx`, `live-controller.test.tsx`, `reduced-motion-live.test.tsx`, `walkthrough.test.tsx`, `skeleton-data.test.ts`, `styles.test.ts`, `contrast.test.ts`, `index-html.test.ts`, `landing-build.test.ts`, `build-site.test.ts`, `check-site.test.ts`, `headers.test.ts`, `headers.property.test.ts`, `lint-fixture.test.ts`, and `site-dist.test.ts`.
4. THE criteria of `site` and `site-live` that are not listed in criteria 1 and 2 SHALL stay in force.

### Requirement 23: Out of Scope

**User Story:** As a maintainer, I want the boundaries written down.

#### Acceptance Criteria

1. THE work of this spec SHALL NOT change `apps/`, `worlds/`, `core/`, or `ui/` (Requirement 1, criterion 1), SHALL add no engine, no world, and no command, and SHALL NOT deploy.
2. THE work SHALL NOT add Kiro Crew integration, a Franka Panda model, 20 haunted variants, or a screenshot tool as a dependency.
3. THE work SHALL NOT change the live engines, the recorded runs, the parity tests, or the content of the Live_Section apart from its heading copy and its start rule.
4. THE work SHALL NOT export the Gallery_Sample_Data from `ui/` or add a theme prop to `KitRoot`.
5. THE devlog and the deployment are done by Claude Code, not by Kiro.

## Differences Between the Brief and the Repository

These differences were found on 2026-11-21. This spec follows the repository. `design.md` lists them under "Open questions" and records the decision for each.

- **D1. The class `page` is taken.** `site/src/styles/99-page.css` already defines `.page{max-width:1040px;margin:0 auto}` and `App.tsx` wraps the content in `div.page`. Mockup_V6 uses `.page` for each Book_Page. The wrapper is renamed (Requirement 3, criterion 6).
- **D2. Arrow keys are used by other controls.** The brief ignores the paging keys "while typing in an input". The Landing_Page also has range inputs (arrow keys change the value), a `tablist` of world tabs with a roving arrow-key pattern (`site-live` Requirement 16, criterion 1), and the X-ray switch. Requirement 5, criterion 2 widens the ignore rule.
- **D3. Focus.** The brief does not say where the focus goes when a Turn starts from a link in the leaving page. That page becomes `inert` and drops the focus, so Requirement 7, criterion 6 moves it to the heading of the arriving page.
- **D4. Leaving page 4 during a run.** The walkthrough places the Actor from element rectangles, which are zero on a page that has no layout, and its timers outlive the page. The brief is silent. Requirement 9, criteria 7 and 8 cancel the timers and settle the walk on return.
- **D5. Preload on page 3.** The brief says the Shell engine "may" preload when page 3 opens. Requirement 10, criterion 2 makes it a rule, so the Autoplay on page 4 does not wait for the engine.
- **D6. Page 1 title.** The brief names page 1 "Cover" and gives the short label "Cover". Mockup_V6 gives it the `data-title` "Let your agent's ghost try it first", which the live region and the dot name announce. This spec keeps the Mockup_V6 title for the live region and the dot name, and "Cover" for the short label.
- **D7. Mockup texts that the deck does not contain.** The Frame bar captions ("as it appears in Ghost Shell") and the app tags on the Showcase part cards ("Shell", "Shell · Hand") are not in the Copy_Deck and are dropped. The Landing_Page costume art badges ("App 1", "App 2", "3rd world") and the badge "same skeleton ✓" are not named by the deck as dropped or kept; this spec keeps them because the brief says the card keeps "the button, as today" and names no removal of the art. The numbers "01" to "06" and "+" of the Showcase rows are decoration and stay, hidden from assistive technology.
- **D8. "The end".** The Next button text on page 5 comes from Mockup_V6, because the brief says only that Next is disabled there.
- **D9. The gallery's sample data is private.** `ui/gallery/main.tsx` keeps its fixtures in module-level constants that it does not export, and the module renders into `#root` when it loads. "Reuse the gallery's sample data without changing `ui/`" therefore means a site-owned copy of the values plus a drift test (Requirement 14, criteria 2 and 3).
- **D10. `KitRoot` owns the theme.** `KitRoot` accepts `initialTheme` only, renders its own header with a Lights switch, and has no controlled theme prop. The owner chose that the kit's own Lights switch inside each Frame is the only theme control, so the Showcase adds no Dark / Lights on control (Requirement 15).
- **D11. The policy of `/` is wider than the showcase needs.** The Landing_Policy allows `'wasm-unsafe-eval'`, `worker-src 'self'`, and `connect-src 'self'` for the live engines. The Showcase needs none of them. The brief asks for "the same strict policy as `/`", and this spec follows the brief with the option of Requirement 17, criterion 6.
- **D12. The footer notice link already exists.** The brief asks for "a small Third-party notices link". `site-live` Requirement 18 already added it (`Footer.tsx`). Requirement 11, criterion 7 keeps it and adds no second link.
- **D13. The old sub-headings in the mockup.** Mockup_V6 keeps the long sub-headings of the old page for pages 3 and 4. The brief's deck replaces them (Requirement 11, criteria 3 and 5), and the brief wins.
- **D14. "11 render rules".** The number comes from UI-P1 to UI-P11 of the `ui-kit` spec and the README table, and not from a count in `ui/` code. A test compares it with the spec (Requirement 13, criterion 5).

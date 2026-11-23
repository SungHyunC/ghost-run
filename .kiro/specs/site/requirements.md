# Requirements Document

## Introduction

The `site` spec defines the Ghost Run+ landing site: one public, static page that serves as the "Try it out" URL of the Kiroween 2026 entry, and the build that assembles it together with the three existing builds (`apps/ghost-shell`, `apps/ghost-hand`, `ui`) into one directory, `site/dist/`. In under a minute, and without the README, a visitor must see three things:

1. What the template is: your world (six functions) plus the skeleton (eight parts) gives a ghost-run app.
2. How the template was used: the same skeleton in three costumes (Ghost Shell, Ghost Hand, Ghost Cloud), with the parts each one uses.
3. How a ghost run works: four stops (copy, try, judge, candle) and a fifth step (fix and go), told by the ghost, for each of the three worlds.

The page is ported from the approved mockup `docs/design/landing-mockup.html` and the brief `docs/design/landing-brief.md` (Draft 2, 2026-11-20). The owner wants the page to match the mockup as closely as possible: it is a port, not a reinterpretation. The brief and the mockup are inputs. Every fact in brief section 4 was checked against the repository on 2026-11-20 for this spec; where the repository differs from the brief, this spec follows the repository (Requirement 24 lists the differences).

The page makes no network request, calls no LLM, and needs no server. All numbers that the page shows about the three worlds come from two build-time scripts: a world-size script and a run-recording script. The page asserts nothing that a test cannot check against the repository.

This spec covers these parts:

1. **Package and build**: the workspace package `@ghost-run/site` in `site/`, the build script that assembles `site/dist/`, the headers file, and the root script `pnpm build:site`.
2. **Landing page**: seven blocks (nav, hero, recipe, costumes with the X-ray switch, walkthrough, make-your-own, footer), ported from the mockup.
3. **Generated data**: `world-size.json` and `runs.json`, computed from the repository, never typed in.
4. **Checks**: a parts-matrix test, a recorded-runs test, a Reality-untouched test, and a site check of the built output (local links and external URLs).
5. **Docs**: the README link, the Ghost Cloud row, and the "Not written by Kiro" line.

The spec reuses existing code and types and defines no second shape for them: `ghostRun`, `WardEngine`, `WardVerdict`, and `Scene` of `@ghost-run/core`; the world packages `@ghost-run/playground-shell`, `@ghost-run/drawer-arm`, and `@ghost-run/ghost-cloud`; and the demo plans of the apps and of `worlds/ghost-cloud/`.

Safety claims follow the world-contract steering ("Claimed in" column). The site does not claim a property; it describes what each app shows. The site states these limits where it speaks of a world: Ghost Cloud has no real mode and the page never says that it runs for real (Requirement 8, criterion 6); Ghost Hand and Ghost Shell claims stay with their own apps.

Hidden characters are never written literally in this document or in any repository file of this feature. A hidden character is named by its code point (for example U+200B) and is built in code from code points. Hosts in examples use reserved domains, and secrets are canary values.

## Glossary

- **Site_Package**: The pnpm workspace package `@ghost-run/site` in `site/`.
- **Landing_Page**: The page served at `/` of the Site_Dist, built by the Site_Package with Vite 7, React 19, and TypeScript.
- **Mockup**: The file `docs/design/landing-mockup.html`, the approved visual reference.
- **Brief**: The file `docs/design/landing-brief.md`.
- **Site_Dist**: The directory `site/dist/` assembled by the Build_Script.
- **Build_Script**: The file `site/scripts/build-site.mjs`.
- **Record_Script**: The file `site/scripts/record-runs.mjs`.
- **World_Size_Script**: The script that writes the World_Size_File (Requirement 9).
- **World_Size_File**: The JSON file `site/src/data/world-size.json`, imported by the Landing_Page.
- **Runs_File**: The JSON file `site/src/data/runs.json`, written by the Record_Script and imported by the Landing_Page.
- **Recorded_Run**: One entry of the Runs_File: the data of one demo plan or one fixed plan of one world, produced by a real ghost run (Requirement 10).
- **Walkthrough_World**: One of `shell`, `hand`, `cloud`, shown by the chips of section 3 of the page.
- **Step**: One of the five stages of the walkthrough, indexed 0 to 4: Copy, Run on the copy, Judge, Verdict, Fix and go.
- **Theater**: The element `#theater` that holds the plan, the two panes, the ward card, the verdict card, the actor, and the speech bar.
- **Reality_Pane**: The element `#real`, with the content element `#realb`, that shows the world as it is.
- **Copy_Pane**: The element `#copy`, with the content element `#copyb`, that shows the ghost copy.
- **Actor**: The ghost character that moves over the Theater (`#actor`).
- **Narration_Region**: The element `#sayt`, a polite live region that carries the ghost's speech.
- **X_Ray_Switch**: The checkbox `#xray` with `role="switch"` in the head of section 2.
- **Skeleton_Part**: One of the eight parts of the skeleton listed in Requirement 5: Mirror, Ghost, Wards, Candle, Blacklight, Graveyard, Kiro hook, world-smith.
- **App_Part**: One of the six Skeleton_Parts that a costume card can mark as used or not used: Mirror, Ghost, Wards, Candle, Blacklight, Graveyard.
- **Parts_Matrix**: The table in the page data that says, for each costume (Ghost Shell, Ghost Hand, Ghost Cloud), which App_Parts it uses (Requirement 7).
- **Usage_Reference**: A reference in a non-test source file of an app or world to the code that stands for an App_Part, resolved through re-export modules (Requirement 7, criterion 2).
- **Reduced_Motion**: The state in which `matchMedia('(prefers-reduced-motion: reduce)')` matches.
- **Headers_File**: The root file `site/dist/_headers` in the format of Cloudflare Pages and Netlify.
- **Site_Check**: The script and test that read the Site_Dist after the build (Requirement 20).
- **Local_Reference**: A reference in a file of the Site_Dist to another file of the Site_Dist: the values of the HTML attributes `href`, `src`, `srcset`, `poster`, and `action` that are not external, the targets of CSS `url()` and `@import`, and the static string targets of JavaScript `import`, `new URL(..., import.meta.url)`, and `new Worker`.
- **External_Reference**: A reference whose value starts with `http:`, `https:`, `//`, `ws:`, `wss:`, `ftp:`, or `data:` (outside the allowlist of Requirement 20, criterion 5).
- **Reference_Machine**: An Apple M1 machine, as in the `ghost-runner` spec.
- **Short_Run**: The test run on file save: 100 generated examples per property, finishing within 60 s.

## Requirements

### Requirement 1: Package Placement, Stack, and Dependency Direction

**User Story:** As a maintainer, I want the site in its own package outside `apps/`, so that the repository keeps exactly the two Skeleton Crew apps in `apps/`.

#### Acceptance Criteria

1. THE Site_Package SHALL be a pnpm workspace package in `site/` with the package name `@ghost-run/site`, written in TypeScript with the compiler option `strict` enabled, using Vite 7, React 19, and Vitest with Testing Library, as the apps do.
2. THE file `pnpm-workspace.yaml` SHALL list `site` in `packages`. THE folder `apps/` SHALL contain no new package.
3. THE Site_Package SHALL have `build`, `typecheck`, `lint`, and `test` scripts, so that the root scripts `build`, `typecheck`, `lint`, and `test` (each of which runs `pnpm -r`) include it. THE `build` script of the Site_Package SHALL build the Landing_Page only and SHALL NOT build the apps, so that the root `pnpm build` does not build an app twice.
4. THE Site_Package SHALL use no import from `apps/*` source files in the Landing_Page runtime code. THE Landing_Page bundle SHALL import only `react`, `react-dom`, `@fontsource/fredoka`, and files of `site/`.
5. THE Record_Script and the World_Size_Script MAY read the packages `@ghost-run/core`, `@ghost-run/playground-shell`, `@ghost-run/drawer-arm`, and `@ghost-run/ghost-cloud`, and files of `apps/` and `worlds/`, at build time only. THE Landing_Page bundle SHALL contain none of them.
6. THE tasks.md of this spec SHALL contain a task that updates `.kiro/steering/structure.md` so that the folder `site/` is listed with these dependency rules: `site/` may depend on `core/`, `worlds/*`, and the build output of `apps/*` and `ui/`, and no package may depend on `site/`. This requirements phase edits no steering file. THE task SHALL be completed before the Record_Script imports a world package.
7. THE Site_Package SHALL add no dependency other than `react`, `react-dom`, `@fontsource/fredoka`, and the development tools that the apps already use (`vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `typescript-eslint`, and their type packages), unless a new dependency is listed in the README table with name, version, and license on the day it is added.
8. THE Site_Package SHALL make no network call and no LLM call in its scripts, tests, or page.

### Requirement 2: Fidelity to the Mockup

**User Story:** As the owner, I want the page to look and move like the approved mockup, so that nothing I approved is lost in the port.

#### Acceptance Criteria

1. THE Landing_Page SHALL reproduce, from the Mockup, these items without change of value: layout, sizes, spacing, radii, borders, shadows, colors, font sizes and weights, copy, SVG paths (characters, costumes, icons, scenes), keyframes, durations, delays, and easing.
2. THE Site_Package SHALL carry the CSS of the Mockup (the rules under the comment "site mock, fixed palette" and the later rules, up to the end of the `<style>` element) in its stylesheets and SHALL keep the class names of the Mockup, with these changes only: the rules of the mockup wrapper (`.doc`, `.guide`, `.guide-t`, `.hint`), the rounded frame of `.site` (its `border-radius` and `overflow:hidden`), and the Google Fonts link.
3. THE Site_Package SHALL carry the SVG markup of the Mockup (the `<symbol>` definitions `boo`, `bones`, `pumpkin`, `bat`, `i-mirror`, `i-ward`, `i-candle`, `i-blacklight`, `i-tomb`, `i-hook`, `i-hat`, `i-folder`, `i-file`, `i-db`, `i-bucket`, `i-lock`, the costume art, the moon, the candle, the cauldron, and the scene builders of the walkthrough) as typed React components, with the path data unchanged.
4. THE page SHALL apply only these changes to the Mockup, and no others: (a) the self-hosted font of Requirement 14; (b) data from the Runs_File and the World_Size_File instead of literals (Requirements 9 and 10); (c) the accessibility and Reduced_Motion rules of Requirements 15 and 16; (d) the real navigation targets of Requirement 4, criterion 2; (e) the removal of the one `style` attribute of the Mockup (Requirement 19, criterion 4); (f) the joint-limit mark of Requirement 11, criterion 9; (g) the lint and hygiene rules of the repository.
5. THE walkthrough SHALL use the step durations `DUR = [2700, 3900, 3300, 2700, 5200]` ms and the inner delays of Requirement 11, criterion 4, with the same values as the Mockup.
6. THE Landing_Page SHALL NOT contain the mockup wrapper `.doc` or a rounded frame around the page.
7. THE Site_Package SHALL include a test that fails when `DUR` differs from `[2700, 3900, 3300, 2700, 5200]`, and a test that fails when a class name listed in a fixed list of the Mockup's structural classes (`site`, `nav`, `hero`, `sec`, `recipe`, `ing`, `parts`, `part`, `cards`, `cc`, `costume`, `theater`, `panes`, `pane`, `ward`, `verdict`, `actor`, `say`, `rail`, `wchip`, `xsw`) is missing from the rendered page.
8. WHEN the built Landing_Page and the Mockup are rendered at a width of 920 px and at a width of 1280 px, THE two renderings SHALL look the same at these moments: the hero; the recipe; the costumes with the X-ray switch off and on; and each Walkthrough_World at each of the five Steps. The comparison is a manual review by the owner's agent (Claude Code), recorded in `docs/measurements.md`; it is not an automated test, and a screenshot tool is not a dependency of the Site_Package.
9. WHERE a visible difference from the Mockup is caused by criterion 4, THE difference SHALL be listed in `docs/measurements.md` next to the screenshot comparison.

### Requirement 3: Window Fill and Content Column

**User Story:** As a visitor, I want the page to fill my browser window, so that it reads as a site and not as a framed picture.

#### Acceptance Criteria

1. THE night background (the gradient of `.site` in the Mockup: `#110824`, `#1c0e3b`, `#24124a`, `#1a0d36` at 0, 30, 62, and 100 percent) SHALL cover the whole viewport, including the area beside the content column.
2. THE content of the Landing_Page (nav, hero, sections, footer) SHALL sit in a column centered in the window with a maximum width of 1040 px.
3. WHILE the window is narrower than 820 px, THE Landing_Page SHALL stack its columns with the rules of the Mockup's `@media (max-width:820px)` block, and WHILE the window is narrower than 560 px, THE Landing_Page SHALL apply the rules of the `@media (max-width:560px)` block.
4. THE Landing_Page SHALL cause no horizontal scrolling of the page at widths from 320 px to 1920 px, except inside the step rail (`#rail`), which scrolls horizontally below 820 px as in the Mockup.

### Requirement 4: Page Structure

**User Story:** As a visitor, I want the sections in a fixed order, so that I can follow the story from the idea to the demo.

#### Acceptance Criteria

1. THE Landing_Page SHALL render these blocks in this order: (1) the nav; (2) the hero; (3) section 1 "What's in the skeleton?" (id `recipe`); (4) section 2 "One skeleton, three costumes" (id `costumes`); (5) section 3 "Watch the ghost work" (id `run`); (6) section 4 "Make your own costume" (id `make`); (7) the footer.
2. THE nav SHALL show the ghost logo, the text "Ghost Run+", and these links: "Home" (to `./`), "UI Kit" (to `kit/`), and "GitHub" (to the repository URL of Requirement 20, criterion 5). THE link of the current page SHALL carry the class `on` and `aria-current="page"`.
3. THE hero SHALL show the night-sky scene of the Mockup (stars, moon, three bats, the floating ghost with its aura, the candle with a face, a hill, and three pumpkins), the kicker "Kiroween 2026 · Skeleton Crew", the heading "Let your agent's ghost try it first.", and the text "A Kiro template for apps that rehearse risky plans on a ghost copy of the world. One skeleton, three costumes." with the words "ghost copy" and "One skeleton, three costumes." in bold as in the Mockup.
4. THE hero SHALL have two buttons: "Meet the skeleton" (to `#recipe`) and "Watch the ghost work" (to `#run`).
5. THE footer SHALL read "Built with Kiro:" followed by the seven items "specs", "hooks", "steering", "MCP", "power", "custom agent", and "property tests".
6. THE Landing_Page SHALL have one `h1` (the hero heading), one `h2` per numbered section, and the section ids of criterion 1.
7. THE Landing_Page SHALL set the document `lang` to `en` and the title to "Ghost Run+: let your agent's ghost try it first".

### Requirement 5: Section 1, the Recipe

**User Story:** As a visitor, I want to see what I write and what I get, so that I understand what the template is.

#### Acceptance Criteria

1. THE section SHALL show the sub-heading "Every ghost-run app is a recipe with two ingredients." and three blocks: "Your world", "The skeleton", and "Your ghost-run app", joined by the signs "+" and "=" (the signs are `aria-hidden`).
2. THE block "Your world" SHALL list the six functions of `World<S, A>` in this order, each with this line: `snapshot` "copy reality"; `step` "try one action on the copy"; `diff` "what changed"; `render` "draw it for the screens"; `fingerprint` "prove reality stayed the same"; `effectsOutside` "what would leave the box".
3. THE block "Your world" SHALL show the sticker "That's all. Ghost Cloud's whole world is about N lines." WHERE N is computed from the World_Size_File by the rule of Requirement 9, criterion 3.
4. THE block "The skeleton" SHALL show eight parts, each with an icon, a name, one line, and its folders, exactly as in this table:

| Part | Line | Folders |
|---|---|---|
| Mirror | Copies the world. Shows before and after. | `core/`, `ui/` |
| Ghost | Runs the plan on the copy, in a Docker box for real files. | `core/`, `ghost-runner/` |
| Wards | Your rules in wards.yaml: what must never happen. | `core/`, `wards-config/` |
| Candle | Lit: go. Flickering: ask a human. Out: stop. | `ui/` |
| Blacklight | Finds instructions hidden in what the agent read. | `core/`, `ui/` |
| Graveyard | Keeps every stopped plan and the reason. | `ui/` |
| Kiro hook | ghost-gate stops a risky command before Kiro runs it. | `integrations/` |
| world-smith | A Kiro agent that builds a new world with you. | `.kiro/agents/` |

5. THE block "The skeleton" SHALL show the line "Built with Kiro specs:" followed by the six spec names `core-contract`, `ghost-runner`, `wards`, `possession`, `ui-kit`, and `kiro-integration`.
6. THE block "Your ghost-run app" SHALL show the cauldron with the ghost rising and the text "It copies the world, lets a ghost try the plan, judges it with your wards, and shows the verdict as a candle."
7. A test SHALL assert that every folder named in criterion 4 exists in the repository, that every spec name of criterion 5 is a folder of `.kiro/specs/`, and that the file `.kiro/agents/world-smith.json` exists, so that the page does not name a part that the repository lacks.

### Requirement 6: Section 2, the Costumes and the X-Ray Switch

**User Story:** As a visitor, I want to see the same skeleton in three costumes, so that I understand how the template was used.

#### Acceptance Criteria

1. THE section SHALL show the sub-heading "Each app is the same skeleton in a different costume. Turn on X-ray to see the bones." and three cards in this order: Ghost Shell, Ghost Hand, Ghost Cloud.
2. EACH card SHALL show: the costumed skeleton figure; a tag; the name; the costume line; the world line with its folder; the chips "Skeleton parts on its screen" (Ghost Cloud: "Skeleton parts it uses (no screen yet)"); the Kiro provenance; and a link, as in this table:

| Card | Tag | Costume line | World line | Provenance | Link |
|---|---|---|---|---|---|
| Ghost Shell | App 1 | Costume: hacker hoodie (a `>_` badge) | World: files + SQLite in the browser, `worlds/playground-shell` | Built with the Kiro spec `ghost-shell` | "Open Ghost Shell →" to `shell/` |
| Ghost Hand | App 2 | Costume: robot suit (antenna, ear bolts, box body with lights, claw) | World: a MuJoCo robot arm, 8 haunted copies, `worlds/drawer-arm` | Built with the Kiro spec `ghost-hand` | "Open Ghost Hand →" to `hand/` |
| Ghost Cloud | 3rd world | Costume: a cloud and a bucket hat (an orange "S3" hat) | World: S3 buckets in memory, about N lines, `worlds/ghost-cloud` (N by Requirement 9) | Built by the Kiro agent `world-smith` | "How it was made →" to `#make` |

3. THE note under the cards SHALL read "Crossed-out parts are not on that app's screen. The costume is what each app adds: its world and its own screens."
4. THE chips of each card SHALL list the six App_Parts in the order Mirror, Ghost, Wards, Candle, Blacklight, Graveyard. A chip of a part that the Parts_Matrix marks as not used SHALL carry the class `off` and be crossed out, and SHALL carry an accessible text "not used" in addition to the strike-through, so that the state does not rely on the line alone.
5. THE X_Ray_Switch SHALL be an `input` of type `checkbox` with `role="switch"`, the accessible name "X-ray: show the skeleton inside each app", and a visible label "X-ray" with the hint "try me".
6. WHEN the X_Ray_Switch is turned on, THE section SHALL get the class `xray`, `aria-checked` of the switch SHALL be `true`, the costumes SHALL fade to about 10 percent opacity, the skeletons SHALL glow mint, and a badge "same skeleton ✓" SHALL show on each card. WHEN it is turned off, THE section SHALL lose the class and the switch SHALL report `aria-checked="false"`.
7. WHEN the page loads and Reduced_Motion is not set, THE Landing_Page SHALL turn the X_Ray_Switch on after 1600 ms and off after 4400 ms, once, as the Mockup does. WHILE Reduced_Motion is set, THE Landing_Page SHALL NOT change the switch by itself.
8. WHEN the user operates the X_Ray_Switch before the 4400 ms timer fires, THE Landing_Page SHALL cancel both timers, so that the demo does not override the user's choice.
9. THE three skeleton figures SHALL use the same `bones` symbol, so that the identical skeletons are visible when the costumes fade.

### Requirement 7: Parts Matrix Equals the Imports

**User Story:** As a maintainer, I want the claim "this app uses these parts" checked against the code, so that the claim cannot drift.

#### Acceptance Criteria

1. THE Landing_Page SHALL take the used and not-used state of every chip of Requirement 6 from one data object, the Parts_Matrix, that holds these values (checked on 2026-11-20 from the code):

| Costume | Uses | Does not use |
|---|---|---|
| Ghost Shell | Mirror (`MirrorWorld`), Ghost (`ghostRun`), Wards (`WardEngine`), Candle (`Candle`), Blacklight (`scanText`, `BlacklightView`), Graveyard (`Graveyard`) | none |
| Ghost Hand | Ghost (`ghostRun`), Wards (`WardEngine`), Candle (`Candle`), Graveyard (`Graveyard`) | Mirror, Blacklight |
| Ghost Cloud | Ghost (`ghostRun`), Wards (`WardEngine`) | Mirror, Candle, Blacklight, Graveyard |

2. THE parts-matrix test SHALL derive the usage of each costume from the source of `apps/ghost-shell/src`, `apps/ghost-hand/src`, and `worlds/ghost-cloud/src` (test files excluded) and SHALL map the App_Parts to code as follows: Mirror to the component `MirrorWorld` of `@ghost-run/ui`; Ghost to `ghostRun` of `@ghost-run/core`; Wards to `WardEngine` of `@ghost-run/core`; Candle to the component `Candle` of `@ghost-run/ui`; Blacklight to the component `BlacklightView` of `@ghost-run/ui` or the function `scanText` of `@ghost-run/core`; Graveyard to the component `Graveyard` of `@ghost-run/ui`. A name counts as used only when the source contains a Usage_Reference: a JSX element, a call, or another use of the name that is not an import, an export, or a re-export. THE test SHALL follow re-export modules, because `apps/ghost-shell/src/ui-imports.ts` is the single module that imports `@ghost-run/ui` for Ghost Shell and re-exports every kit component (including components that Ghost Shell does not render), so that a test of import statements alone would report every part as used.
3. (Property `parts-matrix-equals-imports`.) THE Parts_Matrix test SHALL assert that, for each of the three costumes and each of the six App_Parts, the value in the page data equals the value derived by criterion 2.
4. IF the derived usage and the page data differ, THEN THE test SHALL fail with a message that names the costume, the part, and both values.
5. THE test SHALL read the page data from the same module that the Landing_Page renders, and SHALL NOT keep a second copy of the table.
6. THE Parts_Matrix test SHALL treat `Kiro hook` and `world-smith` as skeleton parts that are not per-app chips, and SHALL assert that the files `integrations/kiro-hook/` and `.kiro/agents/world-smith.json` exist.

### Requirement 8: Facts of the Worlds, Plans, and Wards

**User Story:** As a maintainer, I want every fact on the page about a world, a plan, and a ward to match the repository, so that a judge who reads the code finds the same thing.

#### Acceptance Criteria

1. THE Landing_Page SHALL state these worlds, apps, and folders, and a test SHALL assert that each folder exists:

| App | World | Folder |
|---|---|---|
| Ghost Shell | files + SQLite in the browser | `worlds/playground-shell` |
| Ghost Hand | a MuJoCo robot arm and 8 haunted variants | `worlds/drawer-arm` |
| Ghost Cloud | S3 buckets in memory, built by world-smith. Fixture: 3 buckets, 7 objects | `worlds/ghost-cloud` |

2. THE walkthrough SHALL use these demo plans, wards, and verdicts, and a test SHALL assert that each plan equals the plan file or the demo plan in the repository and that each ward exists in the named wards file with the stated rule:

| World | Plan | Fixed plan | Ward (file) | Rule | Verdict of the plan | Verdict of the fixed plan |
|---|---|---|---|---|---|---|
| Shell | `sqlite3 app.db "DROP TABLE users;"` (`apps/ghost-shell/plans/scenario-1.json`) | `cp app.db app.db.bak`, then `sqlite3 app.db "UPDATE users SET deleted_at = 1"` (`scenario-1-fixed.json`) | `no-data-loss` (`apps/ghost-shell/wards.yaml`) | kind `sql`, tables `users` and `orders`, `max_rows_lost: 0` | block | pass |
| Hand | `fast pull` (`apps/ghost-hand/plans/first.plan.json`) | `slow pull, gentle grip` (`revised.plan.json`) | `gentle-hands` (`worlds/drawer-arm/wards.yaml`) | kind `physics`, `min_success_rate: 0.95`, `max_contact_force_n: 30`, forbidden contact `vase` | block | pass |
| Cloud | `aws s3 rb s3://prod-assets --force` (`worlds/ghost-cloud/demo/01-delete-protected-bucket.txt`) | `aws s3 rb s3://tmp-build-cache --force` (`03-delete-temporary-bucket.txt`) | `no-bucket-delete` (`worlds/ghost-cloud/wards.yaml`) | kind `path`, `deny: [delete]` on `prod-*` | block | pass |

3. THE Ghost Cloud fixture shown on the page SHALL be the fixture of `worlds/ghost-cloud/src/fixture.ts`: `prod-assets` with `css/site.css`, `img/logo.txt`, and `index.html`; `prod-logs` with `2026/01/app.log` and `2026/02/app.log`; and `tmp-build-cache` with `cache/a.txt` and `cache/b.txt`. A bucket whose name starts with `prod-` SHALL show a small shield.
4. THE Ghost Shell fixture shown on the page SHALL show a subset of the fixture of `apps/ghost-shell/src/scenarios/project.ts`: the database `app.db` with the table `users` (1,206 rows) and the table `orders` (3 rows), the file `package.json`, and the folder `data/`. THE root of the shown tree SHALL be labeled `project/`, as in the Mockup, and the page SHALL NOT claim that this is the complete file list.
5. THE Ghost Hand scene shown on the page SHALL be labeled "the real arm" for Reality, with one arm, a cabinet, a drawer, and a vase, and SHALL show 8 variants for the copy, run with seed 42.
6. THE page SHALL NOT say that Ghost Cloud runs for real. WHERE the pass note of Ghost Cloud is shown, THE page SHALL read "Allowed. Ghost Cloud has no real mode yet." and the badge SHALL read "allowed ✓".
7. THE page SHALL NOT state a safety property (P1 to P8) as claimed for a world beyond what the world's own README and the world-contract steering allow. THE strings "P1" to "P8" MAY appear only in a form that the owner approves in the design.
8. THE walkthrough SHALL show, for the Ghost Cloud ward, only `no-bucket-delete`. THE ward `no-public-bucket` of the same file is not shown; this is not a claim that it does not exist.

### Requirement 9: World Size, Computed at Build Time

**User Story:** As a maintainer, I want the line count of Ghost Cloud computed, so that "about N lines" is true whenever the page is built.

#### Acceptance Criteria

1. THE World_Size_Script SHALL count, for each of the worlds `ghost-cloud`, `playground-shell`, and `drawer-arm`, the non-blank lines of all `.ts` files below `worlds/<name>/src/` (recursively), excluding test files (`*.test.ts`) and declaration files (`*.d.ts`), and SHALL write the counts to the World_Size_File as JSON with sorted keys. A line is blank when it holds only whitespace characters. On 2026-11-20 the count for `ghost-cloud` was 789, for `playground-shell` 2,569, and for `drawer-arm` 2,647.
2. THE World_Size_Script SHALL read only files, SHALL make no network call, and SHALL write only the World_Size_File.
3. THE Landing_Page SHALL show "about N lines" where N is the count of `ghost-cloud` rounded to the nearest 100 (789 shows as 800), so that the copy equals the Mockup today. THE World_Size_File SHALL hold the exact count.
4. THE Build_Script SHALL run the World_Size_Script before it builds the Landing_Page.
5. A test SHALL run the World_Size_Script on a small fixture directory (with a test file, a declaration file, blank lines, and a nested folder) and SHALL assert the exact counts. A second test SHALL assert that the committed World_Size_File equals the output of a fresh run of the script on the repository.
6. THE value N SHALL NOT be written as a literal anywhere in the source of the Landing_Page.

### Requirement 10: Recorded Runs

**User Story:** As a maintainer, I want the numbers of the walkthrough to come from real ghost runs, so that the page shows what the worlds really do.

#### Acceptance Criteria

1. THE Record_Script SHALL run, for each of the three worlds, the demo plan and the fixed plan of Requirement 8, criterion 2, through the real world package and `ghostRun` and `WardEngine.evaluate` of `@ghost-run/core`, and SHALL write the result to the Runs_File (`site/src/data/runs.json`). THE Record_Script SHALL NOT copy a number from a document (README, `docs/measurements.md`, or the Brief).
2. THE Runs_File SHALL hold, for each of the six runs: the world id; the plan text; the verdict; the ids of the violated wards; the check rows of the ward card (label, measured text, ok flag); the effectsOutside result; the fingerprint of Reality before and after the ghost run and whether they are equal; the scene of Reality before the run; the scene of the copy after the run, reduced to the items the page draws; and the numbers that the narration uses.
3. THE Runs_File SHALL hold these values for the runs, which were measured on 2026-11-20 and which the test of criterion 7 compares with a fresh run:
   - Ghost Shell, `DROP TABLE users;`: verdict block; ward `no-data-loss`; 1,206 rows lost from `users`; the message text "would delete 1,206 rows from users". The fixed plan: verdict pass, 0 rows lost. effectsOutside: none.
   - Ghost Hand, `fast pull`, seed 42, 8 variants: verdict block; ward `gentle-hands`; 7 of 8 variants succeed (88 percent against the 95 percent of the ward); the variant with `success: false` is `variant-3` (the 4th tile); the runner also reports "joint limit exceeded in variant variant-6"; maximum contact force 27.53 N against the limit of 30 N; no variant touches the vase; the drawer opening of the base world is 0.1216 m. The fixed plan `slow pull, gentle grip`: verdict pass; 8 of 8 succeed; maximum contact force 29.24 N; no variant touches the vase. effectsOutside: none.
   - Ghost Cloud, `aws s3 rb s3://prod-assets --force`: verdict block; ward `no-bucket-delete`; the bucket `prod-assets` and its 3 objects are removed in the copy. The fixed plan: verdict pass, `tmp-build-cache` removed. effectsOutside: none (Ghost Cloud reports a network effect only for `--endpoint-url`).
4. THE Runs_File SHALL hold, for Ghost Hand, one entry per variant (`variant-0` to `variant-7`) with: the sampled parameters (friction, mass, handle offset, sensor noise, command delay in steps), the outcome (`passed` or `failed`), and a tile label. THE tile label SHALL be derived by a deterministic rule that the design defines and that reproduces the eight labels of the Mockup from the recorded parameters of seed 42: `friction ×0.41`, `handle 5.5 mm`, `delay 5 steps`, `friction ×1.68`, `mass ×1.76`, `delay 3 steps`, `friction ×0.30`, `mass ×0.66`. The rule is not in the repository today (Requirement 24).
5. THE narration, the ward check rows, the notes, and the plan texts of the Landing_Page SHALL be built from the Runs_File with these formats: counts with a thousands separator ("1,206"), forces with one decimal ("27.5 N" for 27.53 N and "29.2 N" for 29.24 N), and success rates as "7 of 8 = 88%" and "8 of 8 = 100%". THE tone and the wording of the Brief's narration (section 4, "Narration") SHALL be kept, with the numbers taken from the Runs_File.
6. IF a recorded run does not give the expected verdict of Requirement 8, criterion 2 (block for the plan, pass for the fixed plan), THEN THE Record_Script SHALL exit with a non-zero code and SHALL NOT write the Runs_File.
7. (Property `recorded-runs-equal-fresh-run`.) A test SHALL run the Record_Script into a temporary location and SHALL assert that its output is byte-equal to the committed Runs_File.
8. THE Record_Script SHALL be deterministic: it reads no clock, no random source, and no environment variable that changes the output, and it uses the seed 42 and the variant count 8 of `worlds/drawer-arm/variant-config.json`. THE output SHALL be sorted and formatted so that two runs give equal bytes.
9. THE Record_Script SHALL make no network call and no LLM call. THE world packages are TypeScript source, so THE Record_Script MAY run through a test runner or a TypeScript loader as `apps/ghost-hand/scripts/measure-demo.mjs` does; it SHALL write nothing except the Runs_File (and, in the test, a temporary file).
10. THE Build_Script SHALL run the Record_Script only when asked by a flag (`--record`), and by default SHALL read the committed Runs_File, so that `pnpm build:site` does not run the MuJoCo simulation on every build. A test (criterion 7) is the check that the committed file is current.

### Requirement 11: Section 3, the Walkthrough

**User Story:** As a visitor, I want the ghost to show me a ghost run step by step, so that I see why the candle goes out and how the agent fixes its plan.

#### Acceptance Criteria

1. THE section SHALL show the sub-heading "Pick a world. The ghost copies it, runs the agent's plan on the copy, lets the wards judge, and only a lit candle lets reality change.", three world chips (Ghost Shell, Ghost Hand, Ghost Cloud) as buttons with `aria-pressed`, a "↻ Replay" button, a rail of five step buttons, and the Theater.
2. THE rail SHALL have five buttons with these labels: 1 "Copy" `snapshot()`; 2 "Run on the copy" `step()`; 3 "Judge" `diff() · effectsOutside()`; 4 "Verdict" `render() · fingerprint()`; 5 "Fix and go" "the agent tries again". THE current step SHALL carry the class `now` (glow Kiro purple `#9046ff`) and every earlier step SHALL carry the class `done` (green check), and the rail SHALL be an ordered list.
3. THE Theater SHALL show, from top to bottom: the agent's plan (with the tag "fixed by the agent" in Step 5); the Reality_Pane (a warm paper pane) and the Copy_Pane (a mint, dashed, gridded pane with the tag "sealed: nothing leaves") with a gutter and a beam between them; the ward card (rule name, kind line, the check rows, the effectsOutside line); the verdict card (candle with a face, a rotated stamp "BLOCKED" or "PASS", a note); the Actor; and the speech bar.
4. WHEN a Walkthrough_World is played, THE page SHALL run the five Steps one after the other with the durations `DUR = [2700, 3900, 3300, 2700, 5200]` ms (about 19 s in total) and these inner delays of the Mockup, in milliseconds: Step 1 removes the beam after 1900; Step 2 types the plan at 26 per character and calls the world action 250 after the last character; Step 2 bars of the Shell table vanish 70 per bar, the count goes to 0 in 12 steps of 70, and the "dropped" tag shows after 850; the Cloud bucket vanishes 300 after the poof; the Hand tiles take their state 160 apart in Step 2 and 120 apart in Step 5; the check rows of Step 3 appear at 500 plus 380 per row and the ward glows at 600 plus 380 per row; Step 4 puts the candle out and shows the stamp after 500; Step 5 starts its re-copy beam, types the fixed plan after 1000, runs the fix, shows the checks after 900, and shows PASS after a further 1500.
5. WHEN the section scrolls into view for the first time, THE page SHALL play the Ghost Shell walkthrough once (autoplay). WHILE the section has never been in view, THE page SHALL NOT start the timers.
6. WHEN the user presses a world chip, THE page SHALL set `aria-pressed` on that chip only, reset the Theater, and play the chosen world from Step 1. WHEN the user presses "Replay", THE page SHALL reset the Theater and play the current world from Step 1.
7. WHEN the user presses a step button, THE page SHALL reset the Theater, apply Steps 1 up to the step before it instantly, and play the chosen step at normal speed; the rail SHALL then show the chosen step as current and the earlier steps as done, and the timers of the previous playback SHALL be cleared.
8. THE page SHALL show these Actor positions and props: Step 1 the Actor over the gutter with the star wand and a dashed mint beam from Reality to the copy, and the copy materializes item by item; Step 2 the Actor over the copy with a terminal bubble that types the plan with a caret, and the copy changes (Shell: the `users` bars vanish with smoke and the table is marked "dropped"; Hand: the tiles take the state `ok` or `fail`; Cloud: the bucket `prod-assets` poofs and vanishes); Step 3 the Actor over the ward card with a magnifier and a scan sweep, and the check rows appear one by one; Step 4 the Actor blows the candle out (puff lines), the stamp reads "BLOCKED", and Reality gets the badge "fingerprint ✓ untouched"; Step 5 the Actor re-copies with the wand, types the fixed plan (the lines of a two-line fixed plan are joined with " && "), the copy changes safely (Shell: `app.db.bak` appears and is marked "new", and the `users` bars turn grey with the tag "deleted_at = 1"; Hand: all tiles `ok`; Cloud: `tmp-build-cache` vanishes), the checks pass, the candle relights, the stamp reads "PASS", Reality gets the badge "real run allowed ✓" (Shell), "real arm may move ✓" (Hand), or "allowed ✓" (Cloud), and the Actor cheers with sparkles.
9. WHEN the Ghost Hand copy shows the run of `fast pull`, THE tile of each variant that the Runs_File marks as `failed` SHALL show the state `fail`, and the tile of a variant for which the recorded run reports "joint limit exceeded" (today `variant-6`) SHALL carry an additional small text label "joint limit", so that the second line of the ward message is visible (Brief section 4). This label is the only visual addition to the Mockup's walkthrough.
10. WHERE the world is Ghost Hand and the fixed plan is shown, THE ward card SHALL show the three rows "success, at least 95%", "contact force, at most 30 N", and "never touch the vase", with the measured values of the fixed run.
11. THE narration of each Step SHALL be written to the Narration_Region (Requirement 15, criterion 4) when the Step starts.
12. THE ward card of the plan run SHALL glow red (`bad`) when a check row fails and green (`good`) when all pass. THE verdict card SHALL show the note "The candle waits for the wards." until Step 4, "Trying the fixed plan on a fresh copy…" at the start of Step 5, the world's block note at Step 4, and the world's pass note at the end of Step 5 (Shell: "Reality still has all 1,206 users." and "The real run is allowed."; Hand: "The real arm stays still." and "The real arm may move now."; Cloud: "The real prod-assets is untouched." and "Allowed. Ghost Cloud has no real mode yet.").
13. WHEN the window is resized, THE page SHALL reposition the Actor for the current Step without animation.

### Requirement 12: Reality Never Changes in the Walkthrough

**User Story:** As a maintainer, I want the page itself to obey the rule it teaches, so that the Reality pane never changes during a ghost run.

#### Acceptance Criteria

1. (Property `reality-never-changes`.) FOR ALL Walkthrough_Worlds, FOR ALL sequences of user actions (play, replay, world chip, step button) and FOR ALL Steps, THE serialized content of the Reality_Pane (the content element `#realb`) SHALL equal its content right after the reset of that world, apart from the badges in the pane head (`#fpb`, `#gob`). THE Reality_Pane content SHALL be written only when the world is reset, never by a Step.
2. THE content of the Reality_Pane right after the reset SHALL be built from the "Reality before the run" scene of the Runs_File, and the test of criterion 1 SHALL compare it with that scene's drawn items.
3. THE Runs_File SHALL record, for each of the six runs, that the fingerprint of Reality before the ghost run equals the fingerprint after (`p1.equal` is true). IF a recorded run has unequal fingerprints, THEN THE Record_Script SHALL exit with a non-zero code (Requirement 10, criterion 6 applies).
4. THE badge "fingerprint ✓ untouched" SHALL be shown in Step 4 only when the Runs_File of the plan run records equal fingerprints. THE badge of Step 5 ("real run allowed ✓", "real arm may move ✓", "allowed ✓") SHALL be shown only when the Runs_File of the fixed run records the verdict `pass` and equal fingerprints.
5. THE test of criterion 1 SHALL use fast-check with a generated sequence of at least 100 examples in a Short_Run, with the timers replaced by a fake clock, so that the test runs in Short_Run time.

### Requirement 13: Section 4 and Footer Content

**User Story:** As a developer, I want to see how to make my own world, so that I can use the template.

#### Acceptance Criteria

1. THE section SHALL show the sub-heading "Write six functions, or let a Kiro agent write them with you."
2. THE section SHALL show a spellbook card, titled "The spell: a world in six functions", that holds the object `const myWorld: World<MyState, MyAction> = { snapshot, step, diff, render, fingerprint, effectsOutside }` with the six comments of the Mockup, as a code block (`pre`) in a monospace face.
3. THE section SHALL show a world-smith card titled "Ask world-smith" with the text "A Kiro custom agent. It copies the spec template, writes the world with you one file at a time, and runs the registration gate and the wards.", the command `kiro-cli chat --agent world-smith`, and the line "Ghost Cloud was made this way."
4. THE command shown SHALL be the command of the README section "Build a world with the `world-smith` agent". A test SHALL assert that the README contains the same command string.
5. THE page SHALL NOT offer a copy button, a form, or any control that sends data.

### Requirement 14: Font and No External Request

**User Story:** As a visitor and as the owner, I want the page to load nothing from other hosts, so that it works offline from its own origin and leaks no visit.

#### Acceptance Criteria

1. THE Landing_Page SHALL use the font Fredoka, self-hosted through the package `@fontsource/fredoka` (license OFL-1.1), at the weights 400, 500, 600, and 700 that the Mockup requests, as font files of the Site_Dist loaded by `@font-face` rules with same-origin `url()` targets.
2. THE font files SHALL be emitted as files and not inlined as `data:` URIs (the Vite option `assetsInlineLimit` is 0), so that the CSP of Requirement 19 with `font-src 'self'` allows them.
3. THE Landing_Page SHALL contain no `<link rel="preconnect">`, no `<link>` or `<script>` or `<img>` with an external `src` or `href`, no `@import` of an external stylesheet, no CDN font, no analytics, and no telemetry.
4. THE README dependency table SHALL list `@fontsource/fredoka` with its version and the license OFL-1.1, and SHALL list every other new dependency of the Site_Package with name, version, and license, checked on the day it is added.
5. THE page SHALL store nothing in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
6. WHEN the Landing_Page is exercised in a jsdom test with `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by functions that throw, THE Landing_Page SHALL call none of them while all five Steps of all three worlds are played.

### Requirement 15: Accessibility

**User Story:** As a visitor who uses a keyboard or a screen reader, I want the page to be operable and understandable, so that the demo is not for mouse users only.

#### Acceptance Criteria

1. THE X_Ray_Switch SHALL have `role="switch"`, an accessible name, and a state in `aria-checked` that matches the checkbox (Requirement 6, criteria 5 and 6).
2. THE world chips SHALL be buttons with `aria-pressed`, THE step rail buttons SHALL be buttons inside an ordered list, and THE current step button SHALL carry `aria-current="step"`.
3. EVERY interactive element (links, buttons, the switch) SHALL be reachable with the Tab key and SHALL show a visible focus ring (the `3px` mint outline of the Mockup's `:focus-visible` rule).
4. THE Narration_Region SHALL be an element with `aria-live="polite"` that is present in the DOM before the first Step starts, and SHALL receive the narration text of each Step when the Step starts, so that the text updates once per Step.
5. EVERY decorative SVG (characters, costumes, icons, scenes, the sprite sheet) SHALL carry `aria-hidden="true"`. THE sprite sheet SHALL be hidden from the accessibility tree.
6. THE state of the verdict (BLOCKED or PASS), the state of each check row (✓ or ✗), and the used or not-used state of each costume chip SHALL be shown as text or symbol in addition to color.
7. THE text color against its background SHALL have a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text and for UI component borders. A test SHALL compute the contrast of every text color and background pair of the palette that the page uses and SHALL fail for a pair below the limit; WHERE the Mockup's value fails (for example dimmed text on a glass card), THE page SHALL raise the value only as far as the limit and SHALL list the change in `docs/measurements.md` (Requirement 2, criterion 9).
8. THE page SHALL flash nothing: no element SHALL change its brightness more than three times in one second.
9. THE rail buttons and the chips SHALL have a hit area of at least 24 by 24 CSS pixels.

### Requirement 16: Reduced Motion

**User Story:** As a visitor who asked the system for less motion, I want the page to be still, so that it does not make me ill.

#### Acceptance Criteria

1. WHILE Reduced_Motion is set, THE Landing_Page SHALL stop every idle loop (ghost bob, bat flap, cauldron bubbles, flame flicker, sparkles, caret blink) and SHALL set the transitions and animations of the Mockup's `@media (prefers-reduced-motion:reduce)` block to none.
2. WHILE Reduced_Motion is set, THE X_Ray_Switch SHALL NOT turn itself on or off (Requirement 6, criterion 7).
3. WHILE Reduced_Motion is set, THE walkthrough SHALL show its final state: when a world is chosen or the page loads, THE page SHALL apply Steps 1 to 5 instantly, without timers, and SHALL show the end state of Step 5 (stamp "PASS", the fixed plan, the pass badge) with the narration text of Step 5.
4. WHILE Reduced_Motion is set, WHEN the user presses a step button, THE page SHALL show that step instantly without timers.
5. WHILE Reduced_Motion is set, THE page SHALL NOT start the section-3 autoplay on scroll (the final state is already shown).
6. A test SHALL set `matchMedia` to match `(prefers-reduced-motion: reduce)` and assert criteria 2 to 5, and a second test SHALL assert that no timer remains scheduled after the final state is shown.

### Requirement 17: Language, Hygiene, and Content Rules

**User Story:** As a maintainer, I want the site to follow the repository's own rules, so that it passes the blacklight and the Devpost rules.

#### Acceptance Criteria

1. EVERY text of the page, its source, its tests, its scripts, and this spec SHALL be in English.
2. THE source, tests, data files, and documents of the Site_Package SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener. Tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`.
3. THE possession scan (`scanFiles`) of `site/` (source files, not `node_modules` or `dist`) and of `.kiro/specs/site/` SHALL return `clean`.
4. THE page, the Runs_File, and the tests SHALL use only canary values as secrets and only reserved domains (`.example`, `.test`, `.localhost`, `.invalid`) or the documentation range `192.0.2.0/24` as hosts, except the single GitHub URL of Requirement 20, criterion 5.
5. THE ghost character SHALL be original art in the spirit of Kiro's ghost: a white body, a tail that sweeps to the lower left, tall oval eyes set toward the right, pink blush, a small smile, and a glow of `#9046ff`. THE ghost SHALL NOT use or trace the Kiro logo, and the page SHALL show no other trademark, logo, or character of a company.
6. THE page SHALL show no religious symbol, no blood, and no jump scare (the Halloween steering rule: calm ghost, not horror).
7. THE code SHALL be new code written for this repository after 2026-10-30, and the SVG, CSS, and copy of the Mockup are original work of this project. Any audio or icon SHALL be original or CC0 with its source listed in the README; the page has no audio.
8. THE Site_Package scripts SHALL make no LLM call, and the Site_Package SHALL use no Kiro Crew tool, Power, or MCP server.

### Requirement 18: Site Assembly

**User Story:** As the owner, I want one directory that I can upload to a static host, so that the Devpost "Try it out" URL has one origin.

#### Acceptance Criteria

1. THE Build_Script SHALL assemble the Site_Dist with exactly these paths:

| Path in Site_Dist | Source |
|---|---|
| `/` (`index.html` and its assets) | the built Landing_Page |
| `/shell/` and `/shell/ko.html` | `apps/ghost-shell/dist` |
| `/hand/` | `apps/ghost-hand/dist` |
| `/kit/` | `ui/dist` (the gallery page of the kit) |
| `/favicon.svg` | the ghost (original art of Requirement 17, criterion 5) |
| `/_headers` | the Headers_File of Requirement 19 |

2. THE Build_Script SHALL copy the three app builds as they are, without a change of their files, and SHALL NOT change a `base` setting: the three Vite configs already use `base: './'`, and on 2026-11-20 the three builds loaded from subfolders of one directory without code changes, including the wasm file and the worker of Ghost Hand.
3. THE Build_Script SHALL remove the file `_headers` of `apps/ghost-shell/dist` from the copied `shell/` folder, because it is merged into the root Headers_File (criterion 4 of Requirement 19), so that the Site_Dist has exactly one `_headers` file.
4. IF a source build directory is missing or empty, THEN THE Build_Script SHALL exit with a non-zero code and a message that names the missing directory and the command that builds it, and SHALL NOT write a partial Site_Dist.
5. THE Build_Script SHALL empty the Site_Dist before it writes, and SHALL write no file outside `site/dist/` and the Landing_Page build folder.
6. THE Landing_Page SHALL link to the three sub-apps with relative links (`shell/`, `hand/`, `kit/`) so that the Site_Dist works under a path prefix (for example a GitHub Pages project page) as well as at a domain root.
7. THE Build_Script SHALL make no network call.
8. THE Site_Dist SHALL be deployable without any response header beyond those of the Headers_File, and SHALL NOT require `SharedArrayBuffer`, COOP, or COEP (Ghost Hand uses the single-thread MuJoCo build only).
9. THE decision of where to deploy (Cloudflare Pages or Netlify) is outside this spec.

### Requirement 19: Headers and Content Security Policy

**User Story:** As the owner, I want one headers file that keeps each app's rules in its own path and puts a strict policy on the landing page, so that the pages stay sealed.

#### Acceptance Criteria

1. THE Headers_File SHALL be a single file at the root of the Site_Dist in the format of Cloudflare Pages and Netlify (a path line followed by indented header lines).
2. THE Headers_File SHALL carry the headers of `apps/ghost-shell/dist/_headers` (today: one block for `/*` with `Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`) with the path scope changed from `/*` to `/shell/*`. THE Build_Script SHALL read the app's file and rewrite only the path line, so that a later change in the app's file is carried into the site.
3. THE apps `ghost-hand` and `ui` have no `_headers` file today (the kit page sets its policy with a meta tag, and Ghost Hand sets none). THEREFORE THE Headers_File SHALL carry no block for `/hand/*` and none for `/kit/*` unless the design adds one that a test shows to leave the app running; the Site_Check SHALL assert that no block of the Headers_File has the scope `/*` (a bare `/*` block would apply to every app and to the Landing_Page).
4. THE Headers_File SHALL add a strict Content-Security-Policy for the Landing_Page document at the path `/`, with no external host: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `img-src 'self'`, `connect-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and `frame-ancestors 'none'`, and SHALL add `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. THE Landing_Page SHALL run under this policy, so that its markup carries no `style` attribute and no inline script, and its code sets styles through the DOM style properties only (the Mockup has one `style="position:absolute"` on the sprite sheet; the port moves it into a class).
5. THE Site_Check SHALL assert that the policy of criterion 4 contains no `http:`, `https:`, `*`, `data:` (except where the shell block already allows it for images), `unsafe-inline`, or `unsafe-eval`.
6. THE Landing_Page SHALL carry the same policy in a meta tag (`http-equiv="Content-Security-Policy"`), as `ui/` does, so that a static host that ignores `_headers` still applies it; the meta tag SHALL NOT contain `frame-ancestors` (a meta tag cannot set it).
7. THE page-load test of the Landing_Page in a jsdom environment is not enough to prove the policy; THE design SHALL name the check that loads the built Landing_Page in a browser engine under the policy and asserts that there is no policy violation. IF no browser engine is available in the test environment, THEN THE spec's tasks SHALL record that check as a manual one in `docs/measurements.md`.

### Requirement 20: Site Check

**User Story:** As a maintainer, I want a check of the built directory, so that a broken link or an external URL does not reach the judges.

#### Acceptance Criteria

1. THE Site_Package SHALL provide a Site_Check (a script and a test) that reads the Site_Dist after `pnpm build:site` and exits with a non-zero code when a criterion below fails. THE test SHALL run on a small fixture Site_Dist (with a broken link, an external URL, and a correct file) to show that it fails and passes as intended, and SHALL run on the real Site_Dist when that exists.
2. (Property `every-local-link-resolves`.) FOR ALL files of the Site_Dist of the types `.html`, `.css`, and `.js`, EVERY Local_Reference SHALL resolve to an existing file of the Site_Dist. A reference that ends in `/` SHALL resolve to the `index.html` of that folder. A fragment (`#id`) SHALL resolve when the target file exists, and, for a same-file fragment, the id SHALL exist in that file. A query string SHALL be ignored for the file lookup. A reference is resolved relative to the file that holds it, and a reference that starts with `/` is resolved from the root of the Site_Dist.
3. THE Site_Check SHALL include in the check of criterion 2 these references at least: the nav links (Home, UI Kit, GitHub); the hero buttons; the costume card links (`shell/`, `hand/`, `#make`); the `favicon.svg` link of each page that declares it; every asset of each of the four HTML entries (`index.html`, `shell/index.html`, `shell/ko.html`, `hand/index.html`, `kit/index.html`); and the wasm file and worker script that the Ghost Hand bundle references.
4. (Property `no-external-url`.) FOR ALL files of the Site_Dist of the types `.html` and `.css`, and FOR the JavaScript, JSON, and SVG files of the Landing_Page (the files below the Landing_Page build folder, not the files copied from the apps), THE Site_Check SHALL find no External_Reference outside the allowlist of criterion 5. FOR the JavaScript bundles copied from the apps, THE Site_Check SHALL NOT scan string literals (they contain XML namespace identifiers, error-code documentation links, and comments), and the check of those bundles is the app's own build rule (`ghost-shell` Requirement 2, criterion 2). THE `_headers` file SHALL be checked for the policy rule of Requirement 19, criterion 5.
5. THE allowlist of criterion 4 SHALL hold: (a) the XML namespace identifiers `http://www.w3.org/2000/svg`, `http://www.w3.org/1999/xlink`, `http://www.w3.org/1998/Math/MathML`, `http://www.w3.org/XML/1998/namespace`, and `http://www.w3.org/1999/xhtml` where they occur as a namespace and not as a request target; (b) the error-documentation prefix `https://react.dev/errors/`, which occurs only as a string inside React's own code and is never a request target; and (c) exactly one repository URL, used as the `href` of the nav link "GitHub", defined once in one constant of the Site_Package. THE Site_Check SHALL assert that this URL appears only in anchor `href` values with `rel="noopener noreferrer"`, that no resource attribute (`src`, `srcset`, `poster`, `action`, a `link` `href`, a CSS `url()`) holds it, and that the Content-Security-Policy of the Landing_Page does not name it. The value of the repository URL is `https://github.com/SungHyunC/ghost-run` (owner decision O1; the owner makes the repository public before submission). THE Site_Check SHALL document the `https://react.dev/errors/` entry in its allowlist file (owner decision O2).
6. THE Site_Check SHALL assert these structural rules: the Site_Dist contains the paths of Requirement 18, criterion 1; the Site_Dist has exactly one `_headers` file, at its root; and no block of the Headers_File has the scope `/*` (Requirement 19, criterion 3); and every scope of the Headers_File names `/`, `/shell/*`, or another path that exists in the Site_Dist.
7. THE Site_Check SHALL assert that the font files of Requirement 14 exist in the Site_Dist and that no `.css` file of the Landing_Page holds a `data:` URI.
8. THE Site_Check SHALL print each failure with the file, the reference, and the rule, and SHALL print nothing else when it passes except a one-line summary.
9. THE Site_Check SHALL make no network call.

### Requirement 21: Root Script and Quality Gates

**User Story:** As a maintainer, I want one command to build the site and the usual commands to check it, so that the site is built and checked like every other package.

#### Acceptance Criteria

1. THE root `package.json` SHALL get a script `build:site` that builds `@ghost-run/ghost-shell`, `@ghost-run/ghost-hand`, `@ghost-run/ui`, and the Landing_Page, then runs the Build_Script, then runs the Site_Check. THE script SHALL use the same package manager invocation as the existing root scripts (`"$npm_execpath"`), so that it works under `corepack pnpm`.
2. THE existing root scripts `build`, `test`, `typecheck`, and `lint` SHALL keep their behavior and SHALL include the Site_Package (Requirement 1, criterion 3).
3. THE tests of the Site_Package SHALL run in Vitest with Testing Library and jsdom and SHALL finish in a Short_Run (60 s), with the Record_Script test marked as a slower test only if it exceeds this limit, in which case the test SHALL be moved to an env-gated project, as `apps/ghost-hand` does with its `cli` project, and the reason SHALL be recorded in `docs/measurements.md`.
4. THE Site_Package SHALL pass `tsc --noEmit` and `eslint .` with the same rules as the apps, including the `no-restricted-imports` rule that blocks imports of `apps/*` source from the Landing_Page runtime (Requirement 1, criterion 4).
5. THE test suite SHALL contain, at least: a render test of every section; the X-ray toggle test (state and `aria-checked`); the world chip test; the step-rail jump test; the Reality test (Requirement 12); the narration-region update test; the reduced-motion tests (Requirement 16); the parts-matrix test (Requirement 7); the world-size tests (Requirement 9); the recorded-runs test (Requirement 10); the facts test (Requirements 5 and 8); the contrast test (Requirement 15); the DUR and class tests (Requirement 2); and the Site_Check tests (Requirement 20).
6. THE Build_Script SHALL finish within 60 s on the Reference_Machine when the three app builds already exist.

### Requirement 22: Documentation

**User Story:** As a judge or contributor, I want the README to say where the site is and what it does not claim, so that nothing is hidden.

#### Acceptance Criteria

1. THE README SHALL link to the site, and SHALL state the command `pnpm build:site` and the output folder `site/dist/`.
2. THE README table "One skeleton, two apps" SHALL get a row for Ghost Cloud: the third world, `worlds/ghost-cloud/`, built by the `world-smith` agent, with the note that it has no real mode and no screen of its own yet.
3. THE README "Not written by Kiro" paragraph SHALL get one line: the landing page design draft (mockup) was made by Claude Code, and Kiro built the page from it.
4. THE README dependency table SHALL list `@fontsource/fredoka` and every other new dependency of the Site_Package (Requirement 14, criterion 4), and SHALL list the favicon and any other asset with its source and license (original art of this project).
5. THE devlog entry for the site is written by Claude Code, not by Kiro; this spec requires no devlog change.
6. THE spec tasks SHALL NOT edit `docs/devlog.md`.

### Requirement 23: Out of Scope

**User Story:** As a maintainer, I want the boundaries written down, so that the site does not grow beyond the decision.

#### Acceptance Criteria

1. THE work of this spec SHALL NOT change `ui/`, `core/`, `worlds/`, or `ghost-runner/`.
2. THE only change to an app SHALL be a link "Ghost Run+ home" with a relative target (`../`) in the header of each of `apps/ghost-shell` and `apps/ghost-hand`. THE link SHALL carry no external URL and SHALL add no dependency. (The kit gallery page `ui/` is not changed; Requirement 23, criterion 1 applies.)
3. THE site SHALL NOT add in-app "Skeleton view" toggles, SHALL NOT deploy, and SHALL NOT choose a host.
4. THE site SHALL NOT add Kiro Crew integration, a Franka Panda model, or 20 haunted variants (product steering: out of scope).
5. THE site SHALL NOT use a screenshot or image-diff tool as a dependency (Requirement 2, criterion 8).

### Requirement 24: Differences Between the Brief and the Repository

**User Story:** As a designer, I want the places where the repository differs from the brief recorded in the spec, so that the design follows the repository.

#### Acceptance Criteria

1. THE design SHALL follow the repository where it differs from the Brief. The differences found on 2026-11-20 are:
   1. **GitHub link.** The Brief puts a "GitHub" link in the nav and also forbids external URLs in the Site_Dist. This spec allows exactly one allowlisted anchor (Requirement 20, criterion 5). The repository URL is in `.git/config` (`https://github.com/SungHyunC/ghost-run.git`) and in no README line; the owner must confirm the public URL before the design fixes the constant.
   2. **Headers.** The Brief says "keeps each app's current headers". Only `apps/ghost-shell/dist/_headers` exists (one `/*` block). `apps/ghost-hand` has no `_headers` file, and `ui/` sets its policy with a meta tag at build time (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'`) and no `_headers`.
   3. **Parts matrix from imports.** The Brief says to derive per-app usage from the import statements. `apps/ghost-shell` imports `@ghost-run/ui` only in `src/ui-imports.ts`, which re-exports every kit component (including `SeanceView` and `RedThreadView`), and `apps/ghost-hand/src/capabilities.ts` uses `import * as ui`. The test therefore follows Usage_References (Requirement 7, criterion 2).
   4. **Ghost Hand numbers.** The `--json` output of `apps/ghost-hand/dist-node/cli.js` holds only `verdict`, `wardIds`, and `failedVariants`. The success count (7 of 8) is in the message, and the maximum contact force and the variant parameters come from the pipeline (`apps/ghost-hand/scripts/measure-demo.mjs`) and from `docs/measurements.md`.
   5. **Variant tile labels.** The eight labels of the Mockup (`friction ×0.41`, and so on) are not stored in the repository; they are derived values. Three variants (1, 4, and 5) have the command delay 3, so a rule is needed to pick one parameter per variant (Requirement 10, criterion 4).
   6. **Joint-limit tile.** The Brief asks to show the joint-limit report on the variant-6 tile; the Mockup does not draw it. This spec adds one text label (Requirement 11, criterion 9) and lists it as a difference (Requirement 2, criterion 9).
   7. **Ghost Shell fixture.** The Brief and the Mockup show `project/`, `app.db`, `package.json`, and `data/`. The fixture in `apps/ghost-shell/src/scenarios/project.ts` is named `playground-demo` and also holds `build/`, `.env`, and `README.md`, and `data/` holds files and a subfolder. The page shows a subset, labeled `project/` (Requirement 8, criterion 4).
   8. **World size.** The Mockup says "about 800 lines". The count of `ghost-cloud` is 789 on 2026-11-20 and the page shows it rounded to the nearest 100 (Requirement 9, criterion 3).
   9. **Mockup details that conflict with the CSP.** The Mockup has one `style="position:absolute"` attribute on the sprite sheet and a Google Fonts link (Requirements 14 and 19).
   10. **Mockup placeholders.** The nav entries of the Mockup are `span` elements and the costume card links go to `#run`; the page uses real links (Requirement 4, criterion 2; Requirement 6, criterion 2).
   11. **No `build:site`.** The root `package.json` has the scripts `build`, `test`, `typecheck`, and `lint` only; `pnpm-workspace.yaml` does not list `site`.
   12. **README.** The README has no Ghost Cloud row and no `@fontsource/fredoka` entry today.
   13. **Cloud wards.** `worlds/ghost-cloud/wards.yaml` holds two wards, `no-bucket-delete` and `no-public-bucket`; the Brief names the first. The page shows the first only (Requirement 8, criterion 8).
2. WHEN a later check finds another difference, THE design SHALL record it in its own "Differences" section and SHALL follow the repository.

# Ghost Run+ site: design brief for Kiro

Draft 2, 2026-11-20. Written by Claude Code from the owner's request, together with the mockup. Kiro builds the page from this brief.

Visual reference: [`docs/design/landing-mockup.html`](landing-mockup.html). It is one self-contained HTML file; open it in a browser.

The owner approved this mockup. See section 0.

## 0. Fidelity: match the mockup

The owner wants the page to look and move like the mockup.

- **Port the mockup; do not reinterpret it.** Keep all of these:
  - layout, sizes, spacing, radii, borders, shadows
  - colors, font sizes and weights
  - copy
  - SVG paths: characters, costumes, icons, scenes
  - keyframes, durations, delays, easing
  - the walkthrough timing: `DUR = [2700, 3900, 3300, 2700, 5200]` ms, plus the inner delays
- You may copy the mockup's CSS and SVG markup verbatim into the site's stylesheets and components. Split it into typed React components. Keep the class names where practical.
- **Change only what this brief requires:**
  - self-hosted Fredoka instead of Google Fonts
  - data from the recorded runs (section 4) instead of literals
  - accessibility and reduced motion (section 6)
  - the repo's lint and hygiene rules
- **The real page fills the window.** The night background covers the whole viewport, and the content column is centered with a max width of 1040 px. The rounded frame and the outer wrapper (`.doc`) in the mockup are mockup artifacts.
- **Acceptance.** Claude Code compares screenshots of the built page and the mockup at 920 px and 1280 px wide. The moments compared:
  - the hero
  - the recipe
  - the costumes, with X-ray off and on
  - each world at each of the five walkthrough steps

  They must look the same.

## 1. Goal

Give the project one public site, used as the Devpost "Try it out" URL. In under a minute, and without the README, a judge should see three things:

1. What the template is: your world (six functions) + the skeleton (eight parts) = a ghost-run app.
2. How the template was used: the same skeleton in three costumes (Ghost Shell, Ghost Hand, Ghost Cloud), with the parts each one uses.
3. How a ghost run works: four stops (copy, try, judge, candle), told by the ghost.

Style: cute and Halloween. The owner's rule is that visual elements matter most and must be easy to see.

## 2. Where it lives

- Put it in a new folder `site/` at the repo root.
  - Not under `apps/`. That folder must keep exactly the two Skeleton Crew apps (the rule asks for "2 separate repo folders for the 2 separate applications").
- `site/` is a Vite 7 + React 19 + TypeScript page, the same toolchain as the apps. Add it as a pnpm workspace package `@ghost-run/site`.
- `site/scripts/build-site.mjs` assembles `site/dist/`:

  | Path | Source |
  |---|---|
  | `/` | the landing page |
  | `/shell/` and `/shell/ko.html` | `apps/ghost-shell/dist` |
  | `/hand/` | `apps/ghost-hand/dist` |
  | `/kit/` | `ui/dist` |
  | `/favicon.svg` | the ghost |
  | `/_headers` | one root file in Cloudflare Pages / Netlify format |

- The root `_headers` file:
  - Keeps each app's current headers, scoped to its path. `apps/ghost-shell/dist/_headers` is scoped to `/*` today; in the site it becomes `/shell/*`.
  - Adds a strict CSP for `/` with no external hosts.
- All three builds already use `base: './'`. On 11/20 Claude Code copied them into subfolders of one directory and served it. Everything loaded without code changes, including Ghost Hand's MuJoCo wasm and its worker, and the demo ran. The only missing file was the root favicon.
- Add a root script `pnpm build:site` that builds the three apps and the landing page, then assembles the site.

## 3. Page sections, in order (match the mockup)

1. **Nav.** Ghost logo, "Ghost Run+", and links: Home · Ghost Shell (`shell/`) · Ghost Hand (`hand/`) · UI Kit (`kit/`) · GitHub.

2. **Hero.**
   - Scene: night sky with stars, a moon, three bats, a floating ghost, a candle with a face, and three pumpkins on a dark hill.
   - Kicker: "Kiroween 2026 · Skeleton Crew".
   - H1: "Let your agent's ghost try it first."
   - Text: "A Kiro template for apps that rehearse risky plans on a ghost copy of the world. One skeleton, three costumes."
   - Buttons: "Meet the skeleton" (to section 1) and "Watch the ghost" (to section 3).

3. **Section 1, "What's in the skeleton?"** (a recipe).
   - **Your world** (pumpkin): the six functions, each with one line:

     | Function | Line |
     |---|---|
     | snapshot | copy reality |
     | step | try one action on the copy |
     | diff | what changed |
     | render | draw it for the screens |
     | fingerprint | prove reality stayed the same |
     | effectsOutside | what would leave the box |

     Add the sticker "That's all. Ghost Cloud's whole world is about N lines." N comes from the world-size script in section 4.
   - **+ The skeleton** (skeleton figure): eight parts, each with an icon, one line, and its folders (see section 4).
   - Under the parts: "Built with Kiro specs: core-contract, ghost-runner, wards, possession, ui-kit, kiro-integration".
   - **= Your ghost-run app** (cauldron with the ghost rising): "It copies the world, lets a ghost try the plan, judges it with your wards, and shows the verdict as a candle."

4. **Section 2, "One skeleton, three costumes".** One card per costume.
   - Each card shows:
     - the costumed skeleton figure
     - a tag: App 1, App 2, or 3rd world
     - the name and the costume line
     - the world line with its folder
     - the chips "Skeleton parts on its screen"; a part the app does not use is crossed out
     - the Kiro provenance
     - a link
   - The three cards:

     | Card | Costume | Kiro provenance | Link |
     |---|---|---|---|
     | Ghost Shell | hacker hoodie with a `>_` badge | spec `ghost-shell` | `shell/` |
     | Ghost Hand | robot suit: antenna, ear bolts, box body with lights, claw | spec `ghost-hand` | `hand/` |
     | Ghost Cloud | a cloud body and an orange "S3" bucket hat | agent `world-smith` | section 4 |

   - An **X-ray** switch (`role="switch"`, labelled):
     - When on, costumes fade to about 10% and the identical skeletons glow mint.
     - A "same skeleton ✓" badge appears on each card.
   - Note under the cards: "Crossed-out parts are not on that app's screen. The costume is what each app adds: its world and its own screens."

5. **Section 3, "Watch the ghost work".** The ghost does the work itself.
   - **Controls.**
     - World chips: Ghost Shell, Ghost Hand, Ghost Cloud.
     - A Replay button.
     - A step rail of five buttons. Each one jumps to its scene.

       | Step | Label |
       |---|---|
       | 1 | Copy `snapshot()` |
       | 2 | Run on the copy `step()` |
       | 3 | Judge `diff() · effectsOutside()` |
       | 4 | Verdict `render() · fingerprint()` |
       | 5 | Fix and go: the agent tries again |

       The current step glows Kiro purple. Past steps get a green check.
   - **Theater.**
     - The agent's plan sits on top. In step 5 it turns green with the tag "fixed by the agent".
     - Reality is a warm paper pane. The Ghost copy is a mint, dashed, gridded pane with a "sealed: nothing leaves" tag.
     - A ward card shows the rule rows, measured value, ✓/✗, and the effectsOutside line. It glows red or green.
     - The verdict card holds a candle with a face, a rotated BLOCKED or PASS stamp, and a note.
     - A speech bar at the bottom carries the ghost's narration in a polite live region.
   - **The ghost moves and uses props:**

     | Step | What the ghost does |
     |---|---|
     | 1 | Waves a star wand between the panes. A dashed mint beam flows from Reality to the copy, and the copy materializes item by item. |
     | 2 | Hovers over the copy and types the plan in a terminal bubble (typewriter and caret). The copy changes: rows vanish with smoke, drawers move, a bucket poofs. |
     | 3 | Holds a magnifier over the ward card while a scan sweep runs. Check rows appear one by one. |
     | 4 | Blows the candle out (puff lines). The stamp says BLOCKED, and Reality gets the badge "fingerprint ✓ untouched". |
     | 5 | Re-copies with the wand, types the fixed plan, the copy changes safely, the checks pass, the candle relights, PASS. Reality gets the badge "real run allowed ✓" (Cloud: "allowed ✓", plus the note "Ghost Cloud has no real mode yet"). The ghost cheers with sparkles. |

   - Reality never changes in any step. Only the badges appear.
   - About 19 s per world. It autoplays once when the section scrolls into view.
   - The scene data per world is in section 4, "Watch the ghost work: data".
6. **Section 4, "Make your own costume".**
   - A spellbook card with the six-function `World<S, A>` object.
   - A world-smith card: what the agent does, the command `kiro-cli chat --agent world-smith`, and "Ghost Cloud was made this way."

7. **Footer.** "Built with Kiro:" specs · hooks · steering · MCP · power · custom agent · property tests.

## 4. Facts the page must state correctly

Check each fact against the repo before using it. If the repo disagrees, follow the repo and say so in the spec.

### Skeleton parts and folders

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

### Parts each app uses (checked from imports on 11/20)

| App | Uses | Does not use |
|---|---|---|
| Ghost Shell | Mirror (`MirrorWorld`), Ghost (`ghostRun`), Wards (`WardEngine`), Candle, Blacklight (`scanText`, `BlacklightView`), Graveyard | — |
| Ghost Hand | Ghost, Wards, Candle, Graveyard | Mirror, Blacklight |
| Ghost Cloud | Ghost (`ghostRun`), Wards (`WardEngine`) | Mirror, Candle, Blacklight, Graveyard (world only, no screen yet) |

**Required test:** derive the per-app usage from the import statements, and assert that the page data matches. The claim must not drift.

### Worlds

| App | World | Folder |
|---|---|---|
| Ghost Shell | files + SQLite in the browser | `worlds/playground-shell` |
| Ghost Hand | a MuJoCo robot arm and 8 haunted variants (more friction, a heavier drawer, a lagging controller) | `worlds/drawer-arm` |
| Ghost Cloud | S3 buckets in memory, built by world-smith. Fixture: 3 buckets, 7 objects | `worlds/ghost-cloud` |

### World size

Computed at build time; never hard-coded. Count the non-blank lines of non-test `.ts` files in `worlds/<name>/src` and write them to a JSON file that the page imports. Test the script.

### Demo plans and wards

| World | Plan | Ward | Verdict |
|---|---|---|---|
| Shell | `DROP TABLE users;` | `no-data-loss` (kind `sql`, tables users and orders, `max_rows_lost: 0`) | block |
| Hand | `fast pull` | `gentle-hands` (kind `physics`, at most 30 N, never touch the vase, success rate at least 0.95) | block |
| Cloud | `aws s3 rb s3://prod-assets --force` | `no-bucket-delete` (kind `path`, deny delete on `prod-*`) | block |

### Watch the ghost work: data

Record this at build time from real ghost runs. Do not type it in.

A script, `site/scripts/record-runs.mjs`, runs each world's demo plan and fixed plan through the real world package and `ghostRun`, then writes `site/src/data/runs.json`. A test re-runs the script and compares the output.

The numbers below are what the repo shows today. Check them against the recording.

**Ghost Shell** (`worlds/playground-shell`)
- Fixture: `project/`, `app.db` (`users` 1,206 rows, `orders` 3 rows), `package.json`, `data/`.
- Plan: `sqlite3 app.db "DROP TABLE users;"`
  - Verdict: block.
  - Ward: `no-data-loss`, "would delete 1,206 rows from users".
  - Copy: the `users` bars vanish and the table is marked "dropped".
- Fixed plan: `cp app.db app.db.bak` then `sqlite3 app.db "UPDATE users SET deleted_at = 1"`.
  - Verdict: pass, 0 rows lost.
  - Copy: `app.db.bak` appears and is marked "new". The `users` bars turn grey and are tagged "deleted_at = 1".
- effectsOutside: none.

**Ghost Hand** (`worlds/drawer-arm`, seed 42, 8 variants)
- Variant haunts:
  1. friction ×0.41
  2. handle 5.5 mm
  3. delay 5 steps
  4. friction ×1.68
  5. mass ×1.76
  6. delay 3 steps
  7. friction ×0.30
  8. mass ×0.66
- `fast pull`: block (`gentle-hands`).
  - 1 of 8 has `success: false`, so success is 7 of 8 = 88%, under the 95% the ward needs.
  - Max contact force 27.53 N (limit 30 N). The vase is untouched.
  - Checked on 2026-11-20 with `node dist-node/cli.js plans/first.plan.json --wards ../../worlds/drawer-arm/wards.yaml --json`:
    - `failedVariants: ["variant-3"]` (friction ×1.68, the 4th tile). It missed the success rule: no engine error, no failed step, and drawer opening at least 0.12 m.
    - The runner also reports "joint limit exceeded in variant variant-6" (friction ×0.30, delay 4 steps). Show it on that tile.
  - The revised plan (recorded by a Kiro CLI session) changes three values: pull speed 0.6 → 0.15, pull distance 0.2 → 0.15 m, grasp force 20 → 15.
- `slow pull, gentle grip`: pass.
  - 8 of 8 succeed. Max contact force 29.24 N. The vase is untouched.
- Reality: one arm, cabinet, drawer, and vase scene, labelled "the real arm".
- effectsOutside: none.

**Ghost Cloud** (`worlds/ghost-cloud`)
- Fixture:
  - `prod-assets`: css/site.css, img/logo.txt, index.html
  - `prod-logs`: 2026/01/app.log, 2026/02/app.log
  - `tmp-build-cache`: cache/a.txt, cache/b.txt
- `prod-*` buckets show a small shield.
- Plan: `aws s3 rb s3://prod-assets --force`
  - Verdict: block (`no-bucket-delete`).
  - Copy: `prod-assets` poofs and vanishes.
- Fixed plan (demo 03): `aws s3 rb s3://tmp-build-cache --force`
  - Verdict: pass.
  - Copy: `tmp-build-cache` vanishes.
- effectsOutside: none. Ghost Cloud reports a network effect only for `--endpoint-url`.
- No real mode exists. Never say that it runs for real.

**Narration** (keep the tone; adjust numbers to the recording)

Shell:
- "**Copy.** I wave my wand and copy `app.db` and your files. Reality stays exactly as it is."
- "**Run.** I type the agent's command on my copy… poof! 1,206 users are gone, but only in the copy."
- "**Judge.** Ward `no-data-loss` allows 0 lost rows. My copy lost 1,206. Nothing left the box."
- "**Verdict.** I blow the candle out: blocked. Reality's fingerprint still matches."
- "**Fix and go.** The agent backs up first and only marks users as deleted. 0 rows lost, so the candle is lit."

Hand:
- "**Copy.** I copy the arm, the drawer and the vase into 8 haunted variants: slippery, sticky, heavy, laggy…"
- "**Run.** Eight ghost arms try `fast pull` at once. One of them can't finish."
- "**Judge.** Ward `gentle-hands` needs 95% success. We got 7 of 8. The force and the vase were fine."
- "**Verdict.** I blow the candle out: blocked. The real arm stays still."
- "**Fix and go.** New plan: `slow pull, gentle grip`. All 8 ghosts succeed under 30 N, so the candle is lit."

Cloud:
- "**Copy.** I copy 3 buckets and 7 objects into memory. Nothing talks to AWS."
- "**Run.** I run the agent's command on my copy… poof! `prod-assets` and its 3 objects are gone, in the copy only."
- "**Judge.** Ward `no-bucket-delete` says never delete `prod-*`. Nothing left the box."
- "**Verdict.** I blow the candle out: blocked. The real `prod-assets` is untouched."
- "**Fix and go.** The agent meant the build cache. `tmp-build-cache` is not protected, so the candle is lit."

## 5. Style

- Cute Halloween:
  - rounded shapes and chunky 2 to 3 px borders
  - soft glows
  - sticker labels rotated 1 to 4 degrees
  - pastel accents on a deep purple night
- Palette:

  | Use | Color |
  |---|---|
  | night | `#110824` to `#24124a` |
  | pumpkin | `#ff8a3d`, `#ffb057` |
  | bone | `#f7f0e1` |
  | ghost mint | `#aef5df` |
  | blush | `#ff9ec7` |
  | slime | `#9be564` |
  | witch purple | `#b48cff` |
  | flame | `#ffd36b` |
  | red | `#ff6b7a` |
  | Kiro purple accent | `#9046ff` |

- Font: Fredoka, self-hosted through `@fontsource/fredoka` (OFL-1.1). Add it to the README licenses. The page makes no external requests.
- Characters are inline SVG components:
  - Ghost, our mascot. It is drawn in the spirit of Kiro's ghost: white body, a tail that sweeps to the lower left, tall oval eyes set toward the right, and a Kiro purple glow (`#9046ff`). Add pink blush and a small smile. It is original art: do not use or trace the Kiro logo. The Devpost rules forbid third-party trademarks without permission.
  - Skeleton (its bone color comes from a CSS variable so X-ray can recolor it)
  - three Costumes
  - Pumpkin, Candle (with a face), Cauldron, Bat, Moon
  - the eight part icons

  Decorative SVG is `aria-hidden`.

## 6. Motion and accessibility

- Motion:
  - Idle loops only: ghost bob, bat flap, cauldron bubbles, flame flicker, sparkles.
  - The scripted walkthrough in section 3 plays once per click or scroll-in.
  - Nothing flashes.
- Under `prefers-reduced-motion`, every loop stops, the X-ray demo does not auto-play, and the walkthrough shows its final state.
- X-ray is a real switch with a label.
- The walkthrough text is in a polite live region.
- Focus is visible on every control. Text contrast is at least 4.5:1.
- Everything on the page is in English (Devpost rule). On narrow screens the columns stack.

## 7. Out of scope for this run

- No changes to `ui/`, `core/`, `worlds/`, or `ghost-runner/`.
- No in-app "Skeleton view" toggles. They may come later.
- No deployment. The owner picks Cloudflare Pages or Netlify later.
- Allowed small change: a "Ghost Run+ home" link (relative `../`) in the header of each app.

## 8. Tests and checks

- Vitest and Testing Library:
  - every section renders
  - X-ray toggles the state and `aria-checked`
  - the world chips switch the scene
  - the step rail jumps to each scene
  - Reality never changes
  - the narration region updates
  - reduced motion gives the final state
  - the parts matrix matches the imports
  - the world-size script
  - the recorded runs match a fresh run
- A site check after the build:
  - every local link and asset in `site/dist` resolves
  - no external URLs
  - `_headers` scopes are correct
- Lint and typecheck like the other packages.

## 9. Docs

- **README:**
  - link to the site
  - add the Ghost Cloud row (3rd world, `worlds/ghost-cloud/`, built by world-smith) to the skeleton and apps table
  - add one line to "Not written by Kiro": "The landing page design draft (mockup) was made by Claude Code; Kiro built the page from it."
- **Devlog:** Claude Code adds the entry.

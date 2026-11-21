# Paged landing, kit showcase and shorter copy: design brief for Kiro

Draft 1, 2026-11-21. Claude Code wrote this brief and both mockups at the owner's request. Kiro builds them.

Visual references (self-contained HTML files):
- [`docs/design/paged-landing-mockup.html`](paged-landing-mockup.html) ("v6"): the landing page, split into pages that turn like a book.
- [`docs/design/kit-showcase-mockup.html`](kit-showcase-mockup.html): a new `/kit/` page that presents the UI kit. Its pictures are crops of the real kit parts. The real page renders the real parts.

**Text in this brief wins over text in the mockups.** The owner asked for less text everywhere. Section C is the copy deck: use it word for word.

## A. Paged landing

Split the landing page into five pages that the visitor turns one at a time, like a book. Today it is one long scroll.

| # | Page | Content |
|---|---|---|
| 1 | Cover | The hero |
| 2 | What's in the skeleton? | Today's section 1 (recipe) |
| 3 | One skeleton, three costumes | Today's section 2 (costumes, X-ray) |
| 4 | Watch the ghost work | Today's section 3: the live v5 walkthrough, unchanged apart from its copy |
| 5 | Make your own costume | Today's section 4 and the footer |

**Behavior.** Port it from the mockup's paging script and CSS.
- **Page bar** at the bottom, sticky:
  - "‹ Back"
  - five dots with short labels: Cover, Skeleton, Costumes, Ghost at work, Your own. The current dot is long and orange, and has `aria-current="page"`.
  - a counter, "2 / 5"
  - "Next" with the next page's title (mint button)
  - Back is disabled on page 1. Next is disabled on page 5.
- **Navigation:** the arrow keys and PageUp/PageDown turn pages, except while typing in an input. A horizontal swipe of more than 60 px turns pages on touch screens.
- **Turn effect:** the leaving page rotates away around its left edge (about 0.75 s, the mockup's keyframes `turnOut`, `turnIn`, `pageIn`). Under `prefers-reduced-motion` pages switch at once.
- **One page at a time:**
  - Only the current page is in the layout and in the accessibility tree; set `inert` on the others.
  - A polite live region announces "Page 2 of 5: What's in the skeleton?".
  - Each page is at least the visible window height minus the nav and the page bar (use `svh`). A taller page (section 3 on a phone) scrolls inside the window. The page bar stays visible.
- **Addresses:** each page has a hash (`#cover`, `#recipe`, `#costumes`, `#run`, `#make`). Opening a hash opens that page, and turning a page updates the hash. The hero buttons and the in-page links (`#recipe`, `#run`, `#make`) turn to their page. Nav "Home" opens page 1. The other nav links go to the apps and the kit as today.
- **Per-page start:**
  - The X-ray peek on page 3 starts when page 3 first opens.
  - The walkthrough autoplay on page 4 starts when page 4 first opens. This replaces the scroll trigger, but the engine still loads lazily.
  - Nothing heavy loads before its page is near: the Shell engine may preload when page 3 opens.
- **Unchanged:** the content of each section apart from the copy deck, the live engines, the policy, the parity tests, and the recorded-run fallback.

## B. Kit showcase at `/kit/`

Today `/kit/` is the developer gallery from `ui/gallery`, a dense catalog. Replace it in the site with a showcase page built by the site package. Port the mockup's layout and CSS:

1. **The hero:** kicker, headline, one line, two chips, and the ghost with the six part icons around it.
2. **Six part cards**, linking down the page: Mirror world, Candle, Blacklight, Red thread, Graveyard, Lights on.
3. **One row per part**, alternating left and right. Each row has short text and a "device frame" holding the **real** kit component from `@ghost-run/ui`. Feed it with the sample data the developer gallery already uses: reuse it and do not change `ui/`. The rows' controls:
   - Candle: state tabs Pass, Warn, Block, Unknown, No verdict.
   - Blacklight: its own switch, off and on.
   - Mirror world: a Dark / Lights on toggle that switches the kit's real lights-on theme for that frame.
   - Lights on: the dark and light candles side by side.
   - Base controls: a small last row.
4. **A footer** with the link "Developer gallery →".

**Rules.**
- Keep the developer gallery, assembled at `/kit/gallery/`.
- `ui/` is not changed.
- The kit parts look exactly as they do in the apps; only the page around them is new.
- The showcase page gets the same strict policy as `/`. No `'unsafe-eval'` is needed.
- The nav has "UI Kit" as the current page.
- Reuse the landing page's palette, Fredoka, symbols and motion rules. The ghost bob stops under reduced motion.

## C. Copy deck

Use these texts word for word. Do not add others. Remove the texts that this deck drops (folder paths, the long explanations).

### Page 1, Cover
- Kicker: "🎃 Kiroween 2026 · Skeleton Crew"
- H1: "Let your agent's ghost try it first."
- Text: "A Kiro template where a ghost tries risky plans on a copy first. **One skeleton, three costumes.**"
- Buttons: "Meet the skeleton" and "Watch the ghost work"

### Page 2, What's in the skeleton?
- Sub: "Your world + the skeleton = a ghost-run app."
- Your world card:
  - Title "Your world", sub "Six functions."
  - The rows:

    | Function | Hint |
    |---|---|
    | snapshot | copy reality |
    | step | try one action |
    | diff | what changed |
    | render | draw it |
    | fingerprint | prove reality is untouched |
    | effectsOutside | what leaves the box |

  - Sticker: "That's all. Ghost Cloud is about N lines." N comes from the world-size data.
- The skeleton card:
  - Title "The skeleton", sub "Ready-made and wired."
  - The parts, with **no folder lines**:

    | Part | Line |
    |---|---|
    | Mirror | Copy and compare |
    | Ghost | Try the plan on the copy |
    | Wards | Rules that say no |
    | Candle | Go, ask, or stop |
    | Blacklight | Find hidden instructions |
    | Graveyard | Remember stopped plans |
    | Kiro hook | Stop risky commands in Kiro |
    | world-smith | A Kiro agent that builds worlds |

  - Bottom: one chip, "Built from 6 Kiro specs", whose title attribute lists the six spec names.
- Result card: title "Your ghost-run app", text "Copy → try → judge → candle."

### Page 3, One skeleton, three costumes
- Sub: "Same skeleton, new costume. Flip on X-ray."
- Each card:
  - name
  - a costume tag: "Hacker hoodie", "Robot suit", "Cloud + bucket hat"
  - a world line: "Files + SQLite", "Robot arm, 8 haunted copies", "S3 buckets in memory"
  - the part chips
  - the Kiro line: "Kiro spec: ghost-shell", "Kiro spec: ghost-hand", "Kiro agent: world-smith"
  - the button, as today
- Drop the "Skeleton parts on its screen" header and the folder names.
- One legend under the cards: "Crossed out = not on that app's screen."

### Page 4, Watch the ghost work
- Sub: "Give the ghost a plan. It tries it on a copy first."
- Everything else stays, including the narration.

### Page 5, Make your own costume
- Sub: "Write six functions, or let a Kiro agent help."
- Spellbook title: "📖 A world in six functions"
- Agent card:
  - title "Ask world-smith"
  - text "A Kiro agent that writes the world with you and runs the checks."
  - the command
  - "🎃 Ghost Cloud was made this way."
- Footer as today, plus a small "Third-party notices" link.

### Kit showcase
- Kicker: "🦴 The skeleton's screen kit"
- H1: "Every ghost-run app wears the same screens."
- Text: "Worlds bring the data. The kit draws it, and never decides."
- Chips: "Used by Ghost Shell and Ghost Hand" and "11 render rules"
- Cards:

  | Card | Line |
  |---|---|
  | Mirror world | Reality vs. the copy |
  | Candle | Go, ask, or stop |
  | Blacklight | Hidden letters glow |
  | Red thread | Step → cause |
  | Graveyard | Stopped plans rest here |
  | Lights on | Same screens, light theme |

- Rows, each a lead line plus at most two bullets:

  | Row | Lead | Bullets |
  |---|---|---|
  | Mirror world | "Reality vs. the ghost's copy, change by change." | "Losses in red." / "Secret-like fields hidden." |
  | Candle | "The verdict at a glance." | "Pass: lit · Warn: flickering · Block: out" / "Claims show what this run proved." |
  | Blacklight | "Turn it on: hidden letters glow." | "Zero-width, direction marks, HTML comments." |
  | Red thread | "From the blocked step to its cause." | "Literal matches only. Not found is not safe." |
  | Graveyard | "Every stopped plan rests here." | "Open a tombstone for the seance." |
  | Lights on | "Same screens for bright rooms." | "Colors keep their meaning." |
  | Base controls | "Buttons and inputs that fit the kit." | none |

- Footer: "The kit lives in `ui/`." and the link "Developer gallery →".

## D. Tests and checks

**Paging:**
- page order and labels
- Next and Back limits
- keyboard (ignored while typing in an input)
- swipe
- hash in and out
- `inert` on hidden pages
- the live-region text
- reduced motion switches at once
- autoplay and X-ray start on page entry and only once
- nothing heavy loads before its page is near

**Copy:**
- a test pins every string of section C
- a test fails when a dropped text (for example a folder line under the skeleton parts) comes back

**Kit showcase:**
- it renders the real kit components
- the candle tabs switch the real component's state
- the theme toggle switches the real theme
- the policy has no `'unsafe-eval'`
- `/kit/gallery/` still works

**Gates:**
- the site check covers the new paths
- `corepack pnpm build:site`
- the site check
- the site tests, typecheck and lint

**Owner's review:** Claude Code compares the built pages with both mockups in Chrome at 390, 920 and 1280 px.

## E. Out of scope

- No changes to `apps/`, `worlds/`, `core/` or `ui/`.
- No new engines.
- No deployment. Claude Code redeploys after review.

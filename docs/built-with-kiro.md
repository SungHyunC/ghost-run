# Ghost Run+: Built with Kiro

What Kiro produced in this repository, with counts. Part of [Ghost Run+](../README.md).

## Built with Kiro

Everything below is in this repository.

**Specs** (`.kiro/specs/<name>/` with `requirements.md`, `design.md`, and `tasks.md`). "Tasks" is the number of checked items out of all checklist items in `tasks.md`: every line that matches `^\s*- \[[ xX]\]\*? ` counts, whether it is a task group or a sub-task, and whether it is marked optional with `*`. "Properties" is the number of numbered property headings in `design.md`: lines that match `^### Property [0-9]+`. Headings that only start with the word "Property" are not properties and are not counted: "### Property-based tests" in `possession` and "### Property run sizes and the 60-second budget" in `ui-kit`. For `ghost-cloud`, whose `design.md` has no such headings, it is the number of numbered rows in the table under "Correctness Properties". Counts were taken from the files on 2026-11-26.

**Totals:** 14 specs, 927 of 932 checklist items checked, and 204 properties. The 5 open items are tasks 19, 19.2, and 20 of `kiro-integration` (the gate's daily approval count and the final checkpoint) and tasks 21 and 21.1 of `ghost-hand` (the optional forbidden-contact red thread).

| Spec | What it decided | Tasks | Properties |
|---|---|---|---|
| `core-contract` | The `World<S, A>` contract with six functions and the safety contract | 15 of 15 | 8 |
| `possession` | The blacklight scan for hidden Unicode, the red thread, and the P7 claim | 65 of 65 | 22 |
| `wards` | The judging rules, the `wards.yaml` format, the parser in `wards-config`, and the block message | 65 of 65 | 17 |
| `ghost-runner` | The Docker box (`--network none`, copy-only mount), Repo_World, and Plan B | 102 of 102 | 22 |
| `ui-kit` | The shared screens and their render properties | 87 of 87 | 11 |
| `kiro-integration` | The five hooks, the MCP server, and the power | 153 of 156 | 24 |
| `ghost-shell` | App 1: the playground page and the playground world | 80 of 80 | 26 |
| `ghost-hand` | App 2: the MuJoCo arm page, the drawer-arm world, and the 8 haunted variants | 103 of 105 | 23 |
| `world-smith` | The `world-smith` agent | 9 of 9 | none |
| `ghost-cloud` | The third world: an S3-compatible object store driven by AWS CLI lines, with wards for protected and public buckets | 43 of 43 | 17 |
| `starter-world` | The smallest world: a to-do list, one `path` ward, and a one-command demo | 16 of 16 | none |
| `site` | The public landing page and the build that assembles `site/dist/` | 67 of 67 | 12 |
| `site-live` | The live "Watch the ghost work" demo in the browser, in place of recorded replays | 56 of 56 | 12 |
| `site-pages` | The paged landing page, the kit showcase at `/kit/`, and the shorter copy | 66 of 66 | 10 |

`.kiro/specs/_new-world/` is the fill-in template for a new world, not a real spec, so it has no counts. The unchecked tasks are still open.

**Steering** (`.kiro/steering/`): `product.md`, `structure.md`, `tech.md`, `security.md`, `world-contract.md`, and `halloween-ui.md`. The `halloween-ui.md` file applies only to `ui/**` and `apps/**`.

**Hooks** (`.kiro/hooks/`, state as committed):

| Hook | Trigger | State |
|---|---|---|
| `ghost-gate` | Pre Tool Use (`shell`, `write`) | disabled |
| `ghost-log` | Post Tool Use | disabled |
| `contract-pbt` | File Save in `core/**` and `worlds/**` | disabled |
| `world-scaffold` | File Create in `worlds/*/` | disabled |
| `blacklight-steering` | File Save in `.kiro/**` | disabled |
| `docker-warmup` | Pre Tool Use (`shell`) | disabled |
| Probe hooks (`probe-host-facts.json`) | Record host facts of tool events | disabled |

The files `exp-b-block-rm-rf.json`, `exp-b-log-write.json`, and `probe-ask.json` are experiment hooks and are disabled. The scripts are in `integrations/kiro-hook/`. The gate is switched on by a human, as described in [kiro-integration.md](kiro-integration.md).

**MCP server**: `integrations/mcp/` is the stdio server `ghost-run` with the tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, and `blacklight`.

**Power**: `integrations/power/` has `plugin.json`, the skill `skills/ghost-run/SKILL.md`, and `mcp.json` for the bundled server.

**Custom agent**: `.kiro/agents/world-smith.json` (see [build-a-world.md](build-a-world.md)).

**Property-based tests**: the properties of the table above are tested with vitest and fast-check. The safety contract properties P1 to P8 are defined in `.kiro/steering/world-contract.md`.

**Plan revision recorded with the Kiro CLI**: the revised Ghost Hand plan `apps/ghost-hand/plans/revised.plan.json` was decided by a Kiro CLI 3.4.0 session (model Auto, 2026-11-18). It ran the first plan, read the block message, and chose the grasp force and pull values over several attempts. The attempts and messages are in `docs/measurements.md`, section "Plan revision recording".

**Not written by Kiro**: the Ghost Shell page design was written with Claude Code on 2026-11-20 at the owner's request: the hero, the animated ghost flow (`apps/ghost-shell/src/flow/`), the mirror stage picture of reality and the ghost copy (`apps/ghost-shell/src/stage/`), the Korean page (`apps/ghost-shell/ko.html`, `apps/ghost-shell/src/i18n/`), the scenario cards, the page texts in `apps/ghost-shell/src/page-texts.ts`, the stylesheet `apps/ghost-shell/src/page.css`, and their tests. The judging pipeline, the playground world, the ui kit components, and every spec, hook, and steering file stay as Kiro wrote them. The Ghost Hand page design was also written with Claude Code on 2026-11-20 at the owner's request: the layout, the scenario rail, the ghost lineup (`apps/ghost-hand/src/components/GhostLineup.tsx`), the angled camera preset, and the stylesheet `apps/ghost-hand/src/page.css`; the drawer-arm world, the pipeline, and the claim texts stay as Kiro wrote them. The landing page design draft (mockup) was made by Claude Code, and Kiro built the page from it. The live-walkthrough mockup (v5) was made by Claude Code; Kiro built it. The paged landing mockup (v6) and the kit showcase mockup were made by Claude Code; Kiro built them. The page-turn prototype (`docs/design/page-turn-prototype.html`) was made by Claude Code at the owner's request; the owner chose option B; Kiro built it.

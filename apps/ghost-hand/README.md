# Ghost Hand

Ghost Hand is App 2 of Ghost Run+. It is a static web page (no server, no LLM, no API key) for someone who wants to check a robot arm's plan before a real arm runs it. A MuJoCo simulation (WebAssembly, in this tab) runs the plan on a base copy of a drawer scene and on 8 haunted variants (changed friction, mass, handle offset, sensor noise, and command delay). A ward judges the results. The candle goes out if a ghost touches the vase or pulls too hard, and the arm stays still.

The "real" arm on this page is a reference simulation. No physical hardware is involved, and nothing here claims anything about hardware.

## Run it

From the repository root:

```
corepack pnpm --filter "@ghost-run/ghost-hand^..." build
corepack pnpm --filter @ghost-run/ghost-hand dev
```

The first command builds the workspace packages the app depends on. The second starts Vite on `http://localhost:5173/`. The page needs a secure context (https or localhost) for Web Crypto.

Other scripts: `test`, `typecheck`, `lint`, `build`, `build:node` (the `ghost-hand-run` command in `dist-node/`), and `test:dist`.

## How it is built

- Skeleton parts: `ghostRun` and `WardEngine` from `@ghost-run/core` run and judge the plan (`src/pipeline/run.ts`). The page uses the UI kit `@ghost-run/ui` for the candle, the graveyard, the seance view, and the display escaper. The wards file is parsed with `@ghost-run/wards-config`.
- World: `@ghost-run/drawer-arm` in `worlds/drawer-arm/`. It implements the six functions of the `World` contract on a MuJoCo drawer, arm, and vase scene, and holds the haunted-variant ranges (`variant-config.json`).
- Ward: `gentle-hands` (kind `physics`) in `worlds/drawer-arm/wards.yaml`. It sets a minimum success rate of 0.95, a contact force limit of 30 N, and the vase as a forbidden contact.
- Plans: `plans/first.plan.json` (`fast pull`, blocked) and `plans/revised.plan.json` (`slow pull, gentle grip`, passes). `Play demo` runs the first plan, shows the block, loads the revised plan, runs it, and enables `Execute on reference arm`.
- Reference arm: `Execute on reference arm` moves the live reference state once for each passing run. After the arm moves, after a reset, or after a seed change, the ghosts must run again before the next execution.
- Overlay: the 3D ghost arms are drawn with Three.js in `src/overlay/`. Failed ghosts are red.
- CLI: `ghost-hand-run <plan.json> --wards <wards.yaml>` runs the same pipeline from a terminal (`src/cli/`).

## Tests, claims, and limits

`corepack pnpm --filter @ghost-run/ghost-hand test` runs the model, DOM, and CLI tests, including the property tests. The browser harness is in `tests/browser/`.

What the page claims, the tested environments (Chrome 157 only), and the measured numbers are in [docs/ghost-hand.md](../../docs/ghost-hand.md). The libraries and their licenses are in [docs/dependencies.md](../../docs/dependencies.md).

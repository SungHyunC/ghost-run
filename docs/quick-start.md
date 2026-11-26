# Ghost Run+: Quick start

Install, build, run the apps and the tests, and run Ghost Hand from the terminal. Part of [Ghost Run+](../README.md).

## Quick start

Tested on Node.js 20.20.2, macOS, Apple M1. Linux is supported and Windows is unverified.

Needed:

- Node.js 20 or later and `corepack` (every command below uses `corepack pnpm`; the pnpm version is pinned in `package.json`).
- Docker, only for the real-mode box. Without Docker the runner falls back to Plan B (static analysis only), which does not claim P1.
- Chrome, for Ghost Hand. Chrome 157 is the only tested browser.

Install:

```
corepack pnpm install --frozen-lockfile
```

Open Ghost Shell (static page, no server logic; serves `http://localhost:4173/`, and the Korean page at `http://localhost:4173/ko.html`):

```
corepack pnpm --filter "@ghost-run/ghost-shell..." build
corepack pnpm --filter @ghost-run/ghost-shell preview
```

Open Ghost Hand (Vite dev server, `http://localhost:5173/`):

```
corepack pnpm --filter "@ghost-run/ghost-hand^..." build
corepack pnpm --filter @ghost-run/ghost-hand dev
```

Both addresses are the Vite defaults; Vite picks another port when one is busy. The apps import `core`, `ui`, and `wards-config`, which export `dist` files that are not committed, so build them first. The suffix `...` makes the filter match the package and everything it depends on, and `^...` matches only the dependencies. Both pages answered HTTP 200 on 2026-11-26 in a fresh clone of commit 8c31d98 after `corepack pnpm install --frozen-lockfile`.

Run every test, one package at a time:

```
corepack pnpm test
```

The root `test`, `typecheck`, and `lint` scripts run the 13 packages one after another and keep going after a failure. Running them in parallel (`pnpm -r test`) made some time-limited tests fail under load. The full `corepack pnpm test` took 798 s (about 13 min 18 s) at commit `7c6e39a` on 2026-11-25 on an Apple M1 Mac with Docker running. All 12 packages passed: 4,580 tests passed, 11 were skipped, and none failed. Per-package numbers are in the section "Check A at 7c6e39a (2026-11-25)" at the end of `docs/measurements.md`. `corepack pnpm typecheck` took 21.9 s and `corepack pnpm lint` 8.3 s, both with exit code 0. One package alone: `corepack pnpm --filter @ghost-run/ui test`.

Build the Docker box image for real-mode runs:

```
corepack pnpm --filter @ghost-run/ghost-runner box:build
```

The image tag carries a hash of the box files. With the image already built, the command finished in 2.4 s. The first build downloads Debian packages and needs network access. Details are in [ghost-runner/README.md](../ghost-runner/README.md).

Run Ghost Hand from the terminal with `ghost-hand-run`:

```
corepack pnpm --filter "@ghost-run/ghost-hand^..." build
corepack pnpm --filter @ghost-run/ghost-hand build:node
cd apps/ghost-hand
node dist-node/cli.js plans/first.plan.json --wards ../../worlds/drawer-arm/wards.yaml
node dist-node/cli.js plans/revised.plan.json --wards ../../worlds/drawer-arm/wards.yaml
node dist-node/cli.js validate plans/revised.plan.json
```

The first plan prints `GHOST RUN BLOCKED by ward gentle-hands` and exits with code 2. The revised plan prints `GHOST RUN PASSED: all 1 ward cleared.` and exits with code 0. `validate` exits with 0 for a valid plan file and 65 for an invalid one.

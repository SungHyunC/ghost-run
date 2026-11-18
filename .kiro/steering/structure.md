---
inclusion: always
---

# Project Structure

```
ghost-run/
├─ core/                    # World contract, ghost runner, wards engine,
│                           # possession detector, blacklight checker.
│                           # core/src/judge/: path normalizer, glob matcher,
│                           # host matcher, content inspector, message builder
│                           # (pure and dependency-free)
├─ wards-config/            # Separate workspace package (@ghost-run/wards-config):
│                           # wards.yaml parser, validator, printer.
│                           # Not under integrations/. Depends on core/ only
│                           # (wards-config -> core)
├─ ui/                      # Shared UI kit: mirror world, candle verdict,
│                           # blacklight toggle, red-thread trace, graveyard,
│                           # lights-on mode
├─ ghost-runner/            # Separate workspace package (@ghost-run/ghost-runner):
│                           # Docker box runner, Repo_World, Plan B static analysis.
│                           # Depends on core/ only (ghost-runner -> core)
├─ integrations/
│  ├─ kiro-hook/            # ghost-gate.mjs  (Pre Tool Use — block)
│  │                        # ghost-log.mjs   (Post Tool Use — record)
│  ├─ mcp/                  # ghost-run MCP server
│  └─ power/                # plugin.json, skills/ghost-run/, mcp.json
├─ apps/
│  ├─ ghost-shell/          # App 1: shell/SQL ghost execution + playground
│  │                        # wards.yaml: default Ghost Shell wards file
│  └─ ghost-hand/           # App 2: browser MuJoCo robot arm variants
│                           # 3D ghost overlay (Three.js)
│                           # Node entry point (headless run)
├─ worlds/                  # Drop-in folder for additional World implementations
│  └─ drawer-arm/           # Robot arm world for Ghost Hand
│                           # wards.yaml: drawer-arm wards file
├─ docs/
│  ├─ plan.md               # Internal product spec (gitignored)
│  ├─ devlog.md             # Daily one-line dev log + graveyard stats
│  └─ GhostRun_*.png        # Diagrams (gitignored)
├─ .kiro/
│  ├─ steering/             # Always committed
│  ├─ specs/
│  └─ hooks/
├─ LICENSE                  # MIT — present from first commit
└─ README.md
```

## Dependency Direction

- `apps/*` and `integrations/*` may depend on `core/` and `ui/`.
- `apps/*` may depend on `worlds/*`, `ui/`, `wards-config/`, and `core/`.
- `worlds/*` may depend on `core/` only, plus the runtime libraries of the world itself (for example `@mujoco/mujoco`, `sql.js`).
- `ui/` may depend on `core/`.
- `ghost-runner/` is a separate workspace package (not under `integrations/`). It may depend on `core/` only (`ghost-runner -> core`), through the public entry point of `@ghost-run/core`.
- `wards-config/` is a separate workspace package (not under `integrations/`). It may depend on `core/` only, through the public entry point `@ghost-run/core`.
- `integrations/*` may also depend on `ghost-runner/` and `wards-config/`, only through their public entry points. `integrations/mcp` may depend on `integrations/kiro-hook` only through its `index.mjs`.
- `core/` must not import `ghost-runner/` or `wards-config/` (enforced by an ESLint `no-restricted-imports` rule).
- `core/` must not depend on any other folder in this repository.

## World Contract (`core/`)

A World implementation has four **primary** functions and two **auxiliary** functions.

**Primary (every world must implement):**

```ts
interface World<S, A> {
  snapshot(): Promise<Snapshot<S>>;                        // copy current state; reality unchanged
  step(s: Snapshot<S>, a: A): Promise<Snapshot<S>>;        // apply one action to the copy
  diff(before: Snapshot<S>, after: Snapshot<S>): Change[]; // what changed
  render(s: Snapshot<S>): Scene;                           // what to draw
}
```

**Auxiliary (used by safety-contract PBT and the wards engine):**

```ts
  fingerprint(): Promise<string>;   // reality fingerprint for P1 isolation check
  effectsOutside(a: A): Effect[];   // out-of-box side effects for warn verdict
```

A new world implements all six; it inherits the ghost runner, wards engine, possession detector, and UI kit automatically.

## Wards (`wards.yaml`)

Guards are declared in `wards.yaml`, not in code. Each ward has an `id`, a `kind` (`path`, `sql`, `egress`, `physics`), and kind-specific rules. The wards engine reads this file at runtime.

## Verdict (Candle)

- `pass` — all wards cleared; real execution proceeds
- `warn` — out-of-box side effect detected; human approval required
- `block` — a ward was violated; agent receives ward id, numbers, and a seance link

## What Goes Where

- **New world** → `worlds/<name>/` (world-scaffold hook populates boilerplate)
- **Shared UI** → `ui/`
- **App-specific UI** → `apps/<name>/`
- **3D ghost overlay** → `apps/ghost-hand/`
- **Docker box runner, Repo_World, static (Plan B) analysis** → `ghost-runner/` (its own workspace package, not under `integrations/`; depends on `core/` only)
- **wards.yaml parsing, validation, and printing** → `wards-config/` (its own workspace package, not under `integrations/`; depends on `core/` only)
- **Default Ghost Shell wards** → `apps/ghost-shell/wards.yaml`
- **Hook scripts** → `integrations/kiro-hook/` (`.mjs`, Node 20+, no LLM calls)
- **MCP tools** → `integrations/mcp/`
- **Kiro power files** → `integrations/power/`

## Hook Responsibilities

| Hook | Trigger | Constraint |
|---|---|---|
| `ghost-gate` | Pre Tool Use (`shell`, `write`) | No LLM calls; must finish within 60 s; loads wards through `wards-config` |
| `ghost-log` | Post Tool Use | — |
| `contract-pbt` | File Save in `core/**`, `worlds/**` | — |
| `world-scaffold` | File Create in `worlds/*/` | — |
| `blacklight-steering` | File Save in `.kiro/**` | — |

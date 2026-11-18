---
inclusion: always
---

# Tech Stack

## Language & Monorepo

- **TypeScript** throughout — `core/`, `ui/`, `apps/*`, `integrations/*`
- **pnpm workspaces** for monorepo management

## Frontend

- **Vite + React** — UI kit and both apps
- **Three.js** — 3D ghost-arm overlay in Ghost Hand

## Physics (App 2)

- **`@mujoco/mujoco`** — official Google DeepMind JS/WASM bindings. Still marked experimental upstream; always call `.delete()` on wrapped C++ objects.

## Browser DB (Playground)

- **sql.js** (SQLite compiled to WASM) — DB world in the playground, no server needed

## Testing

- **vitest** — test runner
- **fast-check** — property-based testing for the eight safety-contract properties (P1–P8)

## MCP

- **`@modelcontextprotocol/sdk`** — `ghost-run` MCP server exposing `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, `blacklight`

## Isolation Box

- **Docker** (`--network none`, copy-only mount) — real-mode ghost execution
- Fallback: static command analysis (Plan B) when Docker is unavailable; P1 is **not** claimed in fallback mode
- Fast copy: `cp -c` (macOS APFS clone) / `cp --reflink=auto` (Linux); exclude `node_modules`

## Third World (Optional)

- **moto server mode** (Python, Apache-2.0) — fake AWS for Ghost Cloud in real mode

## Hosting

- **Ghost Hand** uses only the single-thread MuJoCo build (with Web Workers) and needs no COOP or COEP header. The multi-thread build and `SharedArrayBuffer` are not used. It runs on any static host, including GitHub Pages.
- **Cloudflare Pages** or **Netlify** (free tier) — required for any other app that needs COOP/COEP headers (for example a multi-threaded MuJoCo WASM build)
- GitHub Pages = single-threaded build only

## Target OS

- Developed on macOS (Apple Silicon); supported on macOS and Linux
- Windows: unverified — document limitations in README

---

## Dependency Rules

- **New code only.** All code in this repository must be written after 2026-10-30. Do not import or copy pre-existing code; list every library used in the README.
- **No LLM calls inside hooks.** Hook scripts must complete within 60 seconds and must not call any LLM API.
- **Hooks that run on every save must use Shell Command action** (runs locally, no Kiro credits consumed). Use Agent Prompt action only for hooks that run rarely.
- **Playground must be static** — no server, no API keys, no runtime LLM cost.
- **Fake secrets only** — `.env` values in tests and demos are canary values; never commit real credentials.
- **All repository artifacts must be in English.** This includes code, inline comments, spec files, steering docs, and README. The plan doc (`docs/plan.md`) is the only exception.
- **License check on day one** — confirm the license of every new dependency and add it to the README table before merging.
- **Audio/icons** — only original or CC0 assets; list sources in README.

# Ghost Run+: Dependencies and data

Every library, data file, and asset, with its version and license. Part of [Ghost Run+](../README.md).

## Dependencies and data

| Name | Version | Use | License |
|---|---|---|---|
| Unicode `emoji-data.txt` (Extended_Pictographic) | 16.0.0 (Emoji 16.0) | Source for generated numeric tables. URL: https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt | Unicode License v3 (Unicode-3.0), https://www.unicode.org/license.txt |
| Unicode `emoji-sequences.txt` (RGI_Emoji_Tag_Sequence) | 16.0.0 (Emoji 16.0) | Source for generated numeric tables. URL: https://www.unicode.org/Public/emoji/16.0/emoji-sequences.txt | Unicode License v3 (Unicode-3.0), https://www.unicode.org/license.txt |
| fast-check | 4.10.2 | Dev dependency, property-based tests | MIT |
| vitest | 3.2.7 | Dev dependency, test runner | MIT |
| vite-node | 3.2.4 | Dev dependency of `worlds/starter`, runs the demo script | MIT |
| typescript | 5.9.3 | Dev dependency, compiler | Apache-2.0 |
| @types/node | 20.19.43 | Dev dependency, Node type definitions | MIT |
| @mujoco/mujoco | 4.0.1 | Runtime dependency of `apps/ghost-hand` and `worlds/drawer-arm`, MuJoCo physics (WebAssembly) | Apache-2.0 (`package.json` license field; the tarball has no LICENSE file) |
| three | 0.187.0 | Runtime dependency of `apps/ghost-hand`, 3D ghost-arm overlay | MIT |
| react | 19.3.1 | Runtime dependency of `apps/ghost-hand`, UI | MIT |
| react-dom | 19.3.1 | Runtime dependency of `apps/ghost-hand`, UI | MIT |
| @types/three | 0.187.0 | Dev dependency of `apps/ghost-hand`, three type definitions | MIT |
| @types/react | 19.3.0 | Dev dependency of `apps/ghost-hand`, React type definitions | MIT |
| @types/react-dom | 19.3.0 | Dev dependency of `apps/ghost-hand`, React DOM type definitions | MIT |
| @testing-library/react | 16.3.3 | Dev dependency of `apps/ghost-hand`, component tests | MIT |
| jsdom | 26.1.0 | Dev dependency of `apps/ghost-hand`, test DOM | MIT |
| vite | 7.3.8 | Dev dependency of `apps/ghost-hand`, dev server and build | MIT |
| eslint | 10.15.0 | Dev dependency of `apps/ghost-hand` and `worlds/drawer-arm`, linter | MIT |
| typescript-eslint | 8.73.0 | Dev dependency of `apps/ghost-hand` and `worlds/drawer-arm`, TypeScript lint rules | MIT |
| yaml (eemeli) | 2.9.1 | Runtime dependency of `wards-config`, YAML 1.2 parser with source ranges for `wards.yaml` | ISC |
| sql.js | 1.16.0 | Runtime dependency of `apps/ghost-shell` and `worlds/playground-shell`, SQLite compiled to WebAssembly for the playground database | MIT |
| @modelcontextprotocol/sdk | 1.32.2 | Runtime dependency of `integrations/mcp`, MCP server and stdio transport for the `ghost-run` server (Node.js 18 or later) | MIT |
| zod | 4.6.7 | Runtime dependency of `integrations/mcp`, input schemas of the MCP tools (SDK peer range `^3.25 || ^4.0`) | MIT |
| esbuild | 0.28.2 | Dev dependency of `integrations/mcp`, builds the single-file server bundle of the Kiro power (`pnpm --filter @ghost-run/mcp bundle`; the bundle is committed). Published 2026-08-08, license read from the installed `package.json` on 2026-11-18 | MIT |
| shell-quote | 1.12.0 | Runtime dependency of `ghost-runner`, shell command parsing | MIT |
| @types/shell-quote | 1.7.5 | Dev dependency of `ghost-runner`, shell-quote type definitions | MIT |
| Node.js (base image `node:20-bookworm-slim`) | v20.20.2 | Box package of `ghost-runner`, in-box recorder runtime (not shipped on the host) | MIT |
| strace | 6.1-0.1 | Box package of `ghost-runner`, system call recording | LGPL-2.1-or-later |
| sqlite3 | 3.40.1-2+deb12u2 | Box package of `ghost-runner`, read-only row counts | Public domain |
| curl | 7.88.1-10+deb12u15 | Box package of `ghost-runner` | curl license |
| openssl | 3.0.22-1~deb12u1 | Box package of `ghost-runner`, box-only CA at image build time | Apache-2.0 |
| ca-certificates | 20250419~deb12u1 | Box package of `ghost-runner` | GPL-2.0-or-later (scripts), MPL-2.0 (certificate data) |
| @eslint-react/eslint-plugin | 5.30.3 | Dev dependency of `ui`, React lint rules | MIT |
| eslint-plugin-react-hooks | 7.1.1 | Dev dependency of `ui`, hooks lint rules | MIT |
| @testing-library/dom | 10.4.2 | Dev dependency of `ui`, DOM queries for component tests | MIT |
| @testing-library/user-event | 14.6.12 | Dev dependency of `ui`, simulated user input in component tests | MIT |
| @vitejs/plugin-react | 5.2.0 | Dev dependency of `ui`, Vite React plugin | MIT |
| axe-core | 4.14.1 | Dev dependency of `ui`, accessibility audit in tests (not shipped) | MPL-2.0 |
| `core` (`@ghost-run/core`) | 0.0.0 | no runtime dependencies (`core/package.json` has no `dependencies` field) | MIT (this repository) |
| Fonts, icons, and assets of `ui` | none | Icons, flame, smoke, and tombstone shapes are original SVG paths written in `ui/` as code (MIT). Fonts: none, system stacks only. Audio: none | MIT (this repository) |
| Fonts, icons, and assets of `apps/ghost-hand` | none | The app uses only primitive shapes and system fonts | none |
| @fontsource/fredoka | 5.3.0 | Runtime dependency of `site`, self-hosted Fredoka font files (weights 400 to 700, latin subset) for the landing page | OFL-1.1 (`package.json` license field) |
| sql.js | 1.16.0 | Bundled into the landing page (`site/src/live/`, SQL worker and `sql-wasm` file) for the live Ghost Shell walkthrough | MIT (`package.json` license field) |
| @mujoco/mujoco | 4.0.1 | Bundled into the landing page (Ghost Hand engine chunk, simulation worker, and `mujoco` wasm file), loaded only when Ghost Hand is picked | Apache-2.0 (`package.json` license field; the tarball has no LICENSE file) |
| yaml (eemeli) | 2.9.1 | Bundled into the landing page through `@ghost-run/wards-config` (parses the wards of the live runs) | ISC (`package.json` license field) |
| `site/public/favicon.svg` | n/a | Favicon of the landing page, an original ghost drawn for this project | MIT (this repository) |
| Other fonts, icons, images, and audio of `site` | none | The landing page has no audio and no font, icon, or image asset besides Fredoka and the favicon. Its icons and art are inline SVG paths written in `site/src/` | MIT (this repository) |

Notes for the Ghost Hand rows:

- fast-check, vitest, typescript, and @types/node (rows above) are also dev dependencies of `apps/ghost-hand` and `worlds/drawer-arm`, at the same installed versions.
- The `@mujoco/mujoco` `package.json` license field says Apache-2.0, but the published tarball contains no LICENSE file.
- The MuJoCo WebAssembly file bundles components with their own licenses. They are listed in `docs/research.md`: Qhull, tinyxml2, tinyobjloader, libccd, miniz, and lodepng. The third-party notices file is `dist/THIRD_PARTY_NOTICES.txt`, generated by the build of `apps/ghost-hand` (see [ghost-hand.md](ghost-hand.md)).

Notes for the site rows:

- `site` (`@ghost-run/site`) is the landing page. Versions and licenses were read from the installed `package.json` files.
- Runtime dependencies of `site`: `react` 19.3.1 (MIT), `react-dom` 19.3.1 (MIT), and `@fontsource/fredoka` 5.3.0 (OFL-1.1), plus `sql.js` 1.16.0 (MIT), `@mujoco/mujoco` 4.0.1 (Apache-2.0), and `yaml` 2.9.1 (ISC), which the live walkthrough bundles. The workspace packages it imports (`@ghost-run/core`, `@ghost-run/wards-config`, and the three world packages) are MIT and part of this repository. Versions and licenses were read from the installed `package.json` files on 2026-11-21. `site/dist/THIRD_PARTY_NOTICES.txt` is generated at assembly from the packages that the landing bundle and its engine chunks hold (`site/build/bundled-packages.json`), with the license texts read from the installed packages, plus the components compiled into `mujoco.wasm`; the site check fails when a bundled package is missing from it.
- Development dependencies of `site`, all in the table above at the same installed versions: `typescript`, `eslint`, `typescript-eslint`, `@types/node`, `vite`, `@vitejs/plugin-react`, `vitest`, `fast-check`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@types/react`, `@types/react-dom`, `@eslint-react/eslint-plugin`, and `eslint-plugin-react-hooks`. The workspace packages `@ghost-run/core`, `@ghost-run/wards-config`, `@ghost-run/playground-shell`, `@ghost-run/drawer-arm`, and `@ghost-run/ghost-cloud` are MIT and part of this repository; only the record script uses them.

Notes for the wards-config rows:

- `yaml` is pinned to exactly 2.9.1 in `wards-config/package.json`. Its license field is ISC, confirmed on 2026-11-18 (see `docs/measurements.md`). It has no dependencies of its own.
- vitest, fast-check, typescript, @types/node, eslint, and typescript-eslint (rows above) are also dev dependencies of `core`, `ghost-runner`, `ui`, and `wards-config`, at the same installed versions.

Notes for the Ghost Shell rows:

- `apps/ghost-shell` (the playground page) and `worlds/playground-shell` (the world it runs) are static and need no server, no API key, and no runtime LLM call. The page runs the bundled scenarios and your own plan files against an in-memory virtual project and an in-browser SQLite database (`sql.js`), then shows the verdict as a candle. It runs no real command and touches no real file. It claims P2 only as "the diff computed from the action record equals the diff of the ghost run", not as equality with a real shell.
- Versions and licenses were read from the installed `package.json` files on 2026-11-18.
- Runtime dependencies of `apps/ghost-shell`: `sql.js` 1.16.0 (MIT), `react` 19.3.1 (MIT), `react-dom` 19.3.1 (MIT). `yaml` 2.9.1 (ISC) reaches the page through `@ghost-run/wards-config`. The workspace packages `@ghost-run/core`, `@ghost-run/ui`, `@ghost-run/wards-config`, and `@ghost-run/playground-shell` are MIT and part of this repository.
- Development dependencies of `apps/ghost-shell`, all listed in the table above at the installed versions: `typescript` 5.9.3 (Apache-2.0), `eslint` 10.15.0, `typescript-eslint` 8.73.0, `@types/node` 20.19.43, `vite` 7.3.8, `@vitejs/plugin-react` 5.2.0, `vitest` 3.2.7, `fast-check` 4.10.2, `jsdom` 26.1.0, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.12, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@eslint-react/eslint-plugin` 5.30.3, and `eslint-plugin-react-hooks` 7.1.1 (all MIT unless noted).
- Development dependencies of `worlds/playground-shell`: `@ghost-run/wards-config` (workspace), `@types/node`, `eslint`, `fast-check`, `jsdom`, `typescript`, `typescript-eslint`, and `vitest`, at the same installed versions.
- Excluded on purpose: `shell-quote` and `@types/sql.js`. The playground uses its own tokenizer and parser instead of `shell-quote`, and `src/sql-js.d.ts` declares only the six `sql.js` APIs that the code uses instead of `@types/sql.js`.
- Fonts, icons, and other assets of `apps/ghost-shell`: none. The app adds no font and no image. Icons and art come from `@ghost-run/ui` (original SVG paths, MIT, this repository) and the page uses system font stacks. Audio: none.
- Measured `verifyWorld` run time of the playground world (task 7.6; Apple M1 class Mac, Node 20+, Short_Run with 100 runs per property, default state comparison): 13.8 s and 14.9 s in two runs. The save-time budget is 60 s. Details are in `docs/measurements.md`.
- Measured wasm size (task 3.3, build output of `apps/ghost-shell`): the `sql.js` wasm file is 688,197 bytes (about 337 kB gzip). It is served from the same origin as the page and no CDN is used. The whole `dist/` folder is about 1.2 MB.
- Claims: the playground states P1 to P3 and the ward properties for its deterministic in-memory world only. Plan B is a real-mode concept and does not apply to the playground.

License note: every dependency above is under a permissive license (MIT, BSD, ISC, or Apache-2.0) except `axe-core`, which is MPL-2.0 (a file-level copyleft license). It is a dev-only test tool, it is not bundled into any shipped artifact, and it is not modified. The Unicode data rows use the Unicode License v3.

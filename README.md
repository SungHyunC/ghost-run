# Ghost Run+

Let your agent's ghost try it first.

## Possession detector

The possession detector (`core/src/possession/`, plus the Node file helpers in `core/possession-node.ts`) scans text for hidden characters that can carry instructions an agent should not obey. The scanner is a pure function.

### Claim (P7)

Text that contains a hidden code point of the categories `tag`, `zero-width`, or `bidi` is always flagged, and ordinary text is never flagged. Ordinary text includes the England, Scotland, and Wales flag emoji, whose tag characters are allowed only as a standard RGI tag sequence. This claim applies everywhere, because the scanner is a pure function.

### Additional markdown category

HTML comment detection is an additional category. It applies only where the `markdown` option is `true`. It is not part of the P7 negative direction.

### What the detector does not do

- Text analysis does not catch every injection. A malicious instruction written in plain visible words is not found by this detector.
- The action-based criterion (a secret file read followed by an unapproved network attempt produces `block`) is owned by the `wards` spec as P6. The possession detector does not assert P6.
- Invisible characters outside the categories above are not detected. Examples are U+115F, U+3164, and look-alike letters (homoglyphs) from other scripts.
- The red thread is a lookup for a literal occurrence. An address that the agent built from several pieces, encoded, compressed, or encrypted does not produce a `found` link. The red thread is not a verdict input: a `not-found` link never changes a `pass`, `warn`, or `block` verdict.
- Input size is not limited by the detector. The caller should cap the size of untrusted large input before scanning it.

### Unicode data

The emoji and tag-sequence rules use numeric tables generated from Unicode 16.0.0 data (Emoji 16.0). The tables are pinned to that version. To regenerate them, run `corepack pnpm --filter @ghost-run/core gen:emoji`. The source URLs and SHA-256 hashes are pinned in `core/scripts/emoji-data.pin.json`.

## Wards

Wards are the declared guard rules that judge a ghost run. They live in `wards.yaml` and are judged by the pure modules in `core/src/judge/` and the engine in `core/src/wards.ts`. The parser, validator, and printer are in the separate package `@ghost-run/wards-config`. The verdict is `pass` (candle lit), `warn` (candle flickering), or `block` (candle out).

### Default wards file

The default file is `apps/ghost-shell/wards.yaml`. It holds three wards: `protect-data` (`path`), `no-data-loss` (`sql`), and `no-secret-egress` (`egress`). The repo world uses this file instead of the per-world `worlds/<name>/wards.yaml` described in the world contract.

The file also has a top-level `safe_commands` list: `ls`, `pwd`, `cat`, `git status`, `git diff`. `wards-config` parses, validates, and prints the list for the `ghost-gate` hook. The matching rules for these commands are owned by the kiro-integration spec, not by the wards spec. The list is not a ward and does not change any verdict computed by the engine.

### Claims

| Property | Claimed where | Not claimed |
|---|---|---|
| P4 (a stricter ward never lets more plans pass) | All worlds. It is pure logic in the wards engine. | Nowhere. |
| P5 (a plan that deletes or overwrites a protected path produces `block`) | Where P1 holds: the playground and real mode with the Docker box. | Plan B (`static-analysis`), where no ghost run takes place. |
| P6 (a secret read followed by an unapproved network attempt produces `block`) | Where network attempts are recorded: the playground and real mode with the Docker box. | Plan B (`static-analysis`), and steps the playground cannot rehearse. |

When P5 or P6 is not claimed for a run, the message builder adds this line to every verdict kind (`CLAIM_LOWERED_LINE`):

> P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).

When some steps could not be rehearsed in the playground, it adds `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE` instead. Worlds where P5 and P6 do not apply, such as Ghost Hand, pass no claims and get no line.

### Path policies

- **Case policy.** Path wards match paths without regard to letter case by default. The reason is that APFS, the default file system on macOS, is case-insensitive, so `./DATA` and `./data` are the same directory there. Matching too much fails safe: a plan is blocked rather than let through. The cost is a possible false positive on Linux, where `DATA` and `data` can be different directories. A `path` ward can set `case_sensitive: true` to opt out. Case folding is one code point to one code point and is applied after Unicode normalization (NFC).
- **Symbolic links and moves.** P5 holds for symbolic links and moves only under this precondition: the world reports the actual resolved paths in its changes, and the Differ walks the copy with `lstat` so that it sees links as links and does not follow them. The judge itself never touches the file system. If a world does not meet the precondition, P5 is not claimed for symbolic links and moves in that world.
- **Paths outside the copy.** A path that escapes the copy root with a leading `..` matches no ward. It produces a `path-escape` notice instead, so a human can review it.

### What content inspection does not catch

The egress ward inspects request payloads for the values of secret files in raw form and in base64, base64url, hex, and percent encodings. It does not catch these cases:

- compression of the payload;
- encryption of the payload;
- multi-layer encodings, such as base64 of hex;
- a secret split over several requests;
- a secret sent one character at a time, for example through DNS lookups;
- secret values shorter than 8 bytes;
- payload bytes beyond the first 64 KiB (65,536 bytes) of each payload.

Only the behavior criterion catches these cases: a network attempt to a host that is not in `allow_hosts` after a secret file was read produces `block`, whatever the payload contains. Content inspection is an addition to that criterion. It does not replace it. It catches a secret sent to an allowed host, which the behavior criterion permits.

### Limits of the tools

- **`isMoreRestrictive` is sound but not complete.** When it returns `true`, the second ward set really does let through no more plans than the first. When it returns `false`, the second set may still be stricter. It compares sets of patterns by string containment, so these pairs can return `false` even though the second set is stricter: `data/**` against `data/**` plus `data/x`, `*.example.test` against `a.example.test`, and a host entry with a port against the same entry without a port.
- **`printWards` does not preserve comments.** It writes a canonical form of the ward set, so comments in an edited `wards.yaml` are lost when the file is printed again. Keep the explanations in the file you edit by hand and treat printed output as generated.
- **Entry points.** The default entry of `@ghost-run/wards-config` imports no Node built-in, so a browser can parse `wards.yaml`. Reading a file from disk is available only from `@ghost-run/wards-config/node`.
- **Test values.** Examples and tests use fake canary values such as `sk-CANARY-abc123` and reserved domains such as `setup-check.example`. `registry.npmjs.org` appears only as the `allow_hosts` example in the default file.

## Ghost runner

`@ghost-run/ghost-runner` (`ghost-runner/`) rehearses a shell plan against a Copy of a directory inside a sealed Docker box (`--network none`, copy-only mount) and returns the changes and observed events for the wards to judge. Usage, the box build, the run id, cleanup, and the license table are in [ghost-runner/README.md](ghost-runner/README.md).

- **P1, P5, and P6** are claimed only for runs in the Docker box. P6 additionally needs the recorder to see network attempts.
- **Plan B.** When Docker or the box image is unavailable, nothing runs on the host and only static analysis is done. P1, P5, and P6 are not claimed, and the run says so: `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.`
- The in-box recorder reports `tamperResistant: false`.
- Supported on macOS and Linux. Windows is unverified.

## UI kit

`@ghost-run/ui` (`ui/`) draws the mirror world, candle, blacklight, red thread, graveyard, and lights-on theme from data that `core` already produced. It computes no verdict, diff, or finding. It asserts none of P1 to P8 and shows only the claim flags it receives. Its render properties are named UI-P1 to UI-P11. A Plan B run never shows a P1 claim. Commands, the dependency table, and the asset table are in [ui/README.md](ui/README.md).

### Secret-like key rule

The Mirror world hides the value of any field whose key name contains `secret`, `token`, `password`, `passwd`, `apikey`, `api_key`, `authorization`, `cookie`, `credential`, `private_key`, or `session`, ignoring letter case, and shows `[hidden: secret-like field]` instead. This is a heuristic. It matches key names by case-insensitive containment and never inspects values. It can miss a secret under an innocent key name (for example `pwd`, or `privateKey`, which does not contain `private_key`), and it can hide a harmless value (for example `session_count`). It does not detect a secret typed into a command string or any other displayed text. The producer of the changes and scenes remains responsible for redaction.

## Kiro integration

Ghost Run+ plugs into Kiro (IDE and CLI) with five hooks, one MCP server, and one power. Details, claims, and limits are in the READMEs of each part:

- [`integrations/kiro-hook/`](integrations/kiro-hook/README.md): the hooks `ghost-gate` (Pre Tool Use), `ghost-log` (Post Tool Use), `contract-pbt`, `world-scaffold`, and `blacklight-steering`. The note on [cross-call exfiltration](integrations/kiro-hook/docs/cross-call-exfiltration.md) states what the records can and cannot do.
- [`integrations/mcp/`](integrations/mcp/README.md): the advisory MCP server `ghost-run` with the tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, and `blacklight`.
- [`integrations/power/`](integrations/power/README.md): the Kiro power (plugin file, skill, and a bundled server). It gives the advisory tools and the skill, not the enforcing gate.

- **P1 is claimed per run, never as a property of a hook.** The gate and `ghost_run` repeat the flags `p1Claimed`, `p5Claimed`, and `p6Claimed` of the run they report, and claim nothing when the flag is `false`.
- **Plan B.** Without Docker and the built box image the run is static analysis only. P1, P5, and P6 are not claimed, the message says `P1 isolation is NOT guaranteed`, and the verdict is at least `warn`.
- **A seatbelt, not full isolation.** A `pass` is not an approval of the real command, text analysis does not catch every injection, and the hooks are not tamper-resistant against a process with the developer's privileges. P6 holds within one tool call only.
- **State.** Every hook file in `.kiro/hooks/` is disabled except the probe hook. The gate is switched on by a human after a checklist. Facts measured only in the Kiro CLI are marked "pending (task 1.4)" for the IDE.
- Supported on macOS and Linux. Windows is unverified.

### Start a new world from the template

`.kiro/specs/_new-world/` is a fill-in template for the three spec files of a new world (the six `World<S, A>` functions, the `verifyWorld` registration gate, the registration file, the wards, the claim-scope table, and the hygiene rules). It is not a real spec and has no `.config.kiro`.

1. Copy it: `cp -r .kiro/specs/_new-world .kiro/specs/<world-name>`.
2. Remove the copied `README.md`, replace every `<placeholder>`, `Fill in:` line, and `TBD`, and delete the "Template notice" block of each file.
3. Ask Kiro to run the tasks of the copy. When the agent creates a file in `worlds/<world-name>/`, the `world-scaffold` hook adds `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md`; each save in `worlds/` then runs the `contract-pbt` hook within its 60 s limit (both hooks must be enabled).

## Dependencies and data

| Name | Version | Use | License |
|---|---|---|---|
| Unicode `emoji-data.txt` (Extended_Pictographic) | 16.0.0 (Emoji 16.0) | Source for generated numeric tables. URL: https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt | Unicode License v3 (Unicode-3.0), https://www.unicode.org/license.txt |
| Unicode `emoji-sequences.txt` (RGI_Emoji_Tag_Sequence) | 16.0.0 (Emoji 16.0) | Source for generated numeric tables. URL: https://www.unicode.org/Public/emoji/16.0/emoji-sequences.txt | Unicode License v3 (Unicode-3.0), https://www.unicode.org/license.txt |
| fast-check | 4.10.2 | Dev dependency, property-based tests | MIT |
| vitest | 3.2.7 | Dev dependency, test runner | MIT |
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

Notes for the Ghost Hand rows:

- fast-check, vitest, typescript, and @types/node (rows above) are also dev dependencies of `apps/ghost-hand` and `worlds/drawer-arm`, at the same installed versions.
- The `@mujoco/mujoco` `package.json` license field says Apache-2.0, but the published tarball contains no LICENSE file.
- The MuJoCo WebAssembly file bundles components with their own licenses. They are listed in `docs/research.md`: Qhull, tinyxml2, tinyobjloader, libccd, miniz, and lodepng. The third-party notices file is produced by task 15.1 of the ghost-hand spec.

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

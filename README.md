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
| shell-quote | 1.12.0 | Runtime dependency of `ghost-runner`, shell command parsing | MIT |
| @types/shell-quote | 1.7.5 | Dev dependency of `ghost-runner`, shell-quote type definitions | MIT |
| @eslint-react/eslint-plugin | 5.30.3 | Dev dependency of `ui`, React lint rules | MIT |
| eslint-plugin-react-hooks | 7.1.1 | Dev dependency of `ui`, hooks lint rules | MIT |
| @testing-library/dom | 10.4.2 | Dev dependency of `ui`, DOM queries for component tests | MIT |
| @testing-library/user-event | 14.6.12 | Dev dependency of `ui`, simulated user input in component tests | MIT |
| @vitejs/plugin-react | 5.2.0 | Dev dependency of `ui`, Vite React plugin | MIT |
| axe-core | 4.14.1 | Dev dependency of `ui`, accessibility audit in tests (not shipped) | MPL-2.0 |
| `core` (`@ghost-run/core`) | 0.0.0 | no runtime dependencies (`core/package.json` has no `dependencies` field) | MIT (this repository) |
| Fonts, icons, and assets of `apps/ghost-hand` | none | The app uses only primitive shapes and system fonts | none |

Notes for the Ghost Hand rows:

- fast-check, vitest, typescript, and @types/node (rows above) are also dev dependencies of `apps/ghost-hand` and `worlds/drawer-arm`, at the same installed versions.
- The `@mujoco/mujoco` `package.json` license field says Apache-2.0, but the published tarball contains no LICENSE file.
- The MuJoCo WebAssembly file bundles components with their own licenses. They are listed in `docs/research.md`: Qhull, tinyxml2, tinyobjloader, libccd, miniz, and lodepng. The third-party notices file is produced by task 15.1 of the ghost-hand spec.

Notes for the wards-config rows:

- `yaml` is pinned to exactly 2.9.1 in `wards-config/package.json`. Its license field is ISC, confirmed on 2026-11-18 (see `docs/measurements.md`). It has no dependencies of its own.
- vitest, fast-check, typescript, @types/node, eslint, and typescript-eslint (rows above) are also dev dependencies of `core`, `ghost-runner`, `ui`, and `wards-config`, at the same installed versions.

License note: every dependency above is under a permissive license (MIT, BSD, ISC, or Apache-2.0) except `axe-core`, which is MPL-2.0 (a file-level copyleft license). It is a dev-only test tool, it is not bundled into any shipped artifact, and it is not modified. The Unicode data rows use the Unicode License v3.

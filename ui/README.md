# @ghost-run/ui

The Ghost Run+ screen kit: mirror world, candle verdict, blacklight toggle, red thread, graveyard, and lights-on mode. The package is private and is exported as TypeScript source (`src/index.ts`). Styles are exported as `@ghost-run/ui/styles.css`.

The kit draws data that `core`, the possession detector, and the ward engine already produced. It computes no verdict, diff, finding, or thread link. `ui/src` imports `@ghost-run/core` with `import type` only.

## Claims

- The render properties of this package are named **UI-P1 to UI-P11**. They are not the safety properties P1 to P8 of the World contract.
- The kit asserts none of P1 to P8. It displays the claim flags it receives.
- A Plan B run (static analysis, no Docker box) never shows a P1 claim. The kit shows the "Not claimed" banner for it.

## Commands

Run these from the repository root. They use corepack, so no global pnpm is needed.

| Task | Command |
|---|---|
| Install | `corepack pnpm install` |
| Short_Run (default test size) | `corepack pnpm --filter @ghost-run/ui test` |
| Nightly_Run (10,000 examples for node legs, 500 for DOM legs) | `corepack pnpm --filter @ghost-run/ui test:nightly` |
| Replay a run | `GHOST_PBT_SEED=<n> corepack pnpm --filter @ghost-run/ui test` |
| Dist scan (needs a built `ui/dist`) | `corepack pnpm --filter @ghost-run/ui build && corepack pnpm --filter @ghost-run/ui test:dist` |
| Gallery build (`ui/dist`) | `corepack pnpm --filter @ghost-run/ui build` |
| Gallery preview | `corepack pnpm --filter @ghost-run/ui preview` |
| Typecheck | `corepack pnpm --filter @ghost-run/ui typecheck` |
| Lint | `corepack pnpm --filter @ghost-run/ui lint` |

`GHOST_PBT_MODE=nightly` selects the Nightly_Run sizes. Each property test prints `PBT seed=<n>` before it runs.

The gallery page (`ui/index.html`, `ui/gallery/`) is the build and static-hosting check target. It needs no server and no COOP or COEP header.

## Base form styles

`src/styles/kit.css` defines base styles for `button`, `input`, and `textarea` through the classes `gk-button`, `gk-input`, and `gk-textarea`. They use only color tokens from `theme.css`, so both themes keep the contrast ratios checked by UI-P6.

## Secret-like key rule

The Mirror world hides the value of any field whose key name contains `secret`, `token`, `password`, `passwd`, `apikey`, `api_key`, `authorization`, `cookie`, `credential`, `private_key`, or `session`, ignoring letter case, and shows `[hidden: secret-like field]` instead. This is a heuristic. It matches key names by case-insensitive containment and never inspects values. It can miss a secret under an innocent key name (for example `pwd`, or `privateKey`, which does not contain `private_key`), and it can hide a harmless value (for example `session_count`). It does not detect a secret typed into a command string or any other displayed text. The producer of the changes and scenes remains responsible for redaction.

## Known limits

- Only the `YYYY-MM-DDTHH:MM:SS[.fff]Z` time form is valid. Any other `recordedAt` form counts as unreadable time.
- Two copies of React are possible if an app resolves `react` to a different range than the one this package declares. Keep one range.
- A `null` value for an optional prop is unreadable. Leave the prop out instead.
- The line-break rule follows the possession rule: `\n`, `\r\n`, and a lone `\r` each end a line.
- Real focus rings, browser color contrast, and animation playback are manual checks. The tests cover tokens, axe-core audits, and reduced-motion rules only.

## Dependencies

Versions are the installed versions. Run-time dependencies are the first three rows.

| Name | Version | Kind | License |
|---|---|---|---|
| @ghost-run/core | 0.0.0 (workspace) | runtime | MIT |
| react | 19.3.1 | runtime | MIT |
| react-dom | 19.3.1 | runtime | MIT |
| @eslint-react/eslint-plugin | 5.30.3 | dev | MIT |
| @testing-library/dom | 10.4.2 | dev | MIT |
| @testing-library/react | 16.3.3 | dev | MIT |
| @testing-library/user-event | 14.6.12 | dev | MIT |
| @types/node | 20.19.43 | dev | MIT |
| @types/react | 19.3.0 | dev | MIT |
| @types/react-dom | 19.3.0 | dev | MIT |
| @vitejs/plugin-react | 5.2.0 | dev | MIT |
| axe-core | 4.14.1 | dev | MPL-2.0 |
| eslint | 10.15.0 | dev | MIT |
| eslint-plugin-react-hooks | 7.1.1 | dev | MIT |
| fast-check | 4.10.2 | dev | MIT |
| jsdom | 26.1.0 | dev | MIT |
| typescript | 5.9.3 | dev | Apache-2.0 |
| typescript-eslint | 8.73.0 | dev | MIT |
| vite | 7.3.8 | dev | MIT |
| vitest | 3.2.7 | dev | MIT |

Notes:

- **axe-core (MPL-2.0).** It is a dev dependency only. It is used only by `tests/dom/*.test.tsx`. It is not imported under `src/` or `gallery/`, it is not in the Vite bundle or in `ui/dist`, it is not modified or copied, and it is not published because `ui` is private.
- **typescript (Apache-2.0).** Dev dependency, compiler only.
- **`eslint-plugin-react` and `eslint-plugin-jsx-a11y` are not used.** Their peer ranges stop below ESLint 10. Accessibility is checked by axe-core DOM tests and role-based queries instead, and the React lint rules come from `@eslint-react/eslint-plugin` and `eslint-plugin-react-hooks`.

## Fonts and assets

| Kind | Source | License |
|---|---|---|
| Icons | Original SVG paths written in this package as code | MIT |
| Flame, smoke, and tombstone shapes | Original SVG paths written in this package as code | MIT |
| Fonts | None. System font stacks only | none |
| Audio | None | none |

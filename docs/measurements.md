# Measurements

Measured values recorded by the Kiro implementation runs. The development log (`docs/devlog.md`) summarizes them.

## ui-kit task 1.3: install facts

`corepack pnpm install` ran once for the workspace (pnpm 12.21.0, +123 packages). No peer-dependency warnings. One deprecation warning: sub-dependency `whatwg-encoding@3.1.1` (via jsdom). The first install bypassed the release-age check with 13 `minimumReleaseAgeExclude` entries for 5.30.4. That bypass was reverted: `@eslint-react/eslint-plugin` is pinned to exactly 5.30.3 and installs with no exclusions. The install changed nothing in `core/`, `ghost-runner/`, or `wards-config/`.
  - Resolved versions: vite 7.3.8, vitest 3.2.7, jsdom 26.1.0, react 19.3.1, react-dom 19.3.1, @eslint-react/eslint-plugin 5.30.3, axe-core 4.14.1.
  - Q1 confirmed: ESLint accepts `@eslint-react/dom-no-dangerously-set-innerhtml` and `@eslint-react/dom-no-dangerously-set-innerhtml-with-children` (`eslint .` and `tsc --noEmit` both exit 0 in `ui/`).
  - Q2 confirmed: Vitest 3.2.7 accepts the inline `projects` config (projects model, static, dom, scan, dist listed; `vitest run --passWithNoTests` exits 0). No fallback needed.
  - Non-ASCII scan of `ui/` and `.kiro/specs/ui-kit/`: only box-drawing characters (U+2500, U+2502, U+251C, U+2514) and U+2248 in `design.md`. No hidden Unicode.

## ui-kit task 2.2: contrast gate (UI-P6)

Exact WCAG ratios from `ui/tests/model/p6-contrast.test.ts` (seed -1590885540). All 50 pairs pass; no token changed.

Dark (threshold: text 4.5, graphic 3):
- text/bg 15.457, text/surface 14.252, text/fog 11.925
- muted/bg 8.639, muted/surface 7.966, muted/fog 6.665
- pass/bg 16.691, pass/surface 15.390, pass/fog 12.876
- warn/bg 11.591, warn/surface 10.688, warn/fog 8.942
- block/bg 7.940, block/surface 7.321, block/fog 6.125
- line/bg 5.408, line/surface 4.987, line/fog 4.172
- focus/bg 8.923, focus/surface 8.227, focus/fog 6.883
- bl-edge/bg 15.529, bl-edge/surface 14.319, bl-edge/fog 11.980
- bl-ink/bl-fill 15.529
- Tightest: --gk-line on --gk-fog, 4.172 (threshold 3).

Light:
- text/bg 15.665, text/surface 16.740, text/fog 14.882
- muted/bg 7.164, muted/surface 7.656, muted/fog 6.806
- pass/bg 10.815, pass/surface 11.557, pass/fog 10.274
- warn/bg 7.001, warn/surface 7.481, warn/fog 6.651
- block/bg 6.117, block/surface 6.536, block/fog 5.811
- line/bg 4.197, line/surface 4.485, line/fog 3.987
- focus/bg 6.345, focus/surface 6.780, focus/fog 6.027
- bl-edge/bg 15.665, bl-edge/surface 16.740, bl-edge/fog 14.882
- bl-ink/bl-fill 14.532
- Tightest: --gk-line on --gk-fog, 3.987 (threshold 3).

# World: starter

The smallest useful world on `@ghost-run/core`: a to-do list. Reality is a fixed fixture of 3 to-dos. Nothing here uses a UI, Docker, or the network. Read `src/world.ts` (about 70 lines) top to bottom.

Actions: `add <text>`, `remove <id>`, `clear`.

## The six functions

| Function | What it does here |
|---|---|
| `snapshot()` | Deep copy of the list. Reality is not touched. |
| `step(s, a)` | Returns a new snapshot. Never throws and never mutates `s`. An invalid action returns the list unchanged with `{ success: false, error }`. |
| `diff(before, after)` | `Change[]` sorted by path: `file-created`, `file-overwritten`, or `file-deleted` on `todos/<id>`. |
| `render(s)` | Plain `Scene`: `{ world: 'starter', todos: [{ id, text }] }`. |
| `fingerprint()` | SHA-256 over a canonical encoding: sorted `[path, sha256(text)]` rows. |
| `effectsOutside(a)` | Always `[]`. No action leaves the copy. |

## Ward (`wards.yaml`)

| Ward id | Kind | Rule |
|---|---|---|
| `keep-todos` | `path` | deny `delete` on `todos/*` |

## Try it

```
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @ghost-run/world-starter demo
```

Expected output (exit code 0):

```
plan: clear
  blocked by ward keep-todos: the copy lost 3 to-dos
  real list unchanged: true (fingerprint ed34d2240ad1 before and after)
plan: remove 2
  blocked by ward keep-todos: the copy lost 1 to-do
  real list unchanged: true (fingerprint ed34d2240ad1 before and after)
plan: add "buy candles"
  passed: 1 action, the copy lost 0 to-dos
```

The demo runs each plan on a fresh world through `ghostRun` and `WardEngine.evaluate`, the same calls the apps use. Tests: `corepack pnpm --filter @ghost-run/world-starter test`.

### Change a rule

Open `worlds/starter/wards.yaml`. The ward protects every to-do:

```
    paths: ["todos/*"]
```

Protect only the first to-do instead:

```
    paths: ["todos/1"]
```

Run the demo again:

```
corepack pnpm --filter @ghost-run/world-starter demo
```

```
plan: clear
  blocked by ward keep-todos: the copy lost 3 to-dos
  real list unchanged: true (fingerprint ed34d2240ad1 before and after)
plan: remove 2
  passed: 1 action, the copy lost 1 to-do
plan: add "buy candles"
  passed: 1 action, the copy lost 0 to-dos
```

`remove 2` now passes, because to-do 2 is no longer protected. `clear` is still blocked, because it deletes to-do 1. Nothing else changed: the plans, the world, and the code are the same. Undo the edit to get the first output back. To try a rule without editing the file, save a copy and run `corepack pnpm --filter @ghost-run/world-starter demo --wards <file>`.

## Claims

- P1: claimed. The world is in memory and the fingerprint before and after a ghost run is equal. No Docker box is involved.
- P3: claimed. P4 and P5: claimed through the engine, where P1 holds.
- P2: not claimed (`deterministic: false`). P6, P7, P8: not applicable to this world.

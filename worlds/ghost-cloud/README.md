# World: ghost-cloud

Status: scaffold only. Implement the six `World<S, A>` functions, then save a file in this
folder to run contract-pbt.

## The six functions

| Function | Contract |
|---|---|
| `snapshot()` | Returns a deep copy of the current state. Must not modify reality. |
| `step(s, a)` | Applies one action to a snapshot. Must not modify reality or the input snapshot. |
| `diff(before, after)` | Returns the minimal set of `Change` objects between two snapshots. |
| `render(s)` | Returns a `Scene` for the UI kit. Must be pure. |
| `fingerprint()` | Returns a hash of real-world state (P1 isolation check). |
| `effectsOutside(a)` | Returns `Effect[]` for actions that reach outside the copy. |

## Checklist

- [ ] All six functions implemented
- [ ] `snapshot()` leaves reality unchanged (P1)
- [ ] `step()` does not mutate the input snapshot
- [ ] `diff()` covers every change type of this world
- [ ] `effectsOutside()` is non-empty for every action that leaves the copy
- [ ] `actionArb` defined in `tests/contract.test.ts`
- [ ] P1, P2 (if deterministic), P3, and the ward properties pass
- [ ] Wards of this world written in `wards.yaml`

## Claims

| Property | Claimed |
|---|---|
| P1 | After the checklist passes, inside the Docker box only |
| P2 | Not claimed (`deterministic: false` in `world.config.ts`) until the world is shown to be deterministic |
| P3 | After the checklist passes |
| P4 to P8 | Where the ward kinds of this world apply |

---
inclusion: always
---

# World Contract & Adapter Guide

## What a World Is

A World wraps a stateful environment (filesystem, database, cloud, physics simulation) so the ghost runner can copy it, act on the copy, and diff the result — without touching reality.

## Implementing a New World

1. Create a folder under `worlds/<name>/` (the world-scaffold hook populates boilerplate).
2. Implement all six functions of `World<S, A>` from `core/`.
3. Add a `worlds/<name>/world.config.ts` that registers the world.
4. Pass P1, P2, P3, and all relevant ward properties before the world appears in the playground.

**Primary functions — every world must implement all four:**

| Function | Contract |
|---|---|
| `snapshot()` | Returns a deep copy of current state. Must not modify reality. |
| `step(s, a)` | Applies one action to a snapshot. Must not modify reality or the input snapshot. |
| `diff(before, after)` | Returns the minimal set of `Change` objects between two snapshots. |
| `render(s)` | Returns a `Scene` for the UI kit. Must be pure (no side effects). |

**Auxiliary functions — used by PBT and the wards engine:**

| Function | Contract |
|---|---|
| `fingerprint()` | Returns a hash of real-world state. Used to verify P1: reality did not change during a ghost run. |
| `effectsOutside(a)` | Returns `Effect[]` for actions that reach outside the copy (network calls, external DB writes). Used to trigger `warn` verdict. |

## Safety Contract (P1–P8)

Each property declares where it is claimed. Do not assert a property outside its stated scope.

| ID | Property | Claimed in |
|---|---|---|
| P1 | Ghost run never changes reality: fingerprint before = fingerprint after, for any action list | Playground; real mode with Docker box. **Not claimed** when Docker is unavailable (Plan B fallback). |
| P2 | A plan that passes produces the same diff when executed for real as the ghost produced | Playground's deterministic worlds (in-memory FS + sql.js) only. **Not claimed** for shell worlds where time, PIDs, or network responses vary. Ghost Hand (narrow scope): On the same build and in the tested environments, the ghost run's result equals the reference simulation run's result. Not claimed for physical hardware. |
| P3 | Restoring a snapshot returns the world to exactly its pre-snapshot state; in physics worlds the subsequent trajectory also matches | All worlds |
| P4 | Making a ward stricter never increases the set of passing plans | All worlds (wards engine logic) |
| P5 | Any plan that deletes or overwrites a protected path produces a `block` diff — P5 depends on P1 | Where P1 holds |
| P6 | Any plan that reads a secret file and then makes an unapproved network attempt produces `block` (action-based). Content inspection also catches canary values encoded as base64, hex, or URL encoding. Compression, encryption, and DNS-exfiltration (one character at a time) are outside content-inspection scope and are caught by the action criterion only. | Playground; real mode with Docker box where network attempts can be recorded. **Not claimed** in Plan B fallback. |
| P7 | Text containing hidden Unicode (tag characters, zero-width characters, bidi controls) is always flagged; text containing only normal characters (Hangul, emoji, combining marks) is never flagged | Everywhere (pure function) |
| P8 | Same seed + same plan always produces identical variant outcomes; variant parameter values stay within declared ranges | Ghost Hand |

**Rule:** Assert a property only within its declared scope. If the execution environment changes (e.g., Docker unavailable), lower the claim explicitly in the UI and README.

## Ward Kinds

| Kind | Checks |
|---|---|
| `path` | Denies delete or overwrite of matched paths |
| `sql` | Limits row loss in named tables |
| `egress` | Blocks network attempts after a secret file is read |
| `physics` | Enforces success rate, force limits, and forbidden contacts |

## Checklist for a New World Adapter

- [ ] All six `World<S, A>` functions implemented
- [ ] `snapshot()` leaves reality unchanged (verified by P1 PBT, 100 runs on save)
- [ ] `step()` does not mutate the input snapshot
- [ ] `diff()` covers all change types relevant to this world
- [ ] `effectsOutside()` returns non-empty for every action that leaves the copy
- [ ] P1, P2 (if deterministic), P3, and applicable ward properties pass
- [ ] World registered in `worlds/<name>/world.config.ts`
- [ ] Wards for this world documented in `worlds/<name>/wards.yaml`

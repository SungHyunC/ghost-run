# @ghost-run/playground-shell

Dependencies and licenses are listed in [docs/dependencies.md](../../docs/dependencies.md).

## World registration

`world.config.ts` registers the world as `{ id, deterministic, wardsFile, create }`. The `wardsFile` value is the path string `../../apps/ghost-shell/wards.yaml` and is never imported.

**Exception to the world-contract checklist.** The single wards file for this world lives at `apps/ghost-shell/wards.yaml`, so no `worlds/playground-shell/wards.yaml` exists. The checklist item "wards documented in `worlds/<name>/wards.yaml`" is satisfied by this pointer.

## Measured run time

The design estimated 10 to 20 s for `verifyWorld` and left the 60 s save-time budget unmeasured. Measured on an Apple M1 class machine, Short_Run (100 runs, `tests/verify-world.test.ts`, neutral project with a 1,206-row `app.db`): `verifyWorld` took about 14 s (13.8 s and 14.9 s), the whole world suite about 17 s wall clock, and the world executed about 470 to 500 SQL steps. This is below the 45 s guard and the 60 s budget, so no fallback (smaller fixture or lower SQL weight) was applied. Details are in `docs/measurements.md`.

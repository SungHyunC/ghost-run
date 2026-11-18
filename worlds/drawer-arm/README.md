# @ghost-run/drawer-arm

Ghost Hand world for Ghost Run+: a MuJoCo (WebAssembly) drawer, arm, and vase scene.
It implements the six functions of the `World` contract from `@ghost-run/core`.

Status: scaffold only. The engine, controller, and world are added by later tasks of
`.kiro/specs/ghost-hand/tasks.md`.

- `wards.yaml`: the single canonical wards file (`gentle-hands`, kind `physics`).
- `variant-config.json`: haunted-variant ranges, default count 8, default seed 42.
- `scripts/probe.mjs`: probe of the `@mujoco/mujoco` 4.0.1 API (results in `docs/measurements.md`).

The `deterministic: true` flag in `world.config.ts` is limited to the Tested_Environments
(`tests/contract.test.ts` runs `verifyWorld` on the Base_World and on one sampled variant).

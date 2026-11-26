# Ghost Run+: Build a world

How to add a new world, by hand or with the `world-smith` agent. Part of [Ghost Run+](../README.md).

## New worlds

A new world implements the six functions of `World<S, A>` (`core/src/types.ts`). Four are primary: `snapshot`, `step`, `diff`, and `render`. Two are auxiliary: `fingerprint` and `effectsOutside`. The world then inherits the ghost runner, the wards engine, the possession detector, and the UI kit. See "Build a world with the `world-smith` agent" and "Start a new world from the template" below.

### Build a world with the `world-smith` agent

`.kiro/agents/world-smith.json` is a workspace custom agent that follows the steps above for you. Trust the workspace, then start it in the CLI with `kiro-cli chat --agent world-smith` (the IDE lists it in the agent picker). The file uses the V3 format, so a non-interactive call needs `--agent-engine v3`. It asks for the world name, copies the template, writes the world spec one file at a time for your approval, implements the six functions in `worlds/<world-name>/`, registers the world, and runs the `verifyWorld` gate and the wards. It uses the `world-scaffold` and `contract-pbt` hooks when they are enabled and runs the same work by command when they are not. It runs only `corepack pnpm --filter ... test`, `typecheck`, and `lint` without asking, uses no Kiro Crew tools, Powers, or MCP servers from your config, leaves the model on Auto, and changes nothing outside the new spec folder and `worlds/<world-name>/`. It does not replace the gate: deletes and other commands still need your approval or `ghost-gate`.

### Start a new world from the template

`.kiro/specs/_new-world/` is a fill-in template for the three spec files of a new world (the six `World<S, A>` functions, the `verifyWorld` registration gate, the registration file, the wards, the claim-scope table, and the hygiene rules). It is not a real spec and has no `.config.kiro`.

1. Copy it: `cp -r .kiro/specs/_new-world .kiro/specs/<world-name>`.
2. Remove the copied `README.md`, replace every `<placeholder>`, `Fill in:` line, and `TBD`, and delete the "Template notice" block of each file.
3. Ask Kiro to run the tasks of the copy. When the agent creates a file in `worlds/<world-name>/`, the `world-scaffold` hook adds `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md`; each save in `worlds/` then runs the `contract-pbt` hook within its 60 s limit (both hooks must be enabled).

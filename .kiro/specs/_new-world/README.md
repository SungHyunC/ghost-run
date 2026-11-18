# New-world spec template

This folder is a template, not a real spec. It holds fill-in skeletons for the three spec files that a new Ghost Run+ world needs. The folder name starts with `_` so that it sorts first and reads as "not a feature". It has no `.config.kiro` and no `tasks.meta.json`, which Kiro creates for a real spec.

## How to use it

1. Pick a world name in kebab-case, for example `<world-name>`.
2. Copy the folder: `cp -r .kiro/specs/_new-world .kiro/specs/<world-name>` and delete this `README.md` from the copy.
3. In the copy, replace every slot. A slot is one of these forms:
   - `<placeholder>` such as `<world-name>`, `<WorldName>`, `<State>`, `<Action>`, `<ChangeKind>`.
   - A line that starts with `Fill in:` (what to write there).
   - A table cell that holds `TBD`.
4. Search the copy for `<`, `Fill in:`, and `TBD` until nothing is left.
5. Delete the "Template notice" block at the top of each of the three files.
6. Ask Kiro to run the tasks of the copy. The `world-scaffold` hook creates `worlds/<world-name>/` files when the agent creates a file in that folder (see Requirement 9 of the template).

## What the template fixes for you

- The six `World<S, A>` functions and their contracts (world-contract steering).
- The registration gate `verifyWorld` (P1 and P3 always, P2 only for a deterministic world).
- The registration file `worlds/<world-name>/world.config.ts` and the files that the `world-scaffold` hook creates.
- The save-time run of the `contract-pbt` hook and its 60 s budget.
- The claim-scope table (what may and may not be claimed) and the rules for hidden characters, canary secrets, and reserved domains.

## What you decide

- The state and action types, the change kinds, the scene, and the effects outside the copy.
- Whether the world is deterministic (this decides whether P2 is claimed).
- The wards of the world and its default `wards.yaml`.

## Notes on the tooling

- Nothing in this repository enumerates `.kiro/specs/`: no script, test, or hook reads the folder list. The `blacklight-steering` hook and the possession scan of `integrations/kiro-hook/tests/hygiene.test.mjs` read the files here like any other `.kiro/` file, so keep them free of hidden characters.
- Whether the Kiro IDE spec list shows `_new-world` is not verified from the command line. If it does, treat it as a template: the checkboxes in its `tasks.md` are placeholders and must not be run.

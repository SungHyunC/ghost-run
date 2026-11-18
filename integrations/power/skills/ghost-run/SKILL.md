---
name: ghost-run
description: Rehearse a risky command in a sealed copy and check it against wards before running it for real.
---

# Ghost Run

Use the `ghost-run` MCP tools to rehearse an action before it touches the real project.

## When to call

Before any of these, call `wards_check` first and then `ghost_run`:

- a delete of files or directories
- a database change
- a migration
- a deploy
- a command that reads secret files such as `.env`

## Reading the result

The verdict is one of three values:

- `pass`: no ward was violated in the rehearsal.
- `warn`: the plan has a side effect outside the sealed copy. A human must decide. Do not proceed on your own.
- `block`: a ward was violated. The result names the ward and the numbers.

Each result also states which safety claims it makes:

- `p1Claimed`: the rehearsal left the real project unchanged. It is false when Docker or the box image is missing and the result comes from static analysis only.
- `p5Claimed`: a plan that deletes or overwrites a protected path was judged on that basis.
- `p6Claimed`: a plan that reads a secret and then attempts the network was judged on that basis.

Trust a verdict only within the claims that are true for that run.

## After a block

Answer a `block` with a different plan that does not have the harmful effect. Do not reach the same effect through another command, a different path spelling, or a script.

## Limits

- These tools are advisory. Only the Ghost_Gate hook enforces a verdict, and this power does not install it.
- A `pass` is not an approval. It does not replace a user's decision for actions the user asked to confirm.

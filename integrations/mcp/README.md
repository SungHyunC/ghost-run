# Ghost Run+ MCP server (`@ghost-run/mcp`)

A stdio MCP server named `ghost-run` with five tools. STDOUT carries the protocol only. Node.js 20 or later, no LLM call, no network call.

## Advisory notice

The tools help an agent that chooses to call them. Only the Ghost_Gate hook (`integrations/kiro-hook`) enforces a verdict on a tool call. A `ghost_run` call does not make a command safe, and a `pass` is not an approval. The server runs on the host and is not tamper-resistant against a process with the privileges of the developer.

## Tools

| Tool | Input | Result |
|---|---|---|
| `ghost_run` | `plan`: 1 to 50 actions, each `{ command, cwd? }`; a command has at most 4096 code points | `runId`, `graveId` (when a Grave_Entry was stored), `verdict` (`pass`, `warn`, `block`), `rehearsed`, `isolation` (`mode`, `p1Claimed`, `p5Claimed`, `p6Claimed`), `exitCodes`, `message`, `diffSummary`, `truncated` |
| `ghost_diff` | `id`: a run id or grave id | The stored changes per step, the diff summary, and the isolation claims of that run. An unknown or removed id gives `unknown run id`. |
| `ghost_trace` | `id`, optional `session` | For each destination or path of the run, the literal occurrences in the text that the agent read in that session (the most recently modified session when `session` is absent) |
| `wards_check` | `plan`: same shape as `ghost_run` | A static check: validates the wards file, lists ward ids and kinds, says which commands are on the safe list, and reports static findings. Starts no container and returns no verdict. |
| `blacklight` | `path`: 1 to 200 paths | A scan of workspace files for hidden Unicode (tag, zero-width, and bidi characters), with a per-path error for a path outside the workspace |

`ghost_run` starts a Docker container and writes the Ghost_Store (`.ghost-run/`). The other four tools start no container. The runner pipeline deadline in the server process is 55 s.

## Claims per tool

- `ghost_run`: the flags `p1Claimed`, `p5Claimed`, and `p6Claimed` are copied from the `isolation` of the run. Without Docker and the built box image the result is the Plan B result: `rehearsed` is `false`, no flag is claimed, and the verdict is at least `warn`. P2 is not claimed.
- `wards_check`: claims nothing. It is static.
- `ghost_diff` and `ghost_trace`: report stored data. A `not-found` link from `ghost_trace` does not mean that a destination is safe; the red thread finds literal occurrences only, and the tool changes no verdict.
- `blacklight`: P7 as the pure scan of `possession`. `clean` does not mean free of injected instructions, and invisible characters outside the possession categories are not detected.

## Limits

- Result cap: a tool result is at most 64 KiB (65,536 bytes). A longer text is cut and ends with a marker.
- Path confinement: a path is used only when its real path (after links are resolved) is inside the real workspace root. An absolute path outside the root, a path through a link that leaves the root, and a missing path are rejected with an error text. The workspace root is the working directory of the server process.
- One `ghost_run` rehearsal runs at a time in a server process. Calls queue.
- Input is validated with a schema. An invalid input gives an error naming the field.

## Run and test

```
corepack pnpm -r build
corepack pnpm --filter @ghost-run/mcp test
corepack pnpm --filter @ghost-run/mcp typecheck
corepack pnpm --filter @ghost-run/mcp lint
node integrations/mcp/bin/ghost-run-mcp.mjs     # stdio server; start it from the workspace root
```

The Kiro power in `integrations/power/` ships a single-file bundle of this server (`corepack pnpm --filter @ghost-run/mcp bundle`). Installing only the power gives these advisory tools and the skill, and not the enforcing gate. See `integrations/power/README.md`.

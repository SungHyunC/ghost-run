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
- Path confinement: a path is used only when its real path (after links are resolved) is inside the real workspace root. An absolute path outside the root, a path through a link that leaves the root, and a missing path are rejected with an error text. The workspace root is resolved in this order: (1) the first `file://` root from MCP roots, when the client declares the `roots` capability (asked at the first tool call, cached, refreshed on `notifications/roots/list_changed`); (2) `GHOST_RUN_WORKSPACE`, when it is an absolute path of an existing folder; (3) the working directory, unless it is the server's own folder (the power folder for the bundle, `integrations/mcp` from source); (4) the optional input `workspace` of every tool (the absolute path of the project root), only when 1 to 3 give no root: it must be an absolute path of an existing folder after `realpath`, and not `/`, not the home folder itself, not the server's own folder (each refusal names its reason); (5) otherwise no root, and every tool returns ``Pass `workspace` (the absolute path of your project root) and call again. Workspace root unknown: the server has no project root of its own (set GHOST_RUN_WORKSPACE to give it one)`` and does nothing else. When a root exists from 1 to 3 and `workspace` names a different real path, the tool returns `workspace does not match this server's workspace root` and does nothing. `PWD` is not a source: Kiro IDE sets it to the folder Kiro was launched from, not to the window's project. Real paths are compared. Every result names the resolved root in a first line.
- Default wards: when the workspace has no wards file, `wards_check` and `ghost_run` use built-in default wards (the content of `apps/ghost-shell/wards.yaml`) and say so in a notice. An invalid wards file is still an error. The Ghost_Gate does not use the default.
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

### Use it in Kiro from this repository

The repository registers this server for its own workspace in `.kiro/settings/mcp.json` (server `ghost-run`, `node integrations/mcp/bin/ghost-run-mcp.mjs`, a path relative to the workspace root). The entry ships with `"disabled": true`, like the hooks. To switch it on, run `corepack pnpm -r build` (the server imports the built `core`, `ghost-runner`, and `wards-config`), set `disabled` to `false` in that file, and reload the MCP servers in Kiro. `gate:on`, `gate:off`, and `gate:status` do not touch the file. The working directory Kiro gives a workspace server was not measured here. If a tool answers "Workspace root unknown", pass `workspace` (the absolute path of the project) or set `GHOST_RUN_WORKSPACE` in the entry's `env`. `tests/workspace-mcp-config.test.mjs` checks that the file parses, names `ghost-run`, is disabled, and points at the package's `bin` entry.

The Kiro power in `integrations/power/` ships a single-file bundle of this server (`corepack pnpm --filter @ghost-run/mcp bundle`). Installing only the power gives these advisory tools and the skill, and not the enforcing gate. See `integrations/power/README.md`.

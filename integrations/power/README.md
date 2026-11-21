# Ghost Run power

An Agent Plugins package for Kiro. It adds the `ghost-run` MCP server (tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, `blacklight`) and the `ghost-run` skill.

## Install

Install from the folder:

- Kiro Powers panel: Add Custom Power, then Import from folder, and select `integrations/power` in this repository.
- Kiro CLI: `kiro-cli powers install <path to this repository>/integrations/power`. The CLI copies the folder to `~/.kiro/powers/installed/ghost-run/`.

## Tool names

Kiro CLI 3.5.0 lists the tools as `blacklight`, `ghost_diff`, `ghost_run`, `ghost_trace`, and `wards_check`, and shows a call as `@ghost-run/ghost-run/wards_check` (power, server, tool). The names in the Kiro IDE are not confirmed yet.

## Which project the tools work on

An installed power's server starts in the power's install folder, so the working directory is not your project. The server picks the workspace root in this order:

1. The first `file://` root that the client reports through MCP roots (asked at the first tool call; refreshed on `notifications/roots/list_changed`). Neither Kiro CLI 3.5.0 nor Kiro IDE 1.4.236 declares roots.
2. The environment variable `GHOST_RUN_WORKSPACE`, when it is an absolute path of an existing folder.
3. The working directory, unless it is the server's own folder (the power folder).
4. The optional input `workspace` of every tool: the absolute path of your project root. It is used only when 1 to 3 give no root. It must be the absolute path of an existing folder (checked after links are resolved), and not `/`, not the home folder itself, and not the server's own folder. Each refusal names its reason.
5. Otherwise there is no root. Every tool then returns the error `Pass `workspace` (the absolute path of your project root) and call again. Workspace root unknown: the server has no project root of its own (set GHOST_RUN_WORKSPACE to give it one)` and does nothing else. The server never works on its own folder.

When a root exists from 1 to 3 and `workspace` is also given, but its real path differs, the tool returns `workspace does not match this server's workspace root` and does nothing. The input never moves a server that has its own root.

`PWD` is not a source. Kiro CLI sets it to the folder where you started it, but Kiro IDE sets it (and `VSCODE_CWD`) to the folder Kiro was launched from, which is not the project of the window. With two windows open it would silently pick the wrong project.

Every result names the resolved root in its first line (`Workspace root: ...`).

`mcp.json` cannot carry a placeholder for the project folder: Kiro passes `${workspaceFolder}`, `${workspaceRoot}`, `${cwd}`, and `${env:PWD}` literally. The skill tells the agent to pass `workspace` in every call. To pin a project instead, set `GHOST_RUN_WORKSPACE` in the environment that starts Kiro.

## Default wards

When the project has no wards file (no `wards.yaml` and no `apps/ghost-shell/wards.yaml` in the root, and no `GHOST_RUN_WARDS_FILE`), `wards_check` and `ghost_run` use built-in default wards with the same content as `apps/ghost-shell/wards.yaml`: `protect-data`, `no-data-loss`, and `no-secret-egress`. Each such result says so. Add a `wards.yaml` to the project to change them. A wards file that exists but is invalid is an error; the default is not used then.

## What you get

- Advisory tools and the skill only. The power installs no hooks and no steering files, so nothing enforces a verdict. Enforcement needs the Ghost_Gate hook from `integrations/kiro-hook`, which is part of the template's `.kiro/` folder.
- Without Docker and the built box image, `ghost_run` returns the Plan_B result (static analysis). That result does not claim that the real project was left unchanged.

## Full rehearsal

The power carries the box sources in `box/` (a byte-for-byte copy of `ghost-runner/box`, so the image tag is the same). Build the box image once:

```
node <power folder>/box/build.mjs
```

`<power folder>` is `integrations/power` in this repository, or `~/.kiro/powers/installed/ghost-run` after a CLI install. Docker must be running. Without the image, `ghost_run` gives the Plan_B result.

## Server bundle

`server/ghost-run-mcp.mjs` is a committed bundle. `box/` is committed with it. Build both with:

```
corepack pnpm --filter @ghost-run/mcp bundle
```

A test fails when the bundle is not a fresh build, or when `box/` differs from `ghost-runner/box`.

## Files

- `plugin.json`: plugin metadata.
- `mcp.json`: the stdio server entry, with a path relative to this folder.
- `skills/ghost-run/SKILL.md`: when and how to use the tools.
- `server/ghost-run-mcp.mjs`: the server bundle.
- `box/`: the box image sources.

# Ghost Run power

An Agent Plugins package for Kiro. It adds the `ghost-run` MCP server (tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, `blacklight`) and the `ghost-run` skill.

## Install

1. Open the Kiro Powers panel.
2. Choose Add Custom Power.
3. Import from folder and select `integrations/power` in this repository.

## What you get

- Advisory tools and the skill only. The power installs no hooks and no steering files, so nothing enforces a verdict. Enforcement needs the Ghost_Gate hook from `integrations/kiro-hook`, which is part of the template's `.kiro/` folder.
- Without Docker and the built box image, `ghost_run` returns the Plan_B result (static analysis). That result does not claim that the real project was left unchanged.

## Server bundle

`server/ghost-run-mcp.mjs` is a committed bundle. Build it with:

```
corepack pnpm --filter @ghost-run/mcp bundle
```

The bundle is produced by task 15.2 and is not part of this folder until that task is done.

## Files

- `plugin.json`: plugin metadata.
- `mcp.json`: the stdio server entry, with a path relative to this folder.
- `skills/ghost-run/SKILL.md`: when and how to use the tools.

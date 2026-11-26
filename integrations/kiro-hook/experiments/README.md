# Host-check hooks

These four hook files were used to measure what Kiro does with hooks. They are not product hooks, so they are not in `.kiro/hooks/`. The six product hooks are there. Every file here is `enabled: false`, and `tests/probe-disabled.test.mjs` and `tests/hook-files.test.mjs` keep them off.

| File | What it proved | Script it runs |
|---|---|---|
| `probe-host-facts.json` | Which triggers fire in Kiro CLI and Kiro IDE (Pre and Post Tool Use, file save, create, delete), what the event on STDIN looks like, how entry-level and action-level `timeout` behave, and which exit codes and STDOUT the host reads. | `../probe-host-facts.mjs` |
| `probe-ask.json` | A Pre Tool Use hook can answer `ask`: both hosts show a prompt with the reason, and Deny blocks the call. This is why the gate uses `ask` for the `warn` verdict. | `../probe-host-facts.mjs --ask-test` |
| `exp-b-block-rm-rf.json` | Experiment B: a pattern-based block of `rm -rf` variants in shell commands. 19 blocks, all false positives or bypassed. The gate therefore decides from the diff of a ghost run, not from the shape of a command. | `../exp-b-gate.mjs shell` |
| `exp-b-log-write.json` | Experiment B: logs write tool names to learn the tool-name shape. | `../exp-b-gate.mjs write` |

## Where the results are

- `docs/measurements.md`: "Probe results" (host facts), "Host checks before enabling the gate" (sections 17.1 to 17.4, including the `ask` probe).
- `docs/devlog.md`: the Experiment B record (dated; not edited).

## Run one again

1. Copy the file into `.kiro/hooks/`, for example `cp integrations/kiro-hook/experiments/probe-ask.json .kiro/hooks/`.
2. Set `enabled` to `true` in the entries you want (or switch them in Kiro's hook panel).
3. In the IDE, reload the window. In the CLI, start a new session. A hook created during a session applies from the next session.
4. Probe events are written to `.ghost-run/probe/events.jsonl`, which is git-ignored.
5. When you are done, set `enabled` back to `false` and delete the copy from `.kiro/hooks/`. Do not leave an `exp-b-*` file enabled next to the gate: it blocks by command shape and would double-block.

The commands in these files use paths relative to the repository root (`node integrations/kiro-hook/...`), so they work from the copy in `.kiro/hooks/` without change.

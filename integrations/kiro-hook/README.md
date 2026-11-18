# Ghost Run+ Kiro hooks (`@ghost-run/kiro-hook`)

Hook scripts that connect Ghost Run+ to Kiro (IDE and CLI). Each script reads one Hook_Event as JSON on STDIN and is registered by a file in `.kiro/hooks/`. Node.js 20 or later, ECMAScript modules, no LLM call, no network call.

| Hook | Script | Trigger | What it does |
|---|---|---|---|
| ghost-gate | `ghost-gate.mjs` | Pre Tool Use, matchers `shell` and `write` | Rehearses a shell command in the Docker box (ghost run), judges the diff with the wards, and blocks the real call on a violation. Judges a file write by its target path. |
| ghost-log | `ghost-log.mjs` | Post Tool Use | Records what the agent read (provenance) and session statistics in `.ghost-run/`. Never changes a verdict. |
| contract-pbt | `contract-pbt.mjs` | File save under `core/` or `worlds/` | Runs the contract property tests briefly (Short_Run) and writes `.ghost-run/pbt/last.json`. |
| world-scaffold | `world-scaffold.mjs` | File create under `worlds/<name>/` | Generates the registration, test, wards, and README files of a new world. |
| blacklight-steering | `blacklight-steering.mjs` | File save under `.kiro/` | Reports hidden Unicode in steering, spec, and hook files. |

State of the hook files in this repository: every file in `.kiro/hooks/` is `enabled: false`, including the probe hook files (task 1.8; `tests/probe-disabled.test.mjs` keeps them off). The gate is switched on by a human in task 19.1 after the checklist there. Facts that no probe settled are marked "not confirmed".

## Claims and non-claims

P1 to P8 are the properties of the world contract. A component asserts a property only inside the scope in this table.

| Property | Claimed here | Not claimed |
|---|---|---|
| P1 ghost never changes reality | Per run, only when the run result has `isolation.p1Claimed` equal to `true` (Docker box, mount audit passed, original fingerprint unchanged). The gate reports the flag and never raises it. P1 is never claimed as a property of the hook. | Plan B (no Docker); safe-list commands (not rehearsed); write-tool judgments (no ghost); MCP `wards_check` and `blacklight` (no ghost) |
| P2 a passing plan gives the same diff when run for real | Not claimed. The repository world is `deterministic: false`. | Every gate run |
| P3 restore | Not asserted here | n/a |
| P4 stricter wards never add passing plans | Evidence comes from `core`. The gate and the MCP server use the same engine. | n/a |
| P5 protected paths are not deleted or overwritten by a passing plan | For a shell run where P1 holds, and for a write-tool judgment of the target path as resolved at judgment time | Plan B; safe-list commands; effects of a tool on paths other than the declared target; changes made between judgment and execution |
| P6 secret read, then unapproved network attempt, is blocked | Within one tool call, for a run where `isolation.p6Claimed` is `true` | Plan B; a secret read in one tool call and a network attempt in a later call; safe-list commands; compression, encryption, and DNS exfiltration under content inspection (the action criterion only) |
| P7 hidden Unicode is flagged | `blacklight-steering` and the MCP `blacklight` tool call the pure scanner of `possession` | Invisible characters outside the possession categories; "clean" does not mean free of injected instructions |
| P8 | n/a | Ghost Hand only |

Claims by component:

| Component | Claims | Does not claim |
|---|---|---|
| ghost-gate, shell, Docker box | P1, P5, P6 per run, from the `isolation` flags of that run | P2; P6 across tool calls; that a `pass` is an approval |
| ghost-gate, shell, Plan B | Nothing. The message says that P1 isolation is not guaranteed and that P5 and P6 are not guaranteed. The verdict is at least `warn`. | P1, P5, P6 |
| ghost-gate, safe command | Nothing (not rehearsed) | P1, P5, P6 |
| ghost-gate, write tools | P5 for the declared target path | P1 (no ghost); P6; protection of other files that a code-edit touches |
| ghost-gate, tools outside the matchers | Nothing | Everything |
| ghost-log | Records only what the hook receives | P6 across calls; any effect on a verdict |
| contract-pbt | Evidence at 100 examples (20 for Docker-bound properties) per property on save | A proof |
| world-scaffold | Generated worlds claim no P2 | Any property |
| blacklight-steering | P7 as the pure scan of `possession` | That `clean` means free of injected instructions |

## What the gate is, and is not

- The gate is a seatbelt for an agent that makes mistakes or is manipulated. It is not a full isolation tool.
- Text analysis does not catch every injection. Compression, encryption, and DNS exfiltration of a secret are caught by the action criterion only.
- The gate, the Ghost_Log, and the MCP server run on the host. They are not tamper-resistant against a process that has the privileges of the developer.
- A `pass` verdict means that no ward was violated in the rehearsal. It is not an approval of the real command, and the real run can differ from the ghost run (P2 is not claimed). The gate never emits the permission decision `allow`.
- One tool call is one Plan. A secret read in one tool call and a network attempt in a later tool call are not linked. See [cross-call exfiltration](docs/cross-call-exfiltration.md).
- Tools outside the matchers are outside the gate: a tool of an MCP server other than `ghost-run`, and web tools.
- The gate rehearses only when Docker and the box image are available. Without them the run is Plan B (static analysis): P1, P5, and P6 are not claimed, the message says so, and the verdict is at least `warn`. Supported platforms are macOS and Linux. Windows is unverified.

## Safe list

A command on the safe list is not rehearsed. The gate lets it through after a grammar check and writes a `safe-skip` statistics line. The gate claims nothing for such a command (no P1, no P5, no P6).

The built-in entries are `pwd`, `ls` (options `-a`, `-l`, `-la`, `-al`), `cat`, `head` and `tail` (option `-n` with an integer), `wc` (options `-l`, `-w`, `-c`), `git status`, `git diff`, `git log`, `git show`, `git branch`, and `echo`. A path word that matches a secret pattern of an egress ward is not safe. Any line with a control character, `;`, `&`, `|`, `<`, `>`, a backtick, `$`, or a backslash, and any command name that can run other programs, goes to the ghost. A line that cannot be proven safe is not safe.

The wards file can add entries with `safe_commands`. Extension entries use the entry shape of `lib/gate/safe-list.mjs` and an invalid entry is dropped and counted. The string form of the default wards file (`safe_commands: [ls, pwd, ...]`) is not an extension entry and is dropped today; its words are covered by the built-in list.

## Host facts this package depends on

Facts below are measured with Kiro CLI 3.4.0 (probe, 2026-11-18) and Kiro IDE 1.4.215 (probe, 2026-11-19), `docs/measurements.md`, heading `Probe results`. The IDE run was driven by Claude Code operating the IDE screen. Where a fact names only one host, the other host did not show it.

- A file event fires only for a file that the agent changed. An edit that a human makes in the editor does not fire it.
- The IDE runs hooks only for a trusted folder, after a window reload that follows the trust decision. A hook that is created during a session applies from the next session. Not confirmed in the IDE run: the window reload was not done, so this statement rests on the documentation. In that run the Agent Hooks panel listed the probe entries as enabled and every message left hook records.
- In the CLI the `write` matcher also covers the file-delete tool `delete_file`.
- The matcher of a file-event hook is a regular expression over the file path.
- A file event has the STDIN fields `cwd`, `file_path`, `hook_event_name`, and `session_id`. Creating a file with the write tool fires `PostFileCreate` and then `PostFileSave` (CLI and IDE). `PostFileDelete` is not confirmed in either host: neither default agent has a delete tool, and a delete by shell fires no file event. The raw form of `file_path` (absolute or workspace-relative) is not confirmed.
- Post Tool Use carries the response in `tool_response`. A call blocked with exit code 2 fires no Post Tool Use (CLI and IDE). The IDE default agent has no `code` tool.
- The STDOUT of a file-event hook does not reach the agent in the CLI or the IDE. The hooks therefore also write a result file under `.ghost-run/`.
- `timeout` is honored at entry level of a hook and ignored inside `action` (CLI and IDE). All hook files here use the entry-level field.
- A file created or changed by a shell command fires no file event, so the file-event hooks do not see it.

## Hook notes

**ghost-gate.** One tool call is rehearsed as one Plan. The gate has a watchdog of 50 s and gives the runner at most 44 s. A command that needs longer is denied with the line `GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed.` A human then runs that command outside the gate. `WARN_MODE` in `gate-config.mjs` is `exit2`: a `warn` verdict is delivered as a block with exit code 2 and the warn message, and the human runs the command outside the agent. Whether the host prompt for `ask` works in both hosts is pending (task 17.3). The gate answers every failure with exit code 2 (fail closed): a crash, a timeout, a missing wards file, a missing build, or a bad runner result. The text of a command that contains `ghost-run approve` is denied: that name is reserved for humans.

A change under `.kiro/hooks/**`, `integrations/kiro-hook/**`, `integrations/mcp/**`, `.ghost-run/**`, or the resolved wards file gets at least `warn`. This protects the gate against edits that the agent makes through the tools the gate judges. It does not protect against an edit by a human or by a process outside the agent. The consequence for developing this repository: the gate asks for a human when the agent edits the gate. The human runs the change outside the agent, or disables the hook (see below).

**Failure before Node starts.** If the `node` binary is missing, the shell exits with code 127. The CLI lets the call through on an exit code other than 2. The gate cannot prevent this. Pending (task 17.2) for the observed behavior in both hosts.

**Disable path.** The only supported way to switch the gate off is that the human sets `enabled` to `false` in the hook entry (Kiro hooks panel or the file). The gate reads no environment variable and no workspace file that disables it, because an agent can write to both.

**Fresh clone.** The scripts import the built `core`, `ghost-runner`, and `wards-config`. On a fresh clone the human runs `corepack pnpm -r build` once outside the gate, because the gate blocks the agent's own build command. Until then the gate prints `GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).` and exits with code 2.

**ghost-log.** It records only what the hook receives. Text that the agent obtained in another way (a tool outside the matchers) is not recorded. The red thread (`ghost_trace`) finds literal occurrences only.

**contract-pbt.** The run is evidence at 100 examples per property (20 for Docker-bound ones), not a proof. The hook fires only for files that the agent saved. The internal deadline is 55 s inside the 60 s host limit. The result file is `.ghost-run/pbt/last.json`.

**world-scaffold.** The hook fires only for files that the agent created. Registering a world in the playground tab is owned by the UI kit and the apps. The generated files claim no P2.

**blacklight-steering.** The hook sees only files that the agent saved. The HTML comment category applies to markdown files and flags a comment inside a code fence. It detects no invisible character outside the possession categories, and text analysis does not catch every injection.

## Experiment B

`exp-b-gate.mjs` and `.kiro/hooks/exp-b-*.json` were a measurement of a pattern-based block (19 blocks, all false positives or bypassed). They are kept, disabled, and nothing imports them. The gate decides from the diff of a ghost run, not from the shape of a command.

## Build, test, and timing

```
corepack pnpm -r build
corepack pnpm --filter @ghost-run/kiro-hook test
corepack pnpm --filter @ghost-run/kiro-hook typecheck
corepack pnpm --filter @ghost-run/kiro-hook lint
```

`GHOST_PBT_MODE=nightly` runs the properties at 10,000 examples. Tests labeled `[docker]` need a running Docker daemon and the built box image; without them they report `skipped (docker unavailable)`. Timing results are in `docs/measurements.md` (entry `kiro-integration task 16.2`).

A test run must leave no new file in the working tree. `tests/global-hygiene.mjs` compares `.ghost-run/` (without `probe/`) and the untracked files under `integrations/` and `.kiro/hooks/` before and after the run, and fails the run on a new file.

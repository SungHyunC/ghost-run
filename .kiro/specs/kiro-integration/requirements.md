# Requirements Document

## Introduction

The `kiro-integration` spec defines how Ghost Run+ plugs into Kiro (IDE and CLI). It covers five hooks, one MCP server, and one Kiro power:

1. **ghost-gate** (Pre Tool Use, `shell` and `write`): runs every shell command that is not on a read-only safe list as a ghost inside the Docker box through `runPlan` of `ghost-runner`, judges the result by diff with the Ward_Engine, and blocks the real tool call when a ward is violated. File write and delete tools are judged by their target path.
2. **ghost-log** (Post Tool Use): records what the agent read in the Provenance_Record format of `possession`, and the statistics of the session, in a git-ignored folder inside the repository.
3. **contract-pbt** (file save, `core/**` and `worlds/**`): runs the contract property tests briefly on save.
4. **world-scaffold** (file create, `worlds/*/`): generates the registration, test, and documentation files of a new world.
5. **blacklight-steering** (file save, `.kiro/**`): reports hidden characters in steering, spec, and hook files through the Scan_Entry_Point of `possession`.
6. **MCP server `ghost-run`** (`integrations/mcp/`): the tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, and `blacklight`.
7. **Kiro power** (`integrations/power/`): `plugin.json`, `skills/ghost-run/SKILL.md`, and `mcp.json` in the Agent Plugins format.

The spec also states what happens to the two experiment B hooks once ghost-gate is in place (Requirement 21), and it makes a probe hook the first implementation task (Requirement 24), because several host facts about file events and Post Tool Use are not yet confirmed.

**Host facts observed from real hook logs.** Kiro IDE 1.4.215 and Kiro CLI 3.4.0 (V3) behave the same for these facts:

- A Pre Tool Use Hook_Event has the top-level fields `hook_event_name`, `cwd`, `session_id`, `tool_name`, and `tool_input`.
- The `shell` matcher catches the tool `execute_bash`, with the `tool_input` fields `command`, `cwd`, `description`, `run_in_background`, and `timeout`.
- The `write` matcher catches five tools: `fs_write` (`path`, `text`), `str_replace` (`path`, `oldStr`, `newStr`, `replace_all`), `fs_append` (`path`, `text`), `delete_file` (`targetFile`, `explanation`), and `code` (a code-edit tool, for example symbol rename; fields such as `operation`, `file_path`, `path`, `symbol_name`, `new_name`, and `replacement`).
- A hook entry has the fields `name`, `description`, `trigger` (PascalCase), `matcher`, `action` (`type` equal to `command` or `agent`), `timeout` (seconds, default 60, 0 means none), and `enabled` (default `true`), as documented at kiro.dev/docs/hooks.
- Only the file-event trigger `PostFileSave` is confirmed for the IDE. The name of the file-create trigger, the STDIN fields of file events, whether Post Tool Use delivers the tool response, and whether a blocked call fires Post Tool Use are not confirmed for the IDE (Requirement 24, Open Items).
- Resolved for Kiro CLI 3.4.0 only (2026-11-18, `docs/measurements.md`, heading `Probe results`). IDE result pending, re-check after task 1.4. In the CLI: creating a file with the write tool fires `PostFileCreate` and then `PostFileSave`; a file event has the STDIN fields `cwd`, `file_path`, `hook_event_name`, and `session_id`, so the path field is `file_path`; Post Tool Use carries the field `tool_response`, which is not an object; a call blocked with exit code 2 fires no Post Tool Use; the STDOUT of a file-event hook does not reach the agent; `timeout` is honored at entry level and ignored inside `action`. `PostFileDelete` was not confirmed, because the CLI default agent has no delete tool, and a delete by shell fires no file event.

**Why the gate judges by diff.** Experiment B (`docs/devlog.md`) blocked 19 tool calls with a pattern hook. All 19 were Kiro removing its own temporary files or commands that were not deletions, and after each block Kiro did the same thing with a bare `rm` or `mv`. A command shape is neither necessary nor sufficient. ghost-gate therefore decides from what a ghost run changed, as `docs/plan.md` requires.

**Decision on `world-smith`.** The custom CLI agent `world-smith` (writes new worlds) is NOT part of this spec. It is a development-time agent configuration under `.kiro/agents/` with no runtime code, no safety property, and no hook behavior. It consumes the output of world-scaffold and the registration gate of `core-contract` Requirement 12, so it can only be specified after this spec and the world registration shape (Requirement 16, criterion 11) exist. It belongs to a separate small spec (`world-smith`) that depends on this one. This spec only guarantees that world-scaffold output is a complete starting point for that agent (Requirement 16).

**Dogfooding limit.** A gate that blocks the agent also blocks the agent that develops the gate. Requirement 8 and Requirement 10 state how this repository avoids a deadlock without a silent bypass.

This spec reuses the names of the sibling specs and defines no second shape for them: `runPlan`, `RunPlanOptions`, `RunOutput`, `RunResult`, `Isolation`, `Diagnostic`, `ShellAction`, and `Plan` of `ghost-runner`; `WardEngine.evaluate`, `WardSet`, `WardVerdict`, `WardViolation`, `WardNotice`, `GhostReport`, `Change`, `Effect`, `ObservedEvent`, `SecretValues`, and `Verdict` of `core`; `parseWards`, `loadWardsFile`, `formatConfigError`, and `Config_Error` of `wards-config`; the Message_Builder, the Display_Escaper-equivalent sanitizer (`sanitizeJudgeText`), `extractCanaries`, and `claims` of `wards`; `scanText`, `scanFiles`, `scanTexts`, `formatReport`, `exitCodeFor`, `collectNeedles`, `traceRedThread`, `Provenance_Record`, `Provenance_Log`, `serializeProvenanceLog`, and `parseProvenanceLog` of `possession`; and `Grave_Entry` of `ui-kit`.

Safety claims follow the world-contract steering ("Claimed in" column). Each hook and tool states the claims it makes and the claims it does NOT make:

| Property | Claimed by this spec | Not claimed |
|---|---|---|
| P1 ghost never changes reality | Only for a gate run whose `RunResult.isolation.p1Claimed` is `true` (Docker box, mount audit passed, Original fingerprint unchanged). The gate reports the flag; the gate never raises it. | Plan B (no Docker); safe-list commands (not rehearsed); write-tool judgments (no ghost); MCP `wards_check` and `blacklight` (no ghost) |
| P2 passing plan yields the same diff when run for real | Not claimed (the Repo_World is `deterministic: false`) | Every gate run |
| P3 restore | Not asserted by this spec | n/a |
| P4 stricter wards never add passing plans | Evidence comes from `core`; the gate and the MCP server use the same engine | n/a |
| P5 protected paths are never deleted or overwritten by a passing plan | For a gate shell run where P1 holds, and for a write-tool judgment of the target path as resolved at judgment time | Plan B; safe-list commands; effects of a tool on paths other than the declared target; changes made between judgment and execution (time-of-check to time-of-use) |
| P6 secret read then unapproved network attempt is blocked | Within ONE tool call, for a gate run where `isolation.p6Claimed` is `true` | Plan B; a secret read in one tool call followed by a network attempt in a later tool call; safe-list commands; compression, encryption, and DNS exfiltration under content inspection (action criterion only) |
| P7 hidden Unicode is flagged | blacklight-steering and the MCP `blacklight` tool call the pure scanner of `possession` | Invisible characters outside the possession categories; text analysis does not catch every injection |
| P8 | n/a | Ghost Hand only |

Hidden characters are never written literally in this document. A hidden character is named by its code point (for example U+200B). Hosts in examples use reserved domains (for example `setup-check.example`), and secrets are canary values (for example `sk-CANARY-abc123`).

## Glossary

- **Ghost_Gate**: The Pre Tool Use hook script `integrations/kiro-hook/ghost-gate.mjs`, registered by `.kiro/hooks/ghost-gate.json`.
- **Ghost_Log**: The Post Tool Use hook script `integrations/kiro-hook/ghost-log.mjs`, registered by `.kiro/hooks/ghost-log.json`.
- **Contract_Pbt_Hook**: The file-save hook script `integrations/kiro-hook/contract-pbt.mjs`.
- **World_Scaffold_Hook**: The file-create hook script `integrations/kiro-hook/world-scaffold.mjs`.
- **Blacklight_Hook**: The file-save hook script `integrations/kiro-hook/blacklight-steering.mjs`.
- **Hook_Package**: The pnpm workspace package `@ghost-run/kiro-hook` in `integrations/kiro-hook/`.
- **Mcp_Package**: The pnpm workspace package `@ghost-run/mcp` in `integrations/mcp/`; it holds the MCP_Server.
- **MCP_Server**: The stdio MCP server named `ghost-run`.
- **Power_Folder**: The folder `integrations/power/` with `plugin.json`, `skills/ghost-run/SKILL.md`, and `mcp.json`.
- **Hook_Event**: The JSON document that Kiro writes to the STDIN of a hook command, with the fields `hook_event_name`, `cwd`, `session_id`, `tool_name`, and `tool_input` (for a tool event).
- **Gate_Decision**: The result of the Ghost_Gate for one Hook_Event: `allow` (exit code 0), or `deny` (exit code 2).
- **Safe_List**: The set of read-only command forms that skip the ghost run, defined by a grammar (Requirement 4): the built-in grammar entries plus the optional entries of the `safe_commands` key of the Wards_File.
- **Safe_Command**: A command line that is one simple command and matches a grammar entry of the Safe_List (command name plus allowed arguments) under the rules of Requirement 4.
- **Target_Path_Field**: A field of `tool_input` that names the file or directory a write tool acts on: `path`, `targetFile`, or `file_path` (Requirement 6, criterion 11).
- **Probe_Hook**: The temporary hook of Requirement 24 that records only paths and field names of host events.
- **Tool_Call_Plan**: The Plan of exactly one ShellAction `{ command, cwd? }` that the Ghost_Gate builds from one shell tool call.
- **Write_Judgment**: The judgment of a file write or delete tool call by its target path (Requirement 6).
- **Judge_Inputs**: The WardSet loaded through `wards-config` and, for the secret check, the `secretValues` that `runPlan` reads from the Copy.
- **Wards_File**: The file that holds the WardSet, resolved by the rule of Requirement 3, criterion 7.
- **Ghost_Store**: The git-ignored folder `.ghost-run/` in the workspace root that holds the files written by the hooks and the MCP_Server (Requirement 12).
- **Session_Key**: The `session_id` of a Hook_Event when it matches `^[A-Za-z0-9_-]{1,64}$`, and otherwise the lowercase SHA-256 hexadecimal digest of the `session_id`.
- **Run_Record**: The stored serialized `RunResult` of one run, without payload bytes, in `.ghost-run/runs/<id>.json`.
- **Run_Id**: The `runId` of a `RunResult`, or a random UUID for a Write_Judgment.
- **Grave_Id**: The string `g-<Run_Id>`; it matches `^[A-Za-z0-9_-]{1,64}$`, the pattern of the ward messages and of `ui-kit`.
- **Stats_Event**: One line of `.ghost-run/stats.jsonl` with the fields `kind` and `at` only (Requirement 13).
- **Approval_Channel**: The mechanism by which a human approves one `warn` tool call (Requirement 10).
- **Self_Protected_Paths**: The paths `.kiro/hooks/**`, `integrations/kiro-hook/**`, `integrations/mcp/**`, the Wards_File, and `.ghost-run/**`.
- **Short_Run**: The save-time property-based test run: the count per property that the owning spec sets (100 per property for `core` properties, 20 per property for the Docker-bound Repo_World properties, `ghost-runner` Requirement 17 criterion 8), finishing within 60 s.
- **Hook_Limit**: The 60 s default execution limit of a Kiro hook command.
- **Reference_Machine**: An Apple M1 machine, as in the `ghost-runner` spec.
- **Median_Of_5**: As defined in the `ghost-runner` spec.
- **Plan_B**: The static-analysis fallback of `ghost-runner` (`isolation.mode` equal to `static-analysis`).
- **Canary**: A fake secret value such as `sk-CANARY-abc123`.

## Requirements

### Requirement 1: Package Placement, Dependency Direction, and Purity

**User Story:** As a maintainer, I want the integration code placed so that the dependency direction of the structure steering holds and the hooks stay fast and LLM-free, so that `core/` stays free of Kiro code.

#### Acceptance Criteria

1. THE Hook_Package SHALL be a pnpm workspace package in `integrations/kiro-hook/` with the package name `@ghost-run/kiro-hook`, THE Mcp_Package SHALL be a pnpm workspace package in `integrations/mcp/` with the package name `@ghost-run/mcp`, and both SHALL be listed in `pnpm-workspace.yaml`.
2. THE Hook_Package scripts SHALL be ECMAScript modules with the extension `.mjs` for Node.js 20 or later, SHALL carry JSDoc types, and SHALL pass the TypeScript compiler with `checkJs` enabled and `strict` enabled.
3. THE Hook_Package and the Mcp_Package SHALL import `core` only through the public entry point of `@ghost-run/core`, `ghost-runner` only through the public entry point of `@ghost-run/ghost-runner`, and `wards-config` only through `@ghost-run/wards-config` (and its subpath `@ghost-run/wards-config/node` for file reading); they MAY import `@ghost-run/ui` for the `Grave_Entry` type through `import type`.
4. THE `core/`, `ui/`, `ghost-runner/`, and `wards-config/` packages SHALL contain no import path that resolves to `integrations/`; the ESLint `no-restricted-imports` rule of each package SHALL enforce this and `pnpm lint` SHALL fail when the rule is violated.
5. THE hook scripts and the MCP_Server SHALL contain no call to any LLM API, no `eval`, no `new Function`, and no dynamic code execution, and a source-scan test SHALL fail when one appears.
6. THE hook scripts SHALL start no process other than the Docker CLI calls that `runPlan` makes, the test runner of the Contract_Pbt_Hook, and Node.js itself; the Ghost_Gate SHALL pass the command text of a tool call to `runPlan` as a ShellAction value and SHALL NOT interpolate it into a shell command line of the host.
7. THE hook scripts SHALL read the clock and the environment only for the Ghost_Store timestamps (Requirement 12) and for the environment variables named in this spec (`GHOST_RUN_WARDS_FILE`, `GHOST_RUN_SEANCE_BASE`); the pure judgment functions SHALL read neither.
8. BEFORE the Hook_Package and the Mcp_Package are merged, THE repository README dependency table SHALL list every new dependency with name, version, and license, including `@modelcontextprotocol/sdk` 1.32.2 (MIT, Node.js 18 or later) and `zod` 4.6.7 (MIT; the SDK peer range is `^3.25 || ^4.0`), and the license of each SHALL be checked on the day it is added.
9. THE tasks.md of this spec SHALL contain a task that updates `.kiro/steering/structure.md` so that the dependency direction states: `integrations/*` may depend on `core/` and `ui/` and, through their public entry points, on `ghost-runner/` and `wards-config/`; this requirements phase edits no steering file.
10. THE Ghost_Gate SHALL load wards through `wards-config` only (Requirement 3, criterion 7) and SHALL implement no ward rule, glob matcher, host matcher, content inspector, or message text of its own.

### Requirement 2: Hook Registration Files and Host Behavior

**User Story:** As a developer, I want the hooks registered as plain files that Kiro IDE and Kiro CLI both read, so that the gate works in both and can be reviewed in a pull request.

#### Acceptance Criteria

1. THE repository SHALL contain these hook files in `.kiro/hooks/`: `ghost-gate.json`, `ghost-log.json`, `contract-pbt.json`, `world-scaffold.json`, and `blacklight-steering.json`; each entry SHALL use the documented entry fields `name`, `description`, `trigger` (PascalCase), `matcher`, `action` (`type` and `command`), `timeout`, and `enabled`, and the placement of `timeout` (entry level or inside `action`) SHALL match the format on which the existing experiment hook files in `.kiro/hooks/` and the documentation at kiro.dev/docs/hooks agree; the format test of criterion 10 SHALL check that placement, and the design records the result of the comparison.
2. THE `action.type` of every hook of this spec SHALL be `command` (a Shell Command action that runs locally and consumes no Kiro credits), and THE `command` of each hook SHALL be a relative path of the form `node integrations/kiro-hook/<script>.mjs` that contains no user name and no absolute path.
3. THE `timeout` of every hook SHALL be a number from 1 to 60 (the Hook_Limit; the value 0 means no limit in the host and is not used), and THE `enabled` field SHALL be present and explicit in every hook entry.
4. THE `ghost-gate.json` file SHALL register the trigger `PreToolUse` for the tool categories `shell` and `write`; WHERE one matcher cannot cover both categories in the host, THE file SHALL hold two hook entries with the same `command`, one per category (the experiment B files used one matcher each); the ghost-gate SHALL identify the tool by `tool_name` from the Hook_Event and not by a command-line argument (Design Decision D2).
5. THE matchers of `ghost-gate.json` SHALL NOT match tools of the `@mcp` and `@powers` sources, so that the MCP tools of Requirement 18 do not pass through the Ghost_Gate.
6. THE `ghost-log.json` file SHALL register the trigger `PostToolUse` with a matcher that covers the `read`, `web`, and `shell` categories and the `@mcp` source (the Post Tool Use tool events that Ghost_Log records, Requirement 13).
7. THE `contract-pbt.json` and `blacklight-steering.json` files SHALL register the trigger `PostFileSave` (a documented file event), with the file-path regexes `^(core|worlds)/` and `^\.kiro/` respectively, and THE `world-scaffold.json` file SHALL register the file-create event with the path regex `^worlds/[^/]+/` ; the exact identifier of the file-create event (candidate: `PostFileCreate`) SHALL be confirmed by the Probe_Hook of Requirement 24 before `world-scaffold.json` is written (Open Item 1), and no identifier SHALL be guessed. Resolved (CLI 3.4.0, 2026-11-18): the CLI fires `PostFileCreate` for a file that the write tool creates, so `world-scaffold.json` may be written for the CLI with that identifier. IDE result pending, re-check after task 1.4; the IDE identifier is not claimed.
8. THE README SHALL state the host facts that this spec depends on: a file event fires only for a file that the agent changed and not for an edit that a human makes in the editor; in the IDE, hooks run only when the folder is trusted and the window was reloaded after the folder was trusted; a hook created during a session applies from the next session; in the CLI, the `write` matcher also covers the file-delete tool (`delete_file`); and the file-event matcher is a regular expression over the file path.
9. THE tasks.md of this spec SHALL contain a task that verifies, in Kiro IDE and in Kiro CLI, the exit-code behavior of Requirement 7, and records the result in `docs/devlog.md`.
10. THE repository SHALL contain a test that parses each hook file of this spec as JSON and requires: `version` equal to `v1`, a non-empty `name`, a known `trigger`, a `matcher` that compiles as a regular expression where the trigger is a file event, `action.type` equal to `command`, a `timeout` of 1 to 60 at the placement of criterion 1, an explicit `enabled`, and a `command` whose script file exists.

### Requirement 3: ghost-gate Input, Tool Classification, and Configuration

**User Story:** As the gate, I want to read the hook input defensively and know what kind of tool call I judge, so that hostile or malformed input can never produce a pass.

#### Acceptance Criteria

1. WHEN the Ghost_Gate starts, THE Ghost_Gate SHALL read the whole STDIN as UTF-8, up to 1 MiB, and SHALL parse it as a JSON object with the fields `hook_event_name`, `cwd`, `session_id`, `tool_name`, and `tool_input`.
2. IF STDIN is longer than 1 MiB, is not valid JSON, is not an object, lacks `tool_name` or `tool_input`, or has `hook_event_name` other than `PreToolUse`, THEN THE Ghost_Gate SHALL return `deny` with exit code 2 and a message that names the field, without throwing (fail closed, Requirement 8).
3. THE Ghost_Gate SHALL classify the call by `tool_name` as `shell` (the tool `execute_bash`, with the `tool_input` fields `command`, `cwd`, `description`, `run_in_background`, and `timeout`), `write` (the tools `fs_write`, `str_replace`, `fs_append`, `delete_file`, and `code`), or `unknown`; the Ghost_Gate SHALL NOT judge a write tool by its name alone, and SHALL read every Target_Path_Field (`path`, `targetFile`, `file_path`) that is present in `tool_input`; the design SHALL record, per tool, the Target_Path_Fields and the text fields, and a test SHALL check them against the logged tool schemas.
4. IF a call has a `tool_name` that the Ghost_Gate does not know although the host delivered it through a registered matcher, or a write tool call has no Target_Path_Field with a non-empty string value, or a Target_Path_Field has a non-string value, THEN THE Ghost_Gate SHALL follow the fail-closed rule of Requirement 8: `deny` with exit code 2 and the message `tool or input not recognized by the gate: not allowed.`; the Ghost_Gate SHALL NOT lower this case to `warn`.
5. THE Ghost_Gate SHALL accept `cwd` of the Hook_Event as the workspace root, and SHALL accept `tool_input.cwd` of a shell call when it is a path inside the workspace root after resolution (converted to a Copy-relative `ShellAction.cwd`).
6. IF `tool_input.cwd` of a shell call resolves outside the workspace root, THEN THE Ghost_Gate SHALL NOT start a ghost for it, SHALL set the verdict to `warn`, and SHALL name the notice `step 0: cwd outside the workspace, not rehearsed.`
7. THE Ghost_Gate SHALL resolve the Wards_File in this order and with this single shared function (also used by the MCP_Server): the environment variable `GHOST_RUN_WARDS_FILE` WHEN set, otherwise `wards.yaml` in the workspace root, otherwise `apps/ghost-shell/wards.yaml`; THE Ghost_Gate SHALL load it with `loadWardsFile` of `@ghost-run/wards-config/node`.
8. IF the Wards_File is missing or `loadWardsFile` returns errors, THEN THE Ghost_Gate SHALL return `deny` with exit code 2, SHALL print at most 5 errors formatted by `formatConfigError`, and SHALL NOT evaluate a partial WardSet.
9. THE Ghost_Gate SHALL pass every untrusted string (command, path, ward id) that it prints through the sanitizer of `wards` (Requirement 17, criterion 7 of that spec: control and hidden characters become `\u{HEX}`, values longer than 120 characters are truncated).
10. THE Ghost_Gate SHALL print nothing to STDOUT or STDERR other than the messages that this spec defines.

### Requirement 4: Safe List

**User Story:** As a developer, I want read-only commands to run without a ghost, so that the gate does not add latency to `ls` and `git status`.

#### Acceptance Criteria

1. THE Ghost_Gate SHALL skip the ghost run (and return `allow`) for a shell call only WHEN the command line is a Safe_Command.
2. THE built-in Safe_List grammar SHALL consist of exactly these entries, each a command name plus the allowed arguments: `pwd` (no argument); `ls` with the options `-a`, `-l`, `-la`, and `-al` and path words; `cat`, `head`, `tail`, and `wc` with path words and no option other than `-n <integer>` for `head` and `tail` and `-l`, `-w`, `-c` for `wc`; `git status`, `git diff`, `git log`, `git show`, and `git branch` with no further word except path words after `--` for `git diff` and `git log`; and `echo` with word arguments. The Safe_List is matched by this grammar and not by comparing the whole command string.
3. THE Ghost_Gate SHALL classify a command line as a Safe_Command only WHEN all of these hold: the line parses (single-quoted, double-quoted, and unquoted words) into exactly one simple command whose name and arguments match a grammar entry; the line contains none of `;`, `&&`, `||`, `|`, `<`, `>`, `&`, a backtick, `$(`, `${`, `$` followed by a name character, a glob character `*`, `?`, or `[` in a word, or a newline (so any `;`, `&&`, pipe, or redirect removes the command from the Safe_List); no word begins with `~` or contains `..` as a path segment; and no option appears that the grammar entry does not list (for example `git diff --output=file` and `git log --output=file` are not safe).
4. IF a command line cannot be parsed, THEN THE Ghost_Gate SHALL classify it as not safe and SHALL run it as a ghost.
5. THE Ghost_Gate SHALL NOT classify as safe a `cat`, `head`, `tail`, `wc`, or `git show` call whose path word matches a `secrets` pattern of an `egress` Ward of the loaded WardSet (after normalization by the Path_Normalizer), so that a secret read always goes through the ghost and into the report.
6. WHERE the loaded Wards_File declares additional safe commands in the optional top-level key `safe_commands` of `wards.yaml` (a list of 0 to 256 grammar entries, each a command name plus allowed arguments, each satisfying the rules of criterion 3), THE Ghost_Gate SHALL treat a command line that matches one of these entries under the same parsing as a Safe_Command; the `WardSet` of `core` SHALL stay unchanged, and the `ParseResult` of `wards-config` SHALL gain a `safeCommands` field that the Ghost_Gate reads (the `wards-config` change is made in wards task 6 and is a dependency of this requirement, not work of this spec); WHEN the Wards_File has no `safe_commands` key, `safeCommands` SHALL be an empty list and only the built-in grammar applies.
7. THE Ghost_Gate SHALL NOT let an extension entry make a command safe that criterion 3 or criterion 5 excludes.
8. WHEN a command line is a Safe_Command, THE Ghost_Gate SHALL print nothing, SHALL append the Stats_Event `safe-skip`, and SHALL finish within 1.0 s as a Median_Of_5 on the Reference_Machine.
9. THE Ghost_Gate SHALL NOT claim P1, P5, or P6 for a Safe_Command; THE README SHALL state that a Safe_Command is not rehearsed.
10. FOR ALL generated command lines that contain a character or a construct listed in criterion 3, or that begin with a word outside criterion 2, or that append `;`, `&&`, a pipe, or a redirect to a Safe_Command, THE classifier SHALL return `not safe` (Property: KI-P2).

### Requirement 5: Shell Judgment by Ghost Run

**User Story:** As a user, I want every other shell command rehearsed in the box and judged by what it changes, so that `npm run clean`, a script file, or a base64-hidden command is caught by diff and not by shape.

#### Acceptance Criteria

1. WHEN a shell call is not a Safe_Command, THE Ghost_Gate SHALL build the Tool_Call_Plan (one ShellAction with `command` equal to `tool_input.command` and the Copy-relative `cwd` of Requirement 3, criterion 5) and SHALL call `runPlan(plan, options)` with the workspace root as Original and the loaded WardSet.
2. THE Ghost_Gate SHALL accept a command of 1 to 4,096 code points; IF the command is empty or longer, THEN THE Ghost_Gate SHALL return `deny` with a message that names the bound, because the Plan is outside the range that the runner accepts.
3. THE Ghost_Gate SHALL take the verdict from `RunResult.verdict` (the Runner_Verdict) and SHALL NOT recompute it; the `RunResult.status` values other than `ok` (timeout, copy-timeout, pipeline-deadline, isolation-violation) SHALL map as the runner defines (floor `warn`, and `block` for `isolation-violation`).
4. THE Ghost_Gate SHALL NOT use the command text of a shell call to decide a verdict (no pattern list of dangerous commands); the only decisions that read the command text are the Safe_List of Requirement 4, which can only skip a ghost run, and the recognition of an approval command of Requirement 10, criterion 10, which can only deny.
5. THE Ghost_Gate SHALL treat a command that needs network access, such as `npm install`, as the runner does: the attempt is recorded and produces a `warn` notice for human approval.
6. WHEN `runPlan` completes, THE Ghost_Gate SHALL write the Run_Record (Requirement 12), SHALL append the Stats_Event `ghosted`, and SHALL derive the exit code and the messages from the verdict as Requirement 7 defines.
7. THE Ghost_Gate SHALL NOT return, print, or store the standard output or standard error of the ghost command and SHALL NOT print or store any captured payload byte; the `RunOutput.payloads` map SHALL be released before the process exits.
8. IF `runPlan` throws or rejects, THEN THE Ghost_Gate SHALL return `deny` with exit code 2 (Requirement 8).
9. THE Ghost_Gate SHALL leave Original unchanged: THE Ghost_Gate SHALL write only inside the Ghost_Store, SHALL create no file in Original other than the Ghost_Store files of Requirement 12, and the runner's own check (`isolation.originalUnchanged`) SHALL be the evidence for P1 of that run.
10. THE Ghost_Gate SHALL set the claims of the message from `RunResult.isolation` (`p5Claimed`, `p6Claimed`) and SHALL NOT raise a claim that the runner reports as `false`.
11. THE README SHALL state that the gate rehearses one tool call as one Plan, so that a secret read in one tool call and a network attempt in a later tool call are not linked (the P6 limit of the Introduction table).
12. THE README SHALL state that a `pass` verdict means that no ward was violated in the rehearsal and is not an approval of the real command, and THE Ghost_Gate SHALL emit no permission decision `allow` (Requirement 10, criterion 6).

### Requirement 6: Write and Delete Tool Judgment

**User Story:** As a user, I want a file write or delete by the agent's file tools judged against the path wards, so that the agent cannot step around a shell gate with a file tool.

#### Acceptance Criteria

1. WHEN a call is classified as `write`, THE Ghost_Gate SHALL run no ghost and SHALL derive exactly one Change for each target path found by criterion 11: `file-created` WHEN the tool creates a file that does not exist, `file-overwritten` WHEN the tool writes to or edits an existing regular file (this includes `str_replace`, `fs_append`, and a code-edit operation of the `code` tool), and `file-deleted` WHEN the tool deletes an entry (`delete_file`); THE Ghost_Gate SHALL decide existence with `lstat` of the workspace and SHALL only read the workspace.
2. THE Ghost_Gate SHALL convert the target path to a Copy-relative path with the Path_Normalizer after resolving it against the workspace root, and SHALL judge both the path as written (resolved lexically) and the real path (`realpath` of the existing target, or of its nearest existing parent for a new file), so that a write through a symbolic link is judged against the real path as `wards` Requirement 5, criterion 5 requires.
3. IF the target path resolves outside the workspace root, THEN THE Ghost_Gate SHALL set the verdict to at least `warn`, SHALL add an `Effect` with `kind` `file-write` and the sanitized destination, and SHALL NOT judge the path against the path wards.
4. WHEN the target of a delete is a directory, THE Ghost_Gate SHALL derive one `file-deleted` Change for every entry below it (including the directory itself), up to 10,000 entries; IF more entries exist, THEN THE Ghost_Gate SHALL set the verdict to at least `warn` with the notice `delete target too large to enumerate.`
5. THE Ghost_Gate SHALL build a `GhostReport` that holds the derived Changes and SHALL call `WardEngine.evaluate(report, wardSet)`, so that the verdict comes from the same engine and the same Wards_File as a shell run.
6. THE Ghost_Gate SHALL treat a Change under a Self_Protected_Path as a verdict floor of `warn` with the notice `step 0: change to a gate-protected path needs human approval.`, in addition to the verdict of the engine (Requirement 10).
7. WHERE the target path lies under `.kiro/`, THE Ghost_Gate SHALL scan the text fields of `tool_input` that carry the new content with `scanTexts` of `possession` (markdown option by file extension), and WHEN a Finding exists, THE Ghost_Gate SHALL set the verdict to at least `warn` with the notice `step 0: hidden text in new content for a Kiro file.`; the Finding renderings SHALL NOT be printed except through `formatReport` rules (quoted, at most 200 code points, ASCII only).
8. THE Ghost_Gate SHALL NOT claim P1 for a Write_Judgment (no ghost ran) and SHALL claim P5 only for the target path as resolved at judgment time (Introduction table).
9. THE Ghost_Gate SHALL complete a Write_Judgment within 1.0 s as a Median_Of_5 on the Reference_Machine for a target without descendants.
10. FOR ALL generated spellings of a protected path (`./data/../data/x`, `data//x`, `data/./x`, upper-case spelling in the case-insensitive default, a symbolic link in the workspace that points to the protected path) and each of the write tools (`fs_write`, `str_replace`, `fs_append`, `delete_file`, `code`) with the protected path in each of its Target_Path_Fields, THE Write_Judgment SHALL return `deny` (Property: KI-P6).
11. THE Ghost_Gate SHALL collect the target paths of a write call from every Target_Path_Field (`path`, `targetFile`, `file_path`) present in `tool_input`, SHALL judge each one, and SHALL combine the results so that the strictest verdict wins; WHEN a `code` call names a directory in `path` or no Target_Path_Field at all, or the tool is not one of the five known write tools, THE Ghost_Gate SHALL apply the fail-closed rule of Requirement 3, criterion 4 unless the design shows from the tool schema that the `operation` value is read-only and a test records that schema; the Ghost_Gate SHALL NOT claim P5 for files that a code-edit operation changes outside the declared Target_Path_Fields (for example the other files touched by a symbol rename).

### Requirement 7: Verdict Handling, Output, and Exit Codes

**User Story:** As the agent that was blocked, I want one short, deterministic message that names the ward and the change summary, so that I can retry with a safer plan and no hostile text reaches my context.

#### Acceptance Criteria

1. WHEN the verdict is `pass`, THE Ghost_Gate SHALL exit with code 0 and SHALL print the one-line pass message of the Message_Builder (`GHOST RUN PASSED: all <n> wards cleared.`) on STDOUT, which Kiro adds to the agent context.
2. WHEN the verdict is `block`, THE Ghost_Gate SHALL exit with code 2 and SHALL print on STDERR the Block_Message of the Message_Builder, with the Seance_Link built from `GHOST_RUN_SEANCE_BASE` (default `http://localhost:5317`) and the Grave_Id, followed by the diff summary of criterion 4.
3. WHEN the verdict is `warn`, THE Ghost_Gate SHALL NOT let the call proceed without a human approval: in the committed `WARN_MODE` `exit2` THE Ghost_Gate SHALL exit with code 2 and print on STDERR the warn message of the Message_Builder (`GHOST RUN NEEDS HUMAN APPROVAL: ...`) with the Seance_Link; in `WARN_MODE` `ask` THE Ghost_Gate SHALL exit with code 0 only together with the `ask` permission-decision JSON on STDOUT, so that the host prompt of the Approval_Channel (Requirement 10) decides, and SHALL NOT print an `allow` decision or an empty STDOUT.
4. THE diff summary SHALL consist of one line of the form `Diff summary: <a> deleted, <b> overwritten, <c> created, <d> symlinks changed, <n> rows lost.` (counts derived from the Changes of the run, rows lost summed from `sql-row-count` Changes by the rule of `wards` Requirement 6, criterion 2), followed by at most 10 lines `  <kind> <path>` with the sanitized paths in ascending byte order, and the line `+<k> more changes.` WHEN more exist; the whole summary SHALL be at most 1,200 code points.
5. THE messages of this requirement SHALL contain only the violated ward ids, the reasons of the engine, the claim line of the Message_Builder, the diff summary, and the Seance_Link, and no other text taken from the Hook_Event or from the run (the agent receives no ghost stdout, no payload, and no secret).
6. WHEN `RunResult.isolation.mode` is `static-analysis` (Plan_B), THE Ghost_Gate SHALL pass `claims` with `p5` and `p6` equal to `false` to the Message_Builder, so that the line `P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).` is appended to the message of any verdict (Requirement 9).
7. WHEN the verdict is `block` or `warn`, THE Ghost_Gate SHALL write the Grave_Entry (Requirement 14) before it exits, and the Seance_Link of the message SHALL carry the same Grave_Id.
8. THE Ghost_Gate SHALL use no exit code other than 0 and 2: a deny, a configuration error, a timeout, and an internal error SHALL all exit with code 2, so that the IDE (any non-zero code blocks) and the CLI (code 2 blocks) behave the same.
9. FOR ALL RunResult values, THE mapping from the RunResult to the Gate_Decision SHALL satisfy: a `pass` verdict exits 0 with no allow decision; a `warn` verdict proceeds only through a human approval (exit 2 in `exit2` mode; exit 0 with only the `ask` JSON on STDOUT in `ask` mode); a `block` verdict exits 2 (Property: KI-P1).
10. THE Ghost_Gate SHALL be deterministic: FOR ALL equal RunResult values, equal Grave_Ids, and equal environment, THE messages SHALL be identical.

### Requirement 8: Failure Handling and Time Budget (Fail Closed)

**User Story:** As a security reviewer, I want a crash or a timeout of the gate to block the tool call, so that breaking the gate never opens it.

#### Acceptance Criteria

1. THE Ghost_Gate SHALL fail closed: IF an unhandled exception, a rejected promise, an unreadable Wards_File, a missing build output of an imported package, a failed Ghost_Store write that Requirement 7 needs, or a deadline overrun occurs, THEN THE Ghost_Gate SHALL print one STDERR message that names the failure class (no stack trace, no input text) and SHALL exit with code 2.
2. THE decision to fail closed is recorded here with its reason: a gate that fails open turns every crash, every malformed input, and every resource exhaustion into a bypass that an agent can trigger on purpose; a gate that fails closed costs availability only, and the cost is bounded by Requirement 8, criteria 4 and 5, and by the human disable path of criterion 6.
3. THE Ghost_Gate SHALL install a top-level handler for `uncaughtException` and `unhandledRejection` that applies criterion 1, and SHALL guarantee that no code path ends the process with exit code 0 except the `allow` paths of Requirement 7.
4. THE Ghost_Gate SHALL arm an internal watchdog of 50 s from process start; WHEN the watchdog fires, THE Ghost_Gate SHALL request the runner cleanup (container and Copy removal, `ghost-run.run-id` label), SHALL print `GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed.`, and SHALL exit with code 2 before the Hook_Limit of 60 s; the runner pipeline deadline of 55 s alone is not enough because the process start and the module loading precede it (Design Decision D4).
5. WHEN a ghost run needs longer than the watchdog allows (for example a long test suite), THE result SHALL be a deny with the timeout message, and the README SHALL state that such a command needs the human to run it outside the gate or to approve it through the Approval_Channel.
6. THE README SHALL state the only supported disable path: the human sets `enabled` to `false` in the hook entry through the Kiro hooks panel or the file; the Ghost_Gate SHALL NOT read an environment variable or a file inside the workspace that disables it, because an agent can write to both.
7. IF a build output of `core`, `ghost-runner`, or `wards-config` is missing, THEN THE Ghost_Gate SHALL print `GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).` and exit with code 2; the README SHALL state that on a fresh clone the human runs the build once outside the gate, because the gate blocks the agent's own build command (the dogfooding limit of the Introduction).
8. WHERE Docker is unavailable, THE Ghost_Gate SHALL NOT treat that as a failure: THE runner selects Plan_B and Requirement 9 applies.
9. THE Ghost_Gate SHALL release the lock, the container, and the Copy of its own run before it exits on every path, and the test suite SHALL verify that no container labeled with the `ghost-run.run-id` of a finished gate process remains.
10. FOR ALL byte strings given as STDIN (including empty input, invalid UTF-8, JSON with extra fields, and deeply nested JSON), THE Ghost_Gate decision function SHALL return a Gate_Decision without throwing and SHALL return `deny` unless the input is a valid Hook_Event whose verdict allows (Property: KI-P3).
11. THE Ghost_Gate SHALL finish a ghost-run decision within the budget of the runner plus 1.0 s as a Median_Of_5 on the Reference_Machine (for the one-action Plan of the Reference_Repo, the budgets of `ghost-runner` Requirement 19), and every run SHALL finish within the Hook_Limit.

### Requirement 9: Plan B (No Docker)

**User Story:** As a user without Docker, I want the gate to say that no rehearsal took place and to ask for approval, so that I am never shown an isolation guarantee that does not exist.

#### Acceptance Criteria

1. WHEN `RunResult.isolation.mode` is `static-analysis`, THE Ghost_Gate SHALL NOT execute any part of the command on the host and SHALL use the runner's Plan_B result.
2. THE Ghost_Gate SHALL return a verdict of at least `warn` for every non-safe shell call analyzed in Plan_B, including a call with no static finding, because no rehearsal took place (the floor of `ghost-runner` Requirement 15, criterion 3).
3. THE Ghost_Gate SHALL print the exact message `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.` in the message of a Plan_B run, in addition to the claim line of Requirement 7, criterion 6.
4. THE Ghost_Gate SHALL NOT claim P1, P5, or P6 in a Plan_B run, and SHALL write the Grave_Entry `claims` with `mode` equal to `static-analysis` and the three booleans equal to `false`.
5. THE README SHALL state the Plan_B limitation and the macOS and Linux support scope, and SHALL mark Windows as unverified (the same statement as `ghost-runner` Requirement 3, criterion 6).
6. THE Write_Judgment of Requirement 6 SHALL be unaffected by Docker availability, because it runs no ghost; its message SHALL carry no isolation claim.

### Requirement 10: Warn Handling, Approval Channel, and Self-Protection

**User Story:** As a developer, I want a `warn` to reach a human, and I want the agent to be unable to approve itself or switch off the gate, so that the gate is a boundary and not a suggestion.

#### Acceptance Criteria

1. THE Ghost_Gate SHALL treat a `warn` verdict as a request for human approval and SHALL NOT convert it into `allow` by any rule of its own.
2. THE Approval_Channel SHALL satisfy these properties, whichever mechanism the design chooses (Design Decision D1): an approval applies to exactly one tool call identified by the tool ID and the SHA-256 digest of the command (or target path) and the `cwd`; an approval is single-use; an approval expires within 10 minutes; and the agent has no tool call that the Ghost_Gate allows and that can create an approval.
3. THE design SHALL choose among these mechanisms by comparison and justify the choice (Design Decision D1): (a) a host permission prompt, by returning the `ask` decision of the Pre Tool Use JSON output (to be confirmed in the Kiro documentation); (b) the CLI V3 3.4.0 or later `PermissionRequest` trigger, which fires immediately before a permission prompt, where a hook that finishes without a decision leaves the usual approval dialog to the human (a candidate to evaluate), and which can decide `allow` or `deny` through STDOUT JSON `hookSpecificOutput.decision.behavior`; or (c) a human-run command `pnpm ghost-run approve <Grave_Id>` that writes a single-use approval file in `.ghost-run/approvals/`.
4. UNTIL the Approval_Channel is available in a host, THE Ghost_Gate SHALL answer a `warn` with exit code 2 and the warn message (Requirement 7, criterion 3), so that a `warn` can never run unapproved.
5. WHERE the Approval_Channel is the human-run command of option (c), THE Ghost_Gate SHALL treat `.ghost-run/approvals/**` as a Self_Protected_Path and SHALL answer any shell ghost run that creates or changes a path there, and any write tool call that targets a path there, with `deny` (not `warn`).
6. THE Ghost_Gate SHALL NOT emit a permission decision `allow` for a `pass` verdict: a `pass` means that no ward was violated in the rehearsal and does not replace the host permission prompt or the user's trusted-command settings.
7. THE Ghost_Gate SHALL answer a Change under `.kiro/hooks/**`, `integrations/kiro-hook/**`, `integrations/mcp/**`, or the resolved Wards_File with at least `warn` (Requirement 6, criterion 6), so that the agent cannot rewrite the gate, the MCP server, or the wards without a human; the README SHALL state that this protects the gate against edits by the agent through the tools that the Ghost_Gate judges, and not against an edit made by a human or by a process outside the agent.
8. THE README SHALL state that a tool that the matchers do not cover (a tool of an MCP server other than `ghost-run`, a web tool) is outside the gate.
9. THE README SHALL state the dogfooding consequence: the gate asks for approval when the agent edits the gate; the developer approves these in the Approval_Channel or disables the hook by the path of Requirement 8, criterion 6.
10. WHATEVER mechanism the design chooses, THE agent SHALL be unable to approve a `warn` itself: WHEN a shell call runs the approval command of the Approval_Channel (or any command that creates or changes an approval), THE Ghost_Gate SHALL return `deny` with exit code 2 and a message that names the rule; this recognition reads the command text and can only deny, which is the single exception to Requirement 5, criterion 4 besides the Safe_List skip; and a test SHALL show that an approval command invoked through the shell tool, through a wrapper (`sh -c`, `env`, a script file that the same call writes), and through a write tool targeting the approval store is denied.
11. FROM 2026-11-22 the Ghost_Gate is enabled for the development of this repository; THE Approval_Channel SHALL therefore let a rare but necessary command, such as a dependency install (`pnpm install`, `pnpm add`), proceed after one human approval of that single tool call, with no second prompt, no edit of a hook or configuration file, and no disabling of the gate; a task SHALL record in `docs/devlog.md` how many approvals one development day needed.

### Requirement 11: ghost-gate Claims and Documentation

**User Story:** As a judge or a reader of the README, I want the gate's claims to match what it does, so that I can trust the claims that remain.

#### Acceptance Criteria

1. THE README section of the Hook_Package SHALL state as a table the claims and non-claims of the Ghost_Gate in the Introduction table, and SHALL state that P1 is claimed per run from `isolation.p1Claimed` and never as a property of the hook.
2. THE README SHALL state that the gate is a seatbelt for an agent that makes mistakes or is manipulated and not a full isolation tool, that text analysis does not catch every injection, and that compression, encryption, and DNS exfiltration of a secret are caught by the action criterion only.
3. THE README SHALL state that the Ghost_Gate, the Ghost_Log, and the MCP_Server run on the host and are not tamper-resistant against a process with the privileges of the developer.
4. THE README SHALL state that `pass` is not an approval of the real command (Requirement 5, criterion 12) and that the real execution can differ from the ghost run (P2 is not claimed).
5. THE README SHALL list the Safe_List and SHALL state that a Safe_Command is not rehearsed.
6. THE Ghost_Gate SHALL use the words `sealed` and `isolated` in no fixed message of its own.

### Requirement 12: Ghost_Store

**User Story:** As a maintainer, I want one git-ignored folder for everything the integration records, so that records never reach the repository and secrets never reach disk.

#### Acceptance Criteria

1. THE Ghost_Store SHALL be the folder `.ghost-run/` in the workspace root, and the repository `.gitignore` SHALL list `.ghost-run/`; a test SHALL require this entry.
2. THE Ghost_Store layout SHALL be: `sessions/<Session_Key>/provenance.jsonl` (one Provenance_Record per line), `graveyard.jsonl` (one Grave_Entry per line), `stats.jsonl` (one Stats_Event per line), `runs/<Run_Id>.json` (Run_Record), `pbt/last.json`, `blacklight/last.txt`, and (where Requirement 10, option (c) applies) `approvals/`.
3. THE hooks SHALL append to `.jsonl` files with a single write of one complete line terminated by `\n`, so that concurrent hook processes never interleave a line; a reader SHALL skip a line that does not parse and SHALL count it as `corrupt`.
4. THE hooks SHALL create the Ghost_Store folders with the permissions `0700` and the files with `0600`.
5. THE Run_Record SHALL be the output of the serialization function of `ghost-runner` for a `RunResult` (payload bytes replaced by byte length and SHA-256), and SHALL contain no `secretValues` and no payload byte.
6. THE hooks SHALL NOT write a secret value, a Canary, a captured payload, or a value derived from them (substring, encoding, or hash other than the SHA-256 and byte length that the runner already records) to the Ghost_Store, to STDOUT, to STDERR, or to any log.
7. BEFORE a hook writes a command, a path, a reason, a Provenance_Record, or any text field to the Ghost_Store, THE hook SHALL replace every occurrence of a Canary (as defined by `extractCanaries` over the secret files that match the `secrets` patterns of the `egress` Wards, read from the workspace into memory only, at most 16 files and 65,536 bytes per file) in that text by `[redacted]`; this closes the case that `ui-kit` Assumption A7 leaves to the producer for a secret that an agent typed into a command.
8. THE hooks SHALL apply these caps: one Provenance_Record `content` of at most 1 MiB (a longer text is not recorded and is counted in the Stats_Event `provenance-skipped`), at most 1,000 Provenance_Records per session, at most 20 session folders (the oldest by modification time is removed first), at most 200 Run_Records (the oldest is removed first), and at most 2,000 lines in `graveyard.jsonl`.
9. THE Ghost_Store reading functions SHALL be pure functions over file contents, with the file access in a thin adapter, as `possession` Requirement 1, criterion 7 requires for its adapter.
10. THE hooks SHALL write the Ghost_Store through one shared module of the Hook_Package, and the MCP_Server SHALL read it through the same module.
11. IF a Ghost_Store write fails, THEN THE Ghost_Log and the Contract_Pbt_Hook SHALL report the failure class on STDERR and exit with a non-zero code without affecting the tool call, and THE Ghost_Gate SHALL apply Requirement 8, criterion 1 only for the writes that Requirement 7 needs (the Grave_Entry of a `block` or `warn`).

### Requirement 13: ghost-log (Post Tool Use) Provenance and Statistics

**User Story:** As the red-thread feature, I want what the agent read recorded in the possession format, so that a blocked action can be traced to its cause line.

#### Acceptance Criteria

1. WHEN a Post Tool Use event arrives for a tool call of the categories `read`, `web`, or the `@mcp` source, THE Ghost_Log SHALL append one Provenance_Record `{ source, kind, content }` to `sessions/<Session_Key>/provenance.jsonl`, where `kind` is `file` for a file read tool, `web` for a web fetch tool, and `other` for an MCP tool; the Ghost_Log SHALL use `issue` only WHERE the design maps an MCP tool of an issue tracker to it (Design Decision D5).
2. THE Ghost_Log SHALL take `source` from the path (workspace-relative, with `/` separators) or the URL of the tool input, and the `content` from the tool response in the Hook_Event; IF the host does not deliver the tool response to the hook, THEN THE Ghost_Log SHALL read the file named by the tool input from the workspace for a `file` record, and SHALL record nothing for other kinds (Open Item 2). Resolved (CLI 3.4.0, 2026-11-18): the CLI delivers the field `tool_response`, and its value is not an object, so the Ghost_Log SHALL treat a string value as the content and SHALL apply the file-read fallback when the value is of any other type. IDE result pending, re-check after task 1.4.
3. THE Ghost_Log SHALL validate each record with `parseProvenanceLog` of `possession` (a log of that one record) before writing, SHALL write only records that parse, and SHALL define no field for a clock value, a session identifier, or a secret value in the record (the format of `possession` Requirement 8, criterion 9).
4. IF the `source` of a `file` record matches a `secrets` pattern of an `egress` Ward (after normalization by the Path_Normalizer), THEN THE Ghost_Log SHALL NOT record its content, SHALL append the Stats_Event `provenance-skipped`, and SHALL NOT write the path of that record into any other file.
5. IF the `content` of a record contains a Canary of Requirement 12, criterion 7, THEN THE Ghost_Log SHALL NOT record the record and SHALL append the Stats_Event `provenance-skipped`.
6. THE Ghost_Log SHALL append, for every Post Tool Use event of a shell tool call, the Stats_Event `executed`.
7. THE Ghost_Gate SHALL append the Stats_Events `seen` (every call it receives), `safe-skip`, `ghosted`, `passed`, `warned`, and `blocked`; a Stats_Event SHALL carry only `kind` (a fixed token) and `at` (an ISO 8601 UTC time `YYYY-MM-DDTHH:MM:SSZ`) and SHALL carry no command, path, or text.
8. THE Hook_Package SHALL export a pure function `summarizeStats(lines)` that returns the counts `commandsSeen`, `commandsGhosted`, `commandsBlocked`, `commandsWarned`, `commandsSafeSkipped`, and `commandsExecuted`, and a function that prints them as one table for `docs/devlog.md`; FOR ALL generated Stats_Event lists (including corrupt lines), `commandsSeen` SHALL equal the number of `seen` events and the other counts SHALL equal the number of events of their kind.
9. THE Ghost_Log SHALL complete within 5 s as a Median_Of_5 on the Reference_Machine for a record of at most 1 MiB, and SHALL always exit within the Hook_Limit.
10. THE Ghost_Log SHALL never change the tool call: a Post Tool Use hook SHALL exit with code 0 after a successful record, and a failure SHALL be reported on STDERR without any claim that the tool call failed.
11. THE README SHALL state that the provenance log holds only what the hook receives, that a text the agent obtained in another way (a tool outside the matchers) is not recorded, and that the red thread finds literal occurrences only (`possession` Requirement 12, criterion 6).
12. FOR ALL generated records, THE written line SHALL parse with `parseProvenanceLog` and the round trip `parseProvenanceLog(serializeProvenanceLog(log))` of the read-back log SHALL equal the log (Property: KI-P5).
13. THE P6 scope SHALL stay "within one tool call", and THE README and the design SHALL state what the Ghost_Log records can and cannot do about cross-call exfiltration (a secret read in one tool call and sent in a later call): the records CAN show after the fact, through `ghost_trace` and the red thread, that text read earlier appears in a later blocked or warned action, and CAN support a human review; the records CANNOT block, warn on, or change the verdict of the later call, and a secret read followed by a send in separate calls is not detected by the Ghost_Gate; the Ghost_Gate SHALL NOT read the Provenance_Log to decide a verdict.

### Requirement 14: Graveyard Records (Grave_Entry)

**User Story:** As a developer who runs agents unattended, I want each blocked command saved in the graveyard format, so that the playground or a later seance view can open it.

#### Acceptance Criteria

1. WHEN the Gate_Decision follows a `block` or `warn` verdict, THE Ghost_Gate SHALL append one Grave_Entry to `graveyard.jsonl` with `id` equal to the Grave_Id, `command` (the shell command, or `<tool_name> <workspace-relative path>` for a Write_Judgment), `recordedAt` (an ISO 8601 UTC time `YYYY-MM-DDTHH:MM:SSZ` from the clock), `wardIds` (the distinct `wardId` values of the violations in order of first appearance), and `detail` with `wardVerdict`, `changes`, `claims`, and `actionLabels` (the command).
2. THE Ghost_Gate SHALL write the Grave_Entry (not the Ghost_Log), because a blocked tool call produces no Post Tool Use event that Ghost_Log could record; the Ghost_Log SHALL NOT write a second entry for the same tool call, and the design SHALL confirm in the Kiro documentation whether Post Tool Use fires for a blocked call (Open Item 2). Resolved (CLI 3.4.0, 2026-11-18): a call blocked with exit code 2 fires no Post Tool Use in the CLI, so no second entry arises there. IDE result pending, re-check after task 1.4.
3. WHERE a Provenance_Log exists for the Session_Key and the run has Needles, THE Ghost_Gate SHALL add to `detail` the fields `sources` (the records, with `content` as `possession` defines), `needles` (`collectNeedles`), and `links` (`traceRedThread`), so that the seance view can draw the red thread; the red thread SHALL NOT change the verdict (`possession` Requirement 12, criterion 7).
4. THE Grave_Entry SHALL pass the Canary redaction of Requirement 12, criterion 7 and SHALL contain no `secretValues` and no payload byte.
5. THE `id` of every Grave_Entry SHALL match `^[A-Za-z0-9_-]{1,64}$`, and THE `recordedAt` SHALL be a valid ISO 8601 UTC time, so that the Graveyard of `ui-kit` shows no `time unreadable` and no `No seance link: invalid id` entry for a record of this spec.
6. THE Hook_Package SHALL export a function that reads `graveyard.jsonl` and returns the valid Grave_Entries in file order, skipping corrupt lines, so that an app can load the graveyard of a session (the seance route and the retrieval are owned by the apps, `ui-kit` Assumption A3).
7. THE Run_Record of the same Run_Id SHALL exist whenever the Grave_Entry names a run, so that `ghost_diff` and `ghost_trace` of the MCP_Server can resolve the Grave_Id.

### Requirement 15: contract-pbt (File Save)

**User Story:** As a world author, I want the contract tests to run when I save world or core code, so that a broken safety property is seen within a minute.

#### Acceptance Criteria

1. WHEN the agent saves a file whose workspace-relative path matches `^(core|worlds)/`, THE Contract_Pbt_Hook SHALL run the property-based tests of the safety contract in the Short_Run mode.
2. THE Contract_Pbt_Hook SHALL use the run counts that the owning specs set for the save-time run and SHALL define no count of its own: at least 100 generated examples per property for the `core` properties (`core-contract` Requirements 8 to 11 and the `wards` and `possession` property tests), and 20 per property for the Docker-bound properties of the Repo_World (`ghost-runner` Requirement 17, criterion 8).
3. WHEN the saved path is under `worlds/<name>/`, THE Contract_Pbt_Hook SHALL run `verifyWorld` for that world with its `world.config.ts` metadata (including `deterministic`) and the `core` properties that touch the judgment engine; WHEN the saved path is under `core/`, THE Contract_Pbt_Hook SHALL run the `core` property tests and the `verifyWorld` of every registered world.
4. THE Contract_Pbt_Hook SHALL finish within 60 s; THE Contract_Pbt_Hook SHALL arm an internal deadline of 55 s, SHALL stop the test run at the deadline, and SHALL report `incomplete: deadline reached` with the properties that did not finish, and SHALL NOT report `passed` for a property that did not finish.
5. WHEN a property fails, THE Contract_Pbt_Hook SHALL print on STDERR the failing property identifier (for example `P1`), the shrunk counterexample, the violated criterion identifier, and the seed, in the form that `core-contract` Requirement 12, criterion 2 requires of the registration gate, and SHALL exit with a non-zero code.
6. WHEN Docker is unavailable, THE Contract_Pbt_Hook SHALL report each Docker-bound property as `skipped (docker unavailable)` and SHALL NOT report it as `passed` (`ghost-runner` Requirement 17, criterion 7).
7. WHEN a run is in progress and another save event arrives, THE Contract_Pbt_Hook SHALL stop the older run and SHALL start the newer one, using a lock file in the Ghost_Store, so that two runs never write `pbt/last.json` at the same time.
8. THE Contract_Pbt_Hook SHALL write the last result to `.ghost-run/pbt/last.json` and print the same summary on STDOUT; whether a file-event hook output reaches the agent context is a host fact to be confirmed (Open Item 1), and the summary SHALL NOT depend on it. Resolved (CLI 3.4.0, 2026-11-18): the STDOUT of a file-event hook does not reach the agent context in the CLI, so the summary in `.ghost-run/pbt/last.json` is the only channel there. IDE result pending, re-check after task 1.4.
9. THE Contract_Pbt_Hook SHALL NOT run the nightly mode (10,000 examples per property); the nightly run is started by an explicit command and is outside this spec.
10. THE README SHALL state that the save-time run is evidence at 100 or 20 examples per property and not a proof, and that a hook fires only for files that the agent saved.

### Requirement 16: world-scaffold (File Create)

**User Story:** As a world author, I want a new world folder to receive the registration, test, and documentation files, so that a new world starts from a working, tested skeleton.

#### Acceptance Criteria

1. WHEN the agent creates a file whose workspace-relative path matches `^worlds/[^/]+/`, THE World_Scaffold_Hook SHALL derive the world name `<name>` from the first path segment below `worlds/`, and SHALL continue only WHEN `<name>` matches `^[a-z][a-z0-9-]{0,63}$`; otherwise THE World_Scaffold_Hook SHALL print a message that names the rule and SHALL create no file.
2. THE World_Scaffold_Hook SHALL create, only for files that do not exist, `worlds/<name>/world.config.ts` (the registration that exports the world metadata `name`, `deterministic`, and the path of `wards.yaml`, in the shape of criterion 11), `worlds/<name>/tests/contract.test.ts` (a test that calls `verifyWorld` for the world, with the Short_Run count of the owning spec), `worlds/<name>/wards.yaml` (a valid stub with the single root key `wards` and an empty list), and `worlds/<name>/README.md` (the documentation entry: the six `World<S, A>` functions, the checklist of the world-contract steering, and the properties the world claims and does not claim).
3. THE World_Scaffold_Hook SHALL set `deterministic` in the generated `world.config.ts` to `false` and SHALL add the comment that P2 is claimed only after the world is shown to be deterministic, so that a new world makes no P2 claim by default.
4. THE World_Scaffold_Hook SHALL NOT overwrite, truncate, or delete any existing file, and SHALL be idempotent: FOR ALL worlds, running the hook twice for the same `<name>` SHALL produce the same set of files with the same content as running it once (Property: KI-P7).
5. THE World_Scaffold_Hook SHALL treat the file creation events of the files that it generated itself as a no-op (the existence check of criterion 4), so that it cannot loop.
6. THE generated files SHALL be written only below `worlds/<name>/`, and THE World_Scaffold_Hook SHALL reject a `<name>` or a derived path that contains `..`, a path separator, or a symbolic link component.
7. THE generated `wards.yaml` stub SHALL parse with `parseWards` with `ok: true`, and the generated files SHALL contain no hidden character, no real host, and no real secret (only reserved domains and Canary values).
8. THE World_Scaffold_Hook SHALL print a short summary of the files created and the next step (`implement the six functions, then save to run contract-pbt`) so that the custom agent `world-smith` (a separate spec) has a complete starting point.
9. THE World_Scaffold_Hook SHALL finish within 5 s and SHALL make no network call.
10. THE README SHALL state that the hook fires only for files that the agent created, and that the world registration into the playground tab is owned by `ui-kit` and the apps (`core-contract` Requirement 12, criterion 4).
11. THE design SHALL first look for a world registration mechanism that needs no change in `core` (for example a registration file or a convention under `worlds/` that the scaffold, `verifyWorld` callers, and the apps read); IF a change in `core` is unavoidable, THEN THE design SHALL state why no change-free mechanism works and SHALL limit the change to the minimal additive one (for example a `WorldConfig` type); the shape of `world.config.ts` that the scaffold generates SHALL be the one that this decision yields, and `worlds/playground-shell/world.config.ts` of `ghost-shell` SHALL follow the same shape.

### Requirement 17: blacklight-steering (File Save)

**User Story:** As a maintainer, I want hidden characters in Kiro's own steering, spec, and hook files reported when the agent saves them, so that a Rules File Backdoor is seen before it is used.

#### Acceptance Criteria

1. WHEN the agent saves a file whose workspace-relative path matches `^\.kiro/`, THE Blacklight_Hook SHALL scan that file with `scanFiles` of the Scan_Entry_Point of `possession`, with the markdown option chosen by the extension as `possession` Requirement 11, criterion 7 defines.
2. THE Blacklight_Hook SHALL print the output of `formatReport` on STDOUT and, WHEN the outcome is not `clean`, on STDERR, and SHALL write it to `.ghost-run/blacklight/last.txt`; the output contains only printable ASCII and line breaks and quotes each rendering truncated to 200 code points, as `possession` Requirement 11, criteria 10 and 11 require.
3. THE Blacklight_Hook SHALL exit with `exitCodeFor(outcome)` of the Scan_Entry_Point (`clean` 0, `findings` 1, `error` 2); because a file-save hook cannot undo the save, the exit code is a report and not a block.
4. THE Blacklight_Hook SHALL scan the saved file only, SHALL NOT write to, rename, or delete any scanned file, and SHALL finish within 5 s (the scan of one 1 MiB file finishes within 1 s, `possession` Requirement 11, criterion 13).
5. THE Hook_Package SHALL provide the command `pnpm blacklight` that scans the whole `.kiro/` folder with the same entry point, so that an edit made by a human (which fires no file event) can be checked on demand; the MCP tool `blacklight` offers the same scan (Requirement 19).
6. THE README SHALL state that the hook sees only files that the agent saved, that the HTML comment category applies to markdown files and flags a comment inside a code fence (`possession` Open Item O2), and that text analysis does not catch every injection and detects no invisible character outside the possession categories.
7. THE Blacklight_Hook SHALL claim P7 only in the sense of the possession spec (a pure scan), and SHALL NOT claim that a `clean` outcome means the file is free of injected instructions.

### Requirement 18: MCP Server Placement, Transport, and Safety

**User Story:** As a Kiro or third-party agent, I want a `ghost-run` MCP server that rehearses a plan before I run it, so that I can ask for a verdict before I act.

#### Acceptance Criteria

1. THE MCP_Server SHALL be implemented with `@modelcontextprotocol/sdk` 1.32.2 over the stdio transport, SHALL declare its server name as `ghost-run`, and SHALL register exactly the tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, and `blacklight`.
2. THE MCP_Server SHALL declare the input schema of each tool with `zod` (peer range `^3.25 || ^4.0`; version 4.6.7 is the tested one) and SHALL reject an input outside its schema with an MCP error result (`isError: true`) and a sanitized message that names the field.
3. THE MCP_Server SHALL write nothing to STDOUT except protocol messages, and SHALL write diagnostics to STDERR only, without secret values, payloads, or command text longer than 120 code points.
4. THE MCP_Server SHALL return, for every tool, a text content item and a `structuredContent` JSON object, and SHALL limit the size of one result to 64 KiB (a longer result is truncated with the marker `[truncated]` and a flag in `structuredContent`).
5. THE MCP_Server SHALL pass every untrusted string in a result through the sanitizer of `wards` (Requirement 3, criterion 9), SHALL return no payload byte and no `secretValues`, and SHALL read and write the Ghost_Store through the shared module of Requirement 12, criterion 10.
6. THE MCP_Server SHALL resolve the workspace root from its working directory, SHALL resolve the Wards_File with the function of Requirement 3, criterion 7, and SHALL apply the fail-closed rule to configuration errors: an unreadable or invalid Wards_File SHALL produce an error result with the `formatConfigError` strings (at most 5) and no verdict.
7. THE MCP tools SHALL carry the annotations that the SDK supports: `blacklight`, `ghost_diff`, `ghost_trace`, and `wards_check` as read-only, and `ghost_run` as not read-only (it starts a container and writes the Ghost_Store) and not destructive of the workspace.
8. THE README and the SKILL.md SHALL state that the MCP tools are advisory: they help an agent that chooses to call them, and only the Ghost_Gate enforces a verdict on a tool call; the MCP_Server SHALL NOT claim that calling `ghost_run` before a command makes the command safe.
9. THE MCP_Server SHALL make no network call other than the Docker CLI calls of `runPlan`, SHALL call no LLM API, and SHALL not start a process other than those.
10. THE repository SHALL contain an MCP integration test that starts the MCP_Server over stdio with the SDK client, lists the five tools, and calls `wards_check` and `blacklight` without Docker; the `ghost_run` test SHALL report `skipped (docker unavailable)` when Docker is unavailable.

### Requirement 19: MCP Tools

**User Story:** As an agent, I want five precise tools for rehearsing, reading the diff, tracing the cause, checking wards, and scanning for hidden text, so that I can decide before I act.

#### Acceptance Criteria

1. THE tool `ghost_run(plan)` SHALL accept `plan` as an array of 1 to 50 objects `{ command: string (1 to 4,096 code points), cwd?: string }` and SHALL call `runPlan` with the workspace root as Original and the loaded WardSet, as the Ghost_Gate does for one action.
2. THE `ghost_run` result SHALL contain the Runner_Verdict, the message of the Message_Builder (with the Seance_Link of the Grave_Id and the `claims` of the run), the `isolation` object (`mode`, `p1Claimed`, `p5Claimed`, `p6Claimed`), `rehearsed`, the per-step exit codes, the diff summary of Requirement 7, criterion 4, and the Run_Id; THE MCP_Server SHALL write the Run_Record, and, WHEN the verdict is `block` or `warn`, the Grave_Entry.
3. IF Docker is unavailable, THEN THE `ghost_run` result SHALL be the Plan_B result with `rehearsed: false`, the exact message of Requirement 9, criterion 3, and a verdict of at least `warn`, and no P1, P5, or P6 claim.
4. THE tool `ghost_diff(id)` SHALL accept a Run_Id or a Grave_Id (pattern `^[A-Za-z0-9_-]{1,64}$`) and SHALL return the `Change[]` of the Run_Record per step, the diff summary, and the `isolation` claims; IF the id is unknown or the Run_Record was removed by a cap, THEN THE tool SHALL return an error result `unknown run id` and SHALL NOT guess.
5. THE tool `ghost_trace(id)` SHALL accept the same ids and an optional `session` (a Session_Key), SHALL compute `collectNeedles` of the report of the Run_Record and `traceRedThread` against the Provenance_Log of the session (the most recently modified session folder WHEN `session` is absent), and SHALL return the Needles and the Thread_Links; WHEN no Provenance_Log exists, THE tool SHALL return `not-found` Thread_Links for every Needle and the text `No provenance recorded.`
6. THE `ghost_trace` result SHALL state that the red thread finds literal occurrences only and that `not-found` does not mean safe, and SHALL NOT change any verdict.
7. THE tool `wards_check(plan)` SHALL accept the same `plan` input, SHALL load the Wards_File, and SHALL return: the validation result of the Wards_File (the `formatConfigError` strings, at most 50), the ward ids and kinds, for each action whether it is a Safe_Command, and the static findings of the `ghost-runner` Static_Analyzer; THE tool SHALL start no container, execute no action, and return `rehearsed: false` with no P1, P5, or P6 claim.
8. THE `wards_check` result SHALL state that it is a static check and not a rehearsal, and SHALL NOT return a `pass` verdict; its verdict field SHALL be omitted.
9. THE tool `blacklight(path)` SHALL accept one or more paths (at most 200) and SHALL scan them with `scanFiles` of the Scan_Entry_Point, SHALL return the `BlacklightReport` fields (`outcome`, `files`, `totalFindings`) and the `formatReport` text, and SHALL NOT write, rename, or delete any file.
10. THE `blacklight` tool SHALL confine every path to the workspace root: THE tool SHALL resolve each path with `realpath`, SHALL reject a path that resolves outside the workspace root (a `..` segment, an absolute path elsewhere, or a symbolic link to the outside) with an error result for that path (the other paths are still scanned), and SHALL reject a path that is a directory with more than 1,000 files (it scans a directory recursively only up to 1,000 files and reports the cap).
11. FOR ALL generated path strings (including `..` segments, absolute paths, and symbolic links to outside paths), THE `blacklight` tool SHALL read no file outside the workspace root (Property: KI-P8).
12. THE tool results SHALL be deterministic for equal inputs, equal Ghost_Store content, and equal Wards_File, except for the Run_Id and the timestamps.

### Requirement 20: Kiro Power

**User Story:** As a developer of another project, I want to install Ghost Run+ as a Kiro power from a folder or a GitHub repository, so that the agent knows when to rehearse and has the MCP tools.

#### Acceptance Criteria

1. THE Power_Folder SHALL contain `plugin.json`, `skills/ghost-run/SKILL.md`, and `mcp.json`, in the Agent Plugins format, and SHALL be installable through the Kiro Powers panel with Add Custom Power from a local folder or from a GitHub repository.
2. THE `plugin.json` file SHALL carry the required fields: `$schema` equal to `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `name` equal to `ghost-run` (kebab-case), `version` (a semantic version), `description`, `author` as `{ "name": <string> }`, and `keywords` (the activation keywords: `delete`, `drop table`, `migration`, `deploy`, `rm -rf`, `destructive`, `ghost run`, and further keywords chosen in the design).
3. THE `skills/ghost-run/SKILL.md` file SHALL start with a front matter that holds `name` equal to `ghost-run` and `description`, and its body SHALL state: when to call `wards_check` and `ghost_run` (before a delete, a database change, a migration, a deploy, or a command that reads secret files); how to read the verdicts (`pass`, `warn`, `block`) and the claims (`p1Claimed`, `p5Claimed`, `p6Claimed`); that a `block` is to be answered with a different plan that does not have the same effect and not with the same effect through another command; that a `warn` needs a human; that the tools are advisory (Requirement 18, criterion 8); and that a `pass` is not an approval.
4. THE `mcp.json` file SHALL carry `$schema` equal to `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` and `mcpServers` with one server `ghost-run` with `type` equal to `stdio`, a `command`, `args`, and `env`; THE `env` SHALL hold no secret value, and the way the `args` point to the built MCP_Server in an installed power (a relative path, a package command, or a placeholder of the host) is a design decision (Design Decision D6).
5. THE Power_Folder SHALL contain no hook file and no steering file: THE hooks and the steering of the template stay in the template's `.kiro/` (`docs/plan.md`); THE README SHALL state that a project that installs only the power has the advisory MCP tools and the skill but not the enforcing Ghost_Gate.
6. WHEN the power is installed, THE host prefixes the server name with the power name; THE README SHALL state the resulting tool names as the host shows them, as confirmed by an installation test (Open Item 3).
7. THE repository SHALL contain a test that parses `plugin.json` and `mcp.json` and requires the fields of criteria 2 and 4, requires the `SKILL.md` front matter of criterion 3, and makes no network call (the schema URLs are not fetched).
8. THE tasks.md of this spec SHALL contain a manual task that installs the power from the folder in a second project in Kiro, shows that a keyword activates the skill and that the MCP tools are listed, and records the evidence (screen capture or log) for the Kiro usage report.
9. THE Power_Folder files SHALL contain no hidden character and no real host or secret; the possession scan of `integrations/power/` SHALL return `clean` (Requirement 22).

### Requirement 21: Retirement of the Experiment B Hooks

**User Story:** As a maintainer, I want the pattern-based experiment hooks switched off when the real gate is in place, so that the two do not block each other and the experiment remains documented.

#### Acceptance Criteria

1. WHEN the Ghost_Gate hook is enabled, THE integration SHALL have `enabled` set to `false` in `.kiro/hooks/exp-b-block-rm-rf.json` and `.kiro/hooks/exp-b-log-write.json`, because the experiment hooks block by command shape (19 recorded blocks, all false positives or bypassed) and would double-block the calls that the Ghost_Gate judges by diff.
2. THE implementation SHALL keep `integrations/kiro-hook/exp-b-gate.mjs` and the two experiment hook files in the repository (disabled), and the experiment record in `docs/devlog.md` SHALL stay unchanged; the actual edits of these files happen at implementation time and not in this requirements phase.
3. THE repository SHALL contain a test that fails WHEN a hook file whose name begins with `exp-b-` has `enabled` equal to `true` while `ghost-gate.json` has `enabled` equal to `true`.
4. THE Ghost_Gate SHALL NOT reuse the command-shape logic of `exp-b-gate.mjs`.
5. THE README SHALL state that the experiment hooks were a measurement and that the gate decides from the diff of a ghost run.

### Requirement 22: Repository Hygiene

**User Story:** As a maintainer, I want the integration sources, fixtures, and tests to pass the repository's own rules, so that the repository stays clean under the blacklight.

#### Acceptance Criteria

1. THE source files, hook files, fixtures, tests, power files, and documents of this feature SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener; tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`.
2. THE repository SHALL contain a test that runs the Scan_Entry_Point over `integrations/` (excluding `node_modules` and `dist`), `.kiro/hooks/`, and `.kiro/specs/kiro-integration/`, and the test SHALL expect the outcome `clean`.
3. THE fixtures SHALL use only reserved domains (`.example`, `.test`, `.localhost`, `.invalid`), `registry.npmjs.org`, or the documentation range `192.0.2.0/24` as hosts, and only Canary values (such as `sk-CANARY-abc123`) as secrets.
4. THE tests SHALL write no file that contains a literal hidden character to the repository and SHALL build hidden input in memory.
5. THE Ghost_Store of a test run SHALL be created in a temporary folder outside the repository, and a test run SHALL leave no `.ghost-run/` content in the working tree.
6. THE repository artifacts of this feature SHALL be written in English.

### Requirement 23: Property-Based and Example Tests

**User Story:** As a maintainer, I want the gate decisions, the safe list, the store, and the path confinement checked on random input, so that a bypass, a leak, or a crash is found by the machine and not by an agent.

#### Acceptance Criteria

1. THE test suite SHALL use `vitest` and `fast-check`, SHALL run each property below with at least 100 generated examples in a Short_Run (finishing within 60 s without Docker) and at least 10,000 in a Nightly_Run, and SHALL print the seed of a failing run; the numbers KI-P1 to KI-P9 denote only the properties of this spec and SHALL NOT be used for P1 to P8, UI-P1 to UI-P11, or GS-P1 to GS-P6.
2. THE property table SHALL be the following:

| Property | Statement | Generators | Criterion |
|---|---|---|---|
| KI-P1 Decision mapping | `pass` exits 0 with no allow decision; `warn` proceeds only through a human approval (exit 2 in `exit2` mode; exit 0 with only the `ask` JSON in `ask` mode); `block` exits 2; no `RunResult` maps to exit code other than 0 or 2 | arbitrary `RunResult` values (verdicts, statuses, isolation modes, diagnostics) in both warn modes | Requirement 7, criterion 9 |
| KI-P2 Safe list soundness | A command line with a forbidden character or construct, an unlisted option, or a word outside the Safe_List is never classified safe; a `secrets`-matching path is never safe | command-like strings built from safe words plus injected metacharacters, expansions, options, and secret paths | Requirement 4, criterion 10 |
| KI-P3 Fail-closed totality | The decision function never throws and returns `deny` for every input that is not a valid Hook_Event with an allowing verdict | arbitrary byte strings, truncated JSON, JSON with wrong types, oversized input | Requirement 8, criterion 10 |
| KI-P4 No secret on disk or output | No Canary (nor its base64, hex, or percent form) appears in any Ghost_Store file, STDOUT, or STDERR of a hook or the MCP_Server | generated Canaries placed in commands, reads, paths, and tool responses | Requirement 12, criteria 6 and 7 |
| KI-P5 Provenance round trip | Each written provenance line parses, and read-back followed by `serializeProvenanceLog` and `parseProvenanceLog` returns an equal log; stats counts equal the event counts | generated Provenance_Records and Stats_Event lists, with corrupt lines | Requirement 13, criteria 8 and 12 |
| KI-P6 Write path judgment | Every spelling of a protected path (bypass forms, link, case) and every write tool class yields `deny` | protected-path patterns of the default Wards_File and their spellings | Requirement 6, criterion 10 |
| KI-P7 Scaffold idempotence | Running the scaffold twice equals running it once; no existing file changes | generated world names (valid and invalid) and pre-existing file sets | Requirement 16, criterion 4 |
| KI-P8 Path confinement | The `blacklight` tool reads no file outside the workspace root | generated paths with `..`, absolute paths, and links | Requirement 19, criterion 11 |
| KI-P9 Safe-list skip leaves no ghost | A Safe_Command produces no `runPlan` call, no Run_Record, and exactly one `safe-skip` Stats_Event | generated Safe_Commands | Requirement 4, criterion 8 |

3. THE tests of the Ghost_Gate decision logic SHALL run without Docker by injecting a double for `runPlan` that returns generated `RunResult` values; THE Docker-bound tests (an end-to-end gate run of the five Ghost Shell scenarios as a hook process with the Hook_Event on STDIN) SHALL report `skipped (docker unavailable)` when Docker is unavailable and SHALL NOT report `passed`.
4. THE test suite SHALL include example tests for: a Hook_Event for `rm -rf ./data` whose ghost run deletes `data/` (exit code 2, the message names `protect-data`, the diff summary counts the deleted files, no ghost stdout is printed); a Hook_Event for `npm run clean` (blocked by diff, not by shape); a Hook_Event for `rm tmp-scratch.txt` of a file that no ward protects (allowed); a Hook_Event for `ls` (allowed, no ghost, Stats_Event `safe-skip`); a Plan_B run (exit code 2 for the `warn`, the exact Plan_B message, claims `false`); a Hook_Event with invalid JSON (exit code 2); a gate watchdog timeout (exit code 2, no container left); a write call to `.env` (blocked) and a write call to a new file `notes.md` (allowed); a write call that targets a path through a symbolic link to `data/`; a Grave_Entry of a blocked run that passes the `ui-kit` id and time checks; a provenance record of a README with a destination hidden in Tag_Characters and the `ghost_trace` result that finds it with `hidden` equal to `true`; and the `blacklight-steering` outcome `findings` for a `.kiro` markdown file with a hidden character built from an escape.
5. THE test suite SHALL keep each shrunk counterexample that a property found as a fixed example test.
6. THE timing measurement task SHALL record the Median_Of_5 and the maximum of the gate latency for a Safe_Command, a Write_Judgment, and the five scenarios in `docs/devlog.md`; this is a process requirement on the task and not runtime behavior.

### Requirement 24: Host Fact Probe (First Implementation Task)

**User Story:** As a maintainer, I want the unconfirmed host facts measured before the dependent hooks are built, so that no hook is written on a guessed trigger name or payload field.

#### Acceptance Criteria

1. THE first implementation task in tasks.md of this spec SHALL create the Probe_Hook, a small command hook (a file `.kiro/hooks/probe-host-facts.json` and one script in `integrations/kiro-hook/`) that is registered for the Pre Tool Use, Post Tool Use, file-save, and candidate file-create triggers, and no other task that depends on an unconfirmed fact SHALL start before the probe results are recorded.
2. THE Probe_Hook SHALL record, for each event it receives, only the trigger name, the sorted field names of the STDIN JSON at the top level and inside `tool_input`, the tool name, and workspace-relative file paths; THE Probe_Hook SHALL NOT record file content, command text, tool response text, secret values, or any value other than those named in this criterion.
3. THE Probe_Hook SHALL write its records to the Ghost_Store folder `.ghost-run/probe/`, SHALL print nothing on STDOUT, SHALL exit with code 0 on every path, and SHALL make no LLM call and no network call.
4. THE probe task SHALL run the Probe_Hook in Kiro IDE and in Kiro CLI and SHALL determine at least: (a) the identifier of the file-create trigger (the candidate `PostFileCreate`) and the identifier of the file-delete trigger, if any; (b) the STDIN fields of file events, and whether the file path is among them; (c) whether Post Tool Use delivers the tool response, and under which field name; (d) whether a blocked call (exit code 2 of a Pre Tool Use hook) fires Post Tool Use; (e) whether the STDOUT of a file-event hook reaches the agent context; (f) whether the `timeout` field sits at entry level or inside `action` in a hook file that the host loads.
5. THE probe task SHALL record the results as a table in `docs/devlog.md`, and the design and the later tasks (Requirements 2, 13, 14, 15, 16) SHALL take their trigger names and field names from that table.
6. WHEN the results are recorded, THE probe task SHALL set `enabled` to `false` in the Probe_Hook file and SHALL keep the file and the script in the repository, and a test SHALL fail WHEN the Probe_Hook file has `enabled` equal to `true` once the results table of criterion 5 exists in `docs/devlog.md`.
7. THE Probe_Hook SHALL be exempt from the Ghost_Gate only through the ordinary approval of Requirement 10 (the agent creating it is a change under `.kiro/hooks/**` and needs the human approval).

*Note (CLI 3.4.0, 2026-11-18).* The CLI part of the probe results is recorded in `docs/measurements.md` under `Probe results`. The probe entries use an argument (`--deny-test`, `--stdout-test`, `--timeout-test=<placement>`), which deviates from criterion 2 of Requirement 2 and, in the `--stdout-test` mode, from criterion 3 (prints nothing); the deviation applies to probe entries only (Open Item 15). The IDE half of criterion 4 is pending (task 1.4). Criterion 4(a) is settled for the CLI only: the file-create identifier is `PostFileCreate`, and the file-delete identifier is not confirmed. Criteria 4(b) to 4(f) are settled for the CLI only. Recording the results in `docs/measurements.md` instead of `docs/devlog.md` is the choice of task 1.6 and is not changed here.

## Out of Scope

- Kiro Crew integration (product rule), including the `kirocrew-*` agents and the `kirocrew-work` MCP tools.
- The custom CLI agent `world-smith` and any other `.kiro/agents/` configuration: a separate spec (see the Introduction).
- The Docker box, the Recorder, the Differ, Plan B analysis, and the pipeline itself (`ghost-runner`); this spec calls `runPlan` only.
- Ward rule evaluation, `wards.yaml` parsing, content inspection, and the message text (`wards`, `core`, `wards-config`); this spec calls them only. The optional `safe_commands` top-level key of Requirement 4, criterion 6 needs an additive change in `wards-config` (the `safeCommands` field of `ParseResult`, made by wards task 6) that this spec does not make; the `WardSet` of `core` is unchanged.
- The hidden-character scanner, the sanitizer, and the red-thread lookup (`possession`).
- The seance route, the graveyard screen, the playground tab, and the app-side loading of `graveyard.jsonl` (`ui-kit`, `ghost-shell`).
- The playground (`ghost-shell`), the plan file format of `ghost-shell` Requirement 13 (a converter from a recorded session to a Plan_File is not part of this spec), Ghost Hand, and Ghost Cloud.
- Any LLM-based judgment, rewriting of a blocked plan, or suggestion text beyond the fixed texts of the Message_Builder (the Kiro agent proposes alternatives).
- Linking tool calls across a session for P6 (a secret read in one call and a network attempt in a later call).
- Judging tools outside the matchers (web tools, tools of other MCP servers), and any tool call made by a process outside Kiro.
- A long-lived gate daemon or a container pool shared across hook processes (each hook process is short-lived; the runner's pool option is not used by the gate).
- The nightly property test run and its scheduling.
- Windows support.
- Detection of every injection by text analysis.

## Design Decisions and Open Items

Design decisions (D) are left to the design phase and are recorded here so that they are not lost. Open items (O) name a fact that must be confirmed against the host before the design is final.

- **D1, Approval channel for `warn`.** The design chooses by comparison between the host permission prompt (an `ask` decision in the Pre Tool Use output), the CLI V3 3.4.0 or later `PermissionRequest` trigger (a hook that finishes without a decision shows the usual approval dialog; candidate to evaluate), and a human-run approval command (Requirement 10). Constraints fixed by Requirement 10: a `warn` never exits 0 without a human approval; the gate never emits `allow` for a `pass`; the agent cannot approve by itself (an approval command run through the shell is denied by the gate); from 2026-11-22 a necessary command such as a dependency install proceeds with a single human approval; until the channel exists, `warn` exits with code 2. Using `PermissionRequest` to auto-allow would turn a ghost pass into a permission grant, which Requirement 10, criterion 6 excludes.
- **D2, One matcher or two.** Whether one matcher covers `shell` and `write` or `ghost-gate.json` holds two entries (Requirement 2, criterion 4).
- **D3, Module loading.** How the `.mjs` scripts load the built packages of the workspace (exports maps and the build task) and how the missing-build case is detected (Requirement 8, criterion 7).
- **D4, Watchdog values.** The 50 s watchdog and the 55 s runner pipeline deadline leave 5 s to the Hook_Limit; the design checks that the cleanup finishes in that time and may lower the watchdog.
- **D5, Provenance kinds.** The mapping of MCP tools to `issue`, `web`, and `other`, and the rule that decides the `kind` of a tool the design does not know.
- **D6, Server launch in a power.** How `mcp.json` locates the built MCP_Server when the power is installed from a folder or a repository (relative path, package script, or host placeholder), and whether the build output is committed or built on install.
- **D7, World registration.** The design looks first for a registration mechanism under `worlds/` that changes nothing in `core`, and states why and how minimally if a `core` change is unavoidable (Requirement 16, criterion 11).
- **O1, File events.** The identifier of the file-create trigger (candidate `PostFileCreate`) and of a file-delete trigger, and the STDIN fields of file events including the file path. Only `PostFileSave` is confirmed. Settled by the probe of Requirement 24.
- **O2, Post Tool Use.** Whether Post Tool Use delivers the tool response, whether it fires for a blocked call, and whether the STDOUT of a file-event hook reaches the agent context. Settled by the probe of Requirement 24. Requirements 13 and 14 hold in either case: the gate writes the Grave_Entry, and the Ghost_Log falls back to reading the file.
- **O3, Prefixed tool names.** The name that an installed power gives to the `ghost-run` server and its tools, confirmed by the installation test of Requirement 20.
- **O4, Seance base.** The default `http://localhost:5317` of the Message_Builder is a placeholder until the seance route of the apps exists; `GHOST_RUN_SEANCE_BASE` overrides it.
- **O5, Parallel tool calls.** Whether Kiro runs several Pre Tool Use hooks for parallel tool calls at the same time. The design bounds the number of simultaneous ghost runs (resource use) and the Ghost_Store writes are already line-atomic.

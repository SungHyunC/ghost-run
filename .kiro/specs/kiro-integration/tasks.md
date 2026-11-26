# Implementation Plan: kiro-integration

## Overview

This plan builds the Kiro integration of Ghost Run+: the workspace package `@ghost-run/kiro-hook` (`integrations/kiro-hook/`: `ghost-gate`, `ghost-log`, `contract-pbt`, `world-scaffold`, `blacklight-steering`, the probe hook, and the shared Ghost_Store module), the workspace package `@ghost-run/mcp` (`integrations/mcp/`: the stdio MCP server `ghost-run` with the tools `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, and `blacklight`), the plugin folder `integrations/power/`, the hook registration files in `.kiro/hooks/`, and the documentation. Hook scripts and the MCP server are ECMAScript modules (`.mjs`, Node.js 20 or later) with JSDoc types checked by `tsc` with `checkJs` and `strict` (design: Overview and Architecture). Tests use `vitest` and `fast-check`. The design uses JavaScript with JSDoc, so no language question is needed.

The plan follows this order:

1. The probe hook (task 1) is the first task. It measures the host facts that are not yet confirmed (file-create trigger name, file-event STDIN fields, Post Tool Use response fields, whether a blocked call fires Post Tool Use, whether Pre Tool Use `ask` raises a prompt, the `code` tool operation list, and the placement of `timeout`) in Kiro IDE and Kiro CLI, records them in `docs/measurements.md`, folds them into the spec, and disables the probe hook.
2. Package scaffold, import bans, steering, `.gitignore`, and source-scan tests (task 2). Retirement of the experiment B hooks and the hook file format tests (task 3).
3. Shared modules: gate constants and hook I/O, the Ghost_Store, redaction, session keys, stats, provenance, run records (task 4), with Properties 4, 5, 16, and 21.
4. Gate input and judgment: tool classification, wards file loading, safe list, self-protection, approval guard (task 5), semaphore, watchdog, shell judgment, write judgment (task 6), with Properties 2, 6, and 11.
5. Gate output and records: decision mapping, diff summary, Plan B lines, Grave_Entry (task 7), with Properties 1, 10, 12, and 13. Gate assembly, bootstrap, hook file, and process tests (task 8), with Properties 3, 9, 14, and 15. Checkpoint (task 9).
6. The other hooks: `ghost-log` (task 10), `contract-pbt` (task 11, Property 19), `world-scaffold` (task 12, Property 7), `blacklight-steering` (task 13, Property 20).
7. The MCP server (task 14, Properties 8, 17, and 18) and the power (task 15).
8. Repository hygiene and timing measurement (task 16). Manual host verification: exit-code behavior, the `ask` channel, and the power install (task 17). Documentation (task 18).
9. The task that enables the gate for the development of this repository (task 19, target 2026-11-22) and the final checkpoint (task 20).

State that already exists and is not recreated by this plan:

- `integrations/kiro-hook/exp-b-gate.mjs` and `.kiro/hooks/exp-b-block-rm-rf.json`, `.kiro/hooks/exp-b-log-write.json` (experiment B). Task 3.1 changes only the `enabled` field of the two JSON files. `exp-b-gate.mjs` is kept unchanged and nothing imports it.
- `pnpm-workspace.yaml` already lists `integrations/*`, so `@ghost-run/kiro-hook` and `@ghost-run/mcp` need no new entry. The folder `integrations/power/` has no `package.json` and is not a workspace package.
- `core` already exports `sanitizeJudgeText` (the judge sanitizer, renamed because `possession` exports its own `sanitizeText`), `normalizePath`, `compilePathSet`, `extractCanaries`, `createInspector`, `renderMessage` (`wards`), and the possession API (`scanText`, `scanTexts`, `formatReport`, `exitCodeFor`, `collectNeedles`, `traceRedThread`, `parseProvenanceLog`, `serializeProvenanceLog`), with `scanFiles` in the subpath `@ghost-run/core/possession-node`.
- `@ghost-run/ghost-runner` already exports `runPlan`, `RunResult`, `RunOutput`, `Isolation`, `Diagnostic`, `serializeRunResult`, and `parseRunResult`.

### Cross-spec dependencies and wave order

This plan edits no other spec. Hand-offs that belong to another spec are recorded here as dependencies and are not tasks of this plan. Each task that depends on one says so and says what is done until the dependency lands.

- **ghost-runner implementation** (`runPlan`, `RunResult`, `RunOutput`, `serializeRunResult`). Tasks 4.3, 6.2, 7.1, 8.1, 14.3, and 16.2 call these. `RunPlanOptions.pipelineDeadlineSec` below 55 (the gate passes at most 44) is design open item O8. Task 6.2 verifies that `runPlan` accepts it and stops and reports if it does not. The save-time Property-Based-Test run counts (20 per Docker-bound property, whole run within 60 s) and the variable that selects them (design O13) are owned by `ghost-runner` Requirement 17 criterion 8. Task 11.1 reads them and defines no count of its own.
- **ghost-runner next round: `RunnerOptions.runId`** (an optional, caller-chosen run id; design O12). Without it Requirement 8 criterion 9 (cleanup by the `ghost-run.run-id` label) cannot hold when the runner hangs, because the watchdog does not know the label. The gate task that depends on it is 6.1 (watchdog). Until the option exists, task 6.1 does the following: the gate does not pass a `runId`, the watchdog still exits with code 2 and the fixed timeout line before the Hook_Limit, the runner's own pipeline deadline (`min(44, floor(48 - elapsed))`) is what removes the container and the Copy on every path where the runner returns, and the hung-runner container-cleanup test in task 8.10 reports `skipped (runner runId option missing)` and not `passed`. The README states that Requirement 8 criterion 9 is not claimed for a hung runner until the option lands. When the option exists, task 6.1 is re-run with the label cleanup enabled (the flag `RUNNER_SUPPORTS_RUN_ID` in `gate-config.mjs`).
- **wards-config implementation** (`loadWardsFile` in `@ghost-run/wards-config/node`, `formatConfigError`, `Config_Error`). `ParseResult.safeCommands` is added by wards task 6 (the `wards-config` change that kiro-integration Requirement 4 criterion 6 names; design O7) and is not in `wards/tasks.md` today. Until it lands, `loadWardsForHook` reads `result.safeCommands ?? []`, the gate sees `[]`, and only the built-in grammar applies. Tasks 5.2, 5.3, and 5.4 test the extension path with an injected loader result, and they never require the real field.
- **wards implementation** (`renderMessage`, `WardEngine.evaluate`). The check that a `warn` verdict with no violations renders a warn template (design O10) is added by the wards task 4 round (a test in `wards`, not a task of this plan). Task 7.1 adds a gate-side test of the same fact. If it fails, the failure is reported to the `wards` spec and the gate does not work around it with its own message text.
- **possession implementation** (provenance format `{ source, kind, content }` with `parseProvenanceLog` and `serializeProvenanceLog`; scan entry point `scanFiles`, `scanTexts`, `formatReport`, `exitCodeFor`; `collectNeedles`, `traceRedThread`). Tasks 4.3, 10.1, 13.1, 14.3, and 14.4 call these. Provenance records have no clock, session, or secret field, and the gate never adds one.
- **ui-kit implementation** (`Grave_Entry`, named `GraveEntry` in the `@ghost-run/ui` public entry). Tasks 7.5, 7.6, and 8.9 depend on it as a type-only import (`import type`) and for the id and time checks of the Graveyard. The ui-kit `tasks.md` task 3.1 creates the type. If `@ghost-run/ui` does not exist when task 7.5 starts, 7.5 stops and reports the dependency. It never declares a second `Grave_Entry` shape.
- **core** (`sanitizeJudgeText` already split from the possession `sanitizeText`, so the gate imports the judge sanitizer under that name). Nothing in this plan edits `core/src`. Task 2.2 edits only ESLint configuration files and must not run at the same time as any other task that edits `core/` in this spec or in another spec (`possession`, `wards`, `ghost-runner`, `ui-kit` task 13.1, `ghost-shell` tasks 1.1 and 17.2).
- **Built packages.** Process-level tests (bootstrap, hook scripts as child processes) need `pnpm -r build` to have run, because the scripts import the built `@ghost-run/core`, `@ghost-run/ghost-runner`, and `@ghost-run/wards-config`. Vitest tests of pure functions run from source through aliases and need no build.
- **Probe results.** Tasks that depend on a probe fact name the fact and the sub-task 1.7, which folds the results into the spec. Tasks 4.8, 5.1, 3.2, 8.3, 10.1, 11.1, 11.4, 12.1, 12.3, 13.1, and 13.3 depend on it. No task that depends on an unconfirmed fact starts before task 1.7 is complete (Requirement 24 criterion 1). Tasks that do not depend on a probe fact run in the same waves as the manual probe steps so that they overlap with the human work.
- **world-smith** is a separate spec and is not part of this plan.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: kiro-integration, Property <n>: <title>` and `// **Validates: Requirements ...**`, uses `fc.assert(fc.property(...))` or `fc.assert(fc.asyncProperty(...))` with `numRuns: NUM_RUNS` from `integrations/kiro-hook/tests/pbt-config.mjs` (task 2.1: at least 100 in a Short_Run with a per-file timeout of 60,000 ms, at least 10,000 when `GHOST_PBT_MODE=nightly`), and prints the seed on failure. The numbering and titles are those of the Correctness Properties section of `design.md` (Properties 1 to 21). The labels `KI-P1` to `KI-P9` are used only for Properties 1 to 9 (Requirement 23) and never for P1 to P8 of the safety contract, `UI-P1` to `UI-P11`, or `GS-P1` to `GS-P6`. Properties 10 to 21 are design-level additions (design O17); they run in the same suite.
- **Property-based test sub-tasks** use this form: the title, one bullet that names the test file, the generators, and the check, then the line `**Property N: <title>**` and the line `**Validates: Requirements X.Y**`, then the `_Requirements:_` line.
- **No optional tasks.** Every task in this plan is required, including unit tests, example tests, property tests, integration tests, scan tests, measurement tasks, and manual tasks. No task carries the optional `*` marker.
- **Test labels.** Tests are labeled `[no-docker]` (run everywhere) or `[docker]` (need a running Docker daemon and the built box image). `[docker]` tests use `describe.skipIf(!dockerAvailable)` and report `skipped (docker unavailable)`, never `passed`, when Docker is unavailable. P1, P5, and P6 are never asserted in that case and never in Plan_B.
- **Test data.** Canary values only (for example `sk-CANARY-abc123`), reserved domains only (`.example`, `.test`, `.localhost`, `.invalid`; `registry.npmjs.org` and `192.0.2.0/24` where Requirement 22 criterion 3 allows them). Hidden Unicode characters and the HTML comment opener are never written literally in any file of this feature. Tests build them with `\u` escapes or `String.fromCodePoint`.
- **Temporary stores.** A test run creates its Ghost_Store in a temporary folder outside the repository (`makeTempStore()` from task 2.1) and leaves no `.ghost-run/` content in the working tree (Requirement 22 criterion 5).
- **No LLM calls and no network calls** in any hook script, the MCP server, tests, or scripts.
- **Measurement records.** Measured and host-observed results go to `docs/measurements.md` (English; `docs/devlog.md` is a separate Korean dev log that this plan does not edit) as one appended entry per task. Every task that edits `docs/measurements.md` is in its own wave, so no two tasks edit the file at the same time.
- **Hook files in `.kiro/hooks/`** use the documented entry-level `timeout` and an explicit `enabled`. The `exp-b-` files and the probe files are the only exceptions (Requirement 2, design D8).
- **Verification commands.** `pnpm --filter @ghost-run/kiro-hook test`, `pnpm --filter @ghost-run/mcp test`, `pnpm --filter <package> typecheck`, `pnpm --filter <package> lint`, `pnpm -r build`, and `GHOST_PBT_MODE=nightly` for the Nightly_Run.
- **Scope of this plan.** Coding tasks, plus the manual host-verification tasks that Requirements 2, 10, 20, and 24 demand and the human-confirmed enable task of Requirement 10 criterion 11. Ward rule evaluation, `wards.yaml` parsing, the runner, the scanner, and the UI belong to other specs, which this plan only calls.

## Tasks

- [ ] 1. Host fact probe (first task; Requirement 24)
  - [x] 1.1 Create the minimal Hook_Package skeleton that the probe lives in
    - Create `integrations/kiro-hook/package.json` (`name: "@ghost-run/kiro-hook"`, `private: true`, `type: "module"`, `engines.node >= 20`, dev dependencies `vitest` and `fast-check`, script `test` as `vitest --run`). `pnpm-workspace.yaml` already lists `integrations/*`. Keep `exp-b-gate.mjs` untouched. Run `pnpm install`.
    - Task 2.1 completes the package (tsconfig, ESLint, dependencies on the workspace packages). The probe script itself imports only `node:fs` and `node:path`, so it needs none of them.
    - _Requirements: 1.1, 24.1_

  - [x] 1.2 Create the probe script and the probe hook files
    - Create `integrations/kiro-hook/probe-host-facts.mjs`. It imports only `node:fs` and `node:path`, reads the whole STDIN, exits with code 0 on every path (including its own errors), makes no network or LLM call, and by default prints nothing. For each event it appends one JSON line to `.ghost-run/probe/events.jsonl` (folders `0700`, file `0600`) with only these keys: `hook_event_name`, `fields` (the sorted top-level field names), `toolInputFields` (the sorted `tool_input` field names), `toolName`, `paths` (workspace-relative paths taken from `path`, `targetFile`, `file_path` and from any top-level string field whose name contains `path` or `file`; a path outside the workspace is recorded as `<outside>`), for Post Tool Use `objectFields` (the names, never the values, of object-valued top-level fields other than `tool_input`), and `tool_input_digest` (only the length and SHA-256 of content-like `tool_input` fields, never the content). It never reads file content, command text, or response text into a record. The one allowed comparison of the command text is the `--deny-test` and `--ask-test` modes below, which compare it to a fixed constant and record nothing of it.
    - Test modes from one optional argument (design: Probe hook, open item O15 records the deviation from Requirements 2.2 and 24.3): `--deny-test` (a Pre Tool Use mode that exits 2 only for the shell command `echo ghost-run-block-probe` and records `{ "denyTest": "denied" }`), `--stdout-test` (prints the fixed marker line `GHOST-PROBE-STDOUT-MARKER` on STDOUT), `--timeout-test=entry` and `--timeout-test=action` (record `start`, sleep 3 s, record `end`, each with its placement name), and `--ask-test` (a Pre Tool Use mode that, only for the shell command `echo ghost-run-ask-probe`, prints the JSON `{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"probe: ask test"}}` and exits 0, and records `{ "askTest": "asked" }`).
    - Create `.kiro/hooks/probe-host-facts.json` (version `v1`) with these entries, each `command` of the form `node integrations/kiro-hook/probe-host-facts.mjs [mode]` and `enabled: true`: `PreToolUse` matcher `*`; `PreToolUse` matcher `shell` with `--deny-test`; `PostToolUse` matcher `*`; `PostFileSave`, `PostFileCreate`, and `PostFileDelete` (one entry each, matcher `.*`); `PostFileSave` matcher `probe-scratch/` with `--stdout-test`; `PostFileSave` matcher `probe-scratch/` with `--timeout-test=entry` and `timeout: 1` at entry level; `PostFileSave` matcher `probe-scratch/` with `--timeout-test=action` and `timeout: 1` inside `action`. Every other entry uses `timeout: 10`.
    - Create `.kiro/hooks/probe-ask.json` with `enabled: false`: one `PreToolUse` entry, matcher `shell`, `--ask-test`. A human enables it in task 17.2 only.
    - This task creates files under `.kiro/hooks/`; the gate is not enabled yet, so no approval prompt applies (Requirement 24 criterion 7).
    - _Requirements: 24.1, 24.2, 24.3, 24.7, 2.7_

  - [x] 1.3 Write unit tests for the probe script [no-docker]
    - `integrations/kiro-hook/tests/probe-host-facts.test.mjs`: spawn the script with `process.execPath` and generated events on STDIN, with `cwd` set to a temporary folder outside the repository. Check: the record keys are exactly the allowed ones; a canary placed in `tool_input.text`, in `tool_input.command`, in a response field, and in file content never appears in `events.jsonl`; a path outside the workspace is recorded as `<outside>`; invalid JSON, empty STDIN, and an unwritable store folder all exit with code 0 and print nothing; `--stdout-test` prints exactly the marker line and no other mode prints anything except the `--ask-test` JSON; `--deny-test` exits 2 for the one fixed command and 0 for another; the timeout modes write `start` and `end` lines.
    - _Requirements: 24.2, 24.3, 22.5_

  - [x] 1.4 MANUAL (human, Kiro IDE 1.4.x): run the probe and read the log
    - Prerequisites: tasks 1.2 and 1.3 are done and the probe files are in the workspace. Do all steps in the IDE on the folder `ghost-run`. Write the IDE version (Kiro menu, About) at the top of your notes.
    - Step 1. Open the folder: File, Open Folder, choose `ghost-run`.
    - Step 2. Trust the folder. A trust dialog asks whether you trust the authors of the files in the folder. Click the button that trusts the folder (the label is close to "Yes, I trust the authors"). If no dialog appears, open the Command Palette (Cmd+Shift+P), run "Workspaces: Manage Workspace Trust", and confirm the folder is trusted. Hooks run only for a trusted folder.
    - Step 3. Reload the window: Cmd+Shift+P, run "Developer: Reload Window". Hooks load only after a reload that follows trusting.
    - Step 4. Open the Kiro panel (the Kiro icon in the activity bar) and expand "Agent Hooks". Check that the probe-host-facts entries are listed and enabled and that probe-ask is listed as disabled. If the probe entries are missing, stop and write "probe not loaded in IDE" in your notes with the panel contents.
    - Step 5. Clear old data: in the Explorer, expand `.ghost-run/probe/` (if the folder is hidden, press Cmd+P, type `.ghost-run/probe/events.jsonl`, press Enter) and delete `events.jsonl` if it exists. Create the folder `probe-scratch/` in the repository root (Explorer, New Folder).
    - Step 6. Start a new chat session (a hook created in a session applies from the next session). Choose supervised mode so that you see every approval.
    - Step 7. Send these messages one at a time and wait for each to finish before the next: (a) "Create the file probe-scratch/a.txt that contains the single word hello. Use the file write tool." (b) "Append the line world to probe-scratch/a.txt with the append tool." (c) "In probe-scratch/a.txt replace hello with hi with the replace tool." (d) "Read probe-scratch/a.txt." (e) "Run the shell command: echo ghost-run-block-probe" (f) "Use the code intelligence tool to run diagnostics on core/src/index.ts, then search symbols for runPlan. After that, quote the exact list of operation values that the code tool accepts, as written in the tool description." (g) "Delete probe-scratch/a.txt with the delete tool." After message (c), also ask: "Did your context in the last turn contain a line with GHOST-PROBE-STDOUT-MARKER? Quote the line or say none." Approve each tool request that the IDE shows.
    - Step 8. Read the log. Open `.ghost-run/probe/events.jsonl` (Cmd+P, type the path, Enter). Each line is one JSON object whose first key is `hook_event_name`. For each fact, look for: (a) a line whose `hook_event_name` is `PostFileCreate` after message (a), and a line `PostFileDelete` after message (g). If only `PostFileSave` appears for the create, record "create fires PostFileSave only". If a name other than these appears, record that name exactly. (b) For file-event lines (`hook_event_name` starting with `PostFile`), the `fields` and `paths` arrays: is a path present, which field in `fields` holds it, is it absolute or workspace-relative (`paths` is always shown workspace-relative, so judge the form from the host's field names and from whether `paths` shows `<outside>`). (c) For lines with `hook_event_name` `PostToolUse`, the `objectFields` array (the names of object-valued fields other than `tool_input`, for example `tool_response`): record the exact name, or "none" when `objectFields` is empty. (d) After message (e), look for the line that has `"denyTest":"denied"`. Then check whether a line with `hook_event_name` `PostToolUse` and the `toolName` of the shell tool follows it before the next `PreToolUse` line. If yes, a blocked call fires Post Tool Use. If no, it does not. Also note in the chat whether the IDE showed the call as blocked. (e) The reply to the marker question: if the agent quotes the marker line, file-event STDOUT reaches the context; if it says none, it does not. The marker lines in the log carry `"stdoutTest":"printed"` and only prove that the hook ran. (f) Compare the operation list the agent quoted and the `toolInputFields` of the lines whose `toolName` is the code tool with the list in `design.md` (Tool classification) and note every difference. (h) For `timeout`: find the lines that have the key `timeoutTest` (value `entry` or `action`); each has `phase` `start` or `end`. If a placement has a `start` line and no `end` line, the host stopped the hook after 1 s and honored that placement. If it has both, the host did not honor it (the 60 s default applied). Lines can repeat once per save of a file under `probe-scratch/` (messages a to c). Lines may also carry `tool_input_digest` (a length and a hash); ignore it.
    - Step 9. Judge and save: copy the file to `.ghost-run/probe/ide-events.jsonl` (right-click, Copy, Paste, Rename) so that the CLI run starts clean, delete `events.jsonl`, and delete the `probe-scratch/` folder. Keep your written answers for task 1.6.
    - Status: Done 2026-11-19 (00:03 to 00:10 KST), Kiro IDE 1.4.215, new chat session, agent Default, model Auto, permission mode Supervised. Run note: Claude Code ran the steps by operating the IDE screen (background accessibility control) for the human. Step 3 (Reload Window) was not done, because background key input did not reach the Electron window. Instead the Agent Hooks panel was checked: the probe entries were listed as enabled and only `Probe: ask test` as disabled, and every message left hook records in the log. Message (g) got the answer that the agent has no delete tool, so an extra message (g2) "Yes, delete it with rm probe-scratch/a.txt through the shell." was sent. Two Pre Tool Use hooks ran before the approval window (Allow, Always allow, Deny, Always deny) appeared, Allow was pressed once, the file was deleted, and no file event fired (log lines 27 to 29). The log is `.ghost-run/probe/ide-events.jsonl` (29 lines, not in git); the message transcript is `.ghost-run/probe/ide-transcript.md`. A separate read-only judgment by another agent matched this one.
    - _Requirements: 24.4, 2.9, 2.7, 13.2, 14.2, 15.8_

  - [x] 1.5 MANUAL (human, Kiro CLI V3 3.4.x): run the probe and read the log
    - Prerequisites: task 1.4 is done and `events.jsonl` was moved to `ide-events.jsonl`. Use a terminal outside the IDE.
    - Step 1. In the terminal run `kiro-cli --version` and write the version down (expect 3.4.0 or later).
    - Step 2. Run `cd <path-to>/ghost-run` and recreate the empty folder `probe-scratch/` (`mkdir probe-scratch`).
    - Step 3. Start a new chat session in this folder (`kiro-cli chat`). If the CLI has a command that lists hooks (try `/hooks`), run it and note whether the probe entries are listed; if there is no such command, say so in your notes.
    - Step 4. Keep tools untrusted so that you see each approval (if the CLI has a tool trust command such as `/tools`, check that `execute_bash` and the write tools are not trusted).
    - Step 5. Send the same messages (a) to (g) of task 1.4 step 7, including the marker question after (c), and accept each tool request.
    - Step 6. Read `.ghost-run/probe/events.jsonl` in an editor or with `less` and judge facts (a) to (h) exactly as in task 1.4 step 8. Note differences from the IDE. In the CLI also check whether the hook output text of a blocked call is shown in the chat.
    - Step 7. Save: `cp .ghost-run/probe/events.jsonl .ghost-run/probe/cli-events.jsonl`, then remove `events.jsonl` and `probe-scratch/`. Exit the CLI.
    - _Requirements: 24.4, 2.9, 13.2, 14.2, 15.8_

  - [x] 1.6 Record the probe results as a table in `docs/measurements.md`
    - Append one entry that holds a results table with the columns `Fact`, `IDE 1.4.x`, `CLI 3.4.x`, `Evidence`, and one row per fact: (a) file-create and file-delete trigger identifiers; (b) file-event STDIN fields and the path form; (c) Post Tool Use response field name; (d) whether a blocked call fires Post Tool Use; (e) whether file-event STDOUT reaches the agent context; (f) `timeout` placement honored; (h) the `code` tool fields and the operation list, with each difference from `CODE_READ_ONLY_OPERATIONS`; and whether two Pre Tool Use events overlapped in time (design O5). Give the IDE and CLI versions. Put only field names, trigger names, tool names, and path forms in the table.
    - Use the exact heading `Probe results` so that the test of task 1.8 and task 3.2 can detect that the table exists. The `ask` row is filled by task 17.2.
    - Status: the IDE column was filled 2026-11-19 from `ide-events.jsonl` and the transcript.
    - _Requirements: 24.5_

  - [x] 1.7 Fold the probe results into the spec (requirements and design open items)
    - This is the only task that edits `requirements.md` and `design.md` for probe results. It changes only the statements that the results settle: Requirement 2 criterion 7 (the file-create identifier and the matchers), the Introduction host-facts list, Requirement 13 criterion 2 and Requirement 14 criterion 2 (response field, blocked-call behavior), Requirement 15 criterion 8 (STDOUT reaching the agent), Requirement 24 notes, and the open items O1, O2, O5, O6, O15, O19 of `design.md` (mark each Resolved with the date and the value) and the hook file format section (the placement of `timeout`, D8). It changes no other text.
    - Decide and write down: the constants `FILE_EVENT_PATH_FIELDS`, `FILE_CREATE_TRIGGER`, and `POST_RESPONSE_FIELDS` (used by task 4.8); whether `world-scaffold.json` can be written (Requirement 2 criterion 7); whether the duplicate-skip rule of ghost-log is needed (design D10); the corrected `CODE_READ_ONLY_OPERATIONS` list and the `code` field names (used by task 5.1).
    - If a result contradicts a design decision, record the contradiction and the changed decision here and name the later task that is affected. Do not start that task before the edit is done.
    - Status: Done 2026-11-19 (CLI 3.4.0 results of 2026-11-18 plus IDE 1.4.215 results of 2026-11-19; both hosts agree on every fact that both could show).
    - Decisions: `FILE_EVENT_PATH_FIELDS = ['file_path']`; `FILE_CREATE_TRIGGER = 'PostFileCreate'`; `POST_RESPONSE_FIELDS = ['tool_response']` (a non-object value in both hosts); `world-scaffold.json` can be written with `PostFileCreate` (it fires for a file made by the write tool, not for a file made by a shell command); the ghost-log duplicate-skip rule (D10) is not needed, because a call blocked with exit code 2 fires no Post Tool Use in either host; `CODE_READ_ONLY_OPERATIONS` is unchanged (the 11 read-only names of the design) and the `code` field names are `file_path`, `operation`, `symbol_name` (CLI only; the IDE default agent has no `code` tool). `timeout` stays at entry level (D8, confirmed in both hosts); file-event STDOUT reaches the agent in neither host. `WARN_MODE` is unchanged.
    - No contradiction: no design decision changes, and the existing constants, `lib/file-event.mjs`, and the tool table of tasks 4.8 and 5.1 already match, so no code change was needed (only comments that said "IDE pending" were updated).
    - Unresolved, with the reason: O5 (overlap of Pre Tool Use hooks) because the probe writes no timestamp in `PreToolUse` records; `PostFileDelete` because neither host's default agent has a delete tool and a shell `rm` fires no file event; the raw form (absolute or workspace-relative) of `file_path`, because the probe records only the normalized path. Also not shown: whether STDERR text of a blocked call reaches the agent in the IDE (the deny test wrote no STDERR; the agent saw "no reason").
    - _Requirements: 24.5, 2.7, 13.2, 14.2, 15.8_

  - [x] 1.8 Disable the probe hook files and add the test that keeps them disabled
    - Set `enabled` to `false` in every entry of `.kiro/hooks/probe-host-facts.json` (and keep `.kiro/hooks/probe-ask.json` disabled). Keep both files and `probe-host-facts.mjs` in the repository.
    - `integrations/kiro-hook/tests/probe-disabled.test.mjs`: fails when any entry of `probe-host-facts.json` or `probe-ask.json` has `enabled` equal to `true` while `docs/measurements.md` contains the heading `Probe results`.
    - **Depends on tasks 1.6 and 1.7.**
    - _Requirements: 24.6_

- [ ] 2. Package scaffold, import bans, steering, and source scans
  - [x] 2.1 Complete the Hook_Package configuration and the test harness
    - Extend `integrations/kiro-hook/package.json`: dependencies `@ghost-run/core`, `@ghost-run/ghost-runner`, and `@ghost-run/wards-config` (all `workspace:*`); dev dependencies `typescript`, `vitest`, `fast-check`, `eslint`, `@types/node`; scripts `test`, `test:nightly`, `typecheck`, `lint`. The type-only dependency on `@ghost-run/ui` is added by task 7.5.
    - Create `tsconfig.json` (`allowJs`, `checkJs`, `strict`, `noEmit`, `module` and `moduleResolution` `NodeNext`, include the scripts, `lib/`, and `tests/`), `eslint.config.mjs` (`no-restricted-imports` that allow `@ghost-run/core`, `@ghost-run/core/possession-node`, `@ghost-run/ghost-runner`, `@ghost-run/wards-config`, `@ghost-run/wards-config/node`, and `import type` of `@ghost-run/ui`, and ban deep imports into other packages and the `exp-b-gate.mjs` module; `no-eval`, `no-new-func`, `no-implied-eval`), and `vitest.config.ts` (aliases of the three packages to their `src` entry for pure tests).
    - Create `tests/pbt-config.mjs` (reads `GHOST_PBT_MODE`: `NUM_RUNS` 100 by default and 10,000 for `nightly`, per-file timeout 60,000 ms in the short run) and `tests/fixtures/` helpers: `makeTempStore()` (a temporary folder outside the repository, removed after the test), a canary arbitrary (`sk-CANARY-` plus characters from `[A-Za-z0-9_-]`), fixture builders for Hook_Event values of each tool, and an in-memory `FsView`.
    - Do not call any LLM API anywhere in the package.
    - **Dependency note:** process-level tests need `pnpm -r build` (see Cross-spec dependencies).
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 22.5_

  - [x] 2.2 Add the `integrations/` import bans to the other packages and verify that lint fails on a violation [no-docker]
    - **Isolated task: must not run at the same time as any other task that edits `core/`, in this spec or in another spec.** Before starting, confirm that no other core-editing task is in progress.
    - Scope of this round: `core`, `ghost-runner`, `ui`, `wards-config`, `worlds/playground-shell`, and `apps/ghost-shell`. For each, check the existing `no-restricted-imports` rule and add only what is missing: the pattern `**/integrations/**` and the package names `@ghost-run/kiro-hook` and `@ghost-run/mcp`. If `ui/eslint.config.mjs` does not exist yet (the `ui-kit` scaffold has not run), skip `ui`, record the gap in the test file header, and report it in the final checkpoint.
    - Create `integrations/kiro-hook/tests/import-ban.test.mjs`: it covers these six packages. For each package that has an ESLint configuration, write a temporary file under that package's `src/` that imports `@ghost-run/kiro-hook`, run ESLint in a child process (one per probe), assert a `no-restricted-imports` error, and remove the file in `finally`. The `ui` case reports `skipped (ui package missing)` when absent.
    - Run the existing lint and test suites of the edited packages and confirm they pass unchanged.
    - Status: Done 2026-11-18 for core, ghost-runner, ui, wards-config, worlds/playground-shell, apps/ghost-shell: each `no-restricted-imports` rule bans `**/integrations/**`, `@ghost-run/kiro-hook(/**)`, and `@ghost-run/mcp(/**)`; `integrations/kiro-hook/tests/import-ban.test.mjs` (18 cases, ESLint in a child process per probe) passes. Not done: `worlds/drawer-arm` and `apps/ghost-hand`; finish them together with ghost-hand task 19.
    - _Requirements: 1.4_

  - [x] 2.3 Update `.kiro/steering/structure.md` for the new dependency direction
    - Edit the Dependency Direction section so that it states: `integrations/*` may depend on `core/` and `ui/` and, through their public entry points, on `ghost-runner/` and `wards-config/`, and `integrations/mcp` may depend on `integrations/kiro-hook` through its `index.mjs`. Add the sentence to the same place where `ghost-runner/` and `wards-config/` are listed. Keep every other rule.
    - Keep the file free of hidden Unicode and of the HTML comment opener. Do not run this task at the same time as another task that edits a steering file (`ghost-shell` task 2.1, `ui-kit` steering task).
    - _Requirements: 1.9, 1.3_

  - [x] 2.4 Add `.ghost-run/` to `.gitignore` and test the entry [no-docker]
    - Add the lines `.ghost-run/` and `integrations/power/mcp.local.json` to the repository `.gitignore`. Do not ignore anything under `.kiro/`.
    - `integrations/kiro-hook/tests/gitignore.test.mjs`: reads `.gitignore` and requires an effective entry for `.ghost-run/` and for `integrations/power/mcp.local.json`.
    - _Requirements: 12.1_

  - [x] 2.5 Write the source-scan tests [no-docker]
    - `integrations/kiro-hook/tests/source-scan.test.mjs` scans `integrations/kiro-hook/**/*.mjs` and `integrations/mcp/**/*.mjs` (excluding `node_modules`, `dist`, and `tests/`, and exempting `exp-b-gate.mjs` from the checks that do not apply to it). It fails on: a call to an LLM API or a network primitive (`fetch(`, `node:http`, `node:https`, `node:net`, `node:dgram`, `WebSocket`, `XMLHttpRequest`); `eval`, `new Function`, and a dynamic `import()` whose argument is not a string literal (the one allowed exception is the literal `./lib/gate/main.mjs` in `ghost-gate.mjs`); `child_process` outside `lib/pbt/run.mjs` and the probe; reads of `process.env` other than `GHOST_RUN_WARDS_FILE` and `GHOST_RUN_SEANCE_BASE` (and the writes to the child environment that `contract-pbt` makes); `Date` or `Date.now` outside `lib/store/**`, `lib/gate/main.mjs`, and the probe; any import of `exp-b-gate.mjs`; any `lib/gate/**` module that imports `lib/store/provenance.mjs`; any module outside `lib/store/ghost-store.mjs` that calls `fs.writeFile`, `fs.appendFile`, or `fs.write` for a path under `.ghost-run`; and any `fs.write*` whose path argument comes from a command string.
    - The scan passes on the current tree and gets stricter as modules appear, because it walks the folders and does not name files.
    - _Requirements: 1.5, 1.6, 1.7, 1.10, 12.1, 13.13, 21.4_

- [x] 3. Retirement of the experiment B hooks and hook file format tests
  - [x] 3.1 Disable the experiment B hook files
    - Set `enabled` to `false` in `.kiro/hooks/exp-b-block-rm-rf.json` and `.kiro/hooks/exp-b-log-write.json`. Change no other field (the `timeout` inside `action` stays as it is). Keep `integrations/kiro-hook/exp-b-gate.mjs` unchanged and keep both JSON files. Do not edit the experiment B record in `docs/devlog.md`.
    - Do not reuse any command-shape logic of `exp-b-gate.mjs` in the new modules (task 2.5 scans that nothing imports it).
    - _Requirements: 21.1, 21.2, 21.4_

  - [x] 3.2 Write the hook file format tests and the exp-b retirement test [no-docker]
    - **Depends on tasks 1.7 and 1.8** (the confirmed placement of `timeout` and the confirmed file-event trigger identifiers).
    - `integrations/kiro-hook/tests/hook-files.test.mjs`: parse every `.kiro/hooks/*.json` as JSON and require `version` equal to `v1`; a non-empty `name`; a `trigger` from `PreToolUse, PostToolUse, PostFileCreate, PostFileSave, PostFileDelete, PermissionRequest` (or the identifier that task 1.7 recorded); for a file trigger a `matcher` that compiles with `new RegExp`; `action.type` equal to `command`; a `command` that matches `^node integrations/kiro-hook/[a-z0-9-]+\.mjs$` with an existing script (probe entries may add one `--` argument); no absolute path and no user name in the file; an explicit boolean `enabled`; and, for every file whose name does not start with `exp-b-`, an entry-level `timeout` from 1 to 60 and no `timeout` inside `action`. Files that start with `exp-b-` are exempt from the placement check and are checked for `enabled` only.
    - `ghost-gate.json` check (when the file exists): exactly the matchers `shell` and `write` on `PreToolUse`, no matcher that contains `@mcp` or `@powers`, and the same `command` in both entries.
    - Retirement test: fails when any `exp-b-*` file has `enabled` equal to `true` while `ghost-gate.json` has any entry with `enabled` equal to `true`.
    - Presence of all five required files is checked later by task 16.1, because the hook files are created by later tasks.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.10, 21.3_

- [x] 4. Shared modules: gate constants, hook I/O, and the Ghost_Store
  - [x] 4.1 Implement `gate-config.mjs` and `lib/hook-io.mjs`
    - `gate-config.mjs` exports the constants of the design: `WARN_MODE = 'exit2'`, `WATCHDOG_MS = 50_000`, `RUNNER_DEADLINE_SEC = 44`, `SEMAPHORE_SLOTS = 2`, `SEMAPHORE_WAIT_MS = 5_000`, `STDIN_MAX_BYTES = 1_048_576`, `COMMAND_MAX_CODE_POINTS = 4096`, `DELETE_ENUM_MAX = 10_000`, `STORE_CAPS = { sessions: 20, runs: 200, graveyardLines: 2000, provenancePerSession: 1000, recordBytes: 1_048_576 }`, and the flag `RUNNER_SUPPORTS_RUN_ID = false` (see Cross-spec dependencies). The file is a Self_Protected_Path. It reads no environment variable. `WARN_MODE` stays `'exit2'` until task 17.3.
    - `lib/hook-io.mjs`: `readStdinBounded(stream, maxBytes)` (reads at most 1 MiB, rejects with `{ code: 'too-large' }`, decodes as UTF-8), `runHook(name, load, opts)` (the bootstrap helper), `fatal(kind)` that prints one fixed line from the design table and exits 2, and a writer that uses `process.stdout.write(text, cb)` and `process.stderr.write(text, cb)` and calls `process.exit(code)` in the callback so a pipe is flushed first. A gate exit code is always 0 or 2.
    - Write unit tests: too-large input, valid input, the fixed lines (no stack trace, no input text), and flush-before-exit with a pipe.
    - _Requirements: 3.1, 7.8, 8.1, 8.3, 8.4, 8.7, 1.7_

  - [x] 4.2 Implement `lib/store/ghost-store.mjs`, `lib/store/redact.mjs`, and `lib/store/session-key.mjs`
    - `ghost-store.mjs`: `storePaths(root)`, `appendLine(file, line)` (one `fs.write` of the whole line plus `\n` to a descriptor opened with `O_APPEND`, file mode `0600`, folders `0700`), `readLines(text)` (pure; returns `{ lines, corrupt }`), `enforceCaps(root, caps)` (20 session folders, oldest by modification time removed first; 200 Run_Records, oldest first; 2,000 graveyard lines; 1,000 provenance records per session; a record over 1 MiB is not written), and `storeWrite(text)` that redacts first. `approvals/` is not created (design D1). This module is the only place that writes under `.ghost-run/` (task 2.5 scans this).
    - `redact.mjs`: `loadCanaries(root, wardSet)` (reads the files that match the `secrets` patterns of the `egress` wards from the workspace into memory only, at most 16 files in code-point order of the path and 65,536 bytes each, runs `extractCanaries`), and `redactCanaries(text, canaries)` that replaces every raw occurrence with `[redacted]` and, with the `createInspector` of `core`, also the base64, base64url, hex, and percent-encoded forms.
    - `session-key.mjs`: `sessionKey(id)` returns `id` when it matches `^[A-Za-z0-9_-]{1,64}$`, else the lowercase SHA-256 hexadecimal digest of the UTF-8 bytes of `id`.
    - The Ghost_Store reading functions are pure over file contents; file access is in a thin adapter.
    - Write example tests: modes `0700` and `0600`, a torn line counted as `corrupt`, a failed write reports the failure class, canary redaction in all five forms, and an unreadable secret file is skipped without leaking its path.
    - _Requirements: 12.2, 12.3, 12.4, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11_

  - [x] 4.3 Implement `lib/store/stats.mjs`, `lib/store/provenance.mjs`, and `lib/store/runs.mjs`
    - `stats.mjs`: `statsLine(kind, clock)` (a line `{"kind":"<token>","at":"YYYY-MM-DDTHH:MM:SSZ"}` for the tokens `seen`, `safe-skip`, `ghosted`, `passed`, `warned`, `blocked`, `executed`, `provenance-skipped`; no command, path, or text), `summarizeStats(lines)` (pure; counts `commandsSeen`, `commandsGhosted`, `commandsBlocked`, `commandsWarned`, `commandsSafeSkipped`, `commandsExecuted`; corrupt lines ignored), and `formatStatsTable(summary)`.
    - `provenance.mjs`: `appendProvenance(root, sessionKey, record)` (validates the single record with `parseProvenanceLog` of `possession` before writing, writes nothing for a record that does not parse, defines no clock, session, or secret field) and `readProvenance(root, sessionKey)` (splits lines, parses each alone, skips and counts corrupt lines, validates the survivors as one log).
    - `runs.mjs`: `writeRunRecord(root, result)` (the output of `serializeRunResult` of `ghost-runner`; no `secretValues`, no payload byte) and `readRunRecord(root, id)` (accepts a Run_Id or a Grave_Id with a leading `g-`).
    - **Dependency note:** needs the possession implementation (provenance format) and the ghost-runner implementation (`serializeRunResult`).
    - Write example tests for the fixed line formats and for a record that fails `parseProvenanceLog`.
    - _Requirements: 12.2, 12.3, 12.5, 13.3, 13.7, 13.8, 14.7_

  - [x] 4.4 Write property test for the session key [no-docker]
    - `tests/prop-21-session-key.test.mjs`. Generators: arbitrary strings (including empty, over 64 characters, hidden characters built from code points, path separators) and arbitrary strings that match the pattern. Check: the result always matches `^[A-Za-z0-9_-]{1,64}$`, equals the input when the input matches, is deterministic, and differs for two different inputs whose digests differ.
    - **Property 21: Session key**
    - **Validates: Requirements 12.2, 13.1**
    - _Requirements: 12.2, 13.1_

  - [x] 4.5 Write property test for the store caps [no-docker]
    - `tests/prop-16-store-caps.test.mjs`. Generators: sequences of appends and session creations against injected small caps and a temporary store, with records of generated sizes around the 1 MiB bound. Check after every step: at most 20 sessions, 200 Run_Records, 2,000 graveyard lines, and 1,000 provenance records per session; the oldest item is removed first; a record over 1 MiB is not written and is counted as the Stats_Event `provenance-skipped`.
    - **Property 16: Store caps**
    - **Validates: Requirements 12.8, 13.1**
    - _Requirements: 12.8, 13.1_

  - [x] 4.6 Write property test for the provenance and stats round trip [no-docker]
    - `tests/prop-05-provenance-stats.test.mjs`. Generators: Provenance_Records (source, kind, content with hidden code points built from code points), Stats_Event line lists with corrupt lines mixed in, and several concurrent writers appending lines to one file. Check: each written line parses with `parseProvenanceLog`; `parseProvenanceLog(serializeProvenanceLog(readBack))` equals `readBack`; `summarizeStats` returns `commandsSeen` equal to the number of `seen` events and every other count equal to the number of events of its kind; for the concurrent appends every line either parses or is counted `corrupt`, and the number of parseable lines equals the number of appends.
    - **Property 5: Provenance and stats round trip**
    - **Validates: Requirements 12.3, 13.3, 13.6, 13.7, 13.8, 13.12**
    - _Requirements: 12.3, 13.3, 13.6, 13.7, 13.8, 13.12_

  - [x] 4.7 Write property test that no secret reaches disk or output (store level) [no-docker]
    - `tests/prop-04-no-secret.test.mjs`. Generators: canaries (`sk-CANARY-` plus generated characters) placed in a command, a path, a reason string, a tool response, a Grave_Entry-shaped object, and a Run_Record-shaped object, each in raw, base64, base64url, hex, and percent-encoded form. Check: after `storeWrite`, `appendProvenance`, `writeRunRecord`, and the output formatters, no byte sequence of the canary appears in any file of the temporary Ghost_Store, in captured STDOUT, or in captured STDERR, and the serialized Run_Record has no `secretValues` entry and no payload byte. Tasks 8.9 and 14.8 repeat the check end to end for the gate and the MCP server as example tests.
    - **Property 4: No secret on disk or output**
    - **Validates: Requirements 3.9, 5.7, 12.5, 12.6, 12.7, 14.4**
    - _Requirements: 3.9, 5.7, 12.5, 12.6, 12.7, 14.4_

  - [x] 4.8 Implement `lib/file-event.mjs` and the file-event constants
    - **Depends on task 1.7** (probe items (a) and (b): the file-create trigger identifier, the STDIN fields of file events, and the form of the path).
    - `file-event.mjs`: `extractFilePath(event, root)` returns the workspace-relative path with `/` separators from the field names that task 1.7 recorded (`FILE_EVENT_PATH_FIELDS`), makes an absolute path relative to the root, and returns `null` for a path outside the workspace or one that contains `..` after normalization. Add `FILE_CREATE_TRIGGER` and `POST_RESPONSE_FIELDS` to `gate-config.mjs` with the values that task 1.7 recorded.
    - Write example tests with fixture events shaped like the recorded ones: absolute path, relative path, outside path, `..` path, missing field.
    - _Requirements: 2.7, 13.2, 15.1, 16.1, 17.1_

- [x] 5. Gate input: classification, wards file loading, safe list, and self-protection
  - [x] 5.1 Implement `lib/event.mjs`: `parseHookEvent`, `TOOL_TABLE`, and `classifyTool`
    - **Depends on task 1.7** (probe item (h): the `code` tool fields and operation list).
    - `parseHookEvent(text)` requires a JSON object, `hook_event_name` equal to `PreToolUse`, string `cwd`, `session_id`, `tool_name`, and an object `tool_input` (not null, not an array). It reads own properties only and rebuilds a fresh object so a `__proto__` key is never assigned. It returns `{ ok: true, event }` or `{ ok: false, field }`.
    - `TOOL_TABLE` and `classifyTool(event)`: `execute_bash` is `shell` (`command`, `cwd`, `description`, `run_in_background`, `timeout`; `description` is never printed); `fs_write` and `fs_append` read `path` and `text`; `str_replace` reads `path` and `newStr`; `delete_file` reads `targetFile`; `code` reads `file_path` and `path` and the text fields `replacement` and `new_name`; anything else is `unknown`. The classifier reads every Target_Path_Field (`path`, `targetFile`, `file_path`) that is present, also on a tool for which the table does not list it. A write tool with no non-empty string target, or a non-string target, gives `deny` with the exact message `tool or input not recognized by the gate: not allowed.`. An unknown tool gives the same deny.
    - `CODE_READ_ONLY_OPERATIONS` holds the read-only operations as corrected by task 1.7 (design list: `search_symbols`, `lookup_symbols`, `get_document_symbols`, `generate_codebase_overview`, `search_codebase_map`, `pattern_search`, `goto_definition`, `find_references`, `hover`, `completion`, `diagnostics`). A `code` call whose `operation` is in the set is `read-only`. Any other, missing, or non-string `operation` is `write` and needs a target naming a file, otherwise `deny`. Create `tests/fixtures/code-tool-operations.json` with the recorded operation list, and a test that compares the fixture with `CODE_READ_ONLY_OPERATIONS` and the writing operations (`rename_symbol`, `format_code`, `pattern_rewrite`).
    - Write example tests of the table against the logged tool schemas of the Introduction of `requirements.md`: one test per tool, a present target field on a tool that does not list it, and a `code` call with a directory in `path`.
    - _Requirements: 3.2, 3.3, 3.4, 6.11_

  - [x] 5.2 Implement `lib/wards-file.mjs`: `resolveWardsFile` and `loadWardsForHook`
    - `resolveWardsFile(root, env)`: `GHOST_RUN_WARDS_FILE` when set, else `<root>/wards.yaml`, else `<root>/apps/ghost-shell/wards.yaml`. One function, shared with the MCP server.
    - `loadWardsForHook(root, env, loader?)` calls `loadWardsFile` of `@ghost-run/wards-config/node` (injectable `loader` for tests) and returns `{ ok: true, wardSet, safeCommands, file }` or `{ ok: false, errors }` with at most 5 strings from `formatConfigError`. A missing file gives `ok: false`. It never returns a partial WardSet. It reads `result.safeCommands ?? []`.
    - **Dependency note:** `ParseResult.safeCommands` comes from wards task 6 and is not present today. Until it lands the value is `[]`. Tests inject a loader result with and without the field.
    - Write example tests: the three resolution cases, a missing file, an invalid file with more than 5 errors, and `safeCommands` present and absent.
    - _Requirements: 3.7, 3.8, 4.6_

  - [x] 5.3 Implement `lib/gate/safe-list.mjs`
    - `BUILTIN_GRAMMAR` with exactly the entries of Requirement 4 criterion 2: `pwd`; `ls` with `-a -l -la -al` and path words; `cat`, `head`, `tail`, `wc` with path words, `-n <integer>` for `head` and `tail`, `-l -w -c` for `wc`; `git status`; `git diff` and `git log` (no further word, or path words after `--`); `git show`; `git branch`; `echo` with word arguments.
    - `tokenize(line)` is a hand-written scanner (whitespace separates words; single quotes take everything literally; double quotes take everything to the next double quote; an unterminated quote is not safe; no escape, expansion, or comment syntax; a word that starts with `#` is not safe). `classifySafe(line, grammar, secretMatcher)` runs these steps in order and returns `not safe` at the first failure: reject the raw line when it contains `;`, `&`, `|`, `<`, `>`, a backtick, `$`, `\`, a newline, a carriage return, a NUL, or a code point in the hidden ranges of `hasHiddenChar`; tokenize; reject a word with `*`, `?`, or `[` outside quotes, a word that starts with `~`, or a `..` path segment; match the command (and the second word for `git`) to an entry and require every remaining word to be a listed option, an integer after an `intOptions` option, or a path word where the entry allows paths (`after--` means only after a literal `--`); an unlisted option, including `git diff --output=file`, is not safe; for `cat`, `head`, `tail`, `wc`, `git show`, and `git diff -- <path>` words, test `normalizePath` against a `compilePathSet` of every `secrets` pattern of the `egress` wards (case-insensitive) and treat a match as not safe.
    - Extension entries from `safeCommands` use the same grammar shape and the same steps. An extension entry is validated at load: its command name must not be a shell or interpreter word. An extension entry can never make safe a command that the character screen or the secret rule excludes.
    - The classifier is pure, has no I/O, and returns `not safe` for an unparsable line.
    - Write example tests: each built-in entry, `ls; rm x`, `cat .env` (with the default wards), `git diff --output=out`, an unterminated quote, an extension entry named `sh`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.4 Write property test for safe-list soundness [no-docker]
    - `tests/prop-02-safe-list.test.mjs` (KI-P2). Generators: command-like strings built from safe words plus an injected forbidden character or construct (`;`, `&`, `|`, `<`, `>`, a backtick, `$`, `\`, newline, glob characters, a leading `~`, a `..` segment, a hidden code point built from code points), an unlisted option, a word outside the grammar, an appended `;`, `&&`, pipe, or redirect, secret-matching path words under `cat`, `head`, `tail`, `wc`, `git show`, and `git diff --`, and extension entries (including entries with forbidden names). Check: `classifySafe` returns `not safe` for every such input and for every unparsable line.
    - **Property 2: Safe-list soundness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10_

  - [x] 5.5 Implement `lib/gate/self-protect.mjs` and `lib/gate/approval-guard.mjs`
    - `self-protect.mjs`: `SELF_PROTECTED = ['.kiro/hooks/**', 'integrations/kiro-hook/**', 'integrations/mcp/**', '.ghost-run/**', <resolved Wards_File, workspace-relative>]` compiled with `compilePathSet` (case-insensitive). `isSelfProtected(path)` and `selfProtectedChanges(changes)` that returns the Changes of kind `file-created`, `file-overwritten`, `file-deleted`, or `symlink-changed` whose path matches. A Wards_File outside the workspace is protected only through the tools the gate judges.
    - `approval-guard.mjs`: `isApprovalCommand(commandText)` lowercases the text, removes quote characters, and returns true when it contains `ghost-run approve` or `ghost-run-approve` (the reserved names). It reads the command text and can only deny. No gate module reads any file under `.ghost-run/` as a decision input (task 2.5 scans this).
    - Write example tests for the spellings: `.kiro/hooks/x.json`, `integrations/kiro-hook/lib/a.mjs`, `.ghost-run/graveyard.jsonl`, an upper-case spelling, the resolved wards file; and the guard on plain, quoted, mixed-case, and `sh -c` forms.
    - _Requirements: 10.5, 10.7, 10.10, 6.6_

- [x] 6. Gate judgment: semaphore, watchdog, shell judgment, and write judgment
  - [x] 6.1 Implement `lib/gate/semaphore.mjs` and `lib/gate/watchdog.mjs`
    - `semaphore.mjs`: a lock-file semaphore of `SEMAPHORE_SLOTS` (2) in `.ghost-run/locks/`, wait at most `SEMAPHORE_WAIT_MS` (5 s), then `deny` with `GHOST RUN GATE BUSY: ...` (a fixed line, design D9). A slot is released on every exit path. A stale slot (the recorded process no longer exists) is reclaimed.
    - `watchdog.mjs`: `armWatchdog({ ms = 50_000, onFire })` returns `{ disarm() }` and uses a ref'ed timer. `onFire` requests the runner cleanup, prints `GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed.` and exits 2. A pure function `runnerBudgetSec(elapsedSec)` returns `min(44, floor(48 - elapsedSec))` and never less than 5.
    - **Dependency note (ghost-runner next round, `RunnerOptions.runId`):** until the option exists (`RUNNER_SUPPORTS_RUN_ID` is `false`) the gate passes no `runId`, the watchdog does no label cleanup, and the cleanup of a returning runner is done by the runner's own deadline. The watchdog still exits 2 with the timeout line. The README states that Requirement 8 criterion 9 is not claimed for a hung runner until the option lands. When the flag is `true`, the gate generates a UUID, passes it as `runId`, and `onFire` runs `docker rm -f -v` by the `ghost-run.run-id` label and removes `os.tmpdir()/ghost-run/<runId>`.
    - Write tests with fake timers: the watchdog fires at 50 s with a hanging runner double and the exit is 2; a disarmed watchdog does not fire; the slots are limited to 2; the third caller is denied after 5 s; a slot is released after a throw.
    - _Requirements: 8.1, 8.4, 8.5, 8.9, 8.11_

  - [x] 6.2 Implement `lib/gate/shell-judgment.mjs`
    - `buildToolCallPlan(command, cwdRel)` returns one `ShellAction` `{ command, cwd? }`; a command of 0 or more than 4,096 code points (counted by code point) is rejected with a `deny` that names the bound. The command text goes to the runner as a value and is never interpolated into a host shell line.
    - `judgeShell(ctx, deps)` (`deps.runPlan` injectable): resolve `tool_input.cwd` against the workspace root with `path.resolve` and `fs.realpath` of the nearest existing parent; inside the root it becomes the Copy-relative `ShellAction.cwd` with `/` separators; outside it the verdict floor is `warn` with the notice `step 0: cwd outside the workspace, not rehearsed.` and no ghost starts. Acquire a semaphore slot. Call `runPlan(plan, { original: root, wardSet, pipelineDeadlineSec: runnerBudgetSec(elapsed) })` and take `RunResult.verdict` as is. The gate never recomputes it and never passes the command text to a pattern check (a command that needs network, such as `npm install`, gets the runner's `warn` notice). After `runPlan` returns, clear and drop `output.payloads` before anything is printed or stored. `run_in_background` and `timeout` of the call are ignored.
    - After the run, apply the self-protection floor: any Change under a Self_Protected_Path raises the verdict to at least `warn` and adds the fixed notice `step 0: change to a gate-protected path needs human approval.`. When `runPlan` rejects, return a `deny` with `GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.` and do not retry.
    - **Dependency note:** needs the ghost-runner implementation. This task verifies design open item O8: a test calls the real `runPlan` configuration validation (no Docker) with `pipelineDeadlineSec: 44` and requires that it is accepted. If it is rejected, the task stops and reports the dependency to `ghost-runner`.
    - Write tests with a `runPlan` double: the cwd inside, outside, and missing; command bounds at 4,096 and 4,097 code points counted by code point; a rejected runner; payloads cleared; the self-protection floor; the budget passed to the runner.
    - _Requirements: 3.5, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 5.10, 10.7_

  - [x] 6.3 Implement `lib/gate/write-judgment.mjs`
    - `judgeWrite(classified, ctx, fsView)` with an injected `FsView` (`lstat`, `realpath`, `readdir`; the real adapter is a thin read-only wrapper over `node:fs/promises`). For every target (strictest verdict wins): resolve against the workspace root; a lexical result outside the root adds an `Effect` `{ kind: 'file-write', destination }` (sanitized with `sanitizeJudgeText`), a floor of `warn`, and skips the path wards. Compute the lexical Copy-relative path and the real path (the `realpath` of the target, or of its nearest existing parent joined with the missing tail) and judge both with `normalizePath`; an escaping real path is the outside case. `lstat` the target without following: `delete_file` gives `file-deleted` (a directory gives one per entry below it by a breadth-first walk of at most 10,000 entries, else the floor `warn` with `delete target too large to enumerate.`); a write to an existing regular file gives `file-overwritten`; a write to a missing path gives `file-created`; a write through a symbolic link is judged as `file-overwritten` on both the lexical and the real path.
    - Build a `GhostReport` with one step and call `WardEngine.evaluate(report, wardSet)` with no `secretValues`. Floors: a Change under a Self_Protected_Path gives `warn` with the notice of task 6.2; for a path under `.kiro/`, `scanTexts` over the text fields (markdown option by extension) with any Finding gives `warn` with `step 0: hidden text in new content for a Kiro file.`, and no Finding rendering is printed. A `code` call with a read-only operation is allowed without judgment. The module claims no P1 and claims P5 only for the declared target path at judgment time. A `code` edit makes no claim for other files that a symbol rename touches.
    - Write tests with an in-memory tree that models symbolic links: create, overwrite, delete, a directory with 3 entries, a directory with 10,001 entries, a path outside, a symbolic link to `data/`, a `.kiro/` write with a hidden character built from an escape, and a Self_Protected_Path.
    - **Depends on tasks 5.1 and 5.5.**
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11, 10.7_

  - [x] 6.4 Write property test for write path judgment [no-docker]
    - `tests/prop-06-write-judgment.test.mjs` (KI-P6). Generators: spellings of a protected path of the default wards (`./data/../data/x`, `data//x`, `data/./x`, upper-case in the case-insensitive default, a symbolic link in the in-memory tree that points to the protected path), each of the five write tools with the protected path in each of its Target_Path_Fields, and spellings of Self_Protected_Paths (`.kiro/hooks/x.json`, `integrations/kiro-hook/lib/a.mjs`, `.ghost-run/graveyard.jsonl`, the resolved Wards_File) with each write tool, plus shell Change lists that contain a change under such a path. Check: protected-path writes give a `block` verdict and a `deny` decision; Self_Protected_Path writes and shell Change lists give at least `warn` and never `allow`.
    - **Property 6: Write path judgment**
    - **Validates: Requirements 6.1, 6.2, 6.5, 6.6, 6.10, 10.7**
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.10, 10.7_

  - [x] 6.5 Write property test that the strictest target wins [no-docker]
    - `tests/prop-11-strictest-target.test.mjs`. Generators: write calls with one to three Target_Path_Fields (`path`, `targetFile`, `file_path`) holding generated paths (protected, unprotected, outside, missing), a missing or non-string field, and `code` calls with a read-only operation and no target. Check: the verdict equals the maximum of the verdicts of the individual paths; each present field is judged; a missing or non-string field on a write tool gives `deny`; a `code` call with a read-only operation and no target is allowed.
    - **Property 11: Strictest target wins**
    - **Validates: Requirements 3.3, 3.4, 6.11**
    - _Requirements: 3.3, 3.4, 6.11_

- [x] 7. Gate output, Plan B, and graveyard records
  - [x] 7.1 Implement `lib/gate/output.mjs`: `decisionFromRunResult`, `diffSummary`, `askJson`, and the floor lines
    - `decisionFromRunResult(result, ctx)` (pure) implements the table of the design: `pass` gives allow, exit 0, STDOUT `GHOST RUN PASSED: all <n> wards cleared.` (plus the claim line when a claim is lowered) and no permission field; `warn` in `exit2` mode gives deny, exit 2, the warn message, diff summary, and Seance_Link on STDERR; `warn` in `ask` mode gives exit 0 with only the `ask` JSON on STDOUT (`askJson(reason)`, the reason cut to 1,200 code points and sanitized), never an `allow` and never an empty STDOUT; `block` gives exit 2 with the Block_Message, diff summary, and link; any internal failure gives exit 2 with one fixed line. The exit code is never a value other than 0 or 2, and the command text is not an input to the mapping.
    - Message construction: `renderMessage(verdict, { wardCount, claims: { p5, p6 }, seance: { id: graveId, base: env.GHOST_RUN_SEANCE_BASE } })` from `wards`; when `result.verdict` is higher than `wardVerdict.verdict` (a runner floor), pass a copy of the ward verdict with the runner verdict and append one fixed line per floor reason from `FLOOR_TEXT` keyed by status or diagnostic name (`recorder-failure`, `sqlite-unreadable`, `secret-values-unreadable`, `protected-path-excluded`, `external-change`, `copy-timeout`, `pipeline-deadline`, `timeout`). In Plan_B (`isolation.mode` equal to `static-analysis`) both claims are `false`, the exact line `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.` is added, and a verdict of at least `warn` is returned. The gate raises no claim above the `isolation` flags. The words `sealed` and `isolated` appear in no fixed string of the gate.
    - `diffSummary(changesPerStep)` writes the header `Diff summary: <a> deleted, <b> overwritten, <c> created, <d> symlinks changed, <n> rows lost.` (rows lost by the rule `dropped ? max(0, rowsBefore) : max(0, rowsBefore - rowsAfter)`), then at most 10 lines `  <kind> <path>` with `sanitizeJudgeText(path)` in `compareCodePoints` order, then `+<k> more changes.` when more exist, and cuts at 1,200 code points on a line boundary.
    - Messages contain only ward ids and reasons, the claim line, the diff summary, the floor lines, and the Seance_Link. The gate never forwards `description`, `explanation`, ghost stdout, payload bytes, or `secretValues`.
    - **Dependency notes:** needs the wards implementation (`renderMessage`) and `sanitizeJudgeText` from `core`. Add a test for design O10: a `warn` verdict with no violations renders a warn template. If it fails, report it to the `wards` spec (the test is also added there by the wards task 4 round) and do not write replacement message text.
    - Write unit tests that pin the fixed strings (pass line, Plan_B lines, floor lines) and one example per row of the mapping table.
    - _Requirements: 5.12, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.10, 9.1, 9.2, 9.3, 9.4, 9.6, 11.6_

  - [x] 7.2 Write property test for the decision mapping [no-docker]
    - `tests/prop-01-decision-mapping.test.mjs` (KI-P1). Generators: arbitrary `RunResult` values (verdicts, statuses, isolation modes, diagnostics, ward verdicts) in both `WARN_MODE` values, and pairs of different command texts with the same `RunResult`. Check: exit 0 only for `pass` (STDOUT is the pass line with no `permissionDecision` field) or, in `ask` mode, for `warn` (STDOUT is exactly the ask JSON with `permissionDecision` equal to `ask`, never an `allow`, never empty); a `warn` in `exit2` mode exits 2 with the warn message on STDERR; `block` exits 2; every other result exits 2; the exit code is only 0 or 2; Plan_B and `block` never exit 0; equal `RunResult` values give identical decisions regardless of the command text.
    - **Property 1: Decision mapping**
    - **Validates: Requirements 5.3, 5.4, 7.1, 7.2, 7.3, 7.8, 7.9, 10.1, 10.4, 10.6**
    - _Requirements: 5.3, 5.4, 7.1, 7.2, 7.3, 7.8, 7.9, 10.1, 10.4, 10.6_

  - [x] 7.3 Write property test for the diff summary bounds [no-docker]
    - `tests/prop-12-diff-summary.test.mjs`. Generators: lists of Changes of every kind and counts (0 to 200), with paths that contain hidden and control code points built from code points, and `sql-row-count` Changes with and without `dropped`. Check: the header counts equal the Change counts per kind and the rows-lost rule; at most 10 path lines in `compareCodePoints` order; the line `+<k> more changes.` exactly when more than 10 exist; the total length is at most 1,200 code points; no hidden code point; equal input gives equal output.
    - **Property 12: Diff summary bounds**
    - **Validates: Requirements 7.4, 7.5, 7.10**
    - _Requirements: 7.4, 7.5, 7.10_

  - [x] 7.4 Write property test that Plan B never allows and never claims [no-docker]
    - `tests/prop-10-plan-b.test.mjs`. Generators: `RunResult` values with `isolation.mode` equal to `static-analysis` (with and without static findings and with every status) and, for the claims clause, values of every isolation mode with generated flags. Check: the decision is never `allow`; the message contains the exact lines `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.` and `P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).`; the Grave_Entry `claims` has `mode` `static-analysis` and three `false` booleans; no claim in a message exceeds the `isolation` flags for any mode.
    - **Property 10: Plan B never allows and never claims**
    - **Validates: Requirements 5.10, 7.6, 9.1, 9.2, 9.3, 9.4**
    - _Requirements: 5.10, 7.6, 9.1, 9.2, 9.3, 9.4_

  - [x] 7.5 Implement `lib/gate/grave.mjs`: `buildGraveEntry` and `readGraveyard`
    - **Depends on the ui-kit implementation** (`GraveEntry` exported from `@ghost-run/ui`, ui-kit task 3.1). If `@ghost-run/ui` does not exist, stop and report the dependency. Add `@ghost-run/ui` to `integrations/kiro-hook/package.json` (type-only use through `import type`), then run `pnpm install`.
    - `buildGraveEntry({ runId, command, recordedAt, result, provenance })` (pure): `id` is `g-<runId>`, `command` is the shell command or `<tool_name> <workspace-relative path>` for a Write_Judgment, `recordedAt` is `YYYY-MM-DDTHH:MM:SSZ` (the injected clock), `wardIds` are the distinct `wardId` values of the violations in order of first appearance, `detail` holds `wardVerdict`, `changes`, `claims` (`{ mode, p1Claimed, p5Claimed, p6Claimed }` from `isolation`), and `actionLabels: [command]`. When a session Provenance_Log exists and `collectNeedles(report)` is not empty, `detail` also holds `sources` (records mapped to `{ source, text, scan }` with `scan = scanText(content)`), `needles`, and `links` from `traceRedThread`, computed after the verdict is final. The serialized entry passes `redactCanaries` as one string before it is written. An entry contains no `secretValues` and no payload byte.
    - `readGraveyard(file)` returns `{ entries, corrupt }` with the valid Grave_Entries in file order and skips corrupt lines. A Grave_Entry is written only for `block` and `warn` (including `ask` mode and Plan_B), by the gate, before it exits. The Run_Record of the same Run_Id must exist whenever an entry names a run.
    - Write example tests: an entry built from a `block` result, a Plan_B `warn`, a Write_Judgment, an entry with provenance links, and a corrupt line in the graveyard file.
    - _Requirements: 14.1, 14.3, 14.4, 14.5, 14.6, 14.7, 7.7_

  - [x] 7.6 Write property test for Grave_Entry validity [no-docker]
    - `tests/prop-13-grave-entry.test.mjs`. Generators: `RunResult` values with verdict `warn` or `block` and generated run ids (UUID-shaped and other characters from the allowed set). Check: `id` matches `^[A-Za-z0-9_-]{1,64}$` and equals the Grave_Id in the message link; `recordedAt` matches `YYYY-MM-DDTHH:MM:SSZ` and parses as a UTC time; `wardIds` are the distinct ward ids of the violations in order of first appearance; the serialization contains no `secretValues` content. Include a check that the same entry passes the id and time checks of the Graveyard of `ui-kit` (no `time unreadable`, no `No seance link: invalid id`).
    - **Property 13: Grave_Entry validity**
    - **Validates: Requirements 7.7, 14.1, 14.4, 14.5**
    - _Requirements: 7.7, 14.1, 14.4, 14.5_

- [x] 8. Gate assembly, bootstrap, hook file, and process tests
  - [x] 8.1 Implement `lib/gate/decide.mjs`
    - `decide(input, deps)` is pure given `deps` (`runPlan`, `loadWards`, `fsView`, `clock`, `uuid`, `warnMode`, `store`). Order: parse the event (`parseHookEvent`, failure gives `deny` naming the field); classify; load the Wards_File (failure gives `deny` before any other check, so a broken file blocks every call including `ls`); for a shell call run `isApprovalCommand` (deny with a message that names the rule), then `classifySafe` (a Safe_Command appends the Stats_Event `safe-skip`, prints nothing, calls no `runPlan`, writes no Run_Record or Grave_Entry, and returns exit 0), then `judgeShell`; for a write call run `judgeWrite`; a `read-only` `code` call is allowed. Every call appends `seen`. A ghost run appends `ghosted`, then one of `passed`, `warned`, `blocked`, and writes the Run_Record. `block` and `warn` write the Grave_Entry (with the Run_Record) before returning. If the Run_Record or Grave_Entry write fails, return `deny` with `GHOST RUN GATE ERROR: store-failed; the tool call was not allowed.` even in `ask` mode. The gate emits no permission decision `allow`. The gate never reads the Provenance_Log to decide (the log is read only after the verdict, for the Grave_Entry `links`).
    - `decide` never throws: any exception becomes `GHOST RUN GATE ERROR: internal-error; the tool call was not allowed.`.
    - Write example tests with a `runPlan` double for each branch of the order above.
    - **Depends on tasks 5.1, 5.2, 5.3, 5.5, 6.2, 6.3, 7.1, and 7.5.**
    - _Requirements: 3.2, 3.4, 4.1, 4.8, 5.6, 5.8, 6.1, 7.7, 8.1, 8.10, 10.1, 10.6, 10.10, 13.7, 14.1, 14.2_

  - [x] 8.2 Implement `lib/gate/main.mjs`, the bootstrap `ghost-gate.mjs`, and `index.mjs`
    - `ghost-gate.mjs` contains only: imports of `node:` built-ins and `./lib/hook-io.mjs`; the arming of the watchdog; `process.on('uncaughtException' | 'unhandledRejection')` handlers that call `fatal('internal-error')`; a bounded STDIN read; and `await import('./lib/gate/main.mjs')` inside `try/catch`. A failed import prints `GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).` and exits 2 (not the Node default code 1). No code path ends the process with exit 0 except the `allow` paths of Requirement 7.
    - `lib/gate/main.mjs` wires the real dependencies (the real `runPlan`, `loadWardsForHook`, the `FsView` adapter, the clock, `crypto.randomUUID`, `WARN_MODE`), calls `decide`, writes the outputs through `hook-io`, releases the semaphore and clears the payload map on every path, and disarms the watchdog. It reads no environment variable other than `GHOST_RUN_WARDS_FILE` and `GHOST_RUN_SEANCE_BASE`, and it reads no variable or workspace file that disables the gate.
    - `index.mjs` is the public export of the package for the MCP server and the apps: `resolveWardsFile`, `loadWardsForHook`, `classifySafe`, `decisionFromRunResult`, `diffSummary`, `buildGraveEntry`, `readGraveyard`, `summarizeStats`, `formatStatsTable`, the store functions of tasks 4.2 and 4.3, and `sessionKey`.
    - **Dependency note:** process tests need `pnpm -r build`.
    - _Requirements: 3.10, 5.6, 8.1, 8.3, 8.6, 8.7, 12.10, 7.8_

  - [x] 8.3 Create `.kiro/hooks/ghost-gate.json` (disabled until task 19.1)
    - **Depends on task 1.7** (the confirmed `timeout` placement and the matcher behavior) **and task 3.2.**
    - Create the file with version `v1` and two entries (`ghost-gate (shell)` with matcher `shell`, `ghost-gate (write)` with matcher `write`), trigger `PreToolUse`, the same `command` `node integrations/kiro-hook/ghost-gate.mjs`, entry-level `timeout: 60`, and **`enabled: false`**. The gate is switched on only by task 19.1. No matcher covers `@mcp` or `@powers` tools. The test of task 3.2 checks the file.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 8.4 Write property test for fail-closed totality [no-docker]
    - `tests/prop-03-fail-closed.test.mjs` (KI-P3). Generators: arbitrary byte strings (empty, invalid UTF-8, truncated JSON, valid JSON of the wrong type, JSON with extra fields, deeply nested JSON, input over 1 MiB, a wrong `hook_event_name`, an unknown `tool_name`, write tools with no or non-string target fields). Check: `decide` returns a decision without throwing and the decision is `deny` with exit 2 unless the input is a valid `PreToolUse` event for a known tool whose verdict allows.
    - **Property 3: Fail-closed totality**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 8.1, 8.3, 8.10**
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.1, 8.3, 8.10_

  - [x] 8.5 Write property test that a safe-list skip leaves no ghost [no-docker]
    - `tests/prop-09-safe-skip.test.mjs` (KI-P9). Generators: Safe_Commands built from the grammar (all built-in entries, generated path words and option values that are allowed). Check: `decide` makes no `runPlan` call, writes no Run_Record, writes no Grave_Entry, appends exactly one `seen` and one `safe-skip` Stats_Event, prints nothing, and returns exit 0.
    - **Property 9: Safe-list skip leaves no ghost**
    - **Validates: Requirements 4.1, 4.8, 4.9**
    - _Requirements: 4.1, 4.8, 4.9_

  - [x] 8.6 Write property test that the verdict is independent of provenance [no-docker]
    - `tests/prop-14-verdict-independent.test.mjs`. Generators: `RunResult` values and Provenance_Logs (empty, matching, non-matching, with hidden-character matches built from code points). Check: the decision kind, exit code, and message are identical with and without the log, and only `detail.sources`, `detail.needles`, and `detail.links` of the Grave_Entry differ.
    - **Property 14: Verdict independent of provenance**
    - **Validates: Requirements 13.13, 14.3**
    - _Requirements: 13.13, 14.3_

  - [x] 8.7 Write property test that approval commands are denied [no-docker]
    - `tests/prop-15-approval-denied.test.mjs`. Generators: shell commands that contain the reserved approval command in wrapper forms (`sh -c '...'`, `env X=1 ...`, quotes, mixed case, a command line built by concatenation inside one call, a script written by the same call) and write-tool calls targeting `.ghost-run/approvals/`. Check: `decide` returns `deny` with exit 2 and the rule message, and no gate module reads approval state.
    - **Property 15: Approval commands are denied**
    - **Validates: Requirements 10.5, 10.10**
    - _Requirements: 10.5, 10.10_

  - [x] 8.8 Write the bootstrap failure tests (process level) [no-docker]
    - `tests/bootstrap.test.mjs`: spawn `node ghost-gate.mjs` with a temporary workspace and the event on STDIN. Cases: missing `dist/` (rename it in a temporary copy) gives exit 2 and the `GATE UNAVAILABLE` line; a syntax error in a copy of `main.mjs` gives exit 2; an uncaught throw and an unhandled rejection give exit 2 with the `internal-error` line and no stack trace; a hanging runner double with a short test watchdog gives exit 2 and the timeout line; a missing Wards_File gives exit 2; STDIN over 1 MiB gives exit 2; STDOUT and STDERR contain no input text. No exit code other than 0 and 2 ever occurs.
    - _Requirements: 3.2, 8.1, 8.3, 8.4, 8.7, 8.8_

  - [x] 8.9 Write the example event tests for the gate [no-docker]
    - `tests/gate-events.test.mjs`, `runPlan` double returning results shaped like the five Ghost Shell scenarios: `rm -rf ./data` (exit 2, the message names `protect-data`, the diff summary counts the deleted files, no ghost stdout is printed); `npm run clean` (blocked by diff, not by shape); `rm tmp-scratch.txt` of a file no ward protects (allowed); `ls` (allowed, no ghost, Stats_Event `safe-skip`); a Plan_B run (exit 2 for the `warn`, the exact Plan_B message, claims `false`); invalid JSON (exit 2); a write call to `.env` (blocked) and to a new `notes.md` (allowed); a write through a symbolic link to `data/`; a Grave_Entry of a blocked run that passes the `ui-kit` id and time checks; the wording of an approval command through the shell tool denied. Add an end-to-end check that no canary appears in any store file, STDOUT, or STDERR of these runs.
    - **Dependency note:** the Grave_Entry check needs the ui-kit implementation (task 7.5).
    - _Requirements: 23.3, 23.4, 4.8, 5.4, 6.8, 9.3, 14.5_

  - [x] 8.10 Write the Docker-bound gate tests [docker]
    - `tests/gate-docker.test.mjs`: an end-to-end gate run of the five Ghost Shell scenarios as a hook process with the Hook_Event on STDIN (`describe.skipIf(!dockerAvailable)`, report `skipped (docker unavailable)`, never `passed`); a test that no container labeled `ghost-run.run-id` of a finished gate process remains after a normal finish and after a killed process; the P1, P5, and P6 flags in the messages come from `isolation` only.
    - **Dependency note (ghost-runner next round, `RunnerOptions.runId`):** the sub-test that kills a hung runner and checks cleanup by label reports `skipped (runner runId option missing)` until the option exists (`RUNNER_SUPPORTS_RUN_ID`), and is enabled when it does. All other sub-tests do not need the option.
    - _Requirements: 8.9, 23.3, 5.9, 5.10_

  - [x] 8.11 Add the Docker wake retry to the gate and test it [no-docker, one docker]
    - `integrations/kiro-hook/gate-config.mjs` has the new constants `DOCKER_WAKE_RETRY_MS = 10_000` and `WARMUP_BUDGET_MS = 1_000`. `lib/gate/shell-judgment.mjs` passes `dockerWakeRetryMs: DOCKER_WAKE_RETRY_MS` to `runPlan`. The runner (`ghost-runner` Requirement 3, criterion 11) repeats a timed-out 2 s availability check once with the 10 s deadline, capped by the pipeline deadline; a daemon error or a missing `docker` binary is not retried; when both deadlines fail, the result is Plan_B (static analysis, NEEDS HUMAN APPROVAL), so fail-closed is unchanged. The 2 s plus 10 s stay inside `RUNNER_DEADLINE_SEC` (44) and `WATCHDOG_MS` (50,000). The Run_Record holds `phases.dockerCheckMs` and the new boolean `dockerWakeRetried`.
    - Cause measured 2026-11-21 (`docs/measurements.md`, heading `Docker Resource Saver wake-up`): Resource Saver stops the VM after 5 idle minutes, the first `docker info` took 1.88 s, the IDE gate check timed out at 2010 to 2021 ms in 4 runs, and shell replays took 55 to 158 ms.
    - Tests: `tests/gate-wake.test.mjs` (5 tests: the constants; the option passed; daemon down gives static analysis without retry; a timeout past both deadlines gives static analysis with the retry recorded; one `[docker]` test in which a slow first check and a fast retry give a full docker-box run with `rehearsed: true`), plus the constants in `tests/hook-io.test.mjs` and the option value in `tests/gate-shell-judgment.test.mjs`.
    - **Depends on tasks 6.2 and 8.2.**
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.10, 25.11, 8.8, 9.1_

  - [x] 8.12 Add the `docker-warmup` hook, its entry, and its tests [no-docker]
    - `integrations/kiro-hook/docker-warmup.mjs` and `lib/warmup.mjs` start one detached `docker info --format {{.ServerVersion}}` (an engine call; `docker version` does not wake a stopped Docker Desktop VM, see `docs/measurements.md`) (`spawn` with `detached: true`, `stdio: 'ignore'`, `shell: false`, then `unref`), throttled by a stamp file in the OS temp folder to one start per 60 s (`THROTTLE_MS`). The script never reads STDIN, prints nothing, and always exits 0 within `WARMUP_BUDGET_MS`.
    - `.kiro/hooks/docker-warmup.json`: trigger `PreToolUse`, matcher `shell`, entry-level `timeout: 5`, `enabled: false` until task 19.1. The host probe (CLI 3.4.0, IDE 1.4.215) never registered a prompt-submit trigger and `ALLOWED_TRIGGERS` has none, so the Pre Tool Use of the shell call is used; a prompt-submit trigger stays a candidate for a later probe (design O20).
    - Tests: `tests/docker-warmup.test.mjs` (8 tests: exit 0 within the budget with no output; the detached process survives the parent; the throttle; docker missing; no shell and no network code; unit tests of `warmUp`; the hook entry is committed disabled), and `tests/worlds-config.test.mjs` is covered by task 16.3.
    - **Depends on tasks 3.2 and 8.11.**
    - _Requirements: 25.6, 25.7, 25.8, 25.11, 2.1, 2.3, 2.10_

- [x] 9. Checkpoint - Gate core complete
  - Run `pnpm -r build`, `pnpm --filter @ghost-run/kiro-hook test`, `typecheck`, and `lint`. Confirm that Properties 1 to 6, 9 to 16, and 21 pass with at least 100 runs, that the `[docker]` tests report `skipped (docker unavailable)` where Docker is absent, that the source-scan test passes, and that `ghost-gate.json` exists with `enabled: false`. Ensure all tests pass, ask the user if questions arise.

- [x] 10. ghost-log (Post Tool Use)
  - [x] 10.1 Implement `ghost-log.mjs` and `lib/provenance-record.mjs`
    - **Depends on task 1.7** (probe items (c) and (d): the response field name `POST_RESPONSE_FIELDS`, and whether a blocked call fires Post Tool Use), on tasks 4.3 and 4.8, and on the possession implementation (provenance format).
    - `buildProvenanceRecord(event, ctx)` returns `{ record }` or `{ skip: 'secret-path' | 'canary' | 'too-large' | 'unknown-tool' | 'outside-workspace' }` by the table of the design: `read_file` gives `kind: file` and the workspace-relative path as `source`; `web_fetch` gives `kind: web` and the URL with userinfo removed; `mcp_*` tools other than those of the `ghost-run` server give `kind: other` and `mcp:<tool_name>`; shell tools give no record; unknown tools give no record. `kind: issue` is not produced (design D5). The content comes from the response field that task 1.7 recorded (a string is used as is; an object contributes its string leaves joined with newlines, up to 1 MiB). If the host does not deliver a response, a `file` record is built by a bounded read (at most 1 MiB) of the named workspace file, and a path outside the workspace is skipped; other kinds record nothing.
    - Skips: a `file` source matching a `secrets` pattern of an `egress` ward (after `normalizePath`) is not recorded and its path is written nowhere else; content that contains a canary (raw or encoded) is not recorded; content over 1 MiB is not recorded. Each skip appends the Stats_Event `provenance-skipped`. Every Post Tool Use event of a shell tool appends the Stats_Event `executed`. If task 1.7 recorded that a blocked call fires Post Tool Use, implement the duplicate-skip rule of design D10 (skip an event whose `tool_use_id`, or `(tool_name, tool_input digest)`, matches a graveyard entry of the same session written within 60 s); otherwise do not write it.
    - The hook exits 0 after a successful record. A failure writes the failure class on STDERR, exits with a non-zero code, and claims nothing about the tool call. The Ghost_Log never reads the Provenance_Log to decide anything, never writes a Grave_Entry, and never changes the tool call.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.10, 14.2, 12.11_

  - [x] 10.2 Write the ghost-log tests [no-docker]
    - `tests/ghost-log.test.mjs`: one example per row of the tool table; the secret-path skip (the path is in no file); the canary skip in raw and encoded form; the over-1 MiB skip; the file-read fallback when the response field is absent; a record of a README with a destination hidden in Tag_Characters (built from code points) followed by the `traceRedThread` of the stored log, which finds it with `hidden` equal to `true`; the `executed` event for a shell tool; exit codes. Include a latency test that a 1 MiB record finishes within 5 s (the Median_Of_5 recorded by task 16.2).
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.9, 13.10, 23.4_

  - [x] 10.3 Create `.kiro/hooks/ghost-log.json`
    - **Depends on task 1.7** (placement of `timeout`) and task 10.1.
    - Version `v1`, four entries, trigger `PostToolUse`, matchers `read`, `web`, `shell`, and `@mcp`, the same `command` `node integrations/kiro-hook/ghost-log.mjs`, entry-level `timeout: 10`, `enabled: true`. The script skips the tools of the `ghost-run` server itself.
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

- [x] 11. contract-pbt (file save)
  - [x] 11.1 Implement `contract-pbt.mjs`, `lib/pbt/select.mjs`, `lib/pbt/run.mjs`, and `lib/pbt/reporter.mjs`
    - **Depends on task 1.7** (file-event path fields) and task 4.8, on the `core` `pbt-config.ts` (`GHOST_PBT_MODE=short`), and on the `ghost-runner` test configuration (design O13: the variable that selects the 20-example on-save count for Docker-bound properties, and the 60 s whole-run limit). The hook defines no count of its own.
    - `selectSuites(relPath)` (pure): `core/...` gives `core`; `worlds/<valid-name>/...` gives `world` with the name; anything else, including `..` paths, absolute paths, and look-alike prefixes such as `corex/` and `worlds-old/`, gives `none` and the hook exits 0 silently. `runSuites(sel, deps)` spawns vitest with `process.execPath` and no shell. `core/**` runs the `core` property tests and then vitest with the root `vitest.worlds.config.ts` over `worlds/*/tests/contract.test.ts`. `worlds/<name>/**` runs that one world's contract test and the `core` judgment-engine property files. The hook sets `GHOST_PBT_MODE=short` and never starts the nightly mode.
    - `reporter.mjs` is a vitest reporter written against the vitest version in `pnpm-lock.yaml` that prints one JSON line per finished test; a test fails when the reporter hook it needs is absent. If the installed vitest cannot stream per-test results, the fallback is parsing `--reporter=verbose` lines (design O14).
    - Deadline: an internal timer at 55 s stops the child process group (SIGTERM, then SIGKILL after 2 s), prints `incomplete: deadline reached` with the names of the tests that did not finish, and never reports `passed` for them. A failing property prints on STDERR the property id, the shrunk counterexample, the violated criterion id, and the seed in the form of the `VerificationError` of `core-contract`, and exits with a non-zero code. A Docker-bound test that the runner marks skipped is printed as `skipped (docker unavailable)` and is not counted as passed. A lock file `locks/pbt.lock` holds the PID of the running child; a new save stops the older child (after checking that the owner is a process of this user and the command line matches) and takes the lock. The summary is written to `.ghost-run/pbt/last.json` and printed on STDOUT; nothing depends on STDOUT reaching the agent (probe item (e)).
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [x] 11.2 Write property test for suite selection [no-docker]
    - `tests/prop-19-suite-selection.test.mjs`. Generators: workspace-relative paths of generated segments, paths with `..`, absolute paths, and look-alike prefixes. Check: `selectSuites` returns `core` exactly for paths under `core/`, `world` with the exact name exactly for `worlds/<valid-name>/...`, and `none` for everything else.
    - **Property 19: Suite selection**
    - **Validates: Requirements 15.1, 15.3**
    - _Requirements: 15.1, 15.3_

  - [x] 11.3 Write the contract-pbt tests [no-docker]
    - `tests/contract-pbt.test.mjs` with a spawn double: a failing property prints the id, counterexample, criterion, and seed and exits non-zero; the deadline test with fake timers stops the child and reports `incomplete: deadline reached` with the unfinished names and no `passed` for them; a Docker-bound test reported skipped is printed as `skipped (docker unavailable)`; a second save stops the first run and the lock holds one PID; `pbt/last.json` is written once; the hook starts no nightly mode.
    - _Requirements: 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [x] 11.4 Create `.kiro/hooks/contract-pbt.json`
    - **Depends on task 1.7** (file-event trigger name and `timeout` placement).
    - Version `v1`, one entry, trigger `PostFileSave`, matcher `(^|/)(core|worlds)/` (a prefilter; the script checks the workspace-relative path with `^(core|worlds)/`), command `node integrations/kiro-hook/contract-pbt.mjs`, entry-level `timeout: 60`, `enabled: true`.
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

- [x] 12. world-scaffold (file create)
  - [x] 12.1 Implement `world-scaffold.mjs`, `lib/scaffold/templates.mjs`, `lib/scaffold/scaffold.mjs`, and the root `vitest.worlds.config.ts`
    - **Depends on task 1.7** (probe item (a): the identifier of the file-create trigger, and the file-event path fields) and task 4.8. If the probe found that no file-create trigger exists, record that in `docs/measurements.md` and implement the hook on the confirmed trigger from task 1.7.
    - No `core` change (design D7). Create the root `vitest.worlds.config.ts` (includes `worlds/*/tests/contract.test.ts`; aliases `@ghost-run/core` to `core/src/index.ts` and `@ghost-run/core/verify` to `core/verify.ts`, as `ghost-runner` does for its tests).
    - Control flow: read the file event and the path through `file-event.mjs`; match `^worlds/([^/]+)/`; validate `<name>` against `^[a-z][a-z0-9-]{0,63}$` (an invalid name prints the rule and creates nothing); reject a name or derived path that contains `..`, a path separator, or a symbolic-link component (`lstat` each component below the root); create each missing file with `open(path, 'wx')` so a race cannot overwrite. The files: `worlds/<name>/world.config.ts` (a default export `{ id, deterministic: false, wardsFile: './wards.yaml', create }` with the comment that P2 is claimed only after the world is shown to be deterministic, in the shape of `worlds/playground-shell/world.config.ts`), `worlds/<name>/tests/contract.test.ts` (an `assertWorldConfigShape(config)` of about 12 lines, then `verifyWorld` with the world, `id`, `deterministic`, the loaded `wardSet`, a placeholder `actionArb` that throws `define actionArb for <name>`, and `numRuns` from the owning spec), `worlds/<name>/wards.yaml` (`wards: []` plus a comment; parses with `parseWards`, `ok: true`), and `worlds/<name>/README.md` (the six `World<S, A>` functions, the world-contract checklist, and a claims table that lists P2 as not claimed). Files that exist are never overwritten, truncated, or deleted. The creation events of generated files are a no-op (the existence check), so the hook cannot loop.
    - The hook prints a short summary of the files created and `next step: implement the six functions, then save to run contract-pbt`, makes no network call, finishes within 5 s, and uses only reserved domains and canary values with no hidden character in any template (a test scans every template).
    - **Dependency note:** the `verifyWorld` entry point `@ghost-run/core/verify` and the `wards-config` parser must exist (core-contract and wards-config implementations).
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.11_

  - [x] 12.2 Write property test for scaffold idempotence [no-docker]
    - `tests/prop-07-scaffold-idempotence.test.mjs` (KI-P7). Generators: world names (valid and invalid, including `..`, separators, upper case, 65 characters) and sets of pre-existing files under `worlds/<name>/` (generated content), in a temporary folder. Check: running the scaffold twice gives the same file set and the same bytes as running it once; no existing file changes; an invalid name, a `..`, a separator, or a symbolic-link component creates no file; the generated `wards.yaml` parses with `ok: true` through `parseWards`; the generated `contract.test.ts` and `world.config.ts` contain the `deterministic: false` default.
    - **Property 7: Scaffold idempotence**
    - **Validates: Requirements 16.1, 16.4, 16.5, 16.6, 16.7**
    - _Requirements: 16.1, 16.4, 16.5, 16.6, 16.7_

  - [x] 12.3 Create `.kiro/hooks/world-scaffold.json`
    - **Depends on task 1.7.** Write this file only with the file-create trigger identifier that the probe confirmed. If the probe found no create trigger, do not write the file, record the reason in `docs/measurements.md`, and report it in the final checkpoint.
    - Version `v1`, one entry, trigger `FILE_CREATE_TRIGGER` (candidate `PostFileCreate`), matcher `(^|/)worlds/[^/]+/` (a prefilter; the script is the authority), command `node integrations/kiro-hook/world-scaffold.mjs`, entry-level `timeout: 10`, `enabled: true`.
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

- [x] 13. blacklight-steering (file save)
  - [x] 13.1 Implement `blacklight-steering.mjs` and the `pnpm blacklight` script
    - **Depends on task 1.7** (file-event path fields) and task 4.8, and on the possession implementation (`scanFiles` from `@ghost-run/core/possession-node`, `formatReport`, `exitCodeFor`).
    - Flow: extract the path (workspace-relative, no `..`); require `^\.kiro/`; call `scanFiles([path], { markdown: 'by-extension' })` (the exact signature is owned by `possession`; verify it against the installed code); print `formatReport(report)` on STDOUT and, when the outcome is not `clean`, on STDERR; write it to `.ghost-run/blacklight/last.txt`; exit with `exitCodeFor(outcome)` (0, 1, 2; a report and not a block). The hook reads the one saved file, never writes, renames, or deletes any scanned file, and finishes within 5 s. The output holds only printable ASCII and line breaks.
    - Add the `blacklight` script to `package.json` (`pnpm blacklight`) that scans the whole `.kiro/` folder through the same functions.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.7_

  - [x] 13.2 Write property test that the blacklight hook reports and does not write [no-docker]
    - `tests/prop-20-blacklight-hook.test.mjs`. Generators: file contents with and without hidden code points built from escapes, in markdown and non-markdown files, in a temporary workspace folder. Check: the exit code equals `exitCodeFor(outcome)`, `outcome` is `findings` exactly when the scanner reports a finding, and the file bytes are unchanged afterwards.
    - **Property 20: Blacklight hook reports and does not write**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4**
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 13.3 Create `.kiro/hooks/blacklight-steering.json` and the example test
    - **Depends on task 1.7** (file-event trigger name and `timeout` placement).
    - Version `v1`, one entry, trigger `PostFileSave`, matcher `(^|/)\.kiro/` (the script checks `^\.kiro/`), command `node integrations/kiro-hook/blacklight-steering.mjs`, entry-level `timeout: 10`, `enabled: true`.
    - `tests/blacklight-hook.test.mjs`: the outcome `findings` for a `.kiro` markdown file with a hidden character built from an escape, exit code 1, and the report on STDOUT and STDERR; the outcome `clean` for an ordinary file; a path outside `.kiro/` is ignored.
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 17.1, 17.3, 23.4_

- [x] 14. MCP server `ghost-run`
  - [x] 14.1 Scaffold the `@ghost-run/mcp` package and check the dependency licenses
    - Create `integrations/mcp/package.json` (`name: "@ghost-run/mcp"`, `private`, `type: "module"`, `engines.node >= 20`, `bin: { "ghost-run-mcp": "bin/ghost-run-mcp.mjs" }`, dependencies `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7, `@ghost-run/core`, `@ghost-run/ghost-runner`, `@ghost-run/wards-config`, `@ghost-run/kiro-hook` (all `workspace:*`), dev dependencies `vitest`, `typescript`, `eslint`), `tsconfig.json` (same strict `checkJs` setup), `eslint.config.mjs` (same bans as task 2.1), and the folders `bin/`, `src/`, `src/tools/`, `tests/`. Run `pnpm install`.
    - Check the license of `@modelcontextprotocol/sdk` 1.32.2 (expect MIT, Node.js 18 or later) and of `zod` 4.6.7 (expect MIT; the SDK peer range is `^3.25 || ^4.0`) from the installed `package.json` files on the day they are added, and add a row for each (name, version, license) to the dependency table of the repository `README.md`. Also add `esbuild` (MIT, dev dependency of task 15.2) when it is added. Do not merge without the rows.
    - **Dependency note:** `@ghost-run/mcp` imports `@ghost-run/kiro-hook` through its `index.mjs` only (created in task 8.2).
    - _Requirements: 1.1, 1.2, 1.3, 1.8, 18.1_

  - [x] 14.2 Implement the server core: `src/server.mjs`, `src/schemas.mjs`, `src/result.mjs`, `src/confine.mjs`, `bin/ghost-run-mcp.mjs`
    - **Depends on task 8.2** (the `index.mjs` exports). Verify the SDK import subpaths and the `registerTool(name, { description, inputSchema, annotations }, handler)` signature against the installed 1.32.2 before writing the server (design O16); the design fixes behavior and not SDK spelling.
    - `server.mjs`: an `McpServer` named `ghost-run` over `StdioServerTransport`, registering exactly the five tools (registered by tasks 14.3 and 14.4 through `src/tools/`), with the annotations the SDK supports: `blacklight`, `ghost_diff`, `ghost_trace`, and `wards_check` read-only; `ghost_run` not read-only and not destructive.
    - `schemas.mjs`: the zod schemas of the design table (`plan` of 1 to 50 objects `{ command: string 1 to 4,096 code points, cwd?: string }`; `id` matching `^[A-Za-z0-9_-]{1,64}$`; optional `session` with the same pattern; `path` of 1 to 200 strings). `result.mjs`: every handler returns `{ content: [{ type: 'text', text }], structuredContent, isError? }`; a result over 64 KiB is cut at a line boundary with the marker `[truncated]` and `structuredContent.truncated = true`; every untrusted string passes `sanitizeJudgeText`; no payload byte and no `secretValues`. `confine.mjs`: `confinePath(root, p)` with `path.resolve`, `fs.realpath`, and a check that the real path equals the real workspace root or starts with it plus a separator.
    - STDOUT carries protocol messages only; diagnostics go to STDERR with command text cut to 120 code points; the server makes no network call and calls no LLM. Input outside a schema gives an `isError: true` result that names the field and does not call the runner. The workspace root is `process.cwd()`; the Wards_File is resolved with `resolveWardsFile`, and a config error gives an error result with at most 5 `formatConfigError` strings and no verdict.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.9, 19.12_

  - [x] 14.3 Implement the tools `ghost_run`, `ghost_diff`, and `ghost_trace`
    - `ghost_run(plan)`: load the wards, call `runPlan(plan, { original: root, wardSet, pipelineDeadlineSec: 55 })` (there is no 60 s hook limit in the MCP process), write the Run_Record and, for `warn` or `block`, the Grave_Entry (the same builder and the same `decisionFromRunResult` message path as the gate), and return `{ runId, graveId?, verdict, rehearsed, isolation: { mode, p1Claimed, p5Claimed, p6Claimed }, exitCodes, message, diffSummary, truncated }`. In Plan_B it returns `rehearsed: false`, the exact line `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.`, a verdict of at least `warn`, and no claim. The tool descriptions state that the tools are advisory and that calling `ghost_run` does not make a command safe.
    - `ghost_diff(id)`: accepts a Run_Id or a Grave_Id (a leading `g-` is stripped), returns the `Change[]` per step, the diff summary, and the `isolation` claims; an unknown id or a removed record gives `unknown run id` and never a guess.
    - `ghost_trace(id, session?)`: runs `collectNeedles` on the report of the Run_Record and `traceRedThread` against the Provenance_Log of the session (the most recently modified session folder when `session` is absent); with no provenance it returns `not-found` links and `No provenance recorded.`; it states that the red thread finds literal occurrences only and that `not-found` does not mean safe; it changes no verdict.
    - **Dependency note:** needs the ghost-runner and possession implementations.
    - Write example tests with a `runPlan` double: the result shape, the Run_Record and Grave_Entry writes, Plan_B, an unknown id, a Grave_Id lookup, and `ghost_trace` on a README with a destination hidden in Tag_Characters (`hidden` equal to `true`). The `ghost_run` Docker test reports `skipped (docker unavailable)` when Docker is absent.
    - _Requirements: 18.8, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.12, 23.4_

  - [x] 14.4 Implement the tools `wards_check` and `blacklight`
    - `wards_check(plan)`: load the Wards_File, return the validation strings (at most 50), the ward ids and kinds, for each action whether `classifySafe` says it is a Safe_Command, and the static findings of the `ghost-runner` Static_Analyzer; start no container, execute no action, return `rehearsed: false` with no P1, P5, or P6 claim, state that it is a static check and not a rehearsal, and omit any `verdict` field.
    - `blacklight(path)`: confine every path with `confinePath` (a path that fails, or does not exist, gives a per-path error and the other paths are still scanned); a directory is scanned recursively up to 1,000 files and the result reports the cap; symbolic links inside the tree are not followed (`lstat` and skip, counted); call `scanFiles` only with confined real paths; return `{ outcome, files, totalFindings, text }` plus the per-path errors; never write, rename, or delete any file.
    - Write example tests for both tools: `wards_check` for a safe, an unsafe, and a secret-reading command; `blacklight` for a clean file, a file with a hidden character built from an escape, a path with `..`, an absolute path elsewhere, and a symbolic link to the outside.
    - _Requirements: 19.7, 19.8, 19.9, 19.10, 18.7, 18.8_

  - [x] 14.5 Write property test for MCP input validation and result bounds [no-docker]
    - `integrations/mcp/tests/prop-17-input-validation.test.mjs`. Generators: inputs outside the schemas (plans of length 0 or over 50, commands of length 0 or over 4,096 code points, wrong types, ids outside the pattern, more than 200 paths) and tool results of generated sizes with hidden code points built from code points. Check: the tool returns `isError: true` with a sanitized message naming the field and the runner double is not called; every serialized result is at most 64 KiB and a truncated result carries the `[truncated]` marker and the flag.
    - **Property 17: MCP input validation and result bounds**
    - **Validates: Requirements 18.2, 18.4, 18.5, 19.1, 19.4**
    - _Requirements: 18.2, 18.4, 18.5, 19.1, 19.4_

  - [x] 14.6 Write property test that `wards_check` is static [no-docker]
    - `integrations/mcp/tests/prop-18-wards-check-static.test.mjs`. Generators: plans of 1 to 50 generated commands (safe, unsafe, secret-reading). Check: `wards_check` makes no `runPlan` call and starts no container (spy on the runner double and `child_process`), returns `rehearsed: false` and no `verdict` field, and reports for each action the same `safe` flag as the gate classifier.
    - **Property 18: wards_check is static**
    - **Validates: Requirements 19.7, 19.8**
    - _Requirements: 19.7, 19.8_

  - [x] 14.7 Write property test for path confinement [no-docker]
    - `integrations/mcp/tests/prop-08-path-confinement.test.mjs` (KI-P8). Generators: path strings with `..` segments, absolute paths, empty strings, non-existent paths, and symbolic links to outside paths in a temporary workspace. Check: no `readFile` or `open` call of the file-system spy receives a real path outside the workspace root, and the other paths of the same call are still scanned.
    - **Property 8: Path confinement**
    - **Validates: Requirements 19.9, 19.10, 19.11**
    - _Requirements: 19.9, 19.10, 19.11_

  - [x] 14.8 Write the MCP stdio integration test
    - `integrations/mcp/tests/stdio.test.mjs`: start the server over stdio with the SDK client, list exactly the five tools, call `wards_check` and `blacklight` without Docker, and check that STDOUT holds protocol messages only (a spy outside the transport). The `ghost_run` test reports `skipped (docker unavailable)` when Docker is unavailable. Add an end-to-end check that no canary appears in any result or STDERR of these calls, and a determinism check (equal inputs, store, and wards give equal results except ids and timestamps).
    - _Requirements: 18.1, 18.3, 18.10, 19.12, 23.3_

- [x] 15. Kiro power
  - [x] 15.1 Create the power files
    - Create `integrations/power/plugin.json` (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `name` `ghost-run`, `version` `0.1.0`, `description`, `author` `{ "name": "Ghost Run+" }`, `keywords` `delete`, `drop table`, `migration`, `deploy`, `rm -rf`, `destructive`, `ghost run`, `secret`, `.env`, `truncate`, `force push`), `integrations/power/mcp.json` (`$schema` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`, `mcpServers` with one server `ghost-run`: `type` `stdio`, `command` `node`, `args` `["server/ghost-run-mcp.mjs"]`, `env` `{}`), `integrations/power/skills/ghost-run/SKILL.md`, and `integrations/power/README.md`.
    - `SKILL.md` starts with the front matter `name: ghost-run` and a one-line `description`, and its body states: when to call `wards_check` and then `ghost_run` (before a delete, a database change, a migration, a deploy, or a command that reads secret files); how to read `pass`, `warn`, `block` and the claims `p1Claimed`, `p5Claimed`, `p6Claimed`; that a `block` is to be answered with a different plan and not the same effect through another command; that a `warn` needs a human; that the tools are advisory and only the Ghost_Gate enforces a verdict; that a `pass` is not an approval. No hidden character, no HTML comment opener, no real host, no secret. The power folder holds no hook file and no steering file.
    - The power `README.md` states that a project that installs only the power has the advisory tools and the skill and not the enforcing Ghost_Gate, and that without Docker and the built box image `ghost_run` returns the Plan_B result. The prefixed tool names are added by task 17.4 (design O3).
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.9, 18.8_

  - [x] 15.2 Add the single-file server bundle script and build the committed bundle
    - Add `esbuild` (MIT; check its license from the installed `package.json` and add the row to the repository README table) as a dev dependency of `@ghost-run/mcp` and the script `bundle` (`pnpm --filter @ghost-run/mcp bundle`) that builds `integrations/power/server/ghost-run-mcp.mjs` as one ES-module file for Node 20 that includes the workspace packages. The bundle is committed because a power installed from a GitHub repository is not built on install.
    - Build the bundle once and commit it. The `env` of `mcp.json` stays empty.
    - **Dependency note:** needs the built `core`, `ghost-runner`, and `wards-config` and the finished tools (tasks 14.3 and 14.4).
    - _Requirements: 20.4, 1.8_

  - [x] 15.3 Write the power tests [no-docker]
    - `integrations/mcp/tests/power.test.mjs`: parse `plugin.json` and `mcp.json` and require the fields of Requirement 20 criteria 2 and 4 and the `SKILL.md` front matter of criterion 3, with no network call (the schema URLs are not fetched); rebuild the bundle into a temporary folder and require equal bytes to the committed file; run the possession scan over `integrations/power/` and expect `clean`; require that the folder holds no hook or steering file and that `env` has no value that looks like a secret.
    - _Requirements: 20.7, 20.9, 20.5, 22.2_

  - [x] 15.4 Implement the link helper fallback `pnpm power:link`
    - Add the script `power:link` (design D6 fallback, used only if task 17.4 shows that the host does not start the server with the power folder as the working directory): it writes the git-ignored `integrations/power/mcp.local.json` with the absolute path of `server/ghost-run-mcp.mjs` for the developer to copy into the power install. The file is listed in `.gitignore` (task 2.4). Write a test that the helper writes only that file, only inside `integrations/power/`, and that its output holds no secret.
    - _Requirements: 20.4, 12.1_

  - [x] 15.5 `ghost_run` passes the box folder to the runner; rebuild the bundle [docker for the real check]
    - Requirements (Req 19 criteria 13 to 16, glossary Box_Dir) and design (D6, the `ghost_run` bullet, the testing table) were updated first.
    - `integrations/mcp/src/tools/ghost_run.mjs` calls the runner's `findBoxDir({ env, workspace: root })` and passes `boxDir` to `runPlan` (omitted when not found; `deps.findBoxDir` seam). Depends on ghost-runner task 18.7.
    - Rebuilt `integrations/power/server/ghost-run-mcp.mjs` with `pnpm --filter @ghost-run/mcp bundle` after `pnpm --filter @ghost-run/ghost-runner build`.
    - Tests added: two cases in `tests/ghost-tools.test.mjs`, bundle hygiene in `tests/power.test.mjs`, and `tests/power-bundle-box.test.mjs` [docker].
    - Real check: the bundle started with the repository root as working directory gave `ghost_run` isolation mode `docker-box`, verdict `pass`, and no leftover container or volume (recorded in `docs/measurements.md`, section "Box folder lookup and bundled ghost_run"). MCP suite: 58 passed, 2 skipped before the two new test files; typecheck and lint clean.
    - _Requirements: 19.13, 19.14, 19.15, 19.16_

- [x] 16. Repository hygiene and timing measurement
  - [x] 16.1 Write the repository hygiene tests [no-docker]
    - `tests/hygiene.test.mjs`: run the Scan_Entry_Point of `possession` over `integrations/` (excluding `node_modules` and `dist`), `.kiro/hooks/`, and `.kiro/specs/kiro-integration/` and expect `clean`; require that all five hook files (`ghost-gate.json`, `ghost-log.json`, `contract-pbt.json`, `world-scaffold.json`, `blacklight-steering.json`) exist and pass the format test (if task 12.3 recorded that no create trigger exists, require the recorded reason instead of the file); scan fixtures, tests, and docs of this feature for hosts and require only reserved domains, `registry.npmjs.org`, or `192.0.2.x`, and only canary values as secrets; require that no file of this feature contains a literal hidden character or the HTML comment opener; require that after a full test run `git status --porcelain` shows no `.ghost-run/` content and no stray file; require that the files of this feature are ASCII text in English.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 2.1_

  - [x] 16.2 Measure the gate, ghost-log, and Short_Run timings and record them in `docs/measurements.md`
    - Measurement task on the Reference_Machine (Apple M1): record the Median_Of_5 and the maximum of the gate latency for a Safe_Command (budget 1.0 s), a Write_Judgment (1.0 s), the gate overhead above the runner for the five Ghost Shell scenarios (1.0 s above the runner budget; Docker needed, otherwise write `skipped (docker unavailable)`), a ghost-log record of 1 MiB (5 s), and the whole Short_Run of the package (60 s without Docker). Append one entry to `docs/measurements.md` with the numbers, the versions of Node and vitest, and a statement of any budget that was exceeded and the follow-up. A budget that is exceeded is reported and not hidden. Print the stats table produced by `formatStatsTable` for the session as an example.
    - _Requirements: 23.6, 4.8, 6.9, 8.11, 13.9_

  - [x] 16.3 Fix `vitest.worlds.config.ts` so it loads from a clean checkout [no-docker]
    - `vitest.worlds.config.ts` no longer imports `vitest/config`, which resolves only from a package folder and not from the root of a clean checkout. The config is a plain object. `integrations/kiro-hook/tests/worlds-config.test.mjs` (3 tests) checks that the file imports only `node:` modules and that the documented command loads it.
    - _Requirements: 25.11, 22.1_

  - [x] 16.4 Remove a flake in `ui/tests/model/p2-candle.test.ts` [no-docker]
    - The test gets explicit examples so that every unknown value type (string, number, boolean, null) is always covered, whatever the generated examples are. Unrelated to the wake retry; recorded here only so that the change is listed.
    - _Requirements: 23.5_

- [ ] 17. Host verification (manual tasks for the human)
  - [ ] 17.1 MANUAL (human): verify the exit-code behavior of the gate in Kiro IDE and Kiro CLI
    - **Depends on tasks 8.3 and 9.** Run this task in a scratch clone and not in this repository. Make a scratch clone (`git clone` of this repository into a temporary folder), run `pnpm install` and `pnpm -r build` there, and in the scratch clone set `enabled` to `true` in `ghost-gate.json` (and keep the exp-b files disabled). The gate in this repository stays disabled.
    - IDE steps: open the scratch folder in Kiro IDE, trust it (click the trust button in the trust dialog), reload the window (Cmd+Shift+P, "Developer: Reload Window"), start a new chat session, and send: (1) "Run the shell command: ls" (expect: allowed, no hook output); (2) "Run the shell command: rm -rf data" in a clone that contains a `data/` folder (expect: blocked, the chat shows the block message that names `protect-data`); (3) "Overwrite the existing file data/a.csv with the text hi" in a clone that contains `data/a.csv` (expect: blocked by the write judgment, naming `protect-data`). Creating a new file such as data/x.txt is allowed by design, because the path wards of `protect-data` deny only delete and overwrite. Then rename `core/dist` in the scratch clone, send "Run the shell command: echo hello" (expect: blocked with the line `GHOST RUN GATE UNAVAILABLE: build the packages first (pnpm -r build).`), and rename it back. Write down for each case whether the IDE blocked the call and whether the agent saw the hook message.
    - CLI steps: in a terminal run `cd <scratch>` and `kiro-cli chat`, repeat the same four messages and write down the same facts. Check that an exit code 2 blocks the call in the CLI and that the message reaches the agent.
    - Record the results in `docs/measurements.md` as one entry (a table of case, IDE result, CLI result). If any case lets the call through, mark the gate as not safe to enable and report it in the final checkpoint.
    - CLI side recorded 2026-11-21 in `docs/measurements.md`; the IDE side is pending.
    - _Requirements: 2.9, 7.8, 8.7_

  - [ ] 17.2 MANUAL (human): verify whether a Pre Tool Use `ask` output raises an approval prompt (IDE and CLI)
    - **Depends on task 8.3 and the probe files of task 1.2.** Use the scratch clone of task 17.1 or this repository with the gate disabled. Enable only `probe-ask.json` (set `enabled` to `true`), reload the window or start a new CLI session.
    - For each of three tool trust settings (a) `execute_bash` not trusted, (b) `execute_bash` trusted (in the IDE add the command pattern `echo *` to the trusted commands in the Kiro settings; in the CLI use the tool trust command, for example `/tools`), (c) trust-all or autopilot mode: send "Run the shell command: echo ghost-run-ask-probe". Judge: a prompt appeared if the host showed an approval dialog or a confirmation line before the command ran, with the reason text `probe: ask test`; a decline blocked the call if you decline and the chat shows no command output. Also check the log line `askTest: asked` in `.ghost-run/probe/events.jsonl`.
    - Record in `docs/measurements.md` a table with the rows (a), (b), (c) and the columns IDE prompt shown, IDE decline blocked, CLI prompt shown, CLI decline blocked, reason text shown. Add the `ask` row to the `Probe results` table. Set `probe-ask.json` back to `enabled: false`.
    - Decision rule written in the entry: `WARN_MODE` may become `ask` only if both hosts show the prompt and a decline blocks the call in all three settings, or in the untrusted setting if the README then states the trusted-tool limit; if the IDE and the CLI differ, `WARN_MODE` stays `exit2` for both.
    - CLI side recorded 2026-11-21 in `docs/measurements.md`; the IDE side is pending.
    - _Requirements: 10.3, 10.4, 10.11, 7.3_

  - [ ] 17.3 Decide `WARN_MODE` from the `ask` verification and update the gate constant
    - **Depends on task 17.2.** Keep `WARN_MODE = 'exit2'` in `gate-config.mjs` unless the decision rule of task 17.2 allows `ask`. If it allows `ask`, change the constant to `'ask'` (a Self_Protected_Path, so the change needs the human) and add a test that pins the committed value to the recorded decision. If it does not, add a test that pins `'exit2'` and a note in `gate-config.mjs` that names the `docs/measurements.md` entry.
    - Both modes are already covered by Property 1. A `warn` never exits 0 without the `ask` JSON.
    - Decision (human, 2026-11-21): `WARN_MODE` is `ask`, after the IDE 1.4.236 and CLI prompt tests. This task stays unticked as a record of the decision rule; the change itself is task 22.3.
    - _Requirements: 10.3, 10.4, 7.3, 7.9_

  - [ ] 17.4 MANUAL (human): install the power from the folder in a second project and record the evidence
    - **Depends on tasks 15.3 and 16.2.** Use a second, empty project folder outside this repository.
    - Steps: open the second project in Kiro IDE and trust it; open the Powers panel and choose "Add Custom Power", then "Local folder", and select `integrations/power` of this repository; when the install finishes, open the MCP servers view and confirm that the `ghost-run` server is running and lists the five tools (note the exact prefixed names the host shows); start a new chat and send "I want to run rm -rf build to clean up" and check whether the `ghost-run` skill is activated (the chat shows the skill name or the agent calls `wards_check`); ask the agent to call `wards_check` for the plan `ls`. If the server does not start because `server/ghost-run-mcp.mjs` does not resolve, run `pnpm power:link` (task 15.4), copy the absolute path from `mcp.local.json` into the power install, and record that the fallback was needed.
    - Save a screen capture or a log of the three observations (server listed with the five tools, keyword activates the skill, `wards_check` answer) for the Kiro usage report. Append the result and the displayed tool names to `docs/measurements.md`, and write the displayed names into `integrations/power/README.md` (design O3).
    - CLI side recorded 2026-11-21 in `docs/measurements.md`; the IDE side is pending. The CLI side found that the server worked on the power folder; fixed by task 21; repeat the CLI check after the fix and then the IDE side.
    - _Requirements: 20.6, 20.8_

- [x] 18. Documentation
  - [x] 18.1 Write the Hook_Package README: claims, host facts, and limits
    - Create or extend `integrations/kiro-hook/README.md` with: the claims and non-claims table of the Introduction of `requirements.md` and the "Claims by component" table of the design, stating that P1 is claimed per run from `isolation.p1Claimed` and never as a property of the hook, that P2 is not claimed, and that P5 and P6 follow the scopes of the design; the statement that the gate is a seatbelt and not a full isolation tool, that text analysis does not catch every injection, and that compression, encryption, and DNS exfiltration are caught by the action criterion only; that the gate, the Ghost_Log, and the MCP server run on the host and are not tamper-resistant against a process with the developer's privileges; that `pass` is not an approval of the real command and the real run can differ from the ghost run; the Safe_List and that a Safe_Command is not rehearsed; the Plan_B limitation, the macOS and Linux support scope, and Windows unverified; that one tool call is one Plan, so a secret read in one call and a network attempt in a later call are not linked; the host facts of Requirement 2 criterion 8 (file events fire only for files the agent changed; the IDE runs hooks only for a trusted folder after a window reload; a hook created during a session applies from the next session; in the CLI the `write` matcher also covers `delete_file`; the file-event matcher is a regular expression over the path); the `world-scaffold` and `contract-pbt` host notes; the `blacklight-steering` limits (agent saves only, HTML comments in code fences, no invisible character outside the possession categories); the experiment B note (measurement only); the only supported disable path (`enabled: false` in the hook entry) and the build-on-fresh-clone note; the timeout behavior (a long command is denied with the timeout line and the human runs it outside the gate); the self-protection scope and the dogfooding consequence; that tools outside the matchers are outside the gate; the failure before Node starts (no `node` binary, exit 127, the CLI lets the call through); and the `WARN_MODE` outcome of task 17.3 in plain words (a `warn` is a block in `exit2` mode).
    - The fixed gate strings quoted in the README never contain `sealed` or `isolated` (Requirement 11 criterion 6). No hidden character, no real host.
    - **Depends on tasks 17.2 and 17.3.**
    - _Requirements: 2.8, 4.9, 5.11, 5.12, 8.5, 8.6, 8.7, 9.5, 10.7, 10.8, 10.9, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.11, 15.10, 16.10, 17.6, 21.5_

  - [x] 18.2 Write the cross-call exfiltration note
    - Create `integrations/kiro-hook/docs/cross-call-exfiltration.md` and link it from the Hook_Package README. It states what the Ghost_Log records CAN do: after the fact, `ghost_trace` and the Grave_Entry `links` can show that text read in an earlier call (for example a README with a destination hidden in Tag_Characters) contains the destination of a later blocked or warned action, and the stats and the log support a human review. It states what they CANNOT do: block, warn on, or change the verdict of a later call; a secret read in call A and sent in call B are two separate Plans, the gate rehearses B alone, and the P6 behavior criterion does not fire. It states that the gate never reads the Provenance_Log to decide (a source-scan test enforces it), that the red thread is built after the verdict is fixed, that it finds literal occurrences only, and that P6 stays "within one tool call".
    - _Requirements: 13.11, 13.13, 5.11_

  - [x] 18.3 Write the MCP server README
    - Create `integrations/mcp/README.md`: the five tools and their inputs and results, the advisory notice (the tools help an agent that chooses to call them, only the Ghost_Gate enforces a verdict, and a `ghost_run` call does not make a command safe), the claims per tool (the `ghost_run` flags are copied from `isolation`; `wards_check` claims nothing; `ghost_trace` `not-found` does not mean safe), the result cap of 64 KiB, the path confinement rule, and how to run the server and its tests.
    - _Requirements: 18.8, 19.2, 19.6, 19.8, 19.10_

  - [x] 18.4 Update the repository README: dependency license table, claims, and links
    - In the root `README.md`: verify that the dependency table lists every new dependency of this feature with name, version, and license (`@modelcontextprotocol/sdk` 1.32.2 MIT, `zod` 4.6.7 MIT, `esbuild` MIT, and any other added by this plan; read each license from the installed package), add a short section for Kiro integration that links the Hook_Package, MCP, and power READMEs and repeats the per-run claim rule (P1 only when `isolation.p1Claimed`), the Plan_B statement, and the Windows note. Keep every claim inside its declared scope.
    - **Depends on tasks 14.1, 15.2, and 18.1.**
    - _Requirements: 1.8, 11.1, 9.5_

  - [x] 18.5 Record the spec bookkeeping items
    - Edit `requirements.md` and `design.md` of this spec only for these items: extend the property table of Requirement 23 with Properties 10 to 21 of the design (design O17), mark design open items O7, O8, O10, O11, O12, O13, O14, O16, and O17 as resolved or still open with the date and the value found by the tasks that settled them (O7 `safeCommands` present or still `[]`; O12 `runId` present or not), and record in the Requirement 10 notes the result of task 17.3. Change no other text.
    - _Requirements: 23.1, 23.2, 10.3_

  - [x] 18.6 Document the Docker Resource Saver case in the READMEs
    - `integrations/kiro-hook/README.md` has the section `Docker Desktop Resource Saver`: what happens (the VM stops after 5 idle minutes and the first `docker info` takes about 1.9 s), the single 10 s retry of the gate, the `docker-warmup` hook that the human enables, and that turning Resource Saver off also removes the case. The root `README.md` has the section `Use it in your Kiro`, which links to it.
    - **Depends on tasks 8.11, 8.12, and 18.1.**
    - _Requirements: 25.9_

- [ ] 19. Enable the gate for our own development (target 2026-11-22)
  - [ ] 19.1 MANUAL (human confirms): pre-enable checklist, then switch the gate on
    - This is a checkpoint-style task. The agent does not enable the gate. A human works through the checklist, confirms each check (A to F) only when verified, and records the evidence in `docs/measurements.md`. Do not enable the gate before every check is confirmed.
    - Checklist:
      - Check A (tests): Full test suite passes: `pnpm -r build`, `pnpm -r test`, and `pnpm lint`, with the `[docker]` tests run on a Docker machine (a `skipped (docker unavailable)` line is not a pass), and the `[docker]` leftover-container test passes.
      - Check B (safe list): Safe list verified: the built-in entries skip the ghost (`ls`, `pwd`, `git status`, `git diff`, `echo hi`), and each of `ls; rm x`, `cat .env`, `git diff --output=out`, and a command with `$(...)` goes through the ghost (checked in the scratch clone of task 17.1 with the Stats_Events `safe-skip` and `ghosted`).
      - Check C (approval path): Approval path verified: the committed `WARN_MODE` is `ask` (decision of 2026-11-21, task 22.3). A `warn` call (for example `pnpm install` with network in the ghost run) was observed to raise the host prompt with the warn message in both hosts, Deny blocks the call, and a command that contains `ghost-run approve` is still denied. The README states what a human does for a necessary command (approve it through the host prompt, or run it outside the agent).
      - Check D (fail closed): Fail-closed behavior verified in the scratch clone in both hosts, each case blocks the call with exit 2: a crash (an injected throw in a copy of `main.mjs`), a timeout (a runner that hangs past the watchdog, or a command that exceeds it), a missing wards file (rename `apps/ghost-shell/wards.yaml`), a missing build (rename `core/dist`), and a dynamic import failure (a syntax error in a copy of `main.mjs`).
      - Check E (hygiene): The experiment B hooks and the probe hooks are disabled, `.ghost-run/` is ignored, the human disable path (`enabled: false` in the hook entry) is known, and the possession scan of the repository is `clean`.
      - Check F (hand-off): The ghost-runner `runId` hand-off status is written down: either the option exists and the hung-runner cleanup test passes, or the README states that Requirement 8 criterion 9 is not claimed for a hung runner.
    - After checks A to F are confirmed, the human sets `enabled` to `true` in both entries of `.kiro/hooks/ghost-gate.json` (through the Kiro hooks panel or the file), reloads the window or starts a new session, runs `ls` and one blocked call to confirm, and appends the date and the evidence to `docs/measurements.md`.
    - Also set `enabled` to `true` in `.kiro/hooks/docker-warmup.json`, and re-measure `dockerCheckMs` in the IDE after a stop of more than 5 minutes (Docker Desktop Resource Saver); record in `docs/measurements.md` whether `dockerWakeRetried` was `true`.
    - **Depends on tasks 16.2, 17.1, 17.2, 17.3, 17.4, and 18.1.**
    - _Requirements: 10.11, 8.2, 8.6, 21.1_

  - [ ] 19.2 MANUAL (human): record the number of approvals per development day
    - From the first day the gate is enabled, count the human approvals (and, in `exit2` mode, the commands that you had to run outside the agent) per development day, and append the counts to `docs/measurements.md` together with the `summarizeStats` table of the session for at least three working days. Record which necessary commands needed approval (for example a dependency install).
    - _Requirements: 10.11, 13.8_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Run `pnpm -r build`, `pnpm lint`, `pnpm --filter @ghost-run/kiro-hook test`, `pnpm --filter @ghost-run/mcp test`, and `typecheck` for both packages, in the Short_Run, and, where Docker is available, the `[docker]` tests. Confirm: every property of the design (1 to 21) has a test with at least 100 runs in the Short_Run and the Short_Run is within 60 s without Docker; the hook file format test, the exp-b retirement test, and the probe-disabled test pass; the five hook files exist (or the recorded reason for a missing `world-scaffold.json` stands); the possession scan of `integrations/`, `.kiro/hooks/`, and `.kiro/specs/kiro-integration/` is `clean`; the source-scan test passes; no `.ghost-run/` content is in the working tree; the README tables list every dependency with its license; the `core`, `ghost-runner`, `wards-config`, and `ui` ESLint import bans hold; the `Probe results` table, the exit-code table, the `ask` table, the timing entry, and the power install entry exist in `docs/measurements.md`; the open items that remain (O7 `safeCommands`, O12 `runId`, O10, `ui` import ban if `ui` was missing) are listed in the checkpoint report with the spec that owns each. Ensure all tests pass, ask the user if questions arise.

- [x] 21. Fix round 2026-11-21: the power works in another project (the `PWD` source of 21.1 is superseded by task 22)
  - [x] 21.1 Workspace root resolver, per-call context, and roots/list
    - `integrations/mcp/src/workspace.mjs` resolves the workspace root per tool call in this order: MCP `roots/list`, `GHOST_RUN_WORKSPACE`, the working directory, `PWD`; the last two are skipped when they are the power's own folder (superseded by task 22.1: `PWD` is no longer a source and the `workspace` input is added). With no root every tool returns `workspace root unknown: ...` and does nothing else.
    - `src/tool-kit.mjs` builds a per-call context (`root`, `notices`) and adds the first line `Workspace root: <path>` plus notice lines to each result (re-applying the 64 KiB cap). `src/server.mjs` asks the client for roots only when it declared the `roots` capability, caches the answer, and clears the cache on `notifications/roots/list_changed`.
    - Tests: `integrations/mcp/tests/workspace-root.test.mjs` (resolution order, own-folder skip, roots cache and list_changed, root-unknown error with no runner call and no write).
    - _Requirements: 18.6, 18.11, 18.12, 18.13, 18.14_

  - [x] 21.2 Default wards for `wards_check` and `ghost_run`
    - `src/default-wards.mjs` embeds the default wards text and `src/wards-source.mjs` loads it only when no wards file exists (`GHOST_RUN_WARDS_FILE` unset and neither `<root>/wards.yaml` nor `<root>/apps/ghost-shell/wards.yaml` present), adding the default-wards notice. A wards file that exists but is invalid still gives an error result (fail closed). The Ghost_Gate is unchanged and still denies on a missing file.
    - Tests: the embedded text is pinned byte for byte to `apps/ghost-shell/wards.yaml`; notice present for the defaults; an invalid file gives an error with no notice; a project wards file wins.
    - _Requirements: 19.17, 19.18, 19.19_

  - [x] 21.3 Box sources in the power and rebuilt bundle
    - `integrations/mcp/scripts/bundle.mjs` gets `copyBox`, which copies `ghost-runner/box` to the committed `integrations/power/box/` (files ending in `.local` excluded). The committed bundle `integrations/power/server/ghost-run-mcp.mjs` is rebuilt, with no absolute path and no user name.
    - Tests: `integrations/mcp/tests/power-box.test.mjs` (the copy equals `ghost-runner/box`; `findBoxDir` from the bundle folder finds `power/box`) and `integrations/mcp/tests/power-install.test.mjs` (the bundle copied to a fake install folder starts there with `GHOST_RUN_WORKSPACE` and with neither, where it refuses to work on its own folder; the `PWD` case was removed by task 22.1).
    - _Requirements: 19.15, 19.20, 19.21, 20.5, 20.6_

  - [x] 21.4 SKILL.md description says when to use the skill
    - The one-line `description` of `integrations/power/skills/ghost-run/SKILL.md` names the trigger (before a destructive or risky command such as `rm -rf`, `DROP TABLE`, a migration, a deploy, or a read of `.env`), so the skill loads for such requests.
    - _Requirements: 20.3, 20.10_

  - [x] 21.5 Documentation of the fix round
    - Update `integrations/power/README.md` (root resolution, `GHOST_RUN_WORKSPACE`, default wards, box folder), `integrations/mcp/README.md` (workspace root, notice lines, default wards), and the section "Use it in your Kiro" of the root `README.md`.
    - _Requirements: 18.6, 20.5, 20.6_

  - [x] 21.6 Make parallel test runs independent
    - `apps/ghost-shell/tests/build/dist.test.ts` and `tests/build/build-smoke.test.ts` each build into their own temporary outDir and no longer share `apps/ghost-shell/dist`.
    - `ghost-runner/tests/repo-world.docker.test.ts` and `tests/verify-world.docker.test.ts` compare only the run ids that the test process issued (helper `ghost-runner/tests/own-run-ids.ts`), not every container with the label `ghost-run.run-id`.
    - _Requirements: 23.3_

  - [x] 21.7 Record the CLI side of the host checks in `docs/measurements.md`
    - Entry "Host checks before enabling the gate (2026-11-21, Kiro CLI 3.5.0, Docker 29.9.3)": evidence for tasks 17.1, 17.2, and 19.1; the IDE columns read "pending". This only records evidence; the manual tasks stay open.
    - _Requirements: 20.6, 20.10_

- [x] 22. Fix round 2 2026-11-21
  - [x] 22.1 Workspace root: remove the `PWD` source and add the `workspace` input
    - `integrations/mcp/src/workspace.mjs`: remove `PWD` as a source. The order becomes `roots/list` (only when the client declared `roots`), `GHOST_RUN_WORKSPACE`, the working directory unless it is the Own_Folder, then the `workspace` input (used only when no root exists).
    - Add the optional string input `workspace` to the zod schema of all five tools (`ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, `blacklight`). Validate it: absolute path, realpath of an existing folder, not `/`, not the home folder, not the Own_Folder; each failure returns an error result that names the reason. If a root already exists and the real path of `workspace` differs, return `workspace does not match this server's workspace root` and change nothing. If no root exists and no valid `workspace` is given, return the `workspace root unknown: pass `workspace` ...` error with no runner call and no write.
    - Keep the path confinement of KI-P8 unchanged for the resolved root. The Ghost_Gate stays unchanged.
    - Property tests in `integrations/mcp/tests/workspace-input.pbt.test.mjs` [no-docker], with injected sources (no Kiro host): Property 22 generates any server that has a root (client roots, `GHOST_RUN_WORKSPACE`, or a working directory) and any `workspace` value (existing folders, other folders, relative strings, junk), and checks that the root of the call equals the root without `workspace` (an equal path is accepted, a different one gives the mismatch error, the root never moves). Property 23 generates `workspace` values that are `/`, the home folder (also with trailing slashes, `.` and `..` segments, and symlinks to it), and the Own_Folder (also through a symlink), and checks that each is refused with its reason and that no runner call and no write happens.
    - **Property 22: The workspace input never moves a rooted server**
    - **Property 23: Root, home folder, and own folder are always refused**
    - **Validates: Requirements 18.15, 18.16, 18.17, 18.18**
    - Update `integrations/mcp/tests/power-install.test.mjs` (remove the `PWD` case, add cases for `workspace` given and for neither) and `integrations/mcp/tests/workspace-root.test.mjs` (no `PWD` source, `workspace` used only without a root, mismatch error, unknown-root error, each refusal reason).
    - _Requirements: 18.6, 18.11, 18.12, 18.13, 18.14, 18.15, 18.16, 18.17, 18.18, 19.10_

  - [x] 22.2 Documentation and rebuilt bundle for the `workspace` input
    - Add to `integrations/power/skills/ghost-run/SKILL.md` the sentence ``Pass `workspace` = the absolute path of the current project root in every call.`` (exact text, no hidden character).
    - Update `integrations/power/README.md` and `integrations/mcp/README.md`: the resolution order without `PWD`, the `workspace` input and its refusal reasons, and why `PWD` is not a source (it names the launch folder of the host, not the project of the window).
    - Rebuild the committed bundle `integrations/power/server/ghost-run-mcp.mjs` with `pnpm --filter @ghost-run/mcp bundle` (the exact script name is in `integrations/mcp/package.json`); requirement 19.15 holds (no absolute path, no user name in the bundle).
    - Update the entry "Host checks before enabling the gate" in `docs/measurements.md`: keep the CLI `PWD` result as measured and add why `PWD` was removed (in the IDE it is the launch folder of Kiro for every window). This task is the only one of wave 23 that edits `docs/measurements.md`.
    - **Depends on task 22.1.**
    - _Requirements: 18.6, 18.15, 19.15, 20.3, 20.5, 20.6_

  - [x] 22.3 Commit `WARN_MODE = 'ask'` and update the warn documentation
    - `integrations/kiro-hook/gate-config.mjs`: set `WARN_MODE = 'ask'` with a comment that names the `docs/measurements.md` entry (`Host checks before enabling the gate`) and the date 2026-11-21 (a Self_Protected_Path: the human decided).
    - Add a pin test in `integrations/kiro-hook/tests/` (for example `warn-mode.test.mjs`) that asserts the committed value is `'ask'`, and that `gate-config.mjs` names the measurements entry and `2026-11-21`.
    - Check Property 1 (task 7.2) for `ask`: a `warn` never exits 0 without the `ask` JSON (with `permissionDecision: "ask"` and the warn message as reason), a `block` stays exit 2, a `pass` never emits `allow`. Extend the test if the `ask` mode lacks a case.
    - Update the sentences in `integrations/kiro-hook/README.md` (and the root `README.md` section "Use it in your Kiro" if it has them) that say a human runs a warned command outside the agent: a warned command raises the host prompt, Allow runs it, Deny blocks it; running it outside the agent is still possible; a command containing `ghost-run approve` is denied.
    - _Requirements: 10.3, 10.4, 7.3, 7.9_

  - [x] 22.4 Remove the global container comparison from `gate-docker.test.mjs` [docker]
    - `integrations/kiro-hook/tests/gate-docker.test.mjs`, near line 195: remove the comparison of the labeled containers (`labeled()`) before and after against every container with the label `ghost-run.run-id`, or restrict it to the run ids that this test process issued (same idea as `ghost-runner/tests/own-run-ids.ts`, task 21.6). The check must not fail when another test file or process runs a container at the same time.
    - _Requirements: 8.2, 23.3_

  - [x] 22.5 Replace `pending` in `docs/measurements.md` with the IDE results
    - In the entry "Host checks before enabling the gate", replace each IDE column that reads `pending` with the IDE 1.4.236 results for task 17.1 (exit-code cases), 17.2 (`ask` prompt in the settings a, b, c), 17.4 (power install in a second project), and the sleeping-Docker case. Use only results that the human gave; where a result is still missing, write `not measured` with the reason, never a guess.
    - This task edits `docs/measurements.md` and runs in its own wave. It only records evidence: the manual tasks 17.1, 17.2, and 17.4 stay unticked until the human ticks them.
    - **Depends on task 22.2.**
    - _Requirements: 2.9, 10.3, 20.6, 25.9_

  - [x] 22.6 Gates for fix round 2
    - Run `pnpm -r build`; rebuild the bundle and check that it equals the committed file; `pnpm --filter @ghost-run/mcp test`, `typecheck`, `lint`; `pnpm --filter @ghost-run/kiro-hook test`, `typecheck`, `lint`, with the kiro-hook suite run twice in a row with Docker available (the second run must also pass, which shows that no test depends on leftovers or on other containers); the possession scan tests (`integrations/`, `.kiro/hooks/`, `.kiro/specs/kiro-integration/` stay `clean`); and `validate_spec_format` on this file.
    - Report any `skipped (docker unavailable)` line as skipped and not as passed.
    - **Depends on tasks 22.1, 22.2, 22.3, 22.4, and 22.5.**
    - _Requirements: 19.15, 22.5, 23.3_

- [x] 23. Fix round 3 2026-11-21
  - [x] 23.1 Document the headless trust-all limit of `ask`
    - Write the limit (a non-interactive Kiro CLI run with `--trust-all-tools` answers an `ask` itself; a block stays blocked; use `--trust-tools=@builtin` or narrower for unattended runs) in the Requirement 10 notes, in `integrations/kiro-hook/README.md`, and in the section "Use it in your Kiro" of the root `README.md`. `WARN_MODE` stays `'ask'` (decided by the human).
    - _Requirements: 10.3, 10.4, 11.1_

  - [x] 23.2 Make the `workspace` input hard to miss
    - The `workspace` field of all five tools carries the zod `.describe(...)` text "Absolute path of your project root. Pass it on every call: a server started from an installed power cannot see your project otherwise."
    - The root-unknown error starts with what to do: "Pass `workspace` (the absolute path of your project root) and call again. Workspace root unknown: ...". Requirement 18.11, the design, the READMEs, and a new exact-text pin test in `integrations/mcp/tests/workspace-root.test.mjs` are updated. The committed bundle is rebuilt; requirement 19.15 holds.
    - _Requirements: 18.11, 18.15, 19.15_

  - [x] 23.3 Corrections and new results in `docs/measurements.md`
    - Entry "Host checks before enabling the gate": correct the statement of who answered the IDE prompts; add "Check C with WARN_MODE 'ask' (62bb374)", "IDE update", and "Power after fix rounds 1 and 2 (62bb374)". Every earlier line stays. The manual tasks stay unticked.
    - _Requirements: 20.6, 20.10_

  - [x] 23.4 Gates for fix round 3
    - Run `pnpm -r build`; rebuild the bundle and check that it equals the committed file; tests, typecheck, and lint of `@ghost-run/mcp` and `@ghost-run/kiro-hook`; the possession scan tests; `validate_spec_format` on this file.
    - **Depends on tasks 23.1, 23.2, and 23.3.**
    - _Requirements: 19.15, 22.5_

- [x] 24. Seance viewer and auto-start 2026-11-30 (resolves O4)
  - [x] 24.1 Viewer and pages
    - `integrations/kiro-hook/lib/seance/render.mjs` and `server.mjs`: plain HTML pages, 127.0.0.1 only, GET only, id pattern, security headers, health JSON, friendly empty page.
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

  - [x] 24.2 Manual command
    - `integrations/kiro-hook/seance.mjs` and the `seance` script of the package; the port comes from `GHOST_RUN_SEANCE_BASE`.
    - _Requirements: 26.5_

  - [x] 24.3 Auto-start from the gate
    - `lib/seance/autostart.mjs`, the `onGrave` dependency of `decide`, and the call in `lib/gate/main.mjs`; `GHOST_RUN_SEANCE_AUTOSTART=0` turns it off; source-scan exemptions for `lib/seance/` and `seance.mjs`.
    - _Requirements: 26.6, 26.7, 26.8_

  - [x] 24.4 Tests
    - `integrations/kiro-hook/tests/seance.test.mjs` (21 tests).
    - _Requirements: 26.9_

  - [x] 24.5 Docs
    - Section "Seance link" in `integrations/kiro-hook/README.md` and a bullet in "Kiro integration" of the root README.
    - _Requirements: 26.5, 26.7, 26.8_

  - [x] 24.6 Host check, compact list, look
    - `lib/seance/server.mjs` answers 421 to any `Host` other than `localhost:<port>` or `127.0.0.1:<port>` before reading the graveyard; `lib/seance/render.mjs` lists one row per grave (time, candle badge, ward ids, first line cut to 120 code points) and gives both pages the Ghost Run+ look and titles; three tests in `tests/seance.test.mjs`.
    - _Requirements: 26.2, 26.10, 26.11_

  - [x] 24.7 Badge shows the gate decision
    - `lib/seance/render.mjs`: the badge is "out" for a `block` ward verdict and "flickering" otherwise; a grave with a `pass` ward verdict gets a "Gate rule" note with the entry's notices; the verdict section is labelled "Ward verdict". No change to the entry the gate writes. Tests in `tests/seance.test.mjs`; "Seance link" in `integrations/kiro-hook/README.md` gains the Host check line.
    - _Requirements: 26.11, 26.12_

## Notes

- Task 22 (fix round 2, 2026-11-21) removes the `PWD` source, adds the `workspace` input, commits `WARN_MODE = 'ask'`, and records the IDE results. Tasks 17.1, 17.2, 17.4, 19.x, and the parents 17, 19, 20, 1, and 2 stay unticked until the human completes them. Task 17.3 is kept as a record of the decision.
- Task 21 was added after the first pass as a fix round. The CLI half of task 17.4 found the root failure (the server worked on the power folder); the IDE half is pending.

- Every task is required. No task is marked optional. No test sub-task carries the `*` marker.
- Properties 1 to 21 keep the numbering and titles of `design.md`. Properties 1 to 9 are KI-P1 to KI-P9 of Requirement 23. Property map: 1 (task 7.2), 2 (5.4), 3 (8.4), 4 (4.7), 5 (4.6), 6 (6.4), 7 (12.2), 8 (14.7), 9 (8.5), 10 (7.4), 11 (6.5), 12 (7.3), 13 (7.6), 14 (8.6), 15 (8.7), 16 (4.5), 17 (14.5), 18 (14.6), 19 (11.2), 20 (13.2), 21 (4.4).
- Requirement traceability (requirement: tasks). 1: 1.1, 2.1 to 2.5, 14.1, 18.4. 2: 1.2, 3.2, 8.3, 10.3, 11.4, 12.3, 13.3, 16.1, 18.1. 3: 4.1, 5.1, 5.2, 6.2, 8.1. 4: 5.2, 5.3, 5.4, 8.5. 5: 6.2, 7.1, 8.1, 18.1. 6: 6.3, 6.4, 6.5. 7: 7.1, 7.2, 7.3, 7.5. 8: 4.1, 6.1, 8.2, 8.8, 8.10. 9: 7.1, 7.4, 18.1. 10: 5.5, 8.7, 17.2, 17.3, 19.1, 19.2. 11: 18.1, 18.4. 12: 2.4, 4.2, 4.3, 4.5, 4.7. 13: 4.3, 4.6, 10.1, 10.2, 18.2. 14: 7.5, 7.6. 15: 11.1, 11.2, 11.3. 16: 12.1, 12.2. 17: 13.1, 13.2, 13.3. 18: 14.1 to 14.4, 14.8. 19: 14.2 to 14.7. 20: 15.1 to 15.4, 17.4. 21: 3.1, 3.2. 22: 16.1. 23: 8.9, 14.8, 16.2, 18.5. 24: 1.1 to 1.8. 25: 8.11, 8.12, 16.3, 18.6.
- The Kiro host facts that tasks 1.4, 1.5, 17.1, 17.2, and 17.4 depend on (labels of dialogs and commands) are written from the documentation and may differ slightly in the installed version. If a label differs, record the real label in the notes and continue.
- Waves 3 to 7 contain the manual probe steps. Coding tasks that do not depend on a probe fact are placed in the same waves so they overlap with the human work. Every task that depends on a probe fact names task 1.7 and is placed after it.
- Manual tasks (1.4, 1.5, 17.1, 17.2, 17.4, 19.1, 19.2) are for a human. An agent executing the plan stops at them and asks the user for the result, and never ticks them on its own.
- Task 2.2 is an isolated edit of ESLint configuration files in other packages and must not run at the same time as another task that edits `core/`. Task 2.3 edits a steering file and must satisfy the `blacklight-steering` hook and the hidden-character ban.
- Dependencies on other specs are listed in "Cross-spec dependencies and wave order". The hand-offs `ParseResult.safeCommands` (wards task 6), `RunnerOptions.runId` (ghost-runner next round), and the warn-template test (wards task 4 round) are not tasks of this plan.
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["1.4", "2.5", "3.1", "4.1", "5.2"] },
    { "id": 4, "tasks": ["1.5", "4.2", "5.3", "5.5"] },
    { "id": 5, "tasks": ["1.6", "4.3", "4.4", "4.5", "5.4", "6.1", "7.1", "14.1"] },
    { "id": 6, "tasks": ["1.7", "4.6", "4.7", "6.2", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 7, "tasks": ["1.8", "4.8", "5.1", "7.6", "15.1"] },
    { "id": 8, "tasks": ["3.2", "6.3", "10.1", "11.1", "12.1", "13.1"] },
    { "id": 9, "tasks": ["6.4", "6.5", "8.1", "10.2", "10.3", "11.2", "11.3", "11.4", "12.2", "12.3", "13.2", "13.3"] },
    { "id": 10, "tasks": ["8.2", "8.4", "8.5", "8.6", "8.7"] },
    { "id": 11, "tasks": ["8.3", "8.8", "8.9", "8.10", "8.11", "14.2"] },
    { "id": 12, "tasks": ["8.12", "14.3", "17.1"] },
    { "id": 13, "tasks": ["14.4", "17.2"] },
    { "id": 14, "tasks": ["14.5", "14.6", "14.7", "14.8", "15.2", "17.3"] },
    { "id": 15, "tasks": ["15.3", "15.4", "18.1", "18.2", "18.3"] },
    { "id": 16, "tasks": ["16.1", "16.2", "16.3", "16.4", "18.4", "18.5", "18.6"] },
    { "id": 17, "tasks": ["17.4"] },
    { "id": 18, "tasks": ["19.1"] },
    { "id": 19, "tasks": ["19.2"] },
    { "id": 20, "tasks": ["20"] },
    { "id": 21, "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6", "21.7"] },
    { "id": 22, "tasks": ["22.1", "22.3", "22.4"] },
    { "id": 23, "tasks": ["22.2"] },
    { "id": 24, "tasks": ["22.5"] },
    { "id": 25, "tasks": ["22.6"] }
  ]
}
```

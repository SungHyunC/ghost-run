# Implementation Plan: wards

## Overview

This plan builds the full ward system in two places: the pure judgment modules in `core/src/judge/` (zero runtime dependencies) with the refined `WardEngine` in `core/src/wards.ts`, and the new workspace package `@ghost-run/wards-config` in `wards-config/` (parser, validator, printer for `wards.yaml`). All code is TypeScript (the design uses TypeScript throughout). Host code targets Node.js 20 or later. Tests use `vitest` and `fast-check`.

The plan follows the implementation waves of the design:

1. Scaffolding: the `wards-config` package, its entry in `pnpm-workspace.yaml`, the ESLint import ban, the `structure.md` steering update, and the two additive type changes in `core/src/types.ts`.
2. Pure judge modules, each with its property test: bytes and sanitizer, path normalizer, glob matcher, host matcher, canary extraction, content inspector, message builder.
3. Engine integration: `evaluate` becomes an orchestrator over the judge modules, then `isMoreRestrictive` is extended. The existing P4 test is run before and after.
4. The `wards-config` package with the `yaml` library (version 2.9.1, ISC license, confirmed on npm and in the installed package on 2026-11-18), the README dependency table row, a browser-safe default entry plus the Node-only subpath `@ghost-run/wards-config/node`, and the optional `safe_commands` list.
5. The default `apps/ghost-shell/wards.yaml` and the verification of scenarios 1 to 5.
6. The leak, determinism, and error-line property tests, README documentation, and the final checkpoint.

State that already exists and is not recreated by this plan (ghost-runner W0 is done):

- `core/src/types.ts` already has the Change kind `symlink-changed`, the optional `dropped` field of `sql-row-count`, `ObservedEvent.eventId`, `SecretValues`, and `EvaluateInputs`.
- `WardEngine.evaluate(report, wardSet, inputs?)` already accepts `{ secretValues, payloads }` and does not inspect them yet. It maps `symlink-changed` to the `overwrite` operation and counts a `dropped: true` Change as all rows lost.
- The 43 core tests pass.
- The cap on `secretValues` is decided and enforced by ghost-runner: at most 16 files, at most 65,536 bytes per file, and the diagnostic `secret-values-capped` on overflow. The wards design assumption about a runner cap is therefore satisfied. This plan references the cap in the performance test (task 4.14) and in the content inspection task (4.4) and does not implement it.

Decisions reflected in this plan:

1. **D6 (whitespace-free raw needle).** A Canary that contains `CR`, `LF`, space, or tab also gets a whitespace-free `raw` needle searched in the whitespace-stripped views V1 and V3, only when the stripped form has at least 8 bytes (task 2.11).
2. **D18 (message joining).** A `sql` violation for several tables reads `would delete <n1> rows from <t1>, <n2> rows from <t2>`, with tables in ascending lower-case order printed in the ward's own spelling, and ` (max allowed <m>)` only when `max_rows_lost > 0` (task 4.2).
3. **Claims.** P4 is claimed for all worlds. P5 is claimed only where P1 holds. P6 is claimed only where network attempts are recorded. In Plan B (`static-analysis`) neither P5 nor P6 is claimed, and the Message_Builder lowers the claim through the optional `RenderContext.claims` field (`reason` `static-analysis` or `unsupported-step`; no `claims` means no line, for worlds where P5 and P6 do not apply) (tasks 1.7, 2.13, 4.9, 4.10, 4.11).
4. `core` keeps zero runtime dependencies. The `yaml` library lives only in `wards-config`.
5. **D21 (browser-safe entry).** The default entry of `wards-config` imports no Node built-in so the Ghost Shell playground can parse `wards.yaml` in the browser; `loadWardsFile` is exported only from `@ghost-run/wards-config/node` (tasks 1.1, 6.5, 6.6, 6.8).
6. **D22 (`safe_commands`).** The optional top-level key `safe_commands` is parsed, validated, and printed by `wards-config` for `ghost-gate`; `core` is unchanged; the default list in `apps/ghost-shell/wards.yaml` is `ls`, `pwd`, `cat`, `git status`, `git diff` (Open Item 16, resolved; tasks 6.2, 6.3, 6.4, 6.7, 6.8, 8.1, 10.3, 10.4).
7. The default wards file lives at `apps/ghost-shell/wards.yaml` (design D13). Its Docker-box run belongs to ghost-runner Requirement 18 and is not part of this plan.

## Conventions

- **Property tags.** Each property test starts with the comments `// Feature: wards, Property <n>: <title>` and `// **Validates: Requirements ...**`, and uses `fc.assert(fc.property(...))` with `numRuns: NUM_RUNS` from `pbt-config.ts` (at least 100 in a short run, at least 10,000 when `GHOST_PBT_MODE=nightly`). The property numbering and titles are those of the Correctness Properties section of `design.md`.
- **Optional marking.** Test sub-tasks carry the `*` postfix and may be skipped for a faster MVP. Core implementation tasks are never optional. Checkpoints are top-level tasks.
- **Claim scope in tests.** Tests of P5 (Property 5) and P6 (Properties 8, 9) use the helper from task 1.7 and are labeled with their scope. They are claimed only where P1 holds (P5) and only where network attempts are recorded (P6), and they are never reported as claimed for `static-analysis` mode.
- **Test data.** Canary values only (for example `sk-CANARY-abc123` and `sk-CANARY-` plus generated alphanumerics). Hostnames only from `.example`, `.test`, `.localhost`, `.invalid`, `192.0.2.x`, `::1`, `::ffff:c000:20a`, and `registry.npmjs.org` as the `allow_hosts` example. Hidden Unicode characters are written only as escape sequences (for example `"\u200B"` and `"\u{E0041}"`), never literally.
- **Purity.** No judge module reads a clock, random source, or environment variable, performs I/O, or calls an LLM. Test oracles never import the code under test.
- **Verification commands.** `pnpm --filter @ghost-run/core exec vitest --run`, `pnpm --filter @ghost-run/core exec tsc --noEmit`, `pnpm --filter @ghost-run/core exec eslint .`, and the same three for `@ghost-run/wards-config` (`tsc --noEmit` there checks the `src`, `tests`, and config files through the source aliases; `build` is needed only before another package imports the built output).
- **Scope of this plan.** Coding tasks only. Hook scripts, the MCP server, UI rendering of the lowered claim, and the Docker-box run of the scenarios belong to other specs.

## Tasks

- [x] 1. Scaffolding, workspace, steering, and core types
  - [x] 1.1 Create the `wards-config/` package and register it in the workspace
    - Add `  - wards-config` to the `packages:` list of `pnpm-workspace.yaml` (it is not covered by the existing globs).
    - Create `wards-config/package.json` (`name: "@ghost-run/wards-config"`, `private: true`, `type: "module"`, `engines.node >= 20`, dependency `@ghost-run/core: workspace:*` as the only workspace dependency, dev dependencies `vitest`, `fast-check`, `typescript`, scripts `test`, `test:pbt`, `lint`, `build`, `clean`). The `yaml` dependency is added later in task 6.1.
    - Create `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs` (import `@ghost-run/core` only through its public entry point), and `vitest.config.ts` with the alias `@ghost-run/core` to `<root>/core/src/index.ts` so tests never need a prior build.
    - Create placeholder modules `src/index.ts` (default entry), `src/types.ts`, `src/parse.ts`, `src/schema.ts`, `src/print.ts`, `src/format.ts`, `src/load.ts`, and `src/node.ts` (Node entry, re-exports `load.ts`) so later tasks only fill them in. `src/index.ts` must not re-export `load.ts` or `node.ts` (decision D21; the placeholder state of the repository may still do so until task 6.6).
    - Do not call any LLM API anywhere in the package.
    - _Requirements: 1.2, 1.4, 1.6, 1.8_

  - [x] 1.2 Add the `wards-config` import ban to `core/eslint.config.mjs`
    - Add the pattern group `**/wards-config/**`, `@ghost-run/wards-config`, and `@ghost-run/wards-config/**` to the existing `no-restricted-imports` rule, next to the `ghost-runner` patterns.
    - Confirm `core/package.json` lists no entry under `dependencies`.
    - _Requirements: 1.1, 1.3_

  - [x] 1.3 Update `.kiro/steering/structure.md` for `wards-config`, `judge/`, and the default wards file
    - Add `wards-config/` to the folder tree (`@ghost-run/wards-config`: wards.yaml parser, validator, printer; a separate workspace package, not under `integrations/`).
    - Add `core/src/judge/` to the `core/` entry (path normalizer, glob matcher, host matcher, content inspector, message builder, pure and dependency-free).
    - Add `apps/ghost-shell/wards.yaml` as the default Ghost Shell wards file.
    - Dependency Direction: `wards-config/` may depend on `core/` only, through its public entry point `@ghost-run/core`; `core/` depends on no other folder and must not import `wards-config/`.
    - "What Goes Where": `wards.yaml` parsing and printing goes to `wards-config/`; default Ghost Shell wards go to `apps/ghost-shell/wards.yaml`. Add a note to the `ghost-gate` hook row that the hook loads wards through `wards-config`.
    - Keep the text English and free of hidden Unicode; the `blacklight-steering` hook runs on save of `.kiro/**`, so resolve any finding it reports.
    - _Requirements: 1.9, 1.2, 1.3_

  - [x] 1.4 Add the two additive type changes to `core/src/types.ts`
    - Add the optional field `case_sensitive?: boolean` to the `path` variant of `Ward` only (absent means `false`).
    - Widen `WardNotice.kind` to `'effect-outside' | 'observed-event' | 'content-inspection' | 'path-escape'`.
    - Leave `WardViolation` as `{ wardId, wardKind, reason }`. Do not redefine `symlink-changed`, `dropped`, `eventId`, `SecretValues`, or `EvaluateInputs`.
    - Add compile-time assertions to `core/tests/types.test-d.ts` for the new field and the widened kind. Existing callers must compile unchanged.
    - _Requirements: 4.3, 4.4, 9.3, 17.3_

  - [x] 1.5 Create the `wards-config` test harness
    - Copy `core/tests/pbt-config.ts` to `wards-config/tests/pbt-config.ts` (the `core/tests` folder is not published), exporting `NUM_RUNS` (at least 100 by default, at least 10,000 when `GHOST_PBT_MODE=nightly`) and the 60 s short-run limit.
    - Add a `wards-config/tests/fixtures/` folder with a shared arbitrary for valid `WardSet` values (all four kinds, valid globs, valid host entries, optional `case_sensitive`).
    - _Requirements: 19.1_

  - [x]* 1.6 Write the import-ban test `wards-config/tests/core-import-ban.test.ts`
    - Write a temporary file under `core/src/` that imports `@ghost-run/wards-config`, run ESLint programmatically on it, assert a `no-restricted-imports` error, and remove the file in `finally`.
    - _Requirements: 1.3_

  - [x] 1.7 Add the claim-scope test helper `core/tests/fixtures/claim-scope.ts`
    - Export `describeClaimed(property: 'P4' | 'P5' | 'P6', run)` that labels the suite with its declared scope: P4 for all worlds (pure logic), P5 only where P1 holds, P6 only where network attempts are recorded.
    - Export a `claimsFor(isolationMode)` function returning `{ p5, p6 }` (the `Claims` type of the Message_Builder, `reason` optional) that is `false` for both in `static-analysis` mode and `true` for the Docker box and the playground modes, matching the `claims` field the hook builds from the ghost-runner `RunResult.isolation`.
    - The helper never asserts P5 or P6 for `static-analysis`; tests that need the lowered claim assert the lowered-claim line instead (`CLAIM_LOWERED_LINE` for `static-analysis` or an absent reason, `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE` for `unsupported-step`).
    - _Requirements: 5.7, 11.8, 17.4, 17.5, 19.10_

- [x] 2. Pure judge modules in `core/src/judge/`
  - [x] 2.1 Implement `judge/bytes.ts` and `judge/sanitize.ts`
    - `bytes.ts`: `utf8Encode` (lone surrogates become U+FFFD, no `TextEncoder` or `Buffer`), `compareCodePoints` (UTF-8 byte order, decision D8; never the default `sort`), and a standard base64 encoder.
    - `sanitize.ts`: `HIDDEN_RANGES` (0000-001F, 007F, 200B-200D, 2060, FEFF, 202A-202E, 2066-2069, E0000-E007F), `hasHiddenChar`, and `sanitizeText(s, maxCodePoints = 120)`: each hidden or control code point becomes `\u{HEX}` in upper case, the result never exceeds the limit (117 code points plus `...`) and never ends inside an escape.
    - No dependency, no I/O, no environment access.
    - _Requirements: 1.1, 1.5, 5.4, 8.6, 17.7, 17.8_

  - [x] 2.2 Implement `judge/normalize.ts`
    - Export `resolvePath` (NFC, split on `/`, stack walk that skips empty and `.` segments and resolves `..` lexically, `escapes` flag for a leading `..`), `normalizePath` (join; `''` for the Copy root), and `foldPath` (one code point to one code point `toLowerCase`, NFC before and after, decision D1).
    - Leading `/` is stripped. No file system access and no symbolic link resolution.
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 4.1_

  - [x]* 2.3 Write property test for path normalization
    - **Property 2: Path normalization is idempotent and spelling-invariant**
    - **Validates: Requirements 2.1, 2.2, 2.5, 2.6, 2.8**
    - File: `core/tests/normalize.test.ts`. Use NFD and NFC spellings written with escapes.

  - [x]* 2.4 Write unit tests for `bytes.ts` and `sanitize.ts`
    - `compareCodePoints` orders an astral character after U+FFFD (unlike UTF-16 order). `sanitizeText` replaces a newline, `\u200B`, a bidi control, and a tag character with `\u{HEX}`, truncates a 200-character value to 117 code points plus `...`, and never splits an escape. Hidden characters are built from escapes only.
    - _Requirements: 17.7, 8.6, 5.4_

  - [x] 2.5 Implement `judge/glob.ts` and `judge/pathset.ts`
    - `validateGlob` with the ten error codes in the validation order of the design (`pattern-too-long`, `empty-pattern`, `invalid-character`, `absolute-pattern`, `unsupported-glob-syntax`, `parent-segment`, then per segment `partial-doublestar`, `unterminated-class`, `empty-class`, `descending-range`), and `normalizePattern`.
    - The matcher is two nested greedy two-pointer loops, no regular expression and no recursion, with an implicit trailing `**` so that a pattern also matches the directory it names and everything below it. The internal function accepts an optional `{ steps }` counter.
    - `compilePathSet(patterns, { caseSensitive })` with a literal fast path (a `Set` of normalized segment strings tested against the path's prefixes, decision D16), lenient compilation (a bad construct degrades to literal characters, decision D15), and a two-spelling test (as written and with `\` replaced by `/`) that reports `matched` and `escapes`.
    - Case-insensitive sets fold literals and match classes against the code point, its single-code-point lower case, and its upper case.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 2.3, 2.4, 4.1, 4.3_

  - [x]* 2.6 Write property test for the glob matcher
    - **Property 3: Glob matcher agrees with a reference matcher and stays within the step bound**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.3**
    - Files: `core/tests/glob.test.ts` and `core/tests/fixtures/glob-oracle.ts` (naive recursive reference matcher). Include a deterministic step-counter check for `a*a*a*a*a*a*a*a*b` against 4,000 `a` characters.

  - [x] 2.7 Implement `judge/host.ts`
    - `parseDestination` (strip scheme, userinfo at the last `@`, path, query, and fragment; bracketed IPv6; port 1 to 65535; remove exactly one trailing `.`; numeric-looking names rejected before the `URL` parser sees them, decision D17), `validateHostEntry` with its nine error codes, `hostEntryKey`, `compileAllowHosts` (exact name, `*.<name>` with exactly one extra leftmost label, IP literal equality with canonical IPv6, port rule), and `redactDestination` (reduce to `host[:port]`, else `sanitizeText`).
    - Read `URL` through `globalThis` with a narrow structural type; when it is missing, name and IPv6 destinations parse to `null` (fail closed). Entries that fail validation compile to a matcher that allows nothing.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x]* 2.8 Write property test for host matching
    - **Property 4: Host matching is spelling-invariant and exact**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 15.2**
    - Files: `core/tests/host.test.ts` and `core/tests/fixtures/host-oracle.ts`. Include a unit test with `URL` removed that expects fail-closed behavior.

  - [x] 2.9 Implement `judge/canary.ts`
    - `extractCanariesDetailed` and `extractCanaries`: candidate (a) is the whole content with trailing `CR` and `LF` bytes removed; candidate (b), for a base name `.env` or starting with `.env.`, is each `KEY=VALUE` or `export KEY=VALUE` value with blanks and one matching quote pair removed; blank and `#` lines are skipped. All work is on bytes.
    - Drop candidates shorter than 8 or longer than 16,384 bytes, de-duplicate by byte equality (first kept), keep at most 256, and count discards into `tooShort`, `tooLong`, `tooMany`. The cap is per file.
    - _Requirements: 9.4, 9.5_

  - [x]* 2.10 Write property test for canary extraction
    - **Property 11: Canary extraction bounds**
    - **Validates: Requirements 9.4, 9.5**
    - File: `core/tests/canary.test.ts`.

  - [x] 2.11 Implement `judge/inspect.ts`
    - `createInspector(payloads)` and `detectKinds`, with `ENCODING_ORDER` and `PAYLOAD_CAP = 65_536`. Truncate each payload to its first 65,536 bytes, then build views V0 (raw), V1 (whitespace removed), V2 (percent-decoded, `+` as space, invalid `%` kept), V3 (V2 whitespace removed), plus lower-case copies for hex.
    - Needles: `raw` in V0; `percent` in V2 only when `raw` is absent from V0; base64 and base64url needles for offsets 0, 1, 2 that cover only characters whose 6-bit groups lie fully inside the Canary, padded or unpadded; lower-case hex in the lower-case views; and, per decision D6, a whitespace-free `raw` needle in V1 and V3 when the Canary contains `CR`, `LF`, space, or tab and the stripped form has at least 8 bytes.
    - Search with a Bloom pre-filter on 8-byte rolling-hash windows (2^18 bits, up to 8 sampled windows) and KMP verification. Return kinds per payload in `ENCODING_ORDER`, each at most once. There is no shared work budget across Canaries (it would break P4).
    - Never place a Canary byte or derived value in a thrown error message.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 9.6, 11.4, 11.5_

  - [x]* 2.12 Write property test for false positives and the 64 KiB cap
    - **Property 10: No false positives and a hard 64 KiB cap**
    - **Validates: Requirements 9.6, 10.9, 19.6**
    - Files: `core/tests/p6-content.test.ts` (the Property 10 part) and `core/tests/fixtures/encoders.ts` (independent encoders: base64 and base64url padded and unpadded, hex in three case forms, percent-encoding, line breaking at 76 and 60 characters).

  - [x] 2.13 Implement `judge/message.ts`
    - `renderMessage(verdict, ctx)` with `RenderContext { wardCount, claims?, seance? }` where `claims?: { p5, p6, reason?: 'static-analysis' | 'unsupported-step' }` is optional (decision D14), `CLAIM_LOWERED_LINE`, `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE`, and `SUGGESTIONS` with the four fixed texts.
    - Templates: `pass` is `GHOST RUN PASSED: all <n> ward(s) cleared.` (`ward` for 1, else `wards`); `warn` is `GHOST RUN NEEDS HUMAN APPROVAL: <k> notice(s) outside the copy or needing review. First: <R(reason)>.`; `block` is line 1 `GHOST RUN BLOCKED by ward <wardId>: <reason>. <suggestion>` for the first violation of the first ward, then at most 3 `Also violated ward <wardId>: <reason>.` lines, then `+<k> more violations. See the seance page.`
    - When `claims` is passed and `claims.p5` or `claims.p6` is `false`, append `CLAIM_LOWERED_LINE` (reason `static-analysis` or absent) or `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE` (reason `unsupported-step`) to every verdict kind; when `claims` is not passed (worlds where P5 and P6 do not apply, for example Ghost Hand), append no claim line. Append ` Seance: <base>/seance/<id>` to the last line when `base` matches `^https?://` (default `http://localhost:5317`, one trailing `/` removed) and `id` matches `^[A-Za-z0-9_-]{1,64}$`; otherwise omit it without throwing.
    - Sanitize every interpolated value with `sanitizeText(x, 120)`, limit each reason to 200 code points (197 plus `...`), limit the message to 1,200 code points by dropping `Also violated` lines from the end first (recomputing the `+<k> more` count), and use the fallback lines for a `block` without violations and a `warn` without notices. The output contains no timestamp, random value, or host-specific text.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 17.8_

  - [x]* 2.14 Write property test for message building
    - **Property 14: Messages are deterministic, bounded, and injection-safe**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 17.1, 17.2, 17.4, 17.5, 17.7, 17.8, 19.10**
    - File: `core/tests/message.test.ts`. Use `claimsFor('static-analysis')` from task 1.7 to require the lowered-claim line, and cover the `unsupported-step` line and the no-`claims` case (no line). Include the exact string of Requirement 16 criterion 5 as an example test.

  - [x] 2.15 Export the judge API from `core/src/index.ts`
    - Export `validateGlob`, `normalizePattern`, `normalizePath`, `foldPath`, `compilePathSet`, `validateHostEntry`, `hostEntryKey`, `compileAllowHosts`, `parseDestination`, `redactDestination`, `extractCanaries`, `createInspector`, `renderMessage`, `CLAIM_LOWERED_LINE`, `SUGGESTIONS`, `sanitizeText`, `compareCodePoints`, and the related types (`GlobError`, `HostEntryError`, `EncodingKind`, `RenderContext`, `Claims`).
    - Confirm that `core/package.json` still has no `dependencies` and that `pnpm --filter @ghost-run/wards-config exec tsc --noEmit` can import `validateGlob` and `validateHostEntry` through `@ghost-run/core`.
    - _Requirements: 1.1, 1.4, 3.8, 7.9_

  - [x]* 2.16 Write unit tests for validators and exact formats
    - One example per `validateGlob` code and per `validateHostEntry` code; the examples `Registry.NPMJS.org.` equals `registry.npmjs.org`, `*.example.test` does not allow `example.test` or `a.b.example.test`, and the decimal address `3221225994` (= `192.0.2.10`, a documentation address) is not allowed by an IPv4 entry.
    - _Requirements: 3.7, 3.8, 7.2, 7.6, 7.8, 7.9_

- [x] 3. Checkpoint - Judge modules complete
  - Run vitest, `tsc --noEmit`, and eslint for `core` and `wards-config`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Engine integration in `core/src/wards.ts`
  - [x] 4.1 Run the existing P4 test and core tests before changing the engine
    - Run `pnpm --filter @ghost-run/core exec vitest --run tests/p4-monotonicity.test.ts tests/wards.test.ts` and then the whole core suite. Record that the existing 43 core tests pass unchanged. Do not edit these test files.
    - Keep this result as the baseline for task 4.6: the existing P4 test and `wards.test.ts` must pass unchanged after `isMoreRestrictive` and `evaluate` change.
    - _Requirements: 15.1, 5.8_

  - [x] 4.2 Refactor path and SQL judgment, notices, and sanitization in `evaluate`
    - Delete the header NOTE of `wards.ts` (Open Item 9). Prepare compiled sets once per call: a `PathSet` per `path` ward (`caseSensitive = ward.case_sensitive === true`), a case-insensitive `PathSet` per `egress` ward `secrets`, ASCII lower-case table sets, and payload keys sorted by `compareCodePoints`.
    - Path ward: judge `file-deleted` as `delete` and `file-overwritten` or `symlink-changed` as `overwrite` when the operation is in `deny`; ignore `file-created`, unknown kinds, and changes without a string `path`; de-duplicate by (ward, normalized path, operation); sort by `compareCodePoints` of the normalized path then operation; reason `would <op> protected path <sanitized path as written>` (the first Change in step order supplies the path as written). A path with a leading `..` matches no ward and adds one `path-escape` notice per distinct sanitized path (at most 20) when a `path` ward exists.
    - SQL ward: only well-typed `sql-row-count` changes count; rows lost are `dropped === true ? max(0, rowsBefore) : max(0, rowsBefore - rowsAfter)`, summed per ASCII-lower-case table name across all steps; one violation when the total exceeds `max_rows_lost`. Per decision D18 the reason is `would delete <n1> rows from <t1>[, <n2> rows from <t2>...]`, tables sorted by lower-case name and printed in the ward's spelling, numbers with `,` thousands separators, then ` (max allowed <m>)` only when `max_rows_lost > 0`. The scenario 1 reason is exactly `would delete 1,206 rows from users`.
    - Notices keep their text and are ordered `effect-outside`, `observed-event`, `content-inspection`, `path-escape`, each by (`stepIndex`, `reason`). Pass every reason, destination, and path through `sanitizeText`; pass destinations through `redactDestination`. Physics judgment is unchanged apart from sanitizing `variantId` and contact names.
    - _Requirements: 2.3, 2.4, 4.1, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 17.3, 17.8, 1.5_

  - [x] 4.3 Replace the egress judgment with the Host_Matcher and the behavior cap
    - Remove `hostOf` and use `compileAllowHosts`. `firstRead` is the smallest `stepIndex` of `secret-read` events whose path matches the ward's `secrets` `PathSet` (descendants included).
    - Add one violation per `network-attempt` with `stepIndex >= firstRead` (not `>`) whose destination is not allowed, with the reason `network attempt to <redacted destination> at step <n> after secret read at step <firstRead>; host not in allow_hosts`. Sort by (`stepIndex`, redacted destination), keep the first 20, then add `<k> more network attempts not listed`. No violation when no matching `secret-read` exists; observed events still produce warn notices.
    - _Requirements: 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 4.5_

  - [x] 4.4 Add content inspection, notices, and the leak guard to the egress judgment
    - Group `secretValues` entries by `normalizePath(key)`; skip malformed entries (non-string key, non-`Uint8Array` value) with a `content-inspection` notice naming the sanitized key and no content, and never throw. For each egress ward, take the files whose path matches `secrets`, sorted by path, extract Canaries, and call the inspector once per file.
    - Add one violation per payload hit: `payload of event <eventId> contains a value from secret file <path> (encoding: <kinds>)`, sorted by (`eventId`, path), at most 20 then `<k> more payload hits not listed`, listed after the behavior violations of the same ward. A hit needs no `secret-read` event and ignores `allow_hosts`. Inspect a payload whose key has no matching event and add the notice `payload <eventId> has no matching observed event`.
    - Notices: `content inspection did not run for ward <id>: no secret values were provided` only when the caller passed `inputs` with an absent or empty `secretValues` and a matching `secret-read` or any payload exists (existing `wards.test.ts` cases require this narrowing); one notice per (file, reason) for discarded candidates only when at least one payload exists (decision D5). Wrap only the inspector call in a try that yields the notice `content inspection failed` (no message text) and at least `warn`.
    - Leak guard: when any entry yielded candidates, run all Canaries of all entries over the UTF-8 bytes of every string field in the violations and notices (`reason`, `destination`, `path`, `wardId`) and replace a string with a hit by `[redacted: contains a secret value]`. It changes text only, never the verdict class. The engine never retains, mutates, or serializes `secretValues`.
    - The number and size of `secretValues` entries are capped by ghost-runner (16 files, 65,536 bytes per file, diagnostic `secret-values-capped`). Reference that cap in a code comment and do not re-implement it.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 17.6_

  - [x] 4.5 Extend `isMoreRestrictive` with normalized keys and `case_sensitive`
    - Compare `path.paths` and `egress.secrets` by `normalizePattern` (no case folding, decision D11), `egress.allow_hosts` by `hostEntryKey` (reversed direction, as today), and `sql.tables` by ASCII lower-case. Treat `case_sensitive` as `value === true`: `true` to absent or `false` is tighter, the reverse is looser, absent versus `false` is equal.
    - Keep everything else unchanged: wards paired by `id`, duplicate ids refuse, a different `kind` for one `id` is a loosening, removing a ward loosens, adding a ward tightens.
    - Add a code comment stating that the predicate is sound and incomplete (it compares sets by string containment, so `data/**` versus `data/**` plus `data/x`, `*.example.test` versus `a.example.test`, and a port entry versus a portless entry may return `false`).
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.8_

  - [x] 4.6 Run the existing P4 test again after the `isMoreRestrictive` change
    - Run `pnpm --filter @ghost-run/core exec vitest --run tests/p4-monotonicity.test.ts tests/wards.test.ts`, then the whole core suite, and compare with the baseline of task 4.1. All existing tests must pass without any edit to `core/tests/p4-monotonicity.test.ts` or the existing cases of `core/tests/wards.test.ts`. If a test fails, fix `wards.ts`, not the test.
    - _Requirements: 15.1, 5.8_

  - [x]* 4.7 Write property test for path ward violations
    - **Property 6: Path ward violations agree with the reference matcher**
    - **Validates: Requirements 5.3, 5.4, 5.8, 4.3**
    - File: `core/tests/path-ward.test.ts`. Reuse `core/tests/fixtures/glob-oracle.ts`; shuffle the change lists.

  - [x]* 4.8 Write property test for SQL row-loss accounting
    - **Property 7: SQL row-loss accounting**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6**
    - File: `core/tests/sql-ward.test.ts`. Include the example of 1,206 rows lost against `max_rows_lost: 0` and the multi-table joining of decision D18.

  - [x]* 4.9 Write property test for path ward protection completeness (P5)
    - **Property 5: Path ward protection completeness (P5, judgment half)**
    - **Validates: Requirements 4.1, 5.1, 5.2, 5.5, 5.6, 19.2, 19.3, 19.4**
    - Files: `core/tests/p5-protection.test.ts` and `core/tests/fixtures/fs-world.ts` (deterministic in-memory `World<FsState, FsAction>` with `rm`, `rm-recursive`, `rm-glob`, `find-delete`, `mv`, `overwrite`, `ln`, and `script`, using its own independent path resolver and reporting resolved real paths, a move as delete plus create).
    - Wrap the suite in `describeClaimed('P5', ...)` from task 1.7: the claim applies only where P1 holds and is not asserted for `static-analysis` mode. The fixture world models symbolic links only through the paths it reports, and the test does not claim that the engine resolves links.

  - [x]* 4.10 Write property test for the egress behavior criterion (P6, action)
    - **Property 8: Secret read then unapproved network attempt blocks (P6, action criterion)**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.6, 11.7, 19.5**
    - File: `core/tests/p6-egress.test.ts`. Include a same-step case (`j == i`), the cap of 20 plus `<k> more`, and transformed payloads (gzip-like, XOR, reversed, split) that content inspection does not report while the run is still `block`. Wrap in `describeClaimed('P6', ...)`: claimed only where network attempts are recorded, not for `static-analysis` mode.

  - [x]* 4.11 Write property test for content inspection of every encoding (P6, content)
    - **Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)**
    - **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    - File: `core/tests/p6-content.test.ts` (the Property 9 part). Use the independent encoders of task 2.12, base64 offsets 0, 1, 2, prefixes and suffixes of 0 to 64 bytes, and line-broken base64 and hex. Include payloads sent to a host in `allow_hosts` (must still be `block`), with and without a `secret-read`, and a multi-line Canary that exercises decision D6. Wrap in `describeClaimed('P6', ...)`.

  - [x]* 4.12 Write property test for refined ward monotonicity (P4)
    - **Property 1: Ward monotonicity with the refined rules (P4)**
    - **Validates: Requirements 4.6, 11.2, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
    - File: `core/tests/p4-refined-monotonicity.test.ts`. The existing `p4-monotonicity.test.ts` stays untouched. Extend the generators with glob patterns, bypass spellings, host entries with ports and wildcards, `case_sensitive` values, encoded-Canary payloads, and `secretValues` bound to secret paths. Check soundness only, require at least 15% of pairs to show a strictly higher verdict, and run at least 100 examples in a short run. Wrap in `describeClaimed('P4', ...)` (all worlds).

  - [x]* 4.13 Add example tests to `core/tests/wards.test.ts`
    - Append new cases only (do not edit existing cases): glob and normalized spellings, the case policy default and `case_sensitive: true`, `symlink-changed` under a glob ward, `dropped` tables, allow-host forms with ports and IPv6, the content violation reasons, the `content-inspection` and `path-escape` notices, and the allowed-host-after-secret-read case that is `warn` with two notices and no violation.
    - _Requirements: 4.3, 5.2, 6.4, 7.4, 8.5, 9.3, 11.4, 2.3_

  - [x]* 4.14 Write performance tests `core/tests/perf.test.ts`
    - Glob step-counter bound for `a*a*a*a*a*a*a*a*b` against 4,000 `a` characters (deterministic, with a loose wall-clock check skipped in a short run); inspection of 16 payloads of 64 KiB against 256 Canaries of 4 KiB within 2.0 s; evaluation of 10,000 Changes, 100 observed events, 16 payloads of 64 KiB, and 256 Canaries within 3.0 s. Also run the largest input the ghost-runner caps allow (16 files of 65,536 bytes each) as a regression check, without re-implementing the cap.
    - _Requirements: 3.9, 10.10, 19.11_

- [x] 5. Checkpoint - Engine integration complete
  - Run vitest, `tsc --noEmit`, and eslint for `core` and `wards-config`. Confirm the existing P4 test and the existing `wards.test.ts` cases pass unchanged and that `core/package.json` still has no `dependencies`. Ensure all tests pass, ask the user if questions arise.

- [x] 6. The `wards-config` package
  - [x] 6.1 Add the `yaml` dependency and the README dependency table row
    - Add `yaml` pinned to exactly `2.9.1` to `wards-config/package.json` `dependencies` and install it. Confirm on the day of installation that the license in the package metadata is ISC (permissive), and record the confirmation date.
    - Record the install facts, the license confirmation date, and the check that the `yaml` `exports` default condition is a browser build in a new English section of `docs/measurements.md` (not in the devlog). Create `README.md` at the repository root if it does not exist, or extend it without removing existing rows, with a dependency table with the columns library, version, license, used by, and purpose. Add the row `yaml` (eemeli), `2.9.1`, ISC, `wards-config`, YAML 1.2 parser with source ranges. Also list `vitest`, `fast-check`, `typescript`, and every other dependency that any package in the workspace already uses, each with its recorded license, and a license note that every dependency is permissive (MIT, BSD, ISC, or Apache-2.0). Add `core` with the entry "no runtime dependencies".
    - _Requirements: 1.7, 13.10_

  - [x] 6.2 Implement `wards-config/src/types.ts` and `src/format.ts`
    - `ConfigErrorCode` (including the new code `unsafe-command-entry`), `ConfigError` (`code`, `message`, `line?`, `column?`, `wardId?`, `field?`, `detail?`), `ConfigWarning` (`empty-ward-set`, `catch-all-pattern`), and `ParseResult` (`{ ok: true, wardSet, safeCommands: string[], warnings }` or `{ ok: false, errors }`; the error result has no `wardSet` and no `safeCommands`). `core` `WardSet` stays unchanged.
    - `formatConfigError(e)` returns exactly `wards.yaml:<line>:<column>: [<code>] ward "<wardId>" field "<field>": <message>`, omits the `ward` part when `wardId` is unknown and the `field` part when no field is involved, and prints `wards.yaml: [<code>]...` when there is no position. Pure string assembly.
    - _Requirements: 13.1, 13.3, 12.1, 12.13_

  - [x] 6.3 Implement `wards-config/src/parse.ts` and `src/schema.ts`
    - `parseWards(text)` never throws; the whole body runs in a `try` that converts any exception (including `RangeError`) to one `yaml-syntax-error` at line 1. Pipeline: reject input over 262,144 bytes with `input-too-large` before parsing; pre-scan for indentation over 64 spaces or more than 64 consecutive `[` or `{` (`yaml-feature-unsupported`, decision D19); `parseDocument` with core schema, YAML 1.2, `merge: false`, `uniqueKeys: false`, `maxAliasCount: 0`, and a `LineCounter`; walk the AST without calling `toJS`.
    - Reject anchors, aliases, explicit tags, the `<<` key, and depth over 8 with `yaml-feature-unsupported`; report a repeated key as `duplicate-key` naming the line of the first occurrence.
    - Table-driven schema per kind (`path`: `deny`, `paths`, `case_sensitive`; `sql`: `tables`, `max_rows_lost`; `egress`: `secrets`, `allow_hosts`; `physics`: `min_success_rate`, `max_contact_force_n`, `forbidden_contacts`) with the limits of Requirement 12, using `validateGlob` and `validateHostEntry` from `@ghost-run/core` and `normalizePattern` and `hostEntryKey` for `duplicate-entry`. Report `missing-field`, `unknown-field`, `wrong-type`, `out-of-range`, `duplicate-id`, `invalid-glob`, `invalid-host`, `invalid-character`, `duplicate-entry`, `unknown-kind`, `root-not-mapping`, `unknown-root-field`, and `wards-not-sequence`, each at the line of the node named in Requirement 13 criterion 2.
    - Sort errors by (`line`, `column`, `code`), keep the first 50, and append `too-many-errors` when more exist. Return `wardSet` only when no error exists, keep document order, and leave absent optional fields absent. Error messages contain only the field name, id, code, and an entry truncated to 80 characters through `sanitizeText`. Emit the `empty-ward-set` and `catch-all-pattern` warnings.
    - Root mapping: required `wards`, optional `safe_commands`, any other root key is `unknown-root-field`. Validate `safe_commands` as in Requirement 12 criterion 13 in this per-entry order: `wrong-type` (not a list, or a non-string item), `invalid-character`, `out-of-range` (entry length 0 or over 256, more than 256 entries), `unsafe-command-entry` (outside `^[A-Za-z0-9_./:=@%+,-]+( [A-Za-z0-9_./:=@%+,-]+)*$`, with `detail` `charset` or `spacing`), `duplicate-entry` (exact string equality, message names the first line). Return `safeCommands` in document order, `[]` when the key is absent. Messages carry the field name `safe_commands[<i>]` and never the entry text.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.13, 12.14, 13.1, 13.2, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [x] 6.4 Implement `wards-config/src/print.ts`
    - `printWards(wardSet, options?: { safeCommands?: readonly string[] })` writes `wards:` then, per ward, `id`, `kind`, and the kind's fields in the order of Requirement 12 criteria 4 to 7, two-space indentation, flow sequences, an empty list as `[]`, numbers by `String(n)` (`-0` as `0`), and one trailing newline. When `options.safeCommands` is present and non-empty it appends one top-level line after the last ward, `safe_commands: [<e1>, <e2>, ...]` (flow sequence, same string rule); an absent or empty list prints no key.
    - A string prints plain only when it matches `[A-Za-z_][A-Za-z0-9_.-]*` and is not `true`, `false`, or `null` in any case form the core schema reads; otherwise it prints double-quoted with `\uXXXX` escapes for control, DEL, C1, U+2028, U+2029, BOM, and the hidden ranges, and `\UXXXXXXXX` for astral hidden characters. The function writes no file and does not preserve comments.
    - _Requirements: 14.1, 14.4, 14.5, 12.13_

  - [x] 6.5 Implement `wards-config/src/load.ts`
    - `loadWardsFile(path)` (in `src/load.ts`, re-exported only by `src/node.ts`) uses `node:fs/promises`: `stat` first (over 262,144 bytes gives `input-too-large` without reading), then `readFile`, then `TextDecoder('utf-8', { fatal: true })`, then `parseWards`. A read or decode failure gives `file-unreadable` with the path in `message` and no line.
    - File I/O happens only in this function, which receives the path as an argument, and `load.ts` is the only source file that imports a Node built-in.
    - _Requirements: 12.12, 1.6, 1.10_

  - [x] 6.6 Export the public API from `wards-config/src/index.ts`
    - Default entry `src/index.ts` exports `parseWards`, `printWards`, `formatConfigError`, and the types `ConfigError`, `ConfigErrorCode`, `ConfigWarning`, `ParseResult`, and nothing that reaches `load.ts`. `src/node.ts` exports `loadWardsFile`. Set the `package.json` `exports` map to exactly `"."` and `"./node"` (each with `types` and `import` conditions that point to the built output under `dist/src/`), and alias both subpaths to the source files in `vitest.config.ts` and `tsconfig.json` `paths`. Add the `build` output so `integrations/*` can import the package.
    - Add the second ESLint block to `wards-config/eslint.config.mjs`: for `src/**/*.ts` except `src/load.ts` and `src/node.ts`, `no-restricted-imports` bans `node:*` and the bare Node built-in names (list in the design). Keep the existing core-entry-point restriction in the same block set.
    - Confirm that the package imports `core` only through `@ghost-run/core`.
    - _Requirements: 1.4, 1.10, 1.11, 12.1, 12.12, 13.3, 14.1_

  - [x]* 6.7 Write property test for the print and parse round trip
    - **Property 17: Printing and parsing round trip**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 12.13**
    - File: `wards-config/tests/roundtrip.test.ts`. Strings such as `".env"`, `"data/**"`, `"0"`, and `"true"` must be quoted in the printed text. Generate valid `safeCommands` lists too (0 to 256 entries over the charset, no duplicates): `parseWards(printWards(ws, { safeCommands: sc }))` returns equal `wardSet` and `safeCommands`, printing again is identical, an empty list prints no `safe_commands` key, and a non-empty list prints one top-level `safe_commands: [...]` line after the last ward.

  - [x]* 6.8 Write smoke tests `wards-config/tests/smoke.test.ts`
    - The README contains the `yaml` row with name `yaml`, version `2.9.1`, and license `ISC`; `wards-config/package.json` lists only `yaml` and `@ghost-run/core` under `dependencies`; `core/package.json` has no `dependencies`; the `core` ESLint config contains the `wards-config` patterns; `pnpm-workspace.yaml` lists `wards-config`.
    - Entry-point checks: the `exports` map of `wards-config/package.json` has exactly the subpaths `"."` and `"./node"`, each with `types` and `import` pointing under `dist/`; the ESLint config contains the `node:*` and bare built-in ban for the default-entry source files; a walk of the import graph of `src/index.ts` (relative imports, re-exports, and dynamic `import(` specifiers) finds no Node built-in specifier and never reaches `load.ts` or `node.ts`; the Default_Entry exports no `loadWardsFile` and the Node entry does.
    - One example document per `ConfigErrorCode` (including `unsafe-command-entry`) and the sample strings of `formatConfigError`.
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 1.10, 1.11, 12.13, 13.3, 13.10_

- [x] 7. Checkpoint - wards-config complete
  - Run vitest, `tsc --noEmit`, and eslint for `core` and `wards-config`. Ensure all tests pass, ask the user if questions arise.

- [x] 8. Default `wards.yaml` and scenario verification
  - [x] 8.1 Create `apps/ghost-shell/wards.yaml`
    - Write exactly the three wards of Requirement 18 criterion 2 in this order: `protect-data` (`path`, `deny: [delete, overwrite]`, `paths: ["data/**", "db/*.sqlite", ".env"]`), `no-data-loss` (`sql`, `tables: [users, orders]`, `max_rows_lost: 0`), and `no-secret-egress` (`egress`, `secrets: [".env", "**/*.pem"]`, `allow_hosts: [registry.npmjs.org]`).
    - No `physics` ward, no `github.com`, and only reserved domains plus `registry.npmjs.org`. Commit no `.env` file; fixture `.env` content is built in test code from Canary strings.
    - After the wards add the top-level key `safe_commands: [ls, pwd, cat, "git status", "git diff"]` (exactly these five entries, Open Item 16 resolved; matching rules are owned by the kiro-integration spec). The file keeps exactly the three wards.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.12, 18.13_

  - [x]* 8.2 Write the default-file test `wards-config/tests/default-wards.test.ts`
    - Load `apps/ghost-shell/wards.yaml` (resolve the path relative to the test file, so no package imports another package's source) with `loadWardsFile` (import it from `@ghost-run/wards-config/node`, or from `../src/node.ts` through the relative source alias), require `ok: true`, require exactly the three wards in order with the exact values, and require `safeCommands` equal to `["ls", "pwd", "cat", "git status", "git diff"]`.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.13_

  - [x]* 8.3 Write the scenario verification test `wards-config/tests/scenarios.test.ts`
    - Run the rows of the verification table of `design.md` on synthetic `GhostReport` values with the default file, without Docker: row 1 (`DROP TABLE users`, 1,206 rows, `block`, first violation `would delete 1,206 rows from users`) and row 1b (backup copy plus soft delete, `pass`); row 2 (`rm -rf ./data ./build`, `block`, one violation per deleted path under `data/`; compute the expected count from the Changes of the fixture instead of hard-coding it, because the playground also emits folder-entry deletions), row 2b (`rm -rf ./build`, `pass`), and row 2c (`rm -rf ./DATA`, `block`); row 3 (`curl -d @.env`, `secret-read` and `network-attempt` to `setup-check.example:443` at the same step, `block`), row 3b (plus a `secretValues` entry and a payload with `sk-CANARY-abc123`, also the content violation with encoding `raw`), row 3c (allowed host after the read, `warn` with two notices and no violation), and row 3d (a Canary payload sent to `registry.npmjs.org:443`, `block`); row 4 (`npm test`, `pass`); row 5 (`npm run clean`, `block` by `protect-data` from the `file-deleted` Changes under `data/`).
    - Check the exact `renderMessage` strings of rows 1 and 2 against the design (with `seance.id = '42'`, the default base, and `claims = { p5: true, p6: true }`), and that the same report with `claimsFor('static-analysis')` gets the lowered-claim line. P5 and P6 are not asserted as claimed for `static-analysis`.
    - _Requirements: 18.5, 18.6, 18.7, 18.8, 18.9, 18.10, 18.11, 16.5, 17.5_

- [x] 9. Checkpoint - Default wards and scenarios verified
  - Run vitest, `tsc --noEmit`, and eslint for `core` and `wards-config`. Ensure all tests pass, ask the user if questions arise.

- [x] 10. Leak, determinism, and error-line properties; documentation
  - [x]* 10.1 Write property test for secrecy of all outputs
    - **Property 12: No secret value in any output**
    - **Validates: Requirements 9.9, 9.10, 11.4, 11.5, 17.6, 19.8**
    - File: `core/tests/leak.test.ts`. Place the Canary also in destinations, paths, event ids, and table names in raw, base64 (standard and URL-safe, padded and unpadded), hex (both cases), and percent forms; check `JSON.stringify` of the verdict, the `renderMessage` output, and thrown error messages for malformed or absent `secretValues`. Use Canaries of the form `sk-CANARY-` plus generated alphanumerics.

  - [x]* 10.2 Write property test for determinism, order invariance, and totality
    - **Property 13: Evaluation is deterministic, order-invariant, and total**
    - **Validates: Requirements 1.5, 5.4, 8.6, 9.2, 9.3, 9.10, 11.7, 17.3**
    - File: `core/tests/engine-determinism.test.ts`. Shuffle changes within a step, observed events, and the insertion order of `payloads` and `secretValues`; include hostile casts and malformed `secretValues` entries; compare with a reference implementation of the old rules for reports without glob characters, symlink changes, or ports when `inputs` is absent.

  - [x]* 10.3 Write property test for configuration defects reported at their line
    - **Property 15: Every configuration defect is reported at its line with the expected code**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.13, 13.1, 13.2, 13.9, 13.11**
    - File: `wards-config/tests/parse-errors.test.ts`. Print a valid `WardSet`, apply one mutation (unknown kind, missing field, extra field, wrong type, duplicate id, out-of-range value, invalid glob, invalid host, invalid character, duplicate entry, and the `safe_commands` mutations: non-list value, non-string item, hidden character, over-long entry, 257 entries, an entry with a shell operator such as `;`, `&&`, `|`, `>`, a backtick, `$`, or a quote, and a duplicate entry) to a known node, and require the expected code at the expected line (key line for `unknown-field`, ward mapping line for `missing-field`, `unknown-kind`, `duplicate-id`; the item line for `safe_commands` entry errors, the list value line for a non-list value and for too many entries; codes `wrong-type`, `invalid-character`, `out-of-range`, `unsafe-command-entry`, `duplicate-entry`). Also require that no error message contains the entry text. Hidden characters in the mutated text are written as escapes.

  - [x]* 10.4 Write property test for parser totality and safety
    - **Property 16: parseWards is total and safe on hostile input**
    - **Validates: Requirements 12.1, 13.4, 13.5, 13.6, 13.7**
    - File: `wards-config/tests/parse-safety.test.ts`. Cover random text, truncated valid documents, anchors, aliases, merge keys, tags, repeated keys (including a repeated `safe_commands`), a 256 KiB `safe_commands` list, deep nesting, and sizes up to 262,144 bytes plus one. Add a loose timing check that a 262,144-byte input completes (Requirement 13.8 on the Reference_Machine is checked as a smoke, not as a property).

  - [x] 10.5 Write the README sections for claims, policies, and limits
    - Add: the case policy and its rationale (APFS case-insensitive by default, over-matching fails safe, possible Linux false positive, `case_sensitive: true` opt-out); the precondition under which P5 holds for symbolic links and moves (the world reports actual resolved paths; the Differ walks with `lstat`); the list of what content inspection does not catch (compression, encryption, multi-layer encodings, splitting over requests, DNS one character at a time, values shorter than 8 bytes, payload bytes beyond 64 KiB), which only the behavior criterion catches; the soundness-without-completeness limit of `isMoreRestrictive`; that `printWards` does not preserve comments; the location of the default file (`apps/ghost-shell/wards.yaml`, with the world-contract note that the repo world uses it instead of `worlds/<name>/wards.yaml`); and the claim table (P4 all worlds, P5 where P1 holds, P6 where network attempts are recorded, neither P5 nor P6 in Plan B, with the lowered-claim wording `CLAIM_LOWERED_LINE`).
    - Keep the text English, free of hidden Unicode, and use reserved domains only.
    - _Requirements: 4.2, 5.5, 5.7, 11.6, 11.8, 14.4, 15.3, 17.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Run vitest (short run and explicit profile), `tsc --noEmit`, and eslint for `core` and `wards-config`. Confirm the existing P4 test passes unchanged, `core/package.json` has no `dependencies`, the README table lists `yaml` 2.9.1 (ISC), no hidden Unicode appears literally in any committed file, and no real secret is committed. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP. Core implementation tasks are not optional.
- Properties 1 to 17 keep the numbering and titles of `design.md`. Properties 5 and 8 to 12 are the judgment halves of P5 and P6. P5 is claimed only where P1 holds, P6 only where network attempts are recorded, and neither in Plan B (`static-analysis`), where the Message_Builder adds the lowered-claim line.
- Task 4.1 and task 4.6 bracket every change to `isMoreRestrictive` and `evaluate` with a run of the existing P4 test and the existing `wards.test.ts` cases, which must pass unchanged. The new refined P4 test is a separate file (task 4.12).
- The `secretValues` cap (16 files, 65,536 bytes per file, diagnostic `secret-values-capped`) is owned by ghost-runner. This plan references it and does not implement it.
- The Docker-box run of the five scenarios loads `apps/ghost-shell/wards.yaml` in ghost-runner Requirement 18 and is not part of this plan.
- Nightly-timeout handling: the long property tests yield to the event loop through `makeYielder` in `core/tests/pbt-config.ts` and run as `fc.asyncProperty`, so a Nightly_Run does not starve the vitest worker (no `onTaskUpdate` timeout).
- Performance fix: `prepareCanaries` got a leak-guard performance fix (the leak guard no longer rebuilds work per output string), keeping task 4.14 inside its time limits.
- Kiro integration: `ghost-gate` expects the `warn` template of `renderMessage` for `warn` verdicts that have notices only; this is covered by the examples of task 4.13 in `core/tests/wards.test.ts`. Scenario tests (task 8.3) compute violation counts from the Changes instead of hard-coding them, because the playground also emits folder-entry deletions.
- Measurements and records go to `docs/measurements.md` (English). `docs/devlog.md` is a separate log kept outside this plan and is not edited by these tasks.
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "1.7", "2.1", "2.2"] },
    { "id": 2, "tasks": ["1.6", "2.3", "2.4", "2.5", "2.7", "2.9", "2.11", "2.13"] },
    { "id": 3, "tasks": ["2.6", "2.8", "2.10", "2.12", "2.14", "2.15", "2.16"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.3", "4.7", "4.8", "4.9"] },
    { "id": 7, "tasks": ["4.4", "4.10"] },
    { "id": 8, "tasks": ["4.5", "4.11"] },
    { "id": 9, "tasks": ["4.6"] },
    { "id": 10, "tasks": ["4.12", "4.13", "4.14"] },
    { "id": 11, "tasks": ["6.1", "6.2"] },
    { "id": 12, "tasks": ["6.3", "6.4"] },
    { "id": 13, "tasks": ["6.5", "6.7", "6.8"] },
    { "id": 14, "tasks": ["6.6"] },
    { "id": 15, "tasks": ["8.1"] },
    { "id": 16, "tasks": ["8.2", "8.3"] },
    { "id": 17, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] }
  ]
}
```

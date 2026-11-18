# Implementation Plan: possession

## Overview

This plan implements the possession detector of Ghost Run+ in `core/`: a pure, dependency-free module under `core/src/possession/` (blacklight scan, sanitize, provenance records, red thread, scan entry point), two generated Unicode tables with an offline-capable generator, a Node-only file adapter `core/possession-node.ts`, and the tooling and tests around them. The language is TypeScript. Property tests use `vitest` and `fast-check` and keep the numbering of `design.md` (Properties 1 to 22).

Work order: tooling and tsconfig files first, then the table generator and tables, then the pure module bottom-up (classification, emoji and tag-sequence rules, scanner, sanitize, provenance, red thread, entry point, public exports), then the Node adapter, then test infrastructure, property tests, example tests, Node-only tests, documentation, and a final checkpoint.

## Conventions

- **Hidden characters.** No file of this feature contains a literal hidden character, tag character, flag emoji, or HTML comment opener. Source, tests, the generator, and the generated tables write them as numbers (`String.fromCodePoint(0x200B)`, hex tables) or `\u` escapes. The opener is always built as `String.fromCodePoint(0x3C, 0x21, 0x2D, 0x2D)`.
- **Optional marking.** The repository convention (`core-contract/tasks.md`, `ghost-runner/tasks.md`) does not mark test tasks optional, so no task here carries the `*` postfix. Test sub-tasks are required.
- **Property tags.** Each property test carries the comment `Feature: possession, Property <n>: <title>`, followed by its `Validates` line, and uses `NUM_RUNS` and `PBT_TIMEOUT` from `core/tests/pbt-config.ts`, plus `deepEqual` and `createCounter` from `core/tests/pbt-stats.ts` for non-vacuity counters.
- **Test locations.** Tests that need no Node API live in `core/tests/` (type-checked by the unchanged `core/tsconfig.json`, `types: []`). Tests that import `node:*` live in `core/tests-node/` (type-checked by the new `core/tsconfig.test.json`). `core/tsconfig.json` is never changed by this plan.
- **Property test files.** Each property test is its own file under `core/tests/possession/` (named `prop-<nn>-<slug>.test.ts`) so that property tasks can run in parallel. The P7 group of `design.md` (Properties 1, 2, 3, 4, 20, 21) is therefore split across files instead of one `p7-hidden-text.test.ts`.
- **Test data.** Canary values only (for example `sk-CANARY-abc123`) and reserved domains only (`.example`, `.test`, `.localhost`, `.invalid`).
- **Scope of this plan.** Coding tasks only. The hooks (`blacklight-steering`, `ghost-log`), the MCP wiring, and UI are other specs.

## Tasks

- [x] 1. Package tooling, tsconfig files, and ESLint
  - [x] 1.1 Update `core/package.json` and add the three new tsconfig files
    - Add the `exports` entry `./possession-node` (types and import pointing at the built `possession-node` output) next to the existing entry, `"sideEffects": false`, the script `"gen:emoji": "node scripts/gen-emoji-table.mjs"`, and `@types/node` `^20.19.0` as a devDependency only. Add nothing under `dependencies`.
    - Create `core/tsconfig.possession.json` (extends `tsconfig.json`, `lib: ["ES2022"]`, `types: []`, include `src/possession`), `core/tsconfig.node.json` (extends `tsconfig.build.json`, `types: ["node"]`, include `possession-node.ts`, emits the adapter), and `core/tsconfig.test.json` (extends `tsconfig.json`, `types: ["node"]`, `noEmit: true`, include `tests-node` and `possession-node.ts`).
    - Do NOT edit `core/tsconfig.json` (it keeps `types: []` and `include: ["src", "tests", "verify.ts"]`).
    - The `typecheck`, `lint`, and `build` script changes that involve `tsconfig.node.json`, `tsconfig.test.json`, and `possession-node.ts` are moved to task 4.1, because `possession-node.ts` does not exist before 4.1 and `ghost-runner` builds against core's build script. Here `typecheck` becomes `tsc --noEmit && tsc --noEmit -p tsconfig.possession.json` (the possession tsconfig also includes `src/types.ts` so it never has an empty input set), while `lint` and `build` stay unchanged (`build` remains `tsc -p tsconfig.build.json`).
    - Confirm `vitest.config.ts` needs no change (default include finds `tests-node/**/*.test.ts`; `typecheck.include` stays `tests/**/*.test-d.ts`).
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Rewrite `core/eslint.config.mjs` with the generated Node built-in ban
    - Import `builtinModules` from `node:module` and derive `BUILTIN_EXACT`, `BUILTIN_BASES`, an `escape` helper, and `BUILTIN_RE` (matches `node:*`, a bare built-in name, and any subpath of a built-in name).
    - Declare shared constants once (`SYNTAX_BAN`, the `no-restricted-imports` option object builders) and spread them into every block, because a later flat-config block replaces earlier options instead of merging them.
    - Static forms: `no-restricted-imports` with `patterns: [{ group: ['node:*'] }, ...]` plus `paths: BUILTIN_EXACT.map(...)` (exact specifier match, so `./fs.js` is never matched), keeping the existing workspace-folder bans (`ui`, `apps`, `integrations`, `ghost-runner`).
    - Dynamic and CommonJS forms via `no-restricted-syntax` selectors: `ImportExpression` with a built-in source, `ImportExpression` with a non-literal source, `require` call with a built-in or non-literal argument, `TSImportEqualsDeclaration` with a built-in module reference, and `TSImportType` with a built-in argument.
    - Block 1 `src/**/*.ts`: the built-in ban plus workspace bans. Block 2 `src/possession/**/*.ts`: block 1 plus `no-restricted-globals` (`process`, `Buffer`, `require`, `window`, `document`, `TextEncoder`, `TextDecoder`, `URL`, `console`, `fetch`, `crypto`, `performance`, `setTimeout`, `setInterval`, `Date`), `no-restricted-properties` for `Math.random`, `no-restricted-syntax` entries for `new Function(...)`, `eval(...)`, and any import specifier that does not start with `./` or is not `../types.js`. Block 3 `possession-node.ts`: workspace bans and the unprefixed built-in `paths` ban, but no `node:*` pattern.
    - _Requirements: 1.2, 1.3, 1.6, 1.7_

  - [x] 1.3 Create the `core/tests-node/` folder and relocate any Node-needing tests
    - Create `core/tests-node/` with a `.gitkeep`.
    - Check the existing `core/tests/**` files for imports of `node:*` modules or Node globals. If any exist, move them to `core/tests-node/` (fix relative imports); otherwise record in the task result that none needed moving. Existing P1 to P4 tests, fixtures, `verify.test.ts`, `wards.test.ts`, and `types.test-d.ts` stay under `core/tests/`.
    - Run `pnpm --filter @ghost-run/core typecheck` and the existing tests to confirm nothing regressed.
    - _Requirements: 1.4, 1.5_

- [x] 2. Unicode tables and generator
  - [x] 2.1 Write `core/scripts/gen-emoji-table.mjs` and `core/scripts/emoji-data.pin.json`
    - New dev-time script, Node 20+, no dependency, ASCII only, no literal hidden character or emoji. Imports only `node:fs`, `node:crypto`, and global `fetch`.
    - Inputs: `--source <dir>` (a local directory with `emoji-data.txt` and `emoji-sequences.txt`, no network call) or, when absent, `fetch` of the URLs built from the pinned version (`https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt` and `https://www.unicode.org/Public/emoji/16.0/emoji-sequences.txt`).
    - Compute SHA-256 of each raw source file. When the pin file holds a hash for that file, require a match and exit non-zero without writing otherwise. With `--update-pin`, write both hashes. Pin file fields: `unicodeVersion`, `emojiVersion`, and per file `url` and `sha256`.
    - Parse `emoji-data.txt` lines `<lo>[..<hi>] ; Extended_Pictographic # ...`, sort, and merge overlapping and adjacent ranges. Parse `emoji-sequences.txt` lines (split at `#`, then `;`, trim), keep only entries whose second field is exactly `RGI_Emoji_Tag_Sequence`, and read the first field as hex code points. Validate each kept sequence (starts with U+1F3F4, ends with U+E007F, at least three code points, every code point between in U+E0020 to U+E007E, no duplicates) and exit non-zero without writing on any failure. Sort ascending by code point list.
    - Write `core/src/possession/emoji-table.generated.ts` and `core/src/possession/tag-sequence-table.generated.ts` with the exported constants named in `design.md` (D3), numbers as `0x` plus uppercase hex, ASCII only, license header (Unicode License v3). Store SHA-256 of the canonical range text (`"<lo>-<hi>\n"` per range, lowercase hex) and of the canonical sequence text (one line per sequence, space-separated lowercase hex).
    - Implement `--check`: regenerate in memory and exit non-zero when a committed file differs.
    - _Requirements: 1.1, 1.2, 4.6, 4.7, 14.2_

  - [x] 2.2 Generate and commit the two tables
    - Run `pnpm --filter @ghost-run/core gen:emoji -- --update-pin` (fetches the pinned URLs, or pass `--source <dir>` when the two source files were downloaded beforehand) to create both `*.generated.ts` files and fill the SHA-256 pins in `scripts/emoji-data.pin.json`.
    - Verify the tag-sequence table holds exactly the England, Scotland, and Wales entries (three entries) for Unicode 16.0.0. If a source file cannot be fetched or located, stop and report the blocker instead of hand-writing the tables.
    - _Requirements: 2.9, 2.10, 4.4, 4.6, 4.7_

- [x] 3. Pure possession module (`core/src/possession/`)
  - [x] 3.1 Implement `types.ts`, `classify.ts`, and `search.ts`
    - `types.ts`: `HiddenCategory`, `ScanOptions`, `Finding`, `ScanResult`, `ProvenanceKind`, `ProvenanceRecord`, `ProvenanceLog`, `ProvenanceError`, `ProvenanceParseResult`, `NeedleOrigin`, `Needle`, `NeedleSource`, `ThreadLink`, `Outcome`, `ScanInput`, `FileScan`, `BlacklightReport`, `ScanEntryOptions`. Types only. `NeedleSource` is a `Pick` of `GhostReport` (`effectsOutside`, `observedEvents`) imported with `import type` from `../types.js`.
    - `classify.ts`: hex-number tables (`TAG_RANGE`, `ZERO_WIDTH`, `BIDI_RANGES`, `NAMES` with the 14 names of Requirement 3.5), `HTML_COMMENT_OPENER` and `HTML_COMMENT_CLOSER` built with `String.fromCodePoint`, `classify(c)` (single code point lookup; U+034F, U+FE00 to U+FE0F, U+00AD, U+200E, U+200F are `none`), `formatCodePoint` (`U+` plus at least four uppercase hex digits), and the ASCII escape and rendering helpers (tag decoding, `<U+XXXX NAME>`, comment rendering with `\n` for Line_Breaks).
    - `search.ts`: KMP `findAll(haystack, needle, fold, from?)` over UTF-16 code units with ASCII-only case folding.
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 3.4, 3.5, 3.6, 4.5, 5.6, 10.8, 10.9_

  - [x] 3.2 Implement `emoji.ts` and `tag-sequence.ts`
    - `emoji.ts`: `isExtendedPictographic(cp)` (binary search over the flattened generated ranges, early false below 0xA9), `isEmojiModifier(cp)` (U+FE0F and U+1F3FB to U+1F3FF), and `isPermittedZwj(text, u)` (walk back and forward over Emoji_Modifiers; true only when both nearest code points exist and are Extended_Pictographic; surrogate-aware).
    - `tag-sequence.ts`: derive `TAG_SEQUENCE_STRINGS`, `TAG_SEQUENCE_UNIT_LENGTHS`, and `MAX_SEQ_UNITS` from the generated table at module load; implement `permittedTagSequenceEnd(text, u)` as the bounded lookahead from `design.md` (steps over tag surrogate pairs 0xDB40 with low surrogate 0xDC00 to 0xDC7F, stops at the first cancel tag, never reads past the end of the string, exact string match against the set, returns the end index or -1).
    - _Requirements: 2.9, 2.10, 2.11, 2.12, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 3.3 Implement `scan.ts` (`scanInternal`, `scanText`)
    - Single streaming pass with a UTF-16 cursor, code point offset counter, line and line-start state, an open-run state, `permitEnd` for tag sequences, and `commentEnd` for HTML comments (no code point array).
    - Classification with the tag-sequence exception (`u < permitEnd` gives `none`), permitted-ZWJ exception, run merging by category, lone surrogates as ordinary width-1 code points, Line_Break handling (LF, CRLF as one, lone CR), HTML comment detection when `markdown` is true (default true; closer search starts at `u + 4`; nested openers produce no extra Finding; the loop continues through the comment so hidden runs inside get their own Findings).
    - Merge run Findings and comment Findings in ascending offset order with the category tie-break (`tag`, `zero-width`, `bidi`, `html-comment`). `scanInternal` also returns `unitStart` and `unitEnd` per entry; `scanText` returns the public `Finding` objects. Pure, no state between calls, JSON-safe results, never throws.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 3.4 Implement `sanitize.ts` (`sanitizeText`)
    - Loop: `scanInternal`, merge sorted unit ranges (overlapping or touching), cut the string with slices, repeat until no entry remains. Unchanged text is returned as is. Permitted ZWJ sequences and Permitted_Tag_Sequences are never inside a Finding and so are kept; a flag followed by appended tags becomes exactly the flag. Pure; lone surrogates and kept code units are preserved by slicing.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11_

  - [x] 3.5 Implement `provenance.ts` (`serializeProvenanceLog`, `parseProvenanceLog`)
    - `serializeProvenanceLog` writes each record as an object literal with keys `source`, `kind`, `content` (no spread) via `JSON.stringify`.
    - `parseProvenanceLog` wraps `JSON.parse` in `try/catch` (returns `{ ok: false, errors: [{ message: 'invalid JSON: ...' }] }`), requires an array, validates each element in order (non-null non-array object, no unknown key including `__proto__`, non-empty string `source`, `kind` in the four values, string `content`), collects all errors with `index` and `field`, returns no partial log, accepts `[]`, and rebuilds valid records as fresh three-field literals. No clock, session id, or secret field.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 3.6 Implement `red-thread.ts` (`collectNeedles`, `traceRedThread`)
    - `collectNeedles`: one Needle per non-empty `Effect.destination`, defined non-empty `ObservedEvent.destination`, and defined non-empty `ObservedEvent.path`; sort by `(stepIndex, originRank, sequence)`; keep duplicates; never modify the report.
    - `traceRedThread`: per record, lazily build the revealed text (only `tag` Findings are decoded; Permitted_Tag_Sequence tags stay literal) with a segment table mapping revealed ranges to original UTF-16 ranges (positions inside a decoded segment map to the run's first Tag_Character); line table with binary search; phase 1 full-value KMP search (case-sensitive, first record then lowest index, reject matches that split a surrogate pair); phase 2 host key only when phase 1 found nothing in every record and the value parses as `<scheme>://<host>[:<port>][/<rest>]` (userinfo and port dropped, ASCII-folded, boundary rule of Requirement 10.8). Compute `recordIndex`, `line`, `column` (code points, original content), `hidden`, and `lineText` (ASCII-escaped, at most 200 characters, cut at a whole token). `not-found` links carry no `source`, `line`, or `column`; an empty log gives `not-found` for every Needle. Pure and JSON-safe; not imported by the wards engine.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 12.7_

  - [x] 3.7 Implement `entry.ts` (`scanTexts`, `exitCodeFor`, `formatReport`)
    - `isMarkdownPath` (lowercased extension after the last dot following the last `/` or `\`; `md`, `markdown`, `mdx`; no dot or leading-dot-only names are not markdown), internal `buildReport(files)` with precedence `error` over `findings` over `clean` and `totalFindings`, `scanTexts(inputs, options)` (`markdown` from the rule unless the option forces a boolean), `exitCodeFor` (clean 0, findings 1, error 2), and `formatReport`.
    - `formatReport`: per Finding `<path>:<line>:<column> <category> <firstCodePoint> "<rendering>"` (backslash and double quote escaped, rendering cut at 200 code points with `[truncated]` after the closing quote), per read error `<path>: error "<message>"`, final line `outcome=<outcome> findings=<totalFindings> files=<n>`; path and error text escaped with `<U+XXXX>` outside U+0020 to U+007E; lines joined by U+000A; output is printable ASCII plus U+000A only.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10, 11.11, 11.12, 11.13, 11.14_

  - [x] 3.8 Wire the public surface: `possession/index.ts` and `core/src/index.ts`
    - `core/src/possession/index.ts` re-exports `scanText`, `sanitizeText`, `collectNeedles`, `traceRedThread`, `serializeProvenanceLog`, `parseProvenanceLog`, `scanTexts`, `exitCodeFor`, `formatReport`, and all public types. Do not export `scanFiles` or internal helpers.
    - Add `export * from './possession/index.js'` to `core/src/index.ts`. Run `pnpm --filter @ghost-run/core build`, `typecheck` (all four passes), and `lint`.
    - _Requirements: 1.1, 1.4, 1.6, 1.8_

- [x] 4. Node adapter
  - [x] 4.1 Implement `core/possession-node.ts` (`scanFiles`)
    - Import only `node:fs/promises` (default `readFile`) and the pure `scanTexts`/`buildReport` through relative paths. Sequentially read each path via `options.readFile` (injectable, returns raw bytes), decode with `new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })` (the BOM must be kept and flagged), apply the markdown-by-extension rule, and on a read failure produce `{ path, findings: [], error: 'cannot read <path>: <code>' }` using `error.code` when it is a string and `unreadable` otherwise (never copy `error.message`). Remaining paths are still scanned. Never write, rename, or delete.
    - Set `typecheck` to `tsc --noEmit && tsc --noEmit -p tsconfig.possession.json && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.test.json` (the four-pass form), `lint` to `eslint src possession-node.ts`, and `build` to `tsc -p tsconfig.build.json && tsc -p tsconfig.node.json` (moved here from task 1.1).
    - Confirm `@ghost-run/core/possession-node` resolves through the new `exports` entry after `build`.
    - _Requirements: 1.7, 11.1, 11.5, 11.8, 14.5_

- [x] 5. Test infrastructure
  - [x] 5.1 Write `core/tests/possession/arbitraries.ts`
    - Build every hidden and emoji character from numbers only. Arbitraries from `design.md`: `hangul`, `emojiBase` (excluding U+1F3F4), `emojiUnit`, `zwjSequence`, `flagSequence` (`fc.constantFrom` over `RGI_TAG_SEQUENCES`), `appendedTags` (any code point U+E0000 to U+E007F, plus a weighted ASCII-decodable variant), `tagRunCase` (cases (a) to (e) of Property 20 with the expected class carried as data), `regionalIndicator`, `combining`, `neutralInvisible`, `asciiPrintable`, `lineBreak`, `ordinaryText`, `ordinaryNoEmoji`, `hiddenCodePoint`, `anyText` (hidden code points, flags with and without appended tags, `tagRunCase` pieces, lone surrogates, comment segments), `commentSegment`, `zwjContext`, `provenanceLog` (reserved-domain sources), `needleValue`, `plantedLog`, `ghostReportPart`, `scanInputs`.
    - Bias toward edge positions (index 0, last index, adjacent to Line_Breaks) and toward tag-sequence boundaries (flag then one appended tag, flag then appended U+E007F, run one code point short of a listed sequence, two flags in a row).
    - Add reference helpers used by the oracles: `refPosition`, the independent tag-sequence oracle, the ZWJ oracle, the revealed-text oracle, and the host oracle (written separately from the implementation, sharing only the validated tables).
    - Add a custom failure reporter that prints counterexamples through the module's `escapeAscii` so failure output is ASCII.
    - Include a test that three independently hard-coded hex code point lists (the glossary values for England, Scotland, Wales) equal the table entries.
    - _Requirements: 13.1, 13.2, 13.3, 13.14, 13.15, 14.1, 14.2, 14.6_

- [x] 6. Scanner property tests (P7 and supporting)
  - [x] 6.1 Write property test for ordinary text never flagged
    - File: `core/tests/possession/prop-01-ordinary-text.test.ts`
    - **Property 1: Ordinary text is never flagged**
    - **Validates: Requirements 2.6, 2.8, 2.9, 4.1, 4.4, 4.5, 13.2**
    - Scope: P7, negative direction. Claimed everywhere. Not claimed: tag characters outside a complete listed sequence are flagged by definition; a flag added by a later Unicode release is flagged until the table is regenerated.
    - Non-vacuity counters: flags present, ZWJ sequences present, Hangul present, empty string.

  - [x] 6.2 Write property test for a hidden code point inserted anywhere
    - File: `core/tests/possession/prop-02-hidden-insert.test.ts`
    - **Property 2: A hidden code point inserted anywhere is flagged at its position**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 13.3**
    - Scope: P7, positive direction. Claimed everywhere. Not claimed: any other invisible code point. Text has no emoji, so no tag character is part of a listed sequence.
    - Non-vacuity counters: insert at index 0, at the end, after a Line_Break, inside a word; each category; U+200D; leading U+FEFF.

  - [x] 6.3 Write property test for tag run decoding
    - File: `core/tests/possession/prop-03-tag-decode.test.ts`
    - **Property 3: A tag run decodes to its ASCII source**
    - **Validates: Requirements 3.4, 3.7, 13.4**
    - Scope: supporting property of P7 (positive direction, rendering). Claimed everywhere. Not claimed: decoding of non-tag encodings.

  - [x] 6.4 Write property test for the ZWJ rule
    - File: `core/tests/possession/prop-04-zwj.test.ts`
    - **Property 4: A ZWJ is allowed exactly between emoji**
    - **Validates: Requirements 2.2, 4.1, 4.2, 4.3**
    - Scope: P7, both directions at the ZWJ boundary. Claimed everywhere. Not claimed: that a permitted sequence is semantically a valid emoji. Uses the independent ZWJ oracle.

  - [x] 6.5 Write property test for well-formed, maximal, sorted findings
    - File: `core/tests/possession/prop-05-finding-shape.test.ts`
    - **Property 5: Findings are well-formed, maximal, sorted, and position-consistent**
    - **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.8, 3.10, 13.7**
    - Scope: supporting property for P7 (fixes the meaning of a Finding). Claimed everywhere. Not claimed: completeness over other Unicode categories.

  - [x] 6.6 Write property test for determinism, totality, and JSON safety
    - File: `core/tests/possession/prop-06-determinism.test.ts`
    - **Property 6: Scan is deterministic, total, and JSON-safe**
    - **Validates: Requirements 2.7, 6.1, 6.2, 6.3, 6.6, 13.6**
    - Scope: supporting property for P7 (makes "pure function" true). Claimed everywhere. Not claimed: running time (covered by the timing example test).

  - [x] 6.7 Write property test for HTML comment findings
    - File: `core/tests/possession/prop-07-html-comments.test.ts`
    - **Property 7: HTML comments are found as one finding each, only where markdown is true**
    - **Validates: Requirements 3.9, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**
    - Scope: supporting property, not P7 (HTML comments are an additional category, outside the P7 negative direction). Not claimed: that renderers hide every comment form, or markdown structure parsing. The opener is built from code points.

  - [x] 6.8 Write property test for tag runs allowed only as exact listed sequences
    - File: `core/tests/possession/prop-20-tag-sequence-exact.test.ts`
    - **Property 20: A tag run is allowed only as an exact listed sequence**
    - **Validates: Requirements 2.1, 2.9, 2.10, 2.11, 13.15, 13.17**
    - Scope: P7, both directions at the tag-sequence boundary. Claimed everywhere. Not claimed: sequences a later Unicode release adds are flagged until the table is regenerated (design Risk R2); the table content is checked by the table tests. Uses the independent tag-sequence oracle and the `tagRunCase` arbitrary (cases (a) to (e)).

  - [x] 6.9 Write property test for tags appended after a flag
    - File: `core/tests/possession/prop-21-flag-appended-tags.test.ts`
    - **Property 21: Tags appended after a flag are flagged and the flag is not**
    - **Validates: Requirements 2.12, 3.11, 13.14, 13.17**
    - Scope: P7, positive direction for tags that follow a flag. Claimed everywhere. Not claimed: any text analysis of what the decoded tags say.

- [x] 7. Sanitize property tests
  - [x] 7.1 Write property test for clean, idempotent sanitize output
    - File: `core/tests/possession/prop-08-sanitize-clean.test.ts`
    - **Property 8: Sanitize returns clean, idempotent output and leaves clean text alone**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.10, 13.5, 13.6**
    - Scope: supporting property for P7 (purification uses the positive direction). Claimed everywhere. Not claimed: that sanitized text is semantically safe.

  - [x] 7.2 Write property test for visible text preservation
    - File: `core/tests/possession/prop-09-sanitize-preserves.test.ts`
    - **Property 9: Sanitize preserves visible text**
    - **Validates: Requirements 7.6, 7.7, 7.8, 7.9**
    - Scope: supporting property for P7 (negative direction after purification). Claimed everywhere. Not claimed: preservation of text inside comments.

  - [x] 7.3 Write property test for flags kept and other tags removed
    - File: `core/tests/possession/prop-22-sanitize-flags.test.ts`
    - **Property 22: Sanitize keeps listed flags, removes other tags, and is idempotent**
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.11, 13.16**
    - Scope: supporting property for P7 (negative direction after purification, for flags). Claimed everywhere. Not claimed: that removing tags makes text safe in any other sense.

- [x] 8. Provenance and red-thread property tests
  - [x] 8.1 Write property test for the provenance round trip
    - File: `core/tests/possession/prop-10-provenance-roundtrip.test.ts`
    - **Property 10: Provenance log round trip**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.7, 8.8, 13.11**
    - Scope: supporting property (record format). Claimed everywhere. Not claimed: that the later hook fills the log correctly.

  - [x] 8.2 Write property test for rejecting invalid provenance input
    - File: `core/tests/possession/prop-11-provenance-invalid.test.ts`
    - **Property 11: Invalid provenance input is rejected without a partial log**
    - **Validates: Requirements 8.4, 8.5, 8.6**
    - Scope: supporting property (error conditions). Claimed everywhere.

  - [x] 8.3 Write property test for needle collection
    - File: `core/tests/possession/prop-12-needles.test.ts`
    - **Property 12: Needle collection is complete, ordered, and non-destructive**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
    - Scope: supporting property (red thread input). Claimed everywhere. Not claimed: correctness of the report itself.

  - [x] 8.4 Write property test for first-occurrence lookup
    - File: `core/tests/possession/prop-13-first-occurrence.test.ts`
    - **Property 13: The red thread returns the first occurrence**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.9, 10.12, 13.8**
    - Scope: supporting property (O3 earliest-read rule), a lookup rule and not a safety property. Claimed everywhere. Not claimed: that the cause line is the real cause, or that built, encoded, compressed, or encrypted addresses are found. Uses the revealed-text oracle.

  - [x] 8.5 Write property test for planted needles including tag-hidden ones
    - File: `core/tests/possession/prop-14-planted-needle.test.ts`
    - **Property 14: A planted needle is found, including when hidden in tag characters**
    - **Validates: Requirements 10.2, 10.6, 13.9**
    - Scope: supporting property (red thread over hidden text). Claimed everywhere. Not claimed: that the planted text caused any action.

  - [x] 8.6 Write property test for no occurrence giving not-found
    - File: `core/tests/possession/prop-15-not-found.test.ts`
    - **Property 15: No occurrence gives not-found**
    - **Validates: Requirements 10.10, 10.11, 13.10**
    - Scope: supporting property (no guessing). Claimed everywhere. A `not-found` link never changes a verdict.

  - [x] 8.7 Write property test for the host fallback rules
    - File: `core/tests/possession/prop-16-host-fallback.test.ts`
    - **Property 16: Host fallback follows the boundary and case rules**
    - **Validates: Requirements 10.7, 10.8**
    - Scope: supporting property. Claimed everywhere. Not claimed: internationalized domain names, userinfo semantics, or DNS equivalence. Uses the host oracle.

  - [x] 8.8 Write property test for bounded safe line text
    - File: `core/tests/possession/prop-17-line-text.test.ts`
    - **Property 17: Link line text is bounded, safe ASCII**
    - **Validates: Requirements 10.5, 10.13**
    - Scope: supporting property (safe display of untrusted text). Claimed everywhere. Not claimed: that a long line shows the occurrence.

- [x] 9. Entry point property tests
  - [x] 9.1 Write property test for report outcome, order, and markdown selection
    - File: `core/tests/possession/prop-18-report-outcome.test.ts`
    - **Property 18: Report outcome, order, and markdown selection follow the rules**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.12**
    - Scope: supporting property (hook entry, pure function). Claimed everywhere for the pure function. Not claimed: file reading and hook behavior.

  - [x] 9.2 Write property test for the formatted report
    - File: `core/tests/possession/prop-19-format-report.test.ts`
    - **Property 19: The formatted report is bounded ASCII**
    - **Validates: Requirements 11.9, 11.10, 11.11**
    - Scope: supporting property (safe output into the agent context). Claimed everywhere for the pure function.

- [x] 10. Example-based and unit tests (Node-free, under `core/tests/`)
  - [x] 10.1 Write scanner example tests
    - File: `core/tests/possession/scan.test.ts`
    - Family emoji allowed; U+200D between two Latin letters flagged; leading U+FEFF flagged at line 1, column 1, offset 0; opener without closer runs to the end; opener inside a fenced code block flagged; opener directly followed by U+003E not closed by its own hyphens; all 14 names; each of the three flags alone has no Finding; a flag followed by tags encoding a short word gives one Finding that starts right after the cancel tag and renders the word; U+1F3F4 plus the tag letters `gbeng` without cancel tag flagged in full; unlisted flag-shaped run (`gbxyz` plus cancel) flagged; tag characters with no base flagged; a run that begins like England but has another tag before its first cancel tag flagged; a flag followed by U+200D and an emoji flags the U+200D. Build all inputs from code points.
    - _Requirements: 2.2, 2.5, 2.9, 2.11, 2.12, 3.5, 3.11, 4.1, 4.2, 5.4, 5.8, 13.12, 13.17_

  - [x] 10.2 Write tag-sequence unit tests
    - File: `core/tests/possession/tag-sequence.test.ts`
    - `permittedTagSequenceEnd` returns the end index for each table entry, -1 for each near miss (prefix without cancel, unlisted flag-shaped, extra tag before first cancel), and never reads past the end of the string (flag at the very end, truncated flag, lone high surrogate 0xDB40 after the base).
    - _Requirements: 2.9, 2.10, 2.11_

  - [x] 10.3 Write sanitize, provenance, red-thread, and format example tests
    - Files: `core/tests/possession/sanitize.test.ts`, `provenance.test.ts`, `red-thread.test.ts`, `entry.test.ts`, `format.test.ts`
    - Sanitize repeats when removing U+200B joins an opener (opener built from code points with U+200B inside); sanitize on a flag plus appended tags returns exactly the flag. Provenance: `[]` accepted, `__proto__` key rejected, error names index and field. Red thread: a README text with a destination hidden in tag characters is found with `hidden: true` and the column of the first tag; a destination hidden in tags appended after a flag is found with `hidden: true` and the column of the first appended tag. `exitCodeFor` returns 0, 1, 2; `formatReport` quoting, escaping, truncation, and error lines.
    - _Requirements: 7.2, 7.11, 8.6, 8.7, 10.6, 11.6, 11.9, 11.10, 11.11, 13.12, 13.17_

  - [x] 10.4 Write timing and adversarial-input tests
    - File: `core/tests/possession/timing.test.ts`
    - 1 MiB of ASCII scans in under 1 second; adversarial inputs (a long run of U+200D with modifiers, many openers with no closer, 100,000 nested opener fragments through `sanitizeText`) finish within a generous bound.
    - _Requirements: 6.4, 6.5, 11.13_

  - [x] 10.5 Write type tests and package checks
    - Type test `core/tests/possession/types.test-d.ts` is not matched by the `typecheck.include` glob unless placed under `core/tests/`; place it at `core/tests/possession-types.test-d.ts`. Assert: `collectNeedles` accepts a `GhostReport<S>`, `ProvenanceRecord` has exactly the three fields and no clock, session, or secret field.
    - Package checks (Node-needing, so in `core/tests-node/package-surface.test.ts`): `core/package.json` has no `dependencies`; the core entry exports the eight names of Requirement 1.8 and does not export `scanFiles`; the `./possession-node` export exists.
    - _Requirements: 1.1, 1.7, 1.8, 8.9, 9.1_

  - [x] 10.6 Write the plan-text example test
    - File: `core/tests/possession/plan-text.test.ts`
    - Run the P7 negative check on the text of the five Ghost Shell scenarios and the Korean plan headings from `docs/plan.md` when the file is present (read it with a path obtained from a test-only helper in `tests-node/` or an inlined excerpt in the test); when `docs/plan.md` is absent (it is gitignored), skip with a visible message. Inline a short Korean excerpt built with `\u` escapes so the Node-free test still covers Hangul without the file.
    - _Requirements: 13.13_

- [x] 11. Node-only tests (`core/tests-node/`)
  - [x] 11.1 Write `emoji-table.test.ts`
    - Ranges ascending, non-overlapping, merged, within 0 to 0x10FFFF, even array length; SHA-256 of the canonical range text (via `node:crypto`) equals `EXTENDED_PICTOGRAPHIC_TABLE_SHA256`; spot checks in (U+00A9, U+2764, U+1F468, U+1F469, U+1F466, U+1F525, U+1F3F4) and out (U+0023, digits, U+0041, U+AC00, U+1F1E6, U+1F3FB to U+1F3FF, U+200D, U+FE0F, U+E007F); version constants and agreement with `scripts/emoji-data.pin.json`; the generated file contains only U+0009, U+000A, and U+0020 to U+007E, and `scanText` finds nothing in it.
    - _Requirements: 4.4, 4.6, 4.7, 14.2_

  - [x] 11.2 Write `tag-sequence-table.test.ts`
    - Entry structure (starts with U+1F3F4, ends with U+E007F, inner code points in U+E0020 to U+E007E, at least one inner, cancel only at end), strictly ascending and unique, SHA-256 of the canonical sequence text equals `RGI_TAG_SEQUENCES_TABLE_SHA256`, exactly three entries (England, Scotland, Wales) compared with the independently hard-coded hex lists, version constants (`16.0.0` and `16.0`) agree with each other, the URLs, and the pin file; derived constants (`TAG_SEQUENCE_STRINGS`, `MAX_SEQ_UNITS`) match the table; the generated file has no hidden or non-ASCII characters.
    - _Requirements: 2.9, 2.10, 4.6, 4.7, 14.2_

  - [x] 11.3 Write the purity and AST test `purity.test.ts`
    - Parse each file of `src/possession/` with the TypeScript compiler API: every import specifier starts with `./` or is the type-only `../types.js`; no identifier refers to a banned global (`process`, `Buffer`, `require`, `window`, `document`, `TextEncoder`, `TextDecoder`, `URL`, `console`, `fetch`, `Date`, `performance`, `setTimeout`, `setInterval`, `crypto`); no `eval`, `new Function`, or `Math.random`. Assert that nothing under `core/src/` outside `possession/` imports `red-thread.js` (the wards engine never consumes the red thread).
    - _Requirements: 1.2, 1.3, 12.7_

  - [x] 11.4 Write the ESLint rule test `eslint-builtins.test.ts`
    - Use the `ESLint` class with `overrideConfigFile: 'eslint.config.mjs'` and `lintText` on virtual file paths (`src/__probe__.ts`, `src/possession/__probe__.ts`, `possession-node.ts`); write no files.
    - For every name in `builtinModules` lint the forms `import x from`, `import type { T } from`, `export * from`, `import()`, `require()`, and `import x = require()`; expect at least one `no-restricted-imports` or `no-restricted-syntax` message for each. Also lint a fixed list (`fs`, `fs/promises`, `path`, `crypto`, `vm`, `child_process`, `node:fs`, `node:test`) in static and dynamic forms, so the test fails if the generated list were empty.
    - Computed specifiers (`import(name)`, `require(name)`) produce a message. Negative controls with no built-in message: `./fs.js`, `./path.js`, `../types.js`, `@ghost-run/core`. For `possession-node.ts`: no message for `node:fs/promises`, a message for `fs/promises`. Linting the real `src/possession` files and `possession-node.ts` yields zero errors, and the `src/possession` globals restrictions fire on `process` and `Date`.
    - _Requirements: 1.2, 1.3, 1.6, 1.7_

  - [x] 11.5 Write the bare `node:vm` realm test (`bare-realm-loader.ts`, `bare-realm.test.ts`)
    - Loader: read each file under `src/possession/` (both generated tables included), transpile with `ts.transpileModule` (ES2022, CommonJS), evaluate each in a `vm.createContext({})` realm with a tiny `require` that resolves only relative specifiers to already loaded siblings and throws for anything else.
    - Test: run the example battery and a short fast-check differential (`NUM_RUNS`) over `anyText`, `provenanceLog`, and `scanInputs` in the realm and on the host; compare results as JSON strings. Any use of a Node or DOM global throws `ReferenceError` in the realm.
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 11.6 Write the adapter test `scan-files.test.ts`
    - Using a temporary directory created and removed by the test: a markdown file and a text file (markdown rule applied; outcomes `findings` and `clean`); a missing path plus a readable path (`outcome: 'error'`, error names the path and `ENOENT`, the readable file is still reported); a file starting with bytes `EF BB BF` is flagged at line 1, column 1 (BOM kept); a file with an invalid byte yields U+FFFD and no Finding; an injected `readFile` that throws a hostile long `message` yields `code` or `unreadable`, never the raw message. A source scan of `possession-node.ts` finds no `writeFile`, `rename`, or `unlink`.
    - _Requirements: 11.1, 11.5, 11.8, 14.5_

  - [x] 11.7 Write the generator integration test `gen-emoji-table.test.ts`
    - Run `scripts/gen-emoji-table.mjs --source <tmp dir>` (offline, no network) on small synthetic `emoji-data.txt` and `emoji-sequences.txt` fixtures built in memory; assert the output tables, that a hash mismatch against a pin exits non-zero and writes nothing, that an invalid tag sequence entry exits non-zero and writes nothing, and that `--check` detects a differing committed file. Write outputs only to a temporary directory.
    - _Requirements: 4.6, 4.7_

  - [x] 11.8 Write the repository hygiene tests `repo-clean.test.ts`
    - Run `scanFiles` over every file in `.kiro/specs/possession/` and `.kiro/steering/` and expect outcome `clean`.
    - Source scan: scan with `markdown: true` and character-set check (only U+0009, U+000A, U+0020 to U+007E) every file of this feature: `src/possession/**`, `possession-node.ts`, `scripts/gen-emoji-table.mjs`, both generated tables, `tests/possession/**`, `tests-node/**`. Expect no Finding. Fixtures use reserved domains and canary values only.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 12. Documentation
  - [x] 12.1 Add the data and dependency entries to the README
    - If `README.md` exists at the repository root, add to its library table: `Unicode emoji-data.txt (Extended_Pictographic)` and `Unicode emoji-sequences.txt (RGI_Emoji_Tag_Sequence)`, version 16.0.0 (Emoji 16.0), license Unicode License v3 (`Unicode-3.0`, `https://www.unicode.org/license.txt`), the two source URLs, use "generated numeric tables"; `fast-check`, `vitest`, `typescript`, and `@types/node` as dev dependencies with their licenses. Do not create the root README if absent; in that case create `core/README.md` with the same table.
    - Add a "Possession detector" section: the P7 claim wording (Requirement 12.1), HTML comment detection as an additional markdown category, "text analysis does not catch every injection", P6 owned by `wards`, undetected invisible characters (for example U+115F, U+3164, homoglyphs), the red thread as a literal lookup only, the table pinned to Unicode 16.0.0 and its regeneration through `gen:emoji`, and that untrusted large input should be size-capped by the caller. Hidden characters in the README are named by code point only.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 14.2_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Run `pnpm --filter @ghost-run/core test` (vitest run, including the existing P1 to P4 tests, `verify.test.ts`, `wards.test.ts`, the new possession property tests, and `tests-node/`), `pnpm --filter @ghost-run/core lint`, and `pnpm --filter @ghost-run/core typecheck` (all four tsc passes). Confirm `core/tsconfig.json` is unchanged, the whole short suite finishes within 60 seconds, and `pnpm -r build` still succeeds. Ask the user if questions arise.

## Notes

- Properties 1 to 22 keep the numbering of `design.md`. Property 7 is a supporting property (HTML comments), not part of P7. P6 is owned by the `wards` spec and is not asserted here.
- Run profiles: short run 100 examples per property within 60 s, nightly (`GHOST_PBT_MODE=nightly`) 10,000, as in `core/tests/pbt-config.ts`. The generator `--check` against the real Unicode files is a manual or nightly job, not a save-time test.
- Task 2.2 needs the two Unicode source files (network or a local `--source` directory). If neither is available, the task stops and reports instead of hand-writing tables.
- Task 3.3 and later tasks depend on the tables from task 2.2. All pure-module tasks need `core/tsconfig.possession.json` and the ESLint blocks from tasks 1.1 and 1.2 in place for their checks.
- `core/tsconfig.json` and `core/vitest.config.ts` are not changed by this plan.
- This workflow only creates the plan. Open this file and click "Start task" next to a task to begin implementation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5", "3.6", "3.7"] },
    { "id": 5, "tasks": ["3.8"] },
    { "id": 6, "tasks": ["4.1", "5.1"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "7.1", "7.2", "7.3", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "9.1", "9.2"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "12.1"] },
    { "id": 9, "tasks": ["11.8"] }
  ]
}
```

# Requirements Document

## Introduction

The `ui-kit` spec defines the shared screen kit of Ghost Run+: the workspace package `ui/` (`@ghost-run/ui`), built with Vite, React, and TypeScript. Ghost Shell, the second app, and the third world use the same kit. The kit draws data that `core`, the possession detector, and the ward engine already produced. It computes no verdict, no diff, no finding, and no red-thread link.

The kit has six parts, taken from the "Screen kit" and "Halloween design system" sections of `docs/plan.md` and from `.kiro/steering/halloween-ui.md`:

1. **Mirror world**: left a clear reality, right a foggy mirror; files and rows that would vanish dissolve like smoke; row counts, paths, and line numbers stay visible in a monospace font.
2. **Candle**: `pass` is lit, `warn` flickers, `block` is out; an icon, a text label, and the names of the violated wards are always shown together.
3. **Blacklight switch**: reveals hidden text with a fluorescent highlight and a code point notation (`U+XXXX`).
4. **Red thread**: connects a blocked action to the cause line the agent read.
5. **Graveyard**: one tombstone per blocked command (command, time, violated ward); a tombstone opens the seance detail view.
6. **Lights on**: a switch to a bright theme.

The kit consumes these existing types and defines no second shape for them: `Change`, `FileChange`, `SqlRowCountChange`, `Scene`, `Verdict`, `WardVerdict`, `WardViolation`, `WardNotice`, and `GhostReport` from `core/src/types.ts`; `Finding`, `ScanResult`, `Needle`, and `Thread_Link` from the `possession` spec. The kit adds new types only for what no other spec defines: the isolation claims it displays, and the graveyard entry (see "Assumptions and Open Questions").

The kit follows the core steering rules. In particular, a run that took place without the Docker box (Plan B, static analysis) never shows a P1 claim. The kit asserts none of the safety properties P1 to P8; it only displays the claims it receives. The render properties of this spec are numbered UI-P1 to UI-P11 and are separate from P1 to P8 of the world-contract steering.

| Claim | Claimed where | Not claimed |
|---|---|---|
| UI-P1 to UI-P11 (render properties of this spec) | Everywhere the kit renders (Playground, real mode UI, tests) | n/a |
| P1 to P8 (safety contract) | Not asserted by the kit | The kit shows the claim flags it receives and never raises them |

The kit does not render the 3D ghost overlay, the wards editor, or the haunted variants of Ghost Hand. These belong to the apps (see "Out of Scope").

Hidden characters are never written literally in this document. A hidden character is named by its code point, for example U+200B. Hosts in examples use reserved domains (for example `setup-check.example`), and secrets are fake canary values (for example `sk-CANARY-abc123`).

## Glossary

- **UI_Kit**: The package `@ghost-run/ui` in `ui/`: all components, view models, theme tokens, and helpers of this spec.
- **Mirror_World**: The component that shows the Change_Rows of a ghost run in a Reality pane and a Mirror pane.
- **Change_Row**: One row of the Mirror_World that represents exactly one `Change` of `GhostReport.changes`, identified by `(stepIndex, index within the step)`.
- **Vanish_Effect**: The smoke-like dissolve decoration of a Change_Row whose file is deleted or whose rows are lost.
- **Candle**: The component that shows a `WardVerdict` as a Candle_State.
- **Candle_State**: One of `lit` (verdict `pass`), `flickering` (`warn`), `out` (`block`), `unknown` (a value outside `pass`, `warn`, `block`), and `idle` (no verdict supplied).
- **Claim_Banner**: The element, rendered in the same container as the Candle, that shows the Isolation_Claims of the run.
- **Isolation_Claims**: The input `{ mode, p1Claimed, p5Claimed, p6Claimed, reason? }`, a structural subset of the `Isolation` object of the ghost-runner `RunResult` (Assumption A4).
- **Assurance_Text**: The fixed string `Ghost ran inside a sealed Docker box (P1 claimed).`
- **Blacklight_View**: The component that shows a text with its `ScanResult` and the Blacklight_Switch.
- **Blacklight_Switch**: The switch of the Blacklight_View; states `on` and `off`.
- **Finding**: The possession result type with the fields `category`, `line`, `column`, `offset`, `length`, `codePoints`, `firstCodePoint`, and `rendering`.
- **Red_Thread_View**: The component that shows one Thread for each pair of a `Needle` and a `Thread_Link`.
- **Thread**: The visible connection from an action end (a `Needle` with its step) to a cause end (the source, line, and column of a `found` Thread_Link).
- **Graveyard**: The component that shows a list of Tombstones.
- **Grave_Entry**: The input record of one blocked command (Requirement 10, criterion 1).
- **Tombstone**: The control that represents one Grave_Entry.
- **Seance_View**: The detail view of one Grave_Entry.
- **Lights_Toggle**: The switch that changes the Theme.
- **Theme**: One of `dark` (default) and `light` (lights on).
- **Theme_Tokens**: The single module that declares every color of both themes and the Contrast_Pairs.
- **Contrast_Pair**: One declared foreground and background color pair of a Theme, with a role (`text`, `large-text`, or `graphic`).
- **Display_Escaper**: The pure function that converts a string to its display form (Requirement 3).
- **Hidden_Display_Code_Point**: A code point in U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, or U+2066 to U+2069, with no exception for emoji sequences.
- **Hex_Notation**: The text `<U+XXXX>` where XXXX is the code point in uppercase hexadecimal with at least four digits.
- **Allow_List_Projection**: The rule that a component reads only the fields named in its input contract and ignores every other field of an input object.
- **Render_Output**: The serialized HTML markup that a component produces in the test environment, including text nodes and every attribute value (`aria-label`, `title`, `data-*`, `id`, and others).
- **Placeholder**: The fixed text a component renders instead of unreadable input (Requirement 14).
- **Plan_B**: The run mode in which Docker is unavailable and only static analysis ran (`mode` equals `static-analysis`).
- **Reference_Machine**: An Apple M1 machine, as in the `ghost-runner` spec.
- **Short_Run**: The property-based test run on file save: at least 100 generated examples per property.
- **Nightly_Run**: The property-based test run with at least 10,000 generated examples per property and no time limit.

## Requirements

### Requirement 1: Package Placement, Stack, and Dependency Direction

**User Story:** As a maintainer, I want the screen kit to be one package that depends only on `core`, so that both apps and the third world share it and `core` stays free of UI code.

#### Acceptance Criteria

1. THE UI_Kit SHALL be a pnpm workspace package in `ui/` with the package name `@ghost-run/ui`, listed in `pnpm-workspace.yaml`.
2. THE UI_Kit SHALL be written in TypeScript with the compiler option `strict` enabled, SHALL use React for rendering, and SHALL use Vite for building and for the test runner configuration.
3. THE `dependencies` of `ui/package.json` SHALL list only `@ghost-run/core` (workspace dependency), `react`, and `react-dom`.
4. THE UI_Kit SHALL import from other packages of this repository only through the public entry point of `@ghost-run/core`, and SHALL use `import type` for every import from `@ghost-run/core` in source files that are not tests.
5. THE ESLint configuration of `ui/` SHALL use `no-restricted-imports` to forbid imports of `@ghost-run/ghost-runner`, `apps/*`, `integrations/*`, `worlds/*`, `three`, and `@mujoco/mujoco`, and `pnpm lint` SHALL fail when one of them is imported.
6. THE ESLint configuration of `core/` SHALL forbid imports of `@ghost-run/ui` and `ui/` paths by `no-restricted-imports`, and `pnpm lint` SHALL fail when `core/` imports the UI_Kit.
7. THE UI_Kit SHALL NOT depend on three.js or any 3D library; the 3D ghost overlay is decided in the spec of the second app after the 11/19 decision.
8. THE UI_Kit SHALL receive the `Finding`, `ScanResult`, `Needle`, and `Thread_Link` types through the public entry point of `@ghost-run/core` (Assumption A1).
9. BEFORE the UI_Kit is merged, THE repository README dependency table SHALL list every dependency of `ui/` (runtime and development) with its name, version, and license, and SHALL list every font, icon, and other asset with its source and license.

### Requirement 2: Presentation-Only Boundary and Input Contracts

**User Story:** As a template user, I want the kit to draw what the engine decided and nothing else, so that a screen can never disagree with the ward engine or the possession detector.

#### Acceptance Criteria

1. THE UI_Kit SHALL NOT compute a `Verdict`, a `WardVerdict`, a `Change`, a `Finding`, or a `Thread_Link`; each SHALL be received as an input.
2. THE UI_Kit SHALL NOT call `WardEngine`, `ghostRun`, `scanText`, `traceRedThread`, or any other `core` function that judges, diffs, or scans.
3. THE UI_Kit SHALL accept these inputs and no others:

| Component | Input props |
|---|---|
| Mirror_World | `changes: readonly (readonly Change[])[]` (the `GhostReport.changes` of one run, one array per step); optional `realScene: Scene`; optional `mirrorScene: Scene`; optional `stepLabels: readonly string[]` (a label per step, for example the command) |
| Candle | optional `verdict: WardVerdict`; optional `claims: Isolation_Claims` |
| Blacklight_View | `sources: readonly { source: string; text: string; scan: ScanResult }[]` |
| Red_Thread_View | `needles: readonly Needle[]`; `links: readonly Thread_Link[]`; optional `actionLabels: readonly string[]` |
| Graveyard | `entries: readonly Grave_Entry[]`; `onOpenSeance: (id: string) => void` |
| Seance_View | one `Grave_Entry`; `onBack: () => void` |
| Lights_Toggle and the app shell | optional `initialTheme: 'dark' \| 'light'` |

4. THE UI_Kit SHALL derive all displayed content from the props by pure functions, and SHALL read no clock, random source, environment variable, or storage.
5. FOR ALL equal props, THE UI_Kit SHALL produce an equal Render_Output (determinism).
6. THE UI_Kit SHALL NOT modify any prop value.
7. THE UI_Kit SHALL apply the Allow_List_Projection to every input object, so that a field that is not named in this requirement is never rendered.
8. WHERE a component derives a count, a sum, a sort order, or a grouping for display (for example the number of Change_Rows, the rows lost in one `sql-row-count` Change, or the tombstone order), THE component SHALL derive it only from the supplied values and SHALL NOT present it as a judgment.

### Requirement 3: Display Escaping of Untrusted Text

**User Story:** As a security reviewer, I want every string from the data to be shown in a visible, inert form, so that a hidden character in a path or a command cannot reach a screen, a log, or a screen reader unseen.

#### Acceptance Criteria

1. THE Display_Escaper SHALL replace every Hidden_Display_Code_Point, every control code point in U+0000 to U+001F and U+007F to U+009F (except U+000A in a multi-line field of the Blacklight_View), and every unpaired surrogate code unit of its input with the Hex_Notation of that code point.
2. THE Display_Escaper SHALL use the Hex_Notation with at least four uppercase hexadecimal digits, so that U+200B becomes `<U+200B>` and U+E0041 becomes `<U+E0041>`.
3. THE UI_Kit SHALL pass every string that comes from a prop (paths, commands, ward ids, reasons, table names, sources, line texts, labels, `Scene` string values, and `Finding.rendering`) through the Display_Escaper before the string enters any Render_Output.
4. THE UI_Kit SHALL apply the Display_Escaper to attribute values (`aria-label`, `title`, `data-*`, `id`) in the same way as to text nodes.
5. THE Display_Escaper SHALL be idempotent: FOR ALL strings `s`, `escape(escape(s))` SHALL equal `escape(s)`.
6. WHERE a single-line field in a compact view is longer than 120 code points, THE UI_Kit SHALL show the first 117 code points followed by `...`, and THE detail views SHALL show the full value up to the limit of Requirement 14, criterion 6.
7. THE Display_Escaper SHALL escape U+200D in every position, including between two emoji (Assumption A6).
8. FOR ALL strings placed in any displayed field of any component, THE Render_Output SHALL contain no Hidden_Display_Code_Point literally, in text nodes or in attribute values (Property: UI-P3).

### Requirement 4: Markup Inertness and Secret Non-Display

**User Story:** As a security reviewer, I want data to be drawn as text only and secret inputs to have no path to the screen, so that a hostile document cannot run code in the kit and a canary cannot leak through it.

#### Acceptance Criteria

1. THE UI_Kit SHALL NOT use `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, or a string argument to `setTimeout` or `setInterval`; the ESLint rule `react/no-danger` and a source-scan test SHALL fail when one of them appears in `ui/src`.
2. THE UI_Kit SHALL place a string from a prop only as a React text child or as the value of an attribute from the fixed attribute list of its component, and SHALL NOT use a prop string as an element name, a `href`, a `src`, a `style` value, an event handler, or a CSS custom property value.
3. FOR ALL strings placed in any displayed field, including strings that contain markup-like text, THE Render_Output SHALL contain only elements and attributes from the allow-list declared by the component, and SHALL contain no attribute name that starts with `on` and no `javascript:` URL (Property: UI-P5).
4. THE input types of the UI_Kit SHALL contain no field of the types `SecretValues`, `EvaluateInputs`, `Uint8Array`, or a map of payloads, and a type-level test (`ui/tests/types.test-d.ts`) SHALL assert this.
5. FOR ALL generated props to which extra fields are added (named `secretValues`, `payloads`, `env`, and `token`, holding a generated canary value such as `sk-CANARY-` followed by random characters), THE Render_Output SHALL NOT contain the canary value (Property: UI-P4).
6. THE UI_Kit SHALL write no prop value to the console, to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
7. THE UI_Kit SHALL document in the README that a secret value typed into a command string or a `Scene` by an upstream producer cannot be detected by the kit, and that the producer is responsible for redaction (Assumption A7).

### Requirement 5: Mirror World

**User Story:** As a developer who watches a ghost run, I want to see my real files and rows on the left and the foggy copy with the vanishing parts on the right, so that I understand at a glance what the plan would destroy.

#### Acceptance Criteria

1. THE Mirror_World SHALL show two panes side by side: the left pane with the visible heading `Reality` and the right pane with the visible heading `Mirror (copy)`.
2. THE Mirror_World SHALL render the left pane in a clear style and the right pane in a fog style, and SHALL apply the fog, blur, or transparency only to a background layer; every element that contains text SHALL have an opacity of 1 and no CSS `filter`.
3. THE Mirror_World SHALL render exactly one Change_Row for each `Change` of each step of `changes`, ordered by step and then by position within the step, and each Change_Row SHALL span both panes (Property: UI-P1).
4. FOR ALL `changes` values, THE Mirror_World SHALL render each `Change` exactly once, including a `Change` of an unknown `kind` and a `Change` whose fields do not match its kind (Property: UI-P1).
5. THE Mirror_World SHALL render each Change_Row by its `kind` as follows:

| Kind | Reality pane | Mirror pane |
|---|---|---|
| `file-created` | `path`, state `absent` | `path`, state `created` |
| `file-overwritten` | `path`, state `present` | `path`, state `overwritten` |
| `file-deleted` | `path`, state `present` | `path`, state `deleted`, Vanish_Effect |
| `symlink-changed` | `path` and `targetBefore` when present | `path` and `targetAfter` when present, state `link changed` |
| `sql-row-count` | `table` and `rowsBefore` | `table`, `rowsAfter`, and `rows lost: <n>` when `rowsBefore` is greater than `rowsAfter`; Vanish_Effect when rows are lost; state `table dropped` when `dropped` is true |
| any other kind or shape | the `kind` text and up to 5 fields whose values are strings, numbers, or booleans | the label `unrecognized change` |

6. THE Mirror_World SHALL format a row count with `,` as the thousands separator (for example `1,206`), and WHERE a count is not a finite non-negative integer, THE Mirror_World SHALL show the text `invalid number` and the Display_Escaper form of the raw value.
7. THE Mirror_World SHALL show the stepIndex of each step as `step <stepIndex>` using the same zero-based index that the ward messages use, and WHERE `stepLabels` has an entry for the step, SHALL show that label in a monospace font above the rows of the step.
8. THE Mirror_World SHALL always show a summary line `<N> changes in <M> steps`, where N is the number of Change_Rows and M is the number of steps in `changes`.
9. THE Mirror_World SHALL render every path, table name, row count, step index, and target in a monospace font.
10. WHERE a Change_Row has a Vanish_Effect, THE Mirror_World SHALL keep the path or row count readable at every frame of the effect, SHALL end the effect in a static state that shows the text label `would be removed` and an icon, and SHALL apply the effect only to a background layer.
11. WHERE `realScene` or `mirrorScene` is supplied, THE Mirror_World SHALL render it as a read-only nested key and value list in a monospace font in a collapsed region labelled `Full scene`, with string values passed through the Display_Escaper and with the bounds of Requirement 14, criterion 5.
12. IF `changes` holds no `Change` in any step, THEN THE Mirror_World SHALL show the text `No changes: the ghost run left the mirror unchanged.` and the summary line `0 changes in <M> steps`.
13. THE Mirror_World SHALL NOT state or imply that reality is unchanged; the isolation claim is shown only by the Claim_Banner (Requirement 7).

### Requirement 6: Candle

**User Story:** As a developer, I want the verdict as a candle with a label and the names of the violated wards, so that I read pass, warn, and block at a glance and never by color alone.

#### Acceptance Criteria

1. THE Candle SHALL render exactly one Candle_State for a supplied `verdict.verdict`, with these fixed contents:

| Candle_State | Source | Text label | Accessible label |
|---|---|---|---|
| `lit` | `pass` | `PASS` | `Candle lit: pass. All wards cleared.` |
| `flickering` | `warn` | `WARN` | `Candle flickering: warn. Human approval needed.` |
| `out` | `block` | `BLOCK` | `Candle out: block.` |
| `unknown` | any other value | `UNKNOWN` | `Candle state unknown: verdict not recognized.` |
| `idle` | no `verdict` supplied | `NO VERDICT` | `No verdict yet.` |

2. THE Candle SHALL show, for every Candle_State, an icon, the text label, and the accessible label together, and the icons of the five states SHALL have pairwise different shapes, so that each state is distinguishable in grayscale.
3. THE Candle SHALL list each distinct `wardId` of `violations` in order of first appearance as `Violated ward: <wardId> (<wardKind>)`, in a monospace font, for a verdict of any value.
4. WHEN the verdict is `block` and `violations` is empty, THE Candle SHALL show the text `Violated ward: none reported`.
5. THE Candle SHALL list each violation as `<wardId>: <reason>` and each notice as `step <stepIndex>: <reason>` in the order of the `WardVerdict`, in a monospace font.
6. WHEN the verdict is `warn`, THE Candle SHALL show the number of notices as `<k> notices need review`.
7. IF the verdict is `pass` and `violations` is not empty, THEN THE Candle SHALL still show the `lit` state for the supplied value, SHALL list the violations, and SHALL show the text `Data inconsistent: pass verdict with violations.`
8. IF the verdict value is not `pass`, `warn`, or `block`, THEN THE Candle SHALL show the `unknown` state, SHALL show the Display_Escaper form of the value (at most 40 code points), and SHALL NOT style the state as `lit`.
9. FOR ALL generated `WardVerdict` values with `verdict` in `pass`, `warn`, `block`, THE Candle SHALL show the icon, text label, and accessible label of exactly one Candle_State, determined by `verdict` alone, and SHALL show every distinct `wardId` of `violations` (Property: UI-P2).
10. FOR ALL generated values of the `Needle`, `Thread_Link`, `Finding`, and Grave_Entry inputs of other components, THE Candle Render_Output SHALL be unchanged, because the red thread and the other views are not verdict inputs.
11. THE Candle SHALL announce a change of its Candle_State in a polite live region with the accessible label of the new state.
12. THE Candle SHALL show no text that states that an action is approved or safe; the label texts of criterion 1 are the only state texts.

### Requirement 7: Isolation Claims and Plan B Marking

**User Story:** As a judge or a user, I want the screen to say honestly when no sealed rehearsal took place, so that the kit never claims isolation that did not happen.

#### Acceptance Criteria

1. THE Claim_Banner SHALL accept `claims` of the form `{ mode: 'docker-box' | 'static-analysis'; p1Claimed: boolean; p5Claimed: boolean; p6Claimed: boolean; reason?: 'docker-unavailable' | 'box-image-missing' }`.
2. THE Claim_Banner SHALL show one line each for P1, P5, and P6 with the text `claimed` or `NOT claimed` and an icon, taken from the supplied booleans.
3. WHEN `mode` equals `static-analysis`, THE Claim_Banner SHALL show the text `Static analysis only: no ghost rehearsal took place. P1, P5 and P6 are NOT claimed for this run.`
4. WHEN `reason` equals `docker-unavailable`, THE Claim_Banner SHALL append the text ` Reason: Docker unavailable.`, and WHEN `reason` equals `box-image-missing`, THE Claim_Banner SHALL append the text ` Reason: box image missing.`
5. IF `claims` is absent, malformed, or has `mode` equal to `docker-box` together with any of the three booleans false, THEN THE Claim_Banner SHALL show a banner that names every claim that is not claimed (`P1`, `P5`, `P6`) as `Not claimed for this run: <list>.`, and, for absent or malformed `claims`, the text `Isolation status unknown.`
6. THE Claim_Banner SHALL show the Assurance_Text only WHEN `mode` equals `docker-box` and `p1Claimed` is true; a value that sets `p1Claimed` true with `mode` equal to `static-analysis` SHALL be treated as not claimed.
7. FOR ALL generated `claims` values (including absent and malformed values), THE Render_Output of the Candle container SHALL contain the Assurance_Text if and only if `mode` equals `docker-box` and `p1Claimed` is true, and SHALL contain the banner of criterion 3 or 5 if and only if that condition does not hold (Property: UI-P7).
8. THE UI_Kit SHALL render the Claim_Banner in the same container as every Candle, including the Candle inside the Seance_View, and SHALL NOT use the words `sealed` or `isolated` in any other fixed text of the kit.
9. THE UI_Kit SHALL NOT raise or infer a claim: a claim is shown as claimed only when the supplied boolean is `true`.

### Requirement 8: Blacklight

**User Story:** As a reviewer of a possessed text, I want a switch that makes the hidden text glow with its code points, so that I see what the agent saw and a human could not.

#### Acceptance Criteria

1. THE Blacklight_Switch SHALL be a control with the role `switch`, the accessible name `Blacklight`, the states `on` and `off` with the default `off`, and a visible text `Blacklight: off` or `Blacklight: on` next to an icon.
2. WHEN the user activates the Blacklight_Switch with the Enter key, the Space key, or a pointer click, THE Blacklight_View SHALL change its state between `on` and `off`.
3. THE Blacklight_View SHALL show, for each source, a summary line `<source>: <n> findings` with the counts per category (`tag`, `zero-width`, `bidi`, `html-comment`), in both states.
4. THE Blacklight_View SHALL show the text lines of each source with a line number, in a monospace font, in both states; the line numbers and columns SHALL follow the coordinates of the supplied Findings.
5. WHILE the Blacklight_Switch is `off`, THE Blacklight_View SHALL omit from the displayed text every code point that a supplied Finding covers, and SHALL show every other string through the Display_Escaper.
6. WHILE the Blacklight_Switch is `on`, THE Blacklight_View SHALL show each Finding in place as a highlighted marker that carries the category text, the `line:column`, the Hex_Notation of every code point in `codePoints` (at most 20, followed by `+<k> more` when more exist), and the `rendering` string (at most 200 code points, followed by `[truncated]` when cut).
7. THE Blacklight_View SHALL mark a highlighted Finding with a fluorescent background, an icon, the category text, and a dashed underline, so that the marker does not depend on color alone.
8. THE Blacklight_View SHALL show a list of all Findings of a source with exactly one entry per Finding, in the order of `ScanResult.findings`, including Findings that overlap (an `html-comment` Finding that contains a hidden code point run).
9. IF a Finding lies outside the supplied text (its `offset` plus `length` is greater than the number of code points of the text), THEN THE Blacklight_View SHALL list it in a group `Findings that could not be placed` with its fields and SHALL NOT drop it.
10. THE Blacklight_View SHALL NOT scan the text; WHEN the text holds a Hidden_Display_Code_Point that no Finding covers, THE Blacklight_View SHALL show that code point in its Hex_Notation in both states.
11. THE Blacklight_View SHALL show the fixed text `Text analysis does not catch every injection.` in both states.
12. WHEN a source has an empty `findings` array, THE Blacklight_View SHALL show the text `No hidden text found by the blacklight.` for that source.
13. FOR ALL texts that contain Hidden_Display_Code_Points inserted at generated positions and for the `ScanResult` of that text, THE Blacklight_View in the `on` state SHALL list exactly one entry per Finding, and SHALL show the Hex_Notation of every code point of every Finding; and toggling the switch from `off` to `on` and back to `off` SHALL restore the Render_Output of the first `off` state (Property: UI-P10).

### Requirement 9: Red Thread

**User Story:** As a reviewer of a blocked action, I want a visible thread from the action to the line the agent read, so that I see which document possessed the agent.

#### Acceptance Criteria

1. THE Red_Thread_View SHALL render one Thread for each index `i` of `needles` paired with `links[i]`, in the order of `needles` (Property: UI-P11).
2. THE Red_Thread_View SHALL show the action end of a Thread as `step <stepIndex>`, the `origin` (`effect`, `observed-destination`, or `observed-path`), and the `value` through the Display_Escaper, and, WHERE `actionLabels` has an entry for the step, that label.
3. WHEN `links[i].status` equals `found`, THE Red_Thread_View SHALL show the cause end with `source`, `kind`, `line:column`, and `lineText`, and SHALL draw a red line from the action end to the cause end.
4. WHEN `links[i].status` equals `found` and `matchedKey` equals `host`, THE Red_Thread_View SHALL show the text `matched host key`.
5. WHEN `links[i].status` equals `found` and `hidden` is true, THE Red_Thread_View SHALL show the text `hidden text` with an icon and the text `Turn on the blacklight to reveal it.`
6. WHEN `links[i].status` equals `not-found`, THE Red_Thread_View SHALL draw no line, SHALL show no cause end, and SHALL show the text `No cause found in the texts the agent read. Not found does not mean safe.`
7. THE Red_Thread_View SHALL give each Thread an accessible name of the form `Red thread: <value> at step <stepIndex> to <source> line <line> column <column>` for a `found` link and `Red thread: <value> at step <stepIndex>, no cause found` for a `not-found` link, so that the connection is available as text and not only as a drawn line.
8. IF `needles` and `links` differ in length, THEN THE Red_Thread_View SHALL render the pairs up to the shorter length and SHALL show the text `Red thread data mismatch: <a> needles, <b> links.`, and SHALL NOT guess a pairing.
9. THE Red_Thread_View SHALL show the fixed text `The red thread finds literal occurrences only.`
10. WHEN `needles` is empty, THE Red_Thread_View SHALL show the text `No addresses or paths to trace.`
11. THE Red_Thread_View SHALL show `line:column`, `lineText`, and step numbers in a monospace font.
12. FOR ALL generated pairs of Needle and Thread_Link lists of equal length, THE Red_Thread_View SHALL render one Thread per pair in order, SHALL show for each `found` link the exact `source`, `line`, and `column` of the link, and SHALL show no cause end for any `not-found` link (Property: UI-P11).

### Requirement 10: Graveyard and Seance Detail

**User Story:** As a developer who runs agents unattended, I want a graveyard of the commands that were blocked, so that I can see what was stopped and open the detail of each case.

#### Acceptance Criteria

1. THE Grave_Entry SHALL carry `id` (a string that matches `^[A-Za-z0-9_-]{1,64}$`), `command` (a string), `recordedAt` (a string, an ISO 8601 UTC time such as `2026-11-20T02:14:09Z`), `wardIds` (a list of strings), and optionally `detail` with any of `wardVerdict`, `changes`, `claims`, `sources`, `needles`, `links`, and `actionLabels` of the types of Requirement 2, criterion 3.
2. THE Graveyard SHALL show exactly one Tombstone per Grave_Entry, and each Tombstone SHALL show the command (monospace, compact form of Requirement 3, criterion 6), the `recordedAt` text as supplied (monospace), and every ward id of `wardIds` (Property: UI-P9).
3. THE Graveyard SHALL order the Tombstones by the instant that `recordedAt` denotes, latest first, SHALL keep the input order for equal instants, and SHALL place an entry whose `recordedAt` is not a valid ISO 8601 UTC time after all valid entries in input order and SHALL mark it with the text `time unreadable`.
4. THE Graveyard SHALL show the summary line `<N> blocked commands`.
5. THE Tombstone SHALL be a button with the accessible name `Open seance for blocked command <command>, recorded <recordedAt>, ward <ids>`, and WHEN the user activates it with Enter, Space, or a pointer click, THE Graveyard SHALL call `onOpenSeance` once with the `id`.
6. IF the `id` of a Grave_Entry does not match the pattern of criterion 1, THEN THE Graveyard SHALL show the Tombstone as disabled with the text `No seance link: invalid id` and SHALL NOT call `onOpenSeance` for it.
7. THE Graveyard SHALL show every entry that it receives, including entries with equal ids, and SHALL NOT merge or drop entries.
8. THE Seance_View SHALL show the full command, `recordedAt`, and ward ids of the Grave_Entry, and, for each part of `detail` that is present, the Candle with the Claim_Banner, the Mirror_World, the Blacklight_View, and the Red_Thread_View; for each part that is absent, THE Seance_View SHALL show the text `<part> not recorded`.
9. THE Seance_View SHALL provide a control `Back to graveyard` that calls `onBack`, and WHEN the Seance_View closes, THE UI_Kit SHALL return keyboard focus to the Tombstone that opened it.
10. THE UI_Kit SHALL NOT route, fetch, or build a URL for the seance; the seance link `<base>/seance/<id>` of the ward messages and the retrieval of a Grave_Entry are owned by the app (Assumption A3).
11. WHEN `entries` is empty, THE Graveyard SHALL show the text `No blocked commands yet.`
12. FOR ALL generated lists of Grave_Entries, THE Graveyard SHALL render one Tombstone per entry, SHALL show the command, `recordedAt`, and every ward id of each entry, and SHALL order the Tombstones by criterion 3 (Property: UI-P9).
13. THE Tombstone SHALL have an arch or rectangle outline and SHALL NOT use a cross shape.

### Requirement 11: Lights On Theme

**User Story:** As a developer who works in a bright room, I want one switch to a calm bright theme, so that I can use the kit every day.

#### Acceptance Criteria

1. THE Lights_Toggle SHALL be a control with the role `switch`, the accessible name `Lights on`, and a visible text `Lights: off` or `Lights: on` next to an icon.
2. THE UI_Kit SHALL start in the Theme `dark`, or in the Theme of `initialTheme` WHERE it is supplied.
3. WHEN the user activates the Lights_Toggle, THE UI_Kit SHALL set the attribute `data-theme` of the root element to the other Theme value (`dark` or `light`) in the same render commit.
4. WHEN the Theme changes, THE UI_Kit SHALL keep the state of every component (the Blacklight_Switch state, the open Seance_View, and the scroll position of each list) without remounting the component.
5. THE UI_Kit SHALL take every color from the Theme_Tokens, and a stylesheet-scan test SHALL fail when a stylesheet or a component sets a color value outside the Theme_Tokens.
6. THE Theme_Tokens SHALL follow the colour rules of `.kiro/steering/halloween-ui.md`: a dark background in `dark` and a light background in `light`; ghost elements desaturated and semi-transparent; `block` red; `warn` amber; `pass` neutral with a warm white candle; the concrete values are a design decision (Assumption A5).
7. THE UI_Kit SHALL keep the five Candle_States distinguishable by icon and text in both Themes.
8. THE UI_Kit SHALL NOT store the Theme choice (Assumption A9).

### Requirement 12: Accessibility

**User Story:** As a developer who uses a keyboard or a screen reader, I want every part of the kit to be operable and readable, so that the tool is usable in a professional setting.

#### Acceptance Criteria

1. THE UI_Kit SHALL make every interactive element (the Lights_Toggle, the Blacklight_Switch, each Tombstone, `Back to graveyard`, and each reveal control of Requirement 14) reachable with the Tab key in DOM order, operable with Enter or Space, and free of keyboard traps.
2. THE UI_Kit SHALL show a focus indicator on every interactive element with a contrast ratio of at least 3:1 against the adjacent colors and a thickness of at least 2 CSS pixels.
3. THE UI_Kit SHALL give every interactive element and every status indicator (the Candle, the Claim_Banner, each Vanish_Effect label, each highlighted Finding, and each Thread) a non-empty accessible name, and SHALL hide purely decorative icons from assistive technology with `aria-hidden`.
4. THE UI_Kit SHALL pair every color signal with an icon and a text label (WCAG 1.4.1): the Candle_States, the Vanish_Effect, the highlighted Findings, the failed state of a claim, and the red thread.
5. WHILE the operating system setting `prefers-reduced-motion: reduce` is set, THE UI_Kit SHALL run no CSS animation and no CSS transition with a duration above 0, and SHALL show the end state of every effect statically; a stylesheet-scan test SHALL fail when an animation or a transition rule is not disabled in that media query.
6. THE UI_Kit SHALL define each animation with a finite iteration count, a duration of at most 1 second per iteration, and a total duration of at most 3 seconds, and SHALL contain no `infinite` iteration count.
7. THE UI_Kit SHALL cause no element to flash more than 3 times in any one-second period.
8. FOR ALL Themes and ALL Contrast_Pairs declared in the Theme_Tokens, THE contrast ratio (WCAG relative luminance, computed after alpha compositing over the backdrop of the pair) SHALL be at least 4.5:1 for the role `text`, at least 3:1 for the role `large-text`, and at least 3:1 for the role `graphic` (Property: UI-P6).
9. THE Theme_Tokens SHALL export the Contrast_Pairs of each Theme, and a stylesheet-scan test SHALL fail when a stylesheet uses a foreground and background color combination that is not declared as a Contrast_Pair.
10. THE contrast function of the test suite SHALL return 21 for black on white, 1 for equal colors, and a value that is symmetric in its two arguments.
11. THE UI_Kit SHALL render no sound and SHALL ship no audio file; the steering rule "sound off by default" holds because no sound exists (Assumption A12).
12. THE UI_Kit SHALL render no effect that hides a number, a path, a line number, or a status label (steering rule on typography and numbers); fog and Vanish_Effect layers SHALL lie behind the text.

### Requirement 13: Static Hosting, Assets, and Content Rules

**User Story:** As a maintainer, I want the kit to run on static hosting with original or CC0 assets and without prohibited imagery, so that the Playground needs no server and the repository passes its own rules.

#### Acceptance Criteria

1. THE UI_Kit SHALL build to static files (HTML, JavaScript, CSS, and assets) that run without a server of its own.
2. WHEN every component is rendered in the test environment with `fetch`, `XMLHttpRequest`, `WebSocket`, and `navigator.sendBeacon` replaced by functions that throw, THE UI_Kit SHALL call none of them.
3. THE build output SHALL reference no external origin: no `<script src>`, `<link href>`, `@import`, or `url()` that points to another origin than that of the page.
4. THE UI_Kit SHALL include no analytics, telemetry, tracking script, or font hosted on a CDN; fonts SHALL be a system monospace stack or files bundled in the package with their license listed in the README.
5. THE UI_Kit SHALL use only original or CC0 assets for icons, flame and smoke shapes, and tombstone shapes, and the README SHALL list the source of each.
6. THE UI_Kit SHALL contain no religious symbol (cross, crucifix), no trademark, logo, or character of another company, no copyrighted audio, and no real attack code as UI content.
7. THE UI_Kit SHALL use a calm ghost tone and SHALL contain no blood imagery, no jump-scare effect, and no full-screen flash.
8. THE UI_Kit SHALL write all user-visible text, code, comments, and fixtures in English.
9. THE `ui/` package SHALL be covered by the repository MIT license and SHALL include no code copied from another project.

### Requirement 14: Empty States, Unreadable Input, and Bounded Rendering

**User Story:** As a user, I want the kit to say what is missing and to keep working on bad data, so that an empty report or an unknown value never produces a blank or broken screen.

#### Acceptance Criteria

1. THE UI_Kit SHALL show these fixed texts for empty input: Mirror_World `No changes: the ghost run left the mirror unchanged.`; Graveyard `No blocked commands yet.`; Blacklight_View with no sources `No texts to scan.`; Red_Thread_View `No addresses or paths to trace.`; Candle with no verdict `No verdict yet.`
2. IF a prop of a component has a value outside its contract (a non-array where an array is expected, a missing required field, or a wrong field type), THEN THE component SHALL show the Placeholder `Data unavailable: <component name> received unreadable input.` in an element with the role `alert`, and SHALL NOT throw.
3. IF one element of a list prop is unreadable, THEN THE component SHALL show an item `Unreadable item <index>` at the position of that element and SHALL still show the other elements.
4. THE UI_Kit SHALL wrap each top-level component in an error boundary whose fallback shows the Placeholder and no text from the error or the data, so that a failure in one component does not remove the others.
5. WHERE a list or tree holds more elements than the initial render limit of its component (Mirror_World rows, `Scene` entries, Blacklight_View lines, Tombstones, Threads), THE component SHALL render the first elements up to the limit, SHALL show the text `Showing <shown> of <total>`, and SHALL provide a reveal control that renders all elements and is operable by keyboard (Assumption A8).
6. THE detail views SHALL show a single string field up to 4,096 code points and SHALL append `[truncated]` when a string is cut (Assumption A8).
7. FOR ALL generated JSON values given as the props of any component (`fc.anything()` restricted to JSON values, including `null`, numbers, deeply nested arrays, and objects with unknown fields), THE component SHALL render without throwing and SHALL produce either its normal output or the Placeholder (Property: UI-P8).

### Requirement 15: Property-Based and Example Tests

**User Story:** As a maintainer, I want the render rules checked on random input, so that a missed change, a wrong candle, a leaked canary, or a low-contrast color is found by the machine and not by a judge.

#### Acceptance Criteria

1. THE test suite SHALL use `vitest` and `fast-check`, SHALL run every property of this requirement with at least 100 generated examples in a Short_Run (finishing within 60 s on the Reference_Machine) and at least 10,000 generated examples in a Nightly_Run, and SHALL print the seed of a failing run.
2. THE property table SHALL be the following; each property is stated in the acceptance criterion named in its last column:

| Property | Statement | Generators | Criterion |
|---|---|---|---|
| UI-P1 Change coverage | Each Change appears in exactly one Change_Row | arbitrary `Change[][]` with known kinds, unknown kinds, wrong shapes, empty steps | Requirement 5, criteria 3 and 4 |
| UI-P2 Candle mapping | Each verdict maps to exactly one state with icon, label, and every violated ward id | all three verdicts, arbitrary `WardViolation[]` and `WardNotice[]` | Requirement 6, criterion 9 |
| UI-P3 No hidden characters | No Hidden_Display_Code_Point appears in the Render_Output | strings with hidden code points (built from escapes) in every displayed field | Requirement 3, criterion 8 |
| UI-P4 No secret forwarding | Extra fields that hold a canary are never rendered | props with extra fields holding generated canaries | Requirement 4, criterion 5 |
| UI-P5 Markup inertness | Output has only allow-listed elements and attributes | strings with markup-like text, quotes, and `javascript:` text | Requirement 4, criterion 3 |
| UI-P6 Contrast | Every Contrast_Pair of both Themes meets its ratio | every pair of each Theme (exhaustive enumeration) | Requirement 12, criterion 8 |
| UI-P7 Claim honesty | Assurance_Text appears only for a docker-box run with P1 claimed | arbitrary `claims` including absent and malformed | Requirement 7, criterion 7 |
| UI-P8 Totality | No input makes a component throw | arbitrary JSON values as props | Requirement 14, criterion 7 |
| UI-P9 Graveyard coverage and order | One Tombstone per entry with command, time, and ward ids, in the defined order | arbitrary Grave_Entry lists with valid and invalid times and ids | Requirement 10, criterion 12 |
| UI-P10 Blacklight coverage and involution | One list entry per Finding, all code points shown, off-on-off restores the output | texts with inserted hidden code points and their `ScanResult` | Requirement 8, criterion 13 |
| UI-P11 Red thread pairing | One Thread per pair, exact coordinates, no cause for `not-found` | equal-length lists of `Needle` and `Thread_Link` | Requirement 9, criterion 12 |

3. THE UI-P1 to UI-P11 numbers SHALL denote only the properties of this spec, and the test files and the README SHALL NOT use them for P1 to P8 of the safety contract.
4. THE property tests that need a `ScanResult` SHALL build it with the possession scanner as a test-only oracle or with a generator that satisfies the `Finding` position rules of the possession spec (Requirement 3, criterion 10 of that spec).
5. THE test suite SHALL run each property on the Render_Output of the components in the test environment; the choice of the DOM environment and of the serializer is a design decision.
6. THE test suite SHALL include example tests for: a block verdict with `no-data-loss` and the reason `would delete 1,206 rows from users` (the candle is out, the ward name and `1,206` are visible); a Plan B run (banner shown, no Assurance_Text); a README text whose destination `setup-check.example` is hidden in tag characters (red thread `found`, `hidden` true, the blacklight shows the decoded word); a tombstone opened by keyboard; and the lights-on switch.
7. THE test suite SHALL keep each shrunk counterexample that a property found as a fixed example test.

### Requirement 16: Repository Hygiene

**User Story:** As a maintainer, I want the kit sources and tests to pass the repository's own rules, so that the repository stays clean under the blacklight.

#### Acceptance Criteria

1. THE source files, tests, fixtures, and styles of `ui/` SHALL contain no literal Hidden_Display_Code_Point and no literal HTML comment opener; tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`.
2. THE repository SHALL contain a test that runs the possession Scan_Entry_Point over the files of `ui/` (excluding `node_modules` and `dist`) and `.kiro/specs/ui-kit/`, and the test SHALL expect the outcome `clean`.
3. THE fixtures of `ui/` that name a host SHALL use only the reserved suffixes `.example`, `.test`, `.localhost`, and `.invalid`, and the fixtures that name a secret SHALL use only canary values such as `sk-CANARY-abc123`.
4. THE `ui/` fixtures SHALL contain no real credential, no real domain, and no real IP address (the documentation range `192.0.2.0/24` is allowed).
5. THE `ui/dist` output and `node_modules` SHALL be listed in `.gitignore`.

## Out of Scope

- The 3D ghost overlay and the haunted-variant ghost arms of Ghost Hand; they are decided in the spec of the second app after the 11/19 decision.
- The wards editor (owned by the `ghost-shell` spec), the purify button that applies `sanitizeText`, and the approval flow for a `warn` verdict; these are app behavior.
- The salt line around protected paths (optional in the steering).
- Routing, retrieval, and storage of seance pages and graveyard entries, and the production of Grave_Entries by the `ghost-log` hook (the `kiro-integration` spec).
- Demo video captions; the caption rule of the steering applies to the demo video and not to the kit, which embeds no video.
- Sound, music, and any audio toggle.
- Kiro Crew integration and any feature outside the six components of this spec.
- Computing verdicts, diffs, findings, or thread links (owned by `core`, `wards`, and `possession`).

## Assumptions and Open Questions

These items are not decided by the existing specs or steering; this spec does not invent an answer.

- **A1. Possession types in `core`.** The `possession` spec leaves the package placement open (its Design Decision D1) and `core/src/index.ts` does not export `Finding`, `ScanResult`, `Needle`, or `Thread_Link` yet. The structure steering assigns the detector to `core/`, and the UI_Kit may depend on `core` only, so this spec assumes the types reach the UI_Kit through the public entry point of `@ghost-run/core`. If the possession design places them in another package, the dependency direction of `ui/` or the structure steering must change in that spec before the UI_Kit is implemented.
- **A2. Scene schema.** No spec defines the shape of the `Scene` that a world returns; `ghost-runner/src/world/render.ts` is a stub. The Mirror_World therefore builds its rows from `Change` values and shows a `Scene` only as a generic read-only tree. World-specific scene renderers need a Scene schema decision in the world specs.
- **A3. Grave_Entry and seance ids.** No spec defines the graveyard record or the seance id source (wards Open Item 11 hands this to this spec and to `kiro-integration`). This spec defines the Grave_Entry as a UI input only and accepts any id that matches `^[A-Za-z0-9_-]{1,64}$`, the same pattern as the ward messages. The producer (`ghost-log`) and the seance route are owned by `kiro-integration` and the apps.
- **A4. Isolation_Claims.** `GhostReport` has no isolation field (wards Open Item 10), and `ui/` cannot import `Isolation` from `ghost-runner`. The UI_Kit defines `Isolation_Claims` as a structural subset of the ghost-runner `Isolation` object, so that an `Isolation` value is assignable. Moving `Isolation` to `core` is an option for a later change.
- **A5. Color tokens and fonts.** The steering fixes color roles (dark and light background, red for `block`, amber for `warn`, warm white for `pass`, desaturated semi-transparent ghosts) and requires a monospace font, but gives no color values or font family. The design phase chooses the values; Property UI-P6 is the acceptance test. No value is fixed here.
- **A6. Zero-width joiner in emoji.** The possession scanner permits U+200D inside an emoji ZWJ sequence, but the Display_Escaper escapes every U+200D, so a family emoji shows as separate emoji with `<U+200D>` between them. This is the conservative choice; it can be relaxed if `core` exports a way to recognize a permitted joiner.
- **A7. Secrets typed into display strings.** The kit never receives `secretValues` or payloads. A command string or `Scene` value that already contains a secret typed by an agent cannot be recognized by the kit. The wards spec keeps secrets out of verdicts and messages; redaction of commands in the graveyard belongs to the producer. Property UI-P4 therefore covers extra fields and forbidden input types, not secrets inside allowed string fields.
- **A8. Display limits.** The compact limit of 120 code points follows the ward message rule. The detail limit of 4,096 code points, the initial render limits per component, and the 20-code-point cap in the blacklight marker are proposals; the design phase sets the render limits and records them with their reasons.
- **A9. Theme persistence and default.** The steering sets the dark theme as the default and gives no rule for remembering the choice or for following `prefers-color-scheme`. This spec starts in `dark`, stores nothing, and ignores `prefers-color-scheme`. Remembering the choice needs a decision on storage.
- **A10. Time display.** `recordedAt` is shown as supplied in UTC. Locale formatting is excluded to keep the output deterministic.
- **A11. 3D overlay in the plan.** `docs/plan.md` and the structure steering list the 3D ghost overlay under `ui/`. This spec excludes it until the 11/19 decision; if the second app is Ghost Hand, its spec decides whether the overlay lives in `ui/` or in `apps/ghost-hand/`, and the structure steering is updated then.
- **A12. Sound.** The steering allows sound that is off by default. This spec ships none; a later sound feature needs its own requirement and a CC0 or original source.
- **A13. Plan B wording.** The banner text of Requirement 7 includes P1, while the ward message line of wards Requirement 17, criterion 5 names only P5 and P6. The texts are not required to be identical; if one wording is wanted, one of the specs changes.
- **A14. Test environment and timing.** The DOM test environment, the serializer, and an accessibility audit tool are design decisions. DOM-based properties may not fit the 60-second Short_Run limit with 100 examples; the design may run the pure view-model part of a property at full size and the DOM part at a smaller size, and records that choice.
- **A15. Step labels.** The kit cannot import the `ShellAction` type of `ghost-runner`, so the host passes plain strings in `stepLabels` and `actionLabels`.
- **A16. Property notation.** The existing specs state properties as `FOR ALL ... SHALL ...` criteria and label them with the P number in parentheses or in prose; none uses a `Property:` label. This spec keeps the `FOR ALL` form and adds `(Property: UI-Pn)` at the end of each such criterion.

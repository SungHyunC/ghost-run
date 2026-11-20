# Requirements Document

## Introduction

`ghost-cloud` mirrors an S3-compatible object store: buckets, the objects in them, the access control list (ACL) of each bucket, and the public access block of each bucket. An agent drives the store with AWS CLI command lines such as `aws s3 rb s3://prod-assets --force`. A ghost run of this world rehearses those lines on an in-memory copy, so that a plan that deletes a protected bucket, or makes it public, is blocked before it reaches a real store. The demo scene is the plan `aws s3 rb s3://prod-assets --force`, which the ward `no-bucket-delete` blocks.

The world is registered by `worlds/ghost-cloud/world.config.ts` and judged by the wards in `worlds/ghost-cloud/wards.yaml`. It inherits the ghost runner, the wards engine, the possession detector, and the UI kit from `core/` and `ui/`. It uses the existing ward kinds of `@ghost-run/core` and does not change `core/`.

This spec covers the playground world only. Safety claims follow the world-contract steering ("Claimed in" column). The scope table is in Requirement 8.

## Glossary

- **World**: The adapter `World<State, Action>` of `worlds/ghost-cloud/`.
- **State**: The in-memory model of the mirror world: a map of buckets, each with its objects, its ACL value (`private` or `public-read`), and a flag `publicAccessBlocked`; plus a read-only map of virtual local files that `aws s3 cp` can upload.
- **Action**: One plan step, parsed from an AWS CLI line into a discriminated union (Requirement 1).
- **Change**: A `Change` object returned by `diff`. This world emits only the `FileChange` shapes `file-created`, `file-overwritten`, and `file-deleted`, on the virtual paths of Requirement 2, criterion 4.
- **Reality**: The in-memory object store instance that the world owns, as `worlds/playground-shell` owns its in-memory file system. There is no network, no AWS account, no Docker, and no LocalStack.
- **Protected_Bucket**: A bucket whose name starts with `prod-`.
- **Unsupported_Step**: A plan line that is not in the supported subset of Requirement 1. It is recorded and not rehearsed, and it raises the verdict of the run to at least `warn` (Requirement 12, criterion 6).
- **Reference_Model**: The independent model inside the `testAdapter` (Requirement 3, criterion 3). It is written apart from the `step` and `diff` of the World and shares no value import with them.
- **Attribute_Path**: A virtual path that holds a bucket attribute (`_acl/BUCKET` or `_public-access-block/BUCKET`). The prefixes `_acl` and `_public-access-block` can never be a bucket name, because bucket names contain no `_`.
- **Registration_Gate**: The function `verifyWorld` of `@ghost-run/core/verify`, called by `worlds/ghost-cloud/tests/contract.test.ts`.
- **Wards_File**: `worlds/ghost-cloud/wards.yaml`.
- **Pipeline_Entry**: The browser-safe function of Requirement 12.
- **Short_Run**: A save-time run with 100 examples per property (20 for a Docker-bound property), finishing within 60 s.
- **Nightly_Run**: A run with `GHOST_PBT_MODE=nightly` and 10,000 examples per property.

## Requirements

### Requirement 1: World State and Actions

**User Story:** As a world author, I want the state and the actions of `ghost-cloud` defined as plain data, so that a snapshot is a deep copy and a step is a pure function of it.

#### Acceptance Criteria

1. THE World SHALL define State as plain, serializable data with no handle to Reality (no open file, socket, or client object).
2. THE World SHALL define Action as a discriminated union with a `kind` field. The supported subset is exactly these AWS CLI forms:

| Action kind | CLI form | Fields |
|---|---|---|
| `ls` | `aws s3 ls` and `aws s3 ls s3://BUCKET[/PREFIX]` | `bucket?`, `prefix?` |
| `mb` | `aws s3 mb s3://BUCKET` | `bucket` |
| `rb` | `aws s3 rb s3://BUCKET [--force]` | `bucket`, `force` |
| `cp` | `aws s3 cp SOURCE DEST`, where SOURCE is a virtual local file and DEST is `s3://BUCKET/KEY`, or both are `s3://` URIs | `source`, `bucket`, `key` (and `fromBucket`, `fromKey` for a copy between buckets) |
| `rm` | `aws s3 rm s3://BUCKET/KEY` and `aws s3 rm s3://BUCKET[/PREFIX] --recursive` | `bucket`, `key`, `recursive` |
| `put-bucket-acl` | `aws s3api put-bucket-acl --bucket BUCKET --acl private` or `--acl public-read` | `bucket`, `acl` |
| `put-public-access-block` | `aws s3api put-public-access-block --bucket BUCKET --public-access-block-configuration BlockPublicAcls=B,IgnorePublicAcls=B,BlockPublicPolicy=B,RestrictPublicBuckets=B` | `bucket`, `blocked` (true when all four flags are `true`) |
| `delete-public-access-block` | `aws s3api delete-public-access-block --bucket BUCKET` | `bucket` |
| `unsupported` | any other line | `line`, `reason` |

   Every form may carry the option `--endpoint-url URL`, which is parsed into the field `endpointUrl` (Requirement 2, criterion 7). The parser accepts the plain forms `aws s3 ...` and `aws s3api ...` only.
3. WHEN a plan line is not in the table, is malformed (missing argument, unknown option, bucket name outside 3 to 63 characters of `a-z`, `0-9`, `.`, `-`), is longer than 1,024 characters, or contains a shell operator (`;`, `|`, `&`, a backtick, `$(`, or a redirect), THE parser SHALL return an `unsupported` action with a short reason and SHALL NOT throw.
4. WHEN a supported action is invalid for the current state (the bucket does not exist, the bucket already exists, the bucket is not empty and `--force` is absent, the virtual local file does not exist, or the object key is empty, absolute, contains an empty segment or a `..` segment), THE World SHALL return the snapshot unchanged with `result` set to `{ success: false, error }` and SHALL NOT throw.
5. WHEN a step applies an `unsupported` action, THE World SHALL return the snapshot unchanged with `result` set to `{ success: false, error }` whose text starts with `unsupported step`, and SHALL record the line so that the Pipeline_Entry can lower the claim (Requirement 12, criterion 4).
6. THE World SHALL contain no clock, random source, or environment read inside `step`, `diff`, or `render`. The state holds no timestamp, no ETag, and no request id. Object content is a string.
7. THE initial state SHALL be a fixed fixture: the Protected_Buckets `prod-assets` and `prod-logs`, the temporary bucket `tmp-build-cache`, a few objects in each, and a few virtual local files. Every bucket starts with ACL `private` and `publicAccessBlocked: true`.

### Requirement 2: The Six World Functions

**User Story:** As a world author, I want each of the six functions to meet its contract, so that the ghost runner, the wards engine, and the UI kit work on `ghost-cloud` without change.

#### Acceptance Criteria

1. THE World SHALL implement all six functions of `World<S, A>`: `snapshot`, `step`, `diff`, `render`, `fingerprint`, and `effectsOutside`.
2. WHEN `snapshot()` is called, THE World SHALL return a deep copy of the current state and SHALL NOT modify Reality.
3. WHEN `step(s, a)` is called, THE World SHALL apply one action to a snapshot and SHALL NOT modify Reality or the input snapshot `s`.
4. WHEN `diff(before, after)` is called, THE World SHALL return the minimal set of `FileChange` objects between the two snapshots, using this virtual path model:

| Thing | Virtual path | Present when |
|---|---|---|
| Bucket | `BUCKET` | the bucket exists |
| Object | `BUCKET/KEY` | the object exists |
| Bucket ACL | `_acl/BUCKET` | the bucket exists (value is `private` or `public-read`) |
| Public access block | `_public-access-block/BUCKET` | public access is blocked for the bucket |

   The attributes sit outside the bucket's path tree, under prefixes that can never be a bucket name, so that the path of a bucket and its objects never covers an Attribute_Path.

   "Minimal" means all of the following:
   - A bucket that exists in the first snapshot and not in the second yields `file-deleted` for the bucket path and for each of its object paths, and nothing for its Attribute_Paths.
   - A bucket that exists in the second snapshot and not in the first yields `file-created` for the bucket path and for each of its object paths, and nothing for its Attribute_Paths.
   - For a bucket that exists in both snapshots, one change per object path or Attribute_Path whose presence or content differs: `file-created` for a path that appears (an object, or the public access block), `file-deleted` for a path that disappears, and `file-overwritten` for a path whose content differs (an object with new content, or the ACL with a new value). Attribute changes (ACL overwritten, block created or deleted) are emitted only for such a bucket.
   - A path whose content is identical in both snapshots yields no change. An action that leaves content identical (for example a copy of the same content to the same key) produces no change.
   - Each path appears at most once. The list is sorted by path in code-point order, so that it is stable.
   - Each change has exactly the fields `kind` and `path`.
5. WHEN `render(s)` is called, THE World SHALL return a `Scene` for the UI kit and SHALL have no side effect. The scene lists each bucket as a group with its objects, its ACL value, and its public-access-block state, in sorted order. It carries no timestamp.
6. WHEN `fingerprint()` is called, THE World SHALL return a `FingerprintResult` (Web Crypto SHA-256, as declared in `core/`) over the canonical serialization of the state of Reality, with a manifest keyed by the virtual paths of criterion 4, including the Attribute_Paths of every bucket. The serialization sorts keys, so the hash is stable.
7. WHEN `effectsOutside(a)` is called, THE World SHALL return one `Effect` of kind `network` for every action that carries `--endpoint-url`, with `destination` set to the host of the URL (the sanitized raw text when the URL does not parse), and an empty list for every other action, including `unsupported` actions. The copy has no endpoint URL, so any `--endpoint-url` reaches outside the copy. The action is still rehearsed on the copy as if the option were absent.

### Requirement 3: Registration Gate

**User Story:** As a maintainer, I want a world to appear in the playground only after the gate passes, so that an unverified world cannot claim a property.

#### Acceptance Criteria

1. THE repository SHALL contain `worlds/ghost-cloud/tests/contract.test.ts` that calls `verifyWorld` with `id: 'ghost-cloud'`, `deterministic: true`, `wardSet` (parsed from the Wards_File), `actionArb`, `testAdapter`, and `numRuns`.
2. THE Registration_Gate SHALL pass P1 (a ghost run never changes reality: the fingerprint before equals the fingerprint after, for any action list) and P3 (restoring a snapshot returns the world to exactly its pre-snapshot state) in a Short_Run.
3. THE world is deterministic, so THE Registration_Gate SHALL also pass P2. THE test SHALL supply a `testAdapter` that is a Reference_Model: a separate model written apart from the `step` and `diff` of the World, for example a flat `Map` from virtual path to content, updated imperatively per action by its own small interpreter, which returns the change set of each action. P2 means: the diff of the ghost run equals the change set of the independent Reference_Model for the same actions. The Reference_Model SHALL import no value from the `step`, `diff`, `render`, or fixture code of the World (type imports are allowed), and a test SHALL scan its imports for this. P2 checks the `diff` and the copy separation of this world against a second implementation. It is not a test of fidelity to a real S3 service, a moto server, or the AWS CLI.
4. THE `actionArb` SHALL generate only valid action values and SHALL cover every action kind of Requirement 1 except `unsupported`. It draws bucket names from a small pool (the fixture buckets plus two fresh names) and keys from a small pool, so that generated plans hit existing buckets and objects. A separate unit test covers `unsupported` lines.
5. THE applicable ward properties (P4, P5; P6 does not apply, see Requirement 8) SHALL pass before the world is registered in the playground.

### Requirement 4: Registration File

**User Story:** As a developer, I want a fixed registration shape, so that tools can load any world the same way.

#### Acceptance Criteria

1. THE file `worlds/ghost-cloud/world.config.ts` SHALL default-export an object `{ id, deterministic, wardsFile, create }`, where `id` equals `ghost-cloud`, `deterministic` is `true`, `wardsFile` is the path string `./wards.yaml` that is never imported, and `create` returns the World.
2. THE World SHALL be loadable with `create()` without a network, a Docker daemon, or a real credential.
3. THE `worlds/ghost-cloud/` package SHALL depend on `@ghost-run/core` only. It uses no runtime library of its own, so it adds no dependency and no license entry. Test-only tools (`vitest`, `fast-check`) are already in the repository.

### Requirement 5: Wards of the World

**User Story:** As a user, I want declared wards that judge this world's plans, so that a ghost run ends in pass, warn, or block.

#### Acceptance Criteria

1. THE Wards_File SHALL declare each ward with an `id`, a `kind`, and the rules of that kind.
2. THE Wards_File SHALL declare exactly these wards:

| Ward id | Kind | Rule | Verdict when violated |
|---|---|---|---|
| `no-bucket-delete` | `path` | `deny: [delete]` on `prod-*`. A pattern carries an implicit trailing `**`, so it covers the bucket and every object below it. It does not cover an Attribute_Path, because the Attribute_Paths start with `_`. | block |
| `no-public-bucket` | `path` | `deny: [delete, overwrite]` on `_acl/prod-*` and `_public-access-block/prod-*`. The implicit trailing `**` covers nothing else, because no path has a segment below an Attribute_Path. | block |

   The matching semantics were checked against `compilePathSet` of `core/` (Design, "Ward matching semantics"): `*` matches any run of characters inside one segment including `.`, `-`, and `_`; the first segment must match as a whole, so `prod-*` never matches `_acl/prod-assets`; matching is case-insensitive unless `case_sensitive` is set; the implicit trailing `**` makes a pattern match the path it names and everything below it.

   Because of this layout, each of the four demo plans of Requirement 7 violates at most one ward, and a delete of a Protected_Bucket violates `no-bucket-delete` only.

3. THE mapping onto path wards has these limits, which the world README SHALL state:
   - `no-bucket-delete` denies `delete` only. Overwriting an object of a Protected_Bucket with `aws s3 cp` is not blocked.
   - `no-public-bucket` cannot tell the direction of an ACL change. Every ACL value change on a Protected_Bucket is blocked, including `public-read` back to `private`. Because every bucket starts private and only two ACL values exist, a change from the fixture state is always toward public.
   - A path ward cannot see the content of the ACL. `no-public-bucket` therefore does not check that the new ACL is public; it blocks any overwrite.
   - Public access is treated as made open when the public-access-block path is deleted. `put-public-access-block` with any flag `false` is modeled as removing the block, so it produces `file-deleted` on `_public-access-block/BUCKET`. With all four flags `true` it creates the path if absent. `delete-public-access-block` produces the same `file-deleted`.
   - A bucket attribute is judged only while the bucket exists in both snapshots. Deleting a Protected_Bucket is judged by `no-bucket-delete` only; the attributes that go with it produce no change (Requirement 2, criterion 4).
   - Temporary buckets (names that do not start with `prod-`) are not protected by any ward.
4. WHEN a ward is violated, THE verdict SHALL be `block` and the message SHALL name the ward id and the numbers that violated it.
5. WHEN an action has an effect outside the copy (Requirement 2, criterion 7) and no ward is violated, THE verdict SHALL be `warn`.
6. THE Wards_File SHALL be parsed by `wards-config` and SHALL pass `parseWards` without an error.
7. IF the mapping cannot express a rule exactly, THEN THE README SHALL say so instead of weakening the rule silently. Criterion 3 is that statement.

### Requirement 6: Save-Time Contract Run

**User Story:** As a developer, I want the contract tests to run when I save world code, so that a broken contract shows up at once.

#### Acceptance Criteria

1. WHEN a file under `worlds/ghost-cloud/` is saved by the agent, THE `contract-pbt` hook SHALL run the world suite in a Short_Run and write the result to `.ghost-run/pbt/last.json`.
2. THE whole save-time run SHALL finish within the 60 s hook limit. THE hook stops itself at 55 s.
3. THE world suite SHALL keep its own example count in the test configuration (`numRuns`), and the count SHALL NOT be below 100 in a Short_Run unless a written reason is recorded in `docs/measurements.md`. The measured time of the suite and the chosen count are recorded when the tests are written (not known yet).

### Requirement 7: Scene and Demo

**User Story:** As a viewer, I want to see what the ghost did, so that the verdict is understandable without reading a log.

#### Acceptance Criteria

1. THE `render` output SHALL let the mirror-world component of the UI kit draw the copy before and after the plan, with changes marked.
2. THE world SHALL bundle four demo plans as plan files under `worlds/ghost-cloud/demo/`, one AWS CLI line per row, each with a fixed result on the fixture state:

| Plan | Lines | Verdict | Cause |
|---|---|---|---|
| (a) delete a protected bucket (the demo scene) | `aws s3 rb s3://prod-assets --force` | block | `no-bucket-delete` |
| (b) make a protected bucket public | `aws s3api delete-public-access-block --bucket prod-assets`, then `aws s3api put-bucket-acl --bucket prod-assets --acl public-read` | block | `no-public-bucket` |
| (c) delete a temporary bucket | `aws s3 rb s3://tmp-build-cache --force` | pass | none |
| (d) use a non-copy endpoint | `aws s3 ls --endpoint-url http://s3.example` | warn | effect outside the copy to `s3.example` |

3. A test SHALL run each plan through the Pipeline_Entry and assert the verdict and, for a block, the ward id.
4. THE demo text SHALL state the claim scope of Requirement 8 and SHALL NOT state a property outside it.
5. EACH demo plan SHALL violate exactly one ward or none. A test SHALL assert the exact set of violated ward ids (the distinct `wardId` values of the verdict violations) for each plan: (a) `{no-bucket-delete}` with verdict `block`, (b) `{no-public-bucket}` with verdict `block`, (c) the empty set with verdict `pass`, (d) the empty set with verdict `warn`.

### Requirement 8: Claim Scope

**User Story:** As a maintainer, I want each property asserted only inside its declared scope, so that the README and the UI never over-claim.

#### Acceptance Criteria

1. THE world SHALL assert each property only as the table below allows.

| Property | Allowed claim | Not claimed | For this world |
|---|---|---|---|
| P1 | Ghost run never changes reality, in the playground and in real mode with the Docker box | Docker unavailable (Plan B fallback) | Claimed in the playground: the ghost runs on a snapshot of an in-memory store and the fingerprint before and after is equal. No Docker is involved. Not claimed for any real store. |
| P2 | Same diff when executed for real | Worlds with `deterministic: false` | Claimed for the in-memory model in this form only: the diff of the ghost run equals the change set of an independent Reference_Model for the same actions (Requirement 3, criterion 3). It verifies the `diff` and the copy separation of this world. It is not a test of fidelity to a real S3 service. Not claimed against a real S3 service, a moto server, or any real AWS CLI run. Not claimed for a run that contains an Unsupported_Step. |
| P3 | Restoring a snapshot returns the exact pre-snapshot state | n/a | Claimed. |
| P4 | A stricter ward never increases the set of passing plans | n/a | Claimed (wards engine logic). |
| P5 | A plan that deletes or overwrites a protected path produces `block` (depends on P1) | Where P1 does not hold | Claimed for supported steps inside the playground, within the limits of Requirement 5, criterion 3. Not claimed for a run that contains an Unsupported_Step. |
| P6 | A secret read followed by an unapproved network attempt produces `block` | Plan B fallback; compression, encryption, and DNS exfiltration under content inspection | Not claimed. The world has no secret file and no egress ward. An `--endpoint-url` yields `warn` only. |
| P7 | Hidden Unicode is always flagged | n/a | Inherited from `core/`. The world adds no claim of its own. |
| P8 | Same seed and same plan give the same outcome | Ghost Hand only | not applicable |

2. THE real mode against a local moto server (`moto_server` with `AWS_ENDPOINT_URL=http://localhost:5000`) is not implemented. THE README and the UI SHALL state this and SHALL claim nothing for it.
3. WHEN the execution environment changes, THE UI and the README SHALL lower the claim explicitly.
4. THE README of the world SHALL list the claims and the non-claims of this table and SHALL state the Tested_Environments for P2: the Node version and the browser engine on which the P2 test ran.

### Requirement 9: Scaffold Files

**User Story:** As a developer, I want the standard files created for me, so that I only write the world.

#### Acceptance Criteria

1. WHEN the agent creates the first file under `worlds/ghost-cloud/`, THE `world-scaffold` hook SHALL create `world.config.ts`, `tests/contract.test.ts`, `wards.yaml`, and `README.md` for the files that do not exist yet, and SHALL leave an existing file unchanged.
2. THE generated `world.config.ts` SHALL set `deterministic: false` until the world is shown to be deterministic, and `create` SHALL throw a placeholder error until it is implemented. THE implementation SHALL set `deterministic: true` only after P2 passes.
3. THE generated `tests/contract.test.ts` SHALL fail with a message that names the missing `create` or `actionArb` until they are written.
4. THE hook SHALL fire only for files that the agent created. WHEN a human creates the folder, THE human SHALL run the scaffold by hand or copy the files.

### Requirement 10: Hygiene

**User Story:** As a maintainer, I want the world's files to pass the repository's own rules, so that the repository stays clean under the blacklight.

#### Acceptance Criteria

1. THE source files, fixtures, tests, wards, and documents of this world SHALL contain no literal hidden Unicode character (U+E0000 to U+E007F, U+200B to U+200D, U+2060, U+FEFF, U+202A to U+202E, U+2066 to U+2069) and no literal HTML comment opener. Tests SHALL build such strings with `\u` escapes or `String.fromCodePoint`.
2. THE fixtures SHALL use only canary values as secrets (for example `sk-CANARY-abc123`) and only reserved domains as hosts (`.example`, `.test`, `.localhost`, `.invalid`) or the documentation range `192.0.2.0/24`. Demo and test endpoints use `s3.example`.
3. THE world SHALL write no real credential, real host, user name, or home path in any file. Object content in fixtures is plain filler text.
4. THE repository artifacts of this world SHALL be written in English.
5. THE possession scan (`scanFiles`) of `worlds/ghost-cloud/` and `.kiro/specs/ghost-cloud/` SHALL return `clean`.
6. THE world, its tests, and its scripts SHALL make no network call and no LLM call.

### Requirement 11: Dependencies and Licenses

**User Story:** As a maintainer, I want every library listed with its license, so that the submission is clean.

#### Acceptance Criteria

1. THE world SHALL add no dependency without a license check on the day it is added. The plan is to add none.
2. THE root README dependency table SHALL list each new dependency with name, version, and license. With no new dependency there is no new row.
3. THE code SHALL be new code written for this repository, and audio and icons SHALL be original or CC0 with the source listed in the README. The world has no audio or icon.

### Requirement 12: Pipeline Entry

**User Story:** As a playground developer, I want one browser-safe function that runs a plan and returns everything to show, so that a page can display the run without knowing the world internals.

#### Acceptance Criteria

1. THE directory `worlds/ghost-cloud/` SHALL export a function that takes a plan (an array of AWS CLI lines) and a `WardSet`, and returns a promise of an object with the `GhostReport`, the `WardVerdict` that the Candle shows, the `WardVerdict` of the engine, the agent message, the per-line records of criterion 7, and the scenes of criterion 8.
2. THE function SHALL create a fresh world from the fixed fixture on every call, parse the lines into actions, call `ghostRun`, call `WardEngine.evaluate`, and render the message with `renderMessage` from `@ghost-run/core`. THE message SHALL be rendered from the WardVerdict of criterion 6.
3. THE entry and every module it imports SHALL contain no `node:` import and no import other than `@ghost-run/core` and files of `worlds/ghost-cloud/`. A test SHALL scan the import graph of the entry for this.
4. WHEN the plan contains at least one Unsupported_Step, THE function SHALL pass `claims: { p5: false, p6: false, reason: 'unsupported-step' }` to `renderMessage`, so that the message states that P5 and P6 are not guaranteed for the run. WHEN it contains none, THE function SHALL omit `claims`, because `Claims.p6 = false` would add a lowered-claim line to every run. The P6 non-claim is stated in the README and the demo text instead (Requirement 8).
5. THE function SHALL NOT throw for any plan, including an empty plan, an over-long plan (more than 50 lines is cut off and reported), or lines with hidden characters. Hidden characters in a line make it an Unsupported_Step.
6. THE function SHALL add one notice of kind `unsupported-step` to the notices of the engine verdict for each Unsupported_Step, with the `stepIndex` of the step and the reason text `unsupported command, not rehearsed.`, in `stepIndex` order after the notices of the engine. THE shown verdict SHALL be the maximum of the engine verdict and `warn` when the plan has at least one Unsupported_Step, and the engine verdict otherwise. This is the rule that `apps/ghost-shell/src/pipeline/verdict.ts` applies for Ghost Shell; the function SHALL implement it in its own code and SHALL NOT import from `apps/`.
7. THE function SHALL return, for each plan line that was run, one record with: the line, the kind of the parsed action, whether the step is unsupported, and the step result (`ok`, or the error text).
8. THE function SHALL return the scene of the snapshot before the plan and the scene of the snapshot after the plan, produced by `render`, so that a page can draw reality and the copy without knowing the world internals.
9. EVERY text that the function returns (lines, error texts, reasons, the message, and the scenes) SHALL be plain data: strings, numbers, booleans, arrays, and plain objects only, that survive a JSON round trip unchanged. Text that comes from a plan line SHALL pass `sanitizeJudgeText` of `@ghost-run/core`, so that a hidden character is shown as an escape.
10. THE function SHALL check P1 for every run, as `apps/ghost-shell` does. It SHALL fingerprint Reality before the ghost run and after it, and return `p1: { equal, before, after }`, where `before` and `after` are the hash strings only (no manifest). WHEN the two fingerprints differ, THE shown verdict SHALL be `block`, THE verdict SHALL carry one notice that says the ghost run changed reality and that this is a bug, and THE function SHALL pass `claims: { p5: false, p6: false }` to `renderMessage` (with `reason: 'unsupported-step'` only when the plan also has an Unsupported_Step), so that the message lowers the P1-dependent claims.
11. THE playground page integration (a tab in `apps/ghost-shell`) is outside this spec and consumes this entry.

### Requirement 13: Out of Scope

**User Story:** As a maintainer, I want the boundaries written down, so that the world does not grow beyond the decision.

#### Acceptance Criteria

1. THE world SHALL NOT implement a real mode, a moto server, LocalStack, Docker, or any call to a real AWS service.
2. THE world SHALL NOT model IAM, bucket policies, versioning, multipart upload, presigned URLs, regions, or object metadata.
3. THE world SHALL NOT change `core/`, other worlds, `apps/`, hooks, or `.kiro/agents/`.

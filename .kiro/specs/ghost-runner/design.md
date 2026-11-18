# Design Document: ghost-runner

## Overview

`@ghost-run/ghost-runner` (directory `ghost-runner/`) rehearses a plan of shell actions against a copy of a real repository inside a sealed Docker box and returns a `RunResult` that contains a core `GhostReport<RepoState>`. It supplies the `Repo_World` (a `World<RepoState, ShellAction>`), the box lifecycle (fresh container or optional pool slot), the copier, the diff engine (file changes and SQLite row counts), the in-box recorder (network attempts and secret-file reads), the Original fingerprint check (P1), and the Plan B static-analysis fallback.

It depends on `@ghost-run/core` only. `core/` does not depend on it. The package is a standalone pnpm workspace package at `ghost-runner/`, not under `integrations/`.

**Core_Type_Extensions first (Req 1.6, 1.7).** The runner needs four additions to `core/src/types.ts` and one rule change in `core/src/wards.ts`. They are implemented before any other runner work (work item W0), and the full description is in the section "Core type changes" below.

| Extension | Where | Summary |
|---|---|---|
| `symlink-changed` Change kind | `types.ts` | `{ kind: "symlink-changed", path, targetBefore, targetAfter }`, added to the `FileChange` kinds |
| `dropped` on `SqlRowCountChange` | `types.ts` | optional `dropped?: boolean`; `true` only when the table no longer exists |
| `eventId` on `ObservedEvent` | `types.ts` | optional `eventId?: string`; set only on events with a captured payload |
| `SecretValues` hand-off type | `types.ts` | `ReadonlyMap<string, Uint8Array>` from Copy-relative path to file bytes, passed to `WardEngine.evaluate` |
| `symlink-changed` counts as overwrite | `wards.ts` | `path` wards treat it as an `overwrite` of its `path` |

Scope boundary: ward rule evaluation, `wards.yaml` parsing, and payload content inspection belong to the `wards` spec. This package supplies `Change[]`, `ObservedEvent[]`, and in-memory payload captures. Hook scripts, the MCP server, and UI belong to other specs.

### Design decisions at a glance

| # | Question | Decision |
|---|---|---|
| D1 | Secret-read recording | One `strace -f --seccomp-bpf -e trace=openat,open,openat2,connect,chdir,fchdir` per action, parsed after the step. Path only, never contents. Provisional bound 0.8 s Median_Of_5 (combined with connect tracing), replaced by the trial result. |
| D2 | Recorder output location | An anonymous Docker volume mounted at `/ghost-rec` (not a host path, not inside the Copy), read out with `docker cp` after the run. Tamper-resistance is best effort. `tamperResistant: false` is always reported. |
| D3 | Baseline hashes | Reuse the per-file hashes of the pre-run Original fingerprint. Only ctime candidates are re-hashed in the Copy. No extra hashing pass and no read of Original at diff time. |
| D4 | Box image | Build locally from a Dockerfile in the repo, base image pinned by digest, packages pinned through a Debian snapshot timestamp. No auto-build in the hook path. |
| D5 | Consuming `core` from Node | `tsc` build of `core` to `dist/` with an `exports` map. Tests use a source alias. Bundling is left to the hook spec. |
| D6 | Docker-less behavior | Plan B static analysis, `rehearsed: false`, P1/P5/P6 not claimed, explicit user notice. |

---

## Core type changes

These changes are made in `core/` first (work item W0), before any `ghost-runner` code, so every later runner task compiles against the extended types. They are additive and optional, so existing callers and the existing 35 `core` tests are unaffected. Source today: `core/src/types.ts` knows `file-created`, `file-overwritten`, `file-deleted` (`FileChange`) and `sql-row-count` (`SqlRowCountChange`); `core/src/wards.ts` maps `file-deleted` to the `delete` operation and `file-overwritten` to the `overwrite` operation in `checkPath`, and `isFileChange` accepts only those three kinds.

### `core/src/types.ts`

```ts
export interface FileChange extends Change {
  readonly kind: 'file-created' | 'file-overwritten' | 'file-deleted' | 'symlink-changed';
  readonly path: string;
  readonly targetBefore?: string;   // symlink-changed only
  readonly targetAfter?: string;    // symlink-changed only
}

export interface SqlRowCountChange extends Change {
  readonly kind: 'sql-row-count';
  readonly table: string;
  readonly rowsBefore: number;
  readonly rowsAfter: number;
  readonly dropped?: boolean;       // true only when the table no longer exists (then rowsAfter is 0)
}

export interface ObservedEvent {
  readonly kind: 'network-attempt' | 'secret-read';
  readonly destination?: string;
  readonly path?: string;
  readonly stepIndex: number;
  readonly eventId?: string;        // set only when a payload was captured for this event
}

/** Contents of files that match egress ward `secrets` patterns. In memory only. */
export type SecretValues = ReadonlyMap<string, Uint8Array>;   // key: Copy-relative path, '/' separators

export interface EvaluateInputs {
  readonly secretValues?: SecretValues;
  readonly payloads?: ReadonlyMap<string, Uint8Array>;         // key: ObservedEvent.eventId
}
```

All four are exported through the public entry (`core/src/index.ts`). `EvaluateInputs` is a proposal for the open item on the exact shape; the `wards` spec owns payload content inspection and may refine it, in which case W0 changes before other work starts (see W5).

### `core/src/wards.ts`

- `WardEngine.evaluate(report, wardSet, inputs?: EvaluateInputs)`. The third parameter is optional, so the existing two-argument calls and tests are unchanged. In W0 the engine accepts `secretValues` and `payloads` and does not inspect them (content inspection is the `wards` spec); it never copies them into the returned `WardVerdict`, `violations`, or `notices`.
- `isFileChange` accepts `symlink-changed`. In `checkPath`, a `symlink-changed` Change maps to the `overwrite` operation, so a `path` ward that denies `overwrite` on a path reports a violation when a protected symbolic link is retargeted. The violation reason reads `would overwrite protected path <path>`.
- `checkSql` computes rows lost as `rowsBefore - (dropped === true ? 0 : rowsAfter)` when positive, so a `dropped: true` Change is always counted as all rows lost.
- `isMoreRestrictive` and the other ward-comparison code are unchanged (P4 holds because the new rule only adds violations).

### Tests required in W0

1. The existing 35 `core` tests pass unchanged (`pnpm --filter @ghost-run/core test`).
2. New `wards.test.ts` unit tests: (a) a `symlink-changed` Change on a path protected by a `path` ward with `deny: ["overwrite"]` gives a violation and `block`; with `deny: ["delete"]` only it gives none; (b) a `sql-row-count` Change with `dropped: true` is counted as rows lost and a ward with a lower `max_rows_lost` blocks; (c) an `ObservedEvent` with `eventId` is accepted and evaluates the same as the same event without it; (d) `secretValues` and `payloads` are accepted by `evaluate`, and `JSON.stringify` of the returned `WardVerdict` contains no secret byte, in raw, base64, or hex form.
3. Type tests in `core/tests/types.test-d.ts` for the new fields.
4. The P4 monotonicity test keeps passing, with `symlink-changed` Changes added to the generators.

---

## Architecture

```mermaid
flowchart TD
    Caller[Hook / MCP / Playground / tests] -->|Plan + RunnerOptions| Pipe[pipeline.runPlan]
    Pipe --> Chk[docker/availability]
    Chk -->|unavailable| PB[static/analyzer Plan B]
    Chk -->|ok| FPB[fs/fingerprint before]
    FPB --> Cp[copy/copier]
    Cp --> SV[secretValues: read matching files from the Copy into memory only]
    SV --> Box[docker/box + pool]
    Box --> Aud[docker/hardening audit]
    Aud --> Step[step loop: exec, walk, hash candidates, sqlite counts]
    Step --> Dif[fs/differ]
    Step --> Rec[recorder: docker cp /ghost-rec, parse]
    Rec --> Ev[ObservedEvent list + payload map]
    Step --> FPA[fs/fingerprint after]
    FPA --> Ver[verdict.ts: WardEngine.evaluate with secretValues + payloads, then release secretValues, + floor]
    Dif --> Ver
    Ev --> Ver
    PB --> Ver
    Ver --> Res[RunResult]
    Pipe --> Clean[cleanup: rm container + volume + run dir]
    World[world/repo-world] -->|shares stepInSession| Step
    Core[@ghost-run/core] -.types, ghostRun, WardEngine, compareFingerprints.-> Pipe
```

### Run sequence (fresh container, docker-box mode)

```mermaid
sequenceDiagram
    participant R as Runner (host)
    participant D as Docker CLI (argv, no shell)
    participant B as Box (/work, /ghost-rec)
    R->>D: image inspect (2.0 s absolute limit)
    R->>R: fingerprint(Original) -> hashes H0 (overlaps box create)
    R->>D: run -d (hardened) with empty Copy dir bound at /work
    R->>R: copier fills Copy; sentinel ctime = copiedAt
    R->>R: read egress-secret files from the Copy into memory (secretValues, never persisted)
    R->>D: inspect -> audit (mounts, network, caps)
    R->>B: exec ghost-count (SQLite baseline) || host manifest walk
    loop each action i
        R->>B: exec ghost-step i cwd action (timeout = remaining exec budget)
        B-->>R: exit code
        R->>R: walk Copy (lstat), hash ctime candidates, diff
        R->>B: exec ghost-count on changed SQLite files
    end
    R->>D: cp container:/ghost-rec -> parse events
    R->>R: fingerprint(Original) again, compareFingerprints
    R->>R: WardEngine.evaluate(report, wardSet, { secretValues, payloads }); drop secretValues reference
    R->>D: rm -f -v container
    R->>R: rm -rf run dir, build RunResult + verdict
```

### Package layout

```
ghost-runner/
  package.json            # name @ghost-run/ghost-runner, dep: @ghost-run/core (workspace:*)
  tsconfig.json  tsconfig.build.json  eslint.config.mjs  vitest.config.ts
  box/
    Dockerfile            # local build, base pinned by digest
    BASE_DIGEST           # sha256 of the base image (resolved in the image task)
    recorder/             # ghost-init.mjs, dns.mjs, http.mjs, tls.mjs, ca.mjs,
                          # ghost-step.sh, ghost-count.mjs   (no dependencies)
    build.mjs             # `pnpm --filter @ghost-run/ghost-runner box:build`
  src/
    index.ts              # public API
    config.ts             # RunnerOptions, defaults, range validation
    errors.ts             # PlanBoundsError, ConfigError, FingerprintReadError re-use
    pipeline.ts           # runPlan(): orchestration, phase timers, deadlines
    verdict.ts            # runner verdict floor, claims (p1/p5/p6), classification
    result.ts             # RunResult types, canonical serialize/parse, redaction
    docker/               # cli.ts, availability.ts, hardening.ts, box.ts, pool.ts
    copy/                 # planner.ts (exclusion-aware copy plan), copier.ts
    fs/                   # manifest.ts, differ.ts, fingerprint.ts, sqlite.ts
    recorder/             # collect.ts (docker cp + tar reader), parse-strace.ts,
                          # parse-logs.ts, events.ts, secret-patterns.ts, dns-codec.ts
    static/               # analyzer.ts (effectsOutside + Plan B)
    world/                # repo-world.ts, render.ts
  tests/                  # unit, property, docker (skipped when unavailable), fixtures
```

Dependency direction: `ghost-runner` imports `@ghost-run/core` only through its public entry (plus the `verify` subpath in tests, see D5). `core/` must not import `ghost-runner`; the existing `core/eslint.config.mjs` `no-restricted-imports` rule gets a pattern for `**/ghost-runner/**` and `@ghost-run/ghost-runner` (work item W1).

Third-party runtime dependencies of the host package: `shell-quote` (MIT) for tokenizing actions in `static/analyzer.ts`. Nothing else at runtime; tar reading, DNS codec, and canonical JSON are small in-repo modules. In the box: Debian packages `strace`, `sqlite3`, `curl`, `openssl`, `ca-certificates`, and the Node runtime from the pinned base image. Every library and package is listed with its license in the README (Req 1.5).

---

## Components and Interfaces

### Public types

```ts
export interface ShellAction { readonly command: string; readonly cwd?: string } // cwd relative to Copy root
export type Plan = readonly ShellAction[];                                         // 1..50 items

export interface ManifestEntry {
  readonly path: string;            // relative, '/' separators
  readonly type: 'file' | 'dir' | 'symlink' | 'other';
  readonly size: number;
  readonly mode: number;
  readonly mtimeNs: string;         // bigint as decimal string (JSON safe)
  readonly ctimeNs: string;
  readonly target?: string;         // symlink target, never followed
  readonly hash?: string;           // sha-256 hex, regular files only
}

export interface RepoState {
  readonly rootPath: string;                              // the Copy directory on the host
  readonly entries: readonly ManifestEntry[];             // sorted by path (byte order)
  readonly sqlite: Readonly<Record<string, Readonly<Record<string, number>> | 'unreadable'>>;
  readonly lastStep?: StepRecord;                         // exit code, events, diagnostics of the step that produced it
}

export interface RepoWorld extends World<RepoState, ShellAction> {
  readonly metadata: { readonly id: 'repo'; readonly deterministic: false };
  dispose(): Promise<void>;                               // removes every Copy this world created
}
export function createRepoWorld(opts: RepoWorldOptions): RepoWorld;

export function runPlan(plan: Plan, opts: RunnerOptions): Promise<RunOutput>;
export interface RunOutput {
  readonly result: RunResult;                                   // serializable
  readonly payloads: ReadonlyMap<string, Uint8Array>;           // in memory only; key = ObservedEvent.eventId of exactly one event in report.observedEvents (never contains secretValues)
}
export function serializeRunResult(r: RunResult): string;       // canonical JSON, payload bytes redacted
export function parseRunResult(json: string): SerializedRunResult;
```

### RunnerOptions and defaults

| Option | Default | Valid range / values | Source |
|---|---|---|---|
| `original` | required | existing directory | Req 2 |
| `excludeDirs` | `["node_modules"]` | non-empty names, no `/` | Req 4.3 |
| `excludedDirMode` | `"omit"` | `"omit"`, `"readonly-mount"` | Req 4.9 |
| `execLimitSec` | 25 | 1 to 30, else `ConfigError` | Req 7.3 |
| `pipelineDeadlineSec` | 55 | fixed, not configurable above 55 | Req 7.5 |
| `copyLimitSec` | 20 | fixed | Req 4.8 |
| `pool.size` | off | integer 1 to 8 | Req 6.1 |
| `limits` | pids 256, memory 1g (swap 1g), cpus 2, tmp 64 MiB | positive | Req 5.2 |
| `secretPatterns` | `.env`, `.env.*`, `**/*.pem`, `**/id_rsa*` plus egress ward `secrets` | globs | Req 9.1 |
| `wardSet` | empty | core `WardSet` | Req 14.2 |
| `image` | content-addressed local tag | `name@sha256:...` allowed | D4 |

Named constants in `config.ts` (fixed, not options; a change needs a spec change because the `wards` content-inspection cost bound depends on them):

| Constant | Value | Meaning | Source |
|---|---|---|---|
| `MAX_SECRET_FILES` | 16 | Most egress-ward secret files read into `secretValues` per run | Req 9.15 |
| `MAX_SECRET_FILE_BYTES` | 65,536 (64 KiB) | Most bytes kept per secret file | Req 9.15 |

Both are compatible with the `wards` design: its per-file limits (at most 256 candidates of 8 to 16,384 bytes each) and its sizing example (256 canaries of 4 KiB) fit inside one 64 KiB file, and the worst case is 16 x 64 KiB = 1 MiB of `secretValues`, which closes the "runner cap" open item of the `wards` design.

### Repo_World

`createRepoWorld` implements all six functions of core `World<S, A>`. A `const w: World<RepoState, ShellAction> = repoWorld` declaration is the compile-time check (Req 2.1).

- `snapshot()`: fingerprints Original, runs the copier, walks the Copy, returns `Snapshot<RepoState>` whose `state.entries[*].hash` come from the Original fingerprint (D3). Never writes to Original.
- `step(s, a)`: clones the directory of `s` (same copier, `cp -cR`, same device, so it is an APFS/reflink clone), opens a one-action box session on the clone, runs `stepInSession`, returns a new snapshot. The directory of `s` is never mounted, so it cannot change. A non-zero exit or timeout returns `result: { success: false, error }` and does not throw. A step that cannot even start (Docker error) also returns `success: false` with the error text; it throws only on programmer errors (invalid action type).
- `diff(before, after)`: pure function over `RepoState` (see Diff engine). Includes SQLite row-count changes derived from `state.sqlite`. Mode-only changes and unreadable SQLite files are not Changes; they are Diagnostics from `diffDiagnostics`.
- `render(s)`: `{ kind: "repo-tree", entries: [{ path, type, size }] }`, sorted by path. Values are JSON-safe by construction.
- `fingerprint()`: the Original fingerprint (hash plus manifest) with the stat shortcut described in D3.
- `effectsOutside(a)`: the static analyzer (see Plan B).
- `dispose()`: removes every Copy directory created through this world. Also invoked on `process` exit as a best-effort sweep.

`stepInSession(session, index, action)` is the one shared implementation of "run one action in a box, walk the Copy, compute the next `RepoState`". `runPlan` calls it in a loop on one shared box (Req 7.2). `Repo_World.step` calls it once on a private session. This keeps the two paths consistent (Req 14.7, Property 22).

Observed events cannot travel through core's `Snapshot`, so each `RepoState` carries `lastStep` (exit code, events for that step, diagnostics). `runPlan` collects them into `report.observedEvents`. The runner emits every observed event, including network events whose host also appears in a static `Effect`. Core's comment that observed events are those "not listed in effectsOutside" is advisory. Removing duplicates would break the action criterion of P6, so the runner does not deduplicate across the two lists (notices for duplicates are harmless and only warn).

### Pipeline phases and the report

`runPlan` produces `report` as follows (Req 14.1): `snapshots[0]` is the state before the first action, `snapshots[i+1]` the state after action `i`; `changes[i] = repoWorld.diff(snapshots[i], snapshots[i+1])`; `effectsOutside[i] = repoWorld.effectsOutside(plan[i])`; `observedEvents` come from the recorder; `variantResults = []`. On timeout the arrays are cut at the last executed step.

### Copier (`copy/`)

`cp -cR` cannot exclude directories at every depth, and cloning `node_modules` then deleting it wastes the 778 ms budget. The copier therefore builds an exclusion-aware plan:

1. One `lstat`/`readdir` walk of Original (about 40 ms for the Reference_Repo), skipping excluded names and not following links. Bottom-up it marks each directory that has an excluded directory among its descendants.
2. For each directory level, all entries without excluded descendants go into one `cp` call with several sources and one destination: macOS `cp -cRP src... dest/`, Linux `cp --reflink=auto -RP src... dest/`. Directories with excluded descendants are created with `mkdir` and recursed. Typical repos need only a handful of `cp` invocations.
3. `-P` keeps symbolic links as links. A link pointing outside Original is copied as a link; inside the Box its target resolves against the Box file system, not the host, so nothing outside the Copy is reachable. The static analyzer reports such links as findings.
4. Cloning is attempted on the same device. Placement order: `os.tmpdir()/ghost-run/<runId>` when `st_dev` equals Original's device (on macOS `$TMPDIR` is on the same APFS data volume); otherwise a sibling `<Original parent>/.ghost-run-<runId>` when writable; otherwise `os.tmpdir()` with `copy.cloned: false` (Req 4.2). The Box never mounts the parent directory, only the Copy directory.
5. `copiedAt`: after the last `cp` returns, the copier writes a sentinel file beside the Copy (not inside it) and reads its `ctime` with nanosecond precision. This uses the file system's own clock, which is the clock that stamps file `ctime`, so there is no skew (Req 4.5). The same trick refreshes the baseline timestamp before every later step.
6. A 20 s absolute timer aborts the copy, removes the partial Copy, and returns `copy-timeout` (Req 4.8). The Box is created in parallel with the Original fingerprint and then bind-mounts the (initially empty) Copy directory that the copier fills in place; this hides the container start-up latency (Req 5.10, Req 19). On `copy-timeout` no action has run, and the Box is removed during cleanup. Decision (Req 4.8 wording): requirements.md was aligned to this implementation instead of serializing "copy, then create Box", because serializing adds the Box start time to every run and re-orders the phases that the timing budget and pipeline tests rely on. The guarantee that matters is kept: no action is executed and no container of the run remains.
7. A folder-level clone helper (Req 4.7) is an optional `copyStrategy` injected into the copier; the exclusion and link properties (Property 3) run against it too.

### Box lifecycle and hardening (`docker/`)

`buildRunArgs(opts, runId, mounts)` is a pure function that returns the Docker argv array. The runner spawns `docker` with `spawn(file, args)` and never uses a shell (Req 5.9).

```
docker run -d --name ghost-<runId>
  --label ghost-run.run-id=<uuid> [--label ghost-run.pool=1 --label ghost-run.pool-owner=<owner>]
  --network none --dns 127.0.0.1
  --init
  --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 256 --memory 1g --memory-swap 1g --cpus 2
  --read-only --tmpfs /tmp:rw,exec,nosuid,nodev,size=64m
  --user <host uid>:<host gid> --workdir /work
  --mount type=bind,src=<realpath Copy>,dst=/work
  --mount type=volume,dst=/ghost-rec,volume-label=ghost-run.run-id=<uuid>
  [--mount type=bind,src=<Original>/<dir>,dst=/work/<dir>,readonly]   # excludedDirMode=readonly-mount only
  -e PATH=<fixed> -e HOME=/tmp/home -e CI=true -e NPM_CONFIG_UPDATE_NOTIFIER=false
  --entrypoint ghost-init <image> --max-lifetime <sec>   # 120 s; pool slots 3600 s
```

Notes:

- Environment variables are passed as explicit `KEY=VALUE`; the host environment is never forwarded (Req 5.8). `PATH` is a constant string.
- `exec` on the `/tmp` tmpfs is explicit because Docker's tmpfs default is `noexec` and npm scripts run binaries from the cache under `HOME`.
- `--user` is the host uid/gid so the Copy files belong to the host user and cleanup does not need elevated rights.
- There is no `--privileged`, `--cap-add`, `--pid host`, `--ipc host`, non-`none` network, and no socket, home, or parent-of-Original source. `strace` needs no `SYS_PTRACE` because it only traces its own children (experiment A).
- Only one host path is mounted read-write: the Copy (Req 5.3). `/ghost-rec` is an anonymous Docker volume, not a host path (D2). The only other host mounts are the optional read-only excluded directories.
- Leak guards (defense in depth). (a) `ghost-init --max-lifetime` exits PID 1 after the bound, so a box whose host process died (SIGKILL, shell timeout) stops on its own; 120 s is above the 55 s pipeline deadline plus collect and cleanup. A stopped box still needs `docker rm -v`; `--rm` is not used because the recorder must stay readable after a kill. (b) The anonymous `/ghost-rec` volume carries the run-id label (anonymous volumes do not inherit container labels), so `docker volume ls --filter label=ghost-run.run-id=<id>` finds a leaked volume; `rm -v` still removes it. (c) `docker/reaper.ts` registers every run id before `docker run` and drops it only after a confirmed removal; process `exit`, `SIGINT` and `SIGTERM` handlers remove the remaining boxes of this process with `docker rm -f -v` by label, and Docker test files reap boxes created during a test in `afterEach` (a timed-out vitest body is abandoned and never reaches its `finally`). (d) `runPlan` accepts `signal?: AbortSignal`: on abort it removes container, volume and Copy and rejects with `signal.reason`; a step still in flight is cleaned up again when it settles.
- `readonly-mount` caveat: with the default `"omit"` mode, actions that need `node_modules` fail inside the Box. The fixture's `npm test` therefore runs `node --test` without dependencies.

**Audit** (`auditInspect(expected, inspectJson)`, pure): compares the `docker inspect` JSON to expected values: `HostConfig.NetworkMode == "none"`, `Privileged == false`, `CapAdd` empty, `CapDrop` contains `ALL`, `ReadonlyRootfs == true`, `SecurityOpt` contains `no-new-privileges`, `PidMode` and `IpcMode` not `host`, `Config.Image` equals the expected image id, `Config.Env` is exactly the allowed set plus image-baked variables, and the `Mounts` array equals the expected set (type, source, destination, mode, rw flag). Any difference gives `isolation-violation` and `block`. The container is removed and no action runs (Req 5.7).

**Pool** (`docker/pool.ts`): with `pool.size` 1 to 8, keeps that many one-shot slots ready. A slot is a started container with the same hardening, an empty slot directory mounted at `/work`, and a fresh `/ghost-rec` volume. The Copy is created directly in the slot directory. A slot serves at most one run; afterwards the container, volume, and slot directory are removed and a replacement is started in the background, outside run timing. When no slot is ready the run uses a fresh container and records `box.source: "fresh"`.

Pool ownership: hook scripts are short-lived processes, so a naive "remove all pool containers at startup" would delete a concurrent process's slots. Each slot carries `ghost-run.pool-owner=<pid>:<process start time>`. Startup and exit sweeps remove only slots whose owner process is dead or is the current process (Req 6.7, 6.8). The pool pays off in long-lived processes (MCP server, tests). A one-shot hook process leaves it off.

### Diff engine (`fs/`)

Walk: `lstat` only, never `stat`, never `readdir` through a link. `fs/manifest.ts` returns `ManifestEntry[]` sorted by byte order of `path`. Excluded directory names are skipped at every depth.

Per step the runner computes the next state:

1. `candidate(e) = e.ctimeNs >= baselineNs`, or `size`/`mode`/`mtime` differs from the previous entry. The `>=` makes candidates a superset on file systems with coarse timestamps. Correctness never depends on timestamp granularity, only the amount of hashing does.
2. Candidate regular files are hashed with `open(O_NOFOLLOW)`, then `fstat`, compared with the `lstat` data (device and inode) to reject a swap to a link. If `ctime` changed between `lstat` and the end of hashing, the file is rehashed once; if still unstable, the diagnostic `diff-unstable` is added (a background process is still writing).
3. Non-candidate entries inherit `hash` from the previous state.
4. SQLite files that appear as `file-overwritten` or `file-deleted` Changes (and were recorded at baseline) are counted (below).

`diff(before, after)` is then a pure comparison of two sorted entry lists:

| Condition | Change |
|---|---|
| in after only | `{ kind: "file-created", path, entryType }` |
| in before only | `{ kind: "file-deleted", path, entryType }` (one per entry of a removed directory, Req 11.14) |
| regular file, size or hash differs | `{ kind: "file-overwritten", path, sizeBefore, sizeAfter }` |
| only `mode` differs | no Change; the Diagnostic `mode-changed` `{ path, modeBefore, modeAfter, stepIndex }` (no verdict effect by itself) |
| symlink, target differs | `{ kind: "symlink-changed", path, targetBefore, targetAfter }` (the Ward_Engine counts it as an overwrite of `path`) |
| only `mtime`/`ctime` differ | none (Req 11.10) |
| type changed (file to dir) | `file-deleted` for the old entry plus `file-created` for the new one |
| per table in `state.sqlite` whose count changed or that disappeared | `{ kind: "sql-row-count", path, table, rowsBefore, rowsAfter }`; `dropped: true` is added only when the table no longer exists (then `rowsAfter: 0`); `dropped` is omitted otherwise, including for a newly created table (`rowsBefore: 0`) |
| SQLite file cannot be read (`state.sqlite[path] == "unreadable"`) | no Change; the Diagnostic `sqlite-unreadable` `{ path, stepIndex }`; verdict at least `warn` |

The Differ emits only `file-created`, `file-overwritten`, `file-deleted`, `symlink-changed`, and `sql-row-count` (Req 12.8). Facts that have no core Change kind are Diagnostics. They come from a second pure function in `fs/differ.ts`, `diffDiagnostics(before, after, stepIndex)`, which is called next to `diff` and whose result is stored in `RepoState.lastStep.diagnostics`. Diagnostics are never passed to the Ward_Engine as Changes. Known limitation: a regular file whose only difference is its mode produces no Change, because `chmod` alone is neither a delete nor an overwrite, so wards do not see it (Req 11.8).

Output order: ascending byte order of `path`, tie-break `kind`. No Change for an unchanged step: `[]`.

**SQLite row counts.** The header (first 16 bytes equal `SQLite format 3\0`) is checked during the Original hashing pass, so no extra read is spent on it (the fingerprint code returns a list of SQLite candidates). Counting runs inside the Box, not on the host, so a hostile database file is parsed by the in-box `sqlite3`, and the host needs no SQLite library. A script `ghost-count` (in the image) receives the file paths, duplicates each database with its `-wal` and `-shm` sidecars into a fresh directory on `/tmp`, runs `sqlite3 -readonly -json` to list tables (`type = 'table'`, name not starting with `sqlite_`, names quoted with doubled `"`), then counts each table, and prints JSON. The Copy is never written (Req 12.5). The baseline exec runs in parallel with the host manifest walk. A corrupt or truncated file yields `"unreadable"`, hence the Diagnostic `sqlite-unreadable` (path and `stepIndex`), no `sql-row-count` Change for that file, and a verdict of at least `warn`. A table that disappears or a deleted file gives `rowsAfter: 0, dropped: true`; a new table gives `rowsBefore: 0` without `dropped` (Req 12.2, 12.3). The runner never emits `file-modified`, `file-mode-changed`, `sqlite-table-rows-changed`, or `sqlite-unreadable` as a Change kind (Req 12.8).

### Recorder (in the Box)

Started by `ghost-init` (PID 1, Node, no dependencies) before the first action. It listens inside the Box on `127.0.0.1` (the Box has a loopback interface even with `--network none`).

| Part | Behavior |
|---|---|
| Fake DNS (UDP 53) | A query: allocates a distinct loopback address `127.x.y.z` per lowercase hostname and answers with it. AAAA: NODATA (empty NOERROR) so resolvers do not stall. Logs `{ host, ip, step }` to `dns.jsonl`. |
| HTTP (TCP 80) | Reads the request, stores up to 64 KiB of body, logs `{ host(Host header), port: 80, bytes, sha256, step }`, replies `200` with an empty body. |
| TLS (TCP 443) | Terminates TLS with a leaf certificate minted per SNI name (cached) from a throw-away box CA created at image build time and installed in the system trust store. The SNI callback logs the name before the handshake finishes, so the event exists even when the client rejects the certificate. For clients that trust the system store (curl), the decrypted body (up to 64 KiB) is captured. Clients with their own CA bundle fail the handshake; the SNI event is still recorded and no payload is captured. |
| Other TCP ports | Nothing listens. The attempt is seen by `strace` on `connect` (destination `127.x.y.z:port`), and the parser maps the address back to the hostname from `dns.jsonl` (`<host>:5432`, Req 8.6). |
| Direct IP | `strace` on `connect` sees `192.0.2.10:443` even with no DNS lookup and no route (Req 8.7). Loopback addresses that were not allocated by the fake DNS (the Box's own services) are ignored. |

The listeners bind ports 53, 80, and 443 as the unprivileged `--user` under `--cap-drop ALL`. This works because Docker sets `net.ipv4.ip_unprivileged_port_start=0` in the container network namespace, and experiment A confirmed it. The verification test of Req 8.13 asserts it (W9).

`ghost-step <index> <cwd> <action>` (POSIX `sh`, in the image) writes `<index>` to `/ghost-rec/current-step` (listeners read it per event), waits up to 2 s for `/ghost-rec/ready`, runs `strace ... -- sh -c "$action"` with the action as a single argument (Req 5.9), then appends a marker line `{"end":<index>,"exit":<code>}` to `/ghost-rec/steps.jsonl`. The runner calls `docker exec -w /work/<cwd> <container> ghost-step <i> <cwd> <action>` through an argv array.

Event mapping to core `ObservedEvent` (Req 8.10, 9.2):

| Source | `ObservedEvent` | Detection source tag (diagnostics only) |
|---|---|---|
| DNS lookup of `Host.Example` | `{ kind: "network-attempt", destination: "host.example", stepIndex }` | `dns` |
| HTTP request | `{ kind: "network-attempt", destination: "<host>:<port>", stepIndex }` | `http` |
| TLS ClientHello | `{ kind: "network-attempt", destination: "<sni>:<port>", stepIndex }` | `tls-sni` |
| connect to allocated loopback IP | `{ ..., destination: "<host>:<port>" }` | `tcp` |
| connect to any other non-loopback IP | `{ ..., destination: "<ip>:<port>" }` | `strace-connect` |
| open of a file matching a secret pattern | `{ kind: "secret-read", path: "<copy-relative>", stepIndex }` | `strace-openat` |

At most one event per distinct (`stepIndex`, `destination`) or (`stepIndex`, `path`).

Captured payloads (HTTP body, decrypted TLS body) are held in `RunOutput.payloads` for ward content inspection. Each event that has a capture gets a unique `eventId` (Req 8.14), the payload is stored under that `eventId`, and every key of `payloads` equals the `eventId` of exactly one event in `report.observedEvents`. Events without a capture leave `eventId` unset (Req 8.15). The serialized `RunResult` stores for each capture only `{ eventId, byteLength, sha256 }` (Req 8.11).

`eventId` assignment (`recorder/events.ts`): the event builder keeps a per-run counter and gives `ev-<n>` (`n` from 0, in order of event creation) to an event at the moment a payload is attached, so ids are unique within the run and never derived from the plan or the payload. Because events are deduplicated per (`stepIndex`, `destination`), several requests to the same destination in one step map to one event; their bodies are appended in arrival order into one capture capped at 64 KiB, stored once under that event's `eventId`. The runner builds `RunOutput.payloads` and `report.observedEvents` from the same list, so a payload without an event, or an `eventId` shared by two events, cannot be constructed (checked by Property 12).

### secretValues (in memory only)

When the evaluated `WardSet` contains an `egress` ward, `runPlan` reads, after the Copier finishes and before the first action runs, the contents of the files in the Copy (not in Original) that match the `secrets` patterns of the `egress` wards, and holds them as `secretValues` (`SecretValues` from `core`, see "Core type changes"). Only the `secrets` entries of `egress` wards select files here; the broader default `secretPatterns` option still drives secret-read recording but does not cause content to be read. The data flow is:

1. Read from the Copy into process memory (a `Map` keyed by Copy-relative path, values `Uint8Array`), within the caps of step 6. Nothing is written to disk, logs, the serialized `RunResult`, or graveyard output. Only a byte length or SHA-256 may be derived and stored (Req 9.11).
2. Pass `secretValues` to `WardEngine.evaluate(report, wardSet, { secretValues, payloads })` (Req 9.10, 14.2).
3. After `evaluate` returns, drop the reference (`secretValues` is a local that goes out of scope inside `verdict.ts`, and the map is cleared with `.clear()` first) before the `RunResult` is returned (Req 9.12).
4. `secretValues` is never placed in `RunOutput.payloads`, never stored in `RepoState`, and is not a field of `RunResult`.
5. A matching file that cannot be read from the Copy adds the diagnostic `secret-values-unreadable` with the Copy-relative path only, sets `p6Claimed: false`, and gives at least `warn` (Req 9.13).
6. **Caps (Req 9.15).** Matching files are ordered by the UTF-8 byte order of the Copy-relative path, so the selection does not depend on directory listing order. Only the first `MAX_SECRET_FILES` (16) files in that order are read (an unreadable file counts toward the 16). Each file is read with a bounded read of at most `MAX_SECRET_FILE_BYTES` (64 KiB) bytes, so the first 65,536 bytes are kept and the rest are never loaded. A file beyond the count cap is not read at all; its size comes from `lstat`. For each capped file, the runner adds one Diagnostic `secret-values-capped` with `path` (Copy-relative) and `detail { reason: 'count' | 'size', byteLength, cap }`, where `byteLength` is the original file size and `cap` is the constant that was exceeded. The Diagnostic never holds content, a hash of content, or a derived value other than the lengths. Content inspection of a capped file is reduced (none for a file beyond the count cap, the first 64 KiB only for a truncated file). The Behavior_Criterion (P6: secret-read followed by an unapproved network attempt) does not depend on `secretValues`; it still applies to every secret file, capped or not. `secret-values-capped` does not change `p6Claimed` and has no verdict effect by itself.
7. `secretValues` stay in process memory only. The caps limit how much is read; they do not change where the bytes may go, which is still nowhere outside the process (steps 1, 3, and 4 apply to truncated content in the same way).

**Test design note (Req 9.14, 18.6; Property 12).** The test runs a Plan against a fixture whose `.env` holds the canary `sk-CANARY-abc123` and extra filler lines, with an `egress` ward whose `secrets` include `.env`. It then collects every output channel: the serialized `RunResult`, the serialized `report`, captured `console`/logger output (spies), the graveyard output, a recursive read of every file written outside the Copy (run directory, temp files, recorder tar extraction target), and the serialized `WardVerdict`. For the secret file content it asserts that no channel contains the canary, and no contiguous substring of the file content longer than 8 bytes, in raw, base64, hex, or URL-encoded form (checked with a sliding window over the content, so the test does not depend on the canary string alone). A second variant uses a spy on the file-system layer to assert that no write call receives bytes that contain a window of the secret content. The one allowed exception is the captured network payload of scenario 3: it stays in memory in `RunOutput.payloads`, and only its length and SHA-256 are serialized. The test also asserts that after `runPlan` returns, `RunOutput` and `RunResult` hold no reference to the `secretValues` map (a `WeakRef` check after forced garbage collection in the Node test run with `--expose-gc`, plus a structural walk of the returned objects).

### Static analyzer and Plan B (`static/`)

`analyze(action)` is a pure function: tokenizes `command` with `shell-quote` and, without any file, network, or process access, reports:

- absolute paths not under `/work` (the Copy mount point as the Box sees it), including `/tmp/...`;
- tokens starting with `~`;
- URLs (`http://`, `https://`, `ftp://`, `ssh://`, and so on) and database connection strings (`postgres://`, `mysql://`, `mongodb://`, `redis://`, `amqp://`).

`effectsOutside(a)` returns one `Effect { kind: "external-path" | "url" | "db-connection", destination }` per distinct finding. Plan B adds a scan of Original for symbolic links pointing outside it (a read-only walk, done in `runPlan`, not in the pure analyzer).

Plan B flow (Docker daemon unreachable within 2.0 s, or image missing): no action is executed on the host. The result has `isolation.mode: "static-analysis"`, `isolation.reason: "docker-unavailable" | "box-image-missing"`, `p1Claimed = p5Claimed = p6Claimed = false`, `rehearsed: false`, empty `changes` arrays, `observedEvents: []`, and `staticFindings`. The runner verdict is at least `warn`, even without findings. The exact text `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.` is placed in `result.notices` and delivered through the optional `onNotice` callback so the hook and UI show it to the user at once. For `box-image-missing` the notice adds the fix: run `pnpm --filter @ghost-run/ghost-runner box:build`.

---

## D1: Secret-read recording method

| Option | Sees reads of regular files by any process | Works with `--cap-drop ALL`, no `SYS_PTRACE` | Static binaries / direct syscalls | Cost | Verdict |
|---|---|---|---|---|---|
| `strace -f -e trace=openat...` (seccomp-bpf filtered) | Yes, per syscall, all children | Yes (traces own children, confirmed for `connect` in experiment A) | Yes | Provisional 0.1 to 0.8 s | **Chosen** |
| `inotify` | Needs `IN_ACCESS`/`IN_OPEN` watches per directory; misses mmap reads; watch limits | Yes | Yes | Low | Rejected: coverage gaps, recursive watch setup cost, cannot attribute to a step reliably |
| `fanotify` | Yes | No (`CAP_SYS_ADMIN`) | Yes | Low | Rejected: needs a forbidden capability |
| `LD_PRELOAD` shim | Only dynamically linked, libc-using programs | Yes | No (Go, static binaries, raw syscalls bypass it) | Low | Rejected: easy to bypass by accident |
| Bind-mounted canary file and `stat` atime | Only if `atime` is updated (`noatime`/`relatime`) | Yes | Yes | None | Rejected: unreliable, no per-step ordering |

Chosen command (one process serves both network and secret recording, so the Box pays tracing cost once per action):

```
strace -f -qq -s 256 --seccomp-bpf \
  -e trace=openat,open,openat2,connect,chdir,fchdir -e signal=none \
  -y -o /ghost-rec/step-<i>.strace -- sh -c "<action>"
```

What is recorded: the syscall name, return value, pid, and the path argument as strace prints it. File contents are never read or written by the recorder. The host-side parser (`parse-strace.ts`) then:

1. keeps `openat/open/openat2` records with a return value of at least 0 and flags containing `O_RDONLY` or `O_RDWR` (a write-only create is not a read);
2. resolves paths: absolute paths directly; `AT_FDCWD`-relative paths against a per-pid working directory seeded with the action `cwd` and updated from traced `chdir`/`fchdir`; dirfd-relative paths from the `-y` decoration. Paths that cannot be resolved are matched conservatively by their trailing components against the patterns (a false positive only adds a recorded read, never hides one);
3. keeps paths under `/work`, strips the prefix, normalizes `.`/`..` and uses `/` separators;
4. matches the Copy-relative path against `secretPatterns` (default `.env`, `.env.*`, `**/*.pem`, `**/id_rsa*`, plus every `egress` ward `secrets` entry);
5. emits one `secret-read` event per distinct (`stepIndex`, `path`).

Because `-z` (successful only) is not used (failed `connect` calls to unroutable IPs must still be seen), logs for chatty commands can be large. The collector caps `/ghost-rec` at 64 MiB; exceeding the cap is treated as `recorder-failure`.

Provisional cost bound: 0.8 s Median_Of_5 added for the combined `openat`+`connect` tracing on the Reference_Repo (Req 9.7), with `--seccomp-bpf` expected to be well below the plain-ptrace cost because only the listed syscalls stop the tracee. This is not measured yet. **Trial plan (W6):** on the Reference_Repo and Reference_Machine, 10 runs per cell, report the median and the maximum:

| Command | Variants |
|---|---|
| `true` (no-op) and `npm test` | (a) no strace, (b) strace `connect` only (experiment A baseline), (c) strace `connect+openat` plain ptrace, (d) strace `connect+openat` with `--seccomp-bpf` |

Decision rule: if (d) minus (a) is at most 0.8 s for both commands, keep the design and replace the provisional bound with the measured value. If it is above 0.8 s, narrow tracing with a `-P <path>` list for the exact patterns of the active wards, or tell the user that secret recording is off (then `p6Claimed: false`, `warn`; Req 9.8). Results go to `docs/research.md`.

---

## D2: Recorder output location, protection, and exclusion from the diff

| Option | Persists after the container is killed | Is a second host mount (conflicts with Req 5.3) | Needs host chown | Chosen |
|---|---|---|---|---|
| Per-run host directory bind-mounted at `/ghost-rec` | Yes | Yes (second read-write host path) | Yes on Linux | No |
| Container `tmpfs` read with `docker cp` | No (tmpfs is lost when the container stops, which is the timeout case) | No | No | No |
| Live stream through `docker exec` stdout/stderr | n/a | No | No | No (interleaves with the action's own output, trivially forgeable) |
| **Anonymous Docker volume at `/ghost-rec`** | **Yes** (readable with `docker cp` from a stopped container) | **No** (volume, not a host path) | **No** (volume initialized from the image directory, mode 1777) | **Yes** |

The volume is outside the Copy by construction: the Copy is the bind mount at `/work`, the recorder directory is a different mount at `/ghost-rec`, and the Differ and Fingerprinter walk only the host Copy directory (Req 10.3). Recorder files can never appear as Changes. `HOME` (`/tmp/home`) is on the box tmpfs, which is also outside the Copy and never read by the runner.

Reading it: `docker cp <container>:/ghost-rec -` returns a tar stream. `recorder/collect.ts` contains a minimal tar reader (regular files only, size cap, path traversal rejected) and passes file contents to the parsers. It runs once at the end of the plan, and also after a timeout kill, because the volume survives the stopped container. Cleanup is `docker rm -f -v`.

Protection against the ghost deleting or forging it, as far as possible, and the stated limit:

1. The ghost's working directory is the Copy. Ordinary deletes (`rm -rf ./data`) do not reach `/ghost-rec`. The root file system is read-only.
2. The recorder daemon and the `strace` process run before the action starts, and the step marker is written by `ghost-step` after the traced process exits, not by the traced process.
3. Fail closed: the collector requires, for every executed step, a `step-<i>.strace` file, a closing marker `{"end":i}` in `steps.jsonl`, parseable lines, and a recorder-liveness probe (the wrapper connects to its own listeners after the action). Missing, truncated, unparseable, or over-cap data gives the diagnostic `recorder-failure`, `p6Claimed: false`, and at least `warn` (Req 10.4). `strace` uses `PTRACE_O_EXITKILL`, so a ghost that kills its tracer is itself killed and the missing marker is reported.
4. `RunResult.recorder = { location: "in-box", tamperResistant: false }` always. The README and the diagnostics state that a process that runs as the same user in the same container can delete or rewrite its own records. A tracer and its tracee must share a user, so a separate user for the ghost is not possible under the forbidden `--cap-add` and the Yama ptrace rules. The Box guarantees no network and no host access (the P1 claim); it does not guarantee a truthful recorder. Content encoded by compression, encryption, or one-character DNS queries is covered by the action criterion only (Req 10.6). Unix-socket connections are not traced for destinations (Req 10.5).

---

## D3: Baseline hashes without hashing unchanged files

Alternatives:

| Option | Extra hashing | Risk |
|---|---|---|
| (a) Hash the Original counterpart of each candidate at diff time | Only candidates | Original may change meanwhile, giving false modifications; for step 2 and later the "before" is the previous step, not Original |
| (b) Compare size/mtime first and hash only ambiguous candidates | Few | Equal size with unknown before-hash still needs a before-hash from somewhere |
| (c) **Reuse the hashes already computed by the pre-run Original fingerprint** | None | Original changed between fingerprint and copy (narrow window) |
| (d) Hash the whole Copy at baseline | Full pass (about the cost of the fingerprint again) | Duplicate work |

Decision: (c), plus (b) as the candidate filter. Req 13.2 already requires hashing every tracked Original file before the copy, producing a `manifest: path -> sha256`. The Copy is a clone of Original, so those hashes are the baseline content hashes of the Copy. The pre-run fingerprint costs nothing extra, is a point-in-time snapshot (immune to Original changing during the run), and gives the Differ a complete `hash` for every regular file. At diff time only ctime candidates are re-hashed in the Copy (median 88 ms in experiment A). A candidate whose new hash equals its baseline hash (for example after `touch`) produces no Change. After a step, each re-hashed entry becomes the baseline for the next step.

Races and edge cases:

- Original edited between the fingerprint and the clone: the Copy and its baseline hash disagree for that file, so a spurious `file-overwritten` can appear only if the file is also a candidate. The same path then shows up in the post-run `changedPaths`, the run is classified `external-change` (`warn`), and the diagnostic `baseline-race: [paths]` lists the intersection.
- Symlinks: baseline stores the target string (`"symlink:" + target` in the fingerprint manifest), compared as a string; never opened, never followed. Hashing uses `O_NOFOLLOW` plus an `fstat` identity check, so a link swapped in after `lstat` is rejected. Directories are in the manifest as `"dir:" + mode` so empty-directory deletions are visible.
- The "after" fingerprint of Original uses a stat shortcut: only entries whose `(size, mtimeNs, ctimeNs, ino)` differ from the pre-run stat are re-hashed. `ctime` cannot be set by user code, so a content change always moves it. This keeps the 1.0 s budget. Run option `fingerprintMode: "full"` disables the shortcut for the nightly P1 run.
- File systems with coarse `ctime`: the candidate test is `>=` and also fires on `size`/`mode`/`mtime` differences, so the candidate set is a superset. Docker Desktop file sharing may lag `ctime` propagation; the PBT (Property 1) runs the incremental differ against a full-hash reference to catch this, and the timing task (W7) checks it on the Reference_Machine.

---

## D4: Box image

| Option | For | Against |
|---|---|---|
| **Build locally** from `box/Dockerfile`, base by digest | Auditable source, no registry trust, offline after first build, no redistribution of Debian packages (so no GPL source-offer duty) | First build needs network (about 1 to 2 min) |
| Pull a prebuilt image by digest | Fast first run | Needs a publishing pipeline (out of scope), the digest must be maintained, the user trusts a binary, redistribution obligations |

Decision: build locally. An optional override `GHOST_BOX_IMAGE=<name>@sha256:<digest>` (a digest is mandatory; tags are rejected) lets teams supply a vetted image.

- Base: `node:20-bookworm-slim@sha256:<digest from box/BASE_DIGEST>`. The Node runtime is needed anyway because scenario 4 runs `npm test`. The digest is resolved and recorded by the image task (W3); it is not invented here.
- Packages: `strace sqlite3 curl openssl ca-certificates` installed from a Debian snapshot archive URL fixed by timestamp, so rebuilds are reproducible. `apt` caches are removed. No package manager, compiler, or shell history is left behind.
- Recorder scripts are copied from `box/recorder/` and use only Node built-ins (`dgram`, `http`, `tls`, `crypto`, `fs`). The box CA is generated with `openssl` at build time into `/opt/ghost/ca`, added to the system trust store (`update-ca-certificates`), and exposed to Node clients through `NODE_EXTRA_CA_CERTS` baked as an image `ENV`. Image-baked variables are distinct from the host variables the runner forwards (Req 5.8). The CA key never leaves the Box and signs only throw-away leaf certificates for the recorder.
- Image tag: `ghost-run/box:<sha256 of Dockerfile + BASE_DIGEST + recorder/*>`. The availability check inspects that tag and compares its image id with the build label, so a stale or missing image selects Plan B with `box-image-missing`.
- Offline behavior: after the build, runs need no network. The hook never builds an image (60 s limit, network use). `pnpm --filter @ghost-run/ghost-runner box:build` is the explicit command, and the Plan B notice names it.
- Supply chain: the pinned base digest, the snapshot timestamp, and a build that runs no downloaded scripts. The README table lists each package with its license: Node (MIT), strace (LGPL-2.1-or-later), sqlite3 (public domain), curl (curl license), openssl (Apache-2.0), ca-certificates (GPL-2.0-or-later, MPL-2.0 data). License check happens on day one in W3 before merge. Docker Desktop's license terms are noted in the README as already recorded in `docs/research.md`.

---

## D5: Consuming `core` from Node

`core/package.json` has `"main": "src/index.ts"`. Node 20 cannot import TypeScript, so hook scripts and `ghost-runner` at runtime cannot use it.

| Option | Hook start-up | Works in Vite apps | Type declarations | Extra runtime dependency | Verdict |
|---|---|---|---|---|---|
| **`tsc` build to `dist/` plus `exports` map** | Fast, plain ESM | Yes | `.d.ts` emitted | None | **Chosen** |
| `tsx` or a Node loader | Slow start (transform on every hook run), loader flags differ by Node version | Not needed | From source | `tsx` | Rejected for runtime; unstable under the 60 s hook budget |
| Bundle with `tsup`/`esbuild` into one file | Fastest | Redundant for Vite | Needs extra dts step | Build tool | Not for `core` itself. A single-file bundle of the hook script is the `kiro-integration` spec's choice and builds on `dist/` |
| `publishConfig` | n/a | n/a | n/a | n/a | Only matters when publishing to npm; the package is `private` |

Decision: build `core` to `dist/`, point `exports` at it, keep a source alias for tests.

```jsonc
// core/package.json (target shape, task W4, not applied now)
"exports": {
  ".":        { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" },
  "./verify": { "types": "./dist/verify.d.ts",    "import": "./dist/verify.js" }
},
"main": "./dist/src/index.js",
"types": "./dist/src/index.d.ts",
"files": ["dist"],
"scripts": { "build": "tsc -p tsconfig.build.json", "clean": "rm -rf dist" }
```

Core-side changes required (separate work item W4, not part of this spec's code; it runs after W0 so the build covers the extended types):

1. Add `core/tsconfig.build.json`: extends `tsconfig.json`, `noEmit: false`, `declaration: true`, `outDir: dist`, `rootDir: .`, `include: ["src", "verify.ts"]`, `module: "NodeNext"` and `moduleResolution: "NodeNext"` (existing relative imports already use `.js` suffixes).
2. Change `main`, `types`, add `exports`, `files`, and `build`/`clean` scripts as above. Mark `fast-check` as an optional `peerDependency` for the `./verify` subpath.
3. Add `core/dist` to `.gitignore`; keep `core/src` imports free of `node:` modules (already required).
4. Add a root script `pnpm -r build` ordering core first (pnpm runs workspace builds in topological order) and make `ghost-runner`'s `prebuild`/`pretest:docker` depend on it.
5. Make the existing `core` tests keep running from source (no change).

`ghost-runner` consumption: runtime imports resolve `@ghost-run/core` to `dist/` through the `exports` map. `ghost-runner/vitest.config.ts` adds `resolve.alias: { '@ghost-run/core': '<root>/core/src/index.ts' }` so tests never need a prior build. Req 1.2 says `core` is imported only through its public entry point; the `./verify` subpath is the second, test-only entry point required by Req 17.9 (`verifyWorld`), and the ESLint rule allows exactly `@ghost-run/core` and `@ghost-run/core/verify` in `ghost-runner/tests/`.

---

## Data Models

```ts
export type RunStatus =
  | 'ok' | 'timeout' | 'pipeline-deadline' | 'copy-timeout'
  | 'isolation-violation' | 'internal-error';

export interface Isolation {
  mode: 'docker-box' | 'static-analysis';
  reason?: 'docker-unavailable' | 'box-image-missing';
  p1Claimed: boolean; p5Claimed: boolean; p6Claimed: boolean;
  originalUnchanged?: boolean;
  readOnlyMounts: string[];
  mountAuditPassed?: boolean;
}

export interface RunResult {
  schemaVersion: 1;
  runId: string;                       // random UUID, not derived from the plan
  status: RunStatus;
  rehearsed: boolean;                  // false in Plan B
  verdict: Verdict;                    // Runner_Verdict
  wardVerdict?: WardVerdict;           // from WardEngine.evaluate (docker-box only)
  report: GhostReport<RepoState>;      // snapshots redacted on serialize
  exitCodes: number[];
  copiedAt?: string;                   // ns decimal string
  copy: { cloned: boolean; location: string };
  box?: { source: 'fresh' | 'pool'; image: string };
  isolation: Isolation;
  originalChange?: { classification: 'external-change' | 'isolation-violation'; changedPaths: string[] };
  recorder: { location: 'in-box'; tamperResistant: false };
  captures: { eventId: string; byteLength: number; sha256: string }[];
  diagnostics: Diagnostic[];           // mode-changed, sqlite-unreadable, recorder-failure, secret-values-unreadable, secret-values-capped, protected-path-excluded, baseline-race, diff-unstable, ...
  staticFindings: Effect[];            // Plan B
  notices: string[];                   // includes the exact Plan B message
  phases: PhaseDurations;
}

export interface Diagnostic {
  readonly name: string;                 // 'mode-changed' | 'sqlite-unreadable' | 'recorder-failure' | ...
  readonly stepIndex?: number;
  readonly path?: string;                // Copy-relative; never content
  readonly detail?: Readonly<Record<string, string | number | boolean>>;   // e.g. modeBefore, modeAfter
}

export interface PhaseDurations {
  dockerCheckMs: number; fingerprintBeforeMs: number; copyMs: number; baselineMs: number;
  boxOverheadMs: number; execMs: number; diffMs: number; sqliteMs: number;
  fingerprintAfterMs: number; cleanupMs: number;
}
```

`SerializedRunResult` equals `RunResult` with `report.snapshots[*].state` reduced to `{ rootPath, entryCount, manifestDigest }` and no payload bytes (only `captures`). `serializeRunResult` is canonical: sorted object keys, no `undefined`, no `bigint` (all ns values are strings), arrays in order. `parseRunResult(serializeRunResult(r))` is deep-equal to `redact(r)`, and serializing the parsed value reproduces the same string (Req 14.5, 14.6).

### Verdict and claims (`verdict.ts`, pure)

```
runnerVerdict = max(wardVerdict ?? 'pass', floor)       // pass < warn < block
floor = block  if status == 'isolation-violation' or originalChange.classification == 'isolation-violation'
        warn   if any of: status != 'ok', mode == 'static-analysis', diagnostics contains one of
               {recorder-failure, secret-values-unreadable, sqlite-unreadable, protected-path-excluded},
               originalChange == 'external-change', fingerprint unreadable,
               egress ward present and secret-read recording inactive
        pass   otherwise
verdict == 'pass' only if status == 'ok' and mode == 'docker-box' and wardVerdict.verdict == 'pass'

p1Claimed = mode == 'docker-box' and fingerprints equal and mountAuditPassed
p5Claimed = p1Claimed and no unresolved protected-path-excluded diagnostic
p6Claimed = mode == 'docker-box' and secret-read recording active and recorder healthy and no secret-values-unreadable diagnostic
```

Plan B never reaches `WardEngine.evaluate` for observed events (there are none); its `wardVerdict` is computed on the empty report plus static effects, and the floor `warn` applies.

Protected-path-excluded detection (Req 4.11): before the first action, for every `path` ward and every protected glob, test whether the glob can match a path whose segments include an excluded directory name (including the mounted read-only case). The diagnostic lists the ward `id` and path and states that changes there are not visible to the Differ.

Original change classification (Req 13.3 to 13.7): compare the two fingerprints with core `compareFingerprints`. Equal hashes give `originalUnchanged: true`. Different hashes with a passed mount audit give `external-change` with `changedPaths` (a host process, an editor, or a file watcher changed Original; the ghost cannot have written to it because no Original path is mounted read-write), `p1Claimed: false`, `warn`. Different hashes with a failed audit give `isolation-violation` and `block`. An unreadable tracked file raises `FingerprintReadError` naming the path and gives `p1Claimed: false`, `warn`.

---

## Timing budget

Median_Of_5 targets, except rows marked absolute limit, which apply to every run (Req 19). Phase `boxOverheadMs` includes Box create overlapped with `fingerprintBeforeMs`; the sum of the budgets is an upper bound.

| Phase | Name | Budget |
|---|---|---|
| Docker availability check | `dockerCheckMs` | 2.0 s absolute limit |
| Fingerprint before | `fingerprintBeforeMs` | 1.0 s |
| Copy | `copyMs` | 1.0 s; 20 s absolute limit |
| Manifest and SQLite baseline | `baselineMs` | 0.8 s |
| Box start, inspect, remove (fresh) | `boxOverheadMs` | 0.8 s (pool 0.65 s) |
| Action execution including Recorder | `execMs` | execution limit, default 25 s, maximum 30 s, absolute limit |
| Diff per step | `diffMs` | 0.5 s |
| SQLite row counts | `sqliteMs` | 0.5 s |
| Fingerprint after | `fingerprintAfterMs` | 1.0 s |
| Cleanup | `cleanupMs` | 1.0 s |
| Pipeline | n/a | 55 s absolute limit, return within 60 s |

Sum of non-exec budgets: 2.0 + 1.0 + 1.0 + 0.8 + 0.8 + 0.5 + 0.5 + 1.0 + 1.0 = 8.6 s. With the maximum 30 s execution the total is under 39 s, more than 20 s below the 60 s Hook_Limit. Each later plan step adds about 0.6 s (diff 0.5 s plus 0.1 s). The secret-read recording cost (D1) is inside `execMs`; its provisional bound is 0.8 s and the trial replaces it.

Deadline handling:

- Execution limit reached: `docker kill`, the current step's snapshot gets `result: { success: false, error: "timeout after <N> s" }`, remaining actions are skipped, the diff of the Copy as it stands is computed, the recorder volume is read, status `timeout`, verdict at least `warn`.
- Pipeline deadline (55 s): remaining phases are skipped, the container is killed and removed, a partial result with status `pipeline-deadline` is returned within 60 s. Cleanup always runs even then, with its own short timeouts.
- Every external call has a timeout derived from the time left until the 55 s deadline.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Scope rule: safety properties P1 to P8 are asserted only inside their declared "claimed in" scope. P1, P5, and P6 are asserted only for runs with `isolation.mode == "docker-box"` (and for P6 only when `p6Claimed` is true). P3 is asserted for the Repo_World. **P2 is not asserted** (the Repo_World is registered with `deterministic: false`). P4, P7, and P8 belong to other packages. The numbered items 1 to 18 and 22 below are properties of this package's own logic; they are not P-claims.

Reflection on merged criteria: criteria that share one generator and one assertion were merged. Examples: the hardening flags, the forbidden flags, the single read-write mount, the environment whitelist, and the argv-injection rule (Req 4.9, 5.1 to 5.4, 5.8, 5.9) are one argv-builder property. The diff-kind criteria and the sorting and identity criteria (Req 11.5 to 11.12, 11.14, 12 count diff) are one diff-algebra property. Plan B claim, notice, verdict, and `rehearsed` criteria (Req 3.2 to 3.4, 15.3, 15.4, 17.6) are one property. The "no secret in output" criteria (Req 8.11, 9.4, 18.6) are one property. Differ equivalence (candidate hashing vs full hashing) subsumes the `touch` criterion (Req 11.10).

### Property 1: Incremental differ equals full-hash differ

*For any* generated tree and *any* sequence of mutations applied to its Copy (content change with equal size, content change with different size, `touch`, mode change, symlink retarget, create, delete, directory delete, rename, type change), the `Change[]` computed from ctime-candidate hashing equals the `Change[]` computed by hashing every file, and only candidate files are hashed. A mutation that changes no content (`touch`) produces no Change, and a mode-only mutation produces no Change but one `mode-changed` Diagnostic.

**Validates: Requirements 11.1, 11.2, 11.4, 11.10**

### Property 2: Diff algebra

*For any* two manifests `a` and `b` (generated with SQLite count maps), `diff(a, a)` is `[]`; `diff(a, b)` is sorted by `path` in byte order with `kind` as tie-breaker and is deep-equal on repeated calls; the paths of its `file-created` Changes equal the paths of the `file-deleted` Changes of `diff(b, a)`; every entry of a removed directory has a `file-deleted` Change; and every SQLite table whose count differs, appears, or disappears has exactly one `sql-row-count` Change with `dropped: true` only when the table no longer exists (and then `rowsAfter` equal to 0), and `dropped` omitted otherwise. The diff only emits the kinds `file-created`, `file-overwritten`, `file-deleted`, `symlink-changed`, and `sql-row-count` (never `file-modified`, `file-mode-changed`, `sqlite-table-rows-changed`, or `sqlite-unreadable`); a changed regular file gives `file-overwritten`, a retargeted link gives `symlink-changed`, a mode-only difference gives no Change and one `mode-changed` Diagnostic (with `path`, `modeBefore`, `modeAfter`, `stepIndex`), and an unreadable SQLite state gives no `sql-row-count` Change and one `sqlite-unreadable` Diagnostic.

**Validates: Requirements 2.5, 11.5, 11.6, 11.7, 11.8, 11.9, 11.11, 11.12, 11.14, 12.2, 12.3, 12.6, 12.8**

### Property 3: Copy fidelity and link safety

*For any* generated tree with excluded directory names at random depths, symbolic links inside, outside, dangling, and cyclic, and any exclusion list, the Copy contains no directory with an excluded name, contains every non-excluded entry with equal type, content hash, and symlink target string, contains each link as a link, and contains no regular file whose only source was a link pointing outside Original. Original's fingerprint is identical before and after copying.

**Validates: Requirements 4.3, 4.4, 4.7, 13.8**

### Property 4: Original fingerprint ignores excluded directories and finds every other change

*For any* generated tree and any mutation of Original, `compareFingerprints` over the runner's fingerprints reports `changedPaths` equal to the set of changed paths outside excluded directories, and reports no change when only entries inside excluded directories are mutated. The stat-shortcut fingerprint and the full fingerprint give the same result.

**Validates: Requirements 4.10, 13.1, 13.3, 13.4**

### Property 5: Hardened argv

*For any* valid `RunnerOptions` (pool or fresh, any limits in range, any exclusion list, either `excludedDirMode`, any host environment object, any Copy and Original paths including paths with spaces, quotes, and leading `-`), `buildRunArgs` returns an argv array that contains every required flag with the configured value, contains none of `--privileged`, `--cap-add`, `--pid host`, `--ipc host`, or a network other than `none`, has exactly one read-write bind mount (the Copy) plus the read-only mounts of `readonly-mount` mode, has no mount whose source is the Docker socket, the home directory, or a parent of Original, passes exactly the four allowed environment variables, and contains each action string as one element of the `exec` argv, byte-identical (including `;`, `$()`, quotes, newlines, and a leading `-`).

**Validates: Requirements 4.9, 5.1, 5.2, 5.3, 5.4, 5.8, 5.9, 6.1**

### Property 6: Mount audit detects any deviation

*For any* generated expected configuration, `auditInspect` passes on the matching `docker inspect` JSON, and *for any* single-field mutation of that JSON (add a mount, change a mount to read-write, change network mode, add a capability, set privileged, drop `ReadonlyRootfs`, change the image id, add an environment variable), `auditInspect` fails.

**Validates: Requirements 5.6, 5.7**

### Property 7: Configuration and plan bounds

*For any* integer `n`, a plan of `n` actions is accepted exactly when `1 <= n <= 50` and otherwise rejected with an error naming the violated bound before any container is created; *for any* execution limit `t`, the option is accepted exactly when `1 <= t <= 30`; *for any* pool size `p`, accepted exactly when `p` is an integer in 1 to 8.

**Validates: Requirements 6.1, 7.1, 7.3**

### Property 8: Plan B states what it does not claim

*For any* plan and *any* of the two Plan B reasons, the runner executes no action and no process other than the Docker probe, returns `p1Claimed`, `p5Claimed`, and `p6Claimed` all false, `rehearsed: false`, empty `changes` arrays, `observedEvents: []`, the exact notice text, and a verdict of at least `warn`, even when `staticFindings` is empty. The Plan B run never asserts P1, P5, or P6.

**Validates: Requirements 3.2, 3.3, 3.4, 15.1, 15.3, 15.4, 17.6**

### Property 9: Verdict composition and claims

*For any* combination of ward verdict, run status, isolation mode, diagnostics, Original fingerprint outcome, audit outcome, and recorder health, `runnerVerdict` equals the maximum of the ward verdict and the floor defined above; it is `pass` only if the status is `ok`, the mode is `docker-box`, and the ward verdict is `pass`; adding any floor trigger never lowers the verdict; `p1Claimed` is true only when the mode is `docker-box`, the fingerprints are equal, and the audit passed; `p6Claimed` is false whenever secret-read recording or the recorder is not healthy; `external-change` and `isolation-violation` classification follows the audit outcome.

**Validates: Requirements 3.5, 9.8, 10.4, 12.6, 13.4, 13.5, 13.6, 13.7, 14.2, 14.3**

### Property 10: Protected paths inside excluded directories are flagged

*For any* ward set with `path` wards and *any* exclusion list, the `protected-path-excluded` diagnostic is produced for exactly those (ward id, path) pairs whose path has an excluded directory name as a segment, in both `excludedDirMode` values, and the verdict is at least `warn` when at least one pair exists.

**Validates: Requirements 4.11**

### Property 11: Serialization round trip and idempotence

*For any* valid `RunResult` (any statuses, events, captures, Unicode paths, large counts), `parseRunResult(serializeRunResult(r))` is deep-equal to the redacted form of `r`, and serializing the parsed value again produces a string identical to the first serialization.

**Validates: Requirements 14.5, 14.6**

### Property 12: Serialized output never contains payload or secret bytes

*For any* `RunOutput` produced from a plan with payload byte arrays and `secretValues` (file contents that include a canary value), the serialized `RunResult` JSON, the diagnostics, the notices, and the graveyard output contain none of the payload bytes or the secret bytes (including the canary and any substring of a secret file longer than 8 bytes) in raw, base64, or hex form, and contain for each capture only its `eventId`, byte length, and SHA-256. `RunOutput.payloads` contains no `secretValues` entry, and every key of `payloads` equals the `eventId` of exactly one event in `report.observedEvents`. With a fake file-system layer, no secret byte is written to any path, and after the pipeline returns, the `RunOutput` and `RunResult` hold no reference to `secretValues`.

**Validates: Requirements 8.11, 8.14, 8.15, 9.4, 9.11, 9.12, 18.6**

### Property 13: strace parser extracts exactly the destinations and secret reads

*For any* generated syscall trace (interleaved pids, `<unfinished ...>` and `resumed` lines, `AF_INET`, `AF_INET6`, and `AF_UNIX` connects, failed and successful opens, read-only, read-write, and write-only flags, relative paths with `chdir`, dirfd-decorated paths) with known ground truth, the parser emits `network-attempt` events for exactly the non-loopback and allocated-loopback destinations, a `secret-read` event for exactly the successful read opens whose Copy-relative path matches a secret pattern, at most one event per distinct (`stepIndex`, `destination`) or (`stepIndex`, `path`), only the kind `network-attempt` for network events, paths with `/` separators and no `..`, and never throws on arbitrary garbage lines.

**Validates: Requirements 8.7, 8.9, 8.10, 9.2, 9.3**

### Property 14: Recorder output corruption is detected

*For any* valid recorder output, removing a step file, truncating a file, deleting an end marker, inserting an unparseable line, or exceeding the size cap makes the collector report `recorder-failure`; the unmodified output reports none.

**Validates: Requirements 10.4**

### Property 15: DNS codec

*For any* hostname (labels of letters, digits, hyphens, mixed case), decoding an encoded A query yields the lowercase hostname, the response to an A query contains exactly one loopback address allocated for that name and the same name always maps to the same address, and the response to an AAAA query is NOERROR with no answers.

**Validates: Requirements 8.1, 8.3**

### Property 16: Static analysis is exact, pure, and I/O free

*For any* command composed from generated safe tokens and `k` planted external destinations (absolute paths outside `/work`, `~` paths, URLs, database connection strings, in single, double, and unquoted forms), `effectsOutside` returns exactly `k` distinct `Effect` values with non-empty `destination`, returns `[]` when `k = 0`, returns equal results on repeated calls, and performs no call to `fs`, `net`, `dns`, or `child_process` (verified with spies).

**Validates: Requirements 2.7, 2.8, 15.2, 15.5**

### Property 17: Render is JSON-safe

*For any* `RepoState`, `JSON.parse(JSON.stringify(render(s)))` is recursively structurally equal to `render(s)`, and the scene lists every entry with its path, type, and size.

**Validates: Requirements 2.6**

### Property 18: Step outcome handling and cleanup under injected failure

*For any* plan of 1 to 50 actions run against a fake Docker client with generated exit codes, timeouts, and one injected failure at a generated phase (copy, create, audit, exec, collect, fingerprint, diff), the actions are executed in list order with `stepIndex` equal to the position, every executed action has its exit code recorded, a non-zero exit or timeout yields `result.success == false` with a non-empty error and no thrown exception from `step`, and after the call returns or the error propagates, the fake client shows zero containers and volumes for the run id and the Copy directory does not exist.

**Validates: Requirements 2.4, 7.2, 7.8, 16.2, 16.4**

### Property 19: P1 for the Docker box (claimed in Docker-box runs, with Docker available)

*For any* generated fixture tree of at most 50 files and *any* plan of 1 to 50 fixture actions (file operations, deletes, overwrites, symlink creation, writes through links, `cd ..` escapes, absolute paths, SQLite statements), when the run reports `isolation.mode == "docker-box"`, the Original fingerprint hash after the run equals the hash before it and `isolation.p1Claimed` is true. The property is not asserted in Plan B and is reported as `skipped (docker unavailable)` when Docker is absent.

**Validates: Requirements 17.1**

### Property 20: P3 for the Repo_World (claimed in all worlds)

*For any* generated fixture tree and *any* plan of 1 to 50 deterministic fixture actions (file operations only, no time, randomness, or PIDs), `step` leaves the directory of the input snapshot structurally identical (same entries, types, sizes, and content hashes), and two `step` sequences from the same snapshot with the same actions yield equal `Change[]`.

**Validates: Requirements 2.3, 17.3**

### Property 21: P5 and P6 where their prerequisites hold

*For any* generated plan that deletes or overwrites a path matching a `path` ward through the bypass forms `./data/../data/x`, a symbolic link, a glob, `find -delete`, move-then-delete, or a script-hidden delete, when P1 holds, `changes` contains a `file-deleted`, `file-overwritten`, or (for a replaced symbolic link) `symlink-changed` Change for the protected path (P5). *For any* generated plan that reads a file matching an egress-ward secret pattern and then attempts a network connection (by name over HTTP and TLS, by direct IP, by raw TCP), when `p6Claimed` is true, the report contains a `secret-read` event whose `stepIndex` is less than or equal to the `stepIndex` of a `network-attempt` event (P6, action criterion). P6 is not asserted when `p6Claimed` is false or in Plan B.

**Validates: Requirements 17.4, 17.5, 9.2, 8.3**

### Property 22: Pipeline and Repo_World agree

*For any* fixture repository of at most 50 files and *any* single fixture action, `report.changes[0]` from `runPlan` is deep-equal to the `Change[]` produced by `ghostRun(repoWorld, snapshot, [action])` for the same Original. This is a consistency check between two code paths of this package. It is not P2 and does not claim that a ghost diff equals a real execution.

**Validates: Requirements 14.7**

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Docker daemon unreachable, check takes over 2.0 s, or image missing | Plan B (`docker-unavailable` or `box-image-missing`), notice, verdict at least `warn`, no host execution |
| Plan outside 1 to 50 actions, or `execLimitSec` outside 1 to 30 | `PlanBoundsError` / `ConfigError` naming the bound, before any container is created |
| Copy exceeds 20 s | Partial Copy removed, `copy-timeout`, `warn`, no Box |
| Inspect differs from the expected configuration | Container removed, no action runs, `isolation-violation`, `block` |
| Action exits non-zero | `result: { success: false, error }` on its snapshot, plan continues (the caller decides), exit code recorded |
| Execution limit reached | `docker kill`, partial diff, recorder read, `timeout`, at least `warn`, remaining actions skipped |
| Pipeline deadline (55 s) | Remaining phases skipped, container killed and removed, `pipeline-deadline`, returned within 60 s |
| Recorder files missing, truncated, unparseable, over the cap, or liveness probe failed | Diagnostic `recorder-failure`, `p6Claimed: false`, at least `warn` |
| Secret-read recording inactive (tool missing, not configured) with an egress ward | `p6Claimed: false`, at least `warn` |
| SQLite file unreadable after a step | Diagnostic `sqlite-unreadable` (path, `stepIndex`), no `sql-row-count` Change for that file, at least `warn` |
| Mode-only change | No Change; Diagnostic `mode-changed`; no verdict effect by itself |
| Egress-ward secret file unreadable in the Copy | Diagnostic `secret-values-unreadable` (path only), `p6Claimed: false`, at least `warn` |
| More than `MAX_SECRET_FILES` egress-ward secret files, or a file over `MAX_SECRET_FILE_BYTES` | Files beyond the count are not read, larger files are truncated to the cap in path byte order; Diagnostic `secret-values-capped` (path, reason, original byte length, cap; never content); content inspection reduced, Behavior_Criterion and `p6Claimed` unchanged |
| Tracked Original file unreadable during fingerprint | `FingerprintReadError` naming the path, `p1Claimed: false`, at least `warn` |
| Fingerprints differ, audit passed | `external-change` with `changedPaths`, `p1Claimed: false`, at least `warn` |
| Fingerprints differ, audit failed | `isolation-violation`, `block` |
| Protected path inside an excluded directory | Diagnostic `protected-path-excluded`, at least `warn` |
| Any thrown error after the Copier started | `finally` removes container, volume, and Copy directory before the error propagates; cleanup errors are logged to diagnostics and never mask the original error |
| `runPlan` aborted through `signal` | Container, volume and Copy removed before the promise rejects with `signal.reason`; work that settles later is cleaned up again |
| Host process exits or gets SIGINT/SIGTERM with a box alive | Reaper removes this process's boxes by run-id label (`rm -f -v`); after SIGKILL the box stops itself after `--max-lifetime` |
| Process exit with pool slots alive | Exit handler removes this process's slots within 5 s; start-up sweep removes slots whose owner process is dead |
| Hidden or oversized tar entries from `docker cp` | Entry rejected, treated as `recorder-failure` |

Safety of logging: secret file contents and payload bytes are never written to the result, logs, or graveyard output. Only path, byte length, and SHA-256 are recorded.

---

## Testing Strategy

Property-based testing applies to the pure and fs-level logic (differ, copier, fingerprint, argv builder, audit, verdict, parsers, serialization, static analysis) and, with Docker available, to the safety properties for the Repo_World. It does not apply to timing budgets, the image build, README content, or Docker behavior itself; those use measurement tasks, smoke tests, and 1 to 3 examples.

Library: `fast-check` (devDependency, MIT) with `vitest`. No property-based testing is implemented from scratch. Each property is one `fc.assert` test tagged with a comment `Feature: ghost-runner, Property <n>: <title>`.

### Run profiles

| Profile | Trigger | Examples per property | Limit |
|---|---|---|---|
| On-save | `contract-pbt` hook on `core/**`, `worlds/**` (kiro-integration spec sets the example count, W8) | 20 for Properties 19 and 20 (Docker properties); 20 for the others too, for speed | Whole on-save run within 60 s |
| Explicit | `pnpm --filter @ghost-run/ghost-runner test:pbt` | at least 100 | none |
| Nightly | `GHOST_PBT_MODE=nightly` | at least 10,000 | none |

The profile is read from `GHOST_PBT_MODE` (`save`, default `explicit`, `nightly`). To stay inside 60 s on save, Docker-backed properties use a pool of 2 slots, fixture trees of at most 50 files, a plan-length distribution weighted toward short plans (up to 50 is reachable but rare), and `interruptAfterTimeLimit: 25_000` per Docker property. If the time limit interrupts a property, the report states how many of the 20 examples ran; fewer than 20 is reported as `partial`, not as a pass of the full profile.

### Docker-dependent tests

Tests that need Docker use `describe.skipIf(!dockerAvailable)` and a reporter label so that the summary prints `skipped (docker unavailable)` rather than `passed` (Req 17.7). These cover Properties 19 to 22, the five scenarios, the port-binding test, the recorder integration tests, and the Plan B transition (a deliberately unreachable Docker host).

### Scenario acceptance tests (Req 18, Docker)

Fixture repository (at most 50 files, canary `sk-CANARY-abc123` in `.env`, SQLite `app.db` with a `users` table of 1,206 rows, `data/`, `build/`, a `package.json` with `test` as `node --test` and `clean` as `rm -rf data`, no `node_modules`). Example tests for: scenario 1 (`sql-row-count`, 1206 to 0, `dropped: true`), 2 (`file-deleted` for every file in `data/` and `build/`), 3 (`secret-read` of `.env` then a `network-attempt` to `setup-check.example`, captured payload SHA-256 equal to the hash of a body containing the canary, serialized result free of the canary), 4 (`changes[0] == []` for fixture paths, no `registry.npmjs.org` event, total under 3.0 s median), 5 (`npm run clean` gives `file-deleted` for `data/`). All hostnames are reserved domains; the only other host name is `registry.npmjs.org` as the `allow_hosts` example (Req 18.7). A grep-based test checks fixtures for non-reserved hostnames.

### Other example and smoke tests

- Core ward unit tests (W0, no Docker): `symlink-changed` on a protected path gives a `path` ward violation for `overwrite`; `sql-row-count` with `dropped: true` counts as rows lost; an `ObservedEvent` with `eventId` is accepted; `secretValues` and `payloads` are accepted and never appear in the returned `WardVerdict`. The existing 35 `core` tests must still pass.
- Differ example tests: a mode-only change gives `[]` plus a `mode-changed` Diagnostic and no verdict change; an unreadable SQLite state gives no `sql-row-count`, a `sqlite-unreadable` Diagnostic, and a verdict of at least `warn`; a dropped table gives `dropped: true` and a new table omits `dropped`.
- Secret hand-off test: the fixture and assertions of the "Test design note" in the secretValues section (canary and 8-byte-window check across all outputs, no `secretValues` reference after return). Cap test: see tasks 12.8a and 12.8b (count cap, truncation determinism, `secret-values-capped` without content, behavior criterion unchanged).
- Compile-time test that `repoWorld` is assignable to `World<RepoState, ShellAction>`; `metadata.deterministic === false`.
- `verifyWorld(repoWorld, { id: "repo", deterministic: false, wardSet })` from `@ghost-run/core/verify` passes before registration (Req 17.9). With `deterministic: false`, P2 is skipped by core.
- Port-binding test under the full hardening options (`--cap-drop ALL` and the rest): the recorder binds 53, 80, and 443 (Req 8.13).
- Timeouts with a fake clock: Docker check 2.0 s, copy 20 s, execution 30 s, pipeline 55 s and return within 60 s.
- Pool lifecycle model test (one use per slot, replacement, label sweep with owner liveness).
- Repository scan test (hidden Unicode characters built from escapes in test code, no real credential patterns).

### Measurement tasks (not automated assertions)

The secret-read trial (W6) and the timing measurement (W7) record medians and maxima; they are tasks, not runtime behavior.

---

## Work Items for tasks.md

These are inputs for the tasks phase. Nothing here has been applied.

| ID | Work item | Notes |
|---|---|---|
| W0 | Core_Type_Extensions, done FIRST (section "Core type changes"). In `core/src/types.ts`: `symlink-changed` in the `FileChange` kinds, optional `dropped` on `SqlRowCountChange`, optional `eventId` on `ObservedEvent`, `SecretValues` and `EvaluateInputs`, exported from the public entry. In `core/src/wards.ts`: optional third parameter of `WardEngine.evaluate`, `symlink-changed` treated as `overwrite` for `path` wards, `dropped` counted as all rows lost. Tests: the existing 35 `core` tests pass, plus new ward unit tests for each new kind and field and for `secretValues` never appearing in the `WardVerdict` | Req 1.6, 1.7. No other work item starts before W0 is merged. Coordinate the `EvaluateInputs` shape with the `wards` spec (W5) |
| W1 | Add `ghost-runner` to `pnpm-workspace.yaml`; create `ghost-runner/package.json` (`@ghost-run/ghost-runner`, dependency `@ghost-run/core` as `workspace:*`, `shell-quote`), tsconfig, ESLint config; add the `no-restricted-imports` pattern to `core/eslint.config.mjs` that forbids importing `ghost-runner`; make `pnpm lint` fail on violation | Req 1. Depends on W0 |
| W2 | Update `.kiro/steering/structure.md`: list `ghost-runner/` as a separate workspace package (not under `integrations/`), with dependency direction `ghost-runner -> core`; the blacklight-steering hook runs on save | Open item of the requirements |
| W3 | Box image: `box/Dockerfile`, resolve and record `BASE_DIGEST`, snapshot-pinned packages, recorder scripts, `box:build` command, content-addressed tag, license table check before merge | D4 |
| W4 | Core build changes (separate from ghost-runner code): `core/tsconfig.build.json`, `exports` map with `.` and `./verify`, `main`/`types`/`files`, `build` and `clean` scripts, `dist` in `.gitignore`, optional `fast-check` peer dependency, `pnpm -r build` ordering | Depends on W0 so `dist/` contains the extended types. Do not modify core build config before this task |
| W5 | Confirm with the `wards` spec that the W0 shapes (`eventId`, `SecretValues`, `EvaluateInputs`) are what it expects; payload bytes still travel only in `RunOutput.payloads`, keyed by `eventId` | If wards need a different shape, change W0 before other work |
| W6 | Secret-read recording trial: matrix of D1 on the Reference_Repo and Reference_Machine, 10 runs per cell, median and maximum; replace the 0.8 s provisional bound; write results to `docs/research.md` | Req 9.5 to 9.7 |
| W7 | Timing measurement task: Median_Of_5 and maximum of every phase and scenario, including Docker Desktop `ctime` propagation check; write results to `docs/devlog.md` | Req 19.5 |
| W8 | `contract-pbt` hook configuration: 20 examples per property on save for the Repo_World, with the 60 s limit. Belongs to the `kiro-integration` spec | Req 17.8 |
| W9 | Port 53/80/443 binding verification test under the full hardening options, reporting `skipped (docker unavailable)` without Docker | Req 8.13 |
| W10 | README sections: library and license table, Plan B limitation (no P1/P5/P6 claim), recorder tamper statement, macOS and Linux support, Windows unverified, Docker Desktop license note | Req 1.5, 3.6, 10.2, 19.6 |

**Dependency ordering.** W0 is first and blocks everything else, because every later item compiles against the extended `core` types (Req 1.6) and W0 ends with the 35 existing `core` tests and the new ward unit tests green. After W0: W5 (confirm shapes) and W4 (core build) can run in parallel; W1 (package scaffold, needs `@ghost-run/core` types) follows W0 and, for runtime imports, W4. W2, W3, and W10 are independent of code and may start any time, but are merged after W0. W9 needs W1 and W3. W6 and W7 need W1, W3, and the recorder code. W8 belongs to the `kiro-integration` spec. Application code (differ, copier, recorder, pipeline, `secretValues`, `eventId` assignment) needs W0, W1, and W3.

---

## Resolved Open Items

| Open item (from requirements) | Resolution |
|---|---|
| Recording method and cost of secret-read recording | D1: `strace` with seccomp-bpf, provisional 0.8 s bound, trial W6 |
| Where recorder output lives outside the Copy | D2: anonymous Docker volume at `/ghost-rec`; limitations stated |
| Baseline hash for ctime candidates | D3: reuse the pre-run Original fingerprint hashes |
| Local build vs pull of the Box image | D4: local build, base by digest |
| Exact shape of `secretValues` and the `evaluate` parameter | "Core type changes": `SecretValues`, optional `EvaluateInputs` third parameter; confirmed with the `wards` spec in W5 |
| `structure.md` update | W2 |
| Timing and trial results location | W6, W7 |
| `contract-pbt` 20 examples on save | W8 (kiro-integration spec) |
| Port binding under hardening | W9 |

Design note for the requirements owner: Req 5.3 allows exactly one read-write host path. D2 follows that wording by using a Docker volume for `/ghost-rec` instead of a second host directory. If a host directory were preferred, Req 5.3 would need an exception for it.

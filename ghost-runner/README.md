# @ghost-run/ghost-runner

Docker box runner, Repo_World, and Plan B static analysis for Ghost Run+.

## Box image

Build it explicitly (the hook path never builds):

```
corepack pnpm --filter @ghost-run/ghost-runner box:build
```

This builds `ghost-run/box:<sha256 of box/Dockerfile + box/BASE_DIGEST + box/recorder/*>` and sets the label
`ghost-run.box.hash`. The base image `node:20-bookworm-slim` is pinned by digest (`box/BASE_DIGEST`). The Debian
packages are installed from a snapshot.debian.org archive fixed by timestamp. The image is never pushed.

### Box-only CA

The box has a throw-away certificate authority so the in-box recorder can capture HTTPS requests. `docker build`
creates it with `openssl` in `/opt/ghost/ca` (`ca.crt`, `ca.key`), installs the certificate with
`update-ca-certificates`, and sets `NODE_EXTRA_CA_CERTS` to the certificate. The CA is not in the repository
(`.gitignore` blocks key files and `tests/no-private-key.test.ts` scans for them). It exists only in the image
layers and is used only inside the network-less box, never on the host.

## Usage

`runPlan` rehearses a plan (1 to 50 shell actions) against a Copy of a directory and returns a `RunOutput`
(`result`, `payloads`). The Original is never written.

```ts
import { runPlan } from '@ghost-run/ghost-runner';

const out = await runPlan(
  [{ command: 'rm -rf data' }, { command: 'node --test', cwd: '.' }],
  {
    original: '/path/to/repo',
    execLimitSec: 25,
    onNotice: (notice) => console.error(notice),
  },
);
console.log(out.result.verdict, out.result.isolation.mode, out.result.report.changes);
```

`createRepoWorld(options)` returns the `World<RepoState, ShellAction>` for the same directory (`snapshot`, `step`,
`diff`, `render`, `fingerprint`, `effectsOutside`) plus `dispose()`, which removes every Copy it created.
Both take the same `RunnerOptions`. Invalid input throws `PlanBoundsError` or `ConfigError` before anything is created.

### Run id

`RunnerOptions.runId` is optional. It must match `^[A-Za-z0-9_-]{1,64}$`. A bad format, or a value already used by an
existing ghost-run container, throws `ConfigError`. When absent, the runner uses a random UUID. The id is set as the
label `ghost-run.run-id` on the box and its volume and is part of the container name, so a watchdog can find and
remove the box by label.

`RunnerOptions.pipelineDeadlineSec` is optional (1 to 55, default 55, else `ConfigError`). The package exports
`LABEL_RUN_ID` (`ghost-run.run-id`) so callers do not write the label string.

### Cleanup and stale boxes

After the Copier starts, the box, its recorder volume, and the Copy are removed even when an error is thrown or the
run is aborted, so a run leaves no Docker containers or volumes behind. Every box carries the label
`ghost-run.owner=<pid>:<process start time>`. At the first `runPlan` of a process, the runner sweeps boxes (and their
volumes) whose owner process is dead, for example after SIGKILL of the host. Boxes of live owners, of the current
process, and boxes without the owner label are never touched. The sweep runs outside the timed phases and never fails
a run (a failure becomes the diagnostic `stale-sweep-failed`).

### Pool

`RunnerOptions.pool` (`{ size }`, 1 to 8) keeps warm boxes. It is off by default and is meant only for long-lived
hosts such as the MCP server and tests. Per-hook processes leave it off.

## Plan B (Docker unavailable)

When the Docker daemon is not reachable within 2.0 s, or the box image is missing, `runPlan` executes nothing on the
host. It returns `isolation.mode: "static-analysis"`, `rehearsed: false`, no P1, P5, or P6 claim, empty change arrays,
no observed events, the static findings, and a verdict of at least `warn`. It adds this notice to `result.notices` and
passes it to `onNotice`:

> P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.

For a missing image the notice is followed by a hint to run `box:build`.

## Notes for kiro-integration

For the `contract-pbt` hook (File Save on `core/**` and `worlds/**`). The hook belongs to the `kiro-integration`
spec. This section only records what the runner needs from it.

- **Mode.** Run the Repo_World properties with `GHOST_PBT_MODE=save`. This gives 20 examples per property. The whole
  on-save run must finish within the 60 s hook limit. The hook makes no LLM call.
- **No Docker tests.** `vitest.config.ts` defines two vitest projects: `unit` (no Docker) and `docker`. The hook must
  select only `unit`. The full suite takes about 10 minutes in one run and is not an on-save run.
- **Command.**

  ```sh
  GHOST_PBT_MODE=save corepack pnpm --filter @ghost-run/ghost-runner exec vitest run --project unit
  ```

  To check the selection without running any test, use the `list` command. On vitest 3.2.7 `vitest run` has no
  `--list` option, so `vitest run --project unit --list` fails with `Unknown option --list`:

  ```sh
  GHOST_PBT_MODE=save corepack pnpm --filter @ghost-run/ghost-runner exec vitest list --project unit --filesOnly
  ```

  This lists 42 files, all under `tests/`, none of them a Docker file.
- **Related files only.** Even the `unit` project may exceed 60 s on a cold machine. The hook should select only the
  files related to the saved path, for example `vitest related <saved file> --run --project unit` or a file filter
  such as `vitest run --project unit tests/repo-world.test.ts`.
- **Claims.** Tests that need Docker (project `docker`) are not run on save and report
  `skipped (docker unavailable)` where they are started without Docker. P1, P5, and P6 are not asserted on save.
- **Hook script limits.** The script must not build the box image, must not start a pool per process (leave
  `RunnerOptions.pool` off), must not run Docker tests, and must make no LLM call.
- **Run id.** The runner accepts an optional `runId` (see [Run id](#run-id)). A gate that starts a run can pass its
  own id and later remove the box and volume by the label `ghost-run.run-id`.

## Claims and recorder

- P1, P5, and P6 are claimed only for runs in the Docker box. They are never claimed in Plan B.
- The recorder reports `tamperResistant: false`. It runs inside the box as the same user as the plan, so a plan can
  rewrite its own records. Recorder output is checked fail-closed (diagnostic `recorder-failure`), but it is not an
  integrity guarantee.

## Platforms

Supported on macOS (Apple Silicon) and Linux. Windows is unverified.

Docker Desktop is proprietary software under the Docker Subscription Service Agreement. It is free for personal use,
education, non-commercial open source, and companies with fewer than 250 employees and less than US $10M annual
revenue. Larger companies need a paid subscription. Alternatives: Docker Engine on Linux, Colima (MIT), and Podman
(Apache-2.0). See `docs/research.md`.

## Libraries and licenses

| Component | Where | Version | License |
|---|---|---|---|
| Node.js (base image `node:20-bookworm-slim`) | box | v20.20.2 | MIT |
| strace | box | 6.1-0.1 | LGPL-2.1-or-later |
| sqlite3 | box | 3.40.1-2+deb12u2 | Public domain |
| curl | box | 7.88.1-10+deb12u15 | curl license |
| openssl | box | 3.0.22-1~deb12u1 | Apache-2.0 |
| ca-certificates | box | 20250419~deb12u1 | GPL-2.0-or-later (scripts), MPL-2.0 (certificate data) |
| shell-quote | host dependency | 1.12.0 | MIT |
| fast-check | host dev dependency | 4.10.2 | MIT |
| vitest | host dev dependency | 3.2.7 | MIT |
| typescript | host dev dependency | 5.9.3 | Apache-2.0 |

Box package versions and licenses are those of the Debian bookworm packages installed in the box image.

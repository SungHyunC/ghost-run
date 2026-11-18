# Research notes

Collected on 2026-11-18 by Claude Code through web research, using official sources only (vendor docs, official repositories, package registries, trademark registries). Several pages were read through a summarising fetch tool, so re-open a source before quoting it in the README, the Devpost write-up or the video.

## 1. How Ghost Run+ compares with existing tools

"Not documented" means the official pages listed were checked and do not mention the feature. It is not proof that the feature is absent.

| Tool | Isolation (network default) | Shows what would change before the real run | Declarative policy | Links an action to injected source text | Kiro integration |
| --- | --- | --- | --- | --- | --- |
| Claude Code sandbox and permissions | OS sandbox for Bash (Seatbelt, bubblewrap). Off by default; when on, outbound traffic goes through an allowlist that starts empty [cc-sandbox] | Partial: the permission prompt shows the command text; edits made with its own file tools are shown before approval; no dry run of shell commands [cc-perm] | JSON permission rules (allow / ask / deny) that match command text, plus a sandbox block for paths and domains [cc-perm] | Not documented | Not documented. Listed as an agent backend for Kiro Crew [kiro-crew] |
| OpenAI Codex CLI | OS sandbox (Seatbelt, bwrap + seccomp, Windows). Network off by default [codex-sec] | No. Approval is asked per action [codex-sec] | `config.toml` plus experimental Starlark `.rules` that match command prefixes [codex-rules] | Not documented | Not documented. Listed as a Kiro Crew backend [kiro-crew] |
| Cursor | OS sandbox (Seatbelt, Landlock + seccomp). Network blocked by default, then opened by the allowlist [cursor-run] | No. File edits are written to disk immediately; run modes decide per command [cursor-sec] | `sandbox.json`, `permissions.json` (plain-English instructions for a classifier), `hooks.json` [cursor-sandbox] | Not documented | Not documented |
| terraform plan | None. It reads live remote state [tf-plan] | Yes, resource-level, for resources Terraform manages [tf-plan] | HCL validations; HCP Terraform checks the plan against policy sets (Sentinel, OPA, HCL) on each run [tf-policy] | Not applicable | Official Kiro power (Terraform MCP server) [tf-power] |
| Flyway `dryRunOutput`, Liquibase `update-sql` | None. Works against the real database (Flyway's dry run uses a read-only connection) [flyway-dry] | The SQL statements that would run, not the rows that would change [flyway-dry][lb-sql] | Policy checks on migration SQL and changelogs [flyway-rules][lb-checks] | Not applicable | Not documented |
| E2B | One Firecracker microVM per sandbox. Internet allowed by default [e2b-net] | No built-in diff; its examples run `git diff` after the agent finishes [e2b-cc] | No policy file; egress lists are set in SDK code [e2b-net] | Not documented | Partial: documents running Kiro CLI inside a sandbox [e2b-kiro] |
| Dagger container-use | A container and git branch per agent. Network default: unverified [cu] | Yes, file-level: `container-use diff` before merge. No database rows [cu-cli] | `environment.json` describes setup; no policy language [cu-env] | Not documented | Documented: MCP config plus a steering file for Kiro [cu-agents] |
| Invariant Guardrails, Snyk Agent Scan (formerly MCP-scan; Invariant Labs was acquired by Snyk in June 2025) | None (a rule layer and a scanner) [inv] | No | Guardrails rule language with a flow operator (`->`) and detectors such as `prompt_injection` and `unicode` [inv-ref] | Partial: a hand-written flow rule can link a flagged tool output to a later tool call, and violations point into the trace [inv] | Partial: Agent Scan scans Kiro MCP configurations; Snyk ships a separate Kiro power [agent-scan][kiro-powers] |

Kiro itself now ships a local command sandbox (Kiro IDE 1.3+, Kiro CLI 2.31+). It is off by default; when it is on, the default network mode blocks everything except allowed hosts [kiro-sandbox]. The status bar of Kiro IDE 1.4.215 shows it as "Sandbox: Off".

What the sources support:

1. Network-blocked isolation is not new. Codex, Cursor, Claude Code (once enabled), E2B, container-use and Kiro's own sandbox all isolate commands in some way. Docker with `--network none` is an implementation choice, not a differentiator.
2. None of the eight documents running a single arbitrary shell or SQL command on a copy and showing both the file diff and the database-row diff before the real run. Existing previews are domain-specific: Terraform resources, migration SQL text, or a file diff of an agent's whole branch.
3. Judging a computed change set with a policy file exists in one domain (HCP Terraform policy on the plan). Applying that pattern to the diff of arbitrary shell or SQL commands (`wards.yaml`) is not documented by any of the eight.
4. Linking an action to injected text is not new in kind: Invariant Guardrails does it with hand-written flow rules. Ghost Run+ may differ by attributing a blocked action to a source line automatically and showing it next to the diff, but this has to be built and tested before it is claimed.
5. Gating Kiro tool calls through a Pre Tool Use hook is a supported Kiro pattern, not a novel capability. None of the eight documents doing it.

Caveats for the pitch:

- A ghost without network cannot see remote state. terraform plan and Flyway read live remote state; Ghost Run+ previews only what exists in the local copy. External effects become a warn verdict and need human approval.
- Kiro users may already have the isolation layer through Kiro's sandbox, so lead with the diff, the policy on the diff and the provenance trace.

## 2. Licenses of the planned stack

Versions are what the registries returned on 2026-11-18.

| Package (version checked) | License | Notes |
| --- | --- | --- |
| typescript 7.0.2 | Apache-2.0 | Development only |
| pnpm 12.21.0 | MIT | Development only |
| vite 8.3.8 | MIT | Development only |
| react 19.3.1 | MIT | Bundled into the playground; ship its notice |
| three 0.187.0 | MIT | Bundled; ship its notice |
| @mujoco/mujoco 4.0.1 | Apache-2.0 (package.json). The package contains no LICENSE or NOTICE file | The WASM includes third-party code: Qhull (Qhull license, not OSI-approved, requires shipping its license text and a source-availability notice), tinyxml2 (Zlib), tinyobjloader (MIT), libccd (BSD-3-style), miniz (MIT), lodepng (Zlib). The README says the bindings are still a work in progress. 4.0.0 was published 2026-11-06; the plan cites the 3.9.0 README |
| sql.js 1.16.0 | MIT | Bundles SQLite, which is public domain |
| shell-quote 1.12.0 | MIT | |
| vitest 5.1.0 | MIT | Development only |
| fast-check 4.10.2 | MIT | Development only |
| @modelcontextprotocol/sdk 1.32.2 | MIT | The upstream v2 packages are moving to Apache-2.0 |
| moto 5.2.5 (PyPI) | Apache-2.0 | Optional third world |
| Docker Engine (moby) | Apache-2.0 | |
| Docker Desktop | Proprietary (Docker Subscription Service Agreement) | Free for personal use, education, non-commercial open source, and companies with fewer than 250 employees and less than US $10M annual revenue. Larger companies and all government entities need a paid subscription |
| Franka Emika Panda model (mujoco_menagerie) | Apache-2.0 | Grants no rights to the "Franka Emika" or "Panda" names |

Follow-ups:

- Generate a third-party notices file at build time for everything bundled into the static playground, including the libraries inside `mujoco.wasm` (Qhull's license text in particular).
- Keep the root `LICENSE` plain MIT so GitHub keeps detecting it; put third-party texts elsewhere.
- The README should state the Docker Desktop terms for "real mode" and name alternatives: Docker Engine on Linux, Colima (MIT), Podman (Apache-2.0).

Sources: npm and PyPI registry pages for each package; https://github.com/google-deepmind/mujoco/blob/main/LICENSE; https://github.com/google-deepmind/mujoco/blob/main/cmake/MujocoDependencies.cmake; https://github.com/qhull/qhull/blob/master/COPYING.txt; https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE; https://docs.docker.com/subscription/desktop-license/; https://www.docker.com/legal/docker-subscription-service-agreement/; https://github.com/google-deepmind/mujoco_menagerie/blob/main/franka_emika_panda/LICENSE.

## 3. Name check (informal, not legal advice)

- "Ghostrunner" is a registered mark for video games and related goods (US Reg. 6696607; EU trademarks 018251382 and 018251400; classes 9, 28 and 41). The EU registrations list "Software" among the goods. Korea's KIPRIS shows no Ghostrunner mark. Sources: https://tsdr.uspto.gov/statusview/sn90343642, https://euipo.europa.eu/trademark/data/EM500000018251382.
- A US application for "GHOSTRUN" in class 42 (AI workflow software) was filed on 2026-09-04 and is pending (SN 50091776). A product called Ghostrun is published at ghostrun.app by Revenant AI LLC. This is closer to Ghost Run+ in sound and field than the game. Source: https://tsdr.uspto.gov/statusview/sn50091776.
- Open-source names already in use: npm `ghostrun-cli` installs the commands `ghostrun` and `ghostrun-mcp`; PyPI `ghostrun` exists; a GitHub repository named `ghostrun` from another 2026 hackathon uses a similar "play it first" pitch. The npm names `ghost-run` and `ghostrun` were unclaimed on 2026-11-18.
- Practical steps: do not use `ghostrun` as a command or MCP server name (keep the hyphenated `ghost-run`); consider a one-line non-affiliation note in the README; revisit the name if the project continues after the hackathon.

## 4. Hackathon rules checked

From https://kiroween.devpost.com/rules and https://kiroween.devpost.com/ (fetched 2026-11-18; the rules page says it was updated on November 16, 2026):

- Submission deadline: December 4, 2026, 2:00 pm Pacific Time (December 5, 07:00 KST). No extensions.
- Kiro credit requests close on December 1, 2026, 12:00 pm PT. ID verification is required (a selfie and a government ID), and the name on the Devpost profile must match the ID exactly.
- "Insufficient use of Kiro will result in disqualification at the Judges' sole discretion." The rules contain no clause about other AI tools or AI-generated code.
- Projects must be built from October 30, 2026; pre-existing code must be disclosed.
- The app must stay testable until January 29, 2027.
- The demo video must not include third-party trademarks without permission.
- South Korea is not on the list of excluded countries.

## 5. Secret-read recording trial (W6, ghost-runner task 15.1)

Question: how much latency does `strace` on `openat` add to one action inside the box (design D1, requirements 9.5 to 9.7)?

Method: `ghost-runner/scripts/trial-secret-read.mjs`. One hardened box (`--network none`, `--cap-drop ALL`, read-only root, copy-only bind mount, in-box fake DNS) with a generated fixture of 3,945 files and a canary `.env`. Each cell ran 10 times after one discarded warm-up, interleaved across variants. The numbers are the wall time of `docker exec` measured on the host, so the fixed `docker exec` overhead is inside every cell and cancels in the difference.

| Command | Variant | Median (s) | Max (s) |
| --- | --- | --- | --- |
| `true` | (a) no strace | 0.040 | 0.045 |
| `true` | (b) strace `connect` only | 0.044 | 0.049 |
| `true` | (c) strace `connect`+`openat`, plain ptrace | 0.045 | 0.062 |
| `true` | (d) strace `connect`+`openat`, `--seccomp-bpf` | 0.042 | 0.044 |
| `npm test` | (a) no strace | 0.177 | 0.189 |
| `npm test` | (b) strace `connect` only | 0.343 | 0.362 |
| `npm test` | (c) strace `connect`+`openat`, plain ptrace | 0.346 | 0.808 |
| `npm test` | (d) strace `connect`+`openat`, `--seccomp-bpf` | 0.206 | 0.282 |

(d) minus (a): `true` +0.001 s median; `npm test` +0.029 s median (+0.093 s maximum against maximum).

Decision: the rule holds (both differences are at most 0.8 s). The design keeps `strace -f --seccomp-bpf` and secret-read recording stays on (`p6Claimed` is not lowered by this trial). The provisional 0.8 s bound is replaced by 0.05 s Median_Of_5 (the larger difference, 0.029 s, rounded up). Plain ptrace (c) is not needed and is not used; it costs about +0.17 s for `npm test` here. Variant (b) is slower than (d) for `npm test` because a `connect`-only filter without `--seccomp-bpf` stops the tracee on every syscall.

Caveats: the `npm test` script in the fixture only prints a line (`node -e`), like the quick 0.3 to 0.6 s `npm test` of experiment A; a test run that opens many more files will cost more. Single machine, one session.

Machine: Apple M1, 8 cores, 16 GiB (17179869184 bytes), Docker Desktop 4.94.0 (Engine 29.8.2), macOS.

| | Time (UTC) | `vm.loadavg` (1, 5, 15 min) |
| --- | --- | --- |
| Start | 2026-11-18 09:22:03 | 4.39, 11.67, 14.00 |
| End | 2026-11-18 09:22:24 | 4.52, 11.22, 13.78 |

The 1-minute load was still about 4.4 at the start (it was decaying from an earlier test run; it was 46 five minutes before the wait ended). The load is moderately high, so absolute times may be slightly pessimistic; the variants were interleaved so that the differences are comparable.

## Reference links

[cc-sandbox]: https://code.claude.com/docs/en/sandboxing
[cc-perm]: https://code.claude.com/docs/en/permissions
[codex-sec]: https://learn.chatgpt.com/docs/agent-approvals-security
[codex-rules]: https://learn.chatgpt.com/docs/agent-configuration/rules
[cursor-run]: https://cursor.com/docs/agent/run-modes
[cursor-sec]: https://cursor.com/docs/agent/security
[cursor-sandbox]: https://cursor.com/docs/reference/sandbox
[tf-plan]: https://developer.hashicorp.com/terraform/cli/commands/plan
[tf-policy]: https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement
[tf-power]: https://www.hashicorp.com/en/blog/hashicorp-is-a-kiro-powers-launch-partner
[flyway-dry]: https://documentation.red-gate.com/fd/migration-command-dry-runs-275218517.html
[flyway-rules]: https://documentation.red-gate.com/fd/configuring-regex-rules-313493155.html
[lb-sql]: https://docs.liquibase.com/secure/reference-guide-5-1/init-update-and-rollback-commands/update-sql
[lb-checks]: https://docs.liquibase.com/secure/user-guide-5-1/what-are-policy-checks
[e2b-net]: https://docs.e2b.dev/network/internet-access.md
[e2b-cc]: https://docs.e2b.dev/agents/claude-code.md
[e2b-kiro]: https://docs.e2b.dev/agents/kiro.md
[cu]: https://github.com/dagger/container-use
[cu-cli]: https://container-use.com/cli-reference
[cu-env]: https://container-use.com/environment-configuration
[cu-agents]: https://container-use.com/agent-integrations
[inv]: https://github.com/invariantlabs-ai/invariant
[inv-ref]: https://invariantlabs-ai.github.io/docs/mcp-scan/guardrails-reference/
[agent-scan]: https://github.com/snyk/agent-scan
[kiro-sandbox]: https://kiro.dev/docs/sandbox.md
[kiro-crew]: https://kiro.dev/docs/crew/features/agent-backends.md
[kiro-powers]: https://kiro.dev/powers/

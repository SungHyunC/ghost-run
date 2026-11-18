# Requirements Document

## Introduction

`world-smith` is a Kiro custom agent for the CLI and the IDE. It builds a new Ghost Run+ world from a spec: it copies the `_new-world` template, writes the world spec, implements the world in `worlds/<name>/`, registers it, and gets it through the `verifyWorld` registration gate and its wards. The agent is one configuration file, `.kiro/agents/world-smith.json`. It has no runtime code and no safety property of its own. Hooks and wards stay the enforcement; the agent only follows the order of work.

The demo scene is "Kiro builds a third world (Ghost Cloud: a fake S3 in memory, wards `no-bucket-delete` and `no-public-bucket`) from one spec" with this agent. This spec does not build Ghost Cloud.

## Glossary

- **Agent_File**: `.kiro/agents/world-smith.json`.
- **Template**: `.kiro/specs/_new-world/` (README, requirements, design, tasks skeletons).
- **Registration_Gate**: `verifyWorld` of `@ghost-run/core/verify`, called by `worlds/<name>/tests/contract.test.ts`.
- **Agent_Test**: `integrations/kiro-hook/tests/agent-file.test.mjs`.

## Requirements

### Requirement 1: Agent file and location

**User Story:** As a developer, I want a workspace custom agent, so that `kiro-cli chat --agent world-smith` and the IDE agent list both offer it.

#### Acceptance Criteria

1. THE Agent_File SHALL be valid JSON at `.kiro/agents/world-smith.json` with `name` equal to `world-smith` and a non-empty `description`.
2. THE Agent_File SHALL NOT set `model`, so that the model stays Auto.
3. THE Agent_File SHALL pass `kiro-cli agent validate --path .kiro/agents/world-smith.json`.
4. THE Agent_File SHALL set `welcomeMessage` to one short line that names the first step.

### Requirement 2: Resources

**User Story:** As a world author, I want the agent to start with the template and the repository rules in context, so that it does not guess the contract.

#### Acceptance Criteria

1. THE Agent_File SHALL list in `resources` exactly these entries as `file://` URIs relative to the workspace: `.kiro/specs/_new-world/README.md`, `.kiro/steering/world-contract.md`, `.kiro/steering/structure.md`, `.kiro/steering/security.md`.
2. EVERY `file://` entry in `resources` SHALL point to a file that exists.
3. THE Agent_File SHALL NOT list a path that is absolute or contains `..`.

### Requirement 3: Tools, permissions, and exclusions

**User Story:** As a maintainer, I want the agent to run only test, typecheck, and lint commands without asking, so that dangerous commands still need a human or the ghost-gate.

#### Acceptance Criteria

1. THE Agent_File SHALL set `tools` to a list that contains `read`, `write`, and `shell` and no wildcard `*`.
2. THE Agent_File SHALL carry `permissions.rules` in which every rule has `effect` `allow`, `capability` `shell`, and `match` entries that begin with `corepack pnpm ` and end with `test`, `typecheck`, or `lint`.
3. NO rule SHALL allow a command that contains `rm`, `rmdir`, `unlink`, `mv`, `git`, `curl`, `wget`, `sudo`, `chmod`, `install`, or `exec`.
4. THE Agent_File SHALL set `includeMcpJson` to `false` and `includePowers` to `false`, and `excludedTools` SHALL name the Kiro Crew MCP server `kirocrew-work`.
5. THE Agent_File SHALL NOT mention a `kirocrew-` agent as something to call.

### Requirement 4: The order of work in the prompt

**User Story:** As a world author, I want the agent to follow the same order every time, so that a new world passes the gate on the first full run.

#### Acceptance Criteria

1. THE `prompt` SHALL state these steps in this order: (1) ask for the world name in kebab-case and the real system it mirrors; (2) copy the Template to `.kiro/specs/<name>/` and write requirements, design, and tasks, then wait for the human to approve each file; (3) implement the six `World<S, A>` functions in `worlds/<name>/`; (4) register the world in `worlds/<name>/world.config.ts`; (5) write `worlds/<name>/wards.yaml`; (6) pass the Registration_Gate; (7) pass the ward properties; (8) report.
2. THE `prompt` SHALL tell the agent to use the `world-scaffold` hook (it fires when the agent creates a file in `worlds/<name>/`) and the `contract-pbt` hook (it fires on save) when they are enabled, and to run the same work by command when they are disabled: copy the four files from `integrations/kiro-hook/lib/scaffold/templates.mjs`, then run `corepack pnpm --filter <package> test`.
3. THE `prompt` SHALL state the limits of the agent: it changes only the spec folder and `worlds/<name>/` of the new world, not `core/`, other worlds, hook files, or `.kiro/agents/`; it asserts a safety property only within its declared scope; it uses canary secrets and reserved domains only; it writes no hidden character; and it does not delete files without asking.
4. THE `prompt` SHALL NOT contain the HTML comment opener or a hidden character.

### Requirement 5: Agent_Test and hygiene

**User Story:** As a maintainer, I want a test that fails when the agent file drifts, so that the claims above stay true.

#### Acceptance Criteria

1. THE Agent_Test SHALL check Requirements 1.1, 1.2, 2, 3, and 4.1 to 4.4 on `.kiro/agents/world-smith.json`, and SHALL run inside the existing `integrations/kiro-hook` test run.
2. THE Agent_Test SHALL run the possession scan (`scanFiles` of `@ghost-run/core/possession-node`) on the Agent_File and the three spec files of this spec, and the outcome SHALL be `clean` (blacklight: no hidden character).
3. THE Agent_File and the spec files SHALL contain no real user name, home path, e-mail address, or non-reserved host.
4. THE Agent_Test SHALL include negative examples: a file with a `model`, a wildcard tool, a `rm` allow rule, a missing resource, and an absolute path SHALL each be rejected.

### Requirement 6: Documentation

**User Story:** As a new user, I want one paragraph in the README, so that I know how to start the agent.

#### Acceptance Criteria

1. THE root `README.md` SHALL have one paragraph in the section "Kiro integration" that gives `kiro-cli chat --agent world-smith`, says the workspace must be trusted, and names what the agent does and does not do.

## Out of Scope

- Building Ghost Cloud or any world.
- Kiro Crew agents and tools.
- Changing hooks, `core/`, or other worlds.

# Implementation Plan: world-smith

## Overview

Write the agent file, its test, and one README paragraph; check the agent by a real call. Scope: `.kiro/specs/world-smith/`, `.kiro/agents/world-smith.json`, `integrations/kiro-hook/tests/agent-file.test.mjs`, the README paragraph, and an appended entry in `docs/measurements.md`. `docs/devlog.md` and other worlds are not touched. No new dependency. No git commit.

## Tasks

- [x] 1. Agent file
  - [x] 1.1 Write `.kiro/agents/world-smith.json` and validate it with `kiro-cli agent validate`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

- [x] 2. Agent_Test
  - [x] 2.1 Write `integrations/kiro-hook/tests/agent-file.test.mjs` with the real-file checks, the negative examples, and the possession scan
    - _Requirements: 2.2, 2.3, 5.1, 5.2, 5.3, 5.4_
  - [x] 2.2 Run the `integrations/kiro-hook` tests, typecheck, and lint
    - _Requirements: 5.1_

- [x] 3. Documentation
  - [x] 3.1 Add one paragraph to the root README section "Kiro integration"
    - _Requirements: 6.1_

- [x] 4. Live check
  - [x] 4.1 Call `kiro-cli chat --agent world-smith` with a read-only question, check that the agent loads and reads its resources, and append the result to `docs/measurements.md`
    - _Requirements: 1.3, 2.1_

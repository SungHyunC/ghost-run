# Ghost Run+: How a ghost run works

The flow of one ghost run, from the plan to the verdict. Part of [Ghost Run+](../README.md).

## How a ghost run works

```mermaid
flowchart LR
  A[Agent plan] --> B[Copy the world: mirror world]
  B --> C[Ghost runs the plan<br/>in the box or on haunted variants]
  C --> D[Wards judge the result]
  D -->|pass: candle lit| E[Real execution]
  D -->|warn: candle flickering| H[Human approval needed]
  D -->|block: candle out| F[Block message with ward id and numbers]
  F --> G[Agent fixes the plan] --> A
```

1. The agent proposes a plan.
2. The runner copies the real state (files, database, or physics scene). Reality is not touched.
3. The ghost runs the plan on the copy: inside a Docker box in real mode, or on the base world and the haunted variants in Ghost Hand.
4. The wards judge the changes and observed events.
5. The candle shows the verdict: `pass` (lit), `warn` (flickering, the host asks the human to allow or deny), or `block` (out).
6. On `pass` the real action runs. On `block` the agent receives the ward id, the numbers, and a seance link, fixes the plan, and rehearses again.

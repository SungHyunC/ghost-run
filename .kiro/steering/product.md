---
inclusion: always
---

# Ghost Run+

**Tagline:** Let your agent's ghost try it first.
**Category:** Kiroween 2026 — Skeleton Crew (1 template + 2 distinct apps)
**Deadline:** Dec 5, 2026 07:00 KST

Ghost Run+ lets an AI agent rehearse irreversible actions in a sealed copy of the world before executing them for real. It addresses two agent failure modes:

1. **Mistakes** — e.g., an agent deleting a production database during a code freeze (Replit, Jul 2025).
2. **Possession** — an agent manipulated by hidden instructions in documents it reads (prompt injection).

The ghost runs the plan inside a sealed box against a mirror-world copy. Declared wards judge the outcome as **pass** (candle lit), **warn** (candle flickering), or **block** (candle out). Only after all wards pass does the real action proceed.

## Target Users

- **Primary:** Developers who let Kiro IDE/CLI agents run shell commands — especially teams running unattended Kiro Crew agents overnight.
- **Template users:** Developers who want to add ghost rehearsal to their own agent app. They implement four functions of the World contract and get the rest for free.
- **Physical-world developers (App 2):** Developers who need to verify robot or simulation plans before execution.

## Glossary

| Term | Meaning |
|---|---|
| mirror world | Copy of real state (files, DB, physics) |
| box | Isolated execution environment |
| ghost | Pre-execution trial inside the box |
| ward | Declared guard rule (`wards.yaml`) |
| candle | Verdict: lit = pass, flickering = warn, out = block |
| possession | Agent manipulated by hidden instructions |
| red thread | Traces a possessed action back to its source text |
| blacklight | Reveals hidden Unicode characters |
| haunted variant | Mirror world with perturbed physics parameters |
| graveyard | Audit log of blocked actions |

## Two Apps + One Template

| | Description |
|---|---|
| `core/` | Template: World contract, ghost runner, wards engine, possession detector, UI kit, Kiro integration |
| `apps/ghost-shell/` | App 1 — shell/SQL commands run against a file/DB copy inside a Docker box; also works as a Kiro Pre Tool Use hook |
| `apps/ghost-hand/` | App 2 — browser MuJoCo robot arm tries a plan across 8 haunted variants before the real arm moves. **Confirmed as Ghost Hand.** |
| `worlds/` | Drop-in folder for additional World implementations |

**Third world:** Ghost Cloud (agent tries to delete an S3 bucket; ward catches it in a mock AWS world). Confirmed as the third world (App 2 is Ghost Hand). If time runs short, falls back to Ghost Sheet (guards row deletion and formula overwrite in a CSV).

## Out of Scope (Do Not Add)

- Kiro Crew integration (revisit only after feature freeze if time permits)
- Franka Panda robot model (add only if time permits after core is done)
- 20 haunted variants (default is 8; expand only if time permits)
- Full isolation tooling replacement
- Catching every injection by text analysis alone

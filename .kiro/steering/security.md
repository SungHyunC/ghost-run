---
inclusion: always
---

# Security Rules

## Secrets and Credentials

- **Canary values only.** Any `.env` file, secret value, or credential appearing in tests, demos, or the playground must be a fake canary (e.g., `sk-CANARY-abc123`). Never use a real token, password, or key — not even a revoked one.
- **Never commit secrets.** `.env` files and any file containing real credentials must be in `.gitignore`. Verify before every commit.
- **Reserved domains only.** Any hostname, URL, or server address used in possession scenarios, demos, or tests must be a reserved domain that cannot resolve to a real host: `.example`, `.test`, `.localhost`, `.invalid`. Never use a real domain or IP address.

## Ghost Execution

- **Ghosts run inside the box.** In real mode, ghost execution happens only inside a Docker container (`--network none`, copy-only mount). No ghost action may run directly on the host filesystem or against a live external service.
- **Plan B limitation is explicit.** When Docker is unavailable and Plan B (static analysis) is active, the UI and README must state this clearly. Do not claim P1 isolation in Plan B mode.

## Hidden Unicode

- **No hidden characters in repository files.** Tag characters (U+E0000–E007F), zero-width characters (U+200B–200D, U+2060, U+FEFF), and bidi control characters (U+202A–202E, U+2066–2069) must not appear literally in any committed file — including steering docs, specs, and hook scripts.
- **Tests use escapes.** To test the blacklight detector, construct hidden-character strings with Unicode escape sequences in test code (e.g., `"\u200B"`). Do not paste the characters directly into source files.
- **Exception for emoji sequences.** Zero-width joiner (U+200D) is permitted between emoji codepoints forming a standard ZWJ sequence; flag it only when it appears between non-emoji characters.

## Attack Code

- **No real attack payloads.** The possession scenario demonstrates that the ghost *would* exfiltrate `.env` — it does not deploy actual malware, working exploits, or functional C2 infrastructure.
- **Blacklight steering hook.** The `blacklight-steering` hook (File Save on `.kiro/**`) guards Kiro's own steering and spec files against Rules File Backdoor attacks. Keep it enabled throughout development.

## General

- Least privilege: hook scripts request only the permissions they need.
- No `eval` or dynamic code execution on untrusted input inside hook scripts or the wards engine.
- Log blocked actions to the graveyard; do not log secret values even as canaries.

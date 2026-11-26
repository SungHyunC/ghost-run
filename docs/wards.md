# Ghost Run+: Wards

The `wards.yaml` rules, trusted commands, claims, path policies, and limits. Part of [Ghost Run+](../README.md).

## Wards

Wards are the declared guard rules that judge a ghost run. They live in `wards.yaml` and are judged by the pure modules in `core/src/judge/` and the engine in `core/src/wards.ts`. The parser, validator, and printer are in the separate package `@ghost-run/wards-config`. The verdict is `pass` (candle lit), `warn` (candle flickering), or `block` (candle out).

### Default wards file

The default file is `apps/ghost-shell/wards.yaml`. It holds three wards: `protect-data` (`path`), `no-data-loss` (`sql`), and `no-secret-egress` (`egress`). The repo world uses this file instead of the per-world `worlds/<name>/wards.yaml` described in the world contract.

The file also has a top-level `safe_commands` list: `ls`, `pwd`, `cat`, `git status`, `git diff`. `wards-config` parses, validates, and prints the list for the `ghost-gate` hook. The matching rules for these commands are owned by the kiro-integration spec, not by the wards spec. The list is not a ward and does not change any verdict computed by the engine.

### Trusted commands

The file can also have a top-level `trusted_commands` list of command patterns, for example `corepack pnpm test` or `corepack pnpm --filter * test`. In a pattern, `*` matches exactly one word and a final `**` matches zero or more remaining words. A wildcard never matches a word that starts with `-`, so options must be written literally in the pattern (for example `npx tsc --noEmit -p *`) and `npx vitest run **` does not match `npx vitest run --config=x`. Entries are validated like `safe_commands` entries (at most 256 entries of at most 256 characters, no shell operators, no empty entry, errors reported as `unsafe-command-entry`), with `*` allowed as a whole word. `wards-config` parses, validates, and prints the list (`parseWards` returns `trustedCommands`, `printWards` takes `options.trustedCommands`).

The `ghost-gate` hook lets a shell call through without a rehearsal when the whole line is an optional `cd <dir> &&` inside the workspace, one command that matches a pattern, and optional `2>&1`, `/dev/null` redirects, and pipes into `cat`, `head`, `tail`, or `wc` without a path argument. Any other operator or construct (`;`, `||`, a second `&&`, backticks, `$`, redirects to files, input, environment assignments, subshells) makes the call untrusted and it is rehearsed. Shells, `node -e` style interpreters, `sudo`, `curl`, `wget`, `ssh`, `scp`, `eval`, and the approval command are never trusted. Listing a pattern means "I trust what this command runs": the gate checks the shape of the line and not the effect of the command. The exact rules are in `integrations/kiro-hook/README.md`, section "Trusted commands". The root `wards.yaml` of this repository lists the routine `corepack pnpm` checks.

**Trade-off.** A trusted command runs whatever the project's scripts, tests, and config files contain. An agent that edits `package.json`, a test file, or a config file changes what the trusted command runs, and that run is not rehearsed. Keep the list to commands whose inputs you review; list nothing that installs, deploys, or uses the network. This repository trusts its own test, lint, typecheck, and build commands to cut the asks measured on 2026-11-25 and 2026-11-26.

### Claims

| Property | Claimed where | Not claimed |
|---|---|---|
| P4 (a stricter ward never lets more plans pass) | All worlds. It is pure logic in the wards engine. | Nowhere. |
| P5 (a plan that deletes or overwrites a protected path produces `block`) | Where P1 holds: the playground and real mode with the Docker box. | Plan B (`static-analysis`), where no ghost run takes place. |
| P6 (a secret read followed by an unapproved network attempt produces `block`) | Where network attempts are recorded: the playground and real mode with the Docker box. | Plan B (`static-analysis`), and steps the playground cannot rehearse. |

When P5 or P6 is not claimed for a run, the message builder adds this line to every verdict kind (`CLAIM_LOWERED_LINE`):

> P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).

When some steps could not be rehearsed in the playground, it adds `CLAIM_LOWERED_UNSUPPORTED_STEP_LINE` instead. Worlds where P5 and P6 do not apply, such as Ghost Hand, pass no claims and get no line.

### Path policies

- **Case policy.** Path wards match paths without regard to letter case by default. The reason is that APFS, the default file system on macOS, is case-insensitive, so `./DATA` and `./data` are the same directory there. Matching too much fails safe: a plan is blocked rather than let through. The cost is a possible false positive on Linux, where `DATA` and `data` can be different directories. A `path` ward can set `case_sensitive: true` to opt out. Case folding is one code point to one code point and is applied after Unicode normalization (NFC).
- **Symbolic links and moves.** P5 holds for symbolic links and moves only under this precondition: the world reports the actual resolved paths in its changes, and the Differ walks the copy with `lstat` so that it sees links as links and does not follow them. The judge itself never touches the file system. If a world does not meet the precondition, P5 is not claimed for symbolic links and moves in that world.
- **Paths outside the copy.** A path that escapes the copy root with a leading `..` matches no ward. It produces a `path-escape` notice instead, so a human can review it.

### What content inspection does not catch

The egress ward inspects request payloads for the values of secret files in raw form and in base64, base64url, hex, and percent encodings. It does not catch these cases:

- compression of the payload;
- encryption of the payload;
- multi-layer encodings, such as base64 of hex;
- a secret split over several requests;
- a secret sent one character at a time, for example through DNS lookups;
- secret values shorter than 8 bytes;
- payload bytes beyond the first 64 KiB (65,536 bytes) of each payload.

Only the behavior criterion catches these cases: a network attempt to a host that is not in `allow_hosts` after a secret file was read produces `block`, whatever the payload contains. Content inspection is an addition to that criterion. It does not replace it. It catches a secret sent to an allowed host, which the behavior criterion permits.

### Limits of the tools

- **`isMoreRestrictive` is sound but not complete.** When it returns `true`, the second ward set really does let through no more plans than the first. When it returns `false`, the second set may still be stricter. It compares sets of patterns by string containment, so these pairs can return `false` even though the second set is stricter: `data/**` against `data/**` plus `data/x`, `*.example.test` against `a.example.test`, and a host entry with a port against the same entry without a port.
- **`printWards` does not preserve comments.** It writes a canonical form of the ward set, so comments in an edited `wards.yaml` are lost when the file is printed again. Keep the explanations in the file you edit by hand and treat printed output as generated.
- **Entry points.** The default entry of `@ghost-run/wards-config` imports no Node built-in, so a browser can parse `wards.yaml`. Reading a file from disk is available only from `@ghost-run/wards-config/node`.
- **Test values.** Examples and tests use fake canary values such as `sk-CANARY-abc123` and reserved domains such as `setup-check.example`. `registry.npmjs.org` appears only as the `allow_hosts` example in the default file.

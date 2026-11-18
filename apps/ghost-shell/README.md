# Ghost Shell playground

Ghost Shell is App 1 of Ghost Run+. It is a static web page (no server, no LLM, no API key) where a ghost runs a plan against an in-memory virtual project: an in-memory file system plus an SQLite database in `sql.js`. The page shows the mirror world, the candle, the claims for the run, the message the agent would receive, the graveyard, and for the possession scenario the red thread, the blacklight, and the purify button. A wards editor re-runs the current plan whenever `wards.yaml` changes.

Tagline: let your agent's ghost try it first.

## Run it

```
corepack pnpm --filter @ghost-run/ghost-shell build
corepack pnpm --filter @ghost-run/ghost-shell preview
```

`preview` serves the built `dist/` folder from a local static server. The page needs no response headers beyond ordinary static hosting, and it does not use `SharedArrayBuffer`.

Other scripts: `test`, `typecheck`, `lint`, `build`, and `test:dist` (build plus `scripts/check-dist.mjs`).

### Nightly run

```
GHOST_PBT_MODE=nightly corepack pnpm --filter @ghost-run/playground-shell test:nightly
```

This runs the property tests of the playground world (`worlds/playground-shell`) with 10,000 runs per property and no per-test time limit. Without `GHOST_PBT_MODE=nightly`, a normal `test` run uses 100 runs per property and a 60 s limit.

The Nightly_Run of the `verifyWorld` test (`tests/verify-world.test.ts`) did not complete in the measured attempt: the test worker ran out of memory after about 165 s (V8 heap near 3.7 GB, exit code 1); see the section "ghost-shell final checkpoint (task 18): Nightly_Run of verifyWorld" at the end of `docs/measurements.md`.

## What the playground claims

Each property is claimed only within the scope in the "Claimed" column. The page lowers a claim in the UI when the scope does not hold for a run.

| Property | Claimed | Evidence and scope |
|---|---|---|
| P1 A ghost run never changes reality | Yes, for the playground world only | The run compares the world fingerprint before and after. A run that fails its own fingerprint check shows P1 as not claimed. |
| P2 A passing plan yields the same diff when executed for real | Yes, for the playground world only | The world is deterministic (in-memory file system and `sql.js`). See the P2 statement below. Not claimed for a run where the SQL watchdog fired. |
| P3 Restoring a snapshot returns the exact pre-snapshot state | Yes | Property test on the playground world. |
| P5 A plan that deletes or overwrites a protected path produces `block` | Yes, where P1 holds for the run and no step was unsupported | Not claimed for a run that contains an unsupported step or a watchdog event. |
| P6 A secret read followed by an unapproved network attempt produces `block` | Yes, where every secret read and network attempt is recorded and no step was unsupported | Not claimed for a run that contains an unsupported step or a watchdog event. |
| P4 Making a ward stricter never increases the set of passing plans | Evidence from `core` and `wards` | The playground re-uses the judging engine. It adds no second proof. |
| P7 Hidden Unicode is always flagged; normal characters are never flagged | Evidence from `possession` | The blacklight uses the same pure scanner. |

### What P2 means here

The P2 test compares the diff with an independent change derivation from a journal of the actions. It verifies the diff and the copy separation. It is not a test of fidelity to a real shell. P2 is claimed for the playground world only. It is not claimed for shell worlds in real mode, where time, process ids, or network responses vary.

### Unclaimed properties and limits

- P1 and the Docker-box claims are not made by this page. P1 here is claimed for the playground world only, never for the Docker box or for Plan B.
- Plan B and P1 scope: this page does not run Plan B and makes no claim for it. Plan B (static command analysis, used when Docker is unavailable) claims no P1.
- P5 and P6 are not claimed for a run that contains an unsupported step or a watchdog event.
- Compression, encryption, and DNS exfiltration (one character at a time) are outside content inspection. They are caught by the action criterion only.
- Text analysis does not catch every injection.
- The playground cannot detect a secret read through an unsupported command.
- Deleting a whole database file is a `file-deleted` change. It is not counted as row loss.
- A verdict is not a guarantee for a real repository.
- Redaction of a secret typed into a command is the responsibility of whatever produced the command.

## What the playground is

- It emulates a subset of a shell (the Supported_Command_Set below). A command outside the subset is shown as unsupported and never passes silently.
- It opens no connection. A network attempt is a recorded value, not a request.
- Real mode needs a Docker box (`--network none`, copy-only mount). The playground uses the same judging engine and the same wards file as real mode, with a different world underneath.
- The scenario plans are scripted. Recorded plan files are replayed. No LLM decides anything in the page.
- The possession scenario uses fake canary values (for example `sk-CANARY-abc123`) and reserved example domains only.
- SQL text is screened before it reaches `sql.js`. SQL that reads the clock, a random source, or the wasm file system (`random`, `date`, `datetime`, `current_timestamp`, the string `'now'`, `ATTACH`, `VACUUM INTO`, `max_page_count`, dot-commands, `load_extension`) makes the step unsupported. This keeps the interpreter a pure function.
- The page stores nothing in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies. The graveyard, the wards text, and the loaded plan live in memory for the current page session.
- Tested on macOS and Linux. Windows is unverified.

## Supported_Command_Set

A command line has at most 4,096 code points. It consists of one or more simple commands joined by `;` or `&&`, with single-quoted, double-quoted, and unquoted words, and the redirections `>` and `>>` to a file. Pipes, expansions, and globs are rejected, not interpreted. An option that is not listed is an unsupported command.

| Command | Supported forms |
|---|---|
| `pwd` | no arguments |
| `ls` | `ls [path...]` and `ls -a`, `ls -l` (names only; the output carries no times) |
| `cat` | `cat file...` |
| `echo` | `echo word...`, `echo -n word...`, with `>` and `>>` |
| `mkdir` | `mkdir [-p] dir...` |
| `touch` | `touch file...` (create an empty file when absent; no change when present) |
| `rm` | `rm [-r] [-f] [-rf] [-fr] path...` |
| `mv` | `mv source dest` |
| `cp` | `cp [-r] source dest` |
| `find` | `find path [-name pattern] [-print]` and `find path [-name pattern] -delete` |
| `sqlite3` | `sqlite3 <db-file> "<SQL>"` with one or more statements |
| `npm` | `npm test`, `npm run <script>`, `npm install`, `npm i`, `npm ci` |
| `curl` | `curl [-s] [-X method] [-d data] [-d @file] [--data-binary @file] url` |
| `true`, `false` | no arguments |

Notes:

- `npm test` and `npm run <script>` read `package.json` from the project root and run the script text through the same interpreter (nesting depth at most 4). A script with a `pre<name>` or `post<name>` companion is unsupported, because npm lifecycle scripts are not emulated.
- `npm install`, `npm i`, and `npm ci` record one network attempt to `registry.npmjs.org:443`, change no file, and fail with exit code 1.
- `curl` records a network attempt and exits with code 7.
- An unsupported command exits with code 127.
- A SQL batch runs under a 5 s watchdog in a Web Worker. When it fires, the step fails and the run is marked `watchdogFired`.

## Verification gap

The Vite-bundled Web Worker that runs `sql.js` in the browser is not run in CI. Tests run the SQL engine in-process (jsdom and Node). `test:dist` checks that the build output contains the worker chunk and the `.wasm` file and that the output has no reference to another origin, but nothing in CI starts the bundled worker in a real browser. The manual smoke checklist below covers this gap.

## Manual smoke checklist

Run after every build, in a real browser (Chromium-based, Firefox, and Safari when available):

1. Build and start the preview server (commands in "Run it").
2. Load the page. Confirm the first scenario is ready to run within 3.0 s on the Reference_Machine (Apple M1, warm local static server).
3. Open the browser console. Confirm there are no Content-Security-Policy violations. The CSP in `public/_headers` allows `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, `connect-src 'self'`, and `style-src 'self' 'unsafe-inline'`. The `unsafe-inline` style source is needed by the kit styles.
4. Run Scenario 1. Confirm the candle is out and the verdict text is `block`, with the ward id and the numbers in the `Message the agent receives` panel.
5. Confirm the SQL worker started in a real browser (a scenario that runs `sqlite3` returns row counts, not an error).
6. Open the new graveyard entry with the keyboard, then use `Back to graveyard`.
7. Run the possession scenario, switch the blacklight on, follow the red thread to the README line, press purify, and confirm `No hidden text found by the blacklight.`
8. Edit `wards.yaml` in the editor to introduce a parse error. Confirm the `stale: wards.yaml has errors` label and the line numbers. Fix it and confirm the run updates.
9. Check the network panel: no request goes to another origin.

## Dependencies

The runtime dependencies are `@ghost-run/core`, `@ghost-run/playground-shell`, `@ghost-run/ui`, `@ghost-run/wards-config`, `react`, `react-dom`, and `sql.js`. The full dependency and license table is in the repository README.

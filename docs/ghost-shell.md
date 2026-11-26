# Ghost Run+: Ghost Shell

The shell and SQL playground, its scenarios and its claims. Part of [Ghost Run+](../README.md).

## Ghost Shell

Ghost Shell (`apps/ghost-shell/`, with the world in `worlds/playground-shell/`) is a static web page: no server, no API key, and no runtime LLM call. A ghost runs a plan against an in-memory virtual project (an in-memory file system and an SQLite database in `sql.js`). The page shows the mirror world, the candle, the claims for the run, the message the agent would receive, and the graveyard. It runs no real command and touches no real file. You can also load your own plan file and edit `wards.yaml` in the page.

The page has a Korean version, `ko.html`, linked from the English page. It translates the page's own words; the ui kit parts (the candle, the claims, the mirror table, the blacklight, the red thread, and the graveyard), the ward reasons, and the message the agent receives stay in English.

Five scenarios are bundled:

| # | Scenario | Result |
|---|---|---|
| 1 | Drop the users table | `block` by `no-data-loss` ("would delete 1,206 rows from users"); the fixed plan passes |
| 2 | Remove data and build | `block` by `protect-data`, one violation per deleted path under `data/`; the fixed plan passes |
| 3 | Possession by README | `block` by `no-secret-egress`: the plan reads `.env` and then makes a network attempt to `setup-check.example:443`, which is caught by behavior and by content. The page shows the red thread to the hidden text and the blacklight |
| 4 | Run the tests | `pass`, with no change, no event, and no notice |
| 5 | Run npm clean | `block` by `protect-data` (the script runs `rm -rf data`) |

Claims, in short (the full table and limits are in [apps/ghost-shell/README.md](../apps/ghost-shell/README.md)):

- P1, P2, and P3 are claimed for the in-memory playground world only. P2 means that the diff equals an independent derivation from the action journal. It is not a test of fidelity to a real shell.
- P5 and P6 are claimed where P1 holds for the run and no step was unsupported.
- Nothing is claimed for the Docker box or for Plan B on this page. The page lowers a claim in the UI when its scope does not hold.
- Text analysis does not catch every injection. The possession scenario uses a fake canary value and a reserved example domain only.

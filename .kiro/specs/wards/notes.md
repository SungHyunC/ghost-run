# Wards spec notes

## From ghost-runner task 2.2 (W5)

- Core types `ObservedEvent` and `GhostReport<S>` suffice for ghost-runner. Payloads are passed out of band and are not part of either type.
- Gap: ghost-runner (Req 11) emits Change kind `file-modified` for changed regular files. Core's `FileChange` union and `WardEngine` (`core/src/wards.ts`, `isFileChange` and the path-ward `overwrite` mapping) only recognise `file-overwritten`. As is, a `path` ward would not see an overwrite. Decide in this spec whether the engine accepts `file-modified` as an alias or the runner maps it. Core was not changed by task 2.2.

# Ghost Run+: Ghost runner

The Docker box runner and Plan B. Part of [Ghost Run+](../README.md).

## Ghost runner

`@ghost-run/ghost-runner` (`ghost-runner/`) rehearses a shell plan against a Copy of a directory inside a sealed Docker box (`--network none`, copy-only mount) and returns the changes and observed events for the wards to judge. Usage, the box build, the run id, cleanup, and the license table are in [ghost-runner/README.md](../ghost-runner/README.md).

- **P1, P5, and P6** are claimed only for runs in the Docker box. P6 additionally needs the recorder to see network attempts.
- **Plan B.** When Docker or the box image is unavailable, nothing runs on the host and only static analysis is done. P1, P5, and P6 are not claimed, and the run says so: `P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.`
- The in-box recorder reports `tamperResistant: false`.
- Supported on macOS and Linux. Windows is unverified.

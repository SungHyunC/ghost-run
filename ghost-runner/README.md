# @ghost-run/ghost-runner

Docker box runner, Repo_World, and Plan B static analysis for Ghost Run+.

## Box image

Build it explicitly (the hook path never builds):

```
corepack pnpm --filter @ghost-run/ghost-runner box:build
```

This builds `ghost-run/box:<sha256 of box/Dockerfile + box/BASE_DIGEST + box/recorder/*>` and sets the label
`ghost-run.box.hash`. The base image `node:20-bookworm-slim` is pinned by digest (`box/BASE_DIGEST`). The Debian
packages are installed from a snapshot.debian.org archive fixed by timestamp. The image is never pushed.

### Box-only CA

The box has a throw-away certificate authority so the in-box recorder can capture HTTPS requests. `docker build`
creates it with `openssl` in `/opt/ghost/ca` (`ca.crt`, `ca.key`), installs the certificate with
`update-ca-certificates`, and sets `NODE_EXTRA_CA_CERTS` to the certificate. The CA is not in the repository
(`.gitignore` blocks key files and `tests/no-private-key.test.ts` scans for them). It exists only in the image
layers and is used only inside the network-less box, never on the host.

## Libraries and licenses

| Component | Where | Version | License |
|---|---|---|---|
| Node.js (base image `node:20-bookworm-slim`) | box | v20.20.2 | MIT |
| strace | box | 6.1-0.1 | LGPL-2.1-or-later |
| sqlite3 | box | 3.40.1-2+deb12u2 | Public domain |
| curl | box | 7.88.1-10+deb12u15 | curl license |
| openssl | box | 3.0.22-1~deb12u1 | Apache-2.0 |
| ca-certificates | box | 20250419~deb12u1 | GPL-2.0-or-later (scripts), MPL-2.0 (certificate data) |
| shell-quote | host dependency | see `package.json` | MIT |

Box package versions and licenses are those of the Debian bookworm packages installed in the box image.

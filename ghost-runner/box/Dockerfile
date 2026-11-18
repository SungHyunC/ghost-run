# Ghost Run+ box image. Built only by box/build.mjs (never automatically).
# Base: node:20-bookworm-slim, pinned by the digest recorded in box/BASE_DIGEST.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

ARG GHOST_BOX_HASH=unset
LABEL org.opencontainers.image.title="ghost-run-box" \
      org.opencontainers.image.licenses="MIT" \
      ghost-run.box.hash="${GHOST_BOX_HASH}"

# Packages come from a Debian snapshot fixed by timestamp. No downloaded script is executed.
# Plain http is used because the base has no CA bundle yet; apt verifies the signed
# Release files against the debian-archive-keyring already present in the base image.
RUN set -eux; \
    rm -f /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; \
    printf '%s\n' \
      'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261001T000000Z bookworm main' \
      'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261001T000000Z bookworm-security main' \
      > /etc/apt/sources.list; \
    printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "3";\n' > /etc/apt/apt.conf.d/99snapshot; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      strace sqlite3 curl openssl ca-certificates; \
    apt-get clean; \
    find /var/lib/apt/lists /var/cache/apt -type f -delete; \
    rm -f /etc/apt/apt.conf.d/99snapshot

# Throw-away box-only CA, generated here at image build time (never committed, never in the
# build context). It signs the leaf certificates minted by the in-box TLS recorder. The key
# is world-readable inside the image because the box runs as an arbitrary non-root --user;
# it only exists in image layers and is useless outside the network-less box.
RUN set -eux; \
    mkdir -p /opt/ghost/ca; \
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
      -keyout /opt/ghost/ca/ca.key -out /opt/ghost/ca/ca.crt \
      -days 3650 -subj '/CN=Ghost Run Box CA (throw-away)' \
      -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
      -addext 'keyUsage=critical,keyCertSign,cRLSign'; \
    chmod 0755 /opt/ghost/ca; \
    chmod 0644 /opt/ghost/ca/ca.crt /opt/ghost/ca/ca.key; \
    cp /opt/ghost/ca/ca.crt /usr/local/share/ca-certificates/ghost-box-ca.crt; \
    update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/opt/ghost/ca/ca.crt

# In-box recorder scripts (task 10.2). The directory may be empty until they land.
COPY recorder/ /opt/ghost/recorder/

# Entry points on PATH, and the mount point of the recorder volume (mode 1777 so the
# anonymous volume is writable by the non-root --user).
RUN set -eux; \
    ln -s /opt/ghost/recorder/ghost-init.mjs /usr/local/bin/ghost-init; \
    ln -s /opt/ghost/recorder/ghost-step.sh /usr/local/bin/ghost-step; \
    ln -s /opt/ghost/recorder/ghost-count.mjs /usr/local/bin/ghost-count; \
    mkdir -p /ghost-rec; \
    chmod 1777 /ghost-rec

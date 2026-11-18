#!/usr/bin/env node
// PID 1 of the box. Starts the fake DNS, HTTP and TLS recorders, then writes
// <REC_DIR>/ready. The box has no network, so every listener only ever sees traffic
// from processes inside the same box.
//
// `ghost-init --probe` is the recorder-liveness probe used by ghost-step: it connects to the
// local HTTP and TLS listeners without sending anything (so nothing is logged) and exits 0
// when both accept.
import net from 'node:net';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startDns } from './dns.mjs';
import { startHttp } from './http.mjs';
import { REC_DIR } from './rec.mjs';
import { startTls } from './tls.mjs';

const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v >= 0 && v <= 65535 && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
};
const DNS_PORT = num('GHOST_DNS_PORT', 53);
const HTTP_PORT = num('GHOST_HTTP_PORT', 80);
const TLS_PORT = num('GHOST_TLS_PORT', 443);
const BIND = process.env.GHOST_BIND_ADDR || '0.0.0.0';

function probeOne(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(1000, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

async function probe() {
  const results = await Promise.all([probeOne(HTTP_PORT), probeOne(TLS_PORT)]);
  process.exit(results.every(Boolean) ? 0 : 1);
}

async function main() {
  // HOME is on the box tmpfs and does not exist yet.
  const home = process.env.HOME;
  if (home && home.startsWith('/tmp/')) {
    try {
      mkdirSync(home, { recursive: true });
    } catch {
      // best effort
    }
  }
  rmSync(join(REC_DIR, 'ready'), { force: true });

  const started = await Promise.allSettled([
    startDns({ port: DNS_PORT, address: '127.0.0.1' }),
    startHttp({ port: HTTP_PORT, address: BIND }),
    startTls({ port: TLS_PORT, address: BIND }),
  ]);
  const names = ['dns', 'http', 'tls'];
  let ok = true;
  started.forEach((r, i) => {
    if (r.status === 'rejected') {
      ok = false;
      process.stderr.write(`ghost-init: ${names[i]} listener failed: ${r.reason && r.reason.message ? r.reason.message : r.reason}\n`);
    }
  });
  // No ready file when a listener is missing: ghost-step then waits 2 s, runs the action
  // anyway, and the failed liveness probe makes the host report recorder-failure.
  if (ok) {
    const tmp = join(REC_DIR, 'ready.tmp');
    writeFileSync(tmp, `${process.pid}\n`);
    renameSync(tmp, join(REC_DIR, 'ready'));
  }
}

if (process.argv.includes('--probe')) {
  await probe();
} else {
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
  process.on('uncaughtException', (err) => process.stderr.write(`ghost-init: ${err && err.message ? err.message : err}\n`));
  process.on('unhandledRejection', (err) => process.stderr.write(`ghost-init: ${err && err.message ? err.message : err}\n`));
  await main();
}

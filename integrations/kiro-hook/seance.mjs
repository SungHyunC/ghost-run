// Seance viewer command: node integrations/kiro-hook/seance.mjs [--root <dir>] [--port <n>] [--idle-ms <n>]
// Serves the graveyard of one workspace at http://127.0.0.1:<port>/seance/. The port defaults to the
// one of GHOST_RUN_SEANCE_BASE (http://localhost:5317 when unset). Without --idle-ms it runs until stopped.
import path from 'node:path';
import { parseSeanceBase, startSeanceServer } from './lib/seance/server.mjs';

/** @param {string} name @returns {string | undefined} */
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = path.resolve(arg('--root') ?? process.env.INIT_CWD ?? process.cwd());
const port = arg('--port') !== undefined ? Number(arg('--port')) : parseSeanceBase(process.env.GHOST_RUN_SEANCE_BASE).port;
const idleArg = arg('--idle-ms');
const idleMs = idleArg !== undefined && Number(idleArg) > 0 ? Number(idleArg) : undefined;

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write('seance: invalid port\n');
  process.exit(1);
}

try {
  const { server, port: bound } = await startSeanceServer({
    root,
    port,
    ...(idleMs === undefined ? {} : { idleMs, onIdle: () => process.exit(0) }),
  });
  process.stdout.write(`Seance viewer for ${root}: http://127.0.0.1:${bound}/seance/\n`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'error';
  process.stderr.write(`seance: could not listen on 127.0.0.1:${port} (${code})\n`);
  process.exit(1);
}

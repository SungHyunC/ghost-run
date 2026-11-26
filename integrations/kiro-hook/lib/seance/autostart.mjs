// Seance auto-start (Requirement 26): after the gate wrote a grave, start the viewer in the
// background when the seance base is local and nothing answers on its port. Never throws, never
// changes the gate's decision, and waits at most PROBE_MS.
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IDLE_MS, HEALTH_SERVICE, parseSeanceBase } from './server.mjs';

/** Longest wait for the port check (ms). */
export const PROBE_MS = 300;
/**
 * The viewer script. In the repository it is `seance.mjs` two levels above this module. In the gate bundle
 * (`integrations/power/gate/`, installed to `.kiro/ghost-run/gate/`) this module is part of `gate-main.mjs`,
 * and the viewer bundle `seance.mjs` is its neighbour.
 */
const SCRIPT_CANDIDATES = [
  fileURLToPath(new URL('./seance.mjs', import.meta.url)),
  fileURLToPath(new URL('../../seance.mjs', import.meta.url)),
];
const SCRIPT = SCRIPT_CANDIDATES.find((candidate) => existsSync(candidate)) ?? SCRIPT_CANDIDATES[0];

/**
 * Ask 127.0.0.1:<port> for /seance/health.
 * `free`: connection refused; `viewer`: the answer identifies the viewer; `busy`: anything else
 * (another service, a slow answer, a timeout).
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<'free' | 'viewer' | 'busy'>}
 */
export function probePort(port, timeoutMs = PROBE_MS) {
  return new Promise((resolve) => {
    let done = false;
    /** @param {'free' | 'viewer' | 'busy'} r */
    const finish = (r) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    const req = http.get({ host: '127.0.0.1', port, path: '/seance/health', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        if (body.length < 512) body += c;
      });
      res.on('end', () => {
        try {
          finish(JSON.parse(body).service === HEALTH_SERVICE ? 'viewer' : 'busy');
        } catch {
          finish('busy');
        }
      });
      res.on('error', () => finish('busy'));
    });
    req.on('timeout', () => {
      req.destroy();
      finish('busy');
    });
    req.on('error', (err) => finish('code' in err && err.code === 'ECONNREFUSED' ? 'free' : 'busy'));
  });
}

/**
 * Start the detached viewer process.
 * @param {string} root
 * @param {number} port
 */
function spawnViewer(root, port) {
  const child = nodeSpawn(process.execPath, [SCRIPT, '--root', root, '--port', String(port), '--idle-ms', String(DEFAULT_IDLE_MS)], {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });
  child.on('error', () => undefined);
  child.unref();
}

/**
 * @param {{ root: string, env: Record<string, string | undefined>, probe?: (port: number) => Promise<'free' | 'viewer' | 'busy'>, spawnViewer?: (root: string, port: number) => void }} input
 * @returns {Promise<'started' | 'off' | 'not-local' | 'running' | 'busy' | 'failed'>}
 */
export async function maybeStartSeance({ root, env, probe = probePort, spawnViewer: spawnFn = spawnViewer }) {
  try {
    if (env['GHOST_RUN_SEANCE_AUTOSTART'] === '0') return 'off';
    const { local, port } = parseSeanceBase(env['GHOST_RUN_SEANCE_BASE']);
    if (!local || !Number.isInteger(port) || port < 1 || port > 65535) return 'not-local';
    const state = await probe(port);
    if (state === 'viewer') return 'running';
    if (state === 'busy') return 'busy';
    spawnFn(root, port);
    return 'started';
  } catch {
    return 'failed';
  }
}

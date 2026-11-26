// vitest globalSetup. Fails the run when it leaves a seance viewer behind (the leak found after the
// gate tests auto-started a viewer for a temporary workspace; see vitest.config.ts, test.env).
// Two checks at teardown:
//  1. A viewer that answers /seance/health on the default port 127.0.0.1:5317 (Host `127.0.0.1:5317`)
//     but did not answer at setup. A viewer of the owner's own project that was already running is allowed.
//  2. A running `kiro-hook/seance.mjs` process whose --root is inside the OS temp folder. The health
//     answer carries no root, so the process list is the only way to tell a temp-workspace viewer apart.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';

const PORT = 5317;
const SERVICE = 'ghost-run-seance';

/**
 * @param {number} [port]
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true when a seance viewer answers on the port.
 */
export function viewerAnswers(port = PORT, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/seance/health', headers: { Host: `127.0.0.1:${port}` }, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          if (body.length < 512) body += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body).service === SERVICE);
          } catch {
            resolve(false);
          }
        });
        res.on('error', () => resolve(false));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/**
 * Lines of running seance viewers whose --root is under a temp folder.
 * @param {string} psOutput output of `ps -axo pid=,command=`
 * @param {string[]} roots temp folder prefixes
 * @returns {string[]}
 */
export function tempRootViewers(psOutput, roots) {
  // Anchored: `<pid> <node binary> <path>/kiro-hook/seance.mjs ... --root <dir>`. A shell or agent whose
  // command line merely mentions the script does not match.
  const viewer = /^\s*\d+\s+\S*node\S*\s+\S*kiro-hook\/seance\.mjs(?:\s+\S+)*?\s+--root\s+(\S+)/;
  return psOutput
    .split('\n')
    .filter((line) => {
      const m = viewer.exec(line);
      return m !== null && roots.some((t) => (m[1] ?? '').startsWith(`${t}/`));
    })
    .map((line) => line.trim());
}

/** @returns {string[]} */
function tmpRoots() {
  const roots = new Set([tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']);
  try {
    roots.add(realpathSync(tmpdir()));
  } catch {
    // keep the plain names
  }
  return [...roots];
}

/** @type {boolean} */
let viewerBefore = false;

export async function setup() {
  viewerBefore = await viewerAnswers();
}

export async function teardown() {
  /** @type {string[]} */
  const problems = [];
  if (!viewerBefore && (await viewerAnswers())) {
    problems.push(`a seance viewer answers on 127.0.0.1:${PORT} and did not before the run`);
  }
  const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  if (ps.status === 0) {
    for (const line of tempRootViewers(ps.stdout, tmpRoots())) problems.push(`viewer process on a temp root: ${line}`);
  }
  if (problems.length > 0) {
    throw new Error(`the test run left a seance viewer behind:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
}

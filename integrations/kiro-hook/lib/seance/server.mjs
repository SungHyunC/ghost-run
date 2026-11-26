// Seance viewer (Requirement 26): a read-only HTTP server for the graveyard of one workspace.
// Binds 127.0.0.1 only. GET only. Serves an id only when it matches the id pattern and exists in
// the graveyard. Every page is built without script.
import http from 'node:http';
import { readGraveyard } from '../gate/grave.mjs';
import { storePaths } from '../store/ghost-store.mjs';
import { CSP, renderGrave, renderList, renderMessage } from './render.mjs';

/** Default seance base of the Message_Builder (core/src/judge/message.ts). */
export const DEFAULT_SEANCE_BASE = 'http://localhost:5317';
/** Identity of the viewer in the health answer. */
export const HEALTH_SERVICE = 'ghost-run-seance';
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Quiet period after which a started viewer exits (ms). */
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;

/**
 * Host and port of the seance base, and whether it is a local address the viewer can serve.
 * @param {string | undefined} base
 * @returns {{ local: boolean, port: number }}
 */
export function parseSeanceBase(base) {
  try {
    const u = new URL(typeof base === 'string' && base !== '' ? base : DEFAULT_SEANCE_BASE);
    const port = u.port !== '' ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    return { local, port };
  } catch {
    return { local: false, port: 0 };
  }
}

/** @type {Record<string, string>} */
const COMMON_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} body
 * @param {string} [type]
 * @param {Record<string, string>} [extra]
 */
function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...COMMON_HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
}

/**
 * Create (not start) the viewer for a workspace root.
 * @param {{ root: string, idleMs?: number, onIdle?: () => void }} options
 * @returns {http.Server}
 */
export function createSeanceServer({ root, idleMs, onIdle }) {
  const file = storePaths(root).graveyard;
  /** @type {NodeJS.Timeout | undefined} */
  let idle;
  const touch = () => {
    if (idleMs === undefined) return;
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => onIdle?.(), idleMs);
    idle.unref?.();
  };

  const server = http.createServer((req, res) => {
    touch();
    void (async () => {
      try {
        if (req.method !== 'GET') {
          send(res, 405, renderMessage('Method not allowed', 'Only GET is supported.'), undefined, { Allow: 'GET' });
          return;
        }
        // Raw path only: no decoding, so an encoded slash or dot never reaches a lookup.
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (pathname === '/seance/health') {
          send(res, 200, JSON.stringify({ service: HEALTH_SERVICE, version: 1 }), 'application/json; charset=utf-8');
          return;
        }
        /** @type {{ entries: import('@ghost-run/ui').GraveEntry[], corrupt: number }} */
        let grave = { entries: [], corrupt: 0 };
        try {
          grave = await readGraveyard(file);
        } catch {
          grave = { entries: [], corrupt: 0 };
        }
        if (pathname === '/seance' || pathname === '/seance/') {
          send(res, 200, renderList(grave.entries, grave.corrupt));
          return;
        }
        const id = pathname.startsWith('/seance/') ? pathname.slice('/seance/'.length) : '';
        const entry = ID_RE.test(id) ? grave.entries.find((e) => e.id === id) : undefined;
        if (entry === undefined) {
          send(res, 404, renderMessage('Not found', 'No such grave.'));
          return;
        }
        send(res, 200, renderGrave(entry));
      } catch {
        try {
          send(res, 500, renderMessage('Error', 'The seance page could not be built.'));
        } catch {
          res.destroy();
        }
      }
    })();
  });
  server.on('close', () => idle && clearTimeout(idle));
  server.on('listening', touch);
  return server;
}

/**
 * Start the viewer on 127.0.0.1.
 * @param {{ root: string, port: number, idleMs?: number, onIdle?: () => void }} options
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startSeanceServer(options) {
  const server = createSeanceServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === 'object' && addr !== null ? addr.port : options.port });
    });
  });
}

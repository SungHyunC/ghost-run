// Tests for the seance viewer and its auto-start (Requirement 26).
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../lib/gate/decide.mjs';
import { buildGraveEntry, graveLine } from '../lib/gate/grave.mjs';
import { maybeStartSeance, probePort } from '../lib/seance/autostart.mjs';
import { createSeanceServer, parseSeanceBase, startSeanceServer } from '../lib/seance/server.mjs';
import { createGateStore } from '../lib/store/gate-store.mjs';
import { shellEvent, makeTempStore } from './fixtures/index.mjs';
import { makeMemTree } from './fixtures/mem-tree.mjs';

/** @type {ReturnType<typeof makeTempStore>} */
let tmp;
/** @type {string} */
let root;
/** @type {import('node:http').Server[]} */
const servers = [];
beforeEach(async () => {
  tmp = makeTempStore();
  root = path.join(tmp.dir, 'ws');
  await fsp.mkdir(path.join(root, '.ghost-run'), { recursive: true });
});
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(undefined)));
  tmp.cleanup();
});

const BLOCK = {
  schemaVersion: 1,
  runId: 'run-1',
  verdict: 'block',
  wardVerdict: {
    verdict: 'block',
    violations: [{ wardId: 'protect-data', wardKind: 'path', reason: 'would delete 1,206 rows from users' }],
    notices: [],
  },
  report: { snapshots: [], changes: [[{ kind: 'file-deleted', path: 'data/x' }]], effectsOutside: [], observedEvents: [], variantResults: [] },
  isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
};
const AT = '2026-11-30T01:02:03Z';

/** @param {string} runId @param {string} command */
async function addGrave(runId, command) {
  const entry = buildGraveEntry({ runId, command, recordedAt: AT, result: /** @type {any} */ ({ ...BLOCK, runId }) });
  await fsp.appendFile(path.join(root, '.ghost-run', 'graveyard.jsonl'), `${graveLine(/** @type {any} */ (entry), [])}\n`);
}

async function start() {
  const { server, port } = await startSeanceServer({ root, port: 0 });
  servers.push(server);
  return port;
}

/** @param {number} port @param {string} p @param {string} [method] */
function request(port, p, method = 'GET') {
  return new Promise((resolve, reject) => {
    // `path` is passed raw so that traversal and encoded slashes reach the server unchanged.
    const req = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** @param {number} port @param {string} p @param {Record<string, string>} headers */
function requestWith(port, p, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Send raw bytes (for a request with no Host header) and return the whole answer. @param {number} port @param {string} data */
function rawGet(port, data) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(data));
    let out = '';
    sock.setEncoding('utf8');
    sock.on('data', (c) => (out += c));
    sock.on('end', () => resolve(out));
    sock.on('error', reject);
  });
}

describe('seance viewer', () => {
  it('lists graves newest first and shows one grave with ward id, command, and numbers', async () => {
    await addGrave('run-1', 'rm -rf data');
    await addGrave('run-2', 'echo second');
    const port = await start();
    const list = /** @type {any} */ (await request(port, '/seance/'));
    expect(list.status).toBe(200);
    expect(list.body.indexOf('g-run-2')).toBeGreaterThan(-1);
    expect(list.body.indexOf('g-run-2')).toBeLessThan(list.body.indexOf('g-run-1'));
    const one = /** @type {any} */ (await request(port, '/seance/g-run-1'));
    expect(one.status).toBe(200);
    expect(one.body).toContain('protect-data');
    expect(one.body).toContain('rm -rf data');
    expect(one.body).toContain('1,206 rows');
    expect(one.body).toContain('file-deleted data/x');
    expect(one.body).toContain('out (block)');
    expect(one.body).not.toMatch(/<script/i);
  });

  it('answers /seance/health with a JSON that identifies the viewer', async () => {
    const port = await start();
    const r = /** @type {any} */ (await request(port, '/seance/health'));
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).service).toBe('ghost-run-seance');
  });

  it('answers 404 for unknown and bad ids', async () => {
    await addGrave('run-1', 'ls');
    const port = await start();
    for (const p of ['/seance/g-nope', '/seance/..', '/seance/%2e%2e', '/seance/..%2Fetc%2Fpasswd', '/seance/a%2Fb', '/seance/a/b', `/seance/${'a'.repeat(65)}`, '/other', '/seance/%00']) {
      expect((/** @type {any} */ (await request(port, p))).status, p).toBe(404);
    }
  });

  it('answers 405 to a method other than GET', async () => {
    const port = await start();
    for (const m of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const r = /** @type {any} */ (await request(port, '/seance/', m));
      expect(r.status, m).toBe(405);
      expect(r.headers.allow).toBe('GET');
    }
  });

  it('sends the security headers on every kind of answer', async () => {
    await addGrave('run-1', 'ls');
    const port = await start();
    for (const p of ['/seance/', '/seance/g-run-1', '/seance/nope', '/seance/health']) {
      const r = /** @type {any} */ (await request(port, p));
      expect(r.headers['content-security-policy'], p).toMatch(/default-src 'none'/);
      expect(r.headers['content-security-policy'], p).not.toMatch(/script-src|unsafe/);
      expect(r.headers['x-content-type-options'], p).toBe('nosniff');
      expect(r.headers['cache-control'], p).toBe('no-store');
    }
  });

  it('binds 127.0.0.1 only', async () => {
    const { server } = await startSeanceServer({ root, port: 0 });
    servers.push(server);
    expect(/** @type {any} */ (server.address()).address).toBe('127.0.0.1');
  });

  it('shows an HTML-looking command escaped and hidden characters visible', async () => {
    await addGrave('run-1', 'echo <img src=x onerror=alert(1)> "q" \u202E\u200B');
    const port = await start();
    for (const p of ['/seance/', '/seance/g-run-1']) {
      const r = /** @type {any} */ (await request(port, p));
      expect(r.body, p).not.toContain('<img');
      expect(r.body, p).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(r.body, p).toContain('\\u{202E}\\u{200B}');
      expect(r.body, p).not.toMatch(/[\u202E\u200B]/);
    }
  });

  it('shows a friendly empty page for a missing, corrupt, or unreadable graveyard', async () => {
    const file = path.join(root, '.ghost-run', 'graveyard.jsonl');
    const port = await start();
    expect((/** @type {any} */ (await request(port, '/seance/'))).body).toContain('graveyard is empty');
    await fsp.writeFile(file, 'not json\n{"id":1}\n{"id":"g-x"');
    const corrupt = /** @type {any} */ (await request(port, '/seance/'));
    expect(corrupt.status).toBe(200);
    expect(corrupt.body).toContain('graveyard is empty');
    await fsp.rm(file);
    await fsp.mkdir(file); // a folder where the file belongs: the read fails
    const bad = /** @type {any} */ (await request(port, '/seance/'));
    expect(bad.status).toBe(200);
    expect((/** @type {any} */ (await request(port, '/seance/g-x'))).status).toBe(404);
  });

  it('answers 421 to a wrong or missing Host and does not read the graveyard', async () => {
    await addGrave('run-1', 'rm -rf data');
    const port = await start();
    const spy = vi.spyOn(fsp, 'readFile');
    const before = spy.mock.calls.length;
    for (const host of ['evil.example', `evil.example:${port}`, `localhost:${port + 1}`, 'localhost', `127.0.0.1:0${port}`, `localhost.evil.example:${port}`]) {
      for (const p of ['/seance/', '/seance/g-run-1', '/seance/health']) {
        const r = /** @type {any} */ (await requestWith(port, p, { Host: host }));
        expect(r.status, `${host} ${p}`).toBe(421);
        expect(r.body).not.toContain('rm -rf');
      }
    }
    const raw = await rawGet(port, 'GET /seance/ HTTP/1.0\r\n\r\n');
    expect(raw).toMatch(/^HTTP\/1\.1 421 /);
    expect(raw).not.toContain('rm -rf');
    expect(spy.mock.calls.length).toBe(before);
    await request(port, '/seance/');
    expect(spy.mock.calls.length).toBeGreaterThan(before);
    spy.mockRestore();
  });

  it('accepts localhost:<port> and 127.0.0.1:<port>, host name in any case', async () => {
    await addGrave('run-1', 'rm -rf data');
    const port = await start();
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `LocalHost:${port}`]) {
      for (const p of ['/seance/', '/seance/g-run-1', '/seance/health']) {
        expect((/** @type {any} */ (await requestWith(port, p, { Host: host }))).status, `${host} ${p}`).toBe(200);
      }
    }
  });

  it('lists one row per grave with the first line of the command cut, and shows it in full on the grave page', async () => {
    const long = `echo ${'x'.repeat(300)}`;
    const script = `${long}\nrm -rf data\nSECOND_LINE_MARKER`;
    await addGrave('run-long', script);
    await addGrave('run-short', 'ls -la');
    const port = await start();
    const list = /** @type {any} */ (await request(port, '/seance/'));
    expect(list.status).toBe(200);
    expect(list.body).toContain('2 graves');
    expect(list.body).not.toContain('SECOND_LINE_MARKER');
    expect(list.body).not.toContain('rm -rf data');
    expect(list.body).not.toContain('x'.repeat(130));
    expect(list.body).toContain(`echo ${'x'.repeat(114)}\u2026`);
    expect(list.body.indexOf('ls -la')).toBeLessThan(list.body.indexOf('echo xxx'));
    expect(list.body).toContain('href="/seance/g-run-long"');
    expect(list.body).toContain('out');
    expect(list.body).toContain('protect-data');
    expect(list.body).toContain('<title>Graveyard \u00B7 Ghost Run+</title>');
    const one = /** @type {any} */ (await request(port, '/seance/g-run-long'));
    expect(one.body).toContain(long);
    expect(one.body).toContain('SECOND_LINE_MARKER');
    expect(one.body).toContain('<title>Seance \u00B7 Ghost Run+</title>');
    expect(one.body).not.toMatch(/<script|<img|https?:\/\//i);
  });

  it('shows the gate decision as the badge: flickering for a pass ward verdict, out for block, flickering for an old entry', async () => {
    const NOTICE = 'step 0: change to a gate-protected path needs human approval.';
    const pass = { ...BLOCK, runId: 'run-pass', verdict: 'warn', wardVerdict: { verdict: 'pass', violations: [], notices: [{ kind: 'self-protected', reason: NOTICE }] } };
    const entry = buildGraveEntry({ runId: 'run-pass', command: 'write .kiro/hooks/x', recordedAt: AT, result: /** @type {any} */ (pass) });
    const file = path.join(root, '.ghost-run', 'graveyard.jsonl');
    await fsp.appendFile(file, `${graveLine(/** @type {any} */ (entry), [])}\n`);
    await addGrave('run-block', 'rm -rf data');
    const old = { id: 'g-run-old', command: 'echo old', recordedAt: AT, wardIds: [] };
    await fsp.appendFile(file, `${JSON.stringify(old)}\n`);
    const port = await start();
    const row = (/** @type {string} */ body, /** @type {string} */ id) => body.slice(body.indexOf(`href="/seance/${id}"`)).split('</a>')[0];
    const list = /** @type {any} */ (await request(port, '/seance/'));
    expect(row(list.body, 'g-run-pass')).toContain('flickering');
    expect(row(list.body, 'g-run-pass')).not.toContain('lit');
    expect(row(list.body, 'g-run-block')).toContain('>out<');
    expect(row(list.body, 'g-run-old')).toContain('flickering');
    const p = /** @type {any} */ (await request(port, '/seance/g-run-pass'));
    expect(p.body).toContain('>flickering<');
    expect(p.body).toContain('a gate rule asked');
    expect(p.body).toContain('self-protection floor');
    expect(p.body).toContain(NOTICE);
    const b = /** @type {any} */ (await request(port, '/seance/g-run-block'));
    expect(b.body).toContain('>out<');
    expect(b.body).not.toContain('a gate rule asked');
    const o = /** @type {any} */ (await request(port, '/seance/g-run-old'));
    expect(o.status).toBe(200);
    expect(o.body).toContain('>flickering<');
    expect(o.body).not.toContain('a gate rule asked');
  });

  it('calls onIdle after the quiet period', async () => {
    const onIdle = vi.fn();
    const server = createSeanceServer({ root, idleMs: 30, onIdle });
    servers.push(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
    await new Promise((r) => setTimeout(r, 120));
    expect(onIdle).toHaveBeenCalled();
  });

  it('parses the seance base', () => {
    expect(parseSeanceBase(undefined)).toEqual({ local: true, port: 5317 });
    expect(parseSeanceBase(['http:/', '/', [127, 0, 0, 1].join('.'), ':6000/'].join(''))).toEqual({ local: true, port: 6000 });
    expect(parseSeanceBase('http://localhost')).toEqual({ local: true, port: 80 });
    expect(parseSeanceBase('https://seance.example').local).toBe(false);
    expect(parseSeanceBase('http://evil.example:5317').local).toBe(false);
    expect(parseSeanceBase('nonsense').local).toBe(false);
  });
});

describe('seance auto-start', () => {
  const env = (/** @type {Record<string, string>} */ o = {}) => ({ GHOST_RUN_SEANCE_BASE: 'http://localhost:5999', ...o });

  it('starts once when the port is free', async () => {
    const spawnViewer = vi.fn();
    const probe = vi.fn(async () => /** @type {const} */ ('free'));
    expect(await maybeStartSeance({ root, env: env(), probe, spawnViewer })).toBe('started');
    expect(spawnViewer).toHaveBeenCalledTimes(1);
    expect(spawnViewer).toHaveBeenCalledWith(root, 5999);
    expect(probe).toHaveBeenCalledWith(5999);
  });

  it('uses the default port when no base is set', async () => {
    const spawnViewer = vi.fn();
    await maybeStartSeance({ root, env: {}, probe: async () => 'free', spawnViewer });
    expect(spawnViewer).toHaveBeenCalledWith(root, 5317);
  });

  it.each([
    ['the viewer already runs', env(), 'viewer', 'running'],
    ['another service holds the port', env(), 'busy', 'busy'],
    ['the base is not local', env({ GHOST_RUN_SEANCE_BASE: 'https://seance.example' }), 'free', 'not-local'],
    ['the base is a non-local http host', env({ GHOST_RUN_SEANCE_BASE: 'http://other.example:5317' }), 'free', 'not-local'],
    ['it is switched off', env({ GHOST_RUN_SEANCE_AUTOSTART: '0' }), 'free', 'off'],
  ])('does not start when %s', async (_name, e, state, expected) => {
    const spawnViewer = vi.fn();
    const probe = vi.fn(async () => /** @type {any} */ (state));
    expect(await maybeStartSeance({ root, env: e, probe, spawnViewer })).toBe(expected);
    expect(spawnViewer).not.toHaveBeenCalled();
  });

  it('never throws when the probe or the spawn fails', async () => {
    expect(await maybeStartSeance({ root, env: env(), probe: async () => { throw new Error('x'); }, spawnViewer: vi.fn() })).toBe('failed');
    expect(
      await maybeStartSeance({ root, env: env(), probe: async () => 'free', spawnViewer: () => { throw new Error('x'); } }),
    ).toBe('failed');
  });

  it('probePort tells free, viewer, and busy apart', async () => {
    const port = await start();
    expect(await probePort(port)).toBe('viewer');
    const other = http.createServer((_q, s) => s.end('hello'));
    await new Promise((r) => other.listen(0, '127.0.0.1', () => r(undefined)));
    servers.push(other);
    expect(await probePort(/** @type {any} */ (other.address()).port)).toBe('busy');
    const probeFree = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = /** @type {any} */ (s.address()).port;
        s.close(() => resolve(p));
      });
    });
    expect(await probePort(/** @type {number} */ (probeFree))).toBe('free');
  });
});

describe('seance end to end through the gate grave path', () => {
  it('a block through decide writes a grave that the viewer serves, and the hook callback fires', async () => {
    const wardSet = { wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**'] }] };
    const onGrave = vi.fn();
    const result = { ...BLOCK, runId: 'ignored', rehearsed: true, exitCodes: [0], copy: { cloned: true, location: 'copy' }, recorder: { location: 'in-box', tamperResistant: false }, captures: [], diagnostics: [], staticFindings: [], notices: [], phases: {}, status: 'ok' };
    const d = await decide(
      { stdin: JSON.stringify(shellEvent('rm -rf data', { cwd: root })), root, env: {}, elapsedSec: 0 },
      {
        loadWards: async () => ({ ok: /** @type {const} */ (true), wardSet: /** @type {any} */ (wardSet), safeCommands: [], file: 'wards.yaml' }),
        clock: () => Date.UTC(2026, 10, 20, 12, 0, 0),
        uuid: () => 'run-e2e_1',
        warnMode: 'exit2',
        store: createGateStore(root),
        fsView: makeMemTree({ [root]: { dir: true } }),
        runPlan: /** @type {any} */ (async () => ({ result, payloads: new Map() })),
        onGrave,
      },
    );
    expect(d.exit).toBe(2);
    expect(onGrave).toHaveBeenCalledTimes(1);
    const port = await start();
    const r = /** @type {any} */ (await request(port, '/seance/g-run-e2e_1'));
    expect(r.status).toBe(200);
    expect(r.body).toContain('protect-data');
    expect(d.stderr).toContain('/seance/g-run-e2e_1');
  });

  it('decision and exit code are the same with a throwing or a missing onGrave', async () => {
    const wardSet = { wards: [{ id: 'protect-data', kind: 'path', deny: ['delete'], paths: ['data/**'] }] };
    const result = { ...BLOCK, rehearsed: true, exitCodes: [0], copy: { cloned: true, location: 'copy' }, recorder: { location: 'in-box', tamperResistant: false }, captures: [], diagnostics: [], staticFindings: [], notices: [], phases: {}, status: 'ok' };
    /** @param {any} onGrave */
    const go = (onGrave) =>
      decide(
        { stdin: JSON.stringify(shellEvent('rm -rf data', { cwd: root })), root, env: {}, elapsedSec: 0 },
        {
          loadWards: async () => ({ ok: /** @type {const} */ (true), wardSet: /** @type {any} */ (wardSet), safeCommands: [], file: 'wards.yaml' }),
          clock: () => Date.UTC(2026, 10, 20, 12, 0, 0),
          uuid: () => 'run-same_1',
          warnMode: 'exit2',
          store: createGateStore(root),
          fsView: makeMemTree({ [root]: { dir: true } }),
          runPlan: /** @type {any} */ (async () => ({ result, payloads: new Map() })),
          ...(onGrave === undefined ? {} : { onGrave }),
        },
      );
    const a = await go(undefined);
    const b = await go(() => {
      throw new Error('boom');
    });
    expect({ exit: b.exit, stdout: b.stdout, stderr: b.stderr, kind: b.kind }).toEqual({ exit: a.exit, stdout: a.stdout, stderr: a.stderr, kind: a.kind });
  });
});

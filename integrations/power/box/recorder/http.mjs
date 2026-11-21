// HTTP listener of the in-box recorder (TCP 80). It only records; it never forwards a request.
//
// Per request one line goes to http.jsonl: { host, port, bytes, sha256, step, body }.
// `bytes` and `sha256` describe the captured body (at most 64 KiB); `body` is that capture
// in base64 so the host can hold it in memory for ward content inspection. The reply is
// always an empty 200.
import { createHash } from 'node:crypto';
import http from 'node:http';
import { allocator } from './dns.mjs';
import { BODY_CAP_BYTES, currentStep, logLine } from './rec.mjs';

/** Host name for the log: Host header (port stripped) when plausible, else the allocated name of the local address. */
export function hostFor(headerHost, localAddress) {
  if (typeof headerHost === 'string') {
    const h = headerHost.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (/^[a-z0-9_.-]+$/.test(h) && h !== '') return h;
  }
  return allocator.lookup(localAddress ?? '') ?? (localAddress || 'unknown.invalid');
}

/**
 * Shared request handler for the HTTP and TLS listeners. Captures up to 64 KiB of the body,
 * logs once when the request ends or the connection closes, and answers 200.
 */
export function recordRequest(req, res, { file, nameField, port, name }) {
  const chunks = [];
  let captured = 0;
  let logged = false;
  const finish = () => {
    if (logged) return;
    logged = true;
    const body = Buffer.concat(chunks, captured);
    logLine(file, {
      [nameField]: name(req),
      port,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      step: currentStep(),
      ...(body.length > 0 ? { body: body.toString('base64') } : {}),
    });
  };
  req.on('data', (chunk) => {
    if (captured >= BODY_CAP_BYTES) return;
    const take = chunk.subarray(0, BODY_CAP_BYTES - captured);
    chunks.push(take);
    captured += take.length;
  });
  req.on('end', () => {
    finish();
    res.writeHead(200, { 'Content-Length': '0', Connection: 'close' });
    res.end();
  });
  req.on('close', finish);
  req.on('error', finish);
}

/** Starts the HTTP listener. Resolves once it listens. */
export function startHttp({ port = 80, address = '0.0.0.0' } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) =>
      recordRequest(req, res, {
        file: 'http.jsonl',
        nameField: 'host',
        port,
        name: (r) => hostFor(r.headers.host, r.socket.localAddress),
      }),
    );
    server.on('clientError', (_err, socket) => socket.destroy());
    server.once('error', reject);
    server.listen(port, address, () => {
      server.removeListener('error', reject);
      server.on('error', (err) => process.stderr.write(`ghost-http: ${err.message}\n`));
      resolve(server);
    });
  });
}

// TLS listener of the in-box recorder (TCP 443).
//
// Terminates TLS with a per-SNI leaf certificate (cached, minted by ca.mjs). The SNI name
// is logged to tls.jsonl as { sni, port, step } inside the SNI callback, before the
// handshake completes, so the event exists even when the client rejects the certificate.
// For a client that trusts the box CA the decrypted request body (at most 64 KiB) is
// logged as { sni, port, bytes, sha256, step, body } and answered with an empty 200.
import https from 'node:https';
import { createSecureContext } from 'node:tls';
import { allocator } from './dns.mjs';
import { createCa } from './ca.mjs';
import { recordRequest } from './http.mjs';
import { currentStep, logLine } from './rec.mjs';

/** Starts the TLS listener. Rejects when the CA is missing or the port cannot be bound. */
export function startTls({ port = 443, address = '0.0.0.0', ca } = {}) {
  return new Promise((resolve, reject) => {
    let minter;
    try {
      minter = ca ?? createCa();
    } catch (err) {
      reject(err);
      return;
    }
    const contexts = new Map();
    const server = https.createServer(
      {
        // Handshakes without an SNI name (direct IP) still need a context.
        SNICallback: (servername, cb) => {
          if (servername) logLine('tls.jsonl', { sni: servername.toLowerCase().replace(/[^\x21-\x7e]|\//g, '_'), port, step: currentStep() });
          minter
            .leafFor(servername || 'ghost-invalid.invalid')
            .then((leaf) => {
              let ctx = contexts.get(leaf.name);
              if (ctx === undefined) {
                ctx = createSecureContext({ key: leaf.key, cert: leaf.cert });
                contexts.set(leaf.name, ctx);
              }
              cb(null, ctx);
            })
            .catch((err) => cb(err));
        },
      },
      (req, res) =>
        recordRequest(req, res, {
          file: 'tls.jsonl',
          nameField: 'sni',
          port,
          name: (r) => {
            const s = r.socket.servername;
            if (typeof s === 'string' && s !== '') return s.toLowerCase().replace(/[^\x21-\x7e]|\//g, '_');
            const local = r.socket.localAddress ?? '';
            return allocator.lookup(local) ?? (local || 'unknown.invalid');
          },
        }),
    );
    server.on('tlsClientError', (_err, socket) => socket.destroy());
    server.on('clientError', (_err, socket) => socket.destroy());
    server.once('error', reject);
    server.listen(port, address, () => {
      server.removeListener('error', reject);
      server.on('error', (err) => process.stderr.write(`ghost-tls: ${err.message}\n`));
      resolve(server);
    });
  });
}

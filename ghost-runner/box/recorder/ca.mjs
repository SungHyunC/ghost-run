// Leaf certificate minting for the TLS recorder, signed by the throw-away box CA.
//
// The CA is created inside the image at build time (task 10.3) as
//   <GHOST_CA_DIR or /opt/ghost/ca>/ca.crt   and   <...>/ca.key
// and is read here at runtime only. No key material lives in this repository. Leaf
// certificates are minted with the openssl CLI (Node has no certificate generator); the
// leaf key pair is generated once per process with node:crypto and reused for every name.
// Runs inside a network-less box.
import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CA_DIR = process.env.GHOST_CA_DIR || '/opt/ghost/ca';
const OPENSSL = process.env.GHOST_OPENSSL || 'openssl';
const FALLBACK_NAME = 'ghost-invalid.invalid';
const MAX_CACHE = 512;

/** A DNS name that is safe to pass to openssl as a SAN and CN. Anything else maps to a fixed name. */
export function safeName(name) {
  const n = String(name ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (n.length === 0 || n.length > 253) return FALLBACK_NAME;
  return /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(n) ? n : FALLBACK_NAME;
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(OPENSSL, args, { timeout: 10_000, maxBuffer: 1024 * 1024 }, (err, _out, stderr) =>
      err ? reject(new Error(`openssl failed: ${String(stderr).slice(0, 200)}`)) : resolve(),
    );
  });
}

/** Creates a minter bound to a CA directory. Throws when the CA files cannot be read. */
export function createCa({ dir = CA_DIR } = {}) {
  const caCrtPath = join(dir, 'ca.crt');
  const caKeyPath = join(dir, 'ca.key');
  // Fail early (and visibly) when the image has no CA.
  const caCert = readFileSync(caCrtPath, 'utf8');
  readFileSync(caKeyPath);

  const work = mkdtempSync(join(tmpdir(), 'ghost-ca-'));
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const leafKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const leafKeyPath = join(work, 'leaf.key');
  writeFileSync(leafKeyPath, leafKeyPem, { mode: 0o600 });

  const cache = new Map();
  let counter = 0;

  async function mint(name) {
    const out = join(work, `leaf-${counter++}.crt`);
    try {
      await run([
        'req', '-new', '-x509',
        '-CA', caCrtPath, '-CAkey', caKeyPath,
        '-key', leafKeyPath,
        '-subj', `/CN=${name}`,
        '-days', '30',
        '-addext', `subjectAltName=DNS:${name}`,
        '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature',
        '-addext', 'extendedKeyUsage=serverAuth',
        '-out', out,
      ]);
      const leaf = readFileSync(out, 'utf8');
      return { key: leafKeyPem, cert: leaf + caCert, name };
    } finally {
      rmSync(out, { force: true });
    }
  }

  return {
    /** `{ key, cert }` PEM for `name` (cached per name). `cert` includes the CA certificate as chain. */
    leafFor(name) {
      const n = safeName(name);
      let p = cache.get(n);
      if (p === undefined) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        p = mint(n);
        p.catch(() => cache.delete(n));
        cache.set(n, p);
      }
      return p;
    },
    close() {
      rmSync(work, { recursive: true, force: true });
    },
  };
}

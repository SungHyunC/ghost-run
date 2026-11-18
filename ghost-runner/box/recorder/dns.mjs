// Fake DNS resolver of the in-box recorder (UDP 53). Runs inside a network-less box.
//
// A queries get a distinct loopback address 127.x.y.z per lowercase name. Every other type
// gets NOERROR with no answers (AAAA NODATA, so resolvers do not stall). Each lookup is
// logged to dns.jsonl as { host, ip?, step }.
//
// The codec below is a deliberate small duplicate of src/recorder/dns-codec.ts (the box
// cannot import host modules). Property 15 tests keep the two in step.
import dgram from 'node:dgram';
import { currentStep, logLine } from './rec.mjs';

export const QTYPE_A = 1;
export const QTYPE_AAAA = 28;

export function decodeQuery(packet) {
  if (packet.length < 12) return undefined;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const flags = view.getUint16(2);
  if ((flags & 0x8000) !== 0) return undefined;
  if (((flags >> 11) & 0xf) !== 0) return undefined;
  if (view.getUint16(4) < 1) return undefined;
  const labels = [];
  let pos = 12;
  let total = 0;
  for (;;) {
    if (pos >= packet.length) return undefined;
    const len = packet[pos];
    if (len === 0) {
      pos += 1;
      break;
    }
    if ((len & 0xc0) !== 0 || len > 63) return undefined;
    if (pos + 1 + len > packet.length) return undefined;
    total += len + 1;
    if (total > 255) return undefined;
    let label = '';
    for (let i = 0; i < len; i++) label += String.fromCharCode(packet[pos + 1 + i]);
    labels.push(label.toLowerCase());
    pos += 1 + len;
  }
  if (pos + 4 > packet.length) return undefined;
  const qtype = view.getUint16(pos);
  const qclass = view.getUint16(pos + 2);
  pos += 4;
  return {
    id: view.getUint16(0),
    flags,
    name: labels.join('.'),
    qtype,
    qclass,
    question: packet.slice(12, pos),
  };
}

export function encodeQuery(id, name, qtype) {
  const parts = [];
  for (const label of name.split('.').filter((l) => l.length > 0)) {
    parts.push(label.length);
    for (let i = 0; i < label.length; i++) parts.push(label.charCodeAt(i) & 0xff);
  }
  parts.push(0, (qtype >> 8) & 0xff, qtype & 0xff, 0, 1);
  const out = new Uint8Array(12 + parts.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, id);
  view.setUint16(2, 0x0100);
  view.setUint16(4, 1);
  out.set(parts, 12);
  return out;
}

function parseIPv4(address) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return undefined;
  const bytes = m.slice(1).map(Number);
  if (bytes.some((b) => b > 255)) return undefined;
  return Uint8Array.from(bytes);
}

export function encodeResponse(query, address) {
  const answerBytes = query.qtype === QTYPE_A && address !== undefined ? parseIPv4(address) : undefined;
  const size = 12 + query.question.length + (answerBytes ? 16 : 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint16(0, query.id);
  view.setUint16(2, 0x8000 | (query.flags & 0x0100) | 0x0080);
  view.setUint16(4, 1);
  view.setUint16(6, answerBytes ? 1 : 0);
  out.set(query.question, 12);
  if (answerBytes) {
    let p = 12 + query.question.length;
    view.setUint16(p, 0xc00c);
    view.setUint16(p + 2, QTYPE_A);
    view.setUint16(p + 4, 1);
    view.setUint32(p + 6, 0);
    view.setUint16(p + 10, 4);
    p += 12;
    out.set(answerBytes, p);
  }
  return out;
}

export class LoopbackAllocator {
  #byName = new Map();
  #byAddress = new Map();

  allocate(name) {
    const key = name.toLowerCase();
    const existing = this.#byName.get(key);
    if (existing !== undefined) return existing;
    const n = this.#byName.size + 256; // skips 127.0.0.0/24, which holds 127.0.0.1
    if (n > 0xffffff) throw new RangeError('loopback address space exhausted');
    const address = `127.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    this.#byName.set(key, address);
    this.#byAddress.set(address, key);
    return address;
  }

  lookup(address) {
    return this.#byAddress.get(address);
  }
}

export function answer(packet, allocator) {
  const query = decodeQuery(packet);
  if (!query) return undefined;
  if (query.qtype === QTYPE_A) {
    const address = allocator.allocate(query.name);
    return { query, response: encodeResponse(query, address), address };
  }
  return { query, response: encodeResponse(query) };
}

/** The allocator shared with the HTTP and TLS listeners of the same process. */
export const allocator = new LoopbackAllocator();

/** Keeps the logged host valid for the host-side parser: printable, no whitespace or slash. */
export function logName(name) {
  return name.replace(/[^\x21-\x7e]|\//g, '_').replace(/\.$/, '');
}

const REVERSE = /\.(in-addr|ip6)\.arpa$/;

/**
 * Starts the resolver. Resolves once the socket is bound.
 * `port` 53 and address 127.0.0.1 match `--dns 127.0.0.1`; tests override both.
 */
export function startDns({ port = 53, address = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      try {
        const res = answer(msg, allocator);
        if (!res) return;
        const name = logName(res.query.name);
        if (name !== '' && !REVERSE.test(name)) {
          logLine('dns.jsonl', {
            host: name,
            ...(res.address !== undefined ? { ip: res.address } : {}),
            step: currentStep(),
          });
        }
        socket.send(res.response, rinfo.port, rinfo.address);
      } catch (err) {
        process.stderr.write(`ghost-dns: ${err && err.message ? err.message : 'error'}\n`);
      }
    });
    socket.once('error', reject);
    socket.bind(port, address, () => {
      socket.removeListener('error', reject);
      socket.on('error', (err) => process.stderr.write(`ghost-dns: ${err.message}\n`));
      resolve(socket);
    });
  });
}

// Minimal DNS wire codec for the recorder's fake resolver (A and AAAA only).

export const QTYPE_A = 1;
export const QTYPE_AAAA = 28;

export interface DnsQuery {
  readonly id: number;
  readonly flags: number;
  /** Lowercase hostname without trailing dot. */
  readonly name: string;
  readonly qtype: number;
  readonly qclass: number;
  /** Raw question section bytes (name, type, class), echoed in the response. */
  readonly question: Uint8Array;
}

/** Decode the first question of a DNS query. Returns undefined for malformed or non-query packets. */
export function decodeQuery(packet: Uint8Array): DnsQuery | undefined {
  if (packet.length < 12) return undefined;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const flags = view.getUint16(2);
  if ((flags & 0x8000) !== 0) return undefined; // a response, not a query
  if (((flags >> 11) & 0xf) !== 0) return undefined; // not a standard query
  if (view.getUint16(4) < 1) return undefined;
  const labels: string[] = [];
  let pos = 12;
  let total = 0;
  for (;;) {
    if (pos >= packet.length) return undefined;
    const len = packet[pos] as number;
    if (len === 0) {
      pos += 1;
      break;
    }
    if ((len & 0xc0) !== 0 || len > 63) return undefined; // no compression in a question
    if (pos + 1 + len > packet.length) return undefined;
    total += len + 1;
    if (total > 255) return undefined;
    let label = '';
    for (let i = 0; i < len; i++) label += String.fromCharCode(packet[pos + 1 + i] as number);
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

/** Encode a query for one name (used by tests and the round-trip property). */
export function encodeQuery(id: number, name: string, qtype: number): Uint8Array {
  const parts: number[] = [];
  for (const label of name.split('.').filter((l) => l.length > 0)) {
    parts.push(label.length);
    for (let i = 0; i < label.length; i++) parts.push(label.charCodeAt(i) & 0xff);
  }
  parts.push(0, (qtype >> 8) & 0xff, qtype & 0xff, 0, 1);
  const out = new Uint8Array(12 + parts.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, id);
  view.setUint16(2, 0x0100); // RD
  view.setUint16(4, 1);
  out.set(parts, 12);
  return out;
}

/**
 * Encode a response. A queries get one A record with `address`; AAAA queries
 * and everything else get NOERROR with no answers.
 */
export function encodeResponse(query: DnsQuery, address?: string): Uint8Array {
  const answer = query.qtype === QTYPE_A && address !== undefined ? parseIPv4(address) : undefined;
  const size = 12 + query.question.length + (answer ? 16 : 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint16(0, query.id);
  view.setUint16(2, 0x8000 | (query.flags & 0x0100) | 0x0080); // QR, RD copied, RA, RCODE 0
  view.setUint16(4, 1);
  view.setUint16(6, answer ? 1 : 0);
  out.set(query.question, 12);
  if (answer) {
    let p = 12 + query.question.length;
    view.setUint16(p, 0xc00c); // pointer to the question name
    view.setUint16(p + 2, QTYPE_A);
    view.setUint16(p + 4, 1);
    view.setUint32(p + 6, 0); // TTL 0
    view.setUint16(p + 10, 4);
    p += 12;
    out.set(answer, p);
  }
  return out;
}

function parseIPv4(address: string): Uint8Array | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return undefined;
  const bytes = m.slice(1).map(Number);
  if (bytes.some((b) => b > 255)) return undefined;
  return Uint8Array.from(bytes);
}

/** Allocates one stable loopback address (127.x.y.z, never 127.0.0.x) per lowercase name. */
export class LoopbackAllocator {
  private readonly byName = new Map<string, string>();
  private readonly byAddress = new Map<string, string>();

  allocate(name: string): string {
    const key = name.toLowerCase();
    const existing = this.byName.get(key);
    if (existing !== undefined) return existing;
    const n = this.byName.size + 256; // skips 127.0.0.0/24, which holds 127.0.0.1
    if (n > 0xffffff) throw new RangeError('loopback address space exhausted');
    const address = `127.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
    this.byName.set(key, address);
    this.byAddress.set(address, key);
    return address;
  }

  /** Hostname for an allocated address, or undefined for addresses this resolver never handed out. */
  lookup(address: string): string | undefined {
    return this.byAddress.get(address);
  }
}

/** Decode a query and build its response in one step. Returns undefined for undecodable packets. */
export function answer(
  packet: Uint8Array,
  allocator: LoopbackAllocator,
): { readonly query: DnsQuery; readonly response: Uint8Array; readonly address?: string } | undefined {
  const query = decodeQuery(packet);
  if (!query) return undefined;
  if (query.qtype === QTYPE_A) {
    const address = allocator.allocate(query.name);
    return { query, response: encodeResponse(query, address), address };
  }
  return { query, response: encodeResponse(query) };
}

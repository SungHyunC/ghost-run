import {
  SourcedCollector,
  type HostLookup,
  type PayloadCaptureMeta,
  type SourcedObservation,
} from './events.js';

export interface DnsLogResult {
  readonly observations: readonly SourcedObservation[];
  /** Allocated loopback address to lowercase hostname. */
  readonly addressToHost: ReadonlyMap<string, string>;
  /** Lookup suitable for parseStrace's `resolveLoopback` option. */
  readonly lookup: HostLookup;
  /** Number of non-empty lines that could not be parsed. */
  readonly invalidLines: number;
}

export interface ListenerLogResult {
  readonly observations: readonly SourcedObservation[];
  readonly captures: readonly PayloadCaptureMeta[];
  readonly invalidLines: number;
}

const SHA256 = /^[0-9a-f]{64}$/;

function parseLines(text: string): { value: Record<string, unknown> | undefined }[] {
  const out: { value: Record<string, unknown> | undefined }[] = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    try {
      const v: unknown = JSON.parse(line);
      out.push({
        value: typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined,
      });
    } catch {
      out.push({ value: undefined });
    }
  }
  return out;
}

function stepOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

function hostOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const h = v.trim().toLowerCase().replace(/\.$/, '');
  return h === '' || /[\s/]/.test(h) ? undefined : h;
}

function portOf(v: unknown, fallback: number): number | undefined {
  if (v === undefined) return fallback;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535 ? v : undefined;
}

/** Parse `dns.jsonl` lines `{ host, ip, step }`. Never throws. */
export function parseDnsLog(text: string): DnsLogResult {
  const collector = new SourcedCollector();
  const addressToHost = new Map<string, string>();
  let invalid = 0;
  for (const { value } of parseLines(text)) {
    const host = hostOf(value?.['host']);
    const step = stepOf(value?.['step']);
    const ip = value?.['ip'];
    if (host === undefined || step === undefined) {
      invalid++;
      continue;
    }
    if (typeof ip === 'string' && ip !== '' && !addressToHost.has(ip)) addressToHost.set(ip, host);
    collector.add({ kind: 'network-attempt', stepIndex: step, destination: host, source: 'dns' });
  }
  return {
    observations: collector.observations(),
    addressToHost,
    lookup: (address) => addressToHost.get(address),
    invalidLines: invalid,
  };
}

function parseListenerLog(
  text: string,
  source: 'http' | 'tls-sni',
  nameFields: readonly string[],
  defaultPort: number,
): ListenerLogResult {
  const collector = new SourcedCollector();
  const captures: PayloadCaptureMeta[] = [];
  let invalid = 0;
  for (const { value } of parseLines(text)) {
    let host: string | undefined;
    for (const f of nameFields) {
      host = hostOf(value?.[f]);
      if (host !== undefined) break;
    }
    const step = stepOf(value?.['step']);
    const port = portOf(value?.['port'], defaultPort);
    if (host === undefined || step === undefined || port === undefined) {
      invalid++;
      continue;
    }
    // A Host header may carry its own port; the logged port wins.
    host = host.replace(/:\d+$/, '');
    const destination = `${host}:${port}`;
    collector.add({ kind: 'network-attempt', stepIndex: step, destination, source });
    const bytes = value?.['bytes'];
    const sha = value?.['sha256'];
    if (typeof bytes === 'number' && Number.isInteger(bytes) && bytes > 0 && typeof sha === 'string' && SHA256.test(sha)) {
      captures.push({ stepIndex: step, destination, source, byteLength: bytes, sha256: sha });
    }
  }
  return { observations: collector.observations(), captures, invalidLines: invalid };
}

/** Parse the HTTP listener log `{ host, port, bytes, sha256, step }`. Never throws. */
export function parseHttpLog(text: string): ListenerLogResult {
  return parseListenerLog(text, 'http', ['host'], 80);
}

/** Parse the TLS listener log `{ sni, port, step, bytes?, sha256? }`. Never throws. */
export function parseTlsLog(text: string): ListenerLogResult {
  return parseListenerLog(text, 'tls-sni', ['sni', 'host'], 443);
}

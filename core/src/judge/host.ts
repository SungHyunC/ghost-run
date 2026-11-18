/**
 * Host matcher for `allow_hosts`. Pure and dependency-free. Destinations are
 * split by hand (scheme, userinfo, path, port); the platform `URL` host parser
 * is used only to canonicalize one host (punycode, IPv6). Numeric-looking
 * names are rejected before `URL` sees them, because `URL` would turn
 * `3232235786` into an IPv4 address.
 */

import { hasHiddenChar, sanitizeText } from './sanitize.js';

export type HostEntryErrorCode =
  | 'empty-host'
  | 'scheme-not-allowed'
  | 'path-not-allowed'
  | 'userinfo-not-allowed'
  | 'invalid-port'
  | 'invalid-hostname'
  | 'invalid-wildcard'
  | 'invalid-ip'
  | 'invalid-character';

export type HostRef = {
  readonly kind: 'name' | 'ipv4' | 'ipv6';
  readonly host: string;
  readonly port?: number;
};

export interface HostEntryError {
  readonly code: HostEntryErrorCode;
  readonly message: string;
}

interface UrlLike {
  readonly hostname: string;
}
type UrlCtor = new (input: string) => UrlLike;

/** Canonical hostname from the platform URL parser; null when missing or throwing. */
function urlHostname(text: string): string | null {
  const ctor = (globalThis as { URL?: UrlCtor }).URL;
  if (typeof ctor !== 'function') return null;
  try {
    return new ctor(text).hostname;
  } catch {
    return null;
  }
}

const MESSAGES: Readonly<Record<HostEntryErrorCode, string>> = {
  'empty-host': 'host entry has no host',
  'scheme-not-allowed': 'host entry must not contain a scheme',
  'path-not-allowed': 'host entry must not contain a path, query, or fragment',
  'userinfo-not-allowed': 'host entry must not contain userinfo',
  'invalid-port': 'port must be an integer from 1 to 65535',
  'invalid-hostname': 'host is not a valid host name',
  'invalid-wildcard': 'wildcard must be the whole leftmost label followed by at least two more labels',
  'invalid-ip': 'invalid IP literal or numeric host',
  'invalid-character': 'host entry contains a control or hidden character',
};

type Failure = { readonly ok: false; readonly code: HostEntryErrorCode };
type Parsed =
  | { readonly ok: true; readonly ref: HostRef; readonly wildcard: boolean }
  | Failure;

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PORT_RE = /^[0-9]{1,5}$/;
const OCTET_RE = /^(0|[1-9][0-9]{0,2})$/;

function fail(code: HostEntryErrorCode): Failure {
  return { ok: false, code };
}

function parsePort(text: string): number | null {
  if (!PORT_RE.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 65535 ? n : null;
}

/** WHATWG "ends in a number" test on the last label. */
function endsInNumber(host: string): boolean {
  const labels = host.split('.');
  const last = labels[labels.length - 1] as string;
  return /^[0-9]+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}

function isCanonicalQuad(host: string): boolean {
  const labels = host.split('.');
  if (labels.length !== 4) return false;
  for (const l of labels) {
    if (!OCTET_RE.test(l) || Number(l) > 255) return false;
  }
  return true;
}

function validName(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  for (const label of host.split('.')) {
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return true;
}

function withPort(kind: HostRef['kind'], host: string, port: number | null): HostRef {
  return port === null ? { kind, host } : { kind, host, port };
}

/**
 * Parse `host`, `host:port`, `[ipv6]`, or `[ipv6]:port` (no scheme, userinfo,
 * or path). `dest` selects destination behaviour for numeric-looking names.
 */
function parseAuthority(text: string, dest: boolean, allowWildcard: boolean): Parsed {
  let hostText: string;
  let port: number | null = null;
  let bracketed = false;

  if (text.startsWith('[')) {
    const close = text.indexOf(']');
    if (close < 0) return fail('invalid-ip');
    hostText = text.slice(1, close);
    bracketed = true;
    const rest = text.slice(close + 1);
    if (rest !== '') {
      if (!rest.startsWith(':')) return fail('invalid-ip');
      port = parsePort(rest.slice(1));
      if (port === null) return fail('invalid-port');
    }
  } else {
    const colon = text.indexOf(':');
    if (colon >= 0) {
      if (text.indexOf(':', colon + 1) >= 0) return fail('invalid-ip');
      port = parsePort(text.slice(colon + 1));
      if (port === null) return fail('invalid-port');
      hostText = text.slice(0, colon);
    } else {
      hostText = text;
    }
  }

  if (bracketed) {
    if (hostText === '') return fail('empty-host');
    if (!/^[0-9a-fA-F:.]+$/.test(hostText) || !hostText.includes(':')) return fail('invalid-ip');
    const canon = urlHostname('http://[' + hostText + ']');
    if (canon === null || !canon.startsWith('[') || !canon.endsWith(']')) return fail('invalid-ip');
    return { ok: true, ref: withPort('ipv6', canon.slice(1, -1), port), wildcard: false };
  }

  if (hostText.endsWith('.')) hostText = hostText.slice(0, -1);
  if (hostText === '') return fail('empty-host');

  let wildcard = false;
  if (hostText.includes('*')) {
    if (!allowWildcard || !hostText.startsWith('*.')) return fail('invalid-wildcard');
    hostText = hostText.slice(2);
    if (hostText.includes('*') || !hostText.includes('.')) return fail('invalid-wildcard');
    if (hostText.split('.').some((l) => l === '')) return fail('invalid-wildcard');
    wildcard = true;
  }

  if (hasHiddenChar(hostText)) return fail('invalid-character');

  if (endsInNumber(hostText)) {
    if (!wildcard && isCanonicalQuad(hostText)) {
      return { ok: true, ref: withPort('ipv4', hostText, port), wildcard: false };
    }
    if (dest && !wildcard && /^[0-9a-zA-Z.]+$/.test(hostText)) {
      // Numeric-looking name: no valid entry can equal it, so it is never allowed.
      return { ok: true, ref: withPort('name', hostText.toLowerCase(), port), wildcard: false };
    }
    return fail(dest ? 'invalid-hostname' : 'invalid-ip');
  }

  // Only ASCII letters, digits, `.`, `-` and non-ASCII (IDN) reach the URL parser.
  if (!/^[A-Za-z0-9.\-\u0080-\u{10FFFF}]+$/u.test(hostText)) return fail('invalid-hostname');
  const canon = urlHostname('http://' + hostText);
  if (canon === null) return fail('invalid-hostname');
  const host = canon.endsWith('.') ? canon.slice(0, -1) : canon;
  if (endsInNumber(host)) return fail(dest ? 'invalid-hostname' : 'invalid-ip');
  if (!validName(host)) return fail('invalid-hostname');
  if (wildcard && !host.includes('.')) return fail('invalid-wildcard');
  return { ok: true, ref: withPort('name', host, port), wildcard };
}

/** Parse a destination into a normalized host reference, or null when invalid. */
export function parseDestination(d: string | undefined): HostRef | null {
  if (typeof d !== 'string') return null;
  let text = d.replace(SCHEME_RE, '');
  const cut = text.search(/[/?#]/);
  if (cut >= 0) text = text.slice(0, cut);
  if (text.includes('\\')) return null;
  const at = text.lastIndexOf('@');
  if (at >= 0) text = text.slice(at + 1);
  const parsed = parseAuthority(text, true, false);
  return parsed.ok ? parsed.ref : null;
}

function parseEntry(entry: string): Parsed {
  if (typeof entry !== 'string') return fail('empty-host');
  if (hasHiddenChar(entry)) return fail('invalid-character');
  if (entry === '') return fail('empty-host');
  if (SCHEME_RE.test(entry)) return fail('scheme-not-allowed');
  if (/[/?#\\]/.test(entry)) return fail('path-not-allowed');
  if (entry.includes('@')) return fail('userinfo-not-allowed');
  return parseAuthority(entry, false, true);
}

/** Null for a valid `allow_hosts` entry, else a code and fixed message. */
export function validateHostEntry(entry: string): HostEntryError | null {
  const parsed = parseEntry(entry);
  if (parsed.ok) return null;
  return { code: parsed.code, message: MESSAGES[parsed.code] };
}

/** Structural key: n:host[:port], w:suffix[:port], i4:.., i6:.., x:<lower-cased raw> for invalid. */
export function hostEntryKey(entry: string): string {
  const parsed = parseEntry(entry);
  if (!parsed.ok) return 'x:' + String(entry).toLowerCase();
  const { ref, wildcard } = parsed;
  const port = ref.port === undefined ? '' : ':' + String(ref.port);
  if (wildcard) return 'w:' + ref.host + port;
  if (ref.kind === 'ipv4') return 'i4:' + ref.host + port;
  if (ref.kind === 'ipv6') return 'i6:[' + ref.host + ']' + port;
  return 'n:' + ref.host + port;
}

interface CompiledEntry {
  readonly kind: HostRef['kind'];
  readonly host: string;
  readonly port: number | undefined;
  readonly wildcard: boolean;
}

function entryAllows(e: CompiledEntry, ref: HostRef): boolean {
  if (e.port !== undefined && e.port !== ref.port) return false;
  if (e.wildcard) {
    if (ref.kind !== 'name') return false;
    const tail = '.' + e.host;
    if (ref.host.length <= tail.length || !ref.host.endsWith(tail)) return false;
    const prefix = ref.host.slice(0, ref.host.length - tail.length);
    return !prefix.includes('.');
  }
  return e.kind === ref.kind && e.host === ref.host;
}

/** Compile entries once. Invalid entries allow nothing. */
export function compileAllowHosts(entries: readonly string[]): { allows(ref: HostRef | null): boolean } {
  const compiled: CompiledEntry[] = [];
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (!parsed.ok) continue;
    compiled.push({
      kind: parsed.ref.kind,
      host: parsed.ref.host,
      port: parsed.ref.port,
      wildcard: parsed.wildcard,
    });
  }
  return {
    allows(ref: HostRef | null): boolean {
      if (ref === null) return false;
      for (const e of compiled) {
        if (entryAllows(e, ref)) return true;
      }
      return false;
    },
  };
}

/** Reduce a destination to host[:port] (IPv6 bracketed), else sanitize the raw text. */
export function redactDestination(d: string | undefined): string {
  const ref = parseDestination(d);
  if (ref === null) return sanitizeText(typeof d === 'string' ? d : '');
  const host = ref.kind === 'ipv6' ? '[' + ref.host + ']' : ref.host;
  return ref.port === undefined ? host : host + ':' + String(ref.port);
}

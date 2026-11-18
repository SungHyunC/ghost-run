// curl records a Network_Attempt and never connects.

import { UNSUPPORTED, type Handler, type UnsupportedResult } from './types.js';
import { resolveArg } from './util.js';

const ENCODER = new TextEncoder();
const FLAG_SILENT = '-s';

/** `<lowercase host>:<port>` for an http or https URL with a non-empty host, else null. */
export function destinationOf(url: string): string | null {
  const m = /^(https?):\/\/([^/?#]*)/i.exec(url);
  if (m === null) return null;
  const scheme = (m[1] as string).toLowerCase();
  let authority = m[2] as string;
  authority = authority.slice(authority.lastIndexOf('@') + 1);
  let host: string;
  let portText = '';
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close < 0) return null;
    host = authority.slice(0, close + 1);
    const rest = authority.slice(close + 1);
    if (rest !== '') {
      if (!rest.startsWith(':')) return null;
      portText = rest.slice(1);
    }
  } else {
    const colon = authority.indexOf(':');
    host = colon < 0 ? authority : authority.slice(0, colon);
    portText = colon < 0 ? '' : authority.slice(colon + 1);
  }
  if (host === '' || host === '[]') return null;
  let port = scheme === 'https' ? 443 : 80;
  if (portText !== '') {
    if (!/^[0-9]{1,5}$/.test(portText)) return null;
    port = Number(portText);
    if (port < 1 || port > 65535) return null;
  }
  return `${host.toLowerCase()}:${port}`;
}

interface Body {
  readonly kind: 'data' | 'file';
  readonly value: string;
}

export const curl: Handler = (args, io, env) => {
  const run = (): number | UnsupportedResult => {
    let body: Body | undefined;
    let url: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] as string;
      if (arg === FLAG_SILENT) continue;
      if (arg === '-X') {
        if (i + 1 >= args.length) return UNSUPPORTED('curl: -X without a method');
        i++;
        continue;
      }
      if (arg === '-d' || arg === '--data-binary') {
        if (i + 1 >= args.length) return UNSUPPORTED(`curl: ${arg} without a value`);
        if (body !== undefined) return UNSUPPORTED('curl: more than one request body');
        const value = args[++i] as string;
        if (value.startsWith('@')) body = { kind: 'file', value: value.slice(1) };
        else if (arg === '-d') body = { kind: 'data', value };
        else return UNSUPPORTED('curl: --data-binary without @file');
        continue;
      }
      if (arg.startsWith('-')) return UNSUPPORTED(`curl: option ${arg}`);
      if (url !== undefined) return UNSUPPORTED('curl: more than one URL');
      url = arg;
    }
    if (url === undefined) return UNSUPPORTED('curl: no URL');
    const destination = destinationOf(url);
    if (destination === null) return UNSUPPORTED('curl: URL is not http or https with a host');

    let bytes: Uint8Array | undefined;
    if (body?.kind === 'data') bytes = ENCODER.encode(body.value);
    else if (body?.kind === 'file') {
      const r = resolveArg(body.value, env);
      const entry = r.ok ? env.fs.get(r.path) : undefined;
      if (!r.ok || entry === undefined || entry.kind !== 'file') {
        io.err(`curl: (26) cannot read ${body.value}\n`);
        return 26;
      }
      env.trace.recordRead(r.path);
      bytes = entry.bytes;
    }
    env.trace.recordNetwork(destination, bytes);
    io.err('network unavailable in the ghost\n');
    return 7;
  };
  return Promise.resolve(run());
};

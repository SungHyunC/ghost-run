import {
  SourcedCollector,
  type HostLookup,
  type SourcedObservation,
} from './events.js';
import { createSecretMatcher, normalizeRelative } from './secret-patterns.js';

export interface ParseStraceOptions {
  readonly stepIndex: number;
  /** Working directory of the action: Copy-relative, or absolute under /work. Default: the Copy root. */
  readonly cwd?: string;
  /** Secret glob patterns (Copy-relative). */
  readonly secretPatterns: readonly string[];
  /** Maps an allocated loopback address to its hostname. Other loopback addresses are ignored. */
  readonly resolveLoopback?: HostLookup;
}

export interface ParseStraceResult {
  readonly observations: readonly SourcedObservation[];
  /** Lines that were not recognized as any syscall record (informational; never fatal). */
  readonly ignoredLines: number;
}

const WORK = '/work';

/** Normalize an absolute POSIX path (`.`, `..`, duplicate slashes). */
function normalizeAbsolute(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function joinPath(base: string, rel: string): string {
  return normalizeAbsolute(rel.startsWith('/') ? rel : `${base}/${rel}`);
}

/** Copy-relative path for an absolute path under /work, else undefined. */
function toCopyRelative(abs: string): string | undefined {
  const n = normalizeAbsolute(abs);
  if (n === WORK) return '';
  if (!n.startsWith(WORK + '/')) return undefined;
  return n.slice(WORK.length + 1);
}

/** Decode a strace C-style quoted string. Returns undefined when `s` is not a quoted string. */
function unquote(s: string): string | undefined {
  const t = s.trim();
  if (t.length < 2 || t[0] !== '"') return undefined;
  const end = t.lastIndexOf('"');
  if (end < 1) return undefined;
  const body = t.slice(1, end);
  const bytes: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c !== '\\') {
      bytes.push(...enc.encode(c));
      continue;
    }
    const n = body[++i];
    if (n === undefined) break;
    const simple: Record<string, number> = { n: 10, t: 9, r: 13, f: 12, v: 11, a: 7, b: 8, '"': 34, '\\': 92 };
    if (n === 'x') {
      const m = /^[0-9a-fA-F]{1,2}/.exec(body.slice(i + 1));
      if (m) {
        bytes.push(parseInt(m[0], 16));
        i += m[0].length;
      }
    } else if (/[0-7]/.test(n)) {
      const m = /^[0-7]{1,3}/.exec(body.slice(i));
      const text = m ? m[0] : n;
      bytes.push(parseInt(text, 8) & 0xff);
      i += text.length - 1;
    } else if (n in simple) {
      bytes.push(simple[n] as number);
    } else {
      bytes.push(...enc.encode(n));
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
}

/** Split top-level, comma-separated syscall arguments (respects quotes, brackets, and `<...>` decorations). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '<' && i > 0 && /[\w)]/.test(s[i - 1] as string) && depth === 0) {
      // fd decoration: skip to a '>' that ends the token
      let j = i + 1;
      while (j < s.length && !(s[j] === '>' && (j + 1 >= s.length || /[,)\s]/.test(s[j + 1] as string)))) j++;
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

interface Call {
  readonly name: string;
  readonly args: string[];
  /** Return value: a number, or undefined when unknown (unfinished, killed). */
  readonly ret: number | undefined;
  /** Path decoration of the return value (`= 3</work/x>`), if any. */
  readonly retPath: string | undefined;
}

/** Parse the text after `name(`: arguments, then optionally `) = ret<decor> ...`. */
function parseCall(name: string, rest: string): Call {
  const m = /\)\s+=\s+(-?\d+|\?)(<[^]*>)?(?:\s|$)/.exec(rest);
  let argText = rest;
  let ret: number | undefined;
  let retPath: string | undefined;
  // Prefer the last "= ret" occurrence so ") = " inside a string cannot cut arguments short.
  const all = [...rest.matchAll(/\)\s+=\s+(-?\d+|\?)(<[^]*?>)?(?=\s|$)/g)];
  const last = all.length > 0 ? all[all.length - 1] : m;
  if (last && last.index !== undefined) {
    argText = rest.slice(0, last.index);
    ret = last[1] === '?' ? undefined : Number(last[1]);
    const d = last[2];
    if (d && d.length > 2) retPath = d.slice(1, -1);
  } else {
    const trimmed = rest.trimEnd();
    argText = trimmed.endsWith(')') ? trimmed.slice(0, -1) : trimmed;
  }
  return { name, args: splitArgs(argText), ret, retPath };
}

function stripDecoration(arg: string): { value: string; decoration: string | undefined } {
  const m = /^([^<"{[]+)<([^]*)>$/.exec(arg.trim());
  if (m) return { value: (m[1] as string).trim(), decoration: m[2] as string };
  return { value: arg.trim(), decoration: undefined };
}

function formatHost(host: string, port: string): string {
  return `${host}:${port}`;
}

function parseConnect(arg: string, opts: ParseStraceOptions): { destination: string; source: 'tcp' | 'strace-connect' } | undefined {
  if (arg.includes('AF_UNIX')) return undefined;
  const portM = /sin6?_port=htons\((\d+)\)/.exec(arg);
  if (!portM) return undefined;
  const port = portM[1] as string;
  let ip: string | undefined;
  if (arg.includes('AF_INET6')) {
    ip = /inet_pton\(AF_INET6,\s*"([^"]*)"/.exec(arg)?.[1];
  } else if (arg.includes('AF_INET')) {
    ip = /inet_addr\("([^"]*)"\)/.exec(arg)?.[1];
  }
  if (ip === undefined || ip === '') return undefined;
  ip = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) ip = mapped[1] as string;
  const isV6 = ip.includes(':');
  const loopback = isV6 ? ip === '::1' : ip.startsWith('127.');
  if (loopback) {
    const host = opts.resolveLoopback?.(ip);
    if (host === undefined) return undefined; // the Box's own services
    return { destination: formatHost(host.toLowerCase(), port), source: 'tcp' };
  }
  if (isV6) return { destination: `[${ip}]:${port}`, source: 'strace-connect' };
  return { destination: formatHost(ip, port), source: 'strace-connect' };
}

/** Whether open flags (plain list or openat2 `{flags=...}`) request read access. */
function opensForRead(flagsArg: string | undefined): boolean {
  if (flagsArg === undefined) return false;
  const m = /flags=([^,}]*)/.exec(flagsArg);
  const flags = m ? (m[1] as string) : flagsArg;
  return /\bO_RDONLY\b|\bO_RDWR\b/.test(flags);
}

/** Trailing-component candidates for a relative path whose directory could not be resolved. */
function trailingCandidates(rel: string): string[] {
  const norm = normalizeRelative(rel);
  return norm === '' ? [] : [norm];
}

/**
 * Parse one step's strace output into network-attempt and secret-read observations.
 * Never throws. Records paths and destinations only, never contents.
 */
export function parseStrace(text: string, options: ParseStraceOptions): ParseStraceResult {
  const collector = new SourcedCollector();
  const isSecret = createSecretMatcher(options.secretPatterns);
  const step = options.stepIndex;
  const seedCwd = (() => {
    const c = options.cwd ?? '';
    return c.startsWith('/') ? normalizeAbsolute(c) : joinPath(WORK, c);
  })();
  const cwds = new Map<number, string>();
  const pending = new Map<string, { name: string; prefix: string }>();
  let ignored = 0;

  const cwdOf = (pid: number): string => cwds.get(pid) ?? seedCwd;

  const emitSecret = (rel: string): void => {
    if (rel !== '' && isSecret(rel)) {
      collector.add({ kind: 'secret-read', stepIndex: step, path: normalizeRelative(rel), source: 'strace-openat' });
    }
  };

  const handleOpen = (pid: number, call: Call): void => {
    if (call.ret === undefined || call.ret < 0) return;
    const name = call.name;
    let dirfdArg: string | undefined;
    let pathArg: string | undefined;
    let flagsArg: string | undefined;
    if (name === 'open') {
      [pathArg, flagsArg] = call.args;
    } else {
      [dirfdArg, pathArg, flagsArg] = call.args;
    }
    if (pathArg === undefined || !opensForRead(flagsArg)) return;
    const path = unquote(pathArg);
    if (path === undefined || path === '') return;

    const candidates = new Set<string>();
    let resolved = false;
    if (path.startsWith('/')) {
      const rel = toCopyRelative(path);
      if (rel !== undefined) candidates.add(rel);
      resolved = true;
    } else if (dirfdArg === undefined || dirfdArg.startsWith('AT_FDCWD')) {
      let base = cwdOf(pid);
      if (dirfdArg !== undefined) {
        const dec = stripDecoration(dirfdArg).decoration;
        if (dec?.startsWith('/')) base = normalizeAbsolute(dec);
      }
      const rel = toCopyRelative(joinPath(base, path));
      if (rel !== undefined) candidates.add(rel);
      resolved = true;
    } else {
      const dec = stripDecoration(dirfdArg).decoration;
      if (dec?.startsWith('/')) {
        const rel = toCopyRelative(joinPath(dec, path));
        if (rel !== undefined) candidates.add(rel);
        resolved = true;
      }
    }
    // The kernel-resolved path from -y decoration (covers symlinks) is a second candidate.
    if (call.retPath?.startsWith('/')) {
      const rel = toCopyRelative(call.retPath);
      if (rel !== undefined) candidates.add(rel);
      resolved = true;
    }
    if (!resolved) {
      // Conservative: match by trailing components; a false positive only adds a recorded read.
      for (const c of trailingCandidates(path)) candidates.add(c);
    }
    for (const rel of candidates) emitSecret(rel);
  };

  const handleCall = (pid: number, call: Call): void => {
    switch (call.name) {
      case 'openat':
      case 'open':
      case 'openat2':
        handleOpen(pid, call);
        return;
      case 'connect': {
        const sock = call.args[1];
        if (sock === undefined) return;
        const c = parseConnect(sock, options);
        if (c) collector.add({ kind: 'network-attempt', stepIndex: step, destination: c.destination, source: c.source });
        return;
      }
      case 'chdir': {
        if (call.ret !== 0 || call.args[0] === undefined) return;
        const p = unquote(call.args[0]);
        if (p !== undefined) cwds.set(pid, joinPath(cwdOf(pid), p));
        return;
      }
      case 'fchdir': {
        if (call.ret !== 0 || call.args[0] === undefined) return;
        const dec = stripDecoration(call.args[0]).decoration;
        if (dec?.startsWith('/')) cwds.set(pid, normalizeAbsolute(dec));
        return;
      }
      default:
        return;
    }
  };

  for (const raw of String(text).split('\n')) {
    try {
      const line = raw.trim();
      if (line === '') continue;
      const pm = /^(?:\[pid\s+(\d+)\]\s*|(\d+)\s+)/.exec(line);
      const pid = pm ? Number(pm[1] ?? pm[2]) : 0;
      const body = pm ? line.slice(pm[0].length) : line;

      const resumed = /^<\.\.\.\s+(\w+)\s+resumed>(.*)$/.exec(body);
      if (resumed) {
        const key = `${pid}:${resumed[1]}`;
        const p = pending.get(key);
        if (!p) {
          ignored++;
          continue;
        }
        pending.delete(key);
        handleCall(pid, parseCall(p.name, p.prefix + (resumed[2] as string)));
        continue;
      }
      const unfinished = /^(\w+)\((.*?)\s*<unfinished \.\.\.>\s*$/.exec(body);
      if (unfinished) {
        const name = unfinished[1] as string;
        const prefix = unfinished[2] as string;
        pending.set(`${pid}:${name}`, { name, prefix });
        // connect arguments are complete before the call blocks; record the attempt now.
        if (name === 'connect') handleCall(pid, parseCall(name, prefix));
        continue;
      }
      const call = /^(\w+)\((.*)$/.exec(body);
      if (call) {
        handleCall(pid, parseCall(call[1] as string, call[2] as string));
      } else {
        ignored++;
      }
    } catch {
      ignored++;
    }
  }
  return { observations: collector.observations(), ignoredLines: ignored };
}

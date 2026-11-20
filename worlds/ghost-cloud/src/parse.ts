import { sanitizeJudgeText } from '@ghost-run/core';
import { MAX_LINE_LENGTH } from './types.js';
import type { Acl, Action } from './types.js';

// Fixed reason texts. They never echo the input.
export const REASON_TOO_LONG = 'line is too long';
export const REASON_NON_ASCII = 'line has a character outside printable ASCII';
export const REASON_SHELL_OPERATOR = 'shell operator';
export const REASON_EMPTY = 'empty line';
export const REASON_COMMAND = 'unsupported command';
export const REASON_MALFORMED = 'malformed command';
export const REASON_ARGUMENT = 'malformed argument';

export const PARSE_REASONS: readonly string[] = [
  REASON_TOO_LONG,
  REASON_NON_ASCII,
  REASON_SHELL_OPERATOR,
  REASON_EMPTY,
  REASON_COMMAND,
  REASON_MALFORMED,
  REASON_ARGUMENT,
];

const BUCKET_RE = /^[a-z0-9.-]{3,63}$/;
const KEY_RE = /^[A-Za-z0-9._/-]+$/;
const ENDPOINT_RE = /^https?:\/\/[A-Za-z0-9:/._-]+$/;
const PRINTABLE_RE = /^[\u0020-\u007e]*$/;
const OPERATOR_RE = /[;|&`<>]|\$\(/;

class Reject extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function unsupported(line: string, reason: string): Action {
  return { kind: 'unsupported', line: sanitizeJudgeText(line, MAX_LINE_LENGTH), reason };
}

function validBucket(name: string): boolean {
  return BUCKET_RE.test(name);
}

/** A key or prefix: closed character set, no empty segment except one trailing slash for prefixes, no `..`. */
function validKey(key: string, allowEmpty: boolean): boolean {
  if (key === '') return allowEmpty;
  if (!KEY_RE.test(key) || key.startsWith('/')) return false;
  const segments = key.split('/');
  return segments.every((seg, i) => seg !== '..' && seg !== '.' && (seg !== '' || (i === segments.length - 1 && allowEmpty)));
}

interface S3Uri {
  readonly bucket: string;
  readonly key: string;
}

function parseUri(token: string): S3Uri {
  if (!token.startsWith('s3://')) throw new Reject(REASON_ARGUMENT);
  const rest = token.slice(5);
  const slash = rest.indexOf('/');
  const bucket = slash === -1 ? rest : rest.slice(0, slash);
  const key = slash === -1 ? '' : rest.slice(slash + 1);
  if (!validBucket(bucket)) throw new Reject(REASON_ARGUMENT);
  if (key !== '' && !validKey(key, true)) throw new Reject(REASON_ARGUMENT);
  return { bucket, key };
}

interface Options {
  readonly flags: ReadonlySet<string>;
  readonly values: ReadonlyMap<string, string>;
  readonly positional: readonly string[];
}

/** Splits tokens into positionals, boolean flags, and valued options. Rejects unknown or duplicate options. */
function readOptions(tokens: readonly string[], flagNames: readonly string[], valueNames: readonly string[]): Options {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    if (t.startsWith('--')) {
      if (flagNames.includes(t)) {
        if (flags.has(t)) throw new Reject(REASON_MALFORMED);
        flags.add(t);
      } else if (valueNames.includes(t)) {
        const v = tokens[i + 1];
        if (v === undefined || v.startsWith('--') || values.has(t)) throw new Reject(REASON_MALFORMED);
        values.set(t, v);
        i++;
      } else {
        throw new Reject(REASON_MALFORMED);
      }
    } else {
      positional.push(t);
    }
  }
  return { flags, values, positional };
}

function endpointOf(o: Options): { endpointUrl?: string } {
  const v = o.values.get('--endpoint-url');
  if (v === undefined) return {};
  if (!ENDPOINT_RE.test(v)) throw new Reject(REASON_ARGUMENT);
  return { endpointUrl: v };
}

function bucketOption(o: Options): string {
  const b = o.values.get('--bucket');
  if (b === undefined) throw new Reject(REASON_MALFORMED);
  if (!validBucket(b)) throw new Reject(REASON_ARGUMENT);
  return b;
}

function parseS3(cmd: string, rest: readonly string[]): Action {
  switch (cmd) {
    case 'ls': {
      const o = readOptions(rest, [], ['--endpoint-url']);
      if (o.positional.length > 1) throw new Reject(REASON_MALFORMED);
      const e = endpointOf(o);
      if (o.positional.length === 0) return { kind: 'ls', ...e };
      const u = parseUri(o.positional[0] as string);
      return { kind: 'ls', bucket: u.bucket, ...(u.key === '' ? {} : { prefix: u.key }), ...e };
    }
    case 'mb': {
      const o = readOptions(rest, [], ['--endpoint-url']);
      if (o.positional.length !== 1) throw new Reject(REASON_MALFORMED);
      const u = parseUri(o.positional[0] as string);
      if (u.key !== '') throw new Reject(REASON_ARGUMENT);
      return { kind: 'mb', bucket: u.bucket, ...endpointOf(o) };
    }
    case 'rb': {
      const o = readOptions(rest, ['--force'], ['--endpoint-url']);
      if (o.positional.length !== 1) throw new Reject(REASON_MALFORMED);
      const u = parseUri(o.positional[0] as string);
      if (u.key !== '') throw new Reject(REASON_ARGUMENT);
      return { kind: 'rb', bucket: u.bucket, force: o.flags.has('--force'), ...endpointOf(o) };
    }
    case 'cp': {
      const o = readOptions(rest, [], ['--endpoint-url']);
      if (o.positional.length !== 2) throw new Reject(REASON_MALFORMED);
      const [src, dst] = o.positional as [string, string];
      if (!dst.startsWith('s3://')) throw new Reject(REASON_COMMAND);
      const d = parseUri(dst);
      if (d.key === '' || !validKey(d.key, false)) throw new Reject(REASON_COMMAND);
      const e = endpointOf(o);
      if (src.startsWith('s3://')) {
        const s = parseUri(src);
        if (s.key === '' || !validKey(s.key, false)) throw new Reject(REASON_ARGUMENT);
        return { kind: 'cp', bucket: d.bucket, key: d.key, fromBucket: s.bucket, fromKey: s.key, ...e };
      }
      if (!validKey(src, false)) throw new Reject(REASON_ARGUMENT);
      return { kind: 'cp', bucket: d.bucket, key: d.key, source: src, ...e };
    }
    case 'rm': {
      const o = readOptions(rest, ['--recursive'], ['--endpoint-url']);
      if (o.positional.length !== 1) throw new Reject(REASON_MALFORMED);
      const u = parseUri(o.positional[0] as string);
      const recursive = o.flags.has('--recursive');
      if (!recursive && (u.key === '' || !validKey(u.key, false))) throw new Reject(REASON_ARGUMENT);
      return { kind: 'rm', bucket: u.bucket, key: u.key, recursive, ...endpointOf(o) };
    }
    default:
      throw new Reject(REASON_COMMAND);
  }
}

const BLOCK_FLAGS = ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'];

function parseBlockConfig(text: string): boolean {
  const parts = text.split(',');
  const seen = new Map<string, boolean>();
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) throw new Reject(REASON_ARGUMENT);
    const name = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (!BLOCK_FLAGS.includes(name) || seen.has(name) || (val !== 'true' && val !== 'false')) throw new Reject(REASON_ARGUMENT);
    seen.set(name, val === 'true');
  }
  if (seen.size !== BLOCK_FLAGS.length) throw new Reject(REASON_ARGUMENT);
  return [...seen.values()].every((v) => v);
}

function parseS3Api(cmd: string, rest: readonly string[]): Action {
  switch (cmd) {
    case 'put-bucket-acl': {
      const o = readOptions(rest, [], ['--bucket', '--acl', '--endpoint-url']);
      if (o.positional.length !== 0) throw new Reject(REASON_MALFORMED);
      const bucket = bucketOption(o);
      const acl = o.values.get('--acl');
      if (acl === undefined) throw new Reject(REASON_MALFORMED);
      if (acl !== 'private' && acl !== 'public-read') throw new Reject(REASON_ARGUMENT);
      return { kind: 'put-bucket-acl', bucket, acl: acl as Acl, ...endpointOf(o) };
    }
    case 'put-public-access-block': {
      const o = readOptions(rest, [], ['--bucket', '--public-access-block-configuration', '--endpoint-url']);
      if (o.positional.length !== 0) throw new Reject(REASON_MALFORMED);
      const bucket = bucketOption(o);
      const cfg = o.values.get('--public-access-block-configuration');
      if (cfg === undefined) throw new Reject(REASON_MALFORMED);
      return { kind: 'put-public-access-block', bucket, blocked: parseBlockConfig(cfg), ...endpointOf(o) };
    }
    case 'delete-public-access-block': {
      const o = readOptions(rest, [], ['--bucket', '--endpoint-url']);
      if (o.positional.length !== 0) throw new Reject(REASON_MALFORMED);
      return { kind: 'delete-public-access-block', bucket: bucketOption(o), ...endpointOf(o) };
    }
    default:
      throw new Reject(REASON_COMMAND);
  }
}

/** Total: never throws. Every failure is an `unsupported` action with a fixed reason. */
export function parseLine(line: string): Action {
  try {
    if (typeof line !== 'string') return unsupported('', REASON_ARGUMENT);
    if (line.length > MAX_LINE_LENGTH) return unsupported(line, REASON_TOO_LONG);
    if (!PRINTABLE_RE.test(line)) return unsupported(line, REASON_NON_ASCII);
    if (OPERATOR_RE.test(line)) return unsupported(line, REASON_SHELL_OPERATOR);
    const tokens = line.split(' ').filter((t) => t !== '');
    if (tokens.length === 0) return unsupported(line, REASON_EMPTY);
    if (tokens[0] !== 'aws' || (tokens[1] !== 's3' && tokens[1] !== 's3api') || tokens[2] === undefined) {
      return unsupported(line, REASON_COMMAND);
    }
    const rest = tokens.slice(3);
    return tokens[1] === 's3' ? parseS3(tokens[2], rest) : parseS3Api(tokens[2], rest);
  } catch (e) {
    if (e instanceof Reject) return unsupported(line, e.reason);
    return unsupported(typeof line === 'string' ? line : '', REASON_MALFORMED);
  }
}

/**
 * Host-side recorder collector (Req 10.1 to 10.6).
 *
 * Reads `/ghost-rec` out of the box with `docker cp <container>:/ghost-rec -`, parses the tar
 * stream with a minimal reader, validates every executed step fail-closed, and hands file
 * contents to the parsers. The recorder lives inside the box, so the result always reports
 * `recorder: { location: "in-box", tamperResistant: false }` (Req 10.1).
 *
 * File contract of `/ghost-rec` (flat directory, regular files only):
 *   step-<i>.strace   strace output of action i
 *   steps.jsonl       one closing marker per step: {"end":i,"exit":code,"probe":true}
 *                     `probe` is the recorder-liveness probe result (the wrapper connected
 *                     to its own listeners after the action).
 *   dns.jsonl, http.jsonl, tls.jsonl   listener logs (a missing file means no events).
 *                     http/tls lines may carry `body`, the captured request body in base64.
 *
 * Captured bodies never leave this module as part of a serializable value: they are returned
 * only in `CollectResult.payloads` (in memory), keyed by the `eventId` of exactly one event.
 */
import type { ObservedEvent } from '@ghost-run/core';
import type { DockerClient } from '../docker/cli.js';
import type { CaptureSummary, Diagnostic } from '../result.js';
import { createHash } from 'node:crypto';
import {
  EventBuilder,
  SourcedCollector,
  toObservedEvents,
  type PayloadCaptureMeta,
  type SourcedObservation,
} from './events.js';
import { parseDnsLog, parseHttpLog, parseTlsLog } from './parse-logs.js';
import { parseStrace } from './parse-strace.js';

/** Cap on the total size of `/ghost-rec` (design D1). Exceeding it is `recorder-failure`. */
export const RECORDER_MAX_BYTES = 64 * 1024 * 1024;

const REC_DIR = 'ghost-rec';
const BLOCK = 512;
/** Slack for tar headers and padding on top of the content cap. */
const TAR_OVERHEAD_BYTES = 4 * 1024 * 1024;

export type RecorderFailureReason =
  | 'cp-failed'
  | 'tar-invalid'
  | 'over-cap'
  | 'missing-strace'
  | 'missing-end-marker'
  | 'unparseable'
  | 'probe-failed';

export type TarResult =
  | { readonly ok: true; readonly files: ReadonlyMap<string, Buffer> }
  | { readonly ok: false; readonly reason: 'tar-invalid' | 'over-cap'; readonly detail: string };

export interface TarLimits {
  readonly maxTotalBytes: number;
  readonly maxEntryBytes: number;
}

function cstr(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul < 0 ? len : nul).toString('utf8');
}

function octal(buf: Buffer, start: number, len: number): number | undefined {
  const s = cstr(buf, start, len).trim();
  if (!/^[0-7]+$/.test(s)) return undefined;
  const n = parseInt(s, 8);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Valid flat file name under `ghost-rec/`: one segment, no traversal, not hidden. */
function flatName(full: string): string | undefined {
  if (!full.startsWith(`${REC_DIR}/`)) return undefined;
  const rest = full.slice(REC_DIR.length + 1);
  if (rest === '' || rest.includes('/') || rest.includes('\\') || rest.includes('\0')) return undefined;
  if (rest.startsWith('.') || rest === '..') return undefined;
  return rest;
}

/** Upper bound for one PAX extended header body. */
const MAX_PAX_BYTES = 64 * 1024;

/** Parse PAX records `"<len> <key>=<value>\n"`. Returns undefined when malformed. */
function parsePax(body: Buffer): Map<string, string> | undefined {
  const out = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    if (body[i] === 0) break;
    const sp = body.indexOf(0x20, i);
    if (sp < 0) return undefined;
    const lenText = body.subarray(i, sp).toString('ascii');
    if (!/^[0-9]+$/.test(lenText)) return undefined;
    const len = parseInt(lenText, 10);
    if (len <= sp - i + 1 || i + len > body.length || body[i + len - 1] !== 0x0a) return undefined;
    const rec = body.subarray(sp + 1, i + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (eq <= 0) return undefined;
    out.set(rec.slice(0, eq), rec.slice(eq + 1));
    i += len;
  }
  return out;
}

/**
 * Minimal tar reader (ustar plus local PAX `x` headers; global `g` headers are ignored).
 * Accepts regular files directly under `ghost-rec/` and the `ghost-rec/` directory entry
 * itself. Rejects links, devices, GNU extension headers, nested paths, path traversal,
 * hidden names (including macOS `._*` metadata entries), duplicates, bad checksums,
 * oversized entries, and streams without an end-of-archive marker (truncated).
 */
export function readTar(data: Buffer, limits: TarLimits): TarResult {
  const files = new Map<string, Buffer>();
  const bad = (detail: string): TarResult => ({ ok: false, reason: 'tar-invalid', detail });
  let off = 0;
  let total = 0;
  let pax: Map<string, string> | undefined;
  for (;;) {
    if (off + BLOCK > data.length) return bad('truncated archive');
    const h = data.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) return { ok: true, files };
    // checksum: header bytes with the checksum field read as spaces
    const stored = octal(h, 148, 8);
    if (stored === undefined) return bad('bad checksum field');
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : (h[i] as number);
    if (sum !== stored) return bad('checksum mismatch');

    const prefix = cstr(h, 345, 155);
    const nm = cstr(h, 0, 100);
    const type = String.fromCharCode(h[156] as number);
    const headerSize = octal(h, 124, 12);
    if (headerSize === undefined) return bad('bad size field');
    off += BLOCK;

    if (type === 'x' || type === 'g') {
      if (headerSize > MAX_PAX_BYTES) return bad('oversized extended header');
      const padded = Math.ceil(headerSize / BLOCK) * BLOCK;
      if (off + padded > data.length) return bad('truncated extended header');
      const records = parsePax(data.subarray(off, off + headerSize));
      if (records === undefined) return bad('malformed extended header');
      off += padded;
      if (type === 'x') {
        if (pax !== undefined) return bad('consecutive extended headers');
        pax = records;
      }
      continue;
    }

    const paxPath = pax?.get('path');
    const paxSize = pax?.get('size');
    pax = undefined;
    const full = paxPath ?? (prefix === '' ? nm : `${prefix}/${nm}`);
    let size = headerSize;
    if (paxSize !== undefined) {
      if (!/^[0-9]+$/.test(paxSize)) return bad('bad extended size');
      size = Number(paxSize);
      if (!Number.isSafeInteger(size)) return bad('bad extended size');
    }

    if (type === '5') {
      if (full !== `${REC_DIR}/` && full !== REC_DIR) return bad('unexpected directory entry');
      continue;
    }
    if (type !== '0' && type !== '\0') return bad(`unsupported entry type ${JSON.stringify(type)}`);
    const name = flatName(full);
    if (name === undefined) return bad('rejected entry name');
    if (files.has(name)) return bad('duplicate entry');
    if (size > limits.maxEntryBytes) return { ok: false, reason: 'over-cap', detail: 'oversized entry' };
    total += size;
    if (total > limits.maxTotalBytes) return { ok: false, reason: 'over-cap', detail: 'total size over cap' };
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (off + padded > data.length) return bad('truncated entry');
    files.set(name, Buffer.from(data.subarray(off, off + size)));
    off += padded;
  }
}

export interface CollectOptions {
  /** Number of actions that were executed (steps 0 .. executedSteps-1 must be complete). */
  readonly executedSteps: number;
  /** Per-step action cwd (Copy-relative), index = step. */
  readonly cwds?: readonly (string | undefined)[];
  readonly secretPatterns: readonly string[];
  readonly deadlineAt?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  /**
   * Per-run eventId counter. Pass the same builder for every collect call of one run so ids
   * stay unique (Req 8.14). Default: a fresh builder.
   */
  readonly eventBuilder?: EventBuilder;
}

export interface CollectResult {
  readonly observations: readonly SourcedObservation[];
  readonly events: readonly ObservedEvent[];
  readonly captures: readonly PayloadCaptureMeta[];
  /** Captured bodies keyed by `ObservedEvent.eventId` of exactly one event in `events`. Memory only. */
  readonly payloads: ReadonlyMap<string, Uint8Array>;
  /** Serializable summary of `payloads`: id, byte length and SHA-256 of the stored capture (Req 8.11). */
  readonly payloadCaptures: readonly CaptureSummary[];
  readonly diagnostics: readonly Diagnostic[];
  /** False when any `recorder-failure` was added; the caller then sets `p6Claimed` false and verdict >= warn. */
  readonly recorderOk: boolean;
  readonly recorder: { readonly location: 'in-box'; readonly tamperResistant: false };
}

const RECORDER = { location: 'in-box', tamperResistant: false } as const;

function failure(reason: RecorderFailureReason, stepIndex?: number): Diagnostic {
  return {
    name: 'recorder-failure',
    ...(stepIndex !== undefined ? { stepIndex } : {}),
    detail: { reason },
  };
}

function failed(reason: RecorderFailureReason, extra: Diagnostic[] = []): CollectResult {
  return {
    observations: [],
    events: [],
    captures: [],
    payloads: new Map(),
    payloadCaptures: [],
    diagnostics: [failure(reason), ...extra],
    recorderOk: false,
    recorder: RECORDER,
  };
}

interface Marker {
  readonly exit: number | undefined;
  readonly probe: boolean;
}

/** Parse `steps.jsonl`. Returns markers by step and whether any line was unparseable or duplicated. */
function parseMarkers(text: string): { markers: Map<number, Marker>; bad: boolean } {
  const markers = new Map<number, Marker>();
  let bad = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      bad = true;
      continue;
    }
    const o = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    const end = o?.['end'];
    if (o === undefined || typeof end !== 'number' || !Number.isInteger(end) || end < 0) {
      bad = true;
      continue;
    }
    if (markers.has(end)) {
      bad = true;
      continue;
    }
    const exit = o['exit'];
    markers.set(end, { exit: typeof exit === 'number' ? exit : undefined, probe: o['probe'] === true });
  }
  return { markers, bad };
}

/**
 * Collect and validate the recorder output after the plan (also after a timeout kill; the
 * volume survives the stopped container). Never throws.
 */
export async function collectRecorder(
  client: DockerClient,
  containerId: string,
  opts: CollectOptions,
): Promise<CollectResult> {
  const maxBytes = opts.maxBytes ?? RECORDER_MAX_BYTES;
  const outCap = maxBytes + TAR_OVERHEAD_BYTES;
  const res = await client.run(['cp', `${containerId}:/${REC_DIR}`, '-'], {
    maxOutputBytes: outCap + 1,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.deadlineAt !== undefined ? { deadlineAt: opts.deadlineAt } : {}),
  });
  if (res.spawnError !== undefined || res.timedOut || res.code !== 0) return failed('cp-failed');
  if (res.stdout.length > outCap) return failed('over-cap');

  const tar = readTar(res.stdout, { maxTotalBytes: maxBytes, maxEntryBytes: maxBytes });
  if (!tar.ok) return failed(tar.reason);
  const files = tar.files;
  const text = (name: string): string => files.get(name)?.toString('utf8') ?? '';

  const diagnostics: Diagnostic[] = [];
  const { markers, bad: markersBad } = parseMarkers(text('steps.jsonl'));
  if (markersBad) diagnostics.push(failure('unparseable'));

  const dns = parseDnsLog(text('dns.jsonl'));
  const http = parseHttpLog(text('http.jsonl'));
  const tls = parseTlsLog(text('tls.jsonl'));
  if (dns.invalidLines + http.invalidLines + tls.invalidLines > 0) diagnostics.push(failure('unparseable'));

  const merged = new SourcedCollector();
  const add = (list: readonly SourcedObservation[]): void => {
    for (const o of list) merged.add(o);
  };
  add(dns.observations);
  add(http.observations);
  add(tls.observations);

  for (let i = 0; i < opts.executedSteps; i++) {
    const strace = files.get(`step-${i}.strace`);
    if (strace === undefined) diagnostics.push(failure('missing-strace', i));
    const marker = markers.get(i);
    if (marker === undefined) diagnostics.push(failure('missing-end-marker', i));
    else if (!marker.probe) diagnostics.push(failure('probe-failed', i));
    if (strace !== undefined) {
      const cwd = opts.cwds?.[i];
      add(
        parseStrace(strace.toString('utf8'), {
          stepIndex: i,
          ...(cwd !== undefined ? { cwd } : {}),
          secretPatterns: opts.secretPatterns,
          resolveLoopback: dns.lookup,
        }).observations,
      );
    }
  }

  const observations = merged.observations();
  const built = (opts.eventBuilder ?? new EventBuilder()).build(toObservedEvents(observations), [
    ...http.bodies,
    ...tls.bodies,
  ]);
  const payloadCaptures: CaptureSummary[] = [...built.payloads].map(([eventId, bytes]) => ({
    eventId,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }));
  return {
    observations,
    events: built.events,
    captures: [...http.captures, ...tls.captures],
    payloads: built.payloads,
    payloadCaptures,
    diagnostics,
    recorderOk: diagnostics.length === 0,
    recorder: RECORDER,
  };
}

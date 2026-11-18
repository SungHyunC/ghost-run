// Ward comparison and evaluation.
// Every rule here is monotone: tightening a ward can only add violations,
// never remove them (P4).

import { VERDICT_ORDER } from './types.js';
import { compareCodePoints, utf8Encode } from './judge/bytes.js';
import { extractCanariesDetailed } from './judge/canary.js';
import { normalizePattern } from './judge/glob.js';
import {
  compileAllowHosts,
  hostEntryKey,
  parseDestination,
  redactDestination,
} from './judge/host.js';
import { createInspector, detectKinds, prepareCanaries } from './judge/inspect.js';
import type { EncodingKind, Inspector, PreparedCanary } from './judge/inspect.js';
import { foldPath, normalizePath } from './judge/normalize.js';
import { compilePathSet } from './judge/pathset.js';
import type { PathSet } from './judge/pathset.js';
import { sanitizeText as sanitizeJudgeText } from './judge/sanitize.js';
import type {
  Change,
  EvaluateInputs,
  FileChange,
  GhostReport,
  SqlRowCountChange,
  Verdict,
  Ward,
  WardNotice,
  WardSet,
  WardVerdict,
  WardViolation,
} from './types.js';

// -- isMoreRestrictive -------------------------------------------------------

type Cmp = { tighter: boolean; looser: boolean };

/** Items in `a` that are not in `b`. */
function missingFrom(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(b);
  return a.some((x) => !set.has(x));
}

/** Compare two string sets by containment. `more` = w2 has extra items. */
function setCmp(w1: readonly string[], w2: readonly string[]): Cmp {
  return { tighter: missingFrom(w2, w1), looser: missingFrom(w1, w2) };
}

/** Like `setCmp`, but compares the keys produced by `key` (normalized spelling). */
function keyedCmp(
  w1: readonly string[],
  w2: readonly string[],
  key: (s: string) => string,
): Cmp {
  return setCmp(w1.map(key), w2.map(key));
}

/** `case_sensitive` true -> absent/false is tighter (case-insensitive matches more). */
function caseCmp(a: boolean | undefined, b: boolean | undefined): Cmp {
  const x = a === true;
  const y = b === true;
  return { tighter: x && !y, looser: !x && y };
}

function reverse(c: Cmp): Cmp {
  return { tighter: c.looser, looser: c.tighter };
}

/** Lower value = tighter. */
function lowerIsTighter(v1: number, v2: number): Cmp {
  return { tighter: v2 < v1, looser: v2 > v1 };
}

function merge(...cs: Cmp[]): Cmp {
  return {
    tighter: cs.some((c) => c.tighter),
    looser: cs.some((c) => c.looser),
  };
}

function compareWard(a: Ward, b: Ward): Cmp {
  // Same id but different kind: not comparable, treat as loosening.
  if (a.kind !== b.kind) return { tighter: false, looser: true };
  switch (a.kind) {
    case 'path': {
      const o = b as Extract<Ward, { kind: 'path' }>;
      return merge(
        setCmp(a.deny, o.deny),
        keyedCmp(a.paths, o.paths, normalizePattern),
        caseCmp(a.case_sensitive, o.case_sensitive),
      );
    }
    case 'sql': {
      const o = b as Extract<Ward, { kind: 'sql' }>;
      return merge(
        lowerIsTighter(a.max_rows_lost, o.max_rows_lost),
        keyedCmp(a.tables, o.tables, asciiLower),
      );
    }
    case 'egress': {
      const o = b as Extract<Ward, { kind: 'egress' }>;
      // allow_hosts is reversed: revoking a host is tighter, adding is looser.
      return merge(
        keyedCmp(a.secrets, o.secrets, normalizePattern),
        reverse(keyedCmp(a.allow_hosts, o.allow_hosts, hostEntryKey)),
      );
    }
    case 'physics': {
      const o = b as Extract<Ward, { kind: 'physics' }>;
      return merge(
        lowerIsTighter(o.min_success_rate, a.min_success_rate),
        lowerIsTighter(a.max_contact_force_n, o.max_contact_force_n),
        setCmp(a.forbidden_contacts, o.forbidden_contacts),
      );
    }
  }
}

function hasDuplicateIds(ws: WardSet): boolean {
  return new Set(ws.wards.map((w) => w.id)).size !== ws.wards.length;
}

/**
 * True when `w2` is strictly tighter than `w1`: at least one tightening and no
 * loosening. Wards are paired by id. Comparing a set with itself is false.
 *
 * Sound and incomplete: `true` guarantees no plan's verdict decreases, but the
 * sets are compared by string containment of normalized keys, so some tighter
 * pairs return `false`. Examples: `data/**` versus `data/**` plus `data/x`,
 * `*.example.test` versus `a.example.test`, and a port entry versus a portless
 * entry. Path patterns are not case-folded (the `case_sensitive` flag is
 * compared separately); tables are compared by ASCII lower case.
 */
export function isMoreRestrictive(w1: WardSet, w2: WardSet): boolean {
  // Duplicate ids make pairing ambiguous; refuse to claim a tightening.
  if (hasDuplicateIds(w1) || hasDuplicateIds(w2)) return false;
  const byId1 = new Map(w1.wards.map((w) => [w.id, w]));
  const byId2 = new Map(w2.wards.map((w) => [w.id, w]));
  let tightening = false;
  for (const id of byId1.keys()) {
    if (!byId2.has(id)) return false; // removing a ward loosens
  }
  for (const [id, ward2] of byId2) {
    const ward1 = byId1.get(id);
    if (ward1 === undefined) {
      tightening = true; // adding a ward tightens
      continue;
    }
    const c = compareWard(ward1, ward2);
    if (c.looser) return false;
    if (c.tighter) tightening = true;
  }
  return tightening;
}

// -- WardEngine --------------------------------------------------------------

function isFileChange(c: Change): c is FileChange {
  return (
    (c.kind === 'file-created' ||
      c.kind === 'file-overwritten' ||
      c.kind === 'file-deleted' ||
      c.kind === 'symlink-changed') &&
    typeof c['path'] === 'string'
  );
}

function isSqlRowCountChange(c: Change): c is SqlRowCountChange {
  return (
    c.kind === 'sql-row-count' &&
    typeof c['table'] === 'string' &&
    typeof c['rowsBefore'] === 'number' &&
    Number.isFinite(c['rowsBefore']) &&
    typeof c['rowsAfter'] === 'number' &&
    Number.isFinite(c['rowsAfter'])
  );
}

function fmt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ASCII-only lower-casing (SQL table names). */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

type Violate = (reason: string) => void;

interface StepChange {
  readonly change: Change;
  readonly stepIndex: number;
}

/** Records a change path that leaves the Copy root (first occurrence per sanitized path). */
type OnEscape = (rawPath: string, stepIndex: number) => void;

const MAX_PATH_ESCAPE_NOTICES = 20;

function checkPath(
  w: Extract<Ward, { kind: 'path' }>,
  set: PathSet,
  changes: readonly StepChange[],
  violate: Violate,
  onEscape: OnEscape,
): void {
  const caseSensitive = w.case_sensitive === true;
  // Dedup key -> display path (as written, sanitized) and sort key (normalized path).
  const found = new Map<string, { display: string; sortKey: string; op: 'delete' | 'overwrite' }>();
  for (const { change: c, stepIndex } of changes) {
    if (!isFileChange(c)) continue;
    const op =
      c.kind === 'file-deleted'
        ? 'delete'
        : c.kind === 'file-overwritten' || c.kind === 'symlink-changed'
          ? 'overwrite'
          : null;
    if (op === null || !w.deny.includes(op)) continue;
    const r = set.test(c.path);
    if (r.escapes) onEscape(c.path, stepIndex);
    if (!r.matched) continue;
    const normalized = normalizePath(c.path);
    const key = `${op}\u0000${caseSensitive ? normalized : foldPath(c.path)}`;
    // Spellings of one path share a key (case folding, dot segments). Keep the smallest
    // spelling so the message does not depend on the order of `changes`.
    const display = sanitizeJudgeText(c.path);
    const prev = found.get(key);
    if (
      prev === undefined ||
      compareCodePoints(normalized, prev.sortKey) < 0 ||
      (normalized === prev.sortKey && compareCodePoints(display, prev.display) < 0)
    ) {
      found.set(key, { display, sortKey: normalized, op });
    }
  }
  const sorted = [...found.values()].sort(
    (x, y) =>
      compareCodePoints(x.sortKey, y.sortKey) ||
      (x.op === y.op ? 0 : x.op === 'delete' ? -1 : 1),
  );
  for (const f of sorted) violate(`would ${f.op} protected path ${f.display}`);
}

function checkSql(
  w: Extract<Ward, { kind: 'sql' }>,
  changes: readonly StepChange[],
  violate: Violate,
): void {
  // Lower-case name -> table spelling declared by the ward (first matching entry).
  const declared = new Map<string, string>();
  for (const t of w.tables) {
    const k = asciiLower(t);
    if (!declared.has(k)) declared.set(k, t);
  }
  const lost = new Map<string, number>();
  let total = 0;
  for (const { change: c } of changes) {
    if (!isSqlRowCountChange(c)) continue;
    const key = asciiLower(c.table);
    if (!declared.has(key)) continue;
    const n = Math.max(0, c.dropped === true ? c.rowsBefore : c.rowsBefore - c.rowsAfter);
    if (n === 0) continue;
    lost.set(key, (lost.get(key) ?? 0) + n);
    total += n;
  }
  if (total > w.max_rows_lost) {
    const parts = [...lost.keys()]
      .sort(compareCodePoints)
      .map((k) => `${fmt(lost.get(k) as number)} rows from ${sanitizeJudgeText(declared.get(k) as string)}`);
    const max = w.max_rows_lost > 0 ? ` (max allowed ${fmt(w.max_rows_lost)})` : '';
    violate(`would delete ${parts.join(', ')}${max}`);
  }
}

const MAX_EGRESS_VIOLATIONS = 20;

function checkEgress(
  w: Extract<Ward, { kind: 'egress' }>,
  report: GhostReport<unknown>,
  violate: Violate,
): void {
  const secrets = compilePathSet(w.secrets, { caseSensitive: false });
  let firstRead: number | undefined;
  for (const e of report.observedEvents) {
    if (e.kind !== 'secret-read' || typeof e.path !== 'string') continue;
    if (!secrets.test(e.path).matched) continue;
    if (firstRead === undefined || e.stepIndex < firstRead) firstRead = e.stepIndex;
  }
  if (firstRead === undefined) return;
  const allowed = compileAllowHosts(w.allow_hosts);
  const found: { stepIndex: number; dest: string }[] = [];
  for (const e of report.observedEvents) {
    if (e.kind !== 'network-attempt' || e.stepIndex < firstRead) continue;
    if (allowed.allows(parseDestination(e.destination))) continue;
    found.push({
      stepIndex: e.stepIndex,
      dest: e.destination === undefined ? '(unknown)' : redactDestination(e.destination),
    });
  }
  found.sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.dest, b.dest));
  for (const f of found.slice(0, MAX_EGRESS_VIOLATIONS)) {
    violate(
      `network attempt to ${f.dest} at step ${f.stepIndex} after secret read at step ${firstRead}; host not in allow_hosts`,
    );
  }
  if (found.length > MAX_EGRESS_VIOLATIONS) {
    violate(`${found.length - MAX_EGRESS_VIOLATIONS} more network attempts not listed`);
  }
}

// -- Content inspection ------------------------------------------------------
//
// Size limits on `secretValues` (at most 16 files, at most 65,536 bytes per
// file, diagnostic `secret-values-capped` on overflow) are enforced by
// ghost-runner before evaluate is called. The engine does not re-implement
// that cap; it only bounds per-file Canary counts (see judge/canary.ts) and
// truncates each payload to PAYLOAD_CAP bytes (see judge/inspect.ts).

const MAX_PAYLOAD_HITS = 20;
const REDACTED = '[redacted: contains a secret value]';

interface SecretFile {
  readonly path: string; // normalized, as grouped
  readonly canaries: readonly Uint8Array[];
  readonly discarded: { tooShort: number; tooLong: number; tooMany: number };
}

interface ContentContext {
  readonly files: readonly SecretFile[]; // sorted by path
  readonly payloads: ReadonlyMap<string, Uint8Array>; // valid payloads, sorted by key
  readonly inspector: Inspector | undefined;
  readonly hitCache: Map<string, ReadonlyMap<string, readonly EncodingKind[]>>;
  /** Every Canary of every entry, for the leak guard. */
  readonly allCanaries: readonly Uint8Array[];
  /** True when the caller passed an `inputs` object. */
  readonly provided: boolean;
  readonly notices: WardNotice[];
  readonly noticeKeys: Set<string>;
  failed: boolean;
}

function addContentNotice(
  ctx: ContentContext,
  reason: string,
  stepIndex: number,
  path?: string,
): void {
  const key = `${stepIndex}\u0000${reason}`;
  if (ctx.noticeKeys.has(key)) return;
  ctx.noticeKeys.add(key);
  ctx.notices.push({
    kind: 'content-inspection',
    reason,
    stepIndex,
    ...(path !== undefined ? { path } : {}),
  });
}

function prepareContent(inputs: EvaluateInputs | undefined): ContentContext {
  const ctx: ContentContext = {
    files: [],
    payloads: new Map(),
    inspector: undefined,
    hitCache: new Map(),
    allCanaries: [],
    provided: inputs !== undefined,
    notices: [],
    noticeKeys: new Set(),
    failed: false,
  };
  const grouped = new Map<string, { bytes: Uint8Array[] }>();
  const secretValues = inputs?.secretValues;
  if (secretValues !== undefined) {
    for (const [key, value] of secretValues as ReadonlyMap<unknown, unknown>) {
      if (typeof key !== 'string' || !(value instanceof Uint8Array)) {
        const shown = typeof key === 'string' ? sanitizeJudgeText(key) : '(non-string key)';
        addContentNotice(ctx, `secret value entry ${shown} is malformed and was skipped`, 0);
        continue;
      }
      const norm = normalizePath(key);
      const g = grouped.get(norm);
      if (g === undefined) grouped.set(norm, { bytes: [value] });
      else g.bytes.push(value);
    }
  }
  const files: SecretFile[] = [];
  const all: Uint8Array[] = [];
  for (const path of [...grouped.keys()].sort(compareCodePoints)) {
    const canaries: Uint8Array[] = [];
    const discarded = { tooShort: 0, tooLong: 0, tooMany: 0 };
    for (const bytes of (grouped.get(path) as { bytes: Uint8Array[] }).bytes) {
      const ex = extractCanariesDetailed(path, bytes);
      canaries.push(...ex.candidates);
      discarded.tooShort += ex.discarded.tooShort;
      discarded.tooLong += ex.discarded.tooLong;
      discarded.tooMany += ex.discarded.tooMany;
    }
    all.push(...canaries);
    files.push({ path, canaries, discarded });
  }
  const payloads = new Map<string, Uint8Array>();
  const rawPayloads = inputs?.payloads;
  if (rawPayloads !== undefined) {
    const keys: string[] = [];
    for (const [id, value] of rawPayloads as ReadonlyMap<unknown, unknown>) {
      if (typeof id !== 'string' || !(value instanceof Uint8Array)) {
        const shown = typeof id === 'string' ? sanitizeJudgeText(id) : '(non-string key)';
        addContentNotice(ctx, `payload ${shown} is malformed and was skipped`, 0);
        continue;
      }
      keys.push(id);
    }
    keys.sort(compareCodePoints);
    for (const id of keys) payloads.set(id, (rawPayloads as ReadonlyMap<string, Uint8Array>).get(id) as Uint8Array);
  }
  return {
    ...ctx,
    files,
    payloads,
    inspector: payloads.size > 0 ? createInspector(payloads) : undefined,
    allCanaries: all,
  };
}

function hitsFor(ctx: ContentContext, file: SecretFile): ReadonlyMap<string, readonly EncodingKind[]> {
  const cached = ctx.hitCache.get(file.path);
  if (cached !== undefined) return cached;
  let result: ReadonlyMap<string, readonly EncodingKind[]> = new Map();
  if (ctx.inspector !== undefined && file.canaries.length > 0) {
    try {
      result = ctx.inspector.hits(file.canaries);
    } catch {
      // No message text: it could carry Canary-derived data.
      ctx.failed = true;
      addContentNotice(ctx, 'content inspection failed', 0);
    }
  }
  ctx.hitCache.set(file.path, result);
  return result;
}

function checkContent(
  w: Extract<Ward, { kind: 'egress' }>,
  report: GhostReport<unknown>,
  ctx: ContentContext,
  violate: Violate,
): void {
  const secrets = compilePathSet(w.secrets, { caseSensitive: false });
  const matched = ctx.files.filter((f) => secrets.test(f.path).matched);
  if (matched.length === 0) {
    // Compatibility decision: the notice is raised only when the caller passed `inputs`
    // with no secret values at all. Callers that omit `inputs` (existing behavior) and
    // callers whose secret values simply belong to another ward get no extra notice.
    const noValues = ctx.provided && ctx.files.length === 0;
    const secretRead = report.observedEvents.some(
      (e) => e.kind === 'secret-read' && typeof e.path === 'string' && secrets.test(e.path).matched,
    );
    if (noValues && (secretRead || ctx.payloads.size > 0)) {
      addContentNotice(
        ctx,
        `content inspection did not run for ward ${sanitizeJudgeText(w.id)}: no secret values were provided`,
        0,
      );
    }
    return;
  }
  const hasPayload = ctx.payloads.size > 0;
  const found: { eventId: string; path: string; kinds: readonly EncodingKind[] }[] = [];
  for (const file of matched) {
    if (hasPayload) {
      const d = file.discarded;
      const shown = sanitizeJudgeText(file.path);
      if (d.tooShort > 0) {
        addContentNotice(ctx, `secret file ${shown}: ${d.tooShort} value(s) shorter than 8 bytes were not inspected`, 0, shown);
      }
      if (d.tooLong > 0) {
        addContentNotice(ctx, `secret file ${shown}: ${d.tooLong} value(s) longer than 16,384 bytes were not inspected`, 0, shown);
      }
      if (d.tooMany > 0) {
        addContentNotice(ctx, `secret file ${shown}: ${d.tooMany} value(s) beyond the first 256 were not inspected`, 0, shown);
      }
    }
    for (const [eventId, kinds] of hitsFor(ctx, file)) found.push({ eventId, path: file.path, kinds });
  }
  found.sort((a, b) => compareCodePoints(a.eventId, b.eventId) || compareCodePoints(a.path, b.path));
  for (const f of found.slice(0, MAX_PAYLOAD_HITS)) {
    violate(
      `payload of event ${sanitizeJudgeText(f.eventId)} contains a value from secret file ${sanitizeJudgeText(f.path)} (encoding: ${f.kinds.join(', ')})`,
    );
  }
  if (found.length > MAX_PAYLOAD_HITS) {
    violate(`${found.length - MAX_PAYLOAD_HITS} more payload hits not listed`);
  }
}

/** Replace any string that contains a Canary (in any supported encoding) with a fixed marker. */
function guardString(s: string, canaries: readonly PreparedCanary[]): string {
  if (s.length === 0) return s;
  return detectKinds(utf8Encode(s), canaries).length > 0 ? REDACTED : s;
}

function leakGuard(
  violations: WardViolation[],
  notices: WardNotice[],
  canaries: readonly Uint8Array[],
): { violations: WardViolation[]; notices: WardNotice[] } {
  if (canaries.length === 0) return { violations, notices };
  const prepared = prepareCanaries(canaries);
  const g = (s: string): string => guardString(s, prepared);
  return {
    violations: violations.map((v) => ({ ...v, wardId: g(v.wardId), reason: g(v.reason) })),
    notices: notices.map((n) => ({
      ...n,
      reason: g(n.reason),
      ...(n.destination !== undefined ? { destination: g(n.destination) } : {}),
      ...(n.path !== undefined ? { path: g(n.path) } : {}),
    })),
  };
}

function checkPhysics(
  w: Extract<Ward, { kind: 'physics' }>,
  report: GhostReport<unknown>,
  violate: Violate,
): void {
  const vs = report.variantResults;
  if (vs.length === 0) return;
  const ok = vs.filter((v) => v.success).length;
  const rate = ok / vs.length;
  if (rate < w.min_success_rate) {
    violate(`success rate ${ok}/${vs.length} (${rate.toFixed(2)}) below minimum ${w.min_success_rate}`);
  }
  for (const v of vs) {
    const id = sanitizeJudgeText(v.variantId);
    // Hard failures: block regardless of success rate or ward parameters (monotone, P4-safe).
    if (v.jointLimitExceeded === true) violate(`joint limit exceeded in variant ${id}`);
    if (v.selfCollisionOccurred === true) violate(`self-collision occurred in variant ${id}`);
    if (v.contactForceN !== undefined && v.contactForceN > w.max_contact_force_n) {
      violate(`variant ${id} contact force ${v.contactForceN} N exceeds max ${w.max_contact_force_n} N`);
    }
    if (v.forbiddenContactOccurred === true && w.forbidden_contacts.length > 0) {
      violate(`variant ${id} made forbidden contact (${w.forbidden_contacts.map((c) => sanitizeJudgeText(c)).join(', ')})`);
    }
  }
}

function worse(a: Verdict, b: Verdict): Verdict {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}

/** Warn-level findings that do not depend on the ward set. Ordered per Requirement 17.3. */
function collectNotices(report: GhostReport<unknown>): WardNotice[] {
  const effectNotices: WardNotice[] = [];
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const e of effects) {
      const dest = redactDestination(e.destination);
      effectNotices.push({
        kind: 'effect-outside',
        reason: `step ${stepIndex} has side effect outside the copy: ${sanitizeJudgeText(String(e.kind))} to ${dest}`,
        stepIndex,
        destination: dest,
      });
    }
  });
  const observed = report.observedEvents.map((e) => {
    const destination = e.destination !== undefined ? redactDestination(e.destination) : undefined;
    const path = e.path !== undefined ? sanitizeJudgeText(e.path) : undefined;
    const target = destination ?? path ?? '(unknown)';
    const notice: WardNotice = {
      kind: 'observed-event',
      reason: `observed ${sanitizeJudgeText(String(e.kind))} (${target}) at step ${e.stepIndex}`,
      stepIndex: e.stepIndex,
      ...(destination !== undefined ? { destination } : {}),
      ...(path !== undefined ? { path } : {}),
    };
    return { notice, kind: String(e.kind), target };
  });
  observed.sort(
    (a, b) =>
      a.notice.stepIndex - b.notice.stepIndex ||
      compareCodePoints(a.kind, b.kind) ||
      compareCodePoints(a.target, b.target),
  );
  return [...effectNotices, ...observed.map((o) => o.notice)];
}

export const WardEngine = {
  /**
   * Judge a ghost report. block = any ward violated; warn = out-of-box effect
   * or observed event present (independent of wards); pass otherwise.
   * Warn-level findings are reported as `notices`, not violations.
   */
  evaluate(
    report: GhostReport<unknown>,
    wardSet: WardSet,
    // Content inspection input is held in memory only; it is never retained or serialized.
    inputs?: EvaluateInputs,
  ): WardVerdict {
    const content = prepareContent(inputs);
    const changes: StepChange[] = [];
    report.changes.forEach((step, stepIndex) => {
      for (const change of step) changes.push({ change, stepIndex });
    });
    const violations: WardViolation[] = [];
    const escapes = new Map<string, { path: string; stepIndex: number }>();
    const onEscape: OnEscape = (rawPath, stepIndex) => {
      const path = sanitizeJudgeText(rawPath);
      if (!escapes.has(path)) escapes.set(path, { path, stepIndex });
    };
    for (const w of wardSet.wards) {
      const violate: Violate = (reason) =>
        violations.push({ wardId: w.id, wardKind: w.kind, reason });
      switch (w.kind) {
        case 'path':
          checkPath(
            w,
            compilePathSet(w.paths, { caseSensitive: w.case_sensitive === true }),
            changes,
            violate,
            onEscape,
          );
          break;
        case 'sql':
          checkSql(w, changes, violate);
          break;
        case 'egress':
          checkEgress(w, report, violate);
          checkContent(w, report, content, violate);
          break;
        case 'physics':
          checkPhysics(w, report, violate);
          break;
      }
    }

    const notices = collectNotices(report);
    const escapeNotices: WardNotice[] = [...escapes.values()]
      .map(({ path, stepIndex }) => ({
        kind: 'path-escape' as const,
        reason: `change path escapes the copy root: ${path}`,
        stepIndex,
        path,
      }))
      .sort((a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.reason, b.reason))
      .slice(0, MAX_PATH_ESCAPE_NOTICES);
    notices.push(...escapeNotices);
    // Payloads without a matching observed event (only judged when an egress ward exists).
    if (wardSet.wards.some((w) => w.kind === 'egress')) {
      const ids = new Set<string>();
      for (const e of report.observedEvents) if (e.eventId !== undefined) ids.add(e.eventId);
      for (const id of content.payloads.keys()) {
        if (!ids.has(id)) {
          addContentNotice(content, `payload ${sanitizeJudgeText(id)} has no matching observed event`, 0);
        }
      }
    }
    // Order: effect-outside, observed-event, content-inspection, path-escape.
    const contentNotices = [...content.notices].sort(
      (a, b) => a.stepIndex - b.stepIndex || compareCodePoints(a.reason, b.reason),
    );
    notices.splice(notices.length - escapeNotices.length, 0, ...contentNotices);
    let verdict: Verdict = 'pass';
    if (notices.length > 0) verdict = worse(verdict, 'warn');
    if (violations.length > 0) verdict = worse(verdict, 'block');
    const guarded = leakGuard(violations, notices, content.allCanaries);
    return { verdict, violations: guarded.violations, notices: guarded.notices };
  },
};

// Ward comparison and evaluation.
// NOTE: These are minimal per-kind rules. Detailed rules (glob matching, host
// patterns, per-step ordering, etc.) will be refined in the later wards spec.
// Every rule here is monotone: tightening a ward can only add violations,
// never remove them (P4).

import { VERDICT_ORDER } from './types.js';
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
      return merge(setCmp(a.deny, o.deny), setCmp(a.paths, o.paths));
    }
    case 'sql': {
      const o = b as Extract<Ward, { kind: 'sql' }>;
      return merge(
        lowerIsTighter(a.max_rows_lost, o.max_rows_lost),
        setCmp(a.tables, o.tables),
      );
    }
    case 'egress': {
      const o = b as Extract<Ward, { kind: 'egress' }>;
      // allow_hosts is reversed: revoking a host is tighter, adding is looser.
      return merge(
        setCmp(a.secrets, o.secrets),
        reverse(setCmp(a.allow_hosts, o.allow_hosts)),
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
    typeof c['rowsAfter'] === 'number'
  );
}

/** Exact match, or `path` lies under protected directory `p`. */
function pathMatches(path: string, p: string): boolean {
  const base = p.endsWith('/') ? p.slice(0, -1) : p;
  return path === p || path === base || path.startsWith(base + '/');
}

function fmt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Strip scheme, credentials, port and path; lowercase. */
function hostOf(destination: string | undefined): string {
  if (destination === undefined) return '';
  const noScheme = destination.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = noScheme.split(/[/?#]/)[0] ?? '';
  const noUser = authority.slice(authority.lastIndexOf('@') + 1);
  return noUser.replace(/:\d+$/, '').toLowerCase();
}

type Violate = (reason: string) => void;

function checkPath(
  w: Extract<Ward, { kind: 'path' }>,
  changes: readonly Change[],
  violate: Violate,
): void {
  for (const c of changes) {
    if (!isFileChange(c)) continue;
    const op = c.kind === 'file-deleted' ? 'delete' : c.kind === 'file-overwritten' || c.kind === 'symlink-changed' ? 'overwrite' : null;
    if (op === null || !w.deny.includes(op)) continue;
    if (w.paths.some((p) => pathMatches(c.path, p))) {
      violate(`would ${op} protected path ${c.path}`);
    }
  }
}

function checkSql(
  w: Extract<Ward, { kind: 'sql' }>,
  changes: readonly Change[],
  violate: Violate,
): void {
  const lost = new Map<string, number>();
  let total = 0;
  for (const c of changes) {
    if (!isSqlRowCountChange(c) || !w.tables.includes(c.table)) continue;
    const n = Math.max(0, c.rowsBefore - (c.dropped === true ? 0 : c.rowsAfter));
    if (n === 0) continue;
    lost.set(c.table, (lost.get(c.table) ?? 0) + n);
    total += n;
  }
  if (total > w.max_rows_lost) {
    const parts = [...lost].map(([t, n]) => `${fmt(n)} rows from ${t}`);
    violate(
      `would delete ${parts.join(', ')} (total ${fmt(total)} exceeds max ${fmt(w.max_rows_lost)})`,
    );
  }
}

function checkEgress(
  w: Extract<Ward, { kind: 'egress' }>,
  report: GhostReport<unknown>,
  violate: Violate,
): void {
  const reads = report.observedEvents.filter(
    (e) =>
      e.kind === 'secret-read' &&
      e.path !== undefined &&
      w.secrets.some((s) => pathMatches(e.path as string, s)),
  );
  if (reads.length === 0) return;
  const firstRead = Math.min(...reads.map((e) => e.stepIndex));
  const allowed = new Set(w.allow_hosts.map((h) => h.toLowerCase()));
  for (const e of report.observedEvents) {
    if (e.kind !== 'network-attempt' || e.stepIndex < firstRead) continue;
    const host = hostOf(e.destination);
    if (!allowed.has(host)) {
      violate(
        `network attempt to ${e.destination ?? '(unknown)'} at step ${e.stepIndex} after secret read at step ${firstRead}; host not in allow_hosts`,
      );
    }
  }
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
    if (v.contactForceN !== undefined && v.contactForceN > w.max_contact_force_n) {
      violate(`variant ${v.variantId} contact force ${v.contactForceN} N exceeds max ${w.max_contact_force_n} N`);
    }
    if (v.forbiddenContactOccurred === true && w.forbidden_contacts.length > 0) {
      violate(`variant ${v.variantId} made forbidden contact (${w.forbidden_contacts.join(', ')})`);
    }
  }
}

function worse(a: Verdict, b: Verdict): Verdict {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}

/** Warn-level findings; independent of the ward set. */
function collectNotices(report: GhostReport<unknown>): WardNotice[] {
  const notices: WardNotice[] = [];
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const e of effects) {
      notices.push({
        kind: 'effect-outside',
        reason: `step ${stepIndex} has side effect outside the copy: ${e.kind} to ${e.destination}`,
        stepIndex,
        destination: e.destination,
      });
    }
  });
  for (const e of report.observedEvents) {
    const target = e.destination ?? e.path ?? '(unknown)';
    notices.push({
      kind: 'observed-event',
      reason: `observed ${e.kind} (${target}) at step ${e.stepIndex}`,
      stepIndex: e.stepIndex,
      ...(e.destination !== undefined ? { destination: e.destination } : {}),
      ...(e.path !== undefined ? { path: e.path } : {}),
    });
  }
  return notices;
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
    // Accepted but not inspected yet; never copied into the verdict.
    _inputs?: EvaluateInputs,
  ): WardVerdict {
    const changes = report.changes.flat();
    const violations: WardViolation[] = [];
    for (const w of wardSet.wards) {
      const violate: Violate = (reason) =>
        violations.push({ wardId: w.id, wardKind: w.kind, reason });
      switch (w.kind) {
        case 'path':
          checkPath(w, changes, violate);
          break;
        case 'sql':
          checkSql(w, changes, violate);
          break;
        case 'egress':
          checkEgress(w, report, violate);
          break;
        case 'physics':
          checkPhysics(w, report, violate);
          break;
      }
    }

    const notices = collectNotices(report);
    let verdict: Verdict = 'pass';
    if (notices.length > 0) verdict = worse(verdict, 'warn');
    if (violations.length > 0) verdict = worse(verdict, 'block');
    return { verdict, violations, notices };
  },
};

/**
 * Message builder: renders a WardVerdict as a fixed-template text for the
 * agent. Pure and deterministic: no timestamp, random value, or host text.
 */

import type { Ward, WardVerdict } from '../types.js';
import { sanitizeText } from './sanitize.js';

export interface Claims {
  readonly p5: boolean;
  readonly p6: boolean;
}

export interface RenderContext {
  readonly wardCount: number;
  /** Required on purpose (D14): callers must state which claims hold. */
  readonly claims: Claims;
  readonly seance?: { readonly id: string; readonly base?: string };
}

export const CLAIM_LOWERED_LINE =
  'P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).';

export const SUGGESTIONS: Readonly<Record<Ward['kind'], string>> = {
  path: 'Limit the command to paths the ward does not protect, or back up the protected paths first.',
  sql: 'Try a soft delete or a migration with a backup.',
  egress:
    'Do not send secret files or their contents to hosts outside allow_hosts; remove the network call or use an allowed host.',
  physics: 'Reduce speed or contact force, or change the plan, and rehearse again.',
};

const DEFAULT_BASE = 'http://localhost:5317';
const MAX_MESSAGE = 1200;
const MAX_REASON = 200;
const MAX_BASE = 200;
const MAX_ALSO = 3;

function cpLength(s: string): number {
  return [...s].length;
}

/** S(x): sanitize to at most 120 code points. */
function S(x: string): string {
  return sanitizeText(x, 120);
}

/** R(x): S(x), then at most 200 code points (first 197 plus `...`). */
function R(x: string): string {
  const s = S(x);
  const cps = [...s];
  if (cps.length <= MAX_REASON) return s;
  return `${cps.slice(0, MAX_REASON - 3).join('')}...`;
}

function seanceLink(seance: RenderContext['seance']): string | undefined {
  if (seance === undefined) return undefined;
  const { id } = seance;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return undefined;
  let base = seance.base ?? DEFAULT_BASE;
  if (typeof base !== 'string') return undefined;
  if (base.endsWith('/')) base = base.slice(0, -1);
  if (!/^https?:\/\//.test(base)) return undefined;
  if (cpLength(base) > MAX_BASE) return undefined;
  if (sanitizeText(base, 100000) !== base) return undefined;
  return `${base}/seance/${id}`;
}

function assemble(lines: string[], ctx: RenderContext, link: string | undefined): string {
  const out = [...lines];
  if (!ctx.claims.p5 || !ctx.claims.p6) out.push(CLAIM_LOWERED_LINE);
  if (link !== undefined && out.length > 0) {
    out[out.length - 1] = `${out[out.length - 1]} Seance: ${link}`;
  }
  return out.join('\n');
}

export function renderMessage(verdict: WardVerdict, ctx: RenderContext): string {
  const link = seanceLink(ctx.seance);

  if (verdict.verdict === 'pass') {
    const n = ctx.wardCount;
    const noun = n === 1 ? 'ward' : 'wards';
    return assemble([`GHOST RUN PASSED: all ${n} ${noun} cleared.`], ctx, link);
  }

  if (verdict.verdict === 'warn') {
    const notices = verdict.notices;
    const first = notices.length > 0 ? R(notices[0]!.reason) : '(none)';
    return assemble(
      [
        `GHOST RUN NEEDS HUMAN APPROVAL: ${notices.length} notice(s) outside the copy or needing review. First: ${first}.`,
      ],
      ctx,
      link,
    );
  }

  const violations = verdict.violations;
  if (violations.length === 0) {
    return assemble(['GHOST RUN BLOCKED: no violation details available.'], ctx, link);
  }
  const primary = violations[0]!;
  const line1 = `GHOST RUN BLOCKED by ward ${S(primary.wardId)}: ${R(primary.reason)}. ${SUGGESTIONS[primary.wardKind]}`;
  const also = violations
    .slice(1, 1 + MAX_ALSO)
    .map((v) => `Also violated ward ${S(v.wardId)}: ${R(v.reason)}.`);

  for (let shown = also.length; ; shown--) {
    const lines = [line1, ...also.slice(0, shown)];
    const remaining = violations.length - 1 - shown;
    if (remaining > 0) lines.push(`+${remaining} more violations. See the seance page.`);
    const msg = assemble(lines, ctx, link);
    if (cpLength(msg) <= MAX_MESSAGE || shown === 0) return msg;
  }
}

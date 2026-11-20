// Plan_Record derivation for Ghost Hand. Shared by the adapter and the record script.
// Pure: structural inputs only, no engine import, no I/O.

import type { CheckRow, CopyScene, HandVariantParams, PlanRecord } from '../../data/types';
import { formatForce, formatRate } from '../../engine/format';
import { destinations, extraChips, violatedIds } from './common';
import type { EffectLike, ViolationLike } from './common';
import { tileLabel } from './tile-label';

/** The headline ward: the first `physics` ward of the wards file. */
export interface HandWardLike {
  id: string;
  min_success_rate: number;
  max_contact_force_n: number;
  forbidden_contacts: readonly string[];
}

export interface HandRowLike {
  id: string;
  params: {
    drawerFrictionN: number;
    drawerMassKg: number;
    handleOffsetM: readonly [number, number, number];
    sensorNoiseM: number;
    commandDelaySteps: number;
  };
  drawerDisplacementM: number;
  vaseTouched: boolean;
}

export interface HandVariantResultLike {
  variantId: string;
  success: boolean;
  contactForceN?: number;
  jointLimitExceeded?: boolean;
}

export interface HandRunLike {
  verdict: 'pass' | 'warn' | 'block';
  message: string;
  violations: readonly ViolationLike[];
  p1: { equal: boolean; before: string; after: string };
  /** Base row first, then the variants in index order. */
  rows: readonly HandRowLike[];
  variantResults: readonly HandVariantResultLike[];
}

/** The joint-limit sentence of the physics ward (core/src/wards.ts); the fallback when no structured field exists. */
const JOINT_LIMIT_PATTERN = /joint limit exceeded in variant (variant-[0-9]+)/g;

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** The kind line of the ward card. */
export function handWardLine(): string {
  return 'kind: physics';
}

/** One line that names the three slider values; shown as the plan. */
export function handPlanText(v: { speed: number; force: number; distance: number }): string {
  return `grip ${v.force} N, pull ${v.distance} m at ${v.speed} m/s`;
}

/**
 * The ids of the variants that exceeded a joint limit: the structured field first, the sentence of the
 * ward violation as the fallback. Fails when the sentence names a joint limit and neither source gives an id.
 */
export function jointLimitIds(run: Pick<HandRunLike, 'variantResults' | 'violations'>): string[] {
  const structured = [...new Set(run.variantResults.filter((v) => v.jointLimitExceeded === true).map((v) => v.variantId))].sort();
  const reasons = run.violations.map((v) => v.reason);
  const fromText = [...new Set(reasons.flatMap((r) => [...r.matchAll(JOINT_LIMIT_PATTERN)].map((m) => m[1] ?? '')))].sort();
  const mentions = reasons.some((r) => r.includes('joint limit'));
  const ids = structured.length > 0 ? structured : fromText;
  if (mentions && ids.length === 0) throw new Error('hand: the verdict names a joint limit but no variant id was found');
  if (structured.length > 0 && fromText.length > 0 && structured.join() !== fromText.join()) {
    throw new Error('hand: structured joint-limit variants differ from the verdict text');
  }
  return ids;
}

export interface HandRecordInput {
  commands: readonly string[];
  run: HandRunLike;
  ward: HandWardLike;
  /** Effects outside the copy of each action. */
  effects: readonly (readonly EffectLike[])[];
}

export function handPlanRecord(input: HandRecordInput): PlanRecord {
  const { run, ward } = input;
  const base = run.rows[0];
  if (base === undefined || base.id !== 'base') throw new Error('hand: base row missing');
  const variants = run.rows.slice(1);
  const count = variants.length;
  if (count === 0 || run.variantResults.length !== count) throw new Error('hand: variant count mismatch');

  const jointIds = jointLimitIds(run);

  const tiles = variants.map((row, i) => {
    const result = run.variantResults[i];
    if (result === undefined) throw new Error('hand: variant result missing');
    const [hx, hy, hz] = row.params.handleOffsetM;
    const params: HandVariantParams = {
      drawerFrictionN: row.params.drawerFrictionN,
      drawerMassKg: row.params.drawerMassKg,
      handleOffsetM: [hx, hy, hz],
      sensorNoiseM: row.params.sensorNoiseM,
      commandDelaySteps: row.params.commandDelaySteps,
    };
    return {
      id: row.id,
      label: tileLabel(params),
      outcome: result.success ? ('passed' as const) : ('failed' as const),
      jointLimit: jointIds.includes(row.id),
      params,
    };
  });

  const succeeded = run.variantResults.filter((v) => v.success).length;
  const maxForceN = Math.max(...run.variantResults.map((v) => v.contactForceN ?? 0));
  const vaseVariants = variants.filter((r) => r.vaseTouched).length;

  // Each chip is a cross exactly when the ward has a violation of its kind in this run (the reasons of core/src/wards.ts).
  const reasons = run.violations.filter((v) => v.wardId === ward.id).map((v) => v.reason);
  const has = (pattern: RegExp): boolean => reasons.some((r) => pattern.test(r));
  const rateViolated = has(/^success rate /);
  const forceViolated = has(/contact force .* exceeds max/);
  const contactViolated = has(/made forbidden contact/);
  const jointOrSelf = has(/^joint limit exceeded|^self-collision occurred/);
  const checks: CheckRow[] = [
    {
      label: `success, at least ${Math.round(ward.min_success_rate * 100)}%`,
      measured: formatRate(succeeded, count),
      ok: !rateViolated,
    },
    {
      label: `contact force, at most ${ward.max_contact_force_n} N`,
      measured: formatForce(maxForceN),
      ok: !forceViolated,
    },
    {
      label: `never touch the ${ward.forbidden_contacts.join(', ')}`,
      measured: contactViolated ? 'touched' : 'untouched',
      ok: !contactViolated,
    },
  ];
  // A violation that no chip above stands for (a joint limit or a self-collision) is the ward's own chip.
  if (jointOrSelf) {
    const n = jointIds.length;
    checks.push({
      label: ward.id,
      measured: n > 0 ? `joint limit exceeded in ${n} of ${count} variants` : 'self-collision in a variant',
      ok: false,
    });
  }
  for (const chip of extraChips(run.violations, ward.id)) checks.push({ label: chip.wardId, measured: chip.text, ok: false });

  const copyAfter: CopyScene = { kind: 'hand', tiles };
  return {
    commands: [...input.commands],
    display: input.commands.join(' && '),
    verdict: run.verdict,
    violatedWardIds: violatedIds(run.violations),
    checks,
    effectsOutside: destinations(input.effects, []),
    p1: { equal: run.p1.equal, before: run.p1.before, after: run.p1.after },
    copyAfter,
    facts: {
      drawerOpeningM: round(base.drawerDisplacementM, 4),
      jointLimitVariants: jointIds.join(','),
      maxForceN: round(maxForceN, 2),
      succeeded,
      total: count,
      vaseTouched: vaseVariants,
    },
    message: run.message,
  };
}

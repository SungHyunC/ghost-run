// Req 8.1 to 8.11, 9.3, 9.6, 9.8, 9.9, 10.1 to 10.3: the pure run pipeline (plan to GhostRun).
// Reads no clock, random source, or environment variable. Ward rules, thresholds, and message
// text come from core, the world package, and texts.ts.
import { ghostRun, renderMessage, WardEngine } from '@ghost-run/core';
import type { Snapshot, WardVerdict } from '@ghost-run/core';
import { BASE_VARIANT_PARAMS, concatFrames, foldMonitors, sampleVariant, STATIC_LAYOUT, validateAction, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandState, RunMonitors, VariantJob } from '@ghost-run/drawer-arm';
import { messageContextFor } from '../capabilities';
import { P1_FAILURE_TEXT } from '../texts';
import { buildIsolationClaims } from './claims';
import { deriveVariantResult } from './derive';
import { buildNotices } from './notices';
import { buildRows } from './rows';
import type { BaseRowSource } from './rows';
import type { GhostHandVariantResult, GhostRun, OverlayInput, RunInput } from './types';
import { findUnknownContacts, forbiddenContactUnion } from './unknown-contacts';
import { applyVerdictFloor } from './verdict';

export class GhostHandRunError extends Error {
  readonly code: 'invalid-plan';
  readonly field: string;
  constructor(code: 'invalid-plan', field: string, message: string) {
    super(message);
    this.name = 'GhostHandRunError';
    this.code = code;
    this.field = field;
  }
}

const FRAMES_PER_SECOND = 1 / (WORLD_CONFIG.timeStepS * WORLD_CONFIG.frameStrideSteps);

function hashOf(fp: string | { readonly hash: string }): string {
  return typeof fp === 'string' ? fp : fp.hash;
}

function smallestMaxForce(input: RunInput): number | undefined {
  let out: number | undefined;
  for (const w of input.wardSet.wards) {
    if (w.kind === 'physics' && (out === undefined || w.max_contact_force_n < out)) out = w.max_contact_force_n;
  }
  return out;
}

export async function runGhostHand(input: RunInput): Promise<GhostRun> {
  const { plan, wardSet, world, executor, variantConfig, seed, variantCount } = input;
  const caps = input.evidence.capabilities;

  // 1. Validate before any engine call.
  plan.forEach((a, i) => {
    const check = validateAction(a);
    if (!check.ok) {
      throw new GhostHandRunError('invalid-plan', `actions[${i}]`, `invalid action at index ${i}: ${check.error}`);
    }
  });

  // 2 and 3. Fingerprint, one snapshot, the base ghost run.
  const before = hashOf(await world.fingerprint());
  const start = await world.snapshot();
  const baseReport = await ghostRun(world, start, plan);
  const snaps = baseReport.snapshots as readonly Snapshot<GhostHandState>[];

  // Copy what the base run provides before the traces are released.
  const failedSteps: number[] = [];
  const failures: { base: RunMonitors; partial: RunMonitors }[] = [];
  const baseFrameParts: Float32Array[] = [];
  let bodyCount = 0;
  for (let i = 1; i < snaps.length; i += 1) {
    const snap = snaps[i] as Snapshot<GhostHandState>;
    const prev = snaps[i - 1] as Snapshot<GhostHandState>;
    if (!snap.result.success) {
      failedSteps.push(i - 1);
      failures.push({ base: prev.state.monitors, partial: world.failureMonitors(snap.id) ?? snap.state.monitors });
    }
    const trace = world.frames(snap.id);
    if (trace !== undefined) {
      baseFrameParts.push(trace.poses);
      bodyCount = trace.bodyCount;
    }
  }
  const last = snaps[snaps.length - 1] as Snapshot<GhostHandState>;
  const baseSource: BaseRowSource = {
    params: BASE_VARIANT_PARAMS,
    finalDrawerM: drawerOf(last.state),
    monitors: foldMonitors(last.state.monitors, failures),
    failedSteps,
  };
  const baseFrames = concatFrames(baseFrameParts);
  world.releaseTraces(snaps.map((s) => s.id));

  // 4. One job per index, executed by the executor.
  const jobs: VariantJob[] = [];
  for (let i = 0; i < variantCount; i += 1) {
    jobs.push({
      index: i,
      params: sampleVariant(seed, i, variantConfig),
      startState: start.state,
      actions: plan,
      recordFrames: true,
    });
  }
  const outcomes = await executor.run(jobs);

  // 5. Fingerprint after.
  const after = hashOf(await world.fingerprint());
  const p1 = { before, after, equal: before === after };

  // 6 and 7. Variant results in ascending index order, then the engine verdict.
  const forbidden = forbiddenContactUnion(wardSet);
  const ordered = jobs.map((j) => outcomes[j.index] ?? outcomes[0]!);
  const variantResults: GhostHandVariantResult[] = ordered.map((o) => deriveVariantResult(o, forbidden, caps));
  const report = { ...baseReport, variantResults };
  const engineVerdict = WardEngine.evaluate(report, wardSet);

  // 8. The P1 floor.
  const wardVerdict: WardVerdict = applyVerdictFloor(engineVerdict, p1.equal);

  // 9. The message.
  const message = p1.equal
    ? messageFor(wardVerdict, wardSet.wards.length, input)
    : P1_FAILURE_TEXT;

  // 10. Rows, claims, overlay, notices, unknown contacts.
  const baseResult = deriveVariantResult({ index: 0, ...baseSource, firstTouch: {}, trajectoryHash: '' }, forbidden, caps);
  const rows = buildRows(baseSource, baseResult, ordered, variantResults, smallestMaxForce(input));
  const overlay: OverlayInput = {
    variants: ordered.map((o, i) => ({
      id: `variant-${o.index}`,
      result: variantResults[i] as GhostHandVariantResult,
      frames: o.frames ?? new Float32Array(0),
    })),
    base: { frames: baseFrames },
    bodyCount,
    framesPerSecond: FRAMES_PER_SECOND,
  };

  return {
    engineVerdict,
    wardVerdict,
    verdict: wardVerdict.verdict,
    message,
    claims: buildIsolationClaims(p1.equal, caps),
    p1,
    rows,
    variantResults,
    baseChanges: baseReport.changes.flat(),
    overlay,
    notices: buildNotices(caps, wardSet),
    unknownContactNames: findUnknownContacts(wardSet, WORLD_CONFIG.contactNames),
    needles: [],
    links: [],
  };
}

function messageFor(verdict: WardVerdict, wardCount: number, input: RunInput): string {
  const ctx = messageContextFor(input.evidence.capabilities, wardCount);
  return renderMessage(verdict, ctx);
}

function drawerOf(state: GhostHandState): number {
  return state.integration[STATIC_LAYOUT.qpos.offset + STATIC_LAYOUT.drawerQposIndex] ?? 0;
}

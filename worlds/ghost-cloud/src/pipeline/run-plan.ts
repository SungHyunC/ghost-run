import { WardEngine, ghostRun, renderMessage, sanitizeJudgeText } from '@ghost-run/core';
import type { Claims, GhostReport, Scene, Snapshot, Verdict, WardSet, WardVerdict } from '@ghost-run/core';
import { parseLine } from '../parse.js';
import { renderScene } from '../scene.js';
import { createFixture } from '../fixture.js';
import { MAX_LINE_LENGTH, MAX_PLAN_LINES } from '../types.js';
import type { Action, ActionKind } from '../types.js';
import { createGhostCloudWorld } from '../world.js';
import type { GhostCloudWorld } from '../world.js';
import { INTERNAL_ERROR_MESSAGE, P1_FAILED_TEXT } from './texts.js';
import { buildShownVerdict } from './verdict.js';

export interface PlanLine {
  /** 0-based, same as stepIndex. */
  readonly index: number;
  readonly line: string;
  readonly kind: ActionKind;
  readonly unsupported: boolean;
  readonly result: { readonly ok: true } | { readonly ok: false; readonly error: string };
}

export interface P1Check {
  readonly equal: boolean;
  /** Fingerprint hash of Reality before the ghost run (hash only, no manifest). */
  readonly before: string;
  /** Fingerprint hash of Reality after the ghost run (hash only, no manifest). */
  readonly after: string;
}

export interface GhostCloudRun {
  readonly report: GhostReport<Scene>;
  readonly engineVerdict: WardVerdict;
  readonly wardVerdict: WardVerdict;
  readonly verdict: Verdict;
  readonly message: string;
  readonly p1: P1Check;
  readonly lines: readonly PlanLine[];
  readonly scenes: { readonly before: Scene; readonly after: Scene };
  readonly unsupportedSteps: readonly number[];
  readonly truncatedLines: number;
}

export interface RunPlanOptions {
  /** Tests inject a broken world; the default is a fresh world from the fixed fixture. */
  readonly worldFactory?: () => GhostCloudWorld;
}

function internalErrorRun(): GhostCloudRun {
  const verdict: WardVerdict = { verdict: 'block', violations: [], notices: [] };
  let scene: Scene;
  try {
    scene = renderScene(createFixture());
  } catch {
    scene = { world: 'ghost-cloud', buckets: [] };
  }
  return {
    report: { snapshots: [], changes: [], effectsOutside: [], observedEvents: [], variantResults: [] },
    engineVerdict: verdict,
    wardVerdict: verdict,
    verdict: 'block',
    message: INTERNAL_ERROR_MESSAGE,
    p1: { equal: false, before: '', after: '' },
    lines: [],
    scenes: { before: scene, after: scene },
    unsupportedSteps: [],
    truncatedLines: 0,
  };
}

/**
 * Runs a plan of AWS CLI lines on a fresh world and judges it with the wards.
 * Never throws. Returns plain data only (survives a JSON round trip).
 */
export async function runGhostCloudPlan(
  plan: readonly string[],
  wardSet: WardSet,
  options?: RunPlanOptions,
): Promise<GhostCloudRun> {
  try {
    const rawLines = Array.isArray(plan) ? plan.map((l) => String(l)) : [];
    const kept = rawLines.slice(0, MAX_PLAN_LINES);
    const truncatedLines = rawLines.length - kept.length;
    const actions: Action[] = kept.map((l) => parseLine(l));
    const unsupportedSteps: number[] = [];
    actions.forEach((a, i) => {
      if (a.kind === 'unsupported') unsupportedSteps.push(i);
    });

    const world = options?.worldFactory !== undefined ? options.worldFactory() : createGhostCloudWorld();
    const fpBefore = await world.fingerprint();
    const start = await world.snapshot();
    const raw = await ghostRun(world, start, actions);
    const fpAfter = await world.fingerprint();
    const p1: P1Check = { equal: fpBefore.hash === fpAfter.hash, before: fpBefore.hash, after: fpAfter.hash };
    const p1Failed = !p1.equal;

    const engineVerdict = WardEngine.evaluate(raw, wardSet);
    const wardVerdict = buildShownVerdict(engineVerdict, p1Failed, unsupportedSteps, truncatedLines, MAX_PLAN_LINES);

    const lowered = unsupportedSteps.length > 0 || truncatedLines > 0;
    let claims: Claims | undefined;
    if (lowered) claims = { p5: false, p6: false, reason: 'unsupported-step' };
    else if (p1Failed) claims = { p5: false, p6: false };
    let message = renderMessage(wardVerdict, {
      wardCount: wardSet.wards.length,
      ...(claims !== undefined ? { claims } : {}),
    });
    if (p1Failed) message = `${message}\n${P1_FAILED_TEXT}`;

    const snapshots: Snapshot<Scene>[] = raw.snapshots.map((s) => ({
      id: s.id,
      state: world.render(s),
      result: s.result,
    }));
    const report: GhostReport<Scene> = { ...raw, snapshots };

    const lines: PlanLine[] = kept.map((line, i) => {
      const action = actions[i] as Action;
      const res = (raw.snapshots[i + 1] as Snapshot<unknown>).result;
      return {
        index: i,
        line: sanitizeJudgeText(line, MAX_LINE_LENGTH),
        kind: action.kind,
        unsupported: action.kind === 'unsupported',
        result: res.success ? { ok: true } : { ok: false, error: sanitizeJudgeText(res.error, 300) },
      };
    });

    const first = snapshots[0] as Snapshot<Scene>;
    const last = snapshots[snapshots.length - 1] as Snapshot<Scene>;
    const run: GhostCloudRun = {
      report,
      engineVerdict,
      wardVerdict,
      verdict: wardVerdict.verdict,
      message,
      p1,
      lines,
      scenes: { before: first.state, after: last.state },
      unsupportedSteps,
      truncatedLines,
    };
    return run;
  } catch {
    return internalErrorRun();
  }
}

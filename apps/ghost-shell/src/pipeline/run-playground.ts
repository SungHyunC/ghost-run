import { WardEngine, collectNeedles, ghostRun, renderMessage, traceRedThread } from '@ghost-run/core';
import type {
  GhostReport,
  Needle,
  ProvenanceLog,
  Scene,
  Snapshot,
  ThreadLink,
  Verdict,
  WardSet,
  WardVerdict,
} from '@ghost-run/core';
import { createPlaygroundWorld } from '@ghost-run/playground-shell';
import type { PlaygroundAction, SqlExecutor, VirtualProject } from '@ghost-run/playground-shell';
import type { IsolationClaims } from '../ui-imports';
import { deriveClaims } from './claims';
import type { P2Note } from './claims';
import { makeRedactor } from './redact';
import { readSecretValues } from './secrets';
import { toStepViews, unsupportedStepIndexes } from './steps';
import type { StepView } from './steps';
import { buildShownVerdict } from './verdict';

export interface RunInput {
  readonly project: VirtualProject;
  readonly plan: readonly PlaygroundAction[];
  readonly wardSet: WardSet;
  readonly provenance?: ProvenanceLog;
  readonly sql: SqlExecutor;
  /** Tests inject a broken world; the app uses the default. */
  readonly worldFactory?: typeof createPlaygroundWorld;
}

export interface PlaygroundRun {
  readonly report: GhostReport<Scene>;
  readonly engineVerdict: WardVerdict;
  readonly wardVerdict: WardVerdict;
  readonly verdict: Verdict;
  readonly message: string;
  readonly claims: IsolationClaims;
  readonly steps: readonly StepView[];
  readonly unsupportedSteps: readonly number[];
  readonly watchdogFired: boolean;
  readonly p1Failed: boolean;
  readonly needles: readonly Needle[];
  readonly links: readonly ThreadLink[];
  readonly p2Note: P2Note;
}

/** Name used by the design and the requirements. */
export type Playground_Run = PlaygroundRun;

/**
 * Runs a plan in a fresh playground world and judges it with the wards (design, "Run pipeline").
 * Reads no clock, random source, or storage. Rethrows when the world or the engine throws.
 * The returned value holds plain data only: no file bytes, no secret copies, no payloads.
 */
export async function runPlayground(input: RunInput): Promise<PlaygroundRun> {
  const { project, plan, wardSet, provenance, sql } = input;
  const factory = input.worldFactory ?? createPlaygroundWorld;

  const secretPatterns: string[] = [];
  for (const ward of wardSet.wards) {
    if (ward.kind === 'egress') secretPatterns.push(...ward.secrets);
  }
  const world = factory(project, { secretPatterns, sql });

  const fpBefore = await world.fingerprint();
  const start = await world.snapshot();
  const secrets = readSecretValues(start.state.entries, secretPatterns);
  try {
    const raw = await ghostRun(world, start, plan);
    const last = raw.snapshots[raw.snapshots.length - 1];
    const trace = last === undefined ? undefined : world.traceOf(last.id);
    if (trace === undefined) throw new Error('trace missing for the last snapshot');
    const observed: GhostReport<unknown> = { ...raw, observedEvents: trace.events };
    const fpAfter = await world.fingerprint();
    const p1Failed = fpBefore.hash !== fpAfter.hash;

    const engineVerdict = WardEngine.evaluate(observed, wardSet, {
      secretValues: secrets.values,
      payloads: trace.payloads,
    });

    // Decision (Property 18; Requirements 3.7, 7.8, 8.3, 17.7, 19.6, 20.3): the run must hold no secret
    // value, so secret values and their base64, hex, and percent-encoded forms are replaced in the step
    // output with a fixed placeholder. This must happen before `secrets.release()` zero-fills the bytes.
    const redact = makeRedactor(secrets.values.values());
    const steps = toStepViews(trace.steps).map((s) => ({
      ...s,
      stdout: redact(s.stdout),
      stderr: redact(s.stderr),
    }));
    const unsupportedSteps = unsupportedStepIndexes(steps);
    const watchdogFired = trace.watchdogFired;
    const { claims, p2Note } = deriveClaims({
      p1Failed,
      unsupportedSteps,
      watchdogFired,
      readCoverage: trace.readCoverage,
    });
    const wardVerdict = buildShownVerdict(engineVerdict, p1Failed, steps);
    const message = renderMessage(wardVerdict, {
      wardCount: wardSet.wards.length,
      claims: {
        p5: claims.p5Claimed,
        p6: claims.p6Claimed,
        ...(unsupportedSteps.length > 0 ? { reason: 'unsupported-step' as const } : {}),
      },
    });

    let needles: Needle[] = [];
    let links: ThreadLink[] = [];
    if (provenance !== undefined) {
      needles = collectNeedles(observed);
      links = traceRedThread(provenance, needles);
    }

    const snapshots: Snapshot<Scene>[] = raw.snapshots.map((s) => ({
      id: s.id,
      state: world.render(s),
      result: s.result,
    }));
    const report: GhostReport<Scene> = { ...raw, snapshots, observedEvents: trace.events };

    return {
      report,
      engineVerdict,
      wardVerdict,
      verdict: wardVerdict.verdict,
      message,
      claims,
      steps,
      unsupportedSteps,
      watchdogFired,
      p1Failed,
      needles,
      links,
      p2Note,
    };
  } finally {
    secrets.release();
  }
}

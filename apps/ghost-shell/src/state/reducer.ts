// Page-level reducer: a pure function plus a description of the effects the shell must perform.
// It reads no clock, starts no timer, runs no world, and touches no storage or network.
// The shell injects the clock (`recordedAt` on `runFinished`), the timers (through the wards editor
// effects), the file reading (`loadPlanFile` carries the text), and the download (an effect).
import { sanitizeText, scanText } from '@ghost-run/core';
import type { ProvenanceLog, ScanResult, WardSet } from '@ghost-run/core';
import type { PlaygroundAction } from '@ghost-run/playground-shell';
import type { Playground_Run } from '../pipeline/run-playground';
import { parsePlanFile } from '../plan/plan-file';
import type { PlanFile } from '../plan/plan-file';
import { printPlanFile } from '../plan/print-plan-file';
import { validateCommand } from '../plan/validate-command';
import { SCENARIOS } from '../scenarios/scenarios';
import type { PlanOrigin, Scenario } from '../scenarios/scenarios';
import { buildReadme } from '../scenarios/readme';
import { EMPTY_PLAN_TEXT, RUN_FAILED_TEXT } from '../texts';
import { escapeForDisplay } from '../ui-imports';
import type { BlacklightSource } from '../ui-imports';
import { wardsEditorReducer, initialWardsEditorState } from '../wards/wards-editor';
import type { WardsEditorEffect, WardsEditorEvent, WardsEditorState } from '../wards/wards-editor';
import { graveyardReducer, initialGraveyardState } from './graveyard';
import type { GraveyardState, PossessionDetail } from './graveyard';

/** Name of the neutral project fixture (Scenario 4) that every plan starts from. */
export const PROJECT_NAME = 'playground-demo';
export const MANUAL_PLAN_NAME = 'Manual plan';
export const PLAN_DOWNLOAD_FILE_NAME = 'ghost-run-plan.json';
const NAME_MAX = 80;

export type ScenarioId = Scenario['id'];
export type Selection = ScenarioId | 'custom';

export interface PlanMeta {
  readonly name: string;
  readonly origin: PlanOrigin;
  readonly note?: string;
  readonly projectName: string;
}

/** A pending explicit run: what the plan and the sources were when the user asked. */
export interface PendingRun {
  readonly requestId: number;
  readonly plan: readonly PlaygroundAction[];
  readonly sources: readonly BlacklightSource[];
}

export interface PageState {
  readonly selected: Selection;
  readonly plan: readonly PlaygroundAction[];
  readonly meta: PlanMeta;
  readonly provenance: ProvenanceLog | undefined;
  /** README text of the in-memory fixture copy; replaced by `Purify`. */
  readonly readme: string;
  readonly purified: boolean;
  readonly wards: WardsEditorState;
  /** The last WardSet that parsed; used by explicit runs while the wards text has errors. */
  readonly wardSet: WardSet | undefined;
  readonly run: Playground_Run | undefined;
  readonly graveyard: GraveyardState;
  readonly seanceId: string | undefined;
  /** A fixed notice text (empty plan, run failure, a rejected command); never user text. */
  readonly notice: string | undefined;
  /** Escaped `<field>: [<code>] <message>` strings of the last failed `Load plan file`. */
  readonly planErrors: readonly string[];
  readonly requestSeq: number;
  readonly pending: PendingRun | undefined;
}

export type PageAction =
  | { readonly type: 'selectScenario'; readonly id: ScenarioId }
  | { readonly type: 'runGhost' }
  | { readonly type: 'applyFixedPlan' }
  | { readonly type: 'addToPlan'; readonly command: string; readonly cwd?: string }
  | { readonly type: 'removeStep'; readonly index: number }
  | { readonly type: 'clearPlan' }
  | { readonly type: 'loadPlanFile'; readonly text: string }
  | { readonly type: 'downloadPlanFile' }
  | { readonly type: 'purify' }
  | { readonly type: 'wards'; readonly event: WardsEditorEvent }
  | { readonly type: 'openSeance'; readonly id: string }
  | { readonly type: 'closeSeance' }
  | { readonly type: 'dismissNotice' }
  | {
      readonly type: 'runFinished';
      readonly origin: 'explicit' | 'edit';
      readonly requestId: number;
      readonly run: Playground_Run;
      /** From the injected clock, formatted YYYY-MM-DDTHH:MM:SSZ. Read only for an explicit run. */
      readonly recordedAt: string;
    }
  | { readonly type: 'runFailed'; readonly origin: 'explicit' | 'edit'; readonly requestId: number };

export interface RunRequest {
  readonly origin: 'explicit' | 'edit';
  readonly requestId: number;
  readonly plan: readonly PlaygroundAction[];
  readonly wardSet: WardSet;
  readonly provenance: ProvenanceLog | undefined;
  /** README text to place in the fixture copy before the run. */
  readonly readme: string;
}

export type PageEffect =
  | { readonly type: 'cancelDebounce' }
  | { readonly type: 'scheduleDebounce'; readonly ms: number }
  | { readonly type: 'runPlayground'; readonly request: RunRequest }
  | { readonly type: 'downloadPlan'; readonly fileName: string; readonly text: string };

export interface PageStep {
  readonly state: PageState;
  readonly effects: readonly PageEffect[];
}

export function initialPageState(wardsText?: string): PageState {
  const wards = initialWardsEditorState(wardsText);
  return {
    selected: 'custom',
    plan: [],
    meta: { name: MANUAL_PLAN_NAME, origin: 'scripted', projectName: PROJECT_NAME },
    provenance: undefined,
    readme: buildReadme(),
    purified: false,
    wards,
    wardSet: wards.parsed.ok ? wards.parsed.wardSet : undefined,
    run: undefined,
    graveyard: initialGraveyardState,
    seanceId: undefined,
    notice: undefined,
    planErrors: [],
    requestSeq: 0,
    pending: undefined,
  };
}

/** Blacklight sources of the current provenance, with a fresh scan of each text. */
export function blacklightSources(state: PageState): readonly BlacklightSource[] {
  return (state.provenance ?? []).map((r) => ({ source: r.source, text: r.content, scan: scanText(r.content) }));
}

/** Re-scan of the fixture README copy (after `Purify` it holds no finding). */
export function scanReadme(state: PageState): ScanResult {
  return scanText(state.readme);
}

function sameState(state: PageState, patch: Partial<PageState>): PageState {
  return { ...state, ...patch };
}

function scenarioById(id: ScenarioId): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

function withScenarioPlan(state: PageState, s: Scenario, plan: readonly PlaygroundAction[]): PageState {
  return sameState(state, {
    selected: s.id,
    plan,
    meta: { name: s.title, origin: s.origin, projectName: PROJECT_NAME },
    provenance: s.provenance,
    readme: buildReadme(),
    purified: false,
    run: undefined,
    notice: undefined,
    planErrors: [],
    seanceId: undefined,
    pending: undefined,
  });
}

/** After a manual edit the plan no longer is the scenario's plan. */
function edited(state: PageState, plan: readonly PlaygroundAction[]): PageState {
  return sameState(state, {
    selected: 'custom',
    plan,
    notice: undefined,
    planErrors: [],
  });
}

function startRun(state: PageState): PageStep {
  if (state.plan.length === 0) {
    return { state: sameState(state, { notice: EMPTY_PLAN_TEXT, planErrors: [] }), effects: [] };
  }
  if (state.wardSet === undefined) {
    return { state: sameState(state, { notice: RUN_FAILED_TEXT }), effects: [] };
  }
  const requestId = state.requestSeq + 1;
  const pending: PendingRun = { requestId, plan: state.plan, sources: blacklightSources(state) };
  const request: RunRequest = {
    origin: 'explicit',
    requestId,
    plan: state.plan,
    wardSet: state.wardSet,
    provenance: state.provenance,
    readme: state.readme,
  };
  return {
    state: sameState(state, { requestSeq: requestId, pending, notice: undefined, planErrors: [] }),
    effects: [{ type: 'runPlayground', request }],
  };
}

function planFileOf(state: PageState): PlanFile {
  const name = [...state.meta.name].slice(0, NAME_MAX).join('');
  return {
    format: 'ghost-run-plan',
    version: 1,
    name: name.length === 0 ? MANUAL_PLAN_NAME : name,
    origin: state.meta.origin,
    actions: state.plan,
    ...(state.meta.note === undefined ? {} : { note: state.meta.note }),
    ...(state.provenance === undefined ? {} : { provenance: state.provenance }),
  };
}

function readingsToProvenance(readings: readonly string[], readme: string): ProvenanceLog | string {
  const out: { source: string; kind: 'file'; content: string }[] = [];
  for (const source of readings) {
    if (source !== 'README.md') return `readings: [out-of-range] no fixture text for reading ${source}`;
    out.push({ source, kind: 'file', content: readme });
  }
  return out;
}

function mapWardsEffects(
  state: PageState,
  effects: readonly WardsEditorEffect[],
): { effects: PageEffect[] } {
  const out: PageEffect[] = [];
  for (const e of effects) {
    if (e.type === 'cancelDebounce') out.push(e);
    else if (e.type === 'scheduleDebounce') out.push(e);
    // An edit-caused re-run needs a plan and a run that is already shown (Requirement 16).
    else if (state.plan.length > 0 && state.run !== undefined) {
      out.push({
        type: 'runPlayground',
        request: {
          origin: 'edit',
          requestId: e.runId,
          plan: state.plan,
          wardSet: e.wardSet,
          provenance: state.provenance,
          readme: state.readme,
        },
      });
    }
  }
  return { effects: out };
}

function wardsStep(state: PageState, event: WardsEditorEvent): PageStep {
  const step = wardsEditorReducer(state.wards, event);
  const wardSet = step.state.parsed.ok ? step.state.parsed.wardSet : state.wardSet;
  const next = sameState(state, { wards: step.state, wardSet });
  return { state: next, effects: mapWardsEffects(next, step.effects).effects };
}

function finishRun(
  state: PageState,
  a: Extract<PageAction, { type: 'runFinished' }>,
): PageStep {
  if (a.origin === 'edit') {
    // Only the latest wards run applies; an edit-caused run never adds a Grave_Entry.
    if (a.requestId !== state.wards.runId) return { state, effects: [] };
    const w = wardsEditorReducer(state.wards, { type: 'runFinished', runId: a.requestId, run: a.run });
    return { state: sameState(state, { wards: w.state, run: a.run, notice: undefined }), effects: [] };
  }
  const pending = state.pending;
  if (pending === undefined || pending.requestId !== a.requestId) return { state, effects: [] };
  const possession: PossessionDetail | undefined =
    pending.sources.length > 0 ? { sources: pending.sources, needles: a.run.needles, links: a.run.links } : undefined;
  const graveyard = graveyardReducer(state.graveyard, {
    type: 'add',
    run: a.run,
    plan: pending.plan,
    recordedAt: a.recordedAt,
    origin: 'explicit',
    ...(possession === undefined ? {} : { possession }),
  });
  const wards = { ...state.wards, shown: a.run };
  return {
    state: sameState(state, { run: a.run, graveyard, wards, pending: undefined, notice: undefined }),
    effects: [],
  };
}

export function pageReducer(state: PageState, action: PageAction): PageStep {
  switch (action.type) {
    case 'selectScenario': {
      const s = scenarioById(action.id);
      return { state: s === undefined ? state : withScenarioPlan(state, s, s.plan), effects: [] };
    }
    case 'runGhost':
      return startRun(state);
    case 'applyFixedPlan': {
      const s = state.selected === 'custom' ? undefined : scenarioById(state.selected);
      if (s?.fixedPlan === undefined) return { state, effects: [] };
      const loaded = withScenarioPlan(state, s, s.fixedPlan);
      // Keep the current run on screen until the fixed plan finishes.
      return startRun(sameState(loaded, { run: state.run, purified: state.purified, readme: state.readme }));
    }
    case 'addToPlan': {
      const problem = validateCommand(action.command, state.plan.length);
      if (problem !== undefined) return { state: sameState(state, { notice: problem, planErrors: [] }), effects: [] };
      const step: PlaygroundAction =
        action.cwd === undefined ? { command: action.command } : { command: action.command, cwd: action.cwd };
      return { state: edited(state, [...state.plan, step]), effects: [] };
    }
    case 'removeStep': {
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.plan.length) {
        return { state, effects: [] };
      }
      return { state: edited(state, state.plan.filter((_, i) => i !== action.index)), effects: [] };
    }
    case 'clearPlan':
      return { state: edited(state, []), effects: [] };
    case 'loadPlanFile': {
      const r = parsePlanFile(action.text);
      if (!r.ok) {
        // The previous plan stays.
        const planErrors = r.errors.map((e) => escapeForDisplay(`${e.field}: [${e.code}] ${e.message}`));
        return { state: sameState(state, { planErrors, notice: undefined }), effects: [] };
      }
      const { plan } = r;
      let provenance: ProvenanceLog | undefined = plan.provenance;
      if (plan.readings !== undefined) {
        const built = readingsToProvenance(plan.readings, buildReadme());
        if (typeof built === 'string') {
          return { state: sameState(state, { planErrors: [escapeForDisplay(built)], notice: undefined }), effects: [] };
        }
        provenance = built;
      }
      const meta: PlanMeta = {
        name: plan.name,
        origin: plan.origin,
        projectName: PROJECT_NAME,
        ...(plan.note === undefined ? {} : { note: plan.note }),
      };
      return {
        state: sameState(state, {
          selected: 'custom',
          plan: plan.actions,
          meta,
          provenance,
          readme: buildReadme(),
          purified: false,
          run: undefined,
          notice: undefined,
          planErrors: [],
          seanceId: undefined,
          pending: undefined,
        }),
        effects: [],
      };
    }
    case 'downloadPlanFile': {
      if (state.plan.length === 0) {
        return { state: sameState(state, { notice: EMPTY_PLAN_TEXT, planErrors: [] }), effects: [] };
      }
      return {
        state,
        effects: [{ type: 'downloadPlan', fileName: PLAN_DOWNLOAD_FILE_NAME, text: printPlanFile(planFileOf(state)) }],
      };
    }
    case 'purify': {
      // In-memory only: no run, no file, no Graveyard change.
      const readme = sanitizeText(state.readme);
      const provenance = state.provenance?.map((r) => ({ ...r, content: sanitizeText(r.content) }));
      return { state: sameState(state, { readme, provenance, purified: true }), effects: [] };
    }
    case 'wards':
      return wardsStep(state, action.event);
    case 'openSeance':
      return { state: sameState(state, { seanceId: action.id }), effects: [] };
    case 'closeSeance':
      return { state: sameState(state, { seanceId: undefined }), effects: [] };
    case 'dismissNotice':
      return { state: sameState(state, { notice: undefined, planErrors: [] }), effects: [] };
    case 'runFinished':
      return finishRun(state, action);
    case 'runFailed': {
      // A thrown run keeps the previous run and adds no Grave_Entry.
      if (action.origin === 'explicit') {
        if (state.pending?.requestId !== action.requestId) return { state, effects: [] };
        return { state: sameState(state, { notice: RUN_FAILED_TEXT, pending: undefined }), effects: [] };
      }
      if (action.requestId !== state.wards.runId) return { state, effects: [] };
      return { state: sameState(state, { notice: RUN_FAILED_TEXT }), effects: [] };
    }
  }
}

// Ghost Hand screen shell (design "Screen composition"). A pure reducer plus React components.
// The shell takes an injected `clock` and is the only place that reads time (Requirement 14.6).
// No storage, no network call, no sound, no external origin.
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { parseWards } from '@ghost-run/wards-config';
import { parseVariantConfig, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { Candle, Graveyard, KitRoot, SeanceView, escapeForDisplay as esc } from '@ghost-run/ui';
import type { WardSet } from '@ghost-run/core';
import { formatConfigError } from '@ghost-run/wards-config';
import { ClaimsPanel } from './components/ClaimsPanel';
import { GhostLineup } from './components/GhostLineup';
import { GhostMark } from './components/GhostMark';
import { OverlayView } from './components/OverlayView';
import type { CreateOverlay } from './components/OverlayView';
import { PlanPanel } from './components/PlanPanel';
import { ReferencePanel } from './components/ReferencePanel';
import { ScenarioRail } from './components/ScenarioRail';
import { VariantTable } from './components/VariantTable';
import { probeCapabilities } from './capabilities';
import type { VariantExecutor } from './exec/executor';
import { buildNotices } from './pipeline/notices';
import { buildIsolationClaims } from './pipeline/claims';
import { runGhostHand, GhostHandRunError } from './pipeline/run';
import type { GhostRun, OverlayInput } from './pipeline/types';
import { findUnknownContacts } from './pipeline/unknown-contacts';
import { parsePlanFile, printPlanFile } from './plan/plan-file';
import type { PlanFile } from './plan/plan-file';
import { FIRST_SCENARIO, REVISED_SCENARIO, SCENARIOS } from './plan/scenarios';
import { diffsMatch, drawerDisplacementOf, p2CheckLines, referenceOverlayInput } from './reference';
import { INITIAL_STATE, canExecuteReference, reducer } from './reducer';
import { runSelfCheck } from './self-check';
import type { SelfCheckResult } from './self-check';
import { parseSeedInput } from './inputs';
import { ENGINE_START_FAILURE_TEXT, GRAVEYARD_DROP_TEXT, MESSAGE_PANEL_LABEL, P2_TEXT_ENABLED } from './texts';
import {
  APP_BRAND,
  APP_TAGLINE,
  APP_TITLE,
  FAILED_SUMMARY_NOTE,
  FOOTER_TEXT,
  HERO_EYEBROW,
  HOME_LINK_TEXT,
  HERO_LEAD,
  HERO_POINTS,
  INSPECT_HEADING,
  INSPECT_INTRO,
  NO_GHOSTS_TEXT,
  RESULT_HEADING,
  STEP_INSPECT_LABEL,
  STEP_RESULT_LABEL,
  TOOLS_INTRO,
  TOOLS_LABEL,
  failedSummaryText,
  DEMO_STEP_DONE,
  DEMO_STEP_RUN_FIRST,
  DEMO_STEP_RUN_REVISED,
  DEMO_STEP_REVISED_NOT_PASS,
  DEMO_STEP_SHOW_BLOCK,
  DEMO_STEP_STOPPED,
  ENGINE_STARTING_TEXT,
  GRAVEYARD_HEADING,
  REFERENCE_FAILED_PREFIX,
  RUN_FAILED_PREFIX,
  SECURE_CONTEXT_TEXT,
  liveRegionText,
} from './ui-text';

export interface AppServices {
  /** The only source of time. */
  readonly clock: () => Date;
  /** Makes a world with its own engine. */
  readonly createWorld: (opts?: { readonly recordFrames?: boolean }) => Promise<GhostHandWorld>;
  /** Variant executor over `createWorld` (a worker pool in a browser, inline otherwise). */
  readonly createExecutor: () => VariantExecutor;
  readonly createOverlay: CreateOverlay;
  /** Offers text as a file download made in the page; no network call. */
  readonly download: (fileName: string, text: string) => void;
  readonly wardsText: string;
  readonly variantConfigText: string;
  /** Golden_Hash of the reference plan (hex), or undefined when none is recorded. */
  readonly goldenHash?: string;
  /** Default: reads `prefers-reduced-motion` from `matchMedia`. */
  readonly prefersReducedMotion?: () => boolean;
  /** Pause after the first plan's block during `Play demo`, in ms (default 1500; 0 for tests). */
  readonly demoPauseMs?: number;
}

const DEMO_PAUSE_MS = 1500;

type EngineState =
  | { readonly status: 'starting' }
  | { readonly status: 'ready'; readonly world: GhostHandWorld; readonly executor: VariantExecutor }
  | { readonly status: 'failed' }
  | { readonly status: 'insecure' };

const PLAN_DOWNLOAD_NAME = 'ghost-hand.plan.json';

function readReducedMotion(services: AppServices): boolean {
  if (services.prefersReducedMotion !== undefined) return services.prefersReducedMotion();
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotion(services: AppServices): boolean {
  const [reduced, setReduced] = useState(() => readReducedMotion(services));
  useEffect(() => {
    if (services.prefersReducedMotion !== undefined || typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => {
      setReduced(query.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [services]);
  return reduced;
}

const CANDLE_STATE = { pass: 'lit', warn: 'flickering', block: 'out' } as const;

export function App({ services }: { readonly services: AppServices }) {
  return (
    <KitRoot initialTheme="dark">
      <Screen services={services} />
    </KitRoot>
  );
}

function Screen({ services }: { readonly services: AppServices }) {
  const tableId = useId();
  const caps = useMemo(() => probeCapabilities(), []);
  const wards = useMemo(() => parseWards(services.wardsText), [services.wardsText]);
  const variantConfig = useMemo(() => parseVariantConfig(services.variantConfigText), [services.variantConfigText]);
  const wardSet: WardSet | null = wards.ok ? wards.wardSet : null;

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...INITIAL_STATE,
    seed: variantConfig.ok ? variantConfig.config.defaultSeed : INITIAL_STATE.seed,
  }));
  const [engine, setEngine] = useState<EngineState>({ status: 'starting' });
  const [selfCheck, setSelfCheck] = useState<SelfCheckResult>({ state: 'pending' });
  const [seedText, setSeedText] = useState(String(state.seed));
  const [runError, setRunError] = useState<string | null>(null);
  const [referenceOverlay, setReferenceOverlay] = useState<OverlayInput | null>(null);
  const reducedMotion = useReducedMotion(services);
  const selfCheckRef = useRef(selfCheck);
  selfCheckRef.current = selfCheck;

  // Start the engine once. A missing crypto.subtle (no secure context) runs nothing.
  useEffect(() => {
    if (globalThis.crypto?.subtle === undefined) {
      setEngine({ status: 'insecure' });
      return undefined;
    }
    let live = true;
    let created: { world: GhostHandWorld; executor: VariantExecutor } | null = null;
    void services.createWorld({ recordFrames: true }).then(
      (world) => {
        const executor = services.createExecutor();
        if (!live) {
          executor.dispose();
          world.dispose();
          return;
        }
        created = { world, executor };
        setEngine({ status: 'ready', world, executor });
        void runSelfCheck(() => services.createWorld(), services.goldenHash).then(
          (result) => {
            if (live) setSelfCheck(result);
          },
          () => {
            if (live) setSelfCheck({ state: 'failed', reason: 'engine-error' });
          },
        );
      },
      () => {
        if (live) setEngine({ status: 'failed' });
      },
    );
    return () => {
      live = false;
      created?.executor.dispose();
      created?.world.dispose();
    };
  }, [services]);

  const seedResult = parseSeedInput(seedText);
  const onSeedText = useCallback((text: string) => {
    setSeedText(text);
    const r = parseSeedInput(text);
    if (r.ok) dispatch({ type: 'seed-changed', seed: r.seed });
  }, []);

  const onLoadText = useCallback((text: string) => {
    const parsed = parsePlanFile(text);
    if (parsed.ok) dispatch({ type: 'plan-loaded', plan: parsed.plan });
    else dispatch({ type: 'plan-error', errors: parsed.errors });
  }, []);

  const configReady = wardSet !== null && variantConfig.ok;
  const canRun =
    engine.status === 'ready' && configReady && state.plan !== null && seedResult.ok && !state.running;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Runs `plan` (already loaded into the reducer) and returns the run, or null when it could not finish. */
  const runPlan = useCallback(
    async (plan: PlanFile): Promise<GhostRun | null> => {
      if (engine.status !== 'ready' || wardSet === null || !variantConfig.ok || !seedResult.ok) return null;
      const { world, executor } = engine;
      setRunError(null);
      setReferenceOverlay(null);
      dispatch({ type: 'run-started', explicit: true });
      try {
        const run = await runGhostHand({
          plan: plan.actions,
          wardSet,
          variantConfig: variantConfig.config,
          seed: seedResult.seed,
          variantCount: variantConfig.config.defaultCount,
          world,
          executor,
          evidence: { selfCheck: selfCheckRef.current, capabilities: caps },
          planOrigin: plan.origin,
        });
        if (mounted.current) dispatch({ type: 'run-finished', run, nowMs: services.clock().getTime() });
        return run;
      } catch (error: unknown) {
        const text = error instanceof GhostHandRunError || error instanceof Error ? error.message : String(error);
        if (mounted.current) {
          setRunError(RUN_FAILED_PREFIX + text);
          dispatch({ type: 'run-aborted' });
        }
        return null;
      }
    },
    [engine, wardSet, variantConfig, seedResult, caps, services],
  );

  const onRun = useCallback(() => {
    if (state.plan !== null) void runPlan(state.plan);
  }, [state.plan, runPlan]);

  const onLoadScenario = useCallback((id: string) => {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (scenario !== undefined) dispatch({ type: 'plan-loaded', plan: scenario.plan });
  }, []);

  const [demoStatus, setDemoStatus] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const onPlayDemo = useCallback(() => {
    if (!configReady || engine.status !== 'ready') return;
    const pause = services.demoPauseMs ?? DEMO_PAUSE_MS;
    const wait = (): Promise<void> =>
      pause <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, pause));
    setDemoActive(true);
    void (async () => {
      try {
        dispatch({ type: 'plan-loaded', plan: FIRST_SCENARIO.plan });
        setDemoStatus(DEMO_STEP_RUN_FIRST);
        const first = await runPlan(FIRST_SCENARIO.plan);
        if (first === null) {
          setDemoStatus(DEMO_STEP_STOPPED);
          return;
        }
        setDemoStatus(DEMO_STEP_SHOW_BLOCK);
        await wait();
        if (!mounted.current) return;
        dispatch({ type: 'plan-loaded', plan: REVISED_SCENARIO.plan });
        setDemoStatus(DEMO_STEP_RUN_REVISED);
        const second = await runPlan(REVISED_SCENARIO.plan);
        setDemoStatus(second === null ? DEMO_STEP_STOPPED : second.verdict === 'pass' ? DEMO_STEP_DONE : DEMO_STEP_REVISED_NOT_PASS);
      } finally {
        if (mounted.current) setDemoActive(false);
      }
    })();
  }, [configReady, engine, runPlan, services]);

  const [referenceDrawerM, setReferenceDrawerM] = useState<number | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const onExecuteReference = useCallback(() => {
    if (engine.status !== 'ready' || state.plan === null || state.lastRun === null || !canExecuteReference(state)) {
      return;
    }
    const { world } = engine;
    const base = state.lastRun.baseChanges;
    setReferenceBusy(true);
    setRunError(null);
    void world
      .referenceExecute(state.plan.actions)
      .then(
        (result) => {
          if (!mounted.current) return;
          setReferenceDrawerM(drawerDisplacementOf(result.final));
          setReferenceOverlay(referenceOverlayInput(result));
          dispatch({ type: 'reference-executed', p2Match: diffsMatch(base, result.changes) });
        },
        (error: unknown) => {
          const text = error instanceof Error ? error.message : String(error);
          if (mounted.current) setRunError(REFERENCE_FAILED_PREFIX + text);
        },
      )
      .finally(() => {
        if (mounted.current) setReferenceBusy(false);
      });
  }, [engine, state]);

  const onResetReference = useCallback(() => {
    if (engine.status !== 'ready') return;
    setReferenceBusy(true);
    void engine.world
      .resetReference()
      .then(
        () => {
          if (!mounted.current) return;
          setReferenceDrawerM(null);
          setReferenceOverlay(null);
          dispatch({ type: 'reference-reset' });
        },
        (error: unknown) => {
          const text = error instanceof Error ? error.message : String(error);
          if (mounted.current) setRunError(REFERENCE_FAILED_PREFIX + text);
        },
      )
      .finally(() => {
        if (mounted.current) setReferenceBusy(false);
      });
  }, [engine]);

  const notices = useMemo(() => (wardSet === null ? [] : buildNotices(caps, wardSet)), [caps, wardSet]);
  const unknownContacts = useMemo(
    () => (wardSet === null ? [] : findUnknownContacts(wardSet, WORLD_CONFIG.contactNames)),
    [wardSet],
  );

  const run = state.lastRun;
  const claims = run?.claims ?? buildIsolationClaims(false, caps);
  const failedCount = run === null ? 0 : run.rows.slice(1).filter((r) => r.status === 'failed').length;
  const variantTotal = run === null ? 0 : run.rows.length - 1;
  const open = state.openGraveId === null ? undefined : state.graveyard.find((e) => e.id === state.openGraveId);

  const forceLimitN = useMemo(() => {
    if (wardSet === null) return null;
    const limits = wardSet.wards.flatMap((w) => (w.kind === 'physics' ? [w.max_contact_force_n] : []));
    return limits.length === 0 ? null : Math.min(...limits);
  }, [wardSet]);
  const selectedScenarioId = SCENARIOS.find((s) => s.plan === state.plan)?.id ?? null;
  const planSeed = { text: seedText, error: seedResult.ok ? null : seedResult.error, onChange: onSeedText };
  const canPlayDemo = engine.status === 'ready' && configReady && seedResult.ok;

  return (
    <main className="gh-page" aria-label={APP_TITLE}>
      <header className="gh-hero">
        <p className="gh-brand">
          <GhostMark className="gh-brand-mark" />
          <span className="gh-brand-name">{APP_BRAND}</span>
          <span className="gh-brand-sep" aria-hidden="true">
            /
          </span>
          <span className="gh-brand-app">{APP_TITLE}</span>
        </p>
        <div className="gh-hero-grid">
          <div>
            <p className="gh-hero-tags">
              <span className="gh-eyebrow">{HERO_EYEBROW}</span>
              <a className="gh-home-link" href="../">
                {HOME_LINK_TEXT}
              </a>
            </p>
            <h1>{APP_TITLE}</h1>
            <p className="gh-tagline">{APP_TAGLINE}</p>
          </div>
          <div>
            <p className="gh-lead">{HERO_LEAD}</p>
            <ul className="gh-points">
              {HERO_POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      <div role="status" aria-live="polite" className="gk-sr-only">
        {run === null ? '' : liveRegionText(CANDLE_STATE[run.verdict], failedCount, variantTotal)}
      </div>

      {engine.status === 'starting' ? <p role="status">{ENGINE_STARTING_TEXT}</p> : null}
      {engine.status === 'failed' ? (
        <p role="alert" className="gh-error">
          <span aria-hidden="true">{'\u2715 '}</span>
          {ENGINE_START_FAILURE_TEXT}
        </p>
      ) : null}
      {engine.status === 'insecure' ? (
        <p role="alert" className="gh-error">
          <span aria-hidden="true">{'\u2715 '}</span>
          {SECURE_CONTEXT_TEXT}
        </p>
      ) : null}
      {!wards.ok ? (
        <ul role="alert" className="gh-errors gh-mono">
          {wards.errors.map((e, i) => (
            <li key={i}>
              <span aria-hidden="true">{'\u2715 '}</span>
              {esc(formatConfigError(e))}
            </li>
          ))}
        </ul>
      ) : null}
      {!variantConfig.ok ? (
        <ul role="alert" className="gh-errors gh-mono">
          {variantConfig.errors.map((e, i) => (
            <li key={i}>
              <span aria-hidden="true">{'\u2715 '}</span>
              {esc(`${e.field}: [${e.code}] ${e.message}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {runError !== null ? (
        <p role="alert" className="gh-error gh-mono">
          <span aria-hidden="true">{'\u2715 '}</span>
          {esc(runError)}
        </p>
      ) : null}

      <div className="gh-theater">
        <ScenarioRail
          scenarios={SCENARIOS}
          selectedId={selectedScenarioId}
          onLoadScenario={onLoadScenario}
          onPlayDemo={onPlayDemo}
          canPlayDemo={canPlayDemo}
          demoActive={demoActive}
          demoStatus={demoStatus}
          canRun={canRun}
          busy={state.running}
          onRun={onRun}
          seed={planSeed}
        />
        <OverlayView
          input={referenceOverlay ?? run?.overlay ?? null}
          tableId={tableId}
          createOverlay={services.createOverlay}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="gh-block gh-result" data-verdict={run?.verdict ?? 'none'}>
        <div className="gh-block-head">
          <p className="gh-step">{STEP_RESULT_LABEL}</p>
          <h2 className="gh-block-title">{RESULT_HEADING}</h2>
        </div>
        <div className="gh-verdict-row">
          <Candle verdict={run?.wardVerdict} claims={claims} />
          <div className="gh-summary" data-failed={failedCount > 0}>
            {run === null ? (
              <p className="gh-summary-empty">{NO_GHOSTS_TEXT}</p>
            ) : (
              <>
                <p className="gh-summary-big">{failedSummaryText(failedCount, variantTotal)}</p>
                <p className="gh-summary-note">{FAILED_SUMMARY_NOTE}</p>
              </>
            )}
          </div>
          <section className="gk-section gh-message-panel" aria-label={MESSAGE_PANEL_LABEL}>
            <h2 className="gk-heading">{MESSAGE_PANEL_LABEL}</h2>
            {run === null ? null : <pre className="gh-message gh-mono">{esc(run.message, { keepNewline: true })}</pre>}
          </section>
        </div>
        <GhostLineup rows={run?.rows ?? []} targetOpeningM={WORLD_CONFIG.targetOpeningM} forceLimitN={forceLimitN} />
        <VariantTable id={tableId} rows={run?.rows ?? []} />
      </div>

      <div className="gh-block">
        <div className="gh-block-head">
          <p className="gh-step">{STEP_INSPECT_LABEL}</p>
          <h2 className="gh-block-title">{INSPECT_HEADING}</h2>
          <p className="gh-intro">{INSPECT_INTRO}</p>
        </div>
        <div className="gh-two">
          <ReferencePanel
            canExecute={engine.status === 'ready' && canExecuteReference(state) && !referenceBusy && !demoActive}
            canReset={engine.status === 'ready' && referenceDrawerM !== null && !referenceBusy && !state.running}
            displacementM={referenceDrawerM}
            p2Lines={referenceDrawerM === null ? null : p2CheckLines(P2_TEXT_ENABLED, selfCheck, state.p2Match)}
            onExecute={onExecuteReference}
            onReset={onResetReference}
          />
          <ClaimsPanel
            notices={notices}
            unknownContactNames={unknownContacts}
            selfCheck={selfCheck}
            p1Failed={run !== null && !run.p1.equal}
          />
        </div>
      </div>

      <div className="gh-block">
        <div className="gh-block-head">
          <p className="gh-step">{TOOLS_LABEL}</p>
          <p className="gh-intro">{TOOLS_INTRO}</p>
        </div>
        <PlanPanel
          part="details"
          plan={state.plan}
          errors={state.planError}
          seed={planSeed}
          canRun={canRun}
          busy={state.running}
          onLoadText={onLoadText}
          onDownload={() => {
            if (state.plan !== null) services.download(PLAN_DOWNLOAD_NAME, printPlanFile(state.plan));
          }}
          onRun={onRun}
          onClear={() => {
            dispatch({ type: 'plan-cleared' });
          }}
          scenarios={SCENARIOS}
          onLoadScenario={onLoadScenario}
          onPlayDemo={onPlayDemo}
          canPlayDemo={canPlayDemo}
          demoActive={demoActive}
          demoStatus={demoStatus}
        />
      </div>

      <section aria-label={GRAVEYARD_HEADING} className="gh-graveyard">
        {open !== undefined ? (
          <SeanceView
            entry={open}
            onBack={() => {
              dispatch({ type: 'grave-closed' });
            }}
          />
        ) : (
          <>
            {state.graveDropped ? <p role="status">{GRAVEYARD_DROP_TEXT}</p> : null}
            <Graveyard
              entries={state.graveyard}
              onOpenSeance={(id) => {
                dispatch({ type: 'grave-opened', id });
              }}
            />
          </>
        )}
      </section>

      <footer className="gh-footer">
        <GhostMark className="gh-footer-mark" />
        <span>{FOOTER_TEXT}</span>
      </footer>
    </main>
  );
}

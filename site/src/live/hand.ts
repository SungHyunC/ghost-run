// Ghost Hand adapter: runs a slider plan through the app pipeline against a fresh reference world.
// The world, the executor, and the capabilities are services; the page supplies the Worker-backed ones.

import type { WardSet } from '@ghost-run/core';
import { parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import { parseWards } from '@ghost-run/wards-config';
import { probeCapabilities } from '../../../apps/ghost-hand/src/capabilities';
import type { Capabilities } from '../../../apps/ghost-hand/src/capabilities';
import type { VariantExecutor } from '../../../apps/ghost-hand/src/exec/executor';
import { GhostHandRunError, runGhostHand } from '../../../apps/ghost-hand/src/pipeline/run';
import type { Scheduler } from '../engine/scheduler';
import { defaultScheduler } from '../engine/scheduler';
import type { WorldRecord } from '../data/types';
import { handPlanRecord, handPlanText, handWardLine } from './derive/hand';
import type { HandWardLike } from './derive/hand';
import { buildHandPlan } from './hand-plan';
import { HAND_TIMEOUT_MS } from './hand-protocol';
import { normalizeSliders } from './input';
import type { LiveAnswer, LiveEngine, LiveInput } from './types';

/** The capability probe of the app, for the record script and the tests. */
export function handCapabilities(): Capabilities {
  return probeCapabilities();
}

/** The in-process executor of the app, for the record script and the tests (the page uses Workers). */
export { createInlineExecutor as createHandInlineExecutor } from '../../../apps/ghost-hand/src/exec/inline';

export const HAND_SEED = 42;
export const HAND_VARIANTS = 8;
export { HAND_TIMEOUT_MS };

export interface HandEngineServices {
  /** The reference world; the adapter asks for `recordFrames: true`, as the record script does. */
  createWorld(options: { recordFrames: boolean }): Promise<GhostHandWorld>;
  createExecutor(): VariantExecutor;
  wardsText: string;
  variantConfigText: string;
  capabilities: Capabilities;
  scheduler?: Scheduler;
}

type Parsed =
  | { ok: true; wardSet: WardSet; ward: HandWardLike; variantConfig: VariantConfig }
  | { ok: false };

function parseServices(wardsText: string, variantConfigText: string): Parsed {
  const wards = parseWards(wardsText);
  if (!wards.ok) return { ok: false };
  const physics = wards.wardSet.wards.find((w) => w.kind === 'physics');
  if (physics === undefined || physics.kind !== 'physics') return { ok: false };
  const cfg = parseVariantConfig(variantConfigText);
  if (!cfg.ok) return { ok: false };
  return {
    ok: true,
    wardSet: wards.wardSet,
    variantConfig: cfg.config,
    ward: {
      id: physics.id,
      min_success_rate: physics.min_success_rate,
      max_contact_force_n: physics.max_contact_force_n,
      forbidden_contacts: physics.forbidden_contacts,
    },
  };
}

const TIMEOUT = Symbol('timeout');

export function createHandEngine(services: HandEngineServices): LiveEngine {
  const parsed = parseServices(services.wardsText, services.variantConfigText);
  const scheduler = services.scheduler ?? defaultScheduler;
  let chain: Promise<unknown> = Promise.resolve();
  let disposed = false;
  const live = new Set<() => void>();

  async function runOnce(input: LiveInput): Promise<LiveAnswer> {
    if (input.world !== 'hand' || !parsed.ok) return { status: 'failed', cause: 'internal' };
    if (disposed) return { status: 'failed', cause: 'run' };
    const norm = normalizeSliders({ speed: input.speed, force: input.force, distance: input.distance });
    if (!norm.ok) return { status: 'rejected', problem: 'out-of-range' };
    const built = buildHandPlan(norm.values);
    if (!built.ok) return { status: 'unsupported', reason: built.error, stepIndexes: [] };

    let world: GhostHandWorld | undefined;
    let executor: VariantExecutor | undefined;
    let timerId: number | undefined;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      live.delete(release);
      if (timerId !== undefined) scheduler.clearTimeout(timerId);
      try {
        executor?.dispose();
      } finally {
        world?.dispose();
      }
    };
    live.add(release);

    try {
      world = await services.createWorld({ recordFrames: true });
      executor = services.createExecutor();
      const w = world;
      const timeout = new Promise<typeof TIMEOUT>((resolve) => {
        timerId = scheduler.setTimeout(() => {
          resolve(TIMEOUT);
        }, HAND_TIMEOUT_MS);
      });
      const work = (async () => {
        const run = await runGhostHand({
          plan: built.actions,
          wardSet: parsed.wardSet,
          variantConfig: parsed.variantConfig,
          seed: HAND_SEED,
          variantCount: HAND_VARIANTS,
          world: w,
          executor,
          evidence: { selfCheck: { state: 'pending' }, capabilities: services.capabilities },
          planOrigin: 'scripted',
        });
        const effects = built.actions.map((a) => w.effectsOutside(a));
        return { run, effects };
      })();
      // A run abandoned by the timeout must not end as an unhandled rejection.
      work.catch(() => undefined);

      const result = await Promise.race([work, timeout]);
      if (result === TIMEOUT) {
        release();
        return { status: 'failed', cause: 'timeout' };
      }
      const { run, effects } = result;
      const ward: WorldRecord['ward'] = { id: parsed.ward.id, kind: 'physics', line: handWardLine() };
      return {
        status: 'ran',
        run: {
          world: 'hand',
          ward,
          reality: { kind: 'hand', label: 'the real arm' },
          plan: handPlanRecord({
            commands: [handPlanText(norm.values)],
            ward: parsed.ward,
            effects,
            run: {
              verdict: run.verdict,
              message: run.message,
              violations: run.wardVerdict.violations,
              p1: { equal: run.p1.equal, before: run.p1.before, after: run.p1.after },
              rows: run.rows,
              variantResults: run.variantResults,
            },
          }),
        },
      };
    } catch (error) {
      if (error instanceof GhostHandRunError) {
        return { status: 'unsupported', reason: error.message, stepIndexes: [] };
      }
      return { status: 'failed', cause: 'run', detail: error instanceof Error ? error.message : String(error) };
    } finally {
      release();
    }
  }

  return {
    world: 'hand',
    async warm() {
      // The world and the executor are created per run.
    },
    run(input) {
      const next = chain.then(() => runOnce(input));
      chain = next.catch(() => undefined);
      return next;
    },
    dispose() {
      disposed = true;
      for (const release of [...live]) release();
    },
  };
}

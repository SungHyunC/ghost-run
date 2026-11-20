// Ghost Cloud adapter: runs a visitor plan through the world's pipeline against a fresh fixture.
// No Worker, no fetch: the world is in memory.

import type { Scene, WardSet } from '@ghost-run/core';
import { runGhostCloudPlan } from '@ghost-run/ghost-cloud';
import type { GhostCloudWorld } from '@ghost-run/ghost-cloud';
import { parseWards } from '@ghost-run/wards-config';
import type { WorldRecord } from '../data/types';
import { cloudPlanRecord, cloudReality, cloudWardLine } from './derive/cloud';
import type { CloudSceneLike, CloudWardLike } from './derive/cloud';
import type { LiveAnswer, LiveEngine, LiveInput } from './types';

export interface CloudEngineServices {
  wardsText: string;
  /** Tests inject a broken world; the default is the world's fresh fixture. */
  worldFactory?: () => GhostCloudWorld;
}

/** Fixed reasons of the world's parser. They never echo the input. */
const FIXED_REASONS: ReadonlySet<string> = new Set([
  'line is too long',
  'line has a character outside printable ASCII',
  'shell operator',
  'empty line',
  'unsupported command',
  'malformed command',
  'malformed argument',
]);
const GENERIC_REASON = 'unsupported command';
const STEP_PREFIX = 'unsupported step: ';

function fixedReason(error: string): string {
  const reason = error.startsWith(STEP_PREFIX) ? error.slice(STEP_PREFIX.length).trim() : '';
  return FIXED_REASONS.has(reason) ? reason : GENERIC_REASON;
}

const asScene = (s: Scene): CloudSceneLike => s as unknown as CloudSceneLike;

type Parsed = { ok: true; wardSet: WardSet; ward: CloudWardLike } | { ok: false };

function parseWardsText(text: string): Parsed {
  const parsed = parseWards(text);
  if (!parsed.ok) return { ok: false };
  const path = parsed.wardSet.wards.find((w) => w.kind === 'path');
  if (path === undefined || path.kind !== 'path') return { ok: false };
  return { ok: true, wardSet: parsed.wardSet, ward: { id: path.id, deny: path.deny, paths: path.paths } };
}

export function createCloudEngine(services: CloudEngineServices): LiveEngine {
  const wards = parseWardsText(services.wardsText);
  let chain: Promise<unknown> = Promise.resolve();

  async function runOnce(input: LiveInput): Promise<LiveAnswer> {
    if (input.world !== 'cloud' || !wards.ok) return { status: 'failed', cause: 'internal' };
    if (input.lines.length === 0) return { status: 'rejected', problem: 'empty' };
    try {
      const run = await runGhostCloudPlan(
        input.lines,
        wards.wardSet,
        services.worldFactory !== undefined ? { worldFactory: services.worldFactory } : undefined,
      );
      if (run.lines.length === 0 && !run.p1.equal) return { status: 'failed', cause: 'internal' };

      const bad = run.lines.filter((l) => l.unsupported);
      if (bad.length > 0) {
        const first = bad[0];
        const error = first !== undefined && !first.result.ok ? first.result.error : '';
        return { status: 'unsupported', reason: fixedReason(error), stepIndexes: bad.map((l) => l.index) };
      }

      const before = asScene(run.scenes.before);
      const ward: WorldRecord['ward'] = { id: wards.ward.id, kind: 'path', line: cloudWardLine(wards.ward) };
      return {
        status: 'ran',
        run: {
          world: 'cloud',
          ward,
          reality: cloudReality(before),
          plan: cloudPlanRecord({
            commands: input.lines.slice(0, run.lines.length),
            verdict: run.verdict,
            violations: run.wardVerdict.violations,
            ward: wards.ward,
            before,
            after: asScene(run.scenes.after),
            effects: run.report.effectsOutside,
            observedEvents: run.report.observedEvents,
            p1: { before: run.p1.before, after: run.p1.after },
            message: run.message,
          }),
        },
      };
    } catch {
      return { status: 'failed', cause: 'run' };
    }
  }

  return {
    world: 'cloud',
    async warm() {
      // Nothing to load.
    },
    run(input) {
      const next = chain.then(() => runOnce(input));
      chain = next.catch(() => undefined);
      return next;
    },
    dispose() {
      // Nothing to release.
    },
  };
}

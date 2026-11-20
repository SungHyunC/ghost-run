// Ghost Shell adapter: runs a visitor plan through the app pipeline against a fresh fixture project.
// No Worker, no fetch: the SQL executor is injected (inline in Node, the watchdog executor in the page).

import type { Scene, WardSet } from '@ghost-run/core';
import { createPlaygroundWorld } from '@ghost-run/playground-shell';
import type { PlaygroundAction, SqlExecutor } from '@ghost-run/playground-shell';
import { parseWards } from '@ghost-run/wards-config';
import { runPlayground } from '../../../apps/ghost-shell/src/pipeline/run-playground';
import { buildProject } from '../../../apps/ghost-shell/src/scenarios/project';
import type { WorldRecord } from '../data/types';
import { shellPlanRecord, shellReality, shellWardLine } from './derive/shell';
import type { ShellSceneLike, ShellWardLike } from './derive/shell';
import type { LiveAnswer, LiveEngine, LiveInput } from './types';

export interface ShellEngineServices {
  sql: SqlExecutor & { dispose?: () => void };
  wardsText: string;
}

/** Reasons of the world that never name the visitor's input. Anything else becomes the generic reason. */
const FIXED_REASONS: ReadonlySet<string> = new Set([
  'glob',
  'multiple redirections',
  'redirection without target',
  'no command',
  'empty command',
  'trailing &&',
  'command line too long',
  'command budget exceeded',
]);
const GENERIC_REASON = 'command not supported';
const WATCHDOG_REASON = 'the SQL statement ran too long and was stopped';

function fixedReason(stderr: string): string {
  const m = /unsupported: ([^\n]*)/.exec(stderr);
  const reason = m?.[1]?.trim() ?? '';
  return FIXED_REASONS.has(reason) ? reason : GENERIC_REASON;
}

const asScene = (s: Scene): ShellSceneLike => s as unknown as ShellSceneLike;

type Parsed = { ok: true; wardSet: WardSet; ward: ShellWardLike; secrets: string[] } | { ok: false };

function parseWardsText(text: string): Parsed {
  const parsed = parseWards(text);
  if (!parsed.ok) return { ok: false };
  const sql = parsed.wardSet.wards.find((w) => w.kind === 'sql');
  if (sql === undefined || sql.kind !== 'sql') return { ok: false };
  const secrets: string[] = [];
  for (const w of parsed.wardSet.wards) if (w.kind === 'egress') secrets.push(...w.secrets);
  return {
    ok: true,
    wardSet: parsed.wardSet,
    ward: { id: sql.id, tables: sql.tables, maxRowsLost: sql.max_rows_lost },
    secrets,
  };
}

export function createShellEngine(services: ShellEngineServices): LiveEngine {
  const { sql } = services;
  const wards = parseWardsText(services.wardsText);
  let chain: Promise<unknown> = Promise.resolve();

  async function runOnce(input: LiveInput): Promise<LiveAnswer> {
    if (input.world !== 'shell' || !wards.ok) return { status: 'failed', cause: 'internal' };
    if (input.actions.length === 0) return { status: 'rejected', problem: 'empty' };
    try {
      const project = await buildProject(sql);
      const hashes: string[] = [];
      const plan: PlaygroundAction[] = input.actions.map((command) => ({ command }));
      const run = await runPlayground({
        project,
        plan,
        wardSet: wards.wardSet,
        sql,
        // The pipeline calls fingerprint() before and after the ghost run; the wrapper keeps both hashes.
        worldFactory: (p, o) => {
          const world = createPlaygroundWorld(p, o);
          return {
            ...world,
            fingerprint: async () => {
              const fp = await world.fingerprint();
              hashes.push(fp.hash);
              return fp;
            },
          };
        },
      });

      if (run.watchdogFired) return { status: 'unsupported', reason: WATCHDOG_REASON, stepIndexes: [] };
      if (run.unsupportedSteps.length > 0) {
        const first = run.steps.find((s) => s.unsupported);
        return {
          status: 'unsupported',
          reason: fixedReason(first?.stderr ?? ''),
          stepIndexes: [...run.unsupportedSteps],
        };
      }

      const before = hashes[0];
      const after = hashes[hashes.length - 1];
      const first = run.report.snapshots[0];
      const last = run.report.snapshots[run.report.snapshots.length - 1];
      if (before === undefined || after === undefined || hashes.length < 2 || first === undefined || last === undefined) {
        return { status: 'failed', cause: 'internal' };
      }
      const sceneBefore = asScene(first.state);
      const ward: WorldRecord['ward'] = { id: wards.ward.id, kind: 'sql', line: shellWardLine(wards.ward) };
      return {
        status: 'ran',
        run: {
          world: 'shell',
          ward,
          reality: shellReality(sceneBefore, wards.ward, wards.secrets),
          plan: shellPlanRecord({
            commands: input.actions,
            verdict: run.verdict,
            violations: run.wardVerdict.violations,
            ward: wards.ward,
            secretPatterns: wards.secrets,
            before: sceneBefore,
            after: asScene(last.state),
            effects: run.report.effectsOutside,
            observedEvents: run.report.observedEvents,
            p1: { before, after },
            message: run.message,
          }),
        },
      };
    } catch {
      return { status: 'failed', cause: 'run' };
    }
  }

  return {
    world: 'shell',
    async warm() {
      try {
        await sql.run({ dbBytes: null, sql: 'SELECT 1', outputLimit: 1000 });
      } catch {
        // A failed warm-up shows on the first run.
      }
    },
    run(input) {
      const next = chain.then(() => runOnce(input));
      chain = next.catch(() => undefined);
      return next;
    },
    dispose() {
      sql.dispose?.();
    },
  };
}

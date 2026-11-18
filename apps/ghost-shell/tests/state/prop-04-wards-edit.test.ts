// Feature: ghost-shell, Property 4: Wards edit consistency (GS-P4)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Ward, WardSet } from '@ghost-run/core';
import { initInlineSql } from '@ghost-run/playground-shell';
import type { InlineSqlExecutor, PlaygroundAction } from '@ghost-run/playground-shell';
import { formatConfigError, parseWards, printWards } from '@ghost-run/wards-config';
// Node-only test code: the restriction targets the browser bundle.
// eslint-disable-next-line no-restricted-imports
import { loadWardsFile } from '@ghost-run/wards-config/node';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from '../pbt-config';
import { runPlayground } from '../../src/pipeline/run-playground';
import type { PlaygroundRun } from '../../src/pipeline/run-playground';
import { buildProject } from '../../src/scenarios/project';
import { SCENARIOS } from '../../src/scenarios/scenarios';
import { STALE_WARDS_TEXT } from '../../src/texts';
import { escapeForDisplay } from '../../src/ui-imports';
import {
  DEFAULT_WARDS_TEXT,
  initialWardsEditorState,
  wardsEditorErrors,
  wardsEditorReducer,
} from '../../src/wards/wards-editor';
import type { WardsEditorEvent, WardsEditorState } from '../../src/wards/wards-editor';

const here = dirname(fileURLToPath(import.meta.url));

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});

interface Plan {
  readonly actions: readonly PlaygroundAction[];
  readonly provenance: (typeof SCENARIOS)[number]['provenance'];
}

const PLANS: readonly Plan[] = SCENARIOS.flatMap((s) => [
  { actions: s.plan, provenance: s.provenance },
  ...(s.fixedPlan === undefined ? [] : [{ actions: s.fixedPlan, provenance: s.provenance }]),
]);

async function freshRun(plan: Plan, wardSet: WardSet): Promise<PlaygroundRun> {
  const project = await buildProject(sql);
  return runPlayground({
    project,
    plan: plan.actions,
    wardSet,
    sql,
    ...(plan.provenance === undefined ? {} : { provenance: plan.provenance }),
  });
}

const judged = (r: PlaygroundRun) => ({
  verdict: r.verdict,
  wardVerdict: r.wardVerdict,
  engineVerdict: r.engineVerdict,
  message: r.message,
  claims: r.claims,
});

// -- generators ---------------------------------------------------------------

const wardBodyArb: fc.Arbitrary<(id: string) => Ward> = fc.oneof(
  fc
    .record({
      deny: fc.subarray(['delete', 'overwrite'] as const, { minLength: 1 }),
      paths: fc.subarray(['data/**', '.env', 'build/**', '*.md', 'db/*.sqlite'], { minLength: 1 }),
    })
    .map((b) => (id: string): Ward => ({ id, kind: 'path', deny: b.deny, paths: b.paths })),
  fc
    .record({
      tables: fc.subarray(['users', 'orders', 'logs'], { minLength: 1 }),
      max: fc.integer({ min: 0, max: 5 }),
    })
    .map((b) => (id: string): Ward => ({ id, kind: 'sql', tables: b.tables, max_rows_lost: b.max })),
  fc
    .record({
      secrets: fc.subarray(['.env', '**/*.pem', 'config/*.key'], { minLength: 1 }),
      hosts: fc.subarray(['registry.npmjs.org', 'api.example'], { minLength: 0 }),
    })
    .map((b) => (id: string): Ward => ({ id, kind: 'egress', secrets: b.secrets, allow_hosts: b.hosts })),
);

const validTextArb: fc.Arbitrary<string> = fc
  .array(wardBodyArb, { minLength: 1, maxLength: 4 })
  .map((bodies) => printWards({ wards: bodies.map((b, i) => b(`w${i}`)) }))
  .filter((t) => parseWards(t).ok);

const badTextArb: fc.Arbitrary<string> = fc
  .constantFrom(
    'wards:\n  - id: x\n    kind: nope\n',
    'wards: 5\n',
    'wards:\n  - id: a\n    kind: path\n    deny: [delete]\n',
    'wards:\n\t- id: a\n',
    'not: [valid\n',
    'wards:\n' + '  - kind: nope\n'.repeat(60),
    '#'.repeat(262_145),
  )
  .filter((t) => !parseWards(t).ok);

type Ev =
  | { readonly t: 'editValid'; readonly text: string }
  | { readonly t: 'editBad'; readonly text: string }
  | { readonly t: 'debounce' }
  | { readonly t: 'complete'; readonly pick: number }
  | { readonly t: 'reset' };

const evArb: fc.Arbitrary<Ev> = fc.oneof(
  { weight: 3, arbitrary: validTextArb.map((text): Ev => ({ t: 'editValid', text })) },
  { weight: 2, arbitrary: badTextArb.map((text): Ev => ({ t: 'editBad', text })) },
  { weight: 3, arbitrary: fc.constant<Ev>({ t: 'debounce' }) },
  { weight: 3, arbitrary: fc.nat(10).map((pick): Ev => ({ t: 'complete', pick })) },
  { weight: 1, arbitrary: fc.constant<Ev>({ t: 'reset' }) },
);

// -- the driver ---------------------------------------------------------------

interface Pending {
  readonly runId: number;
  readonly wardSet: WardSet;
}

describe('Property 4: wards edit consistency (GS-P4)', () => {
  it(
    'after the events settle the shown run equals a fresh runPlayground of the latest valid text',
    async () => {
      const yieldNow = makeYielder(5);
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PLANS),
          fc.array(evArb, { minLength: 1, maxLength: 9 }),
          fc.array(fc.nat(10), { minLength: 12, maxLength: 12 }),
          async (plan, events, finalPicks) => {
            await yieldNow();
            let state: WardsEditorState = initialWardsEditorState();
            const pending: Pending[] = [];
            let debounceScheduled = false;
            let lastOk: WardSet = (state.parsed as { ok: true; wardSet: WardSet }).wardSet;
            let lastSettleFailed = false;
            // The page requests the first run with id 0 for the initial text.
            pending.push({ runId: 0, wardSet: lastOk });

            const apply = (ev: WardsEditorEvent): void => {
              const step = wardsEditorReducer(state, ev);
              state = step.state;
              for (const e of step.effects) {
                if (e.type === 'cancelDebounce') debounceScheduled = false;
                else if (e.type === 'scheduleDebounce') debounceScheduled = true;
                else pending.push({ runId: e.runId, wardSet: e.wardSet });
              }
            };
            const settle = (): void => {
              const p = parseWards(state.text);
              lastSettleFailed = !p.ok;
              if (p.ok) lastOk = p.wardSet;
            };
            const fireDebounce = (): void => {
              debounceScheduled = false;
              apply({ type: 'debounceElapsed' });
              settle();
            };
            const complete = async (pick: number): Promise<void> => {
              if (pending.length === 0) return;
              const [p] = pending.splice(pick % pending.length, 1);
              if (p === undefined) return;
              const run = await freshRun(plan, p.wardSet);
              const before = state.shown;
              const wasLatest = p.runId === state.runId;
              apply({ type: 'runFinished', runId: p.runId, run });
              if (!wasLatest) expect(state.shown).toBe(before);
              else expect(state.shown).toBe(run);
            };

            for (const ev of events) {
              if (ev.t === 'editValid' || ev.t === 'editBad') apply({ type: 'edit', text: ev.text });
              else if (ev.t === 'debounce') {
                if (debounceScheduled) fireDebounce();
              } else if (ev.t === 'complete') await complete(ev.pick);
              else {
                apply({ type: 'reset' });
                debounceScheduled = false;
                lastOk = (parseWards(DEFAULT_WARDS_TEXT) as { ok: true; wardSet: WardSet }).wardSet;
                lastSettleFailed = false;
              }
            }

            // Settle: fire the pending debounce, then deliver every remaining run in a generated order.
            if (debounceScheduled) fireDebounce();
            for (const pick of finalPicks) await complete(pick);
            while (pending.length > 0) await complete(0);

            const expectedRun = await freshRun(plan, lastOk);
            expect(state.shown).toBeDefined();
            expect(judged(state.shown!)).toEqual(judged(expectedRun));

            const view = wardsEditorErrors(state);
            expect(state.stale).toBe(lastSettleFailed);
            if (lastSettleFailed) {
              expect(view.label).toBe(STALE_WARDS_TEXT);
              const parsed = parseWards(state.text);
              expect(parsed.ok).toBe(false);
              if (!parsed.ok) {
                expect(view.messages).toEqual(
                  parsed.errors.slice(0, 50).map((e) => escapeForDisplay(formatConfigError(e))),
                );
              }
            } else {
              expect(view.label).toBeUndefined();
              expect(view.messages).toEqual([]);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('a run whose runId is not the latest never replaces the shown run (stale delivery order)', async () => {
    const plan = PLANS[0]!;
    const one = parseWards(printWards({ wards: [{ id: 'a', kind: 'sql', tables: ['users'], max_rows_lost: 0 }] }));
    const two = parseWards(printWards({ wards: [{ id: 'b', kind: 'sql', tables: ['users'], max_rows_lost: 9 }] }));
    if (!one.ok || !two.ok) throw new Error('fixture wards do not parse');
    let s = initialWardsEditorState();
    const requests: { runId: number; wardSet: WardSet }[] = [];
    for (const text of [printWards(one.wardSet), printWards(two.wardSet)]) {
      for (const ev of [{ type: 'edit', text }, { type: 'debounceElapsed' }] as const) {
        const step = wardsEditorReducer(s, ev);
        s = step.state;
        for (const e of step.effects) if (e.type === 'runPlayground') requests.push({ runId: e.runId, wardSet: e.wardSet });
      }
    }
    expect(requests.map((r) => r.runId)).toEqual([1, 2]);
    const latest = await freshRun(plan, two.wardSet);
    const old = await freshRun(plan, one.wardSet);
    s = wardsEditorReducer(s, { type: 'runFinished', runId: 2, run: latest }).state;
    s = wardsEditorReducer(s, { type: 'runFinished', runId: 1, run: old }).state;
    expect(s.shown).toBe(latest);
  });
});

describe('Default_Wards_File bundling', () => {
  const file = resolve(here, '../../wards.yaml');

  it('the bundled text equals the bytes of apps/ghost-shell/wards.yaml', () => {
    expect(Buffer.from(DEFAULT_WARDS_TEXT, 'utf8').equals(readFileSync(file))).toBe(true);
  });

  it('parseWards on the bundled text equals loadWardsFile on the file', async () => {
    expect(parseWards(DEFAULT_WARDS_TEXT)).toEqual(await loadWardsFile(file));
  });
});

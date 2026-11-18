// Property test for write path judgment (task 6.4, KI-P6). No Docker needed [no-docker].
// Feature: kiro-integration, Property 6: Write path judgment
// **Validates: Requirements 6.1, 6.2, 6.5, 6.6, 6.10, 10.7**
import fc from 'fast-check';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { classifyTool, TARGET_PATH_FIELDS } from '../lib/event.mjs';
import { decisionFromRunResult } from '../lib/gate/output.mjs';
import { judgeShell } from '../lib/gate/shell-judgment.mjs';
import { judgeWrite } from '../lib/gate/write-judgment.mjs';
import { makeHookEvent, makeTempStore } from './fixtures/index.mjs';
import { makeMemTree } from './fixtures/mem-tree.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS } from './pbt-config.mjs';

const ROOT = '/ws';
const WARDS_FILE = 'conf/w.yaml';
/** @type {import('@ghost-run/core').WardSet} */
const wardSet = {
  wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**', '.env'] }],
};

// Case-insensitive tree (the default ward mode) with a link to the protected folder.
const fsView = makeMemTree(
  {
    '/ws/data': { dir: true },
    '/ws/data/x': 'zz',
    '/ws/link': { link: '/ws/data' },
    '/ws/conf': { dir: true },
    '/ws/conf/w.yaml': 'a',
    '/ws/.kiro': { dir: true },
    '/ws/.kiro/hooks': { dir: true },
    '/ws/.kiro/hooks/x.json': '{}',
    '/ws/integrations': { dir: true },
    '/ws/integrations/kiro-hook': { dir: true },
    '/ws/integrations/kiro-hook/lib': { dir: true },
    '/ws/integrations/kiro-hook/lib/a.mjs': 'x',
    '/ws/.ghost-run': { dir: true },
    '/ws/.ghost-run/graveyard.jsonl': '',
  },
  { caseInsensitive: true },
);

/** Spellings of one workspace-relative path. @param {string} p */
function spellings(p) {
  const [head, ...rest] = p.split('/');
  const tail = rest.join('/');
  return [
    p,
    `./${p}`,
    `${head}//${tail}`,
    `${head}/./${tail}`,
    `./${head}/../${head}/${tail}`,
    `src/../${p}`,
    p.toUpperCase(),
    `/ws/${p}`,
  ];
}

const PROTECTED = [...spellings('data/x'), 'link/x', './link/x', 'LINK/x', '/ws/link/x'];
const SELF_PROTECTED = [
  '.kiro/hooks/x.json',
  '.kiro/hooks/new.json',
  'integrations/kiro-hook/lib/a.mjs',
  'integrations/kiro-hook/lib/new.mjs',
  '.ghost-run/graveyard.jsonl',
  WARDS_FILE,
].flatMap(spellings);

const TOOLS = ['fs_write', 'fs_append', 'str_replace', 'delete_file', 'code'];
const toolArb = fc.constantFrom(...TOOLS);
const fieldArb = fc.constantFrom(...TARGET_PATH_FIELDS);

/** Build a Hook_Event for a write tool with the path in the given Target_Path_Field. */
function eventFor(/** @type {string} */ tool, /** @type {string} */ field, /** @type {string} */ path) {
  /** @type {Record<string, unknown>} */
  const input = { [field]: path };
  if (tool === 'fs_write' || tool === 'fs_append') input['text'] = 'new';
  if (tool === 'str_replace') Object.assign(input, { oldStr: 'a', newStr: 'b' });
  if (tool === 'code') input['operation'] = 'rename_symbol';
  return makeHookEvent(tool, input, { cwd: ROOT });
}

/** Map a write judgment to the gate decision, as the gate does for a RunResult. */
function decide(/** @type {Awaited<ReturnType<typeof judgeWrite>>} */ j) {
  return decisionFromRunResult(
    /** @type {any} */ ({
      schemaVersion: 1,
      runId: 'r',
      status: 'ok',
      verdict: j.verdict,
      wardVerdict: j.wardVerdict ?? undefined,
      report: j.report,
      isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
    }),
    { wardCount: 1, warnMode: 'exit2' },
  );
}

/** @param {string} tool @param {string} field @param {string} path */
async function judgeCall(tool, field, path) {
  const classified = classifyTool(eventFor(tool, field, path));
  expect(classified.class).toBe('write');
  return judgeWrite(classified, { root: ROOT, wardSet, toolName: tool, wardsFile: '/ws/conf/w.yaml' }, fsView);
}

/**
 * @template T
 * @param {fc.Arbitrary<T>} arb
 * @param {(v: T) => Promise<void>} check
 */
async function runProperty(arb, check) {
  let runs = 0;
  await fc.assert(
    fc.asyncProperty(arb, async (v) => {
      runs += 1;
      await check(v);
    }),
    FC_PARAMS,
  );
  return runs;
}

/** @type {Record<string, number>} */
const executed = {};
const temps = /** @type {Array<() => void>} */ ([]);
afterAll(() => {
  for (const c of temps) c();
});

describe('KI-P6 write path judgment', () => {
  it(
    'a write to a protected path (any spelling, tool, field) is block and deny',
    async () => {
      executed['protected'] = await runProperty(
        fc.record({ tool: toolArb, field: fieldArb, path: fc.constantFrom(...PROTECTED) }),
        async ({ tool, field, path }) => {
          const j = await judgeCall(tool, field, path);
          const label = JSON.stringify({ tool, field, path });
          expect(j.verdict, label).toBe('block');
          const d = decide(j);
          expect(d.kind, label).toBe('deny');
          expect(d.exit, label).toBe(2);
        },
      );
    },
    FILE_TIMEOUT_MS,
  );

  it(
    'a write to a Self_Protected_Path is at least warn and never allow',
    async () => {
      executed['self'] = await runProperty(
        fc.record({ tool: toolArb, field: fieldArb, path: fc.constantFrom(...SELF_PROTECTED) }),
        async ({ tool, field, path }) => {
          const j = await judgeCall(tool, field, path);
          const label = JSON.stringify({ tool, field, path });
          expect(['warn', 'block'], label).toContain(j.verdict);
          for (const warnMode of /** @type {const} */ (['exit2', 'ask'])) {
            const r = decisionFromRunResult(
              /** @type {any} */ ({
                schemaVersion: 1,
                runId: 'r',
                status: 'ok',
                verdict: j.verdict,
                wardVerdict: j.wardVerdict ?? undefined,
                report: j.report,
                isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
              }),
              { wardCount: 1, warnMode },
            );
            expect(r.kind, label).not.toBe('allow');
          }
        },
      );
    },
    FILE_TIMEOUT_MS,
  );

  it(
    'a shell Change list with a change under a Self_Protected_Path is at least warn and never allow',
    async () => {
      const store = makeTempStore();
      temps.push(store.cleanup);
      const root = join(store.dir, 'ws');
      await mkdir(root, { recursive: true });
      const semDir = join(store.dir, 'locks');
      const kindArb = fc.constantFrom('file-created', 'file-overwritten', 'file-deleted', 'symlink-changed');
      const otherChange = fc.record({
        kind: kindArb,
        path: fc.constantFrom('src/a.ts', 'docs/b.md', 'data/x'),
      });
      const selfChange = fc.record({ kind: kindArb, path: fc.constantFrom(...SELF_PROTECTED.filter((p) => !p.startsWith('/'))) });
      executed['shell'] = await runProperty(
        fc.record({
          before: fc.array(otherChange, { maxLength: 3 }),
          self: selfChange,
          after: fc.array(otherChange, { maxLength: 3 }),
          base: fc.constantFrom('pass', 'warn'),
          warnMode: fc.constantFrom('exit2', 'ask'),
        }),
        async ({ before, self, after, base, warnMode }) => {
          const changes = [...before, self, ...after];
          const result = {
            schemaVersion: 1,
            runId: 'r',
            status: 'ok',
            rehearsed: true,
            verdict: base,
            report: { snapshots: [], changes: [changes], effectsOutside: [[]], observedEvents: [], variantResults: [] },
            notices: [],
          };
          const j = /** @type {any} */ (
            await judgeShell(
              {
                root,
                toolInput: { command: 'echo hi' },
                wardSet: { wards: [] },
                elapsedSec: 0,
                semaphore: { dir: semDir },
                wardsFileRelative: WARDS_FILE,
              },
              { runPlan: /** @type {any} */ (async () => ({ result, payloads: new Map() })) },
            )
          );
          const label = JSON.stringify({ changes, base });
          expect(j.decision, label).toBe('judged');
          expect(['warn', 'block'], label).toContain(j.verdict);
          const d = decisionFromRunResult(
            /** @type {any} */ ({
              ...result,
              verdict: j.verdict,
              isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
            }),
            { wardCount: 0, warnMode },
          );
          expect(d.kind, label).not.toBe('allow');
        },
      );
    },
    FILE_TIMEOUT_MS,
  );

  it('reports the number of runs executed per property', () => {
    console.log(`KI-P6 runs executed: ${JSON.stringify(executed)} (numRuns=${FC_PARAMS.numRuns})`);
    for (const n of Object.values(executed)) expect(n).toBeGreaterThanOrEqual(FC_PARAMS.numRuns);
  });
});

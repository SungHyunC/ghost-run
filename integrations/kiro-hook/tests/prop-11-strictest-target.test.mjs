// Property 11: strictest target wins (task 6.5).
// Validates: Requirements 3.3, 3.4, 6.11
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CODE_READ_ONLY_OPERATIONS, TARGET_PATH_FIELDS, classifyTool } from '../lib/event.mjs';
import { judgeWrite } from '../lib/gate/write-judgment.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

const ROOT = '/ws';
/** @type {import('@ghost-run/core').WardSet} */
const wardSet = {
  wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**', '.env'] }],
};
/** @type {Record<string, number>} */
const RANK = { pass: 0, warn: 1, block: 2 };

/** In-memory tree (copied from write-judgment.test.mjs, reduced). */
function memFs() {
  /** @type {Map<string, any>} */
  const tree = new Map(
    Object.entries({
      '/ws': { dir: true },
      '/ws/src': { dir: true },
      '/ws/src/a.ts': 'abc',
      '/ws/data': { dir: true },
      '/ws/data/x.db': 'zz',
      '/ws/.env': 'k',
    }),
  );
  /** @param {any} n */
  const stat = (n) => ({
    isSymbolicLink: () => false,
    isDirectory: () => typeof n === 'object',
    size: typeof n === 'string' ? n.length : 0,
  });
  return {
    /** @param {string} p */
    async lstat(p) {
      const n = tree.get(p);
      return n === undefined ? null : stat(n);
    },
    /** @param {string} p */
    async realpath(p) {
      return tree.has(p) ? p : null;
    },
    /** @param {string} p */
    async readdir(p) {
      const prefix = `${p}/`;
      return [...tree.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => k.slice(prefix.length));
    },
  };
}
const fs = memFs();

const WRITE_TOOLS = ['fs_write', 'fs_append', 'str_replace', 'delete_file', 'code'];

/** @param {string} tool @param {Record<string, unknown>} input */
const classify = (tool, input) =>
  classifyTool({ hook_event_name: 'PreToolUse', cwd: ROOT, session_id: 's', tool_name: tool, tool_input: input });

async function outcome(/** @type {string} */ tool, /** @type {Record<string, unknown>} */ input) {
  const c = classify(tool, input);
  if (c.class === 'deny') return { verdict: 'block', denied: true };
  const j = await judgeWrite(c, { root: ROOT, wardSet, toolName: tool }, fs);
  return { verdict: j.verdict, denied: false };
}

const pathArb = fc.constantFrom(
  'data/x.db',
  'data/new.db',
  './data/../data/x.db',
  'DATA/x.db',
  '.env',
  'src/a.ts',
  'src/new.ts',
  'docs/readme.md',
  '../outside/x',
  '/other/hosts.test',
  '.kiro/hooks/x.json',
  'integrations/kiro-hook/lib/a.mjs',
);

/** One to three distinct target fields with generated paths. */
const callArb = fc.record({
  tool: fc.constantFrom(...WRITE_TOOLS.filter((t) => t !== 'code')),
  fields: fc.uniqueArray(fc.constantFrom(...TARGET_PATH_FIELDS), { minLength: 1, maxLength: 3 }),
  paths: fc.array(pathArb, { minLength: 3, maxLength: 3 }),
});

/** @param {string[]} fields @param {string[]} paths */
const toInput = (fields, paths) => Object.fromEntries(fields.map((f, i) => [f, paths[i]]));

describe('Property 11: strictest target wins', () => {
  it('verdict equals the maximum of the per-path verdicts', async () => {
    await fc.assert(
      fc.asyncProperty(callArb, async ({ tool, fields, paths }) => {
        const input = toInput(fields, paths);
        const whole = await outcome(tool, input);
        let best = 'pass';
        for (const f of fields) {
          const single = await outcome(tool, { [f]: input[f] });
          if (RANK[single.verdict] > RANK[best]) best = single.verdict;
        }
        expect(whole.verdict).toBe(best);
      }),
      FC_PARAMS,
    );
  });

  it('each present field is judged: a protected path in any field blocks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('fs_write', 'fs_append', 'str_replace', 'delete_file'),
        fc.constantFrom(...TARGET_PATH_FIELDS),
        fc.constantFrom('data/x.db', './data/../data/x.db', 'data//x.db', '.env'),
        fc.array(fc.constantFrom('src/a.ts', 'src/new.ts'), { maxLength: 2 }),
        async (tool, field, protectedPath, others) => {
          const rest = TARGET_PATH_FIELDS.filter((f) => f !== field);
          const input = { [field]: protectedPath, ...Object.fromEntries(others.map((p, i) => [rest[i], p])) };
          const r = await outcome(tool, input);
          expect(r.verdict).toBe('block');
        },
      ),
      FC_PARAMS,
    );
  });

  it('a missing or non-string target field on a write tool gives deny', async () => {
    const bad = fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.string(), { maxLength: 2 }),
      fc.constant({}),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...WRITE_TOOLS),
        fc.constantFrom(...TARGET_PATH_FIELDS),
        bad,
        pathArb,
        async (tool, field, value, valid) => {
          // A non-string field poisons the call even when a sibling field holds a valid path.
          const sibling = TARGET_PATH_FIELDS.find((f) => f !== field);
          const input = { [field]: value, [/** @type {string} */ (sibling)]: valid };
          expect(classify(tool, input).class).toBe('deny');
          expect((await outcome(tool, input)).denied).toBe(true);
        },
      ),
      FC_PARAMS,
    );
  });

  it('a write tool with no target field, or only an empty one, gives deny', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...WRITE_TOOLS),
        fc.subarray([...TARGET_PATH_FIELDS]),
        async (tool, fields) => {
          const input = Object.fromEntries(fields.map((f) => [f, '']));
          expect(classify(tool, input).class).toBe('deny');
        },
      ),
      FC_PARAMS,
    );
  });

  it('a code call with a read-only operation and no target is allowed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...CODE_READ_ONLY_OPERATIONS), fc.boolean(), async (operation, extra) => {
        const input = extra ? { operation, symbol_name: 'x' } : { operation };
        const c = classify('code', input);
        expect(c.class).toBe('read-only');
        const j = await judgeWrite(c, { root: ROOT, wardSet, toolName: 'code' }, fs);
        expect(j.verdict).toBe('pass');
      }),
      FC_PARAMS,
    );
  });

  it('example: a case-variant create is judged as a create (pass), a case-variant delete blocks', async () => {
    expect((await outcome('fs_write', { path: 'DATA/x.db' })).verdict).toBe('pass');
    expect((await outcome('delete_file', { targetFile: 'DATA/x.db' })).verdict).toBe('block');
  });

  it('example: a write tool with no target field is denied', () => {
    for (const t of WRITE_TOOLS) expect(classify(t, {}).class).toBe('deny');
  });
});

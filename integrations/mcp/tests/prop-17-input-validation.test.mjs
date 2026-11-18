// Property 17: MCP input validation and result bounds (task 14.5).
// Inputs outside the schemas give an isError result that names the field, and the runPlan double is
// never called. Every serialized result stays within 64 KiB, and a truncated one carries the marker
// and the flag. Hidden code points are built from numeric code points. Canary/reserved values only.
// **Property 17: MCP input validation and result bounds**
// **Validates: Requirements 18.2, 18.4, 18.5, 19.1, 19.4**
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';
import { MAX_RESULT_BYTES, TRUNCATED_MARKER, makeResult } from '../src/result.mjs';

// Same short/nightly switch as the kiro-hook suite (GHOST_PBT_MODE=nightly selects the long run).
const NUM_RUNS = process.env['GHOST_PBT_MODE'] === 'nightly' ? 10_000 : 100;
const FC_PARAMS = { numRuns: NUM_RUNS, verbose: 1 };
const TOOL_RUNS = Math.min(NUM_RUNS, 30);

const WARDS = ['wards:', '  - id: protect-data', '    kind: path', '    deny: [delete, overwrite]', '    paths: ["data/**"]', ''].join('\n');

/** Hidden code points, built from numbers: tag, zero-width, bidi. */
const HIDDEN = [0xe0041, 0xe0067, 0x200b, 0x200c, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069].map((cp) => String.fromCodePoint(cp));
const HIDDEN_RE = /[\u{E0000}-\u{E007F}\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/u;
const ASTRAL = String.fromCodePoint(0x1f600);

/** @type {string} */
let root;
/** @type {any[]} */
const calls = [];
/** @type {Client} */
let client;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ghost-mcp-prop17-'));
  await writeFile(path.join(root, 'wards.yaml'), WARDS);
  const { server } = createServer({
    root,
    env: {},
    deps: {
      runPlan: async (/** @type {any} */ plan) => {
        calls.push(plan);
        throw new Error('runPlan must not be called');
      },
    },
    stderr: () => undefined,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'prop-17', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const okAction = fc.constant({ command: 'ls' });
const hiddenChar = fc.constantFrom(...HIDDEN);

/** @type {fc.Arbitrary<{ tool: string, args: Record<string, unknown>, field: string }>} */
const invalidPlan = fc.oneof(
  fc.constant({ plan: [], field: 'plan' }),
  fc.integer({ min: 51, max: 70 }).map((n) => ({ plan: Array.from({ length: n }, () => ({ command: 'ls' })), field: 'plan' })),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.dictionary(fc.string({ maxLength: 4 }), fc.integer(), { maxKeys: 3 })).map((plan) => ({ plan, field: 'plan' })),
  fc.constant({ plan: [{ command: '' }], field: 'plan.0.command' }),
  fc.tuple(fc.array(okAction, { maxLength: 3 }), fc.integer({ min: 1, max: 4 })).map(([before, extra]) => ({
    plan: [...before, { command: 'x'.repeat(4096 + extra) }],
    field: `plan.${before.length}.command`,
  })),
  // Code points, not UTF-16 units: 4,097 astral characters are 8,194 units.
  fc.constant({ plan: [{ command: ASTRAL.repeat(4097) }], field: 'plan.0.command' }),
  fc.tuple(fc.array(okAction, { maxLength: 3 }), fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 }))).map(([before, command]) => ({
    plan: [...before, { command }],
    field: `plan.${before.length}.command`,
  })),
  fc.oneof(fc.string({ minLength: 1 }), fc.integer(), fc.constant(null)).map((item) => ({ plan: [item], field: 'plan.0' })),
).chain((p) => fc.constantFrom('ghost_run', 'wards_check').map((tool) => ({ tool, args: { plan: p.plan }, field: p.field })));

/** Strings that fail the id pattern ^[A-Za-z0-9_-]{1,64}$, hidden characters among them. */
const badId = fc.oneof(
  fc.constant(''),
  fc.integer({ min: 65, max: 120 }).map((n) => 'a'.repeat(n)),
  fc.tuple(fc.stringMatching(/^[A-Za-z0-9_-]{0,10}$/), fc.constantFrom('/', '.', ' ', '\\', '*', '\n', '\u00e9', ASTRAL, ...HIDDEN), fc.stringMatching(/^[A-Za-z0-9_-]{0,10}$/)).map(([a, c, b]) => a + c + b),
  fc.tuple(fc.stringMatching(/^[A-Za-z0-9_-]{1,10}$/), hiddenChar).map(([a, h]) => a + h),
);
const wrongType = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 }));

const invalidId = fc.oneof(
  fc.tuple(fc.constantFrom('ghost_diff', 'ghost_trace'), badId).map(([tool, id]) => ({ tool, args: { id }, field: 'id' })),
  fc.tuple(fc.constantFrom('ghost_diff', 'ghost_trace'), wrongType).map(([tool, id]) => ({ tool, args: { id }, field: 'id' })),
  fc.tuple(fc.constantFrom('ghost_diff', 'ghost_trace'), fc.constant(undefined)).map(([tool]) => ({ tool, args: {}, field: 'id' })),
  badId.map((session) => ({ tool: 'ghost_trace', args: { id: 'run-ok_1', session }, field: 'session' })),
);

const invalidPaths = fc.oneof(
  fc.constant({ path: [] }),
  fc.integer({ min: 201, max: 260 }).map((n) => ({ path: Array.from({ length: n }, (_, i) => `f${i}.txt`) })),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)).map((p) => ({ path: p })),
  fc.oneof(fc.integer(), fc.constant(null), fc.boolean()).map((x) => ({ path: ['ok.txt', x] })),
  fc.constant({}),
).map((args) => ({ tool: 'blacklight', args, field: 'path' }));

/** @param {{ tool: string, args: Record<string, unknown>, field: string }} c */
async function invalidCall(c) {
  const before = calls.length;
  /** @type {any} */
  let r;
  try {
    r = await client.callTool({ name: c.tool, arguments: c.args });
  } catch (err) {
    // The SDK may reject at protocol level; that is an error answer as well, and still names the field.
    return { text: String(err instanceof Error ? err.message : err), isError: true, called: calls.length - before };
  }
  const text = (r.content ?? []).map((/** @type {any} */ x) => x.text ?? '').join('\n');
  return { text, isError: r.isError === true, called: calls.length - before };
}

describe('Property 17: MCP input validation', () => {
  it('invalid input gives isError with a sanitized message naming the field, and the runner is not called', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(invalidPlan, invalidId, invalidPaths), async (c) => {
        const out = await invalidCall(c);
        expect(out.isError).toBe(true);
        expect(out.called).toBe(0);
        // The SDK writes array indexes as plan[0]; the wrapper writes plan.0. Both name the field.
        expect(out.text.replace(/\[(\d+)\]/g, '.$1')).toContain(c.field);
        expect(HIDDEN_RE.test(out.text)).toBe(false);
        expect(out.text.length).toBeLessThan(2000);
      }),
      FC_PARAMS,
    );
  });

  it('valid boundary inputs are accepted by the schemas (50 actions, 4,096 code points, 200 paths)', async () => {
    const { parseInput } = await import('../src/schemas.mjs');
    expect(parseInput('ghost_run', { plan: Array.from({ length: 50 }, () => ({ command: 'ls' })) }).ok).toBe(true);
    expect(parseInput('ghost_run', { plan: [{ command: ASTRAL.repeat(4096) }] }).ok).toBe(true);
    expect(parseInput('blacklight', { path: Array.from({ length: 200 }, (_, i) => `f${i}`) }).ok).toBe(true);
    expect(parseInput('ghost_diff', { id: 'a'.repeat(64) }).ok).toBe(true);
  });
});

/** @param {any} r */
const serializedBytes = (r) => Buffer.byteLength(JSON.stringify(r), 'utf8');
/** Text plus structured content, the two parts that carry data. */
const payloadBytes = (/** @type {any} */ r) => Buffer.byteLength(r.content.map((/** @type {any} */ c) => c.text).join(''), 'utf8') + Buffer.byteLength(JSON.stringify(r.structuredContent), 'utf8');

/** Text of generated size with hidden code points mixed in, built from numeric code points. */
const bigText = fc
  .tuple(fc.integer({ min: 0, max: 90_000 }), fc.array(fc.integer({ min: 0, max: 0x10ffff }).filter((cp) => cp < 0xd800 || cp > 0xdfff), { maxLength: 40 }), fc.array(hiddenChar, { maxLength: 20 }))
  .map(([n, cps, hidden]) => {
    const body = Array.from({ length: Math.ceil(n / 40) }, (_, i) => `line ${i} ${'y'.repeat(30)}`).join('\n');
    return body + cps.map((cp) => String.fromCodePoint(cp)).join('') + hidden.join('');
  });

describe('Property 17: result bounds', () => {
  it('every result is at most 64 KiB in its text, and a truncated one has the marker and the flag', () => {
    fc.assert(
      fc.property(bigText, fc.integer({ min: 0, max: 400 }), fc.boolean(), (text, arrayLen, useText) => {
        const structured = { text, items: Array.from({ length: arrayLen * 50 }, (_, i) => ({ n: i, label: 'item' })), ok: true };
        const r = makeResult(structured, useText ? { text } : {});
        const bodyText = r.content[0].text;
        expect(Buffer.byteLength(bodyText, 'utf8')).toBeLessThanOrEqual(MAX_RESULT_BYTES);
        expect(payloadBytes(r)).toBeLessThanOrEqual(2 * MAX_RESULT_BYTES);
        expect(Buffer.byteLength(JSON.stringify(r.structuredContent), 'utf8')).toBeLessThanOrEqual(MAX_RESULT_BYTES + 64);
        // Escaping hidden characters only makes text longer, so a raw size over the limit must be flagged.
        const rawBytes = Buffer.byteLength(useText ? text : JSON.stringify(structured, null, 2), 'utf8');
        const flagged = r.structuredContent['truncated'] === true;
        if (rawBytes > MAX_RESULT_BYTES) expect(flagged).toBe(true);
        // The marker and the flag always go together.
        expect(bodyText.endsWith(TRUNCATED_MARKER)).toBe(flagged);
        if (!flagged) expect(r.structuredContent['truncated']).toBeUndefined();
        expect(HIDDEN_RE.test(bodyText)).toBe(false);
      }),
      FC_PARAMS,
    );
  });

  it('a tool result through the server stays bounded and flags truncation (ghost_run with a large runner result)', async () => {
    const { server } = createServer({
      root,
      env: {},
      deps: {
        clock: () => new Date(Date.UTC(2026, 10, 20, 12, 0, 0)),
        runPlan: async (/** @type {any} */ plan) => ({
          result: bigRunResult(plan.length),
          payloads: new Map(),
        }),
      },
      stderr: () => undefined,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'prop-17-bounds', version: '0.0.0' });
    await Promise.all([server.connect(a), c.connect(b)]);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 60_000 }), async (n) => {
        bigRunResult.exitCount = n;
        const r = /** @type {any} */ (await c.callTool({ name: 'ghost_run', arguments: { plan: [{ command: 'ls' }] } }));
        expect(r.isError).toBeUndefined();
        const text = r.content[0].text;
        expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(MAX_RESULT_BYTES);
        expect(serializedBytes(r.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
        if (r.structuredContent.truncated === true) expect(text.endsWith(TRUNCATED_MARKER)).toBe(true);
        else expect(text.includes(TRUNCATED_MARKER)).toBe(false);
      }),
      { ...FC_PARAMS, numRuns: TOOL_RUNS },
    );
  });
});

/** @param {number} _steps */
function bigRunResult(_steps) {
  const iso = { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] };
  return {
    schemaVersion: 1,
    runId: 'run-big_1',
    status: 'ok',
    rehearsed: true,
    verdict: 'pass',
    wardVerdict: { verdict: 'pass', violations: [], notices: [] },
    report: { snapshots: [], changes: [[]], effectsOutside: [[]], observedEvents: [], variantResults: [] },
    exitCodes: Array.from({ length: /** @type {any} */ (bigRunResult).exitCount ?? 0 }, () => 0),
    copy: { cloned: true, location: 'copy' },
    isolation: iso,
    recorder: { location: 'in-box', tamperResistant: false },
    captures: [],
    diagnostics: [],
    staticFindings: [],
    notices: [],
    phases: {},
  };
}
bigRunResult.exitCount = 0;

// Property test for Grave_Entry validity (task 7.6, Property 13). No Docker needed [no-docker].
// Hidden code points are built from numeric code points, never written literally.
// Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.6, 14.7, 7.7
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildGraveEntry } from '../lib/gate/grave.mjs';
import { decisionFromRunResult } from '../lib/gate/output.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

// The ui-kit Graveyard model, read from its source (ui/ is not edited). Relative TS import works in vitest.
const graveyardUrl = new URL('../../../ui/src/model/graveyard.ts', import.meta.url);
const { buildGraveyardModel } = await import(/* @vite-ignore */ fileURLToPath(graveyardUrl));

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TIME_FORMAT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SECRET = 'sk-CANARY-pbt13secret';

const HIDDEN_CODE_POINTS = [0x200b, 0x200c, 0x2060, 0xfeff, 0x202e, 0x2066, 0xe0041, 0x00, 0x1b, 0x7f];

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.split('');
/** @param {number} n */
const hex = (n) => fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: n, maxLength: n }).map((a) => a.join(''));
const uuidArb = fc.tuple(hex(8), hex(4), hex(4), hex(4), hex(12)).map((p) => p.join('-'));
// Longest run id that still gives `g-<runId>` of at most 64 characters is 62.
const runIdArb = fc.oneof(
  uuidArb,
  fc.array(fc.constantFrom(...ID_CHARS), { minLength: 1, maxLength: 62 }).map((a) => a.join('')),
);
const longRunIdArb = fc.array(fc.constantFrom(...ID_CHARS), { minLength: 63, maxLength: 80 }).map((a) => a.join(''));

/** @param {number} n @param {number} w */
const pad = (n, w) => String(n).padStart(w, '0');
const timeArb = fc
  .record({
    y: fc.integer({ min: 1970, max: 2099 }),
    mo: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
    h: fc.integer({ min: 0, max: 23 }),
    mi: fc.integer({ min: 0, max: 59 }),
    s: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ y, mo, d, h, mi, s }) => `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}T${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}Z`);

const wardIdArb = fc.constantFrom('no-delete-src', 'no-egress', 'sql-rows', 'w1', 'w2', 'protect-env');
const violationArb = fc.record({
  wardId: wardIdArb,
  wardKind: fc.constantFrom('path', 'sql', 'egress', 'physics'),
  reason: fc.constantFrom('would delete src/app.ts', 'network after secret read', 'row loss'),
});
const commandArb = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: fc.constantFrom(...'rm -rf src/_.x'.split('')) },
      { weight: 1, arbitrary: fc.constantFrom(...HIDDEN_CODE_POINTS).map((cp) => String.fromCodePoint(cp)) },
    ),
    { maxLength: 30 },
  )
  .map((a) => a.join(''));

const isolationArb = fc.record({
  mode: fc.constantFrom('docker-box', 'static-analysis'),
  p1Claimed: fc.boolean(),
  p5Claimed: fc.boolean(),
  p6Claimed: fc.boolean(),
  readOnlyMounts: fc.constant([]),
});

/** A warn or block RunResult carrying secret values in several places. */
const resultArb = fc
  .record({
    verdict: fc.constantFrom('warn', 'block'),
    violations: fc.array(violationArb, { maxLength: 8 }),
    isolation: isolationArb,
  })
  .map(({ verdict, violations, isolation }) => {
    const secretValues = [{ path: '.env', value: new TextEncoder().encode(SECRET) }];
    return /** @type {any} */ ({
      schemaVersion: 1,
      runId: 'ignored',
      status: 'ok',
      verdict,
      wardVerdict: {
        verdict,
        violations: verdict === 'block' ? violations : [],
        notices: verdict === 'warn' ? [{ kind: 'effect-outside', reason: 'network call to api.example', stepIndex: 0 }] : [],
        secretValues,
      },
      report: {
        snapshots: [],
        changes: [[{ kind: 'file-deleted', path: 'src/app.ts' }]],
        effectsOutside: [],
        observedEvents: [],
        variantResults: [],
        secretValues,
      },
      isolation,
      diagnostics: [],
    });
  });

describe('Property 13: Grave_Entry validity', () => {
  it('id, time, ward ids, link, secrets, and ui-kit Graveyard checks hold', () => {
    fc.assert(
      fc.property(resultArb, runIdArb, timeArb, commandArb, (result, runId, recordedAt, command) => {
        const entry = buildGraveEntry({ runId, command, recordedAt, result });
        expect(entry).not.toBeNull();
        if (entry === null) return;

        // id
        expect(entry.id).toMatch(ID_RE);
        expect(entry.id).toBe(`g-${runId}`);

        // time
        expect(entry.recordedAt).toMatch(TIME_FORMAT_RE);
        expect(Number.isNaN(Date.parse(entry.recordedAt))).toBe(false);
        expect(new Date(entry.recordedAt).toISOString().slice(0, 19) + 'Z').toBe(entry.recordedAt);

        // ward ids: distinct, first-appearance order
        const expected = [...new Set(result.wardVerdict.violations.map((/** @type {{ wardId: string }} */ v) => v.wardId))];
        expect(entry.wardIds).toEqual(expected);

        // the Grave_Id in the message link equals the entry id
        const d = decisionFromRunResult(result, { wardCount: 3, graveId: entry.id, seanceBase: 'http://localhost:5317', warnMode: 'exit2' });
        expect(d.exit).toBe(2);
        const m = /Seance: http:\/\/localhost:5317\/seance\/(\S+)/.exec(d.stderr);
        expect(m).not.toBeNull();
        expect(m?.[1]).toBe(entry.id);

        // no secretValues content in the serialization
        const json = JSON.stringify(entry);
        expect(json).not.toContain(SECRET);
        expect(json).not.toContain('secretValues');

        // ui-kit Graveyard: valid id, readable time
        const model = buildGraveyardModel([entry]);
        expect(model.kind).toBe('ok');
        const t = model.tombstones[0];
        expect(t.unreadable).toBe(false);
        expect(t.rawIdValid).toBe(true);
        expect(t.timeUnreadable).toBe(false);
      }),
      FC_PARAMS,
    );
  });

  it('returns null for a run id over 62 characters (g-<runId> over 64)', () => {
    fc.assert(
      fc.property(resultArb, longRunIdArb, timeArb, (result, runId, recordedAt) => {
        expect(buildGraveEntry({ runId, command: 'rm x', recordedAt, result })).toBeNull();
      }),
      FC_PARAMS,
    );
  });
});

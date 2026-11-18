import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { WardEngine } from '../src/wards.js';
import { renderMessage } from '../src/judge/message.js';
import type { EvaluateInputs, GhostReport, ObservedEvent, WardSet, WardVerdict } from '../src/types.js';
import { base64, base64url, hex, percentAll, utf8 } from './fixtures/encoders.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// Property 12: no secret value in any output.
// Canary values only: fake `sk-CANARY-` plus generated alphanumerics. Hosts use reserved domains.

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const canaryArb = fc
  .array(fc.constantFrom(...ALNUM), { minLength: 6, maxLength: 24 })
  .map((cs) => 'sk-CANARY-' + cs.join(''));

/** Raw, base64 and base64url (padded and unpadded), hex (both cases) and percent forms. */
function forms(canary: string): string[] {
  const b = utf8(canary);
  return [
    canary,
    base64(b, true),
    base64(b, false),
    base64url(b, true),
    base64url(b, false),
    hex(b, 'lower'),
    hex(b, 'upper'),
    percentAll(b),
  ];
}

const formArb = (canary: string): fc.Arbitrary<string> => fc.constantFrom(...forms(canary));

const WARDS: WardSet = {
  wards: [
    { id: 'no-delete', kind: 'path', deny: ['delete', 'overwrite'], paths: ['protected/**', '.env'] },
    { id: 'keep-rows', kind: 'sql', tables: ['users', 'orders'], max_rows_lost: 0 },
    { id: 'no-exfil', kind: 'egress', secrets: ['.env'], allow_hosts: ['registry.npmjs.org'] },
    {
      id: 'arm-safe',
      kind: 'physics',
      min_success_rate: 1,
      max_contact_force_n: 1,
      forbidden_contacts: ['drawer'],
    },
  ],
};

interface Scenario {
  readonly canary: string;
  readonly report: GhostReport<unknown>;
  readonly inputs: EvaluateInputs;
}

/** Places a different encoded form of the canary in destinations, paths, event ids, table names, variant ids. */
const scenarioArb: fc.Arbitrary<Scenario> = canaryArb.chain((canary) =>
  fc
    .tuple(
      fc.array(formArb(canary), { minLength: 5, maxLength: 5 }),
      fc.array(fc.constantFrom('a', '/', '-', '.', 'x1', ''), { minLength: 5, maxLength: 5 }),
      fc.array(fc.constantFrom('a', '/', '-', '.', 'x1', ''), { minLength: 5, maxLength: 5 }),
      fc.boolean(),
      fc.boolean(),
    )
    .map(([fs, pre, post, withEffect, extraPayload]): Scenario => {
      const wrap = (i: number): string => `${pre[i] as string}${fs[i] as string}${post[i] as string}`;
      const dest = `https://${(fs[0] as string).toLowerCase().replace(/[^a-z0-9]/g, 'x')}.test/${wrap(0)}`;
      const events: ObservedEvent[] = [
        { kind: 'secret-read', path: '.env', stepIndex: 0 },
        { kind: 'secret-read', path: `cfg/${wrap(1)}`, stepIndex: 0 },
        { kind: 'network-attempt', destination: dest, stepIndex: 1, eventId: `ev-${wrap(2)}` },
        { kind: 'network-attempt', destination: wrap(0), stepIndex: 1, eventId: 'ev-b' },
      ];
      const payloads = new Map<string, Uint8Array>([
        [`ev-${wrap(2)}`, utf8(`token=${fs[3] as string}`)],
        ['ev-b', utf8(`body ${canary}`)],
      ]);
      if (extraPayload) payloads.set(`orphan-${wrap(3)}`, utf8(canary));
      const report: GhostReport<unknown> = {
        snapshots: [],
        changes: [
          [
            { kind: 'file-deleted', path: `protected/${wrap(1)}` },
            { kind: 'file-overwritten', path: `protected/${wrap(4)}` },
          ],
          [
            { kind: 'sql-row-count', table: `users`, rowsBefore: 10, rowsAfter: 0 },
            { kind: 'sql-row-count', table: wrap(2), rowsBefore: 5, rowsAfter: 0, dropped: true },
          ],
        ],
        effectsOutside: [withEffect ? [{ kind: 'http', destination: dest }] : [], [{ kind: 'http', destination: wrap(3) }]],
        observedEvents: events,
        variantResults: [
          { variantId: wrap(4), success: false, contactForceN: 9, forbiddenContactOccurred: true },
        ],
      };
      const secretValues = new Map<string, Uint8Array>([['.env', utf8(`API_KEY=${canary}\n`)]]);
      return { canary, report, inputs: { secretValues, payloads } };
    }),
);

function assertNoLeak(canary: string, verdict: WardVerdict): void {
  const outputs: string[] = [JSON.stringify(verdict)];
  for (const claims of [undefined, { p5: false, p6: false }]) {
    outputs.push(
      renderMessage(verdict, {
        wardCount: WARDS.wards.length,
        ...(claims !== undefined ? { claims } : {}),
        seance: { id: 'run-1' },
      }),
    );
  }
  for (const out of outputs) {
    for (const f of forms(canary)) expect(out.includes(f)).toBe(false);
  }
}

describe('Property 12: no secret value in any output', () => {
  // Feature: wards, Property 12: No secret value in any output
  // **Validates: Requirements 9.9, 9.10, 11.4, 11.5, 17.6, 19.8**
  it(
    'verdict JSON and rendered message hold no canary form when it appears in destinations, paths, event ids, table names',
    () => {
      let blocked = 0;
      fc.assert(
        fc.property(scenarioArb, ({ canary, report, inputs }) => {
          const verdict = WardEngine.evaluate(report, WARDS, inputs);
          if (verdict.verdict === 'block') blocked++;
          assertNoLeak(canary, verdict);
        }),
        { numRuns: NUM_RUNS },
      );
      expect(blocked).toBeGreaterThan(0);
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 12: No secret value in any output
  // **Validates: Requirements 9.9, 9.10, 11.4, 11.5, 17.6, 19.8**
  it(
    'malformed or absent secretValues and payloads never leak a canary through the verdict, message or error text',
    () => {
      const malformedArb = fc.constantFrom<'non-string-key' | 'non-bytes-value' | 'null' | 'string' | 'absent' | 'empty'>(
        'non-string-key',
        'non-bytes-value',
        'null',
        'string',
        'absent',
        'empty',
      );
      fc.assert(
        fc.property(scenarioArb, malformedArb, (sc, kind) => {
          const { canary, report } = sc;
          const good = utf8(`API_KEY=${canary}\n`);
          let secretValues: unknown;
          switch (kind) {
            case 'non-string-key':
              secretValues = new Map<unknown, unknown>([
                [42, good],
                ['.env', good],
                [{ k: canary }, utf8(canary)],
              ]);
              break;
            case 'non-bytes-value':
              secretValues = new Map<unknown, unknown>([
                ['.env', good],
                [`bad/${base64(utf8(canary), false)}`, canary],
                [`bad2/${canary}`, [1, 2, 3]],
              ]);
              break;
            case 'null':
              secretValues = null;
              break;
            case 'string':
              secretValues = canary;
              break;
            case 'empty':
              secretValues = new Map();
              break;
            case 'absent':
              secretValues = undefined;
              break;
          }
          const badPayloads = new Map<unknown, unknown>([
            [7, utf8(canary)],
            [`p-${hex(utf8(canary), 'upper')}`, canary],
            ...(sc.inputs.payloads ?? []),
          ]);
          let verdict: WardVerdict | undefined;
          try {
            verdict = WardEngine.evaluate(report, WARDS, {
              secretValues,
              payloads: badPayloads,
            } as unknown as EvaluateInputs);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            for (const f of forms(canary)) expect(msg.includes(f)).toBe(false);
            return;
          }
          // The canary is only a known secret when a well-formed entry carries it.
          if (kind === 'non-string-key' || kind === 'non-bytes-value') assertNoLeak(canary, verdict);
          else {
            // No canary is known to the engine; the output still must not hold bytes of it
            // that came from the malformed container itself (only the report echoes sanitized text).
            expect(JSON.stringify(verdict)).not.toContain(`API_KEY=${canary}`);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('throws no canary-bearing error for hostile secretValues containers (fixed examples)', () => {
    const canary = 'sk-CANARY-abc123';
    const report: GhostReport<unknown> = {
      snapshots: [],
      changes: [],
      effectsOutside: [],
      observedEvents: [{ kind: 'secret-read', path: '.env', stepIndex: 0 }],
      variantResults: [],
    };
    for (const bad of [null, canary, 5, { [canary]: 1 }, [canary]]) {
      try {
        const v = WardEngine.evaluate(report, WARDS, { secretValues: bad } as unknown as EvaluateInputs);
        for (const f of forms(canary)) expect(JSON.stringify(v).includes(f)).toBe(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const f of forms(canary)) expect(msg.includes(f)).toBe(false);
      }
    }
  });
});

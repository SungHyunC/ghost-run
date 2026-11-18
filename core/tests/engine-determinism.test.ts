import fc from 'fast-check';
import { expect, it } from 'vitest';
import { WardEngine } from '../src/index.js';
import type {
  Change,
  Effect,
  GhostReport,
  ObservedEvent,
  VariantResult,
  Ward,
  WardSet,
  WardVerdict,
} from '../src/index.js';
import { base64, hex, utf8 } from './fixtures/encoders.js';
import { makeYielder, NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// Property 13: evaluate is deterministic, order-invariant and total.
// Hosts are reserved names, secrets are fake canaries.

// -- Helpers -----------------------------------------------------------------

const pick = <T>(xs: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...xs);
const json = (v: unknown): string => JSON.stringify(v);

/** Deterministic Fisher-Yates driven by generated integers. */
function shuffle<T>(xs: readonly T[], seeds: readonly number[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seeds[i % seeds.length] as number) % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const seedsArb = fc.array(fc.nat({ max: 10_000 }), { minLength: 8, maxLength: 8 });

/** Hostile strings are built from escapes only (no literal hidden characters). */
const HOSTILE = [
  '',
  '\u0000',
  '\ud800',
  '\u202e',
  '\u200b',
  '\u{e0041}',
  '../../x',
  '..',
  '*',
  '[',
  '\\',
  '%zz',
  '\r\n',
  'a'.repeat(300),
  'data/\u202ea.txt',
  '//',
];
const hostileArb: fc.Arbitrary<string> = fc.oneof(
  pick(HOSTILE),
  fc.string({ unit: 'binary', maxLength: 10 }),
  fc.string({ unit: 'grapheme', maxLength: 6 }),
);

const PATHS = [
  'data/a.txt',
  './data/a.txt',
  'DATA/A.TXT',
  'data//a.txt',
  'data/sub/../a.txt',
  'data/b.txt',
  'data/x/y.txt',
  'src/a.ts',
  'etc/app.conf',
  '../outside/x.txt',
  '../../up.txt',
  'a.txt',
];
const WARD_PATHS = ['data/**', 'data/a.txt', 'data/', '**/*.conf', 'src/*.ts', 'Data/A.TXT', 'etc/app.conf'];
const SECRET_PATHS = ['.env', 'dir/.env', '.ENV', './.env', 'secrets/token'];
const SECRET_PATTERNS = ['.env', '**/.env', 'secrets/*'];
const TABLES = ['users', 'orders', 'Users', 'USERS', 'logs'];
const HOSTS = ['api.example', 'cdn.example', 'a.b.example', 'evil.invalid', 'mail.test', 'localhost', '192.0.2.7'];
const HOST_ENTRIES = ['api.example', '*.example', 'api.example:443', 'localhost', '192.0.2.7', 'MAIL.TEST'];

const textArb = (pool: readonly string[]): fc.Arbitrary<string> =>
  fc.oneof({ weight: 6, arbitrary: pick(pool) }, { weight: 1, arbitrary: hostileArb });

const uniq = <T>(xs: readonly T[], min = 0): fc.Arbitrary<T[]> =>
  fc.uniqueArray(pick(xs), { minLength: min, maxLength: xs.length });

// -- Wards -------------------------------------------------------------------

const wardBodyArb = fc.oneof(
  fc.record({
    kind: fc.constant('path' as const),
    deny: fc.constantFrom<('delete' | 'overwrite')[]>(['delete'], ['overwrite'], ['delete', 'overwrite']),
    paths: fc.array(textArb(WARD_PATHS), { minLength: 1, maxLength: 3 }),
    case_sensitive: fc.constantFrom<boolean | undefined>(undefined, false, true),
  }).map(({ case_sensitive, ...r }) => (case_sensitive === undefined ? r : { ...r, case_sensitive })),
  fc.record({
    kind: fc.constant('sql' as const),
    tables: fc.array(textArb(TABLES), { minLength: 1, maxLength: 3 }),
    max_rows_lost: fc.integer({ min: 0, max: 50 }),
  }),
  fc.record({
    kind: fc.constant('egress' as const),
    secrets: fc.array(textArb(SECRET_PATTERNS), { minLength: 1, maxLength: 3 }),
    allow_hosts: fc.array(textArb(HOST_ENTRIES), { maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('physics' as const),
    min_success_rate: pick([0, 0.25, 0.5, 1]),
    max_contact_force_n: fc.integer({ min: 0, max: 100 }),
    forbidden_contacts: fc.array(textArb(['table', 'human']), { maxLength: 2 }),
  }),
);

const wardSetArb: fc.Arbitrary<WardSet> = fc
  .array(wardBodyArb, { maxLength: 5 })
  .chain((bodies) =>
    fc.uniqueArray(fc.oneof(textArb(['w', 'ward', 'a']), fc.nat({ max: 99 }).map((n) => `id${n}`)), {
      minLength: bodies.length,
      maxLength: bodies.length,
    }).map((ids) => ({ wards: bodies.map((b, i) => ({ id: ids[i] as string, ...b }) as Ward) })),
  );

// -- Reports -----------------------------------------------------------------

const rowsArb = fc.integer({ min: 0, max: 40 });

/** Well-typed changes, plus changes with a missing or wrong-typed field (design: ignored). */
const changeArb: fc.Arbitrary<Change> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: pick(['file-created', 'file-overwritten', 'file-deleted'] as const), path: textArb(PATHS) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('symlink-changed' as const),
      path: textArb(PATHS),
      targetBefore: pick(['a', 'b']),
      targetAfter: pick(['c', 'd']),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record(
      {
        kind: fc.constant('sql-row-count' as const),
        table: textArb(TABLES),
        rowsBefore: rowsArb,
        rowsAfter: rowsArb,
        dropped: fc.boolean(),
      },
      { requiredKeys: ['kind', 'table', 'rowsBefore', 'rowsAfter'] },
    ),
  },
  { weight: 1, arbitrary: fc.record({ kind: pick(['file-deleted', 'sql-row-count', 'other']), path: fc.oneof(fc.constant(undefined), fc.integer(), fc.constant(null)) }) as fc.Arbitrary<Change> },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('sql-row-count'), table: fc.constant('users'), rowsBefore: fc.constantFrom('3', NaN, Infinity, undefined), rowsAfter: fc.constant(0) }) as fc.Arbitrary<Change> },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('noop'), detail: hostileArb }) },
);

const canaryArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 8,
    maxLength: 16,
  })
  .map((cs) => 'sk-CANARY-' + cs.join(''));

interface Draft {
  readonly wards: WardSet;
  readonly steps: Change[][];
  readonly effects: Effect[][];
  readonly events: ObservedEvent[];
  readonly variants: VariantResult[];
  readonly secretEntries: [unknown, unknown][] | undefined;
  readonly payloadEntries: [unknown, unknown][] | undefined;
  readonly seeds: number[];
}

const eventArb = (ids: readonly string[]): fc.Arbitrary<ObservedEvent> =>
  fc.oneof(
    fc.record({
      kind: fc.constant('secret-read' as const),
      path: textArb(SECRET_PATHS),
      stepIndex: fc.integer({ min: 0, max: 3 }),
    }),
    fc.record(
      {
        kind: fc.constant('network-attempt' as const),
        destination: fc.oneof(
          pick(HOSTS).map((h) => `https://${h}/x`),
          pick(HOSTS),
          pick(HOSTS).map((h) => `${h}:443`),
          hostileArb,
        ),
        stepIndex: fc.integer({ min: 0, max: 3 }),
        eventId: fc.oneof(pick(ids), hostileArb),
      },
      { requiredKeys: ['kind', 'stepIndex'] },
    ),
  );

const variantArb: fc.Arbitrary<VariantResult> = fc.record(
  {
    variantId: textArb(['v1', 'v2', 'v3']),
    success: fc.boolean(),
    contactForceN: fc.integer({ min: 0, max: 150 }),
    forbiddenContactOccurred: fc.boolean(),
    jointLimitExceeded: fc.boolean(),
    selfCollisionOccurred: fc.boolean(),
  },
  { requiredKeys: ['variantId', 'success'] },
);

const IDS = ['e0', 'e1', 'e2', 'e3'];

const draftArb: fc.Arbitrary<Draft> = fc
  .record({
    wards: wardSetArb,
    steps: fc.array(fc.array(changeArb, { maxLength: 5 }), { maxLength: 3 }),
    effects: fc.array(
      fc.array(fc.record({ kind: pick(['network', 'external-db']), destination: textArb(HOSTS) }), { maxLength: 2 }),
      { maxLength: 3 },
    ),
    events: fc.array(eventArb(IDS), { maxLength: 6 }),
    variants: fc.array(variantArb, { maxLength: 4 }),
    canary: canaryArb,
    mode: fc.integer({ min: 0, max: 3 }),
    secretKeys: fc.array(fc.oneof(textArb(SECRET_PATHS), fc.constant(7 as unknown as string)), { maxLength: 4 }),
    secretShapes: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 4, maxLength: 4 }),
    payloadShapes: fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 4, maxLength: 4 }),
    payloadKeys: fc.uniqueArray(fc.oneof(pick([...IDS, 'orphan']), hostileArb), { maxLength: 4 }),
    seeds: seedsArb,
  })
  .map((r): Draft => {
    const raw = utf8(r.canary);
    const secretValueFor = (shape: number): unknown => {
      switch (shape) {
        case 0:
        case 1:
        case 2:
          return utf8(`API_KEY=${r.canary}\n`);
        case 3:
          return utf8('x'); // too short: discarded
        case 4:
          return 'API_KEY=text-not-bytes'; // malformed
        default:
          return undefined; // malformed
      }
    };
    const payloadFor = (shape: number): unknown => {
      switch (shape) {
        case 0:
          return utf8('token=' + r.canary);
        case 1:
          return utf8(base64(raw, true));
        case 2:
          return utf8(hex(raw, 'mixed'));
        case 3:
          return utf8('nothing to see');
        case 4:
          return 'string payload'; // malformed
        case 5:
          return null; // malformed
        case 6:
          return new Uint8Array(0);
        default:
          return utf8(base64(raw, false));
      }
    };
    // A Map holds one value per key, so entries are unique by key (insertion order is what varies).
    const secretEntries =
      r.mode === 0
        ? undefined
        : [...new Set(r.secretKeys)].map((k, i) => [k, secretValueFor(r.secretShapes[i] as number)] as [unknown, unknown]);
    const payloadEntries =
      r.mode === 0 || r.mode === 1
        ? undefined
        : r.payloadKeys.map((k, i) => [k, payloadFor(r.payloadShapes[i] as number)] as [unknown, unknown]);
    return {
      wards: r.wards,
      steps: r.steps,
      effects: r.effects,
      events: r.events,
      variants: r.variants,
      secretEntries,
      payloadEntries,
      seeds: r.seeds,
    };
  });

function reportOf(d: {
  steps: readonly Change[][];
  effects: readonly Effect[][];
  events: readonly ObservedEvent[];
  variants: readonly VariantResult[];
}): GhostReport<unknown> {
  return {
    snapshots: [],
    changes: d.steps,
    effectsOutside: d.effects,
    observedEvents: d.events,
    variantResults: d.variants,
  };
}

function inputsOf(
  secretEntries: readonly [unknown, unknown][] | undefined,
  payloadEntries: readonly [unknown, unknown][] | undefined,
): Parameters<typeof WardEngine.evaluate>[2] {
  if (secretEntries === undefined && payloadEntries === undefined) return undefined;
  return {
    ...(secretEntries !== undefined ? { secretValues: new Map(secretEntries) } : {}),
    ...(payloadEntries !== undefined ? { payloads: new Map(payloadEntries) } : {}),
  } as Parameters<typeof WardEngine.evaluate>[2];
}

const NOTICE_RANK: Record<string, number> = {
  'effect-outside': 0,
  'observed-event': 1,
  'content-inspection': 2,
  'path-escape': 3,
};

function checkOrdering(v: WardVerdict, wards: WardSet): void {
  const rank = new Map<string, number>();
  wards.wards.forEach((w, i) => rank.set(w.id, i));
  let last = -1;
  for (const x of v.violations) {
    const r = rank.get(x.wardId);
    if (r === undefined) continue; // id replaced by the leak guard marker
    expect(r).toBeGreaterThanOrEqual(last);
    last = r;
  }
  let lastKind = -1;
  for (const n of v.notices) {
    const r = NOTICE_RANK[n.kind] as number;
    expect(r).toBeGreaterThanOrEqual(lastKind);
    lastKind = r;
  }
}

// -- Property 13: determinism, order invariance, ordering, totality -----------

it(
  'evaluate is deterministic, order-invariant and ordered (hostile strings, malformed inputs)',
  async () => {
    // Feature: wards, Property 13: Evaluation is deterministic, order-invariant, and total
    // **Validates: Requirements 1.5, 5.4, 8.6, 9.2, 9.3, 9.10, 11.7, 17.3**
    const yieldNow = makeYielder();
    let executed = 0;
    await fc.assert(
      fc.asyncProperty(draftArb, async (d) => {
        await yieldNow();
        executed++;
        const report = reportOf(d);
        const first = WardEngine.evaluate(report, d.wards, inputsOf(d.secretEntries, d.payloadEntries));
        const again = WardEngine.evaluate(report, d.wards, inputsOf(d.secretEntries, d.payloadEntries));
        expect(again).toEqual(first);
        expect(json(again)).toBe(json(first));
        checkOrdering(first, d.wards);

        const shuffled = reportOf({
          ...d,
          steps: d.steps.map((s, i) => shuffle(s, d.seeds.map((x) => x + i))),
          events: shuffle(d.events, d.seeds),
        });
        const second = WardEngine.evaluate(
          shuffled,
          d.wards,
          inputsOf(
            d.secretEntries === undefined ? undefined : shuffle(d.secretEntries, d.seeds.map((x) => x + 3)),
            d.payloadEntries === undefined ? undefined : shuffle(d.payloadEntries, d.seeds.map((x) => x + 5)),
          ),
        );
        expect(json(second)).toBe(json(first));
      }),
      { numRuns: NUM_RUNS },
    );
    console.log(`P13 determinism: numRuns=${executed}`);
    expect(executed).toBe(NUM_RUNS);
  },
  PBT_TIMEOUT ?? 0,
);

it(
  'evaluate never throws and keeps verdict and violations consistent for hostile casts',
  async () => {
    // Feature: wards, Property 13: Evaluation is deterministic, order-invariant, and total
    // **Validates: Requirements 1.5, 5.4, 8.6, 9.2, 9.3, 9.10, 11.7, 17.3**
    const yieldNow = makeYielder();
    let executed = 0;
    const junkArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(null),
      fc.integer(),
      hostileArb,
      fc.array(fc.integer(), { maxLength: 3 }),
    );
    const castArb = fc.record({
      d: draftArb,
      junkKey: junkArb,
      junkValue: junkArb,
      hostileKey: hostileArb,
      hostileBytes: fc.uint8Array({ maxLength: 40 }),
    });
    await fc.assert(
      fc.asyncProperty(castArb, async ({ d, junkKey, junkValue, hostileKey, hostileBytes }) => {
        await yieldNow();
        executed++;
        const secrets: [unknown, unknown][] = [
          ...(d.secretEntries ?? []),
          [junkKey, junkValue],
          [hostileKey, hostileBytes],
          [hostileKey + 'x', junkValue],
        ];
        const payloads: [unknown, unknown][] = [
          ...(d.payloadEntries ?? []),
          [junkKey, hostileBytes],
          [hostileKey, junkValue],
        ];
        const report = reportOf(d);
        const run = (): WardVerdict => WardEngine.evaluate(report, d.wards, inputsOf(secrets, payloads));
        const a = run();
        const b = run();
        expect(json(b)).toBe(json(a));
        expect(['pass', 'warn', 'block']).toContain(a.verdict);
        if (a.violations.length > 0) expect(a.verdict).toBe('block');
        else if (a.notices.length > 0) expect(a.verdict).toBe('warn');
        else expect(a.verdict).toBe('pass');
        checkOrdering(a, d.wards);
      }),
      { numRuns: NUM_RUNS },
    );
    console.log(`P13 totality: numRuns=${executed}`);
    expect(executed).toBe(NUM_RUNS);
  },
  PBT_TIMEOUT ?? 0,
);

// -- Reference implementation of the old rules (inputs absent) -----------------

// Reports here contain no glob characters, no symlink changes and no ports.
// Paths and hosts are lower case, so case folding cannot matter.

const REF_SEGS = ['data', 'src', 'etc', 'a', 'b'];
const refPathArb = fc
  .array(pick(REF_SEGS), { minLength: 1, maxLength: 3 })
  .map((s) => s.join('/'));
const REF_TABLES = ['users', 'orders', 'logs'];
const REF_HOSTS = ['api.corp.example', 'a.b.corp.example', 'cdn.corp.example', 'evil.invalid', 'mail.test'];
const REF_ENTRIES = ['api.corp.example', '*.corp.example', 'mail.test'];
const REF_SECRETS = ['.env', 'secrets/token', 'secrets'];

const refWardArb = fc.oneof(
  fc.record({
    kind: fc.constant('path' as const),
    deny: fc.constantFrom<('delete' | 'overwrite')[]>(['delete'], ['overwrite'], ['delete', 'overwrite']),
    paths: fc.array(refPathArb, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('sql' as const),
    tables: uniq(REF_TABLES, 1),
    max_rows_lost: fc.integer({ min: 0, max: 30 }),
  }),
  fc.record({
    kind: fc.constant('egress' as const),
    secrets: uniq(REF_SECRETS, 1),
    allow_hosts: uniq(REF_ENTRIES),
  }),
  fc.record({
    kind: fc.constant('physics' as const),
    min_success_rate: pick([0, 0.25, 0.5, 0.75, 1]),
    max_contact_force_n: fc.integer({ min: 0, max: 100 }),
    forbidden_contacts: uniq(['table', 'human']),
  }),
);

const refCaseArb = fc.record({
  bodies: fc.array(refWardArb, { maxLength: 5 }),
  steps: fc.array(
    fc.array(
      fc.oneof(
        fc.record({ kind: pick(['file-created', 'file-overwritten', 'file-deleted'] as const), path: refPathArb }),
        fc
          .record({ kind: fc.constant('sql-row-count' as const), table: pick(REF_TABLES), rowsBefore: rowsArb, rowsAfter: rowsArb, dropped: fc.boolean() })
          .map((c) => (c.dropped ? c : { kind: c.kind, table: c.table, rowsBefore: c.rowsBefore, rowsAfter: c.rowsAfter })),
      ),
      { maxLength: 4 },
    ),
    { maxLength: 3 },
  ),
  effects: fc.array(fc.array(fc.record({ kind: pick(['network']), destination: pick(REF_HOSTS) }), { maxLength: 1 }), { maxLength: 3 }),
  reads: fc.array(fc.record({ path: pick(['.env', 'secrets/token', 'secrets/x', 'other']), stepIndex: fc.integer({ min: 0, max: 3 }) }), { maxLength: 2 }),
  nets: fc.array(
    fc.record({
      destination: fc.oneof(pick(REF_HOSTS), pick(REF_HOSTS).map((h) => `https://${h}/x`)),
      stepIndex: fc.integer({ min: 0, max: 3 }),
    }),
    { maxLength: 3 },
  ),
  variants: fc.array(variantArb.map((v) => ({ ...v, variantId: v.variantId.replace(/[^a-z0-9]/g, 'v') })), { maxLength: 4 }),
});

type RefWard = Ward;

/** Ids of wards the old rules would violate. */
function referenceViolated(
  wards: readonly RefWard[],
  r: { steps: readonly Change[][]; reads: { path: string; stepIndex: number }[]; nets: { destination: string; stepIndex: number }[]; variants: readonly VariantResult[] },
): Set<string> {
  const out = new Set<string>();
  const all = r.steps.flat();
  const hostOf = (d: string): string => d.replace(/^https:\/\//, '').replace(/\/.*$/, '');
  const allowed = (entries: readonly string[], host: string): boolean =>
    entries.some((e) =>
      e.startsWith('*.')
        ? host.endsWith(e.slice(1)) && host.length > e.length - 1 && !host.slice(0, host.length - e.length + 1).includes('.')
        : e === host,
    );
  for (const w of wards) {
    if (w.kind === 'path') {
      const hit = all.some((c) => {
        const op = c.kind === 'file-deleted' ? 'delete' : c.kind === 'file-overwritten' ? 'overwrite' : null;
        if (op === null || !w.deny.includes(op)) return false;
        const p = c['path'] as string;
        return w.paths.some((pat) => p === pat || p.startsWith(pat + '/'));
      });
      if (hit) out.add(w.id);
    } else if (w.kind === 'sql') {
      let lost = 0;
      for (const c of all) {
        if (c.kind !== 'sql-row-count' || !w.tables.includes(c['table'] as string)) continue;
        const before = c['rowsBefore'] as number;
        const after = c['rowsAfter'] as number;
        lost += Math.max(0, c['dropped'] === true ? before : before - after);
      }
      if (lost > w.max_rows_lost) out.add(w.id);
    } else if (w.kind === 'egress') {
      const reads = r.reads.filter((e) => w.secrets.some((s) => e.path === s || e.path.startsWith(s + '/')));
      if (reads.length === 0) continue;
      const first = Math.min(...reads.map((e) => e.stepIndex));
      if (r.nets.some((n) => n.stepIndex >= first && !allowed(w.allow_hosts, hostOf(n.destination)))) out.add(w.id);
    } else {
      const vs = r.variants;
      if (vs.length === 0) continue;
      const rate = vs.filter((v) => v.success).length / vs.length;
      const bad =
        rate < w.min_success_rate ||
        vs.some(
          (v) =>
            v.jointLimitExceeded === true ||
            v.selfCollisionOccurred === true ||
            (v.contactForceN !== undefined && v.contactForceN > w.max_contact_force_n) ||
            (v.forbiddenContactOccurred === true && w.forbidden_contacts.length > 0),
        );
      if (bad) out.add(w.id);
    }
  }
  return out;
}

it(
  'with inputs absent the verdict equals the old-rules reference for glob-free, symlink-free, port-free reports',
  async () => {
    // Feature: wards, Property 13: Evaluation is deterministic, order-invariant, and total
    // **Validates: Requirements 1.5, 5.4, 8.6, 9.2, 9.3, 9.10, 11.7, 17.3**
    const yieldNow = makeYielder();
    let executed = 0;
    let blocks = 0;
    await fc.assert(
      fc.asyncProperty(refCaseArb, async (c) => {
        await yieldNow();
        executed++;
        const wards: Ward[] = c.bodies.map((b, i) => ({ id: `w${i}`, ...b }) as Ward);
        const events: ObservedEvent[] = [
          ...c.reads.map((e): ObservedEvent => ({ kind: 'secret-read', path: e.path, stepIndex: e.stepIndex })),
          ...c.nets.map((e): ObservedEvent => ({ kind: 'network-attempt', destination: e.destination, stepIndex: e.stepIndex })),
        ];
        const report = reportOf({ steps: c.steps as Change[][], effects: c.effects, events, variants: c.variants });
        const v = WardEngine.evaluate(report, { wards });
        const violated = referenceViolated(wards, { steps: c.steps as Change[][], reads: c.reads, nets: c.nets, variants: c.variants });
        const expectedVerdict =
          violated.size > 0
            ? 'block'
            : c.effects.some((e) => e.length > 0) || events.length > 0
              ? 'warn'
              : 'pass';
        if (expectedVerdict === 'block') blocks++;
        expect(new Set(v.violations.map((x) => x.wardId))).toEqual(violated);
        expect(v.verdict).toBe(expectedVerdict);
      }),
      { numRuns: NUM_RUNS },
    );
    console.log(`P13 reference: numRuns=${executed}, block cases=${blocks}`);
    expect(executed).toBe(NUM_RUNS);
  },
  PBT_TIMEOUT ?? 0,
);

// Regression: two spellings of one protected path (`data/a.txt`, `DATA/A.TXT`) gave a
// message that depended on the order of `changes`.
it('regression: the violation message does not depend on the order of equivalent path spellings', () => {
  const wards: WardSet = { wards: [{ id: 'id0', kind: 'path', deny: ['delete'], paths: ['data/**'] }] };
  const a: Change = { kind: 'file-deleted', path: 'data/a.txt' };
  const b: Change = { kind: 'file-deleted', path: 'DATA/A.TXT' };
  const run = (step: Change[]): string => json(WardEngine.evaluate(reportOf({ steps: [step], effects: [], events: [], variants: [] }), wards));
  expect(run([a, b])).toBe(run([b, a]));
});

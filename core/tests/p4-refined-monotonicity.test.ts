import fc from 'fast-check';
import { expect, it } from 'vitest';
import { isMoreRestrictive, VERDICT_ORDER, WardEngine } from '../src/index.js';
import type {
  Change,
  Effect,
  EvaluateInputs,
  GhostReport,
  ObservedEvent,
  VariantResult,
  Ward,
  WardSet,
} from '../src/index.js';
import { describeClaimed } from './fixtures/claim-scope.js';
import { base64, base64url, breakLines, hex, percentAll, utf8 } from './fixtures/encoders.js';
import { makeYielder, NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { createCounter } from './pbt-stats.js';

// Refined P4: monotonicity with glob patterns, bypass spellings, host entries with
// ports and wildcards, case_sensitive, encoded-Canary payloads and secretValues.
// Soundness only: isMoreRestrictive(w1, w2) === true implies verdict(w2) >= verdict(w1).
// Hosts are reserved names or documentation/loopback addresses; canaries are fakes.

// -- Pools -------------------------------------------------------------------

const pick = <T>(xs: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...xs);
const subset = <T>(xs: readonly T[], minLength = 0): fc.Arbitrary<T[]> =>
  fc.uniqueArray(pick(xs), { minLength, maxLength: xs.length });

/** Path patterns: globs, literals and alternative spellings of the same path. */
const PATH_PATTERNS = [
  'data/**',
  'data/*.txt',
  '**/*.conf',
  'src/[ab]*.ts',
  'data/a.txt',
  '/data/a.txt',
  './data/b.txt',
  'data//b.txt',
  'Data/A.TXT',
  'docs/../data/a.txt',
  'data/db/',
  'etc/app.conf',
  'home/user/notes.md',
  'logs/**/*.log',
];
/** Change paths: bypass spellings (dot segments, double slash, case, escape). */
const CHANGE_PATHS = [
  'data/a.txt',
  '/data/a.txt',
  './data/a.txt',
  'data//a.txt',
  'DATA/A.TXT',
  'data/sub/../a.txt',
  'data/b.txt',
  'data/x/y/z.txt',
  'data/db/main.sqlite',
  'src/a.ts',
  'src/b.ts',
  'src/c.ts',
  'etc/app.conf',
  'etc/deep/app.conf',
  'logs/2026/01/run.log',
  'home/user/notes.md',
  '../outside/escape.txt',
  'a.txt',
];
const SECRET_PATTERNS = ['.env', '**/.env', './.env', '.ENV', 'secrets/*', 'config/*.key', 'secrets/**'];
const SECRET_FILES = ['.env', 'dir/.env', '.ENV', './.env', 'secrets/token', 'config/a.key', 'secrets/x/y'];
const TABLES = ['users', 'orders', 'logs', 'Sessions', 'USERS'];
const HOST_ENTRIES = [
  'api.example',
  'api.example:443',
  '*.example',
  '*.example:8443',
  'localhost',
  '[::1]',
  '[::1]:8443',
  '192.0.2.7',
  '192.0.2.7:80',
  'CDN.EXAMPLE',
  'mail.test',
];
const HOSTS = [
  'api.example',
  'cdn.example',
  'a.b.example',
  'evil.invalid',
  'mail.test',
  'localhost',
  '[::1]',
  '192.0.2.7',
  '192.0.2.8',
  'API.EXAMPLE',
];
const CONTACTS = ['table', 'human', 'wall', 'camera'];

const hasGlob = (s: string): boolean => /[*?[{]/.test(s);

// -- Ward arbitraries --------------------------------------------------------

const caseArb = fc.constantFrom<boolean | undefined>(undefined, false, true);

type WardBody = Ward extends infer W ? (W extends Ward ? Omit<W, 'id'> : never) : never;

const wardBodyArb: fc.Arbitrary<WardBody> = fc.oneof(
  fc
    .record({
      kind: fc.constant('path' as const),
      deny: fc.constantFrom<('delete' | 'overwrite')[]>(['delete'], ['overwrite'], ['delete', 'overwrite']),
      paths: subset(PATH_PATTERNS, 1),
      cs: caseArb,
    })
    .map(({ cs, ...r }) => (cs === undefined ? r : { ...r, case_sensitive: cs })),
  fc.record({
    kind: fc.constant('sql' as const),
    tables: subset(TABLES, 1),
    max_rows_lost: fc.integer({ min: 0, max: 200 }),
  }),
  fc.record({
    kind: fc.constant('egress' as const),
    secrets: subset(SECRET_PATTERNS, 1),
    allow_hosts: subset(HOST_ENTRIES),
  }),
  fc.record({
    kind: fc.constant('physics' as const),
    min_success_rate: pick([0, 0.25, 0.5, 0.75, 1]),
    max_contact_force_n: fc.integer({ min: 0, max: 100 }),
    forbidden_contacts: subset(CONTACTS),
  }),
);

const baseWardSetArb: fc.Arbitrary<WardSet> = fc
  .array(wardBodyArb, { maxLength: 6 })
  .map((bodies) => ({ wards: bodies.map((b, i) => ({ id: `w${i}`, ...b }) as Ward) }));

/** Randomness for one tightening step of one ward. */
const opArb = fc.record({
  add: fc.integer({ min: 0, max: 1000 }),
  op: fc.integer({ min: 0, max: 3 }),
  on: fc.boolean(),
});

function addTo(xs: readonly string[], pool: readonly string[], n: number): string[] {
  const free = pool.filter((p) => !xs.includes(p));
  return free.length === 0 ? [...xs] : [...xs, free[n % free.length] as string];
}

/** Tightens (or keeps) a ward. Never loosens. */
function tightenWard(w: Ward, r: { add: number; op: number; on: boolean }): Ward {
  if (!r.on) return w;
  switch (w.kind) {
    case 'path': {
      if (r.op === 0) return { ...w, paths: addTo(w.paths, PATH_PATTERNS, r.add) };
      if (r.op === 1) return { ...w, deny: ['delete', 'overwrite'] };
      if (r.op === 2 && w.case_sensitive === true) {
        const { case_sensitive: _drop, ...rest } = w;
        return r.add % 2 === 0 ? rest : { ...rest, case_sensitive: false };
      }
      return w;
    }
    case 'sql': {
      if (r.op === 0) return { ...w, tables: addTo(w.tables, TABLES, r.add) };
      if (r.op === 1 && w.max_rows_lost > 0) return { ...w, max_rows_lost: Math.floor(w.max_rows_lost / 2) };
      return w;
    }
    case 'egress': {
      if (r.op === 0) return { ...w, secrets: addTo(w.secrets, SECRET_PATTERNS, r.add) };
      if (w.allow_hosts.length > 0) {
        const i = r.add % w.allow_hosts.length;
        return { ...w, allow_hosts: w.allow_hosts.filter((_, j) => j !== i) };
      }
      return w;
    }
    case 'physics': {
      if (r.op === 0) return { ...w, forbidden_contacts: addTo(w.forbidden_contacts, CONTACTS, r.add) };
      if (r.op === 1 && w.min_success_rate < 1) return { ...w, min_success_rate: Math.min(1, w.min_success_rate + 0.25) };
      if (r.op === 2 && w.max_contact_force_n > 0) return { ...w, max_contact_force_n: Math.floor(w.max_contact_force_n / 2) };
      return w;
    }
  }
}

/** w2 with isMoreRestrictive(w1, w2): optional tightenings, plus added wards when none took effect. */
function stricterArb(w1: WardSet): fc.Arbitrary<WardSet> {
  return fc
    .record({
      ops: fc.array(opArb, { minLength: w1.wards.length, maxLength: w1.wards.length }),
      added: fc.array(wardBodyArb, { maxLength: 2 }),
      fallback: wardBodyArb,
    })
    .map(({ ops, added, fallback }) => {
      const tightened = w1.wards.map((w, i) => tightenWard(w, ops[i] as (typeof ops)[number]));
      const extra = added.map((b, i) => ({ id: `x${i}`, ...b }) as Ward);
      let w2: WardSet = { wards: [...tightened, ...extra] };
      if (!isMoreRestrictive(w1, w2)) {
        w2 = { wards: [...w2.wards, { id: 'x9', ...fallback } as Ward] };
      }
      return w2;
    });
}

const pairArb = baseWardSetArb.chain((w1) => stricterArb(w1).map((w2) => ({ w1, w2 })));

// -- Report and inputs -------------------------------------------------------

/** Literal (glob-free) entries of a ward set, used to aim reports at what w2 protects. */
function literals(ws: WardSet): { paths: string[]; tables: string[]; secrets: string[] } {
  const paths: string[] = [];
  const tables: string[] = [];
  const secrets: string[] = [];
  for (const w of ws.wards) {
    if (w.kind === 'path') paths.push(...w.paths.filter((p) => !hasGlob(p)));
    else if (w.kind === 'sql') tables.push(...w.tables);
    else if (w.kind === 'egress') secrets.push(...w.secrets.filter((p) => !hasGlob(p)));
  }
  return { paths, tables, secrets };
}

const withFallback = (xs: string[], fb: readonly string[]): readonly string[] => (xs.length > 0 ? [...xs, ...fb] : fb);

const SCHEMES = ['', 'https://', 'http://', 'tcp://'];
const destinationArb = fc
  .record({
    scheme: pick(SCHEMES),
    host: pick(HOSTS),
    port: fc.option(fc.constantFrom(80, 443, 8443), { nil: undefined }),
    tail: pick(['', '/x', '/a?b=1']),
  })
  .map((d) => `${d.scheme}${d.host}${d.port === undefined ? '' : ':' + d.port}${d.tail}`);

// Fake secret values only.
const canaryArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 12,
    maxLength: 20,
  })
  .map((cs) => 'sk-CANARY-' + cs.join(''));

/** Raw, base64 (offsets via prefix), base64url, hex, percent, line-broken, or noise. */
function payloadArb(canary: string): fc.Arbitrary<Uint8Array> {
  const raw = utf8(canary);
  return fc
    .record({
      form: fc.integer({ min: 0, max: 8 }),
      prefix: fc.integer({ min: 0, max: 3 }),
      pad: fc.boolean(),
    })
    .map(({ form, prefix, pad }) => {
      const body = utf8('x'.repeat(prefix));
      const withPrefix = new Uint8Array(body.length + raw.length);
      withPrefix.set(body, 0);
      withPrefix.set(raw, body.length);
      switch (form) {
        case 0:
          return utf8('token=' + canary);
        case 1:
          return utf8(base64(withPrefix, pad));
        case 2:
          return utf8(base64url(withPrefix, pad));
        case 3:
          return utf8(hex(raw, 'lower'));
        case 4:
          return utf8(hex(raw, 'upper'));
        case 5:
          return utf8(percentAll(raw));
        case 6:
          return utf8(breakLines(base64(withPrefix, true), 60));
        case 7:
          return utf8(breakLines(hex(raw, 'mixed'), 76));
        default:
          return utf8('nothing to see here');
      }
    });
}

const variantArb: fc.Arbitrary<VariantResult> = fc.record(
  {
    variantId: fc.string({ minLength: 1, maxLength: 4 }),
    success: fc.boolean(),
    contactForceN: fc.integer({ min: 0, max: 150 }),
    forbiddenContactOccurred: fc.boolean(),
    jointLimitExceeded: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    selfCollisionOccurred: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  },
  { requiredKeys: ['variantId', 'success'] },
);

const effectArb: fc.Arbitrary<Effect> = fc.record({
  kind: pick(['network', 'external-db']),
  destination: pick(HOSTS),
});

interface Case {
  readonly w1: WardSet;
  readonly w2: WardSet;
  readonly report: GhostReport<unknown>;
  readonly inputs: EvaluateInputs | undefined;
}

function reportArb(w2: WardSet): fc.Arbitrary<{ report: GhostReport<unknown>; inputs: EvaluateInputs | undefined }> {
  const lit = literals(w2);
  const paths = withFallback(lit.paths, CHANGE_PATHS);
  const tables = withFallback(lit.tables, TABLES);
  const secretReads = withFallback(lit.secrets, SECRET_FILES);

  const changeArb: fc.Arbitrary<Change> = fc.oneof(
    fc.record({
      kind: pick(['file-created', 'file-overwritten', 'file-deleted'] as const),
      path: fc.oneof(pick(CHANGE_PATHS), pick(paths)),
    }),
    fc.record({
      kind: fc.constant('symlink-changed' as const),
      path: fc.oneof(pick(CHANGE_PATHS), pick(paths)),
      targetBefore: pick(['a', 'b']),
      targetAfter: pick(['c', 'd']),
    }),
    fc
      .record({
        table: fc.oneof(pick(TABLES), pick(tables)),
        rowsBefore: fc.integer({ min: 0, max: 300 }),
        rowsAfter: fc.integer({ min: 0, max: 300 }),
        dropped: fc.boolean(),
      })
      .map((r) => ({ kind: 'sql-row-count' as const, ...r, ...(r.dropped ? { rowsAfter: 0 } : {}) })),
    fc.record({ kind: pick(['other-change', 'noop']), detail: fc.string({ maxLength: 6 }) }),
  );

  const eventsArb = fc.record({
    reads: fc.array(
      fc.record({ path: fc.oneof(pick(SECRET_FILES), pick(secretReads)), stepIndex: fc.integer({ min: 0, max: 5 }) }),
      { maxLength: 3 },
    ),
    nets: fc.array(fc.record({ destination: destinationArb, stepIndex: fc.integer({ min: 0, max: 8 }) }), {
      maxLength: 4,
    }),
  });

  return fc
    .record({
      focus: fc.integer({ min: 0, max: 5 }),
      changes: fc.array(changeArb, { maxLength: 6 }),
      chunk: fc.integer({ min: 1, max: 5 }),
      effects: fc.oneof({ weight: 3, arbitrary: fc.constant([] as Effect[]) }, { weight: 1, arbitrary: fc.array(effectArb, { maxLength: 3 }) }),
      events: eventsArb,
      variants: fc.oneof({ weight: 1, arbitrary: fc.constant([] as VariantResult[]) }, { weight: 2, arbitrary: fc.array(variantArb, { maxLength: 6 }) }),
      canary: canaryArb,
      provide: fc.integer({ min: 0, max: 3 }),
      secretFiles: fc.uniqueArray(pick(SECRET_FILES), { maxLength: 3 }),
      seeds: fc.array(fc.integer({ min: 0, max: 8 }), { minLength: 4, maxLength: 4 }),
    })
    .chain((r) =>
      fc
        .array(payloadArb(r.canary), { minLength: 4, maxLength: 4 })
        .map((payloadList) => ({ r, payloadList })),
    )
    .map(({ r, payloadList }) => {
      // Focus keeps most reports in one category so that pass->block pairs are common.
      const isSql = (c: Change): boolean => c.kind === 'sql-row-count';
      const changes = r.changes.filter((c) =>
        r.focus === 0 ? !isSql(c) : r.focus === 1 ? isSql(c) : r.focus === 5 || r.focus === 4 ? true : false,
      );
      const useEvents = r.focus === 2 || r.focus === 5;
      const useEffects = r.focus === 5 && r.effects.length > 0;
      const useVariants = r.focus === 3 || r.focus === 5;
      const steps: Change[][] = [];
      for (let i = 0; i < changes.length; i += r.chunk) steps.push(changes.slice(i, i + r.chunk));
      const effectsOutside: Effect[][] = steps.map(() => []);
      (useEffects ? r.effects : []).forEach((e, i) => {
        if (effectsOutside.length > 0) effectsOutside[i % effectsOutside.length]?.push(e);
      });
      const payloads = new Map<string, Uint8Array>();
      const observedEvents: ObservedEvent[] = useEvents ? [
        ...r.events.reads.map((e): ObservedEvent => ({ kind: 'secret-read', path: e.path, stepIndex: e.stepIndex })),
        ...r.events.nets.map((e, i): ObservedEvent => {
          const eventId = `e${i}`;
          if (r.provide > 0) payloads.set(eventId, payloadList[i] as Uint8Array);
          return { kind: 'network-attempt', destination: e.destination, stepIndex: e.stepIndex, eventId };
        }),
      ] : [];
      const secretValues = new Map<string, Uint8Array>(
        r.secretFiles.map((p) => [p, utf8(`API_KEY=${r.canary}\n`)] as [string, Uint8Array]),
      );
      const inputs: EvaluateInputs | undefined =
        r.provide === 0 ? undefined : r.provide === 1 ? { payloads } : { secretValues, payloads };
      return {
        report: {
          snapshots: [],
          changes: steps,
          effectsOutside,
          observedEvents,
          variantResults: useVariants ? r.variants : [],
        },
        inputs,
      };
    });
}

/** Evidence that violates a ward which w2 tightened relative to w1 (or added). */
type Evidence =
  | { readonly change: Change }
  | { readonly event: ObservedEvent }
  | { readonly variant: VariantResult };

function evidenceFor(w1: WardSet, w2: WardSet): Evidence[] {
  const byId1 = new Map(w1.wards.map((w) => [w.id, w]));
  const out: Evidence[] = [];
  let step = 0;
  for (const w of w2.wards) {
    const old = byId1.get(w.id);
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(w)) continue;
    if (w.kind === 'path') {
      const lits = w.paths.filter((p) => !hasGlob(p));
      for (const p of lits) {
        for (const spelling of [p, `./${p}`, p.toUpperCase()]) {
          out.push({ change: { kind: 'file-deleted', path: spelling } });
          out.push({ change: { kind: 'file-overwritten', path: spelling } });
        }
      }
      out.push({ change: { kind: 'file-deleted', path: 'data/a.txt' } });
      out.push({ change: { kind: 'file-overwritten', path: 'src/a.ts' } });
    } else if (w.kind === 'sql') {
      const lossA = old !== undefined && old.kind === 'sql' ? old.max_rows_lost : 300;
      for (const t of w.tables) {
        out.push({ change: { kind: 'sql-row-count', table: t, rowsBefore: lossA, rowsAfter: 0 } });
        out.push({ change: { kind: 'sql-row-count', table: t, rowsBefore: 300, rowsAfter: 0 } });
        out.push({ change: { kind: 'sql-row-count', table: t.toLowerCase(), rowsBefore: 5, rowsAfter: 0, dropped: true } });
      }
    } else if (w.kind === 'egress') {
      const removed =
        old !== undefined && old.kind === 'egress' ? old.allow_hosts.filter((h) => !w.allow_hosts.includes(h)) : [];
      const dests = [...removed.map((h) => `https://${h}/x`), 'https://evil.invalid/x'];
      const secretPaths = w.secrets.filter((p) => !hasGlob(p)).concat('.env', 'dir/.env');
      for (const sp of secretPaths) {
        out.push({ event: { kind: 'secret-read', path: sp, stepIndex: 0 } });
      }
      for (const d of dests) {
        out.push({ event: { kind: 'network-attempt', destination: d, stepIndex: 1 + (step++ % 3) } });
      }
    } else {
      const loose = old !== undefined && old.kind === 'physics' ? old.max_contact_force_n : 150;
      out.push({ variant: { variantId: 'v1', success: false } });
      out.push({ variant: { variantId: 'v2', success: true, contactForceN: loose } });
      out.push({ variant: { variantId: 'v3', success: true, forbiddenContactOccurred: true } });
      out.push({ variant: { variantId: 'v4', success: true, jointLimitExceeded: true } });
      out.push({ variant: { variantId: 'v5', success: true, selfCollisionOccurred: true } });
    }
  }
  return out;
}

/** Report assembled from evidence aimed at what w2 tightened. */
function targetedArb(w1: WardSet, w2: WardSet): fc.Arbitrary<{ report: GhostReport<unknown>; inputs: EvaluateInputs | undefined }> {
  const evidence = evidenceFor(w1, w2);
  return fc
    .subarray(evidence, { minLength: Math.min(1, evidence.length), maxLength: Math.min(4, evidence.length) })
    .map((picked) => {
      const changes: Change[] = [];
      const events: ObservedEvent[] = [];
      const variants: VariantResult[] = [];
      for (const e of picked) {
        if ('change' in e) changes.push(e.change);
        else if ('event' in e) events.push(e.event);
        else variants.push(e.variant);
      }
      return {
        report: {
          snapshots: [],
          changes: changes.length > 0 ? [changes] : [],
          effectsOutside: changes.length > 0 ? [[]] : [],
          observedEvents: events,
          variantResults: variants,
        },
        inputs: undefined,
      };
    });
}

const caseArbitrary: fc.Arbitrary<Case> = pairArb.chain(({ w1, w2 }) =>
  fc
    .oneof({ weight: 1, arbitrary: reportArb(w2) }, { weight: 3, arbitrary: targetedArb(w1, w2) })
    .map(({ report, inputs }) => ({ w1, w2, report, inputs })),
);

// -- Properties --------------------------------------------------------------

describeClaimed('P4', () => {
  // Feature: wards, Property 1: Ward monotonicity with the refined rules (P4)
  // **Validates: Requirements 4.6, 11.2, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
  it(
    'sanity: the generated w2 always satisfies isMoreRestrictive(w1, w2)',
    () => {
      let executed = 0;
      fc.assert(
        fc.property(pairArb, ({ w1, w2 }) => {
          executed++;
          expect(isMoreRestrictive(w1, w2)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
      expect(executed).toBe(NUM_RUNS);
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 1: Ward monotonicity with the refined rules (P4)
  // **Validates: Requirements 4.6, 11.2, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
  it(
    'a stricter ward set never yields a milder verdict (soundness)',
    async () => {
      const yieldNow = makeYielder();
      const pairs = createCounter('P4 refined verdict pairs (v1->v2)');
      let executed = 0;
      let strictlyStricter = 0;
      await fc.assert(
        fc.asyncProperty(caseArbitrary, async ({ w1, w2, report, inputs }) => {
          await yieldNow();
          executed++;
          const v1 = WardEngine.evaluate(report, w1, inputs).verdict;
          const v2 = WardEngine.evaluate(report, w2, inputs).verdict;
          pairs.add(`${v1}->${v2}`);
          if (VERDICT_ORDER[v1] < VERDICT_ORDER[v2]) strictlyStricter++;
          expect(VERDICT_ORDER[v2]).toBeGreaterThanOrEqual(VERDICT_ORDER[v1]);
        }),
        { numRuns: NUM_RUNS },
      );
      pairs.print();
      console.log(`P4 refined stats: runs=${executed}, v1<v2 count=${strictlyStricter}/${NUM_RUNS}`);
      expect(executed).toBe(NUM_RUNS);
      expect(strictlyStricter / NUM_RUNS).toBeGreaterThanOrEqual(0.15);
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 1: Ward monotonicity with the refined rules (P4), case_sensitive part
  // **Validates: Requirements 15.4, 15.5**
  it(
    'a case-insensitive path ward never yields a milder verdict than the case-sensitive one',
    async () => {
      const yieldNow = makeYielder();
      const arb = fc
        .record({
          deny: fc.constantFrom<('delete' | 'overwrite')[]>(['delete'], ['overwrite'], ['delete', 'overwrite']),
          paths: subset(PATH_PATTERNS, 1),
          insensitive: fc.constantFrom<boolean | undefined>(undefined, false),
        })
        .chain((w) =>
          reportArb({ wards: [{ id: 'p', kind: 'path', deny: w.deny, paths: w.paths }] }).map(({ report, inputs }) => ({
            w,
            report,
            inputs,
          })),
        );
      let executed = 0;
      await fc.assert(
        fc.asyncProperty(arb, async ({ w, report, inputs }) => {
          await yieldNow();
          executed++;
          const base = { id: 'p', kind: 'path' as const, deny: w.deny, paths: w.paths };
          const sensitive: WardSet = { wards: [{ ...base, case_sensitive: true }] };
          const insensitive: WardSet = {
            wards: [w.insensitive === undefined ? base : { ...base, case_sensitive: w.insensitive }],
          };
          const vs = WardEngine.evaluate(report, sensitive, inputs).verdict;
          const vi = WardEngine.evaluate(report, insensitive, inputs).verdict;
          expect(VERDICT_ORDER[vi]).toBeGreaterThanOrEqual(VERDICT_ORDER[vs]);
        }),
        { numRuns: NUM_RUNS },
      );
      expect(executed).toBe(NUM_RUNS);
    },
    PBT_TIMEOUT ?? 0,
  );
});

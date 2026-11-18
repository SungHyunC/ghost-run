import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isMoreRestrictive, VERDICT_ORDER, WardEngine } from '../src/index.js';
import type {
  Change,
  Effect,
  GhostReport,
  ObservedEvent,
  VariantResult,
  Ward,
  WardSet,
} from '../src/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { createCounter } from './pbt-stats.js';

// -- Pools -------------------------------------------------------------------
// Small pools so that wards and reports overlap often. No glob characters
// (*, ?, [, {) in any path: globs are unsupported until the later wards spec.

const PATHS = [
  '/data/a.txt',
  '/data/b.txt',
  '/data/db/',
  '/data/db/main.sqlite',
  '/etc/app.conf',
  '/home/user/.env',
  '/home/user/notes.md',
  '/srv/www/index.html',
];
const SECRET_PATHS = ['/home/user/.env', '/home/user/.ssh/', '/etc/app.secret'];
const TABLES = ['users', 'orders', 'logs', 'sessions'];
const HOSTS = ['api.example', 'cdn.example', 'evil.invalid', 'mail.test', 'localhost'];
const CONTACTS = ['table', 'human', 'wall', 'camera'];

const pick = <T>(xs: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...xs);
const subset = <T>(xs: readonly T[], minLength = 0): fc.Arbitrary<T[]> =>
  fc.uniqueArray(pick(xs), { minLength, maxLength: xs.length });

// -- Ward arbitraries --------------------------------------------------------

type WardBody = Ward extends infer W ? (W extends Ward ? Omit<W, 'id'> : never) : never;

const wardBodyArb: fc.Arbitrary<WardBody> = fc.oneof(
  fc.record({
    kind: fc.constant('path' as const),
    deny: fc.constantFrom<('delete' | 'overwrite')[]>(
      ['delete'],
      ['overwrite'],
      ['delete', 'overwrite'],
    ),
    paths: subset(PATHS, 1),
  }),
  fc.record({
    kind: fc.constant('sql' as const),
    tables: subset(TABLES, 1),
    max_rows_lost: fc.integer({ min: 0, max: 200 }),
  }),
  fc.record({
    kind: fc.constant('egress' as const),
    secrets: subset(SECRET_PATHS, 1),
    allow_hosts: subset(HOSTS),
  }),
  fc.record({
    kind: fc.constant('physics' as const),
    min_success_rate: pick([0, 0.25, 0.5, 0.75, 1]),
    max_contact_force_n: fc.integer({ min: 0, max: 100 }),
    forbidden_contacts: subset(CONTACTS),
  }),
);

/** Random WardSet with unique ids, up to 8 wards, covering all four kinds. */
export const baseWardSetArb: fc.Arbitrary<WardSet> = fc
  .array(wardBodyArb, { maxLength: 8 })
  .map((bodies) => ({
    wards: bodies.map((b, i) => ({ id: `w${i}`, ...b }) as Ward),
  }));

/** An element not in `xs` (deterministic). */
function fresh(xs: readonly string[], base: string): string {
  let n = xs.length;
  while (xs.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * Tightening ops. Each returns a ward that is tighter or equal; never looser.
 * `forced` ops (the first group) always produce a strict tightening.
 */
const FORCED_OPS = 0;
const OPTIONAL_OPS = 4;

function tightenWard(w: Ward, op: number, forced: boolean): Ward {
  switch (w.kind) {
    case 'path': {
      if (forced || op === 0) return { ...w, paths: [...w.paths, fresh(w.paths, '/fresh/p')] };
      if (op === 1 && w.deny.length < 2) return { ...w, deny: ['delete', 'overwrite'] };
      return w;
    }
    case 'sql': {
      if (forced || op === 0) return { ...w, tables: [...w.tables, fresh(w.tables, 'tbl')] };
      if (op === 1 && w.max_rows_lost > 0) {
        return { ...w, max_rows_lost: Math.floor(w.max_rows_lost / 2) };
      }
      return w;
    }
    case 'egress': {
      if (forced || op === 0) return { ...w, secrets: [...w.secrets, fresh(w.secrets, '/fresh/s')] };
      if (op === 1 && w.allow_hosts.length > 0) return { ...w, allow_hosts: w.allow_hosts.slice(1) };
      return w;
    }
    case 'physics': {
      if (forced || op === 0) {
        return { ...w, forbidden_contacts: [...w.forbidden_contacts, fresh(w.forbidden_contacts, 'c')] };
      }
      if (op === 1 && w.min_success_rate < 1) {
        return { ...w, min_success_rate: Math.min(1, w.min_success_rate + 0.25) };
      }
      if (op === 2 && w.max_contact_force_n > 0) {
        return { ...w, max_contact_force_n: Math.floor(w.max_contact_force_n / 2) };
      }
      return w;
    }
  }
}

/**
 * Generates `w2` with isMoreRestrictive(w1, w2) guaranteed: either a ward is
 * added, or one ward gets a forced strict tightening. Other wards may be
 * tightened further (add path entry, add deny, lower max_rows_lost, revoke
 * allow_hosts, raise min_success_rate, lower force limit, ...). Nothing is
 * ever loosened or removed.
 */
export function stricterWardSetArb(w1: WardSet): fc.Arbitrary<WardSet> {
  const n = w1.wards.length;
  return fc
    .record({
      ops: fc.array(fc.integer({ min: 0, max: OPTIONAL_OPS }), { minLength: n, maxLength: n }),
      forcedIndex: n === 0 ? fc.constant(-1) : fc.integer({ min: -1, max: n - 1 }),
      added: fc.array(wardBodyArb, { maxLength: 2 }),
    })
    .map(({ ops, forcedIndex, added }) => {
      const ids = w1.wards.map((w) => w.id);
      const newWards: Ward[] = [];
      for (const b of added) {
        const id = fresh([...ids, ...newWards.map((w) => w.id)], 'x');
        newWards.push({ id, ...b } as Ward);
      }
      // Guarantee at least one strict tightening.
      let idx = forcedIndex;
      if (newWards.length === 0 && idx < 0) {
        if (n === 0) {
          newWards.push({ id: 'x0', kind: 'sql', tables: ['users'], max_rows_lost: 0 });
        } else {
          idx = 0;
        }
      }
      const tightened = w1.wards.map((w, i) =>
        tightenWard(w, ops[i] ?? FORCED_OPS, i === idx),
      );
      return { wards: [...tightened, ...newWards] };
    });
}

// -- Report arbitrary --------------------------------------------------------

const changeArb: fc.Arbitrary<Change> = fc.oneof(
  fc.record({
    kind: pick(['file-created', 'file-overwritten', 'file-deleted'] as const),
    path: pick(PATHS),
  }),
  fc.record({
    kind: fc.constant('symlink-changed' as const),
    path: pick(PATHS),
    targetBefore: fc.constantFrom('a', 'b'),
    targetAfter: fc.constantFrom('c', 'd'),
  }),
  fc
    .record({
      table: pick(TABLES),
      rowsBefore: fc.integer({ min: 0, max: 300 }),
      rowsAfter: fc.integer({ min: 0, max: 300 }),
    })
    .map((r) => ({ kind: 'sql-row-count', ...r })),
  fc.record({ kind: pick(['other-change', 'noop']), detail: fc.string({ maxLength: 8 }) }),
);

const effectArb: fc.Arbitrary<Effect> = fc.record({
  kind: pick(['network', 'external-db']),
  destination: pick(HOSTS),
});

const eventArb: fc.Arbitrary<ObservedEvent> = fc.oneof(
  fc.record({
    kind: fc.constant('secret-read' as const),
    path: pick(SECRET_PATHS),
    stepIndex: fc.integer({ min: 0, max: 9 }),
  }),
  fc.record({
    kind: fc.constant('network-attempt' as const),
    destination: pick(HOSTS.map((h) => `https://${h}/x`).concat(HOSTS)),
    stepIndex: fc.integer({ min: 0, max: 9 }),
  }),
);

const variantArb: fc.Arbitrary<VariantResult> = fc.record(
  {
    variantId: fc.string({ minLength: 1, maxLength: 4 }),
    success: fc.boolean(),
    contactForceN: fc.integer({ min: 0, max: 150 }),
    forbiddenContactOccurred: fc.boolean(),
  },
  { requiredKeys: ['variantId', 'success'] },
);

/** Split `items` into consecutive per-step groups of size `chunk`. */
function chunked<T>(items: readonly T[], chunk: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunk) out.push(items.slice(i, i + chunk));
  return out;
}

/** Ghost report with 0-100 changes; effectsOutside/observedEvents appear sometimes. */
export const ghostReportArb: fc.Arbitrary<GhostReport<unknown>> = fc
  .record({
    changes: fc.array(changeArb, { maxLength: 100 }),
    chunk: fc.integer({ min: 1, max: 10 }),
    effects: fc.oneof(
      { weight: 3, arbitrary: fc.constant([] as Effect[]) },
      { weight: 1, arbitrary: fc.array(effectArb, { maxLength: 4 }) },
    ),
    events: fc.oneof(
      { weight: 2, arbitrary: fc.constant([] as ObservedEvent[]) },
      { weight: 2, arbitrary: fc.array(eventArb, { maxLength: 6 }) },
    ),
    variants: fc.array(variantArb, { maxLength: 8 }),
  })
  .map(({ changes, chunk, effects, events, variants }) => {
    const steps = chunked(changes, chunk);
    // Spread the effects over the steps (empty array for steps without any).
    const effectsOutside: Effect[][] = steps.map(() => []);
    effects.forEach((e, i) => {
      if (effectsOutside.length > 0) effectsOutside[i % effectsOutside.length]?.push(e);
    });
    return {
      snapshots: [],
      changes: steps,
      effectsOutside,
      observedEvents: events,
      variantResults: variants,
    };
  });

// -- Property ----------------------------------------------------------------

const pairArb = baseWardSetArb.chain((w1) =>
  stricterWardSetArb(w1).map((w2) => ({ w1, w2 })),
);

/** Items that appear in w2's wards but not anywhere in w1 (what the tightening added). */
function addedItems(w1: WardSet, w2: WardSet) {
  const collect = (ws: WardSet) => {
    const paths = new Set<string>();
    const tables = new Set<string>();
    const secrets = new Set<string>();
    for (const w of ws.wards) {
      if (w.kind === 'path') w.paths.forEach((x) => paths.add(x));
      else if (w.kind === 'sql') w.tables.forEach((x) => tables.add(x));
      else if (w.kind === 'egress') w.secrets.forEach((x) => secrets.add(x));
    }
    return { paths, tables, secrets };
  };
  const a = collect(w1);
  const b = collect(w2);
  const diff = (x: Set<string>, y: Set<string>) => [...x].filter((v) => !y.has(v));
  return {
    paths: diff(b.paths, a.paths),
    tables: diff(b.tables, a.tables),
    secrets: diff(b.secrets, a.secrets),
  };
}

/**
 * Report aimed at the tightening: changes/events touch only items that w2 added
 * (so w1 tends to be milder than w2). Events are optional so that both
 * pass->block and warn->block pairs appear.
 */
function targetedReportArb(w1: WardSet, w2: WardSet): fc.Arbitrary<GhostReport<unknown>> {
  const { paths, tables, secrets } = addedItems(w1, w2);
  const changes: fc.Arbitrary<Change>[] = [];
  if (paths.length > 0) {
    changes.push(
      fc.record({
        kind: pick(['file-deleted', 'file-overwritten'] as const),
        path: pick(paths),
      }),
      fc.record({
        kind: fc.constant('symlink-changed' as const),
        path: pick(paths),
        targetBefore: fc.constantFrom('a', 'b'),
        targetAfter: fc.constantFrom('c', 'd'),
      }),
    );
  }
  if (tables.length > 0) {
    changes.push(
      fc.record({
        kind: fc.constant('sql-row-count' as const),
        table: pick(tables),
        rowsBefore: fc.integer({ min: 100, max: 300 }),
        rowsAfter: fc.integer({ min: 0, max: 5 }),
      }),
    );
  }
  const changeList = changes.length > 0 ? fc.array(fc.oneof(...changes), { minLength: 1, maxLength: 3 }) : fc.constant([] as Change[]);
  const eventList: fc.Arbitrary<ObservedEvent[]> =
    secrets.length > 0
      ? fc.oneof(
          fc.constant([] as ObservedEvent[]),
          pick(secrets).map((path) => [
            { kind: 'secret-read' as const, path, stepIndex: 0 },
            { kind: 'network-attempt' as const, destination: 'https://evil.invalid/x', stepIndex: 1 },
          ]),
          fc.array(eventArb, { maxLength: 4 }),
        )
      : fc.oneof(fc.constant([] as ObservedEvent[]), fc.array(eventArb, { maxLength: 4 }));
  return fc.record({ c: changeList, e: eventList }).map(({ c, e }) => ({
    snapshots: [],
    changes: c.length > 0 ? [c] : [],
    effectsOutside: c.length > 0 ? [[]] : [],
    observedEvents: e,
    variantResults: [],
  }));
}

/** Pair plus a report: half random, half aimed at the tightening. */
const caseArb = pairArb.chain(({ w1, w2 }) =>
  fc
    .oneof(ghostReportArb, targetedReportArb(w1, w2))
    .map((report) => ({ w1, w2, report })),
);

/** Number of samples actually executed by the last run of each property. */
export const executedRuns = { sanity: 0, p4: 0 };

describe('P4: ward verdict monotonicity', () => {
  it(
    'sanity: stricterWardSetArb(w1) always satisfies isMoreRestrictive(w1, w2)',
    () => {
      executedRuns.sanity = 0;
      fc.assert(
        fc.property(pairArb, ({ w1, w2 }) => {
          executedRuns.sanity++;
          expect(isMoreRestrictive(w1, w2)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
      console.log(`P4 sanity runs executed: ${executedRuns.sanity}`);
      expect(executedRuns.sanity).toBe(NUM_RUNS);
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: core-contract, Property 4: ward verdict monotonicity
  // **Validates: Requirements 11.4**
  it(
    'a stricter ward set never yields a milder verdict',
    () => {
      executedRuns.p4 = 0;
      const pairs = createCounter('P4 verdict pairs (v1->v2)');
      let strictlyStricter = 0;
      fc.assert(
        fc.property(caseArb, ({ w1, w2, report }) => {
          executedRuns.p4++;
          const v1 = WardEngine.evaluate(report, w1).verdict;
          const v2 = WardEngine.evaluate(report, w2).verdict;
          pairs.add(`${v1}->${v2}`);
          if (VERDICT_ORDER[v1] < VERDICT_ORDER[v2]) strictlyStricter++;
          expect(VERDICT_ORDER[v2]).toBeGreaterThanOrEqual(VERDICT_ORDER[v1]);
        }),
        { numRuns: NUM_RUNS },
      );
      console.log(`P4 runs executed: ${executedRuns.p4} (sanity: ${executedRuns.sanity})`);
      pairs.print();
      console.log(`P4 stats: v1<v2 count=${strictlyStricter}/${NUM_RUNS}`);
      expect(executedRuns.p4).toBe(NUM_RUNS);
      expect(strictlyStricter).toBeGreaterThan(0);
      expect(strictlyStricter / NUM_RUNS).toBeGreaterThanOrEqual(0.15);
    },
    PBT_TIMEOUT ?? 0,
  );
});

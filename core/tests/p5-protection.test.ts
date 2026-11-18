import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun, WardEngine } from '../src/index.js';
import type { Ward, WardSet } from '../src/index.js';
import { describeClaimed } from './fixtures/claim-scope.js';
import { FsWorld } from './fixtures/fs-world.js';
import type { FsAction, FsLeafAction, FsState } from './fixtures/fs-world.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// P5 (judgment half) is claimed only where P1 holds. The fixture world is an
// in-memory copy, so P1 holds; the test also checks the fingerprint before and
// after each ghost run. It does not claim that the engine resolves links: the
// fixture reports resolved paths itself.

const TIMEOUT = PBT_TIMEOUT ?? 0;

// -- Generators --------------------------------------------------------------

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const nameArb = fc
  .array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(''));
const extArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 3 })
  .map((cs) => cs.join(''));

interface Target {
  /** Pattern written in the protecting ward. */
  readonly pattern: string;
  /** An existing file (lower-case, normalized) that the pattern protects. */
  readonly victim: string;
}

const targetArb: fc.Arbitrary<Target> = fc.oneof(
  nameArb.map((n) => ({ pattern: 'data/**', victim: `data/${n}.txt` })),
  fc.tuple(nameArb, nameArb).map(([d, n]) => ({ pattern: 'data/**', victim: `data/${d}/${n}` })),
  nameArb.map((n) => ({ pattern: 'db/*.sqlite', victim: `db/${n}.sqlite` })),
  fc.constant({ pattern: '.env', victim: '.env' }),
  nameArb.map((n) => ({ pattern: '**/*.pem', victim: `${n}.pem` })),
  fc.tuple(nameArb, nameArb).map(([d, n]) => ({ pattern: '**/*.pem', victim: `${d}/${n}.pem` })),
  fc
    .tuple(nameArb, nameArb, nameArb)
    .map(([d, e, n]) => ({ pattern: '**/*.pem', victim: `${d}/${e}/${n}.pem` })),
  fc.tuple(nameArb, nameArb).map(([d, n]) => ({ pattern: d, victim: `${d}/${n}` })),
  fc.tuple(nameArb, nameArb).map(([d, n]) => ({ pattern: d, victim: `${d}/${n}/${n}.bin` })),
  fc
    .tuple(nameArb, extArb, nameArb)
    .map(([d, e, n]) => ({ pattern: `${d}/*.${e}`, victim: `${d}/${n}.${e}` })),
  fc.tuple(nameArb, nameArb, nameArb).map(([d, s, n]) => ({
    pattern: `${d}/**/${s}.log`,
    victim: `${d}/${n}/${s}.log`,
  })),
);

type Variant = 'plain' | 'dot' | 'dotmid' | 'dslash' | 'dotdot' | 'dot-dotdot';
const variantArb = fc.constantFrom<Variant>(
  'plain',
  'dot',
  'dotmid',
  'dslash',
  'dotdot',
  'dot-dotdot',
);

/** Independent spelling generator: bypass spellings of `p` (still the same file). */
function spell(p: string, variant: Variant, upper: boolean): string {
  const segs = p.split('/');
  const head = segs[0] as string;
  const rest = segs.slice(1).join('/');
  let s: string;
  switch (variant) {
    case 'plain':
      s = p;
      break;
    case 'dot':
      s = `./${p}`;
      break;
    case 'dotmid':
      s = rest === '' ? `./${p}` : `${head}/./${rest}`;
      break;
    case 'dslash':
      s = rest === '' ? `//${p}` : `${head}//${rest}`;
      break;
    case 'dotdot':
      s = `${head}/../${p}`;
      break;
    case 'dot-dotdot':
      s = `./${head}/../${p}`;
      break;
  }
  return upper ? s.toUpperCase() : s;
}

interface Scenario {
  readonly target: Target;
  readonly variant: Variant;
  readonly upper: boolean;
  readonly tmp: string;
  readonly content: string;
  readonly patternFirst: boolean;
  readonly withDecoyPattern: boolean;
  readonly insertAt: number;
  readonly bothOps: boolean;
  readonly wildExt: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  target: targetArb,
  variant: variantArb,
  upper: fc.boolean(),
  tmp: nameArb,
  content: nameArb,
  patternFirst: fc.boolean(),
  withDecoyPattern: fc.boolean(),
  insertAt: fc.nat(3),
  bothOps: fc.boolean(),
  wildExt: fc.boolean(),
});

const PROTECT_ID = 'w-protect';

function buildWards(s: Scenario, op: 'delete' | 'overwrite'): WardSet {
  const other: Ward = { id: 'w-other', kind: 'path', deny: ['delete', 'overwrite'], paths: ['never/**'] };
  const sql: Ward = { id: 'w-sql', kind: 'sql', tables: ['users'], max_rows_lost: 0 };
  const egress: Ward = { id: 'w-egress', kind: 'egress', secrets: ['.env'], allow_hosts: [] };
  const paths = s.withDecoyPattern
    ? s.patternFirst
      ? [s.target.pattern, 'never/**']
      : ['never/**', s.target.pattern]
    : [s.target.pattern];
  const deny: ('delete' | 'overwrite')[] = s.bothOps ? ['delete', 'overwrite'] : [op];
  const protect: Ward = { id: PROTECT_ID, kind: 'path', deny, paths };
  const extras = [other, sql, egress];
  const wards = [...extras];
  wards.splice(Math.min(s.insertAt, wards.length), 0, protect);
  return { wards };
}

function initialState(s: Scenario): FsState {
  return {
    files: {
      [s.target.victim]: 'victim-content',
      '_decoy/a.txt': 'a',
      '_decoy/b.txt': 'b',
    },
    links: {},
  };
}

/** Ghost-run the plan and require a block with a violation of the protecting ward. */
async function expectBlocked(
  s: Scenario,
  actions: readonly FsAction[],
  op: 'delete' | 'overwrite',
): Promise<void> {
  const world = new FsWorld(initialState(s));
  const fpBefore = await world.fingerprint();
  const report = await ghostRun(world, await world.snapshot(), actions);
  const fpAfter = await world.fingerprint();
  // P1 precondition for the P5 claim: reality unchanged.
  expect(fpAfter).toEqual(fpBefore);

  const verdict = WardEngine.evaluate(report, buildWards(s, op));
  expect(verdict.verdict).toBe('block');
  const expected = `would ${op} protected path ${s.target.victim}`;
  const mine = verdict.violations.filter((v) => v.wardId === PROTECT_ID);
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every((v) => v.wardKind === 'path')).toBe(true);
  expect(mine.map((v) => v.reason)).toContain(expected);
}

const segsOf = (p: string): string[] => p.split('/');
const dirOf = (p: string): string => segsOf(p).slice(0, -1).join('/');
const lastOf = (p: string): string => segsOf(p).at(-1) as string;
const extOf = (p: string): string => {
  const name = lastOf(p);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i) : '';
};

// -- Property 5 --------------------------------------------------------------

describeClaimed('P5', () => {
  // Feature: wards, Property 5: Path ward protection completeness (P5, judgment half)
  // **Validates: Requirements 4.1, 5.1, 5.2, 5.5, 5.6, 19.2, 19.3, 19.4**
  describe('Property 5: Path ward protection completeness', () => {
    it('blocks a delete written in any bypass spelling', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const path = spell(s.target.victim, s.variant, s.upper);
          await expectBlocked(s, [{ op: 'rm', path }], 'delete');
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks a recursive delete of the containing directory', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const dir = dirOf(s.target.victim);
          const path = dir === '' ? '.' : spell(dir, s.variant, s.upper);
          await expectBlocked(s, [{ op: 'rm-recursive', path }], 'delete');
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks a delete by glob expansion', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const dir = dirOf(s.target.victim);
          const ext = extOf(s.target.victim);
          const leaf = s.wildExt && ext !== '' ? `*${ext}` : '*';
          // The fixture expands one pattern segment per path level.
          const pattern =
            dir === ''
              ? leaf
              : s.variant === 'plain'
                ? [...segsOf(dir).map(() => '*'), leaf].join('/')
                : `${spell(dir, s.variant, s.upper)}/${leaf}`;
          await expectBlocked(s, [{ op: 'rm-glob', pattern }], 'delete');
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks a find-style recursive delete', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const root = segsOf(s.target.victim).length > 1 ? segsOf(s.target.victim)[0] as string : '.';
          const spelled = root === '.' ? '.' : spell(root, s.variant, s.upper);
          await expectBlocked(
            s,
            [{ op: 'find-delete', root: spelled, suffix: extOf(s.target.victim) }],
            'delete',
          );
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks move-then-delete (the move is a delete at the source)', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const to = `tmp/${s.tmp}`;
          await expectBlocked(
            s,
            [
              { op: 'mv', from: spell(s.target.victim, s.variant, s.upper), to },
              { op: 'rm', path: to },
            ],
            'delete',
          );
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks a script-hidden delete (whole effect in one action)', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const to = `tmp/${s.tmp}`;
          const inner: FsLeafAction[] = s.bothOps
            ? [
                { op: 'mv', from: spell(s.target.victim, s.variant, s.upper), to },
                { op: 'rm', path: to },
              ]
            : [{ op: 'rm', path: spell(s.target.victim, s.variant, s.upper) }];
          await expectBlocked(s, [{ op: 'script', actions: inner }], 'delete');
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks a delete through a symbolic link (fixture reports the resolved path)', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const dir = dirOf(s.target.victim);
          const link = 'zz-link';
          const target = dir === '' ? s.target.victim : dir;
          const through = dir === '' ? link : `${link}/${lastOf(s.target.victim)}`;
          // A link to a directory hides every segment below it; a deeper victim
          // keeps its remaining segments inside the linked directory.
          const rest = dir === '' ? through : spell(through, s.variant, s.upper);
          await expectBlocked(
            s,
            [
              { op: 'ln', link, target },
              { op: 'rm', path: rest },
            ],
            'delete',
          );
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);

    it('blocks an overwrite in any spelling, directly or by moving a file onto it', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async (s) => {
          const spelled = spell(s.target.victim, s.variant, s.upper);
          const action: FsAction = s.bothOps
            ? { op: 'mv', from: '_decoy/a.txt', to: spelled }
            : { op: 'overwrite', path: spelled, content: `new-${s.content}` };
          await expectBlocked(s, [action], 'overwrite');
        }),
        { numRuns: NUM_RUNS },
      );
    }, TIMEOUT);
  });

  describe('fixture world (resolver and reporting)', () => {
    it('reports resolved paths, a move as delete plus create, and links as symlink-changed', async () => {
      const world = new FsWorld({ files: { 'data/x': '1', 'a/b': '2' }, links: {} });
      const start = await world.snapshot();
      const report = await ghostRun(world, start, [
        { op: 'rm', path: './DATA/../data/x' },
        { op: 'mv', from: 'a//b', to: 'c/d' },
        { op: 'ln', link: 'lnk', target: 'c' },
      ]);
      expect(report.changes[0]).toEqual([{ kind: 'file-deleted', path: 'data/x' }]);
      expect(report.changes[1]).toEqual([
        { kind: 'file-deleted', path: 'a/b' },
        { kind: 'file-created', path: 'c/d' },
      ]);
      expect(report.changes[2]).toEqual([
        { kind: 'symlink-changed', path: 'lnk', targetAfter: 'c' },
      ]);
    });

    it('does not mutate the input snapshot', async () => {
      const world = new FsWorld({ files: { x: '1' }, links: {} });
      const start = await world.snapshot();
      await world.step(start, { op: 'rm', path: 'x' });
      expect(start.state.files).toEqual({ x: '1' });
    });
  });
});

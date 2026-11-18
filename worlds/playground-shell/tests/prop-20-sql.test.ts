import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine } from '../src/shell/interpret.js';
import { initInlineSql } from '../src/sql/inline.js';
import type { Entry } from '../src/state.js';
import { diffStates } from '../src/vfs/diff.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const sql = await initInlineSql();
const DB = 'db/app.sqlite';

interface TableSpec {
  readonly name: string;
  readonly values: readonly number[];
}

/** 1 to 3 tables t0..t2 with (a INTEGER, b TEXT) rows. */
const arbTables: fc.Arbitrary<TableSpec[]> = fc
  .array(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 8 }), { minLength: 1, maxLength: 3 })
  .map((all) => all.map((values, i) => ({ name: `t${i}`, values })));

async function buildDb(tables: readonly TableSpec[]): Promise<Entry> {
  const text = tables
    .map(
      (t) =>
        `create table ${t.name}(a integer, b text);` +
        t.values.map((v) => `insert into ${t.name} values (${v}, 'v${v}');`).join(''),
    )
    .join('');
  const r = await sql.run({ dbBytes: null, sql: text, outputLimit: 4096 });
  if (!r.ok) throw new Error(r.stderr);
  return { kind: 'file', bytes: r.dbBytes, tables: r.tables };
}

/** SELECT-only grammar. No single quotes, so the text is safe inside a single-quoted shell word. */
function arbSelect(tables: readonly TableSpec[]): fc.Arbitrary<string> {
  const table = fc.constantFrom(...tables.map((t) => t.name));
  const column = fc.constantFrom('a', 'b', 'a, b', '*', 'count(*)', 'upper(b)', 'a + 1', 'length(b)');
  const where = fc.option(fc.integer({ min: -50, max: 50 }).map((n) => ` where a > ${n}`), { nil: '' });
  const order = fc.constantFrom('', ' order by a', ' order by b desc');
  const limit = fc.option(fc.nat({ max: 5 }).map((n) => ` limit ${n}`), { nil: '' });
  const fromTable = fc
    .tuple(column, table, where, order, limit)
    .map(([c, t, w, o, l]) => `select ${c} from ${t}${w}${o}${l}`);
  const constant = fc.constantFrom('select 1', 'select 1 + 2', 'select abs(-3)', 'select sqlite_version() is not null');
  const one = fc.oneof({ weight: 4, arbitrary: fromTable }, { weight: 1, arbitrary: constant });
  return fc.array(one, { minLength: 1, maxLength: 3 }).map((parts) => parts.join('; '));
}

function snapshot(fs: { walk(p: string): string[]; get(p: string): Entry | undefined }): string[] {
  return fs.walk('').map((p) => {
    const e = fs.get(p) as Entry;
    return e.kind === 'dir' ? `${p}:dir` : `${p}:${Array.from(e.bytes).join(',')}:${JSON.stringify(e.tables ?? null)}`;
  });
}

function randomCase(word: string, flips: readonly boolean[]): string {
  return Array.from(word)
    .map((ch, i) => (flips[i % flips.length] ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

const flipsArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 16 });

describe('Property 20: SQL steps', () => {
  const tick = makeYielder();

  it(
    'read-only SQL leaves the database bytes, the tables map, and the state unchanged',
    async () => {
      // Feature: ghost-shell, Property 20: SQL steps
      // **Validates: Requirements 5.8, 5.9, 5.12**
      await fc.assert(
        fc.asyncProperty(
          arbTables.chain((tables) => fc.record({ tables: fc.constant(tables), text: arbSelect(tables) })),
          async ({ tables, text }) => {
            await tick();
            const db = await buildDb(tables);
            const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
            const before = snapshot(fs);
            const r = await runLine(`sqlite3 ${DB} '${text}'`, env);
            expect(r.exitCode).toBe(0);
            expect(r.unsupportedReason).toBeUndefined();
            expect(snapshot(fs)).toEqual(before);
            const after = fs.get(DB);
            expect(after?.kind === 'file' && Array.from(after.bytes)).toEqual(Array.from((db as { bytes: Uint8Array }).bytes));
            expect(after?.kind === 'file' && after.tables).toEqual(db.kind === 'file' ? db.tables : undefined);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  const screened: { reason: string; build: (flips: readonly boolean[]) => string }[] = [
    { reason: 'ATTACH', build: (f) => `${randomCase('attach', f)} "other.db" as o` },
    { reason: 'DETACH', build: (f) => `${randomCase('detach', f)} o` },
    { reason: 'load_extension', build: (f) => `select ${randomCase('load_extension', f)}("x")` },
    { reason: 'dot-command', build: (f) => `.${randomCase('tables', f)}` },
    { reason: 'VACUUM INTO', build: (f) => `${randomCase('vacuum', f)} ${randomCase('into', f)} "x.db"` },
    { reason: 'max_page_count', build: (f) => `pragma ${randomCase('max_page_count', f)} = 5` },
    { reason: 'random', build: (f) => `select ${randomCase('random', f)}()` },
    { reason: 'randomblob', build: (f) => `select ${randomCase('randomblob', f)}(4)` },
    { reason: 'current_timestamp', build: (f) => `select ${randomCase('current_timestamp', f)}` },
    { reason: 'datetime', build: (f) => `select ${randomCase('datetime', f)}("2020-01-01")` },
    { reason: 'strftime', build: (f) => `select ${randomCase('strftime', f)}("%Y", "2020-01-01")` },
    { reason: "'now'", build: (f) => `select abs("${randomCase('now', f)}")` },
  ];

  it(
    'SQL containing a screened word in any letter case is an unsupported step with no effect',
    async () => {
      // Feature: ghost-shell, Property 20: SQL steps
      // **Validates: Requirements 5.8, 5.9, 5.12**
      await fc.assert(
        fc.asyncProperty(
          arbTables,
          fc.constantFrom(...screened),
          flipsArb,
          fc.constantFrom('', 'select 1; '),
          async (tables, item, flips, prefix) => {
            await tick();
            const db = await buildDb(tables);
            const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
            const before = snapshot(fs);
            const text = `${item.build(flips)}`;
            // A leading dot is only a dot-command when it starts the text.
            const full = item.reason === 'dot-command' ? text : `${prefix}${text}`;
            const r = await runLine(`sqlite3 ${DB} '${full}'`, env);
            expect(r.exitCode).toBe(127);
            expect(r.unsupportedReason).toContain(item.reason);
            expect(snapshot(fs)).toEqual(before);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a SQL error exits 1 with the engine message on stderr and leaves the state unchanged',
    async () => {
      // Feature: ghost-shell, Property 20: SQL steps
      // **Validates: Requirements 5.8, 5.9, 5.12**
      const arbBad = fc.oneof(
        fc.stringMatching(/^[a-z]{3,8}$/).map((w) => `select * from missing_${w}`),
        fc.stringMatching(/^[a-z]{3,8}$/).map((w) => `selec ${w}`),
        fc.stringMatching(/^[a-z]{3,8}$/).map((w) => `select ${w}_nocol from t0`),
        fc.constant('select 1 +'),
        // A write that succeeds followed by an error: nothing may be kept.
        fc.stringMatching(/^[a-z]{3,8}$/).map((w) => `insert into t0 values (1, "w"); select * from nope_${w}`),
        fc.constant('drop table t0; select * from t0'),
      );
      await fc.assert(
        fc.asyncProperty(arbTables, arbBad, async (tables, bad) => {
          await tick();
          const db = await buildDb(tables);
          const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
          const before = snapshot(fs);
          const r = await runLine(`sqlite3 ${DB} '${bad}'`, env);
          expect(r.exitCode).toBe(1);
          expect(r.unsupportedReason).toBeUndefined();
          expect(r.stderr.startsWith('Error:')).toBe(true);
          expect(r.stderr.length).toBeGreaterThan('Error:'.length);
          expect(snapshot(fs)).toEqual(before);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'whole-file deletes and moves of a database give file-deleted and no sql-row-count Change; in-place writes give row counts only at the same path',
    async () => {
      // Feature: ghost-shell, Property 20: SQL steps
      // **Validates: Requirements 5.8, 5.9, 5.12**
      await fc.assert(
        fc.asyncProperty(
          arbTables,
          fc.constantFrom('rm', 'rm -f', 'mv'),
          async (tables, how) => {
            await tick();
            const db = await buildDb(tables);
            const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
            const start = { entries: Object.fromEntries(fs.walk('').map((p) => [p, fs.get(p) as Entry])) };
            const line = how === 'mv' ? `mv ${DB} db/moved.sqlite` : `${how} ${DB}`;
            const r = await runLine(line, env);
            expect(r.exitCode).toBe(0);
            const end = { entries: Object.fromEntries(fs.walk('').map((p) => [p, fs.get(p) as Entry])) };
            const changes = diffStates(start, end);
            expect(changes).toContainEqual({ kind: 'file-deleted', path: DB, entryType: 'file' });
            expect(changes.some((c) => c.kind === 'sql-row-count')).toBe(false);
            if (how === 'mv') {
              expect(changes).toContainEqual({ kind: 'file-created', path: 'db/moved.sqlite', entryType: 'file' });
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );

      await fc.assert(
        fc.asyncProperty(arbTables, fc.integer({ min: 1, max: 4 }), async (tables, extra) => {
          await tick();
          const db = await buildDb(tables);
          const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
          const start = { entries: Object.fromEntries(fs.walk('').map((p) => [p, fs.get(p) as Entry])) };
          const values = Array.from({ length: extra }, (_, i) => `(${i}, "x")`).join(', ');
          const r1 = await runLine(`sqlite3 ${DB} 'insert into t0 values ${values}'`, env);
          const r2 = await runLine(`sqlite3 db/new.sqlite 'create table n(a); insert into n values (1)'`, env);
          expect(r1.exitCode).toBe(0);
          expect(r2.exitCode).toBe(0);
          const end = { entries: Object.fromEntries(fs.walk('').map((p) => [p, fs.get(p) as Entry])) };
          const changes = diffStates(start, end);
          const rows = changes.filter((c) => c.kind === 'sql-row-count');
          const before = tables[0]?.values.length ?? 0;
          expect(rows).toEqual([
            { kind: 'sql-row-count', path: DB, table: 't0', rowsBefore: before, rowsAfter: before + extra },
          ]);
          expect(changes).toContainEqual({ kind: 'file-created', path: 'db/new.sqlite', entryType: 'file' });
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );
});

describe('SQL steps: fixed examples', () => {
  it('a failed statement after a write keeps the original bytes', async () => {
    const db = await buildDb([{ name: 't0', values: [1, 2] }]);
    const { fs, env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
    const r = await runLine(`sqlite3 ${DB} 'delete from t0; select * from nope'`, env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe('Error: no such table: nope\n');
    expect((fs.get(DB) as { tables: unknown }).tables).toEqual({ t0: 2 });
  });

  it("the literal 'now' is unsupported in any case", async () => {
    const db = await buildDb([{ name: 't0', values: [] }]);
    const { env } = makeTestEnv({ db: { kind: 'dir' }, [DB]: db }, { sql });
    const r = await runLine(`sqlite3 ${DB} 'select "NoW"'`, env);
    expect(r.exitCode).toBe(127);
  });
});

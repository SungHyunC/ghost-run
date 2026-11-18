// Feature: ui-kit, Property 9: Graveyard coverage and order (model leg, tag UI-P9).
// **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.11, 10.12, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { buildGraveyardModel, type GraveyardModel, type TombstoneModel } from '../../src/model/graveyard';
import { compact } from '../../src/model/escape';
import { TOMBSTONES } from '../../src/model/limits';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import { badTime, dirtyString, graveEntry, isoUtc } from '../fixtures/arbitraries';
import type { GraveEntry } from '../../src/types';

console.log(`UI-P9 model leg seed=${PBT_SEED}`);

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---- generators -----------------------------------------------------------

const validId = fc.oneof(fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/), fc.constantFrom('g-1', 'g-2', 'dup'));
const invalidId = fc.oneof(
  fc.constantFrom('', 'a b', 'a/b', '../x', 'id.json', 'caf\u00e9', 'a'.repeat(65), 'x?y=1'),
  fc.string({ maxLength: 20 }).filter((s) => !ID_RE.test(s)),
  dirtyString(fc.stringMatching(/^[a-z]{1,6}$/)).filter((s) => !ID_RE.test(s)),
);
const anyId = fc.oneof({ weight: 3, arbitrary: validId }, { weight: 1, arbitrary: invalidId });

const withMillis = isoUtc.chain((t) => fc.nat({ max: 999 }).map((ms) => t.replace(/Z$/, `.${String(ms).padStart(3, '0')}Z`)));
const EQUAL_POOL = ['2026-11-20T02:14:09Z', '2026-11-20T02:14:09.000Z', '2026-11-20T02:14:10Z'];
const validTime = fc.oneof(
  { weight: 3, arbitrary: isoUtc },
  { weight: 2, arbitrary: withMillis },
  { weight: 2, arbitrary: fc.constantFrom(...EQUAL_POOL) },
);
const invalidTime = fc.oneof(badTime, fc.constantFrom('2026-13-40T25:61:61Z', '2026-11-20 02:14:09'));
const anyTime = fc.oneof({ weight: 3, arbitrary: validTime }, { weight: 1, arbitrary: invalidTime });

const wardId = fc.oneof(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), dirtyString(fc.stringMatching(/^[a-z]{1,8}$/)));
const command = dirtyString(
  fc.oneof(fc.stringMatching(/^[a-z]{2,8} [ -~]{0,40}$/), fc.string({ maxLength: 30 }), fc.string({ minLength: 121, maxLength: 200 })),
);

const entry: fc.Arbitrary<GraveEntry> = fc
  .tuple(anyId, command, anyTime, fc.array(wardId, { maxLength: 5 }))
  .map(([id, c, recordedAt, wardIds]) => ({ id, command: c, recordedAt, wardIds }));

const entries = fc.array(entry, { maxLength: 40 });
const manyEntries = fc.array(fc.oneof(entry, graveEntry), { minLength: 201, maxLength: 260 });

// ---- oracle ---------------------------------------------------------------

const VALID_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
/** Epoch ms for a valid instant, else null. Strict calendar check (Date.parse accepts 2026-02-30). */
function instantOf(s: string): number | null {
  const m = VALID_TIME_RE.exec(s);
  if (m === null) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  if (h > 23 || mi > 59 || se > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, se, ms);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

function expectedOrder(list: readonly GraveEntry[]): number[] {
  const idx = list.map((_, i) => i);
  const valid = idx.filter((i) => instantOf(list[i]!.recordedAt) !== null);
  const rest = idx.filter((i) => instantOf(list[i]!.recordedAt) === null);
  valid.sort((a, b) => instantOf(list[b]!.recordedAt)! - instantOf(list[a]!.recordedAt)! || a - b);
  return [...valid, ...rest];
}

/**
 * Model-level onOpen contract: activating tombstone `position` calls the callback once with the original
 * id of the corresponding input entry, and never for a tombstone whose raw id is invalid (disabled).
 * The model exposes `inputIndex` and `rawIdValid`; the real wiring is task 8.4.
 */
function activate(
  m: GraveyardModel,
  list: readonly GraveEntry[],
  position: number,
  onOpen: (id: string) => void,
): void {
  const t = m.tombstones[position]!;
  if (t.unreadable || !t.rawIdValid) return;
  onOpen(list[t.inputIndex]!.id);
}

function assertGraveyard(list: readonly GraveEntry[]): { m: GraveyardModel; order: number[] } {
  const m = buildGraveyardModel(list);
  if (m.kind !== 'ok') throw new Error('expected ok model');
  const n = list.length;
  expect(m.totalTombstones).toBe(n);
  expect(m.tombstones).toHaveLength(n);
  expect(m.summary).toBe(`${n} blocked commands`);
  expect(m.shownTombstones).toBe(Math.min(n, TOMBSTONES));
  expect(m.emptyText).toBe(n === 0 ? 'No blocked commands yet.' : null);

  const order = expectedOrder(list);
  expect(m.tombstones.map((t) => t.inputIndex)).toEqual(order);

  const calls: string[] = [];
  m.tombstones.forEach((t: TombstoneModel, pos) => {
    const src = list[order[pos]!]!;
    expect(t.unreadable).toBe(false);
    expect(t.command).toBe(compact(src.command));
    expect(t.recordedAt).toBe(compact(src.recordedAt));
    expect(t.wardIds).toEqual(src.wardIds.map((w) => compact(w)));
    const expectUnreadable = instantOf(src.recordedAt) === null;
    expect(t.timeUnreadable).toBe(expectUnreadable);
    expect(t.rawIdValid).toBe(ID_RE.test(src.id));
    if (t.rawIdValid) {
      expect(t.accessibleName).toBe(
        `Open seance for blocked command ${t.command}, recorded ${t.recordedAt}, ward ${
          t.wardIds.length === 0 ? 'none' : t.wardIds.join(', ')
        }`,
      );
    }
    const before = calls.length;
    activate(m, list, pos, (id) => calls.push(id));
    if (ID_RE.test(src.id)) {
      expect(calls.length).toBe(before + 1);
      expect(calls[before]).toBe(src.id);
    } else {
      expect(calls.length).toBe(before);
    }
  });
  return { m, order };
}

// ---- tests ----------------------------------------------------------------

describe('UI-P9 model leg: graveyard coverage and order', () => {
  it('covers every entry once, orders by instant, and keeps the onOpen contract', () => {
    const counter = createCounter('UI-P9 graveyard');
    fc.assert(
      fc.property(entries, (list) => {
        const { m } = assertGraveyard(list);
        counter.add(list.length === 0 ? 'empty' : 'nonEmpty');
        if (m.tombstones.some((t) => t.timeUnreadable)) counter.add('timeUnreadable');
        if (m.tombstones.some((t) => !t.timeUnreadable)) counter.add('timeValid');
        if (m.tombstones.some((t) => !t.rawIdValid)) counter.add('invalidId');
        if (m.tombstones.some((t) => t.rawIdValid)) counter.add('validId');
        if (new Set(list.map((e) => e.id)).size < list.length) counter.add('duplicateIds');
        if (list.some((e) => /\.\d{3}Z$/.test(e.recordedAt))) counter.add('millis');
        const valid = list.map((e) => instantOf(e.recordedAt)).filter((t): t is number => t !== null);
        if (new Set(valid).size < valid.length) counter.add('equalInstants');
        if (list.some((e) => e.wardIds.length === 0)) counter.add('noWards');
        if (list.some((e) => e.wardIds.length >= 3)) counter.add('manyWards');
        if (list.some((e) => Array.from(e.command).length > 120)) counter.add('longCommand');
        if (list.some((e) => /[\u0000-\u001f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069\u{e0000}-\u{e007f}]/u.test(e.command))) {
          counter.add('hiddenInCommand');
        }
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'empty',
      'nonEmpty',
      'timeUnreadable',
      'timeValid',
      'invalidId',
      'validId',
      'duplicateIds',
      'millis',
      'equalInstants',
      'noWards',
      'manyWards',
      'longCommand',
      'hiddenInCommand',
    ]);
  }, PBT_TIMEOUT);

  it('lists above 200 entries show 200 initially and keep the total in the summary', () => {
    const counter = createCounter('UI-P9 graveyard over limit');
    fc.assert(
      fc.property(manyEntries, (list) => {
        const { m } = assertGraveyard(list);
        expect(m.shownTombstones).toBe(200);
        expect(m.totalTombstones).toBe(list.length);
        expect(m.summary).toBe(`${list.length} blocked commands`);
        counter.add('over200');
      }),
      { ...params('full'), numRuns: Math.min(params('full').numRuns, 100) },
    );
    counter.print();
    assertBucketsHit(counter, ['over200']);
  }, PBT_TIMEOUT);

  it('example: the pinned invalid times are unreadable and listed after valid ones in input order', () => {
    const list: GraveEntry[] = [
      { id: 'a', command: 'rm x', recordedAt: '2026-13-40T25:61:61Z', wardIds: [] },
      { id: 'b', command: 'rm y', recordedAt: '2026-11-20T02:14:09Z', wardIds: ['w'] },
      { id: 'c', command: 'rm z', recordedAt: '2026-11-20 02:14:09', wardIds: [] },
      { id: 'd', command: 'rm w', recordedAt: '2026-11-20T02:14:09.000Z', wardIds: [] },
    ];
    const { m } = assertGraveyard(list);
    expect(m.tombstones.map((t) => t.inputIndex)).toEqual([1, 3, 0, 2]);
    expect(buildGraveyardModel([]).kind).toBe('ok');
  });
});

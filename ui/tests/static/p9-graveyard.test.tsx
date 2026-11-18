// Feature: ui-kit, Property 9: Graveyard coverage and order (static leg, S leg, tag UI-P9)
// **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.11, 10.12, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { GraveyardView } from '../../src/components/Graveyard';
import { buildGraveyardModel } from '../../src/model/graveyard';
import { compact } from '../../src/model/escape';
import { badTime, dirtyString, graveEntry, isoUtc } from '../fixtures/arbitraries';
import { escapeHtml, renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const validId = fc.oneof(fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/), fc.constantFrom('g-1', 'g-2', 'dup'));
const invalidId = fc.oneof(
  fc.constantFrom('', 'a b', 'a/b', '../x', 'id.json', 'caf\u00e9', 'a'.repeat(65), 'x?y=1'),
  fc.string({ maxLength: 20 }).filter((s) => !ID_RE.test(s)),
);
const anyId = fc.oneof({ weight: 3, arbitrary: validId }, { weight: 1, arbitrary: invalidId });

const EQUAL_POOL = ['2026-11-20T02:14:09Z', '2026-11-20T02:14:09.000Z', '2026-11-20T02:14:10Z'];
const withMillis = isoUtc.chain((t) =>
  fc.nat({ max: 999 }).map((ms) => t.replace(/Z$/, `.${String(ms).padStart(3, '0')}Z`)),
);
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

const entry: fc.Arbitrary<unknown> = fc
  .tuple(anyId, command, anyTime, fc.array(wardId, { maxLength: 5 }))
  .map(([id, c, recordedAt, wardIds]): Rec => ({ id, command: c, recordedAt, wardIds }));

const nonRecord: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(null, 42, 'text', true);
const element: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 12, arbitrary: entry },
  { weight: 1, arbitrary: nonRecord },
);

const smallList = fc.array(element, { maxLength: 40 });
const bigList = fc.array(fc.oneof(entry, graveEntry as fc.Arbitrary<unknown>), { minLength: 201, maxLength: 260 });

// ---------------------------------------------------------------------------
// Independent oracle
// ---------------------------------------------------------------------------

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
function instantOf(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = TIME_RE.exec(s);
  if (m === null) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  if (h > 23 || mi > 59 || se > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, se, ms);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function readable(e: unknown): e is { id: string; command: string; recordedAt: string; wardIds: string[] } {
  return (
    isRec(e) &&
    typeof e['id'] === 'string' &&
    typeof e['command'] === 'string' &&
    typeof e['recordedAt'] === 'string' &&
    Array.isArray(e['wardIds']) &&
    e['wardIds'].every((w) => typeof w === 'string')
  );
}

function expectedOrder(list: readonly unknown[]): number[] {
  const idx = list.map((_, i) => i);
  const time = (i: number): number | null => {
    const e = list[i];
    return readable(e) ? instantOf(e.recordedAt) : null;
  };
  const valid = idx.filter((i) => time(i) !== null);
  const rest = idx.filter((i) => time(i) === null);
  valid.sort((a, b) => time(b)! - time(a)! || a - b);
  return [...valid, ...rest];
}

// ---------------------------------------------------------------------------
// Markup parsing
// ---------------------------------------------------------------------------

interface ButtonInfo {
  index: number;
  label: string;
  disabled: boolean;
  chunk: string;
}

function tombstoneButtons(html: string): ButtonInfo[] {
  const re =
    /<button type="button" class="gk-tombstone" data-tombstone-index="(\d+)" data-tombstone-id="[^"]*" aria-label="([^"]*)"( disabled="")?>(.*?)<\/button>/gs;
  return [...html.matchAll(re)].map((m) => ({
    index: Number(m[1]),
    label: m[2] ?? '',
    disabled: m[3] !== undefined,
    chunk: m[4] ?? '',
  }));
}

type Counter = ReturnType<typeof createCounter>;

function renderView(list: unknown[], revealAll: boolean): string {
  const model = buildGraveyardModel(list);
  if (model.kind !== 'ok') throw new Error('expected an ok model');
  return renderMarkup(<GraveyardView model={model} revealAll={revealAll} />);
}

function checkMarkup(list: unknown[], revealAll: boolean, counter: Counter): void {
  const html = renderView(list, revealAll);
  const n = list.length;
  const order = expectedOrder(list);
  const shown = revealAll ? n : Math.min(n, 200);

  // Summary (10.5) and empty text (10.6).
  expect(html).toContain(`<span class="gk-mono">${n} blocked commands</span>`);
  if (n === 0) {
    expect(html).toContain('<p class="gk-empty">No blocked commands yet.</p>');
    counter.add('empty');
  } else {
    expect(html).not.toContain('No blocked commands yet.');
  }

  // Tombstones: slots in the defined order, one per entry up to the limit.
  const readableOrder = order.filter((i) => readable(list[i]));
  const buttons = tombstoneButtons(html);
  const expectedButtons = readableOrder.filter((i) => order.indexOf(i) < shown);
  expect(buttons.map((b) => b.index)).toEqual(expectedButtons);
  const unreadableShown = order.slice(0, shown).filter((i) => !readable(list[i]));
  for (const i of unreadableShown) {
    expect(html).toContain(`<li class="gk-note">Unreadable item ${i}</li>`);
    counter.add('unreadable-slot');
  }
  expect((html.match(/<li/g) ?? []).length).toBe(shown);

  for (const b of buttons) {
    const src = list[b.index];
    if (!readable(src)) throw new Error('button for an unreadable entry');
    const cmd = compact(src.command);
    const at = compact(src.recordedAt);
    const wards = src.wardIds.map((w) => compact(w));
    // Command, recordedAt, every ward id (10.2, 10.3).
    expect(b.chunk).toContain(`<code class="gk-mono gk-tombstone-command">${escapeHtml(cmd)}</code>`);
    expect(b.chunk).toContain(`<span class="gk-mono">${escapeHtml(at)}</span>`);
    expect(b.chunk).toContain(`<span class="gk-mono">${escapeHtml(wards.join(', '))}</span>`);
    for (const w of wards) expect(b.chunk).toContain(escapeHtml(w));
    if (wards.length >= 3) counter.add('many-wards');
    if (wards.length === 0) counter.add('no-wards');
    // Time unreadable note (10.7).
    const timeBad = instantOf(src.recordedAt) === null;
    expect(b.chunk.includes('time unreadable')).toBe(timeBad);
    counter.add(timeBad ? 'time-unreadable' : 'time-valid');
    // Disabled tombstone for an invalid id (10.4 / 10.11).
    const idOk = ID_RE.test(src.id);
    expect(b.disabled).toBe(!idOk);
    expect(b.chunk.includes('No seance link: invalid id')).toBe(!idOk);
    counter.add(idOk ? 'valid-id' : 'disabled');
    // Accessible name (10.12).
    expect(b.label).toBe(
      escapeHtml(
        `Open seance for blocked command ${cmd}, recorded ${at}, ward ${wards.length === 0 ? 'none' : wards.join(', ')}`,
      ),
    );
  }

  // 200-tombstone limit with the reveal state (10.7).
  if (!revealAll && n > 200) {
    counter.add('limited');
    expect(html).toContain(`Showing 200 of ${n}`);
    expect(html).toContain(`aria-label="Show all ${n} tombstones"`);
  } else {
    expect(html).not.toContain('Showing ');
    expect(html).not.toContain('Show all');
  }
}

describe('UI-P9 graveyard coverage and order (static leg)', () => {
  it('UI-P9: markup has one slot per entry in order with command, time, wards, name, disabled state', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P9 static');
    fc.assert(
      fc.property(smallList, (list) => {
        checkMarkup(list, false, counter);
        checkMarkup(list, true, counter);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'empty',
      'unreadable-slot',
      'many-wards',
      'no-wards',
      'time-unreadable',
      'time-valid',
      'valid-id',
      'disabled',
    ]);
  }, PBT_TIMEOUT ?? 0);

  it('UI-P9: more than 200 entries show 200 first, then all after reveal', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P9 static over limit');
    fc.assert(
      fc.property(bigList, (list) => {
        checkMarkup(list, false, counter);
        checkMarkup(list, true, counter);
      }),
      { ...params('full'), numRuns: Math.min(params('full').numRuns, 100) },
    );
    counter.print();
    assertBucketsHit(counter, ['limited']);
  }, PBT_TIMEOUT ?? 0);

  it('UI-P9: example with pinned invalid times and ids', () => {
    const list = [
      { id: 'a', command: 'rm x', recordedAt: '2026-13-40T25:61:61Z', wardIds: [] },
      { id: 'b c', command: 'rm y', recordedAt: '2026-11-20T02:14:09Z', wardIds: ['w1', 'w2'] },
      7,
      { id: 'd', command: 'rm w', recordedAt: '2026-11-20T02:14:09.000Z', wardIds: ['w3'] },
    ];
    const html = renderView(list, false);
    expect(tombstoneButtons(html).map((b) => b.index)).toEqual([1, 3, 0]);
    expect(html).toContain('Unreadable item 2');
    expect(tombstoneButtons(html)[0]?.disabled).toBe(true);
  });
});

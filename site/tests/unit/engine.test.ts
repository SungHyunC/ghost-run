import { describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import { toWalkRecord, toWalkRuns } from '../../src/data/walk-records';
import { narration } from '../../src/data/narration';
import type { WalkRuns, RunsFile, WorldRecord } from '../../src/data/types';
import { WORLDS } from '../../src/config';
import { initialState, reduceWalk } from '../../src/engine/reducer';
import { effectsText } from '../../src/engine/useWalk';
import { ACTION_DELAY_MS, buildScript, DUR, NOTE_EDIT, settle, STEP_START, TYPE_MS, warnNote } from '../../src/engine/script';
import type { TimedEvent, WalkEvent } from '../../src/engine/types';

const runs = toWalkRuns(runsJson as unknown as RunsFile);
const text = (r: WorldRecord, step: number): string =>
  narration(r, step)
    .map((s) => s.text)
    .join('');

/** The `at` of every event of one type (optionally filtered), in script order. */
function ats<T extends WalkEvent['type']>(
  script: TimedEvent[],
  type: T,
  pick: (e: Extract<WalkEvent, { type: T }>) => boolean = () => true,
): number[] {
  return script.filter((t) => t.event.type === type && pick(t.event as Extract<WalkEvent, { type: T }>)).map((t) => t.at);
}

const range = (n: number, f: (k: number) => number): number[] => Array.from({ length: n }, (_, k) => f(k));

describe('buildScript timing table', () => {
  it('has the step durations of the mockup', () => {
    expect([...DUR]).toEqual([2700, 3900, 3300, 2700, 5200]);
    expect([...STEP_START]).toEqual([0, 2700, 6600, 9900, 12600]);
  });

  it.each(WORLDS)('step 1 (%s): enter, beam on and copy shown at 0, beam off at 1900', (w) => {
    const s = buildScript(runs.worlds[w], 0);
    expect(ats(s, 'enter')).toEqual([0]);
    expect(ats(s, 'copyShow')).toEqual([0]);
    expect(ats(s, 'beam', (e) => e.on)).toEqual([0]);
    expect(ats(s, 'beam', (e) => !e.on)).toEqual([1900]);
  });

  it.each(WORLDS)('step 2 (%s): typing at 26 ms per character', (w) => {
    const r = runs.worlds[w];
    const s = buildScript(r, 1);
    const L = r.plan.display.length;
    expect(ats(s, 'termType')).toEqual(range(L, (k) => 26 * (k + 1)));
    expect(ats(s, 'termShow')).toEqual([0]);
  });

  it('step 2 shell: bars 70 apart, count-down in 12 steps of 70, dropped at 850', () => {
    const r = runs.worlds.shell;
    const T = TYPE_MS * r.plan.display.length + ACTION_DELAY_MS;
    const s = buildScript(r, 1);
    const users = (pick: (e: Extract<WalkEvent, { type: 'table' }>) => boolean) =>
      ats(s, 'table', (e) => e.name === 'users' && pick(e));
    expect(users((e) => e.bars !== undefined)).toEqual(range(12, (k) => T + 70 * k));
    expect(users((e) => e.count !== undefined)).toEqual(range(12, (k) => T + 70 * (k + 1)));
    const counts = s
      .filter((t) => t.event.type === 'table' && t.event.count !== undefined)
      .map((t) => (t.event as { count: number }).count);
    expect(counts[0]).toBe(Math.round(1206 * (1 - 1 / 12)));
    expect(counts[11]).toBe(0);
    expect(users((e) => e.cls === 'poof')).toEqual([T]);
    const dropped = s.find((t) => t.event.type === 'table' && t.event.cls === 'dropped');
    expect(dropped?.at).toBe(T + 850);
    expect(dropped?.event).toMatchObject({ tag: 'dropped' });
  });

  it('step 2 hand: tiles 160 apart; fail states equal the recorded failed variants', () => {
    const r = runs.worlds.hand;
    const T = TYPE_MS * r.plan.display.length + ACTION_DELAY_MS;
    const s = buildScript(r, 1);
    expect(ats(s, 'handTile')).toEqual(range(8, (k) => T + 160 * k));
    const after = r.plan.copyAfter;
    if (after.kind !== 'hand') throw new Error('hand scene expected');
    const failed = after.tiles.map((t, k) => (t.outcome === 'failed' ? k : -1)).filter((k) => k >= 0);
    const failIdx = s
      .filter((t) => t.event.type === 'handTile' && t.event.state === 'fail')
      .map((t) => (t.event as { index: number }).index);
    expect(failIdx).toEqual(failed);
    expect(failIdx).toEqual([3]);
    // The tile with the joint-limit mark is variant-6 and is read from the record, not from the state.
    expect(after.tiles.filter((t) => t.jointLimit).map((t) => t.id)).toEqual(['variant-6']);
    const end = settle(r, 1).copy;
    if (end.world !== 'hand') throw new Error('hand copy expected');
    expect(end.tiles.map((t) => t === 'fail')).toEqual(after.tiles.map((t) => t.outcome === 'failed'));
  });

  it('step 2 cloud: poof at T and vanish 300 later', () => {
    const r = runs.worlds.cloud;
    const T = TYPE_MS * r.plan.display.length + ACTION_DELAY_MS;
    const s = buildScript(r, 1);
    expect(s.filter((t) => t.event.type === 'cloudBucket').map((t) => [t.at, t.event])).toEqual([
      [T, { type: 'cloudBucket', name: 'prod-assets', state: 'poof' }],
      [T + 300, { type: 'cloudBucket', name: 'prod-assets', state: 'vanish' }],
    ]);
  });

  it.each(WORLDS)('step 3 (%s): rows at 500 + 380 k, tone at 600 + 380 R', (w) => {
    const r = runs.worlds[w];
    const R = r.plan.checks.length;
    const s = buildScript(r, 2);
    expect(ats(s, 'checkRow')).toEqual(range(R, (k) => 500 + 380 * k));
    expect(ats(s, 'wardTone')).toEqual([600 + 380 * R]);
    expect(s.find((t) => t.event.type === 'wardTone')?.event).toMatchObject({ tone: 'bad' });
    expect(ats(s, 'termHide')).toEqual([0]);
    expect(ats(s, 'checksClear')).toEqual([0]);
  });

  it.each(WORLDS)('step 4 (%s): candle out, stamp, note and badge at 500', (w) => {
    const s = buildScript(runs.worlds[w], 3);
    expect(ats(s, 'candle')).toEqual([500]);
    expect(ats(s, 'stamp')).toEqual([500]);
    expect(ats(s, 'note')).toEqual([500]);
    expect(s.find((t) => t.event.type === 'badges')?.event).toEqual({ type: 'badges', fingerprint: true, go: false });
  });

  it.each(WORLDS)('step 5 (%s): offsets 1000, typing, T2, T3 = T2 + 900, PASS at T3 + 1500', (w) => {
    const r = runs.worlds[w];
    const L2 = r.fixed.display.length;
    const T2 = 1000 + 26 * L2 + 250;
    const T3 = T2 + 900;
    const R = r.fixed.checks.length;
    const s = buildScript(r, 4);
    expect(ats(s, 'termType')).toEqual(range(L2, (k) => 1000 + 26 * (k + 1)));
    expect(ats(s, 'beam', (e) => e.on)).toEqual([0]);
    expect(ats(s, 'beam', (e) => !e.on)).toEqual([1000]);
    expect(ats(s, 'recopy')).toEqual([0]);
    expect(ats(s, 'termHide')).toEqual([T3]);
    expect(ats(s, 'checksClear')).toEqual([0, T3]);
    expect(ats(s, 'checkRow')).toEqual(range(R, (k) => T3 + 500 + 380 * k));
    expect(ats(s, 'wardTone')).toEqual([T3 + 600 + 380 * R]);
    expect(s.find((t) => t.event.type === 'wardTone')?.event).toMatchObject({ tone: 'good' });
    expect(ats(s, 'stamp', (e) => e.stamp === 'PASS')).toEqual([T3 + 1500]);
    expect(ats(s, 'candle', (e) => e.state === 'lit')).toEqual([T3 + 1500]);
    expect(ats(s, 'act')).toEqual([T3 + 1500]);
    expect(s.map((t) => t.at)).toEqual([...s.map((t) => t.at)].sort((a, b) => a - b));
  });

  it('step 5 shell: bak at T2, soft at T2 + 500 with the recorded tag; PASS near 5,500 ms', () => {
    const r = runs.worlds.shell;
    const L2 = r.fixed.display.length;
    expect(L2).toBe(r.fixed.commands.join(' && ').length);
    const T2 = 1000 + 26 * L2 + 250;
    const s = buildScript(r, 4);
    expect(ats(s, 'entry')).toEqual([T2]);
    expect(s.find((t) => t.event.type === 'entry')?.event).toMatchObject({ name: 'app.db.bak', state: 'new' });
    const soft = s.find((t) => t.event.type === 'table');
    expect(soft?.at).toBe(T2 + 500);
    expect(soft?.event).toMatchObject({ cls: 'soft', tag: 'deleted_at = 1' });
    expect(ats(s, 'stamp', (e) => e.stamp === 'PASS')[0]).toBe(T2 + 900 + 1500);
  });

  it('step 5 hand: tiles 120 apart at T2; cloud: tmp-build-cache poof at T2 and vanish at T2 + 300', () => {
    const hand = runs.worlds.hand;
    const T2h = 1000 + 26 * hand.fixed.display.length + 250;
    expect(ats(buildScript(hand, 4), 'handTile')).toEqual(range(8, (k) => T2h + 120 * k));
    const cloud = runs.worlds.cloud;
    const T2c = 1000 + 26 * cloud.fixed.display.length + 250;
    const cb = buildScript(cloud, 4).filter((t) => t.event.type === 'cloudBucket');
    expect(cb.map((t) => [t.at, t.event])).toEqual([
      [T2c, { type: 'cloudBucket', name: 'tmp-build-cache', state: 'poof' }],
      [T2c + 300, { type: 'cloudBucket', name: 'tmp-build-cache', state: 'vanish' }],
    ]);
  });

  it('rejects a step outside 0 to 4', () => {
    expect(() => buildScript(runs.worlds.shell, 5)).toThrow();
  });
});

describe('settle and reduceWalk', () => {
  it.each(WORLDS)('settle(%s, 4) shows PASS, the fixed plan, and the narration of step 5 only', (w) => {
    const r = runs.worlds[w];
    const s = settle(r, 4);
    expect(s.stamp).toBe('PASS');
    expect(s.plan).toEqual({ text: r.fixed.display, rev: true });
    expect(s.narration).toEqual(narration(r, 4));
    expect(text(r, 4)).toContain(w === 'cloud' ? 'tmp-build-cache' : '');
    expect(s.step).toBe(4);
    expect(s.act).toBe(5);
    expect(s.candle).toBe('lit');
    expect(s.term.visible).toBe(false);
    expect(s.beam).toBe(false);
    expect(s.checks.tone).toBe('good');
    expect(s.badges).toEqual({ fingerprint: false, go: true });
  });

  it('settle(shell, 4) ends with the bak file, soft users, and the original count', () => {
    const c = settle(runs.worlds.shell, 4).copy;
    if (c.world !== 'shell') throw new Error('shell copy expected');
    expect(c.tables.find((t) => t.name === 'users')).toEqual({ name: 'users', bars: 0, count: 1206, tag: 'deleted_at = 1', cls: 'soft' });
    expect(c.entries.filter((e) => e.state === 'new').map((e) => e.name)).toEqual(['app.db.bak']);
  });

  it('settle(shell, 1) ends with all bars gone, count 0, class dropped', () => {
    const c = settle(runs.worlds.shell, 1).copy;
    if (c.world !== 'shell') throw new Error('shell copy expected');
    expect(c.tables.find((t) => t.name === 'users')).toEqual({ name: 'users', bars: 12, count: 0, tag: 'dropped', cls: 'dropped' });
  });

  it('settle(world, 3) is blocked with the fingerprint badge and the block note', () => {
    const s = settle(runs.worlds.shell, 3);
    expect(s.stamp).toBe('BLOCKED');
    expect(s.candle).toBe('out');
    expect(s.badges).toEqual({ fingerprint: true, go: false });
    expect(s.note).toBe('Reality still has all 1,206 users.');
    expect(s.narration).toEqual(narration(runs.worlds.shell, 3));
  });

  it('settle(world, -1) equals the reset state', () => {
    for (const w of WORLDS) expect(settle(runs.worlds[w], -1)).toEqual(initialState(runs.worlds[w]));
  });

  it('the hand fixed plan shows the three rows with the measured values of the fixed run', () => {
    const rows = settle(runs.worlds.hand, 4).checks.rows;
    expect(rows).toEqual([
      { label: 'success, at least 95%', measured: '8 of 8 = 100%', ok: true },
      { label: 'contact force, at most 30 N', measured: '29.2 N', ok: true },
      { label: 'never touch the vase', measured: 'untouched', ok: true },
    ]);
    expect(rows).toEqual(runs.worlds.hand.fixed.checks);
  });

  it('the hand plan rows end bad with 7 of 8 = 88%', () => {
    const s = settle(runs.worlds.hand, 2);
    expect(s.checks.tone).toBe('bad');
    expect(s.checks.eoShown).toBe(true);
    expect(s.checks.rows[0]).toMatchObject({ measured: '7 of 8 = 88%', ok: false });
  });

  it('the note texts follow Requirement 11, criterion 12', () => {
    const expected = {
      shell: ['Reality still has all 1,206 users.', 'The real run is allowed.'],
      hand: ['The real arm stays still.', 'The real arm may move now.'],
      cloud: ['The real prod-assets is untouched.', 'Allowed. Ghost Cloud has no real mode yet.'],
    } as const;
    for (const w of WORLDS) {
      const r = runs.worlds[w];
      expect(initialState(r).note).toBe('The candle waits for the wards.');
      expect(settle(r, 3).note).toBe(expected[w][0]);
      expect(settle(r, 4).note).toBe(expected[w][1]);
      const start = buildScript(r, 4).find((t) => t.event.type === 'note');
      expect(start?.at).toBe(0);
      expect(start?.event).toEqual({ type: 'note', text: 'Trying the fixed plan on a fresh copy\u2026' });
    }
  });

  it('joins the lines of a two-line fixed plan with " && "', () => {
    const r = runs.worlds.shell;
    expect(r.fixed.commands).toHaveLength(2);
    const typed = buildScript(r, 4).filter((t) => t.event.type === 'termType');
    const full = (typed[typed.length - 1]?.event as { typed: string }).typed;
    expect(full).toBe(r.fixed.commands.join(' && '));
    expect(full).toContain(' && ');
  });

  it('badges follow the record', () => {
    const noP1: WorldRecord = { ...runs.worlds.shell, plan: { ...runs.worlds.shell.plan, p1: { equal: false, before: 'a', after: 'b' } } };
    expect(settle(noP1, 3).badges.fingerprint).toBe(false);
    const warn: WorldRecord = { ...runs.worlds.shell, fixed: { ...runs.worlds.shell.fixed, verdict: 'warn' } };
    expect(settle(warn, 4).badges.go).toBe(false);
    const noP1Fix: WorldRecord = { ...runs.worlds.shell, fixed: { ...runs.worlds.shell.fixed, p1: { equal: false, before: 'a', after: 'b' } } };
    expect(settle(noP1Fix, 4).badges.go).toBe(false);
  });

  it('reduceWalk does not mutate its input and ignores events of another world', () => {
    const s0 = initialState(runs.worlds.hand);
    const frozen = JSON.stringify(s0);
    const s1 = reduceWalk(s0, { type: 'handTile', index: 0, state: 'ok' });
    expect(JSON.stringify(s0)).toBe(frozen);
    expect(s1).not.toBe(s0);
    expect(reduceWalk(s0, { type: 'table', name: 'users', count: 0 })).toBe(s0);
    expect(reduceWalk(s0, { type: 'entry', name: 'x', kind: 'file', state: 'new' })).toBe(s0);
    expect(reduceWalk(s0, { type: 'bucketTag', name: 'x', tag: 't' })).toBe(s0);
    expect(reduceWalk(s0, { type: 'cloudBucket', name: 'x', state: 'poof' })).toBe(s0);
  });
});

describe('effectsText', () => {
  const state = initialState(runs.worlds.cloud);
  it('uses the Cloud line only when the Cloud record has no outside effect', () => {
    expect(effectsText(runs.worlds.cloud, state)).toBe('no --endpoint-url, so nothing leaves');
    expect(effectsText(runs.worlds.shell, initialState(runs.worlds.shell))).toBe('nothing leaves the box');
    expect(effectsText(runs.worlds.hand, initialState(runs.worlds.hand))).toBe('nothing leaves the box');
  });

  it('lists the effects when the list is not empty, for any world', () => {
    const withEffect = { ...runs.worlds.cloud, plan: { ...runs.worlds.cloud.plan, effectsOutside: ['http://192.0.2.1'] } };
    expect(effectsText(withEffect, state)).toBe('http://192.0.2.1');
  });
});

describe('reducer events of the v2 state', () => {
  const shell = initialState(runs.worlds.shell);
  const cloud = initialState(runs.worlds.cloud);

  it('starts lit, with no disabled step, and reads tables and entries from the reality scene', () => {
    expect(shell.candle).toBe('lit');
    expect(shell.disabledSteps).toBe(0);
    if (shell.copy.world !== 'shell') throw new Error('shell copy expected');
    expect(shell.copy.tables.map((t) => t.name)).toEqual(['users', 'orders']);
    expect(shell.copy.tables[0]).toEqual({ name: 'users', bars: 0, count: 1206, tag: '', cls: 'none' });
    expect(shell.copy.entries.map((e) => e.state)).toEqual(shell.copy.entries.map(() => 'intact'));
  });

  it('sets the candle and the stamp', () => {
    expect(reduceWalk(shell, { type: 'candle', state: 'flicker' }).candle).toBe('flicker');
    expect(reduceWalk(shell, { type: 'stamp', stamp: 'ASK A HUMAN' }).stamp).toBe('ASK A HUMAN');
  });

  it('patches one table and leaves the other alone', () => {
    const next = reduceWalk(shell, { type: 'table', name: 'users', count: 5, cls: 'soft', tag: 'x' });
    if (next.copy.world !== 'shell' || shell.copy.world !== 'shell') throw new Error('shell copy expected');
    expect(next.copy.tables[0]).toEqual({ name: 'users', bars: 0, count: 5, tag: 'x', cls: 'soft' });
    expect(next.copy.tables[1]).toEqual(shell.copy.tables[1]);
    expect(shell.copy.tables[0]?.count).toBe(1206);
  });

  it('changes an entry state or appends a created entry', () => {
    if (shell.copy.world !== 'shell') throw new Error('shell copy expected');
    const first = shell.copy.entries[0];
    if (first === undefined) throw new Error('entry expected');
    const gone = reduceWalk(shell, { type: 'entry', name: first.name, kind: first.kind, state: 'gone' });
    const added = reduceWalk(shell, { type: 'entry', name: 'new.txt', kind: 'file', state: 'new' });
    if (gone.copy.world !== 'shell' || added.copy.world !== 'shell') throw new Error('shell copy expected');
    expect(gone.copy.entries[0]?.state).toBe('gone');
    expect(gone.copy.entries).toHaveLength(shell.copy.entries.length);
    expect(added.copy.entries.at(-1)).toEqual({ name: 'new.txt', kind: 'file', state: 'new' });
    expect(shell.copy.entries).toHaveLength(added.copy.entries.length - 1);
  });

  it('tags a Cloud bucket and does not mutate the input', () => {
    if (cloud.copy.world !== 'cloud') throw new Error('cloud copy expected');
    const name = cloud.copy.buckets[0]?.name ?? '';
    const frozen = JSON.stringify(cloud);
    const next = reduceWalk(cloud, { type: 'bucketTag', name, tag: 'acl: public-read' });
    expect(JSON.stringify(cloud)).toBe(frozen);
    if (next.copy.world !== 'cloud') throw new Error('cloud copy expected');
    expect(next.copy.buckets[0]?.tag).toBe('acl: public-read');
  });

  it('disables steps, clamped to 0 to 4', () => {
    expect(reduceWalk(shell, { type: 'disable', count: 4 }).disabledSteps).toBe(4);
    expect(reduceWalk(shell, { type: 'disable', count: 9 }).disabledSteps).toBe(4);
    expect(reduceWalk(shell, { type: 'disable', count: -1 }).disabledSteps).toBe(0);
  });
});

describe('buildScript and settle by Outcome', () => {
  const shell = runs.worlds.shell;
  const hasType = (s: TimedEvent[], type: WalkEvent['type']): boolean => s.some((t) => t.event.type === type);
  const open: WorldRecord = { ...shell, fixed: null, outcome: 'block-open' };
  const pass: WorldRecord = { ...shell, plan: { ...shell.plan, verdict: 'pass' }, fixed: null, outcome: 'pass' };
  const warn: WorldRecord = { ...shell, plan: { ...shell.plan, verdict: 'warn' }, fixed: null, outcome: 'warn' };
  const unsupported: WorldRecord = { ...shell, fixed: null, outcome: 'unsupported', unsupported: { reason: 'r', known: ['ls'] } };

  it('block-open: step 5 only sets the edit note, with no re-copy and no plan change', () => {
    const s = buildScript(open, 4);
    expect(hasType(s, 'recopy')).toBe(false);
    expect(hasType(s, 'plan')).toBe(false);
    expect(s.find((t) => t.event.type === 'note')?.event).toEqual({ type: 'note', text: NOTE_EDIT });
    expect(settle(open, 4).candle).toBe('out');
    expect(settle(open, 4).badges.go).toBe(false);
  });

  it('pass: candle lit, stamp PASS, go badge at step 5', () => {
    expect(settle(pass, 3)).toMatchObject({ candle: 'lit', stamp: 'PASS', badges: { fingerprint: true, go: false } });
    expect(settle(pass, 4)).toMatchObject({ act: 5, badges: { fingerprint: false, go: true } });
  });

  it('warn: flickering candle, ASK A HUMAN, warn note, no go badge', () => {
    expect(settle(warn, 3)).toMatchObject({ candle: 'flicker', stamp: 'ASK A HUMAN', note: warnNote(warn) });
    expect(settle(warn, 4)).toMatchObject({ candle: 'flicker', act: 4, badges: { go: false } });
  });

  it('unsupported: step 1 disables steps 2 to 5 and later steps have no event', () => {
    expect(buildScript(unsupported, 0).some((t) => t.event.type === 'disable')).toBe(true);
    for (let step = 1; step < 5; step++) expect(buildScript(unsupported, step)).toEqual([]);
    expect(settle(unsupported, 4)).toEqual(settle(unsupported, 0));
    expect(settle(unsupported, 0).disabledSteps).toBe(4);
  });

  it('block-fixed: the final candle, stamp, and note come from the fixed verdict', () => {
    const stillBlocked: WorldRecord = { ...shell, fixed: { ...shell.fixed, verdict: 'block' } };
    expect(settle(stillBlocked, 4)).toMatchObject({ candle: 'out', stamp: 'BLOCKED', act: 4, badges: { go: false } });
    expect(settle(shell, 4)).toMatchObject({ candle: 'lit', stamp: 'PASS', act: 5, badges: { go: true } });
  });

  it('shell run of rm -rf: the entries go in the copy', () => {
    const rm = toWalkRecord((runsJson as unknown as RunsFile).worlds.shell, (runsJson as unknown as RunsFile).worlds.shell.presets[1]!);
    const gone = buildScript(rm, 1).filter((t) => t.event.type === 'entry');
    expect(gone.map((t) => (t.event as { name: string }).name).sort()).toEqual(['build', 'data']);
  });
});

import { describe, expect, it } from 'vitest';
import { GRAVEYARD_MAX, graveyardReducer, initialGraveyardState } from '../../src/state/graveyard';
import type { GraveyardEvent, GraveyardState } from '../../src/state/graveyard';
import type { Playground_Run } from '../../src/pipeline/run-playground';

function makeRun(verdict: 'pass' | 'warn' | 'block', wardIds: string[] = ['w1']): Playground_Run {
  const wardVerdict = {
    verdict,
    violations: wardIds.map((wardId) => ({ wardId })),
    notices: [],
  };
  return {
    report: { snapshots: [], changes: [[{ kind: 'x' }], []], effectsOutside: [], observedEvents: [], variantResults: [] },
    wardVerdict,
    verdict,
    claims: { mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: true },
  } as unknown as Playground_Run;
}

const plan = [{ command: 'rm -rf data' }, { command: 'ls' }];
const AT = '2030-01-02T03:04:05Z';

function add(s: GraveyardState, over: Partial<GraveyardEvent> = {}): GraveyardState {
  return graveyardReducer(s, { type: 'add', run: makeRun('block', ['a', 'b', 'a']), plan, recordedAt: AT, ...over });
}

describe('graveyardReducer', () => {
  it('records a blocked explicit run with every field', () => {
    const s = add(initialGraveyardState);
    expect(s.entries).toHaveLength(1);
    const g = s.entries[0]!;
    expect(g.id).toBe('g-1');
    expect(g.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(g.command).toBe('rm -rf data; ls');
    expect(g.recordedAt).toBe(AT);
    expect(g.wardIds).toEqual(['a', 'b']);
    expect(g.detail?.actionLabels).toEqual(['rm -rf data', 'ls']);
    expect(g.detail?.wardVerdict?.verdict).toBe('block');
    expect(g.detail?.changes).toHaveLength(2);
    expect(g.detail?.claims?.mode).toBe('playground');
    expect(g.detail?.sources).toBeUndefined();
    expect(s.nextId).toBe(2);
    expect(s.dropped).toBe(false);
  });

  it('adds possession detail when given', () => {
    const s = add(initialGraveyardState, { possession: { sources: [], needles: [], links: [] } });
    expect(s.entries[0]!.detail).toMatchObject({ sources: [], needles: [], links: [] });
  });

  it('ignores pass, warn, and non-explicit origins', () => {
    expect(add(initialGraveyardState, { run: makeRun('pass') })).toBe(initialGraveyardState);
    expect(add(initialGraveyardState, { run: makeRun('warn') })).toBe(initialGraveyardState);
    expect(add(initialGraveyardState, { origin: 'edit' })).toBe(initialGraveyardState);
    expect(add(initialGraveyardState, { origin: 'purify' })).toBe(initialGraveyardState);
    expect(add(initialGraveyardState, { origin: 'explicit' }).entries).toHaveLength(1);
  });

  it('drops the oldest entry on the 201st and sets dropped', () => {
    let s = initialGraveyardState;
    for (let i = 0; i < GRAVEYARD_MAX; i++) s = add(s);
    expect(s.entries).toHaveLength(200);
    expect(s.dropped).toBe(false);
    s = add(s);
    expect(s.entries).toHaveLength(200);
    expect(s.dropped).toBe(true);
    expect(s.entries[0]!.id).toBe('g-2');
    expect(s.entries[199]!.id).toBe('g-201');
  });

  it('stores no secret values or payloads', () => {
    const s = add(initialGraveyardState);
    const text = JSON.stringify(s.entries[0]);
    expect(text).not.toMatch(/secretValues|payload/);
  });
});

import { describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import { loadingLine, narration, stepLabel } from '../../src/data/narration';
import { toWalkRecord } from '../../src/data/walk-records';
import type { RunsFile, WorldId, WorldRecord } from '../../src/data/types';
import type { Segment } from '../../src/engine/types';

const runs = runsJson as unknown as RunsFile;
const text = (segs: Segment[]): string => segs.map((s) => s.text).join('');

/** The recorded record of one Preset of the committed Runs_File. */
function preset(world: WorldId, id: string): WorldRecord {
  const w = runs.worlds[world];
  const p = w.presets.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no Preset ${id}`);
  return toWalkRecord(w, p);
}

const DROP = preset('shell', 'shell-drop-users');
const RM = preset('shell', 'shell-rm-data-build');
const NPM = preset('shell', 'shell-npm-test');
const FAST = preset('hand', 'hand-fast-pull');
const STRONG = preset('hand', 'hand-strong-grip');
const SLOW = preset('hand', 'hand-slow-pull');
const DELETE_PROD = preset('cloud', 'cloud-delete-prod');
const PUBLIC = preset('cloud', 'cloud-make-public');
const ALL = [DROP, RM, NPM, FAST, STRONG, SLOW, DELETE_PROD, PUBLIC, preset('cloud', 'cloud-delete-tmp')];

function asWarn(r: WorldRecord): WorldRecord {
  const plan = { ...r.plan, verdict: 'warn' as const, effectsOutside: ['host.example'] };
  return { ...r, plan, fixed: null, outcome: 'warn' };
}

function bare(r: WorldRecord): WorldRecord {
  return { ...r, plan: { ...r.plan, facts: {} } };
}

describe('narration by outcome', () => {
  it('names a fact only when it exists: a record with no facts gets the generic verdict-and-ward sentence', () => {
    // The Cloud judge names a check label and no fact, so only Shell and Hand fall back here.
    for (const r of ALL.filter((x) => x.id !== 'cloud')) {
      const judge = text(narration(bare(r), 2));
      expect(judge).toContain('Judge. Ward ');
      expect(judge).toContain(`says ${r.plan.verdict}.`);
      expect(judge).not.toMatch(/\d/);
      expect(text(narration(bare(r), 1))).not.toMatch(/\d|poof/);
    }
  });

  it('uses the other templates for rm, npm, and the Cloud cases', () => {
    expect(text(narration(RM, 1))).toContain('2 entries are gone, but only in the copy.');
    expect(text(narration(NPM, 1))).toContain('Nothing in the copy changed.');
    expect(text(narration(PUBLIC, 1))).toContain('acl: public-read');
    expect(text(narration(PUBLIC, 3))).toBe('Verdict. I blow the candle out: blocked. Reality is untouched.');
    expect(text(narration(RM, 2))).toContain('Also ward protect-data: would delete protected path data.');
  });

  it('formats numbers: counts with a separator, forces with one decimal, rates as "7 of 8 = 88%"', () => {
    expect(text(narration(DROP, 1))).toContain('1,206 users');
    expect(text(narration(FAST, 2))).toContain('We got 7 of 8 = 88%.');
    expect(text(narration(STRONG, 2))).toContain('The strongest touch was 43.1 N, over the 30 N limit.');
    expect(text(narration(STRONG, 1))).toContain('Four of them can\'t finish.');
  });

  it('step 5 follows the Outcome', () => {
    expect(text(narration(DROP, 4))).toContain('backs up first');
    expect(text(narration({ ...DROP, fixed: null, outcome: 'block-open' }, 4))).toContain('Edit the plan above and run again.');
    expect(text(narration(SLOW, 4))).toContain('Nothing needs fixing');
    expect(text(narration(asWarn(NPM), 4))).toContain('A human has to say yes');
    expect(text(narration(asWarn(NPM), 3))).toContain('The candle flickers: ask a human.');
    expect(text(narration(asWarn(NPM), 3))).toContain('host.example');
  });

  it('says that the isolation check failed when the fingerprints differ', () => {
    const bad: WorldRecord = { ...DROP, plan: { ...DROP.plan, p1: { ...DROP.plan.p1, equal: false } } };
    expect(text(narration(bad, 3))).toContain('The isolation check failed');
    expect(text(narration(bad, 3))).not.toContain('still matches');
  });

  it('holds no HTML in any segment of any Outcome', () => {
    const records = [...ALL, asWarn(NPM), { ...DROP, fixed: null, outcome: 'block-open' as const }];
    for (const r of records) {
      for (let step = 0; step < 5; step++) {
        for (const seg of narration(r, step)) expect(seg.text).not.toMatch(/[<>]/);
      }
    }
  });
});

describe('unsupported explanations', () => {
  const secret = 'rm -rf / && echo SECRET-TOKEN';
  const shell: WorldRecord = {
    ...NPM,
    fixed: null,
    outcome: 'unsupported',
    unsupported: { reason: 'The ghost does not know this command.', known: ['ls', 'cat', 'rm'] },
  };
  const hand: WorldRecord = {
    ...FAST,
    fixed: null,
    outcome: 'unsupported',
    unsupported: { reason: 'The plan is not a pull.', known: ['pull speed from 0.05 to 0.6 m/s'] },
  };

  it('lists the commands of the world and the reason, and is the same on every step', () => {
    const s = text(narration(shell, 0));
    expect(s).toContain("I don't know this plan");
    expect(s).toContain('The ghost does not know this command.');
    expect(s).toContain('These are the commands I know: ls, cat, rm.');
    for (let step = 1; step < 5; step++) expect(narration(shell, step)).toEqual(narration(shell, 0));
  });

  it('lists the slider ranges for Hand', () => {
    expect(text(narration(hand, 0))).toContain('These are the ranges I know: pull speed from 0.05 to 0.6 m/s.');
  });

  it('holds no part of the input', () => {
    for (const r of [shell, hand]) expect(text(narration(r, 0))).not.toContain(secret);
    // The record has no field for the input, so a template cannot echo it.
    expect(JSON.stringify(shell.unsupported)).not.toContain(secret);
  });
});

describe('labels and loading lines', () => {
  it('has the step labels of Requirement 4', () => {
    expect([0, 1, 2, 3, 4].map(stepLabel)).toEqual([
      'STEP 1 · Copy · snapshot()',
      'STEP 2 · Run · step()',
      'STEP 3 · Judge · diff() and effectsOutside()',
      'STEP 4 · Verdict · render() and fingerprint()',
      'STEP 5 · Fix and go',
    ]);
    expect(() => stepLabel(5)).toThrow();
  });

  it('has a fixed loading line per world', () => {
    expect(text(loadingLine('hand'))).toBe('Summoning eight ghost arms…');
    expect(text(loadingLine('shell'))).toBe('Copying the project…');
    expect(text(loadingLine('cloud'))).toBe('Copying the buckets…');
  });
});

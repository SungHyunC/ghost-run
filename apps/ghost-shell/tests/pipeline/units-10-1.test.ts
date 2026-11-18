import { describe, expect, it } from 'vitest';
import type { WardVerdict } from '@ghost-run/core';
import * as texts from '../../src/texts';
import { deriveClaims } from '../../src/pipeline/claims';
import { buildShownVerdict, maxVerdict, verdictFloor } from '../../src/pipeline/verdict';
import { readSecretValues } from '../../src/pipeline/secrets';
import { toStepViews, unsupportedStepIndexes } from '../../src/pipeline/steps';

const pass: WardVerdict = { verdict: 'pass', violations: [], notices: [] };
const step = (i: number, o: { unsupported?: boolean; watchdog?: boolean } = {}) => ({
  stepIndex: i,
  unsupported: o.unsupported ?? false,
  watchdog: o.watchdog ?? false,
});

describe('texts', () => {
  it('pins the literal strings of the requirements', () => {
    expect(texts.DOCKER_BOX_NOT_USED_TEXT).toBe('Docker box (real mode) is not used by this page.');
    expect(texts.EMPTY_PLAN_TEXT).toBe('The plan is empty: add a command first.');
    expect(texts.P1_FAILED_TEXT).toBe('Ghost run changed reality: this is a bug in the playground.');
    expect(texts.GRAVEYARD_DROPPED_TEXT).toBe('Oldest blocked command dropped (limit 200).');
    expect(texts.RUN_FAILED_TEXT).toBe('The playground failed to run this plan.');
    expect(texts.SQL_START_FAILED_TEXT).toBe('The SQL engine failed to start.');
    expect(texts.MESSAGE_PANEL_LABEL).toBe('Message the agent receives');
    expect(texts.UNSUPPORTED_STEP_REASON).toBe('unsupported command, not rehearsed.');
    expect(texts.WATCHDOG_STEP_REASON).toBe('sql statement exceeded the watchdog, not rehearsed.');
    expect(texts.SCRIPTED_PLAN_TEXT).toBe('Scripted plan: not decided by an LLM in this page.');
    expect(texts.RECORDED_PLAN_TEXT).toBe('Recorded plan: replayed here, not decided by an LLM in this page.');
    expect(texts.BLACKLIGHT_NO_FINDINGS_TEXT).toBe('No hidden text found by the blacklight.');
    expect(texts.BLACKLIGHT_DISCLAIMER_TEXT).toBe('Text analysis does not catch every injection.');
  });

  it('uses neither "sealed" nor "isolated" and no hidden characters', () => {
    for (const v of Object.values(texts)) {
      expect(v).not.toMatch(/sealed|isolated/i);
      expect(v).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});

describe('claims', () => {
  const clean = { p1Failed: false, unsupportedSteps: [], watchdogFired: false, readCoverage: 'complete' as const };
  it('claims everything for a clean run, with no reason', () => {
    const r = deriveClaims(clean);
    expect(r.claims).toEqual({ mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: true });
    expect('reason' in r.claims).toBe(false);
    expect(r.p2Note).toEqual({ claimed: true });
  });
  it('drops P5 and P6 for an unsupported step, P6 for partial coverage, all for P1 failure', () => {
    expect(deriveClaims({ ...clean, unsupportedSteps: [1] })).toMatchObject({
      claims: { p1Claimed: true, p5Claimed: false, p6Claimed: false },
      p2Note: { claimed: false, reason: 'unsupported-step' },
    });
    expect(deriveClaims({ ...clean, watchdogFired: true })).toMatchObject({
      claims: { p5Claimed: false, p6Claimed: false },
      p2Note: { claimed: false, reason: 'watchdog' },
    });
    expect(deriveClaims({ ...clean, readCoverage: 'partial' }).claims).toMatchObject({ p5Claimed: true, p6Claimed: false });
    expect(deriveClaims({ ...clean, p1Failed: true }).claims).toMatchObject({
      p1Claimed: false,
      p5Claimed: false,
      p6Claimed: false,
    });
  });
});

describe('verdict', () => {
  it('orders pass < warn < block', () => {
    expect(maxVerdict('pass', 'warn')).toBe('warn');
    expect(maxVerdict('block', 'warn')).toBe('block');
    expect(maxVerdict('pass', 'pass')).toBe('pass');
  });
  it('computes the floor', () => {
    expect(verdictFloor(false, [step(0)])).toBe('pass');
    expect(verdictFloor(false, [step(0, { unsupported: true })])).toBe('warn');
    expect(verdictFloor(false, [step(0, { watchdog: true })])).toBe('warn');
    expect(verdictFloor(true, [step(0)])).toBe('block');
  });
  it('adds notices in stepIndex order after the engine notices', () => {
    const engine: WardVerdict = {
      verdict: 'warn',
      violations: [],
      notices: [{ kind: 'observed-event', stepIndex: 0, reason: 'x' }],
    };
    const shown = buildShownVerdict(engine, false, [step(3, { watchdog: true }), step(1, { unsupported: true })]);
    expect(shown.verdict).toBe('warn');
    expect(shown.notices.map((n) => [n.kind, n.stepIndex, n.reason])).toEqual([
      ['observed-event', 0, 'x'],
      ['unsupported-step', 1, 'unsupported command, not rehearsed.'],
      ['unsupported-step', 3, 'sql statement exceeded the watchdog, not rehearsed.'],
    ]);
  });
  it('keeps pass only without a floor and blocks on P1 failure', () => {
    expect(buildShownVerdict(pass, false, [step(0)]).verdict).toBe('pass');
    expect(buildShownVerdict(pass, true, [step(0)]).verdict).toBe('block');
  });
});

describe('secrets', () => {
  const file = (s: string) => ({ kind: 'file' as const, bytes: new TextEncoder().encode(s) });
  it('copies matching files in code point order, at most 16, 65,536 bytes each', () => {
    const entries: Record<string, ReturnType<typeof file> | { kind: 'dir' }> = { data: { kind: 'dir' } };
    for (let i = 0; i < 20; i++) entries[`k/s${String(i).padStart(2, '0')}.key`] = file('sk-CANARY-x');
    entries['.env'] = { kind: 'file', bytes: new Uint8Array(70_000).fill(65) };
    entries['other.txt'] = file('no');
    const r = readSecretValues(entries, ['.env', 'k/*.key']);
    const keys = [...r.values.keys()];
    expect(keys).toHaveLength(16);
    expect(keys[0]).toBe('.env');
    expect(r.values.get('.env')?.byteLength).toBe(65_536);
    expect(keys).not.toContain('other.txt');
  });
  it('reads nothing for no patterns and copies and zero-fills on release', () => {
    const e = { '.env': file('sk-CANARY-abc') };
    expect(readSecretValues(e, []).values.size).toBe(0);
    const r = readSecretValues(e, ['.env']);
    const copy = r.values.get('.env')!;
    expect(copy).not.toBe(e['.env'].bytes);
    r.release();
    expect(r.values.size).toBe(0);
    expect([...copy].every((b) => b === 0)).toBe(true);
    expect(new TextDecoder().decode(e['.env'].bytes)).toBe('sk-CANARY-abc');
  });
});

describe('steps', () => {
  it('projects step records to plain views', () => {
    const rec = { stepIndex: 2, command: 'x', exitCode: 127, stdout: '', stderr: 'unsupported: y', unsupported: true, unsupportedReason: 'y', watchdog: false };
    const v = toStepViews([rec]);
    expect(v).toEqual([{ stepIndex: 2, command: 'x', exitCode: 127, stdout: '', stderr: 'unsupported: y', unsupported: true, watchdog: false }]);
    expect(unsupportedStepIndexes(v)).toEqual([2]);
  });
});

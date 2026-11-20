import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { PlanBox } from '../../src/components/walk/PlanBox';
import { RealityPane } from '../../src/components/walk/RealityPane';
import { Stepper } from '../../src/components/walk/Stepper';
import { Theater } from '../../src/components/walk/Theater';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import type { RunOutcome, RunsFile, WorldRecord } from '../../src/data/types';
import { goBadge, settle } from '../../src/engine/script';
import type { WalkView } from '../../src/engine/types';
import { effectsText } from '../../src/engine/useWalk';

const runs = toWalkRuns(runsJson as unknown as RunsFile);
const base = runs.worlds.shell;

const RECORDS: Record<RunOutcome, WorldRecord> = {
  'block-fixed': base,
  'block-open': { ...base, fixed: null, outcome: 'block-open' },
  pass: { ...base, plan: base.fixed, fixed: null, outcome: 'pass' },
  warn: {
    ...base,
    plan: { ...base.fixed, verdict: 'warn', effectsOutside: ['example.test'] },
    fixed: null,
    outcome: 'warn',
  },
  unsupported: {
    ...base,
    fixed: null,
    outcome: 'unsupported',
    unsupported: { reason: 'This command is not in the ghost world.', known: ['ls', 'cat'] },
  },
};

function view(record: WorldRecord): WalkView {
  const state = settle(record, 4);
  return { ...state, ward: { id: record.ward.id, effectsOutside: effectsText(record, state) } };
}

function page(record: WorldRecord) {
  const v = view(record);
  return render(
    <>
      <Sprite />
      <PlanBox
        world="shell"
        text={v.plan.text}
        sliders={{ speed: 0.6, force: 20, distance: 0.2 }}
        rev={v.plan.rev}
        busy={false}
        presets={[]}
        activeId={null}
        onText={() => undefined}
        onSliders={() => undefined}
        onRun={() => undefined}
        onPreset={() => undefined}
      />
      <Stepper step={v.step} disabledSteps={v.disabledSteps} onJump={() => undefined} />
      <Theater
        view={v}
        goText={goBadge(record)}
        reality={<RealityPane scene={record.reality} />}
        copy={<CopyPane record={record} copy={v.copy} fixed={v.plan.rev} />}
      />
    </>,
  ).container;
}

afterEach(cleanup);

const q = (c: Element, sel: string) => c.querySelector(sel);
const t = (c: Element, sel: string) => q(c, sel)?.textContent;
const shown = (c: Element, sel: string) => q(c, sel)?.classList.contains('show') === true;
const candle = (c: Element) => q(c, '#vcandle')?.getAttribute('class');

describe('the five Outcomes at the end of the walk', () => {
  it('block-fixed: PASS stamp, lit candle, pass note, go badge, the Fixed_Plan in the plan box', () => {
    const c = page(RECORDS['block-fixed']);
    expect(t(c, '#stamp')).toBe('PASS');
    expect(q(c, '#stamp')?.className).toBe('stamp pass show');
    expect(candle(c)).toBe('bigcandle');
    expect(q(c, '#vnote')).toBeNull();
    expect(shown(c, '#gob')).toBe(true);
    expect(shown(c, '#fpb')).toBe(false);
    expect((q(c, '#cmd') as HTMLInputElement).value).toBe(base.fixed.display);
    // A finished run does not lock the box: it is read-only only while a run animates.
    expect((q(c, '#cmd') as HTMLInputElement).readOnly).toBe(false);
    expect(c.querySelectorAll('#rail [aria-disabled]')).toHaveLength(0);
  });

  it('block-open: BLOCKED stamp, candle out, block note, fingerprint badge, edit hint, plan box unchanged', () => {
    const rec = RECORDS['block-open'];
    const c = page(rec);
    expect(q(c, '#stamp')?.className).toBe('stamp block show');
    expect(t(c, '#stamp')).toBe('BLOCKED');
    expect(candle(c)).toBe('bigcandle out');
    expect(q(c, '#vnote')).toBeNull();
    expect(t(c, '#sayt')).toContain('Edit the plan above and run again.');
    expect(shown(c, '#fpb')).toBe(true);
    expect(shown(c, '#gob')).toBe(false);
    expect((q(c, '#cmd') as HTMLInputElement).value).toBe(rec.plan.display);
    expect((q(c, '#cmd') as HTMLInputElement).readOnly).toBe(false);
  });

  it('pass: PASS stamp, lit candle, pass note, go badge and no fingerprint badge', () => {
    const rec = RECORDS.pass;
    const c = page(rec);
    expect(t(c, '#stamp')).toBe('PASS');
    expect(candle(c)).toBe('bigcandle');
    expect(q(c, '#vnote')).toBeNull();
    expect(shown(c, '#gob')).toBe(true);
    expect(shown(c, '#fpb')).toBe(false);
    expect((q(c, '#cmd') as HTMLInputElement).value).toBe(rec.plan.display);
  });

  it('warn: ASK A HUMAN stamp, flickering candle, warn note, no go badge', () => {
    const rec = RECORDS.warn;
    const c = page(rec);
    expect(t(c, '#stamp')).toBe('ASK A HUMAN');
    expect(q(c, '#stamp')?.className).toBe('stamp warn show');
    expect(candle(c)).toBe('bigcandle flicker');
    expect(q(c, '#vnote')).toBeNull();
    expect(shown(c, '#gob')).toBe(false);
    expect(t(c, '#eo')).toBe('effectsOutside: example.test');
  });

  it('unsupported: only step 1 ran, four steps are disabled, nothing is judged', () => {
    const c = page(RECORDS.unsupported);
    expect(t(c, '#stamp')).toBe('');
    expect(candle(c)).toBe('bigcandle');
    expect(q(c, '#checks')?.children).toHaveLength(0);
    expect(shown(c, '#fpb')).toBe(false);
    expect(shown(c, '#gob')).toBe(false);
    const disabled = [...c.querySelectorAll('#rail button')].map((b) => b.getAttribute('aria-disabled'));
    expect(disabled).toEqual([null, 'true', 'true', 'true', 'true']);
    expect((q(c, '#cmd') as HTMLInputElement).value).toBe(RECORDS.unsupported.plan.display);
  });
});

describe('the ward card', () => {
  it('is named after the violated ward ids, the headline ward first', async () => {
    const { wardName } = await import('../../src/components/walk/Cards');
    expect(wardName('no-data-loss', [])).toBe('no-data-loss');
    expect(wardName('no-data-loss', ['b-ward', 'no-data-loss'])).toBe('no-data-loss, b-ward');
    expect(wardName('no-data-loss', ['x-ward'])).toBe('x-ward');
    const rec = RECORDS['block-open'];
    const v = view(rec);
    const c = render(
      <Theater
        view={v}
        goText="go"
        reality={null}
        copy={null}
        violatedWardIds={['no-data-loss', 'x-ward']}
      />,
    ).container;
    expect(t(c, '#wname')).toBe('no-data-loss, x-ward');
  });
});

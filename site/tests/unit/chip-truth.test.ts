// A check chip must agree with the ward verdict of the same run: the chip is a cross exactly when that ward
// has a violation, its text says what happened, and the ward card tone follows the verdict.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanRecord, WorldRecord } from '../../src/data/types';
import { buildScript } from '../../src/engine/script';
import { createCloudEngine } from '../../src/live/cloud';
import { extraChips, reasonOf, violationsOf } from '../../src/live/derive/common';
import { handPlanRecord } from '../../src/live/derive/hand';
import type { HandRunLike } from '../../src/live/derive/hand';
import { shellPlanRecord } from '../../src/live/derive/shell';
import type { ShellPlanInput } from '../../src/live/derive/shell';
import type { LiveAnswer, LiveEngine, LiveRun } from '../../src/live/types';

const ROOT = resolve(__dirname, '../../..');
const cloudWards = readFileSync(resolve(ROOT, 'worlds/ghost-cloud/wards.yaml'), 'utf8');

function ran(a: LiveAnswer): LiveRun {
  if (a.status !== 'ran') throw new Error(`expected ran, got ${a.status}`);
  return a.run;
}

/** The tone event of step 3 of a record built from `plan`. */
function toneOf(plan: PlanRecord, run: LiveRun): 'good' | 'bad' | undefined {
  const record: WorldRecord = { id: run.world, ward: run.ward, reality: run.reality, plan, fixed: null, outcome: plan.verdict === 'block' ? 'block-open' : plan.verdict, source: 'live' };
  const tone = buildScript(record, 2).find((e) => e.event.type === 'wardTone');
  return tone?.event.type === 'wardTone' ? tone.event.tone : undefined;
}

describe('Ghost Cloud chips (real world)', () => {
  let engine: LiveEngine;
  beforeAll(() => {
    engine = createCloudEngine({ wardsText: cloudWards });
  });
  const cloud = async (...lines: string[]) => ran(await engine.run({ world: 'cloud', lines }));

  it('crosses the chip and says what was deleted when objects go from a protected bucket', async () => {
    const run = await cloud('aws s3 rm s3://prod-logs --recursive');
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.violatedWardIds).toEqual(['no-bucket-delete']);
    expect(run.plan.checks).toEqual([{ label: 'never delete prod-*', measured: '2 objects deleted in prod-logs', ok: false }]);
    expect(toneOf(run.plan, run)).toBe('bad');
  });

  it('crosses the chip when a protected bucket is deleted', async () => {
    const run = await cloud('aws s3 rb s3://prod-assets --force');
    expect(run.plan.checks[0]).toEqual({ label: 'never delete prod-*', measured: 'prod-assets deleted', ok: false });
    expect(toneOf(run.plan, run)).toBe('bad');
  });

  it('ticks the chip only when the ward has no violation, and the card is good', async () => {
    const run = await cloud('aws s3 rb s3://tmp-build-cache --force');
    expect(run.plan.violatedWardIds).toEqual([]);
    expect(run.plan.checks).toEqual([{ label: 'never delete prod-*', measured: 'tmp-build-cache is not prod-*', ok: true }]);
    expect(toneOf(run.plan, run)).toBe('good');
  });

  it('says that objects were deleted outside prod-* when the ward is not violated', async () => {
    const run = await cloud('aws s3 rm s3://tmp-build-cache --recursive');
    expect(run.plan.violatedWardIds).toEqual([]);
    expect(run.plan.checks[0]).toMatchObject({ ok: true });
    expect(run.plan.checks[0]?.measured).toBe('2 objects deleted in tmp-build-cache, none in prod-*');
  });

  it('crosses the second ward and keeps the first chip ticked when only the ACL changes', async () => {
    const run = await cloud('aws s3api put-bucket-acl --bucket prod-assets --acl public-read');
    expect(run.plan.violatedWardIds).toEqual(['no-public-bucket']);
    expect(run.plan.checks[0]).toMatchObject({ label: 'never delete prod-*', ok: true });
    expect(run.plan.checks[1]).toMatchObject({ label: 'no-public-bucket', ok: false });
    expect(toneOf(run.plan, run)).toBe('bad');
  });

  it('for every plan: a chip is a cross exactly when its ward is violated, and the tone follows', async () => {
    const plans = [
      'aws s3 rm s3://prod-logs --recursive',
      'aws s3 rm s3://prod-assets/index.html',
      'aws s3 rb s3://prod-assets --force',
      'aws s3 rb s3://prod-logs --force',
      'aws s3 rb s3://tmp-build-cache --force',
      'aws s3 rm s3://tmp-build-cache --recursive',
      'aws s3 ls',
      'aws s3api put-bucket-acl --bucket prod-assets --acl public-read',
    ];
    for (const line of plans) {
      const run = await cloud(line);
      const violated = new Set(run.plan.violatedWardIds);
      for (const check of run.plan.checks) {
        const ward = check.label.startsWith('never delete') ? run.ward.id : check.label;
        expect(check.ok, `${line}: ${check.label}`).toBe(!violated.has(ward));
      }
      for (const id of violated) {
        expect(run.plan.checks.some((c) => c.ok === false && (c.label === id || (id === run.ward.id && c.label.startsWith('never delete')))), `${line}: ${id}`).toBe(true);
      }
      expect(toneOf(run.plan, run), line).toBe(violated.size > 0 ? 'bad' : 'good');
    }
  });
});

describe('Ghost Shell chips', () => {
  const ward = { id: 'no-data-loss', tables: ['users', 'orders'], maxRowsLost: 0 };
  const scene = (users: number) => ({
    files: [{ path: 'app.db', type: 'file' }],
    databases: [{ path: 'app.db', tables: [{ name: 'users', rows: users }, { name: 'orders', rows: 4 }] }],
  });
  const input = (over: Partial<ShellPlanInput>): ShellPlanInput => ({
    commands: ['x'],
    verdict: 'pass',
    violations: [],
    ward,
    secretPatterns: ['.env'],
    before: scene(10),
    after: scene(10),
    effects: [],
    observedEvents: [],
    p1: { before: 'a', after: 'a' },
    message: '',
    ...over,
  });

  it('crosses no-data-loss with the rows lost, and only when that ward is violated', () => {
    const lost = shellPlanRecord(input({ verdict: 'block', after: scene(0), violations: [{ wardId: 'no-data-loss', reason: 'would lose 10 rows from users' }] }));
    expect(lost.checks).toEqual([{ label: 'rows lost, at most 0', measured: '10 from users', ok: false }]);
    const kept = shellPlanRecord(input({}));
    expect(kept.checks).toEqual([{ label: 'rows lost, at most 0', measured: '0', ok: true }]);
  });

  it('crosses protect-data and no-secret-egress with the engine reason, one chip per ward, and ticks no-data-loss', () => {
    const rec = shellPlanRecord(
      input({
        verdict: 'block',
        violations: [
          { wardId: 'protect-data', reason: 'would delete protected path data' },
          { wardId: 'no-secret-egress', reason: 'network attempt to host.example after reading .env' },
          { wardId: 'protect-data', reason: 'would delete protected path data/b' },
        ],
      }),
    );
    expect(rec.checks.map((c) => [c.label, c.ok])).toEqual([
      ['rows lost, at most 0', true],
      ['no-secret-egress', false],
      ['protect-data', false],
    ]);
    expect(rec.checks[2]?.measured).toBe('would delete protected path data');
    expect(rec.violatedWardIds).toEqual(['no-secret-egress', 'protect-data']);
  });

  it('crosses the headline chip whenever no-data-loss is violated, whatever the row count says', () => {
    const rec = shellPlanRecord(input({ verdict: 'block', violations: [{ wardId: 'no-data-loss', reason: 'rows lost' }] }));
    expect(rec.checks[0]?.ok).toBe(false);
  });
});

describe('Ghost Hand chips', () => {
  const ward = { id: 'gentle-hands', min_success_rate: 0.95, max_contact_force_n: 30, forbidden_contacts: ['vase'] };
  const variantRow = (i: number) => ({
    id: `variant-${i}`,
    params: { drawerFrictionN: 2, drawerMassKg: 0.6, handleOffsetM: [0, 0, 0] as const, sensorNoiseM: 0, commandDelaySteps: 0 },
    drawerDisplacementM: 0.1,
    vaseTouched: false,
  });
  const rows = [{ ...variantRow(0), id: 'base' }, ...Array.from({ length: 8 }, (_, i) => variantRow(i))];

  const REASONS = {
    rate: 'success rate 7/8 (0.88) below minimum 0.95',
    force: 'variant variant-1 contact force 31.5 N exceeds max 30 N',
    contact: 'variant variant-2 made forbidden contact (vase)',
    joint: 'joint limit exceeded in variant variant-3',
  } as const;
  type Kind = keyof typeof REASONS;
  const kinds = Object.keys(REASONS) as Kind[];

  function record(active: readonly Kind[]): PlanRecord {
    const run: HandRunLike = {
      verdict: active.length > 0 ? 'block' : 'pass',
      message: '',
      violations: active.map((k) => ({ wardId: 'gentle-hands', reason: REASONS[k] })),
      p1: { equal: true, before: 'a', after: 'a' },
      rows,
      variantResults: Array.from({ length: 8 }, (_, i) => ({
        variantId: `variant-${i}`,
        success: !(active.includes('rate') && i === 0),
        contactForceN: active.includes('force') && i === 1 ? 31.5 : 10,
        ...(active.includes('joint') && i === 3 ? { jointLimitExceeded: true } : {}),
      })),
    };
    return handPlanRecord({ commands: ['plan'], run, ward, effects: [[]] });
  }

  it('crosses exactly the chips whose violation is in the verdict', () => {
    fc.assert(
      fc.property(fc.subarray(kinds), (active) => {
        const rec = record(active);
        const [rate, force, contact] = rec.checks;
        expect(rate?.ok).toBe(!active.includes('rate'));
        expect(force?.ok).toBe(!active.includes('force'));
        expect(contact?.ok).toBe(!active.includes('contact'));
        // A joint limit has no chip of its own among the three: it gets the ward chip.
        const wardChip = rec.checks.find((c) => c.label === 'gentle-hands');
        expect(wardChip === undefined).toBe(!active.includes('joint'));
        expect(wardChip?.ok ?? false).toBe(false);
        // The ward has a violation exactly when at least one chip is a cross.
        expect(rec.checks.some((c) => !c.ok)).toBe(active.length > 0);
        expect(rec.violatedWardIds).toEqual(active.length > 0 ? ['gentle-hands'] : []);
      }),
      { numRuns: 60 },
    );
  });

  it('describes the real violation in the chip text', () => {
    const rec = record(['contact', 'joint']);
    expect(rec.checks[2]).toMatchObject({ measured: 'touched', ok: false });
    expect(rec.checks[3]).toEqual({ label: 'gentle-hands', measured: 'joint limit exceeded in 1 of 8 variants', ok: false });
  });
});

describe('derive/common helpers', () => {
  const violations = [
    { wardId: 'b-ward', reason: 'second' },
    { wardId: 'a-ward', reason: 'first' },
    { wardId: 'a-ward', reason: 'again' },
    { wardId: 'head', reason: 'headline' },
  ];
  it('lists the violations of one ward and its first reason', () => {
    expect(violationsOf(violations, 'a-ward')).toHaveLength(2);
    expect(reasonOf(violations, 'a-ward')).toBe('first');
    expect(reasonOf(violations, 'none')).toBeNull();
  });
  it('gives one chip per violated ward other than the headline, in id order', () => {
    expect(extraChips(violations, 'head')).toEqual([
      { wardId: 'a-ward', text: 'first' },
      { wardId: 'b-ward', text: 'second' },
    ]);
    expect(extraChips([], 'head')).toEqual([]);
  });
});

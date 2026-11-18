// Task 8.6: behavior before PR-1, PR-2, and PR-3 land (Req 8.7, 9.9, 10.1, 21.4, 21.5, 21.6).
// Pre-landing legs run through capability OVERRIDES so both paths are covered whatever has landed.
// Post-landing legs run only when the probe reports the capability.
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as core from '@ghost-run/core';
import * as ui from '@ghost-run/ui';
import { BASE_VARIANT_PARAMS, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import {
  LOWERED_CLAIM_FRAGMENT,
  capabilityTexts,
  mayClaimJointSelfWard,
  messageContextFor,
  probeCapabilities,
  type Capabilities,
} from '../../src/capabilities';
import { buildIsolationClaims, buildNotices, buildRows, deriveVariantResult } from '../../src/pipeline';
import type { VariantOutcome } from '../../src/pipeline';
import * as texts from '../../src/texts';
import { JOINT_LIMIT_INACTIVE_TEXT, PROVISIONAL_WORDING_TEXT } from '../../src/texts';

const observed = probeCapabilities();
const caps = (o: Partial<Capabilities>): Capabilities => ({
  jointSelfWard: false,
  claimsOptional: false,
  bannerNotApplicable: false,
  ...o,
});

const PHYSICS_WARD_SET = {
  wards: [
    { id: 'arm', kind: 'physics', min_success_rate: 0, max_contact_force_n: 1e9, forbidden_contacts: [] },
  ],
} as unknown as core.WardSet;
const EMPTY_WARD_SET = { wards: [] } as unknown as core.WardSet;

function outcome(index: number, over: Partial<VariantOutcome['monitors']> = {}): VariantOutcome {
  return {
    index,
    params: BASE_VARIANT_PARAMS,
    finalDrawerM: WORLD_CONFIG.targetOpeningM,
    monitors: {
      maxContactForceN: 1,
      touched: [],
      jointLimitExceeded: false,
      jointLimitSteps: 0,
      selfCollisionOccurred: false,
      selfCollisionSteps: 0,
      ...over,
    },
    failedSteps: [],
    firstTouch: {},
    trajectoryHash: '00',
  };
}

const PASS = { verdict: 'pass', violations: [], notices: [] } as unknown as core.WardVerdict;
const noClaims = { p5: false, p6: false } as const;
const render = core.renderMessage as (v: core.WardVerdict, c: unknown) => string;

describe('before PR-1 (jointSelfWard false, by override)', () => {
  const off = caps({ jointSelfWard: false });
  const flagged = outcome(0, { jointLimitExceeded: true, jointLimitSteps: 3, selfCollisionOccurred: true, selfCollisionSteps: 2 });

  it('the monitors still record both facts and the variant row shows them', () => {
    const result = deriveVariantResult(flagged, [], off);
    expect(result.jointLimitExceeded).toBe(true);
    expect(result.selfCollisionOccurred).toBe(true);
    const base = outcome(0);
    const rows = buildRows(base, deriveVariantResult(base, [], off), [flagged], [result]);
    expect(rows[1]).toMatchObject({ id: 'variant-0', jointLimitExceeded: true, selfCollisionOccurred: true });
  });

  it('the facts are not folded into success or the forbidden contacts', () => {
    const result = deriveVariantResult(flagged, ['vase'], off);
    expect(result.success).toBe(true);
    expect(result.forbiddenContactOccurred).toBe(false);
  });

  it('the inactive notice is present; no claim text for the ward exists', () => {
    expect(buildNotices(off, PHYSICS_WARD_SET)).toContain(JOINT_LIMIT_INACTIVE_TEXT);
    expect(JOINT_LIMIT_INACTIVE_TEXT).toBe('Joint-limit and self-collision wards are not active in this build.');
    expect(capabilityTexts(off).jointLimitInactive).toBe(JOINT_LIMIT_INACTIVE_TEXT);
    expect(mayClaimJointSelfWard(off)).toBe(false);
    // Only the inactive notice may mention the ward among the fixed texts.
    const mentions = Object.entries(texts)
      .filter(([, v]) => typeof v === 'string' && /joint|self-collision/i.test(v))
      .map(([k]) => k);
    expect(mentions).toEqual(['JOINT_LIMIT_INACTIVE_TEXT']);
  });

  it('the notice is absent once the capability is on', () => {
    expect(buildNotices(caps({ jointSelfWard: true }), PHYSICS_WARD_SET)).not.toContain(JOINT_LIMIT_INACTIVE_TEXT);
    expect(mayClaimJointSelfWard(caps({ jointSelfWard: true }))).toBe(true);
  });
});

describe('before PR-2 (claimsOptional false, by override)', () => {
  const off = caps({ claimsOptional: false });

  it('the message is produced with claims { p5: false, p6: false }', () => {
    const ctx = messageContextFor(off, 1);
    expect(ctx).toEqual({ wardCount: 1, claims: noClaims });
    const text = render(PASS, ctx);
    expect(text).toContain('GHOST RUN PASSED');
    // The last line is the lowered-claim line; it is not hidden or dropped by the app.
    expect(text.split('\n').at(-1)).toContain(LOWERED_CLAIM_FRAGMENT);
  });

  it('the provisional-wording note is in the notices', () => {
    expect(buildNotices(off, PHYSICS_WARD_SET)).toContain(PROVISIONAL_WORDING_TEXT);
    expect(capabilityTexts(off).provisionalWording).toBe(PROVISIONAL_WORDING_TEXT);
  });

  it('dropping a line of the message never counts as meeting the requirement', () => {
    // Without claims the context carries none, and with claims the note stays: the two are paired.
    const withClaims = messageContextFor(off, 1);
    const without = messageContextFor(caps({ claimsOptional: true }), 1);
    expect('claims' in withClaims).toBe(true);
    expect('claims' in without).toBe(false);
    expect(buildNotices(caps({ claimsOptional: true }), PHYSICS_WARD_SET)).not.toContain(PROVISIONAL_WORDING_TEXT);
    // A message cut by the app has no lowered-claim line yet the note is still required while off.
    const dropped = render(PASS, messageContextFor(off, 1)).split('\n').slice(0, -1).join('\n');
    expect(dropped).not.toContain(LOWERED_CLAIM_FRAGMENT);
    expect(buildNotices(off, PHYSICS_WARD_SET)).toContain(PROVISIONAL_WORDING_TEXT);
  });
});

describe('before PR-3 (bannerNotApplicable false, by override)', () => {
  it('the claims carry p5Claimed false, p6Claimed false and no PR-3 field', () => {
    for (const p1 of [true, false]) {
      const claims = buildIsolationClaims(p1, caps({ bannerNotApplicable: false }));
      expect(claims).toEqual({ mode: 'playground', p1Claimed: p1, p5Claimed: false, p6Claimed: false });
      expect(Object.keys(claims).sort()).toEqual(['mode', 'p1Claimed', 'p5Claimed', 'p6Claimed']);
    }
  });

  it('with the capability on, P5 and P6 stay unclaimed and the field is added', () => {
    const claims = buildIsolationClaims(true, caps({ bannerNotApplicable: true }));
    expect(claims).toMatchObject({ p5Claimed: false, p6Claimed: false, notApplicable: ['P5', 'P6'] });
  });
});

describe('PR-1 landed legs (skipped (PR-1 not landed) when the probe is false)', () => {
  const run = (f?: string) =>
    core.WardEngine.evaluate(
      {
        snapshots: [],
        changes: [],
        effectsOutside: [],
        observedEvents: [],
        variantResults: [{ variantId: 'v', success: true, ...(f ? { [f]: true } : {}) }],
      } as unknown as Parameters<typeof core.WardEngine.evaluate>[0],
      PHYSICS_WARD_SET as unknown as Parameters<typeof core.WardEngine.evaluate>[1],
    );

  it.skipIf(!observed.jointSelfWard)('the physics ward blocks on each fact and passes without them', () => {
    expect(run().verdict).toBe('pass');
    for (const f of ['jointLimitExceeded', 'selfCollisionOccurred']) {
      const v = run(f);
      expect(v.verdict).toBe('block');
      expect(v.violations[0]?.wardKind).toBe('physics');
    }
  });

  it.skipIf(!observed.jointSelfWard)('the ward set without a physics ward does not block on the facts', () => {
    const v = core.WardEngine.evaluate(
      {
        snapshots: [],
        changes: [],
        effectsOutside: [],
        observedEvents: [],
        variantResults: [{ variantId: 'v', success: true, jointLimitExceeded: true }],
      } as unknown as Parameters<typeof core.WardEngine.evaluate>[0],
      EMPTY_WARD_SET as unknown as Parameters<typeof core.WardEngine.evaluate>[1],
    );
    expect(v.verdict).not.toBe('block');
  });
});

describe('PR-2 landed legs (skipped (PR-2 not landed) when the probe is false)', () => {
  it.skipIf(!observed.claimsOptional)('no lowered-claim line without claims; the line returns with claims', () => {
    expect(render(PASS, messageContextFor(caps({ claimsOptional: true }), 1))).not.toContain(LOWERED_CLAIM_FRAGMENT);
    expect(render(PASS, { wardCount: 1, claims: noClaims })).toContain(LOWERED_CLAIM_FRAGMENT);
  });
});

describe('PR-3 landed legs (skipped (PR-3 not landed) when the probe is false)', () => {
  const html = (claims: object) =>
    renderToStaticMarkup(createElement(ui.Candle as unknown as ComponentType<Record<string, unknown>>, { verdict: PASS, claims }));

  it.skipIf(!observed.bannerNotApplicable)('the banner shows P5 and P6 as not applicable only with the field', () => {
    const on = html(buildIsolationClaims(true, caps({ bannerNotApplicable: true })));
    expect(on).toContain('P5: not applicable to this world');
    expect(on).toContain('P6: not applicable to this world');
    const off = html(buildIsolationClaims(true, caps({ bannerNotApplicable: false })));
    expect(off).not.toContain('not applicable');
    expect(off).toContain('P5 NOT claimed');
  });
});

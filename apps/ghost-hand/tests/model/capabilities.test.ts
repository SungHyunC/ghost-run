import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '@ghost-run/core';
import {
  LOWERED_CLAIM_FRAGMENT,
  capabilityTexts,
  isolationClaimsFor,
  mayClaimJointSelfWard,
  messageContextFor,
  probeCapabilities,
  type Capabilities,
} from '../../src/capabilities';
import type { ClaimEvidence } from '../../src/evidence';
import { JOINT_LIMIT_INACTIVE_TEXT, PROVISIONAL_WORDING_TEXT } from '../../src/texts';
import expected from '../capabilities.expected.json';

const CHANGED = 'capability changed: update the expected file and the dependent texts';
const observed: Capabilities = probeCapabilities();

function installedVersion(pkg: string): string {
  try {
    const url = new URL(`../../node_modules/${pkg}/package.json`, import.meta.url);
    return (JSON.parse(readFileSync(url, 'utf8')) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unreadable';
  }
}

const coreNs = core as unknown as Record<string, (...a: never[]) => unknown>;
const PASS = { verdict: 'pass', violations: [], notices: [] };

describe('capability probes: observed values', () => {
  it('writes the observed values and installed versions to the test output', () => {
    const versions = Object.fromEntries(
      ['@ghost-run/core', '@ghost-run/ui', '@ghost-run/wards-config', 'react', 'react-dom'].map((p) => [
        p,
        installedVersion(p),
      ]),
    );
    console.log(`capabilities observed: ${JSON.stringify(observed)}`);
    console.log(`installed versions: ${JSON.stringify(versions)}`);
    expect(Object.keys(observed).sort()).toEqual(['bannerNotApplicable', 'claimsOptional', 'jointSelfWard']);
  });

  it('never throws and returns booleans', () => {
    const caps = probeCapabilities();
    for (const v of Object.values(caps)) expect(typeof v).toBe('boolean');
  });

  for (const flag of ['jointSelfWard', 'claimsOptional', 'bannerNotApplicable'] as const) {
    it(`${flag} matches tests/capabilities.expected.json`, () => {
      expect(observed[flag], CHANGED).toBe(expected[flag]);
    });
  }
});

describe('PR-1 landed behavior (skipped (PR-1 not landed) when the probe is false)', () => {
  it.skipIf(!observed.jointSelfWard)('the real engine blocks on either fact', () => {
    const engine = core.WardEngine;
    const wardSet = {
      wards: [
        { id: 'p', kind: 'physics', min_success_rate: 0, max_contact_force_n: 1e9, forbidden_contacts: [] },
      ],
    } as unknown as Parameters<typeof engine.evaluate>[1];
    for (const f of ['jointLimitExceeded', 'selfCollisionOccurred']) {
      const report = {
        snapshots: [],
        changes: [],
        effectsOutside: [],
        observedEvents: [],
        variantResults: [{ variantId: 'v', success: true, [f]: true }],
      } as unknown as Parameters<typeof engine.evaluate>[0];
      expect(engine.evaluate(report, wardSet).verdict).toBe('block');
    }
  });
});

describe('PR-2 landed behavior (skipped (PR-2 not landed) when the probe is false)', () => {
  it.skipIf(!observed.claimsOptional)('no lowered-claim line without claims', () => {
    const render = coreNs['renderMessage'] as unknown as (v: unknown, c: unknown) => string;
    expect(render(PASS, { wardCount: 1 })).not.toContain(LOWERED_CLAIM_FRAGMENT);
  });
});

describe('PR-3 landed behavior (skipped (PR-3 not landed) when the probe is false)', () => {
  it.skipIf(!observed.bannerNotApplicable)('isolationClaimsFor carries the field', () => {
    expect(isolationClaimsFor(true, observed).notApplicable).toEqual(['P5', 'P6']);
  });
});

describe('dependency on @ghost-run/wards-config', () => {
  // This task does not import wards-config. The state of the installed public entry is recorded in the
  // expected file; a change fails the test so the dependent tasks are revisited.
  it('records whether the wards-config public entry exports parseWards', async () => {
    const mod = (await import('@ghost-run/wards-config')) as Record<string, unknown>;
    const exportsParse = typeof mod['parseWards'] === 'function';
    console.log(`wards-config exports parseWards: ${exportsParse}`);
    expect(
      exportsParse,
      exportsParse
        ? 'dependency changed: @ghost-run/wards-config now exports parseWards; update the expected file'
        : 'dependency missing: @ghost-run/wards-config public entry exports no parseWards (not yet implemented)',
    ).toBe(expected.wardsConfigExportsParseWards);
  });
});

describe('fallback selection by capability override (both paths)', () => {
  const bools = [false, true];
  const combos: Capabilities[] = bools.flatMap((jointSelfWard) =>
    bools.flatMap((claimsOptional) =>
      bools.map((bannerNotApplicable) => ({ jointSelfWard, claimsOptional, bannerNotApplicable })),
    ),
  );

  it.each(combos)('texts, message context, and claims for %o', (caps) => {
    const texts = capabilityTexts(caps);
    expect(texts.jointLimitInactive).toBe(caps.jointSelfWard ? null : JOINT_LIMIT_INACTIVE_TEXT);
    expect(texts.provisionalWording).toBe(caps.claimsOptional ? null : PROVISIONAL_WORDING_TEXT);
    expect(mayClaimJointSelfWard(caps)).toBe(caps.jointSelfWard);

    const ctx = messageContextFor(caps, 2);
    expect('claims' in ctx).toBe(!caps.claimsOptional);
    if (!caps.claimsOptional) expect(ctx.claims).toEqual({ p5: false, p6: false });

    for (const p1 of bools) {
      const claims = isolationClaimsFor(p1, caps);
      expect(claims).toMatchObject({ mode: 'playground', p1Claimed: p1, p5Claimed: false, p6Claimed: false });
      expect('notApplicable' in claims).toBe(caps.bannerNotApplicable);
      expect('reason' in claims).toBe(false);
    }

    // Both paths run against the installed renderMessage: the fallback context never throws.
    const render = coreNs['renderMessage'] as unknown as (v: unknown, c: unknown) => string;
    if (caps.claimsOptional === observed.claimsOptional) expect(typeof render(PASS, ctx)).toBe('string');

    const evidence: ClaimEvidence = { selfCheck: { state: 'pending' }, capabilities: caps };
    expect(evidence.capabilities).toBe(caps);
  });
});

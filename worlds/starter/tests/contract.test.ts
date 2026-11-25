// Contract test of world starter: the registration gate (verifyWorld). P1 and P3 and the ward checks (P4).
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { verifyWorld } from '@ghost-run/core/verify';
import { parseWards } from '@ghost-run/wards-config';
import config from '../world.config.js';
import type { Action } from '../src/world.js';

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }).filter((t) => t.trim() !== '').map((text): Action => ({ kind: 'add', text })),
  fc.integer({ min: 1, max: 6 }).map((id): Action => ({ kind: 'remove', id })),
  fc.constant<Action>({ kind: 'clear' }),
);

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

describe('world starter', () => {
  it('has a valid registration', () => {
    expect(config.id).toBe('starter');
    expect(typeof config.deterministic).toBe('boolean');
    expect(config.wardsFile).toBe('./wards.yaml');
    expect(typeof config.create).toBe('function');
  });

  it('passes the registration gate (verifyWorld)', async () => {
    await verifyWorld(config.create(), {
      id: config.id,
      deterministic: config.deterministic,
      wardSet: loadWards(),
      actionArb,
      numRuns: 100,
    });
  }, 60_000);

  it('step never throws and reports an invalid action', async () => {
    const world = config.create();
    const s = await world.snapshot();
    const bad = await world.step(s, { kind: 'remove', id: 99 });
    expect(bad.result.success).toBe(false);
    expect(s.state.todos).toHaveLength(3);
  });
});

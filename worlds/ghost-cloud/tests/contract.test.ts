// Contract test of world ghost-cloud: the registration gate (verifyWorld).
// P1 and P3 always; P2 against the independent Reference_Model; ward checks (P4) per ward.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyWorld } from '@ghost-run/core/verify';
import { parseWards } from '@ghost-run/wards-config';
import config from '../world.config.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { createReferenceAdapter } from './support/reference-model.js';

function assertWorldConfigShape(c: Record<string, unknown>): void {
  if (typeof c['id'] !== 'string' || c['id'] === '') throw new Error('world.config: id must be a non-empty string');
  if (typeof c['deterministic'] !== 'boolean') throw new Error('world.config: deterministic must be a boolean');
  if (typeof c['wardsFile'] !== 'string') throw new Error('world.config: wardsFile must be a path string');
  if (typeof c['create'] !== 'function') throw new Error('world.config: create must be a function');
}

describe('world ghost-cloud', () => {
  it('has a valid registration', () => {
    assertWorldConfigShape(config);
    expect(config.id).toBe('ghost-cloud');
    expect(config.wardsFile).toBe('./wards.yaml');
  });

  it('parses wards.yaml without an error', () => {
    const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
    expect(parsed.ok).toBe(true);
  });

  it('passes the registration gate (verifyWorld)', async () => {
    const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
    if (!parsed.ok) throw new Error('wards.yaml does not parse');
    const world = config.create();
    await verifyWorld(world, {
      id: config.id,
      deterministic: config.deterministic,
      wardSet: parsed.wardSet,
      testAdapter: createReferenceAdapter(),
      actionArb,
      numRuns: NUM_RUNS,
    });
  }, PBT_TIMEOUT);
});

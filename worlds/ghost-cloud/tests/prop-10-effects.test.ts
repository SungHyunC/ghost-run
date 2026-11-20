// Feature: ghost-cloud, Property 10: Effects
// **Validates: Requirements 2.7**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGhostCloudWorld } from '../src/world.js';
import type { Action } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';

const HOST = /^https?:\/\/([A-Za-z0-9.-]+)(:[0-9]+)?(\/.*)?$/;

const weirdEndpoint = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 300 }),
  fc.constantFrom('', 'not a url', 'ftp://s3.example', 'http://', 'http://[::1]/x', 'https://s3.example:99999999/path'),
  fc.constantFrom('http://s3.example', 'https://store.test:4566/x', 'http://a.localhost/'),
);

const endpointAction: fc.Arbitrary<Action> = fc
  .tuple(actionArb, weirdEndpoint)
  .map(([a, endpointUrl]): Action => (a.kind === 'unsupported' ? a : { ...a, endpointUrl }));

const unsupportedAction: fc.Arbitrary<Action> = fc
  .tuple(fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }))
  .map(([line, reason]): Action => ({ kind: 'unsupported', line, reason }));

describe('Property 10: effects', () => {
  const world = createGhostCloudWorld();

  it('one network effect with the host exactly when endpointUrl is present', () => {
    fc.assert(
      fc.property(fc.oneof(actionArb, endpointAction, unsupportedAction), (a) => {
        const copy = structuredClone(a);
        const effects = world.effectsOutside(a);
        expect(a).toStrictEqual(copy);
        const raw = a.kind === 'unsupported' ? undefined : a.endpointUrl;
        if (raw === undefined) {
          expect(effects).toStrictEqual([]);
          return true;
        }
        expect(effects).toHaveLength(1);
        const e = effects[0]!;
        expect(e.kind).toBe('network');
        expect(typeof e.destination).toBe('string');
        const m = HOST.exec(raw);
        if (m !== null) expect(e).toStrictEqual({ kind: 'network', destination: m[1] });
        else expect(e.destination.length).toBeLessThanOrEqual(200);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('examples: reserved hosts', () => {
    expect(world.effectsOutside({ kind: 'ls', endpointUrl: 'http://s3.example:4566' })).toStrictEqual([
      { kind: 'network', destination: 's3.example' },
    ]);
    expect(world.effectsOutside({ kind: 'ls' })).toStrictEqual([]);
  });
});

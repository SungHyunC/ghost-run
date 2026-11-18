import { describe, expectTypeOf, it } from 'vitest';
import { collectNeedles } from '../src/index.js';
import type { GhostReport, Needle, ProvenanceKind, ProvenanceRecord } from '../src/index.js';

type S = { n: number };

describe('possession public types', () => {
  it('collectNeedles accepts a GhostReport<S> (Requirement 9.1)', () => {
    expectTypeOf(collectNeedles).parameter(0).toBeObject();
    expectTypeOf<GhostReport<S>>().toMatchTypeOf<Parameters<typeof collectNeedles>[0]>();
    expectTypeOf(collectNeedles).returns.toEqualTypeOf<Needle[]>();
  });

  it('ProvenanceRecord has exactly source, kind, content (Requirement 8.9)', () => {
    expectTypeOf<keyof ProvenanceRecord>().toEqualTypeOf<'source' | 'kind' | 'content'>();
    expectTypeOf<ProvenanceRecord['source']>().toEqualTypeOf<string>();
    expectTypeOf<ProvenanceRecord['kind']>().toEqualTypeOf<ProvenanceKind>();
    expectTypeOf<ProvenanceRecord['content']>().toEqualTypeOf<string>();
  });

  it('ProvenanceRecord has no clock, session, or secret field', () => {
    type Keys = keyof ProvenanceRecord;
    expectTypeOf<Extract<Keys, 'time' | 'timestamp' | 'clock' | 'session' | 'sessionId' | 'secret'>>().toBeNever();
  });
});

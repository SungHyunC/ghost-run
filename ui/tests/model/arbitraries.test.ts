// Sanity checks for the generators in tests/fixtures/arbitraries.ts.
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import * as A from '../fixtures/arbitraries';
import { PBT_SEED } from '../support/pbt-config';
import { createCounter } from '../support/pbt-stats';
import { isReservedHost } from '../fixtures/hosts';

const SAMPLES = 300;

const all: Record<string, fc.Arbitrary<unknown>> = {
  hiddenCodePoint: A.hiddenCodePoint,
  dirtyString: A.dirtyString(),
  markupString: A.markupString,
  canary: A.canary,
  secretLikeKey: A.secretLikeKey,
  plainKey: A.plainKey,
  genericValue: A.genericValue(),
  unknownChange: A.unknownChange,
  sceneValue: A.sceneValue(),
  circularValue: A.circularValue,
  deepValue: A.deepValue(),
  claimsAny: A.claimsAny,
  bigScan: A.bigScan,
  isoUtc: A.isoUtc,
  badTime: A.badTime,
  change: A.change,
  changes: A.changes,
  wardVerdict: A.wardVerdict,
  claims: A.claims,
  needle: A.needle,
  threadLink: A.threadLink,
  finding: A.finding,
  scanResult: A.scanResult,
  blacklightSource: A.blacklightSource,
  graveEntry: A.graveEntry,
  graveDetail: A.graveDetail,
  breakOne: A.breakOne(A.graveEntry),
};

describe('ui test arbitraries', () => {
  for (const [name, arb] of Object.entries(all)) {
    it(`${name} samples without throwing`, () => {
      expect(() => fc.sample(arb, { numRuns: 25, seed: PBT_SEED })).not.toThrow();
    });
  }

  it('claimsAny buckets each have probability of at least 1 in 10', () => {
    const counter = createCounter('claimsAny');
    for (const v of fc.sample(A.claimsAny, { numRuns: 2000, seed: PBT_SEED })) {
      counter.add(A.claimsBucket(v));
    }
    counter.print();
    for (const b of ['both', 'onlyA', 'onlyB'] as const) {
      expect((counter.counts[b] ?? 0) / 2000).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('claimsAny modes docker-box, playground, and static-analysis each have a share of at least 20 %', () => {
    const counter = createCounter('claimsAny modes');
    const N = 2000;
    for (const v of fc.sample(A.claimsAny, { numRuns: N, seed: PBT_SEED })) {
      const mode = typeof v === 'object' && v !== null ? (v as Record<string, unknown>)['mode'] : undefined;
      if (mode === 'docker-box' || mode === 'playground' || mode === 'static-analysis') counter.add(mode);
    }
    counter.print();
    for (const m of ['docker-box', 'playground', 'static-analysis']) {
      expect((counter.counts[m] ?? 0) / N).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('secretLikeKey and plainKey agree with the independent oracle', () => {
    for (const k of fc.sample(A.secretLikeKey, { numRuns: SAMPLES, seed: PBT_SEED })) {
      expect(A.secretLikeOracle(k)).toBe(true);
    }
    for (const k of fc.sample(A.plainKey, { numRuns: SAMPLES, seed: PBT_SEED })) {
      expect(A.secretLikeOracle(k)).toBe(false);
    }
  });

  it('wardVerdict includes notice kinds beyond the known ones', () => {
    const kinds = new Set<string>();
    for (const v of fc.sample(A.wardVerdict, { numRuns: SAMPLES, seed: PBT_SEED })) {
      for (const n of v.notices) kinds.add(n.kind);
    }
    expect(kinds.has('unsupported-step')).toBe(true);
    expect(kinds.has('path-escape')).toBe(true);
    expect(kinds.has('content-inspection')).toBe(true);
  });

  it('hand-built Findings satisfy the position round-trip and ASCII rendering', () => {
    const arb = A.lines(1, 6).chain((text) => A.findingFor(text).map((f) => ({ text, f })));
    for (const { text, f } of fc.sample(arb, { numRuns: SAMPLES, seed: PBT_SEED })) {
      const cps = Array.from(text, (c) => c.codePointAt(0) as number);
      expect(A.positionOf(cps, f.offset)).toEqual({ line: f.line, column: f.column });
      expect(f.length).toBe(f.codePoints.length);
      expect(/^[ -~]*$/.test(f.rendering)).toBe(true);
      expect(f.firstCodePoint).toMatch(/^U\+[0-9A-F]{4,}$/);
    }
  });

  it('long texts and big finding lists have the stated sizes', () => {
    for (const t of fc.sample(A.longText, { numRuns: 5, seed: PBT_SEED })) {
      const n = t.split('\n').length;
      expect(n).toBeGreaterThanOrEqual(201);
      expect(n).toBeLessThanOrEqual(400);
    }
    const many = A.findingsFor('abc\ndef', true);
    for (const l of fc.sample(many, { numRuns: 5, seed: PBT_SEED })) {
      expect(l.length).toBeGreaterThanOrEqual(101);
      expect(l.length).toBeLessThanOrEqual(250);
    }
  });

  it('hosts and canaries are reserved or fake', () => {
    for (const n of fc.sample(A.needle, { numRuns: SAMPLES, seed: PBT_SEED })) {
      if (n.value.includes('.') && !n.value.startsWith('/')) expect(isReservedHost(n.value)).toBe(true);
    }
    for (const c of fc.sample(A.canary, { numRuns: 50, seed: PBT_SEED })) {
      expect(c.startsWith('sk-CANARY-')).toBe(true);
    }
  });
});

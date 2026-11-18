// Feature: ui-kit, Property 11: Red thread pairing (model leg, V)
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.12**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Needle, ThreadLink } from '@ghost-run/core';
import { buildRedThreadModel } from '../../src/model/thread';
import type { RedThreadModel } from '../../src/model/thread';
import { compact, detail } from '../../src/model/escape';
import { THREAD_NOT_FOUND } from '../../src/model/texts';
import { dirtyString, needle, threadLink } from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

/** A needle whose value may carry hidden code points. */
const dirtyNeedle: fc.Arbitrary<Needle> = fc
  .tuple(needle, fc.boolean())
  .chain(([n, dirty]) =>
    dirty ? dirtyString(fc.constant(n.value)).map((value) => ({ ...n, value })) : fc.constant(n),
  );

interface Case {
  readonly needles: Needle[];
  readonly links: ThreadLink[];
  readonly actionLabels: (string | undefined)[] | undefined;
}

const labelArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.stringMatching(/^[ -~]{0,30}$/),
  { nil: undefined },
);

const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.array(dirtyNeedle, { maxLength: 12 }),
    fc.array(threadLink, { maxLength: 12 }),
    fc.boolean(),
    fc.option(fc.array(labelArb, { minLength: 0, maxLength: 21 }), { nil: undefined }),
  )
  .chain(([needles, links, equalize, actionLabels]) => {
    if (!equalize) return fc.constant({ needles, links, actionLabels });
    // Force equal lengths by trimming the longer list.
    const k = Math.min(needles.length, links.length);
    return fc.constant({ needles: needles.slice(0, k), links: links.slice(0, k), actionLabels });
  });

// Raw hidden code points must never survive into the displayed strings.
const HIDDEN_RAW = new RegExp(
  '[\\u{E0000}-\\u{E007F}\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]',
  'u',
);

function check(c: Case, counter: ReturnType<typeof createCounter>): void {
  const m = buildRedThreadModel({
    needles: c.needles,
    links: c.links,
    ...(c.actionLabels === undefined ? {} : { actionLabels: c.actionLabels }),
  }) as RedThreadModel;
  expect(m.kind).toBe('ok');
  const a = c.needles.length;
  const b = c.links.length;
  const pairs = Math.min(a, b);

  // One thread per pair, in needle order; mismatch text for unequal lengths.
  expect(m.threads).toHaveLength(pairs);
  expect(m.totalThreads).toBe(pairs);
  expect(m.shownThreads).toBe(pairs);
  expect(m.mismatch).toBe(a === b ? null : `Red thread data mismatch: ${a} needles, ${b} links.`);
  counter.add(a === b ? 'equal' : 'unequal');
  if (pairs === 0) counter.add('empty');

  for (let i = 0; i < pairs; i += 1) {
    const n = c.needles[i] as Needle;
    const link = c.links[i] as ThreadLink;
    const t = m.threads[i];
    if (t === undefined) throw new Error('missing thread');
    const value = compact(n.value);
    expect(t.unreadable).toBe(false);
    expect(t.index).toBe(i);
    expect(t.action).not.toBeNull();
    expect(t.action?.stepText).toBe(`step ${n.stepIndex}`);
    expect(t.action?.origin).toBe(n.origin);
    expect(t.action?.value).toBe(value);
    expect(HIDDEN_RAW.test(t.action?.value ?? '')).toBe(false);
    if (HIDDEN_RAW.test(n.value)) counter.add('hiddenValue');
    counter.add(`origin:${n.origin}`);

    const label = c.actionLabels?.[n.stepIndex];
    if (typeof label === 'string') {
      expect(t.action?.actionLabel).toBe(compact(label));
      counter.add('label');
    } else {
      expect(t.action?.actionLabel).toBeUndefined();
    }

    if (link.status === 'found') {
      counter.add('found');
      counter.add(link.matchedKey === 'host' ? 'host' : 'valueKey');
      counter.add(link.hidden ? 'hidden' : 'visible');
      const cause = t.cause;
      expect(cause).not.toBeNull();
      expect(cause?.source).toBe(compact(link.source));
      expect(cause?.kind).toBe(link.kind);
      expect(cause?.position).toBe(`${link.line}:${link.column}`);
      expect(cause?.lineText).toBe(detail(link.lineText));
      expect(cause?.matchedHost).toBe(link.matchedKey === 'host');
      expect(cause?.hidden).toBe(link.hidden);
      expect(t.notFoundText).toBeNull();
      expect(t.accessibleName).toBe(
        `Red thread: ${value} at step ${n.stepIndex} to ${compact(link.source)} line ${link.line} column ${link.column}`,
      );
    } else {
      counter.add('not-found');
      expect(t.cause).toBeNull();
      expect(t.notFoundText).toBe(THREAD_NOT_FOUND);
      expect(t.accessibleName).toBe(`Red thread: ${value} at step ${n.stepIndex}, no cause found`);
    }
  }
}

describe('UI-P11 red thread pairing (model leg)', () => {
  it('UI-P11: pairs needles and links by index with exact cause data', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P11 thread');
    fc.assert(
      fc.property(caseArb, (c) => {
        check(c, counter);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'equal',
      'unequal',
      'empty',
      'found',
      'not-found',
      'host',
      'valueKey',
      'hidden',
      'visible',
      'label',
      'hiddenValue',
      'origin:effect',
      'origin:observed-destination',
      'origin:observed-path',
    ]);
  }, PBT_TIMEOUT);
});

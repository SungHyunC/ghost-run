// Feature: ui-kit, Property 11: Red thread pairing (static leg, S leg)
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.12**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Needle, ThreadLink } from '@ghost-run/core';
import { RedThreadViewMarkup } from '../../src/components/RedThreadView';
import { compact, detail } from '../../src/model/escape';
import { HIDDEN_TEXT, MATCHED_HOST_KEY, THREAD_NOT_FOUND, TURN_ON_BLACKLIGHT } from '../../src/model/texts';
import { dirtyString, needle, threadLink } from '../fixtures/arbitraries';
import { escapeHtml, renderMarkup } from '../support/markup';
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

const labelArb: fc.Arbitrary<string | undefined> = fc.option(fc.stringMatching(/^[ -~]{0,30}$/), {
  nil: undefined,
});

const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.array(dirtyNeedle, { maxLength: 12 }),
    fc.array(threadLink, { maxLength: 12 }),
    fc.boolean(),
    fc.option(fc.array(labelArb, { minLength: 0, maxLength: 21 }), { nil: undefined }),
  )
  .map(([needles, links, equalize, actionLabels]) => {
    if (!equalize) return { needles, links, actionLabels };
    const k = Math.min(needles.length, links.length);
    return { needles: needles.slice(0, k), links: links.slice(0, k), actionLabels };
  });

const esc = (s: string): string => escapeHtml(s);
const count = (html: string, part: string): number => html.split(part).length - 1;

/** Thread chunks of the markup, in document order. */
function threadChunks(html: string): { name: string; index: string; body: string }[] {
  // The group sits inside the list item: an li may not carry role="group" (axe aria-allowed-role, task 8.21).
  const re = /<li class="gk-thread" data-thread-index="(\d+)"><div role="group" aria-label="([^"]*)" class="gk-thread-body">(.*?)<\/div><\/li>/gs;
  return [...html.matchAll(re)].map((m) => ({ name: m[2] ?? '', index: m[1] ?? '', body: m[3] ?? '' }));
}

function check(c: Case, counter: ReturnType<typeof createCounter>): void {
  const html = renderMarkup(
    <RedThreadViewMarkup
      needles={c.needles}
      links={c.links}
      {...(c.actionLabels === undefined ? {} : { actionLabels: c.actionLabels as string[] })}
    />,
  );
  const a = c.needles.length;
  const b = c.links.length;
  const pairs = Math.min(a, b);
  const chunks = threadChunks(html);

  // One thread per pair, in needle order.
  expect(chunks).toHaveLength(pairs);
  expect(count(html, 'data-thread-index=')).toBe(pairs);
  expect(chunks.map((t) => t.index)).toEqual(Array.from({ length: pairs }, (_, i) => String(i)));

  // Mismatch and empty texts.
  const mismatch = `Red thread data mismatch: ${a} needles, ${b} links.`;
  if (a === b) {
    expect(html).not.toContain('Red thread data mismatch');
    counter.add('equal');
  } else {
    expect(count(html, mismatch)).toBe(1);
    counter.add('unequal');
  }
  if (pairs === 0) {
    counter.add('empty');
    if (a === 0 && b === 0) expect(html).toContain('No addresses or paths to trace.');
  } else {
    expect(html).not.toContain('No addresses or paths to trace.');
  }
  expect(count(html, 'The red thread finds literal occurrences only.')).toBe(1);

  let connectors = 0;
  for (let i = 0; i < pairs; i += 1) {
    const n = c.needles[i] as Needle;
    const link = c.links[i] as ThreadLink;
    const t = chunks[i];
    if (t === undefined) throw new Error('missing thread');
    const value = compact(n.value);
    counter.add(`origin:${n.origin}`);

    // Action end.
    expect(t.body).toContain(`<div class="gk-mono">step ${n.stepIndex}</div>`);
    expect(t.body).toContain(`<div>${esc(n.origin)}</div>`);
    expect(t.body).toContain(`<div class="gk-mono">${esc(value)}</div>`);
    const label = c.actionLabels?.[n.stepIndex];
    const action = /data-end="action">(.*?)<\/div><\/div>/s.exec(t.body)?.[1] ?? '';
    if (typeof label === 'string') {
      counter.add('label');
      expect(action).toContain(`<div>${esc(compact(label))}</div>`);
    } else {
      expect(action.split('<div>').length - 1).toBe(1); // origin only
    }

    const lines = count(t.body, 'gk-thread-line');
    connectors += lines;
    if (link.status === 'found') {
      counter.add('found');
      counter.add(link.matchedKey === 'host' ? 'host' : 'valueKey');
      counter.add(link.hidden ? 'hidden' : 'visible');
      const source = compact(link.source);
      expect(t.name).toBe(
        esc(`Red thread: ${value} at step ${n.stepIndex} to ${source} line ${link.line} column ${link.column}`),
      );
      expect(lines).toBe(1);
      expect(t.body).toContain('data-end="cause"');
      expect(t.body).not.toContain('data-end="none"');
      expect(t.body).toContain(`<div>${esc(`${source} (${link.kind})`)}</div>`);
      expect(t.body).toContain(`<div class="gk-mono">${link.line}:${link.column}</div>`);
      expect(t.body).toContain(`<div class="gk-mono">${esc(detail(link.lineText))}</div>`);
      expect(count(t.body, MATCHED_HOST_KEY)).toBe(link.matchedKey === 'host' ? 1 : 0);
      const warning = `${HIDDEN_TEXT}. ${TURN_ON_BLACKLIGHT}`;
      expect(count(t.body, warning)).toBe(link.hidden ? 1 : 0);
      expect(count(t.body, TURN_ON_BLACKLIGHT)).toBe(link.hidden ? 1 : 0);
      expect(t.body).not.toContain(THREAD_NOT_FOUND);
    } else {
      counter.add('not-found');
      expect(t.name).toBe(esc(`Red thread: ${value} at step ${n.stepIndex}, no cause found`));
      expect(lines).toBe(0);
      expect(t.body).toContain(`<div class="gk-thread-end" data-end="none">${esc(THREAD_NOT_FOUND)}</div>`);
      expect(t.body).not.toContain('data-end="cause"');
      expect(t.body).not.toContain(MATCHED_HOST_KEY);
      expect(t.body).not.toContain(HIDDEN_TEXT);
    }
  }
  // The connector exists only inside found threads.
  expect(count(html, 'class="gk-thread-line"')).toBe(connectors);
}

describe('UI-P11 red thread pairing (static leg)', () => {
  it('UI-P11: markup has one thread per pair, exact coordinates, connector only for found, texts and names', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P11 static');
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
      'origin:effect',
      'origin:observed-destination',
      'origin:observed-path',
    ]);
  }, PBT_TIMEOUT ?? 0);
});

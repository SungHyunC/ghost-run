// Feature: ui-kit, Property 10: Blacklight coverage and involution
// **Validates: Requirements 8.2, 8.13**
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Finding, ScanResult } from '@ghost-run/core';
import { BlacklightView } from '../../src/components/BlacklightView';
import { findingsFor, lines, longText, scanOracle } from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';

const cp = (n: number): string => String.fromCodePoint(n);

const hiddenCp: fc.Arbitrary<string> = fc
  .oneof(
    fc.integer({ min: 0xe0000, max: 0xe007f }),
    fc.constantFrom(0x200b, 0x200c, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
    fc.integer({ min: 0x2066, max: 0x2069 }),
  )
  .map(cp);

function insertAll(base: string, inserts: readonly (readonly [number, string])[]): string {
  const cps = Array.from(base);
  for (const [at, h] of inserts) cps.splice(at % (cps.length + 1), 0, h);
  return cps.join('');
}

const dirtyText: fc.Arbitrary<string> = fc
  .tuple(lines(1, 6), fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 10 }))
  .map(([base, inserts]) => insertAll(base, inserts));

const manyHiddenText: fc.Arbitrary<string> = fc
  .array(hiddenCp, { minLength: 101, maxLength: 150 })
  .map((hs) => hs.join('x'));

const longDirtyText: fc.Arbitrary<string> = fc
  .tuple(longText, fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 4 }))
  .map(([base, inserts]) => insertAll(base, inserts));

type Gesture = 'pointer' | 'enter' | 'space';

interface Case {
  readonly text: string;
  readonly scan: ScanResult;
  readonly activateReveal: boolean;
  readonly gestures: readonly Gesture[];
}

const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.oneof(
      { weight: 4, arbitrary: dirtyText },
      { weight: 1, arbitrary: manyHiddenText },
      { weight: 1, arbitrary: longDirtyText },
    ),
    fc.boolean(),
    fc.boolean(),
    fc.array(fc.constantFrom<Gesture>('pointer', 'enter', 'space'), { minLength: 1, maxLength: 3 }),
  )
  .chain(([text, oracle, activateReveal, gestures]) => {
    const scan: fc.Arbitrary<ScanResult> = oracle
      ? fc.constant(scanOracle(text))
      : findingsFor(text, Array.from(text).length > 100 && text.includes('x')).map((findings: Finding[]) => ({ findings }));
    return scan.map((s) => ({ text, scan: s, activateReveal, gestures }));
  });

async function press(user: ReturnType<typeof userEvent.setup>, sw: HTMLElement, gesture: Gesture): Promise<void> {
  if (gesture === 'pointer') {
    await user.click(sw);
    return;
  }
  sw.focus();
  await user.keyboard(gesture === 'enter' ? '{Enter}' : ' ');
}

async function run(c: Case): Promise<void> {
  const user = userEvent.setup();
  const { container, unmount } = render(
    <BlacklightView sources={[{ source: 'notes.example.txt', text: c.text, scan: c.scan }]} />,
  );
  try {
    if (c.activateReveal) {
      for (const button of screen.queryAllByRole('button', { name: /^Show all \d+ (lines|findings)$/ })) {
        await user.click(button);
      }
    }
    const sw = screen.getByRole('switch', { name: 'Blacklight' });
    const firstOff = container.innerHTML;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    // Off: the Findings list shows category, position, and count only, with the fixed text.
    const hint = 'Turn on the blacklight to read it.';
    const listOf = (): string => container.querySelector('ul.gk-findings')?.textContent ?? '';
    const hasFindings = c.scan.findings.length > 0;
    expect(container.textContent?.includes(hint) ?? false).toBe(hasFindings);
    expect(listOf()).not.toContain('<U+');
    for (const gesture of c.gestures) {
      await press(user, sw, gesture);
      expect(sw.getAttribute('aria-checked')).toBe('true');
      expect(sw.textContent).toBe('Blacklight: on');
      // On: the fixed text is gone and the list entries carry the Hex_Notation.
      expect(container.textContent?.includes(hint) ?? false).toBe(false);
      if (container.querySelector('ul.gk-findings li[data-finding-index]') !== null) expect(listOf()).toContain('<U+');
      await press(user, sw, gesture);
      expect(sw.getAttribute('aria-checked')).toBe('false');
      expect(sw.textContent).toBe('Blacklight: off');
      expect(container.innerHTML).toBe(firstOff);
    }
  } finally {
    unmount();
  }
}

describe('UI-P10 blacklight toggle involution (DOM leg)', () => {
  it('UI-P10: off, on, off restores the first off markup for pointer, Enter and Space, with and without a reveal', async () => {
    console.log(`PBT seed=${PBT_SEED}`);
    await fc.assert(
      fc.asyncProperty(caseArb, async (c) => {
        await run(c);
      }),
      params('dom'),
    );
  }, PBT_TIMEOUT);
});

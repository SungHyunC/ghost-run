// Task 8.15: keyboard operation, tab order, focus return, and reveal controls (jsdom, role-based queries).
// Requirements 10.5, 10.9, 12.1, 14.5.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { scanText } from '@ghost-run/core';
import { describe, expect, it, vi } from 'vitest';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Graveyard } from '../../src/components/Graveyard';
import { KitRoot } from '../../src/components/KitRoot';
import { MirrorWorld } from '../../src/components/MirrorWorld';
import { RedThreadView } from '../../src/components/RedThreadView';
import { SeanceView } from '../../src/components/SeanceView';
import { BL_FINDINGS, BL_LINES, MIRROR_ROWS, THREADS, TOMBSTONES } from '../../src/model/limits';
import { buildSceneTree } from '../../src/model/scene';
import type { GraveEntry } from '../../src/types';

const ZWSP = String.fromCodePoint(0x200b);

const KEYS = [
  { name: 'Enter', keys: '{Enter}' },
  { name: 'Space', keys: ' ' },
] as const;

function entriesOf(n: number): GraveEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    command: `rm -rf dir${i}`,
    recordedAt: `2026-01-02T03:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    wardIds: ['protect-data'],
  }));
}

const sourceText = (lines: number, hiddenLines: number): string =>
  Array.from({ length: lines }, (_, i) => (i < hiddenLines ? `line ${i + 1} a${ZWSP}b` : `line ${i + 1}`)).join('\n');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1',
  );
}

function activeName(): string {
  return document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '';
}

describe('keyboard: tab order and switches', () => {
  const sources = [{ source: 'README.test.txt', text: `ab${ZWSP}cd`, scan: scanText(`ab${ZWSP}cd`) }];
  const changes = [[{ kind: 'file-created', path: 'a.txt' }]] as never;

  function Page() {
    return (
      <KitRoot>
        <BlacklightView sources={sources} />
        <MirrorWorld changes={changes} realScene={{ a: 1 }} />
        <Graveyard entries={entriesOf(2)} onOpenSeance={() => undefined} />
      </KitRoot>
    );
  }

  it('Tab visits the interactive elements in DOM order, has no trap, and uses no tabIndex above 0', async () => {
    const user = userEvent.setup();
    const { container } = render(<Page />);
    const expected = focusables(container);
    expect(expected.map((e) => e.getAttribute('aria-label') ?? e.textContent)).toEqual([
      'Lights on',
      'Blacklight',
      'Full scene',
      'Open seance for blocked command rm -rf dir1, recorded 2026-01-02T03:00:01Z, ward protect-data',
      'Open seance for blocked command rm -rf dir0, recorded 2026-01-02T03:00:00Z, ward protect-data',
    ]);
    const visited: Element[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      await user.tab();
      visited.push(document.activeElement as Element);
    }
    expect(visited).toEqual(expected);
    // One more Tab leaves the page (body) or wraps to the first control: focus is not trapped.
    await user.tab();
    expect(document.activeElement).not.toBe(expected[expected.length - 1]);
    // Shift+Tab moves backwards through the same order.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(expected[expected.length - 1]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(expected[expected.length - 2]);
    for (const el of Array.from(container.querySelectorAll('[tabindex]'))) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it.each(KEYS)('$name operates the Lights_Toggle, the Blacklight_Switch, and the scene disclosure', async ({ keys }) => {
    const user = userEvent.setup();
    render(<Page />);

    const lights = screen.getByRole('switch', { name: 'Lights on' });
    lights.focus();
    expect(lights.getAttribute('aria-checked')).toBe('false');
    await user.keyboard(keys);
    expect(lights.getAttribute('aria-checked')).toBe('true');
    await user.keyboard(keys);
    expect(lights.getAttribute('aria-checked')).toBe('false');

    const bl = screen.getByRole('switch', { name: 'Blacklight' });
    bl.focus();
    await user.keyboard(keys);
    expect(bl.getAttribute('aria-checked')).toBe('true');
    await user.keyboard(keys);
    expect(bl.getAttribute('aria-checked')).toBe('false');

    const disclosure = screen.getByRole('button', { name: 'Full scene' });
    disclosure.focus();
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard(keys);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard(keys);
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('keyboard: tombstone, seance, and focus return', () => {
  const entries = entriesOf(3);

  function Stays({ onOpenSeance }: { onOpenSeance: (id: string) => void }) {
    const [open, setOpen] = useState<string | null>(null);
    const entry = entries.find((e) => e.id === open);
    return (
      <>
        <Graveyard
          entries={entries}
          onOpenSeance={(id) => {
            onOpenSeance(id);
            setOpen(id);
          }}
        />
        {entry === undefined ? null : <SeanceView entry={entry} onBack={() => setOpen(null)} />}
      </>
    );
  }

  function Swaps({ onOpenSeance }: { onOpenSeance: (id: string) => void }) {
    const [open, setOpen] = useState<string | null>(null);
    const entry = entries.find((e) => e.id === open);
    if (entry !== undefined) return <SeanceView entry={entry} onBack={() => setOpen(null)} />;
    return (
      <Graveyard
        entries={entries}
        onOpenSeance={(id) => {
          onOpenSeance(id);
          setOpen(id);
        }}
      />
    );
  }

  const tombstone = (n: number): HTMLElement => screen.getByRole('button', { name: new RegExp(`blocked command rm -rf dir${n},`) });

  it.each(KEYS)('$name on a tombstone calls onOpenSeance once with the id', async ({ keys }) => {
    const user = userEvent.setup();
    const onOpenSeance = vi.fn();
    render(<Graveyard entries={entries} onOpenSeance={onOpenSeance} />);
    tombstone(1).focus();
    await user.keyboard(keys);
    expect(onOpenSeance).toHaveBeenCalledTimes(1);
    expect(onOpenSeance).toHaveBeenCalledWith('id-1');
  });

  it.each(KEYS)('$name on Back to graveyard returns focus (graveyard stays mounted, %#)', async ({ keys }) => {
    const user = userEvent.setup();
    const onOpenSeance = vi.fn();
    render(<Stays onOpenSeance={onOpenSeance} />);
    const opener = tombstone(2);
    opener.focus();
    await user.keyboard(keys);
    expect(onOpenSeance).toHaveBeenCalledTimes(1);
    expect(onOpenSeance).toHaveBeenCalledWith('id-2');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Seance' }));

    await user.tab();
    const back = screen.getByRole('button', { name: 'Back to graveyard' });
    expect(document.activeElement).toBe(back);
    await user.keyboard(keys);
    expect(screen.queryByRole('button', { name: 'Back to graveyard' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it.each(KEYS)('$name on Back to graveyard returns focus (graveyard mounted again, %#)', async ({ keys }) => {
    const user = userEvent.setup();
    const onOpenSeance = vi.fn();
    render(<Swaps onOpenSeance={onOpenSeance} />);
    tombstone(0).focus();
    await user.keyboard(keys);
    expect(onOpenSeance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Open seance/ })).toBeNull();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to graveyard' }));
    await user.keyboard(keys);
    expect(screen.queryByRole('button', { name: 'Back to graveyard' })).toBeNull();
    expect(document.activeElement).toBe(tombstone(0));
  });

  it('the seance has no keyboard trap and no tabIndex above 0', async () => {
    const user = userEvent.setup();
    const { container } = render(<Stays onOpenSeance={() => undefined} />);
    tombstone(1).focus();
    await user.keyboard('{Enter}');
    const stops = focusables(container);
    // Tab from the seance heading reaches Back, then leaves the seance (does not stay on Back).
    await user.tab();
    expect(activeName()).toBe('Back to graveyard');
    await user.tab();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Back to graveyard' }));
    expect(stops.length).toBeGreaterThan(0);
    for (const el of Array.from(container.querySelectorAll('[tabindex]'))) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });
});

describe('keyboard: reveal controls for bounded lists', () => {
  it('Mirror rows: Showing 200 of 250, Enter reveals all, summary stays at the total', async () => {
    const user = userEvent.setup();
    const total = MIRROR_ROWS + 50;
    const changes = [Array.from({ length: total }, (_, i) => ({ kind: 'file-created', path: `f${i}.txt` }))] as never;
    render(<MirrorWorld changes={changes} />);
    expect(screen.getByText(`Showing ${MIRROR_ROWS} of ${total}`)).toBeTruthy();
    expect(screen.getByText(`${total} changes in 1 steps`)).toBeTruthy();
    const before = screen.getAllByRole('row').length;
    const reveal = screen.getByRole('button', { name: `Show all ${total} rows` });
    reveal.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(screen.getAllByRole('row').length).toBe(before + 50);
    expect(screen.getByText(`${total} changes in 1 steps`)).toBeTruthy();
  });

  it('Mirror rows: Space activates the reveal control', async () => {
    const user = userEvent.setup();
    const total = MIRROR_ROWS + 1;
    const changes = [Array.from({ length: total }, (_, i) => ({ kind: 'file-created', path: `f${i}.txt` }))] as never;
    render(<MirrorWorld changes={changes} />);
    expect(screen.getByText(`Showing ${MIRROR_ROWS} of ${total}`)).toBeTruthy();
    screen.getByRole('button', { name: `Show all ${total} rows` }).focus();
    await user.keyboard(' ');
    expect(screen.queryByText(/^Showing /)).toBeNull();
  });

  it('Scene entries: the disclosure and the reveal control work by keyboard and render every entry', async () => {
    const user = userEvent.setup();
    const scene = Object.fromEntries(Array.from({ length: 260 }, (_, i) => [`k${i}`, i]));
    const tree = buildSceneTree(scene);
    expect(tree).not.toBeNull();
    const total = tree?.total ?? 0;
    expect(total).toBeGreaterThan(200);
    render(<MirrorWorld changes={[[]] as never} realScene={scene} />);
    const disclosure = screen.getByRole('button', { name: 'Full scene' });
    disclosure.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(`Showing 200 of ${total}`)).toBeTruthy();
    const before = screen.getAllByRole('listitem').length;
    screen.getByRole('button', { name: `Show all ${total} scene entries` }).focus();
    await user.keyboard(' ');
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(screen.getAllByRole('listitem').length).toBe(before + (total - 200));
  });

  it('Blacklight lines and Findings: both reveal controls work by keyboard; summary counts stay at the total', async () => {
    const user = userEvent.setup();
    const lines = BL_LINES + 50;
    const findings = BL_FINDINGS + 50;
    const text = sourceText(lines, findings);
    const scan = scanText(text);
    expect(scan.findings.length).toBe(findings);
    render(<BlacklightView sources={[{ source: 'big.test.txt', text, scan }]} />);
    const group = screen.getByRole('group', { name: 'big.test.txt' });
    const summary = `big.test.txt: ${findings} findings`;
    expect(within(group).getByText(summary)).toBeTruthy();
    expect(within(group).getByText(`Showing ${BL_LINES} of ${lines}`)).toBeTruthy();
    expect(within(group).getByText(`Showing ${BL_FINDINGS} of ${findings}`)).toBeTruthy();

    const items = (): number => within(group).getAllByRole('listitem').length;
    const start = items();

    within(group).getByRole('button', { name: `Show all ${lines} lines` }).focus();
    await user.keyboard('{Enter}');
    expect(within(group).queryByText(`Showing ${BL_LINES} of ${lines}`)).toBeNull();
    expect(within(group).getByText(`Showing ${BL_FINDINGS} of ${findings}`)).toBeTruthy();
    expect(items()).toBe(start + 50);
    expect(within(group).getByText(summary)).toBeTruthy();

    within(group).getByRole('button', { name: `Show all ${findings} findings` }).focus();
    await user.keyboard(' ');
    expect(within(group).queryByText(/^Showing /)).toBeNull();
    expect(items()).toBe(start + 100);
    expect(within(group).getByText(summary)).toBeTruthy();
  });

  it('Threads: Showing 200 of 250, Enter reveals all threads', async () => {
    const user = userEvent.setup();
    const total = THREADS + 50;
    const needles = Array.from({ length: total }, (_, i) => ({ value: `host${i}.example`, origin: 'effect', stepIndex: 0 }));
    const links = needles.map((needle) => ({ status: 'not-found', needle }));
    render(<RedThreadView needles={needles as never} links={links as never} />);
    expect(screen.getByText(`Showing ${THREADS} of ${total}`)).toBeTruthy();
    expect(screen.getAllByRole('group', { name: /^Red thread:/ })).toHaveLength(THREADS);
    screen.getByRole('button', { name: `Show all ${total} threads` }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(screen.getAllByRole('group', { name: /^Red thread:/ })).toHaveLength(total);
  });

  it('Tombstones: Showing 200 of 250, Space reveals all, summary stays at the total', async () => {
    const user = userEvent.setup();
    const total = TOMBSTONES + 50;
    render(<Graveyard entries={entriesOf(total)} onOpenSeance={() => undefined} />);
    expect(screen.getByText(`Showing ${TOMBSTONES} of ${total}`)).toBeTruthy();
    expect(screen.getByText(`${total} blocked commands`)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Open seance for blocked command/ })).toHaveLength(TOMBSTONES);
    screen.getByRole('button', { name: `Show all ${total} tombstones` }).focus();
    await user.keyboard(' ');
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Open seance for blocked command/ })).toHaveLength(total);
    expect(screen.getByText(`${total} blocked commands`)).toBeTruthy();
  });
});

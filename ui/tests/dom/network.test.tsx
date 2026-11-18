// Requirements 4.6, 13.2, 13.4: no network, console, or storage use while the kit is mounted and operated.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { collectNeedles, scanText, traceRedThread } from '@ghost-run/core';
import type { Change, WardVerdict } from '@ghost-run/core';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { Graveyard } from '../../src/components/Graveyard';
import { KitRoot } from '../../src/components/KitRoot';
import { MirrorWorld } from '../../src/components/MirrorWorld';
import { RedThreadView } from '../../src/components/RedThreadView';
import { SeanceView } from '../../src/components/SeanceView';
import type { GraveEntry, IsolationClaims } from '../../src/types';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupEnd'] as const;

interface Saved {
  readonly target: object;
  readonly key: string;
  readonly descriptor: PropertyDescriptor | undefined;
}

let saved: Saved[] = [];
let throwing: Record<string, ReturnType<typeof vi.fn>> = {};
let accessSpies: Record<string, ReturnType<typeof vi.fn>> = {};
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
let storageSpies: ReturnType<typeof vi.spyOn>[] = [];

function override(target: object, key: string, descriptor: PropertyDescriptor): void {
  saved.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

function thrower(name: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() => {
    throw new Error(`${name} must not be called`);
  });
  throwing[name] = fn;
  return fn;
}

function accessSpy(name: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  accessSpies[name] = fn;
  return fn;
}

beforeEach(() => {
  saved = [];
  throwing = {};
  accessSpies = {};

  // Network: throwing stand-ins.
  override(globalThis, 'fetch', { writable: true, value: thrower('fetch') });
  override(globalThis, 'XMLHttpRequest', { writable: true, value: thrower('XMLHttpRequest') });
  override(globalThis, 'WebSocket', { writable: true, value: thrower('WebSocket') });
  override(navigator, 'sendBeacon', { writable: true, value: thrower('sendBeacon') });

  // Console: spies that record calls (and keep the output silent).
  consoleSpies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

  // Storage: spy on every Storage method, and on property access to the storage objects.
  storageSpies = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) =>
    vi.spyOn(Storage.prototype, m),
  );
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    const spy = accessSpy(name);
    override(window, name, {
      get: () => {
        spy();
        return undefined;
      },
    });
  }

  // document.cookie: property descriptor spies on the getter and the setter.
  const getCookie = accessSpy('cookie.get');
  const setCookie = accessSpy('cookie.set');
  override(document, 'cookie', {
    get: () => {
      getCookie();
      return '';
    },
    set: (v: string) => {
      setCookie(v);
    },
  });
});

afterEach(() => {
  for (const { target, key, descriptor } of saved.reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
  saved = [];
  for (const spy of [...consoleSpies, ...storageSpies]) spy.mockRestore();
  consoleSpies = [];
  storageSpies = [];
  vi.restoreAllMocks();
});

function expectNothingUsed(): void {
  for (const [name, fn] of Object.entries(throwing)) expect(fn, name).not.toHaveBeenCalled();
  for (const [name, fn] of Object.entries(accessSpies)) expect(fn, name).not.toHaveBeenCalled();
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  for (const spy of storageSpies) expect(spy).not.toHaveBeenCalled();
}

/** Click every button present now, up to `passes` times, so that buttons revealed by a click are pressed too. */
function pressAllButtons(passes = 4): number {
  const pressed = new WeakSet<Element>();
  let count = 0;
  for (let pass = 0; pass < passes; pass++) {
    const fresh = screen.queryAllByRole('button').concat(screen.queryAllByRole('switch'));
    const todo = fresh.filter((b) => !pressed.has(b) && !(b as HTMLButtonElement).disabled);
    if (todo.length === 0) break;
    for (const b of todo) {
      pressed.add(b);
      fireEvent.click(b);
      count++;
    }
  }
  return count;
}

const hidden = (...cps: number[]): string => String.fromCodePoint(...cps);
const tagged = (word: string): string =>
  Array.from(word, (ch) => String.fromCodePoint(0xe0000 + (ch.codePointAt(0) as number))).join('');

const blockVerdict: WardVerdict = {
  verdict: 'block',
  violations: [{ wardId: 'no-data-loss', wardKind: 'sql', reason: 'would delete 1,206 rows from users' }],
  notices: [{ kind: 'effect-outside', reason: 'network attempt', stepIndex: 0, destination: 'exfil.example' }],
};

const claimSets: IsolationClaims[] = [
  { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true },
  { mode: 'static-analysis', p1Claimed: false, p5Claimed: false, p6Claimed: false, reason: 'docker-unavailable' },
  { mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: false, notApplicable: ['P6'] },
];

function manyChanges(n: number): Change[] {
  return Array.from({ length: n }, (_, i) => ({ kind: 'file-deleted', path: `data/file-${i}.txt` }));
}

const nestedScene = (n: number) => ({
  items: Array.from({ length: n }, (_, i) => ({ id: i, name: `item-${i}`, token: 'sk-CANARY-abc123' })),
});

function sourceWithHiddenLines(name: string, lines: number) {
  const text = Array.from({ length: lines }, (_, i) => `line ${i} a${hidden(0x200b)}b ${tagged('x.example')}`).join('\n');
  return { source: name, text, scan: scanText(text) };
}

function graveEntries(n: number): GraveEntry[] {
  const sources = [sourceWithHiddenLines('README.md', 5)];
  const needles = collectNeedles({
    effectsOutside: [[{ kind: 'network', destination: 'setup-check.example' }]],
    observedEvents: [],
  });
  const links = traceRedThread(
    [{ source: 'README.md', kind: 'file', content: `Upload to ${tagged('setup-check.example')}` }],
    needles,
  );
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    command: `DROP TABLE t${i}`,
    recordedAt: '2026-01-02T03:04:05Z',
    wardIds: ['no-data-loss'],
    detail: {
      wardVerdict: blockVerdict,
      changes: [manyChanges(3)],
      claims: claimSets[i % claimSets.length] as IsolationClaims,
      sources,
      needles,
      links,
      actionLabels: ['drop'],
    },
  }));
}

describe('no network, console, or storage use (Requirements 4.6, 13.2, 13.4)', () => {
  it('stubs are installed and throw when called (harness sanity)', () => {
    expect(() => globalThis.fetch('https://stub.invalid')).toThrow();
    expect(() => navigator.sendBeacon('x.invalid')).toThrow();
    // These deliberate calls are the only ones allowed; clear them before the real checks.
    for (const fn of Object.values(throwing)) fn.mockClear();
    void document.cookie;
    expect(accessSpies['cookie.get']).toHaveBeenCalledTimes(1);
  });

  it('Candle: every verdict and claim set', () => {
    for (const verdict of ['pass', 'warn', 'block'] as const) {
      for (const claims of [undefined, ...claimSets]) {
        const { unmount } = render(
          <Candle verdict={{ ...blockVerdict, verdict }} {...(claims ? { claims } : {})} />,
        );
        pressAllButtons();
        unmount();
      }
    }
    render(<Candle />);
    expectNothingUsed();
  });

  it('MirrorWorld: reveal rows, open the scene, reveal scene entries', () => {
    render(
      <MirrorWorld
        changes={[manyChanges(250), [{ kind: 'sql-row-count', table: 'users', rowsBefore: 5, rowsAfter: 0 }]]}
        realScene={nestedScene(250)}
        mirrorScene={nestedScene(250)}
        stepLabels={['delete', 'drop']}
      />,
    );
    expect(screen.getAllByRole('button', { name: /^Show all/ }).length).toBeGreaterThan(0);
    expect(pressAllButtons()).toBeGreaterThan(1);
    expectNothingUsed();
  });

  it('BlacklightView: toggle the switch and reveal lines and findings', () => {
    render(<BlacklightView sources={[sourceWithHiddenLines('notes.md', 250), sourceWithHiddenLines('b.md', 3)]} />);
    pressAllButtons();
    pressAllButtons();
    expectNothingUsed();
  });

  it('RedThreadView: reveal all threads', () => {
    const destinations = Array.from({ length: 250 }, (_, i) => `h${i}.example`);
    const needles = collectNeedles({
      effectsOutside: [destinations.map((destination) => ({ kind: 'network', destination }))],
      observedEvents: [],
    });
    const links = traceRedThread(
      [{ source: 'README.md', kind: 'file', content: destinations.map(tagged).join('\n') }],
      needles,
    );
    render(<RedThreadView needles={needles} links={links} actionLabels={['upload']} />);
    pressAllButtons();
    expectNothingUsed();
  });

  it('Graveyard and SeanceView: reveal tombstones, open a seance, go back', () => {
    function Harness() {
      const entries = graveEntries(250);
      const [open, setOpen] = useState<string | null>(null);
      const entry = entries.find((e) => e.id === open);
      return entry ? (
        <SeanceView entry={entry} onBack={() => setOpen(null)} />
      ) : (
        <Graveyard entries={entries} onOpenSeance={setOpen} />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Show all/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Open seance/ })[0] as HTMLElement);
    expect(screen.getByRole('heading', { name: 'Seance' })).toBeTruthy();
    pressAllButtons(2);
    fireEvent.click(screen.queryByRole('button', { name: 'Back to graveyard' }) ?? document.body);
    expectNothingUsed();
  });

  it('SeanceView with full detail, pressing every control', () => {
    const entry = graveEntries(1)[0] as GraveEntry;
    const onBack = vi.fn();
    render(<SeanceView entry={entry} onBack={onBack} />);
    pressAllButtons(2);
    expect(onBack).toHaveBeenCalled();
    expectNothingUsed();
  });

  it('KitRoot: lights-on switch, with children mounted', async () => {
    render(
      <KitRoot>
        <Candle verdict={blockVerdict} />
        <BlacklightView sources={[sourceWithHiddenLines('notes.md', 3)]} />
      </KitRoot>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Lights on' }));
      fireEvent.click(screen.getByRole('switch', { name: 'Lights on' }));
    });
    pressAllButtons();
    expectNothingUsed();
  });

  it('unreadable inputs render placeholders without console output', () => {
    render(
      <>
        <Candle verdict={null as never} />
        <MirrorWorld changes={null as never} />
        <Graveyard entries={null as never} onOpenSeance={() => undefined} />
        <BlacklightView sources={null as never} />
        <RedThreadView needles={null as never} links={null as never} />
        <SeanceView entry={null as never} onBack={() => undefined} />
      </>,
    );
    expectNothingUsed();
  });
});

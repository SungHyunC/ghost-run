// Property L4: no request leaves the page.
// Network APIs are replaced by recorders that accept a same-origin .js or .wasm URL and throw otherwise.
// The Shell and Cloud engines are the real adapters (in-process); the Hand engine answers from the committed records.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initInlineSql } from '@ghost-run/playground-shell';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { createCloudEngine } from '../../src/live/cloud';
import { FIXED, PRESETS } from '../../src/live/presets';
import { createShellEngine } from '../../src/live/shell';
import type { LiveAnswer, LiveEngine, LiveInput, LiveLoaders } from '../../src/live/types';
import { drain, recordedLoaders } from '../lib/live-fakes';

const runs = runsJson as unknown as RunsFile;
const ROOT = resolve(__dirname, '../../..');
const shellWards = readFileSync(resolve(ROOT, 'apps/ghost-shell/wards.yaml'), 'utf8');
const cloudWards = readFileSync(resolve(ROOT, 'worlds/ghost-cloud/wards.yaml'), 'utf8');

const ORIGIN = window.location.origin;
const calls: string[] = [];
const violations: string[] = [];
const storageWrites: string[] = [];

/** Accepts only a same-origin URL ending in .js or .wasm; records and throws on anything else. */
function guard(api: string, url: unknown): void {
  const text = String(url);
  calls.push(`${api} ${text}`);
  let ok = false;
  try {
    const u = new URL(text, ORIGIN);
    ok = u.origin === ORIGIN && /\.(js|wasm)$/.test(u.pathname);
  } catch {
    ok = false;
  }
  if (!ok) {
    violations.push(`${api} ${text}`);
    throw new Error(`blocked network use: ${api} ${text}`);
  }
}

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

class RecXhr {
  open(_method: string, url: string): void {
    guard('XMLHttpRequest', url);
  }
  send(): void {}
}
class RecWebSocket {
  constructor(url: string) {
    guard('WebSocket', url);
  }
}
class RecEventSource {
  constructor(url: string) {
    guard('EventSource', url);
  }
}

beforeEach(() => {
  calls.length = 0;
  violations.length = 0;
  storageWrites.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('fetch', (url: unknown) => {
    guard('fetch', url);
    return Promise.resolve(new Response(''));
  });
  vi.stubGlobal('XMLHttpRequest', RecXhr);
  vi.stubGlobal('WebSocket', RecWebSocket);
  vi.stubGlobal('EventSource', RecEventSource);
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: unknown) => {
      guard('sendBeacon', url);
      return true;
    },
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
    storageWrites.push(`setItem ${key}`);
  });
  vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {
    storageWrites.push('cookie');
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});

let shell: LiveEngine;
let cloud: LiveEngine;

beforeAll(async () => {
  shell = createShellEngine({ sql: await initInlineSql(), wardsText: shellWards });
  cloud = createCloudEngine({ wardsText: cloudWards });
});

/** Extra plans every run also tries: curl to a reserved host, and a Cloud --endpoint-url plan. */
const CURL: LiveInput = { world: 'shell', actions: ['curl http://registry.example/x'] };
const ENDPOINT: LiveInput = { world: 'cloud', lines: ['aws s3 ls --endpoint-url http://s3.example'] };

const sideRuns: LiveAnswer[] = [];
const pending: Promise<unknown>[] = [];

/** Runs the two network-looking plans through the real engines and notes their answers. */
function sideRun(): void {
  pending.push(shell.run(CURL).then((a) => sideRuns.push(a)), cloud.run(ENDPOINT).then((a) => sideRuns.push(a)));
}

/** An engine that answers the page's input and, on each call, also runs the two network-looking plans. */
function withSideRuns(world: 'shell' | 'cloud', answers: LiveEngine): LiveEngine {
  return {
    world,
    warm: () => Promise.resolve(),
    dispose: () => undefined,
    run: async (input) => {
      sideRun();
      return answers.run(input);
    },
  };
}

function loaders(): LiveLoaders {
  const base = recordedLoaders(runs).loaders;
  return {
    light: async () => {
      const light = await base.light();
      return {
        shell: withSideRuns('shell', shell),
        cloud: withSideRuns('cloud', cloud),
        dispose: light.dispose,
      };
    },
    hand: async () => {
      const hand = await base.hand();
      return {
        world: 'hand',
        warm: () => hand.warm(),
        dispose: () => hand.dispose(),
        run: async (input) => {
          sideRun();
          return hand.run(input);
        },
      };
    },
  };
}

const TABS = [
  { id: 'shell' as const, name: /Ghost Shell/ },
  { id: 'hand' as const, name: /Ghost Hand/ },
  { id: 'cloud' as const, name: /Ghost Cloud/ },
];

/** Waits for the in-process engine runs, then lets the controller finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.all(pending.splice(0));
  });
  await drain();
}

async function play(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

describe('Property L4: no request leaves the page', () => {
  // Feature: site-live, Property L4: No request leaves the page
  // **Validates: Requirements 13.1, 13.2, 13.4**
  it('every Preset and Fixed_Plan of all worlds plays without a request or a storage write', async () => {
    sideRuns.length = 0;
    pending.length = 0;
    const { container } = render(
      <>
        <Sprite />
        <Walkthrough
          runs={runs}
          loaders={loaders()}
          renderReality={(record) => <RealityPane scene={record.reality} />}
          renderCopy={(record, view) => <CopyPane record={record} copy={view.copy} fixed={view.plan.rev} />}
        />
      </>,
    );
    let played = 0;
    for (const tab of TABS) {
      fireEvent.click(screen.getByRole('tab', { name: tab.name }));
      await drain();
      const count = container.querySelectorAll('#presets button').length;
      expect(count).toBe(PRESETS[tab.id].length);
      for (let i = 0; i < count; i++) {
        const buttons = container.querySelectorAll<HTMLButtonElement>('#presets button');
        fireEvent.click(buttons[i] as HTMLButtonElement);
        await settle();
        await play(60_000);
        played++;
      }
    }
    expect(played).toBe(9);
    expect(Object.keys(FIXED).length).toBe(4);

    // Typed plans that reach outside the copy, in both worlds that take text.
    const typed: [RegExp, string][] = [
      [/Ghost Shell/, 'curl http://registry.example/x'],
      [/Ghost Cloud/, 'aws s3 ls --endpoint-url http://s3.example'],
    ];
    for (const [name, text] of typed) {
      fireEvent.click(screen.getByRole('tab', { name }));
      await drain();
      const input = container.querySelector('#cmd') as HTMLInputElement;
      fireEvent.change(input, { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: /Run (ghost|8 ghosts)/ }));
      await settle();
      await play(60_000);
    }

    expect(violations).toEqual([]);
    expect(calls.filter((c) => /example|invalid|localhost/.test(c))).toEqual([]);
    expect(storageWrites).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');

    // The curl and --endpoint-url plans left only a recorded observation in the run.
    expect(sideRuns.length).toBeGreaterThan(0);
    for (const a of sideRuns) {
      expect(a.status).toBe('ran');
      if (a.status !== 'ran') continue;
      expect(a.run.plan.verdict).toBe('warn');
      expect(a.run.plan.effectsOutside.join(' ')).toMatch(/\.example/);
      expect(a.run.plan.p1.equal).toBe(true);
    }
  });

  it('the recorders themselves throw on a foreign or non-script URL (the test can fail)', () => {
    expect(() => guard('fetch', 'http://registry.example/x')).toThrow();
    expect(() => guard('fetch', `${ORIGIN}/data.json`)).toThrow();
    expect(() => guard('fetch', `${ORIGIN}/assets/sim.wasm`)).not.toThrow();
    violations.length = 0;
    calls.length = 0;
  });
});

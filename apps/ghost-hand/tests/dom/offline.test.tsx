// Task 14.6: network, storage, and start-up failure tests (jsdom).
// Every network entry point throws (one same-origin WebAssembly URL is allowed), and the page must run
// both demo scenarios, the reference execution, and the Graveyard flow without any call, without any
// storage write, and without any console output.
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import wardsText from '../../../../worlds/drawer-arm/wards.yaml?raw';
import variantConfigText from '../../../../worlds/drawer-arm/variant-config.json?raw';
import { App } from '../../src/App';
import type { AppServices } from '../../src/App';
import { createInlineExecutor } from '../../src/exec/inline';
import { ENGINE_START_FAILURE_TEXT, P5_P6_TEXT, P8_SCOPE_TEXT } from '../../src/texts';
import { SECURE_CONTEXT_TEXT } from '../../src/ui-text';

/** The single URL a same-origin WebAssembly load may use. */
const ALLOWED_WASM_URL = /^(?:file:\/\/|\/|\.\/|http:\/\/localhost(?::\d+)?\/)[^?#]*mujoco[^?#]*\.wasm$/;

interface Recorder {
  readonly blocked: string[];
  readonly allowed: string[];
  readonly storageWrites: string[];
  readonly console: string[];
  restore: () => void;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function realmClone<T>(value: T): T {
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number> & { constructor: new (source: ArrayLike<number>) => unknown };
    const Ctor = (globalThis as unknown as Record<string, new (s: ArrayLike<number>) => unknown>)[view.constructor.name];
    return new (Ctor ?? view.constructor)(view) as T;
  }
  if (Array.isArray(value)) return value.map((v: unknown) => realmClone(v)) as T;
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = realmClone(v);
    return out as T;
  }
  return value;
}

function install(): Recorder {
  const blocked: string[] = [];
  const allowed: string[] = [];
  const storageWrites: string[] = [];
  const consoleCalls: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown): void => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };

  const realFetch = typeof g['fetch'] === 'function' ? (g['fetch'] as typeof fetch) : undefined;
  replace('fetch', (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (ALLOWED_WASM_URL.test(url) && realFetch !== undefined) {
      allowed.push(url);
      return realFetch(input as RequestInfo, init);
    }
    blocked.push(`fetch ${url}`);
    throw new Error('network call: fetch');
  });
  replace('XMLHttpRequest', function Xhr() {
    blocked.push('XMLHttpRequest');
    throw new Error('network call: XMLHttpRequest');
  });
  replace('WebSocket', function Ws() {
    blocked.push('WebSocket');
    throw new Error('network call: WebSocket');
  });
  replace('EventSource', function Es() {
    blocked.push('EventSource');
    throw new Error('network call: EventSource');
  });
  const nav = navigator as unknown as Record<string, unknown>;
  const savedBeacon = Object.getOwnPropertyDescriptor(nav, 'sendBeacon');
  Object.defineProperty(nav, 'sendBeacon', {
    value: () => {
      blocked.push('sendBeacon');
      throw new Error('network call: sendBeacon');
    },
    configurable: true,
    writable: true,
  });
  // jsdom gives page code its own ArrayBuffer realm, which the Node Web Crypto rejects. The adapter
  // copies the bytes into a Node-realm buffer; it hashes locally and makes no call outside the process.
  const nodeSubtle = webcrypto.subtle;
  replace('crypto', {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: {
      digest: (algorithm: AlgorithmIdentifier, data: ArrayBuffer) =>
        nodeSubtle.digest(algorithm, Buffer.from(new Uint8Array(data))),
    },
  });
  // jsdom gives page code its own typed-array realm, but its structuredClone returns Node-realm arrays, so
  // the world's `instanceof Float64Array` check fails. A realm-preserving clone keeps the real engine usable.
  replace('structuredClone', realmClone);
  replace('indexedDB', {
    open: () => {
      storageWrites.push('indexedDB.open');
      throw new Error('storage write: indexedDB');
    },
  });

  const storageSpies = (['setItem', 'removeItem', 'clear'] as const).map((method) =>
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      storageWrites.push(`Storage.${method}`);
    }),
  );
  const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '',
    set: () => {
      storageWrites.push('document.cookie');
    },
  });
  const consoleSpies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(`console.${method}: ${args.map(String).join(' ')}`);
    }),
  );

  return {
    blocked,
    allowed,
    storageWrites,
    console: consoleCalls,
    restore: () => {
      for (const [name, descriptor] of saved) {
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      if (savedBeacon === undefined) Reflect.deleteProperty(nav, 'sendBeacon');
      else Object.defineProperty(nav, 'sendBeacon', savedBeacon);
      Reflect.deleteProperty(document, 'cookie');
      if (cookieDescriptor !== undefined) Object.defineProperty(Document.prototype, 'cookie', cookieDescriptor);
      for (const s of [...storageSpies, ...consoleSpies]) s.mockRestore();
    },
  };
}

function baseServices(over: Partial<AppServices> = {}): AppServices {
  const createWorld: AppServices['createWorld'] = (opts) =>
    createGhostHandWorld({ recordFrames: opts?.recordFrames === true });
  return {
    clock: () => new Date(0),
    createWorld,
    createExecutor: () => createInlineExecutor(() => createGhostHandWorld()),
    createOverlay: () => ({ unavailable: true }),
    download: () => undefined,
    wardsText,
    variantConfigText,
    prefersReducedMotion: () => true,
    demoPauseMs: 0,
    ...over,
  };
}

let rec: Recorder;
beforeEach(() => {
  rec = install();
});
afterEach(() => {
  cleanup();
  rec.restore();
  vi.unstubAllGlobals();
});

function expectQuiet(): void {
  expect(rec.blocked).toEqual([]);
  expect(rec.storageWrites).toEqual([]);
  expect(rec.console).toEqual([]);
}

function runButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Run ghost' });
}

describe('offline operation', () => {
  it('runs both scenarios, the reference execution, and the Graveyard flow with no network call, storage write, or console output', async () => {
    render(<App services={baseServices()} />);

    fireEvent.click(screen.getByRole('button', { name: 'fast pull' }));
    await waitFor(() => {
      expect(runButton().disabled).toBe(false);
    }, { timeout: 120_000 });
    fireEvent.click(runButton());
    // A blocked run adds one tombstone to the Graveyard.
    const tombstone = await screen.findByRole('button', { name: /^Open seance for blocked command/ }, { timeout: 120_000 });
    fireEvent.click(tombstone);
    const back = await screen.findByRole('button', { name: /back to graveyard/i });
    fireEvent.click(back);
    await screen.findByRole('heading', { name: 'Graveyard' });

    fireEvent.click(screen.getByRole('button', { name: 'slow pull, gentle grip' }));
    await waitFor(() => {
      expect(runButton().disabled).toBe(false);
    });
    fireEvent.click(runButton());
    const execute = screen.getByRole('button', { name: 'Execute on reference arm' });
    await waitFor(() => {
      expect((execute as HTMLButtonElement).disabled).toBe(false);
    }, { timeout: 120_000 });
    fireEvent.click(execute);
    await screen.findByText(/Final drawer displacement \(m\): /, undefined, { timeout: 120_000 });

    expectQuiet();
  }, 400_000);
});

describe('start-up failures', () => {
  it('shows the engine alert, disables run controls, and makes no claim when the module fails to load', async () => {
    render(
      <App
        services={baseServices({ createWorld: () => Promise.reject(new Error('module load failed')) })}
      />,
    );
    const alert = (await screen.findByText(ENGINE_START_FAILURE_TEXT)).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(runButton().disabled).toBe(true);
    for (const name of ['Play demo', 'Execute on reference arm', 'Reset reference arm']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(P5_P6_TEXT)).toBeTruthy();
    expect(screen.getByText(P8_SCOPE_TEXT)).toBeTruthy();
    // No isolation claim is made: the failing engine produced no run, so no Candle verdict is shown.
    expect(screen.queryByText(/P1 claimed/)).toBeNull();
    expect(screen.queryByText(/Ghost ran on an in-memory copy/)).toBeNull();
    expectQuiet();
  });

  it('shows the secure-context alert and runs nothing when crypto.subtle is missing', async () => {
    vi.stubGlobal('crypto', {});
    const createWorld = vi.fn(() => Promise.reject(new Error('must not be called')));
    render(<App services={baseServices({ createWorld })} />);
    const alert = (await screen.findByText(SECURE_CONTEXT_TEXT)).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(createWorld).not.toHaveBeenCalled();
    expect(runButton().disabled).toBe(true);
    expectQuiet();
  });
});

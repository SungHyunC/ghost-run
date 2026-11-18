import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { runSelfCheck, selfCheckText } from '../../src/self-check';
import type { SelfCheckResult } from '../../src/self-check';
import { DETERMINISM_FAILED_TEXT, determinismReproducedText, P2_TEXT_ENABLED } from '../../src/texts';

const HASH = '0123456789abcdef0123456789abcdef';

interface StubOptions {
  /** Trajectory hash for each referenceExecute call (cycled by call index across worlds). */
  readonly hashes?: readonly string[];
  /** When true, every step yields a different state, so two runs from one snapshot differ. */
  readonly drift?: boolean;
  readonly failStep?: boolean;
}

function stubFactory(opts: StubOptions = {}): () => Promise<GhostHandWorld> {
  let refCalls = 0;
  let counter = 0;
  return async () => {
    const world = {
      referenceExecute: async () => {
        const list = opts.hashes ?? [HASH];
        const hash = list[refCalls % list.length] as string;
        refCalls += 1;
        return { trajectoryHash: hash };
      },
      snapshot: async () => ({ id: 's', state: { n: 0 }, result: { success: true } }),
      step: async () => {
        if (opts.failStep) throw new Error('boom');
        counter += 1;
        return { id: 's', state: { n: opts.drift ? counter : 1 }, result: { success: true } };
      },
      dispose: () => undefined,
    };
    return world as unknown as GhostHandWorld;
  };
}

describe('runSelfCheck with stub worlds', () => {
  it('returns ok when both runs and the golden hash agree', async () => {
    const r = await runSelfCheck(stubFactory(), HASH);
    expect(r).toEqual({ state: 'ok', hash: HASH, restoreOk: true });
  });

  it('returns ok without a golden hash when the two runs agree', async () => {
    expect((await runSelfCheck(stubFactory(), undefined)).state).toBe('ok');
  });

  it('returns not-reproduced when the golden hash differs', async () => {
    const r = await runSelfCheck(stubFactory(), 'ff'.repeat(16));
    expect(r).toEqual({ state: 'failed', reason: 'not-reproduced', hash: HASH });
  });

  it('returns not-reproduced when the two runs differ', async () => {
    const r = await runSelfCheck(stubFactory({ hashes: ['aa'.repeat(16), 'bb'.repeat(16)] }), undefined);
    expect(r).toMatchObject({ state: 'failed', reason: 'not-reproduced' });
  });

  it('returns restore-mismatch when two runs from one snapshot differ', async () => {
    const r = await runSelfCheck(stubFactory({ drift: true }), HASH);
    expect(r).toEqual({ state: 'failed', reason: 'restore-mismatch', hash: HASH });
  });

  it('returns engine-error when the world factory fails', async () => {
    const r = await runSelfCheck(async () => {
      throw new Error('no engine');
    }, HASH);
    expect(r).toEqual({ state: 'failed', reason: 'engine-error' });
  });

  it('returns engine-error when a restore-check step fails', async () => {
    const r = await runSelfCheck(stubFactory({ failStep: true }), HASH);
    expect(r).toEqual({ state: 'failed', reason: 'engine-error' });
  });
});

describe('runSelfCheck without crypto.subtle', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no-secure-context', async () => {
    try {
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
      const r = await runSelfCheck(stubFactory(), HASH);
      expect(r).toEqual({ state: 'failed', reason: 'no-secure-context' });
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
    expect(globalThis.crypto?.subtle).toBeDefined();
  });
});

describe('selfCheckText', () => {
  it('is null while pending', () => {
    expect(selfCheckText({ state: 'pending' })).toBeNull();
  });

  it('uses the first 12 hex digits in the reproduced text', () => {
    const text = selfCheckText({ state: 'ok', hash: HASH, restoreOk: true });
    expect(text).toBe(determinismReproducedText(HASH));
    expect(text).toContain(`hash ${HASH.slice(0, 12)})`);
    expect(text).not.toContain(HASH.slice(0, 13));
  });

  it.each(['not-reproduced', 'restore-mismatch', 'engine-error', 'no-secure-context'] as const)(
    'gives the failure text for %s, with no reproduced or P8 claim',
    (reason) => {
      const result: SelfCheckResult = { state: 'failed', reason, hash: HASH };
      const text = selfCheckText(result);
      expect(text).toBe(DETERMINISM_FAILED_TEXT);
      expect(text).toContain('did NOT reproduce');
      expect(text).toContain('P8) is not claimed');
      expect(text).not.toContain('reproduced the reference');
      expect(text).not.toContain(HASH.slice(0, 12));
    },
  );

  it('produces no P2 text in the self-check lines for any state', () => {
    expect(P2_TEXT_ENABLED).toBe(true);
    const states: SelfCheckResult[] = [
      { state: 'pending' },
      { state: 'failed', reason: 'not-reproduced' },
      { state: 'ok', hash: HASH, restoreOk: true },
    ];
    for (const s of states) expect(selfCheckText(s) ?? '').not.toMatch(/P2/);
  });
});

describe('runSelfCheck with the real engine', () => {
  it('returns ok on the real Base_World', async () => {
    const r = await runSelfCheck(() => createGhostHandWorld(), undefined);
    expect(r.state).toBe('ok');
    if (r.state === 'ok') expect(r.hash).toMatch(/^[0-9a-f]+$/);
  }, 120_000);
});

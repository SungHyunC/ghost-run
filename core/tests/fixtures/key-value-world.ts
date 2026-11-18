import type {
  Change,
  Effect,
  FingerprintResult,
  Scene,
  Snapshot,
  World,
} from '../../src/index.js';

export type KVState = Record<string, string>;

export interface KVAction {
  op: 'set' | 'delete';
  key: string;
  value?: string;
}

const encoder = new TextEncoder();

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Deep copy; Object.fromEntries defines own properties, so "__proto__" keys are safe. */
function copyState(state: KVState): KVState {
  return Object.fromEntries(Object.entries(state));
}

/**
 * Apply one action to a plain state object, returning a new state and an
 * optional failure message. The input state is never mutated.
 */
function applyAction(state: KVState, a: KVAction): { state: KVState; error?: string } {
  const map = new Map(Object.entries(state));
  if (a.op === 'set') {
    if (typeof a.value !== 'string') {
      return { state: copyState(state), error: `set "${a.key}" requires a value` };
    }
    map.set(a.key, a.value);
  } else if (a.op === 'delete') {
    map.delete(a.key);
  } else {
    return { state: copyState(state), error: 'unknown op' };
  }
  return { state: Object.fromEntries(map) };
}

/** Minimal in-process World used to exercise the contract and its PBT suite. */
export class KeyValueWorld implements World<KVState, KVAction> {
  private live: KVState;
  private counter = 0;

  constructor(initial: KVState = {}) {
    this.live = copyState(initial);
  }

  private nextId(): string {
    this.counter += 1;
    return `kv-${this.counter}`;
  }

  async snapshot(): Promise<Snapshot<KVState>> {
    return { id: this.nextId(), state: copyState(this.live), result: { success: true } };
  }

  async step(s: Snapshot<KVState>, a: KVAction): Promise<Snapshot<KVState>> {
    const { state, error } = applyAction(s.state, a);
    return {
      id: this.nextId(),
      state,
      result: error === undefined ? { success: true } : { success: false, error },
    };
  }

  diff(before: Snapshot<KVState>, after: Snapshot<KVState>): Change[] {
    const b = new Map(Object.entries(before.state));
    const a = new Map(Object.entries(after.state));
    const keys = [...new Set([...b.keys(), ...a.keys()])].sort(cmp);
    const changes: Change[] = [];
    for (const key of keys) {
      const bv = b.get(key);
      const av = a.get(key);
      if (av === undefined) {
        changes.push({ kind: 'delete', key, before: bv as string });
      } else if (bv !== av) {
        changes.push({ kind: 'set', key, before: bv ?? null, after: av });
      }
    }
    return changes;
  }

  render(s: Snapshot<KVState>): Scene {
    const entries: Record<string, string> = Object.fromEntries(
      Object.entries(s.state).sort(([x], [y]) => cmp(x, y)),
    );
    return { entries };
  }

  async fingerprint(): Promise<FingerprintResult> {
    const keys = Object.keys(this.live).sort(cmp);
    const manifest: Record<string, string> = {};
    const parts: string[] = [];
    for (const key of keys) {
      const value = this.live[key] as string;
      manifest[key] = await sha256Hex(value);
      parts.push(JSON.stringify([key, value]));
    }
    return { hash: await sha256Hex(`[${parts.join(',')}]`), manifest };
  }

  effectsOutside(_a: KVAction): Effect[] {
    return [];
  }

  /**
   * Mutate the live state in place (the "real" execution path). Not part of
   * the World contract; used by the P2 test adapter. Returns the Changes
   * produced, computed with the same diff as ghost runs.
   */
  applyLive(a: KVAction): Change[] {
    const before: Snapshot<KVState> = { id: 'live-before', state: this.live, result: { success: true } };
    const { state, error } = applyAction(this.live, a);
    const after: Snapshot<KVState> = {
      id: 'live-after',
      state,
      result: error === undefined ? { success: true } : { success: false, error },
    };
    const changes = this.diff(before, after);
    this.live = state;
    return changes;
  }
}

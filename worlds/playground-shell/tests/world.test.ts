import { describe, expect, it } from 'vitest';
import { createPlaygroundWorld, type VirtualProject } from '../src/index.js';
import config from '../world.config.js';

const enc = new TextEncoder();
const project: VirtualProject = {
  name: 'demo',
  entries: {
    src: { kind: 'dir' },
    'src/a.txt': { kind: 'file', bytes: enc.encode('hello') },
    '.env': { kind: 'file', bytes: enc.encode('KEY=sk-CANARY-abc123') },
  },
};
const sql = { run: () => Promise.resolve({ ok: false as const, stderr: 'none' }) };
const make = () => createPlaygroundWorld(project, { secretPatterns: ['.env'], sql });

describe('createPlaygroundWorld', () => {
  it('snapshots are independent deep copies with unique ids', async () => {
    const w = make();
    const a = await w.snapshot();
    const b = await w.snapshot();
    expect(a.id).not.toBe(b.id);
    const file = a.state.entries['src/a.txt'];
    if (file?.kind === 'file') file.bytes[0] = 0;
    const c = await w.snapshot();
    const fresh = c.state.entries['src/a.txt'];
    expect(fresh?.kind === 'file' && fresh.bytes[0]).toBe(104);
    expect(b.state).not.toBe(c.state);
  });

  it('step leaves the input snapshot and reality unchanged', async () => {
    const w = make();
    const before = await w.fingerprint();
    const s = await w.snapshot();
    const copy = structuredClone(s.state);
    const next = await w.step(s, { command: 'rm src/a.txt' });
    expect(s.state).toEqual(copy);
    expect(next.id).not.toBe(s.id);
    expect(w.diff(s, next).map((c) => c.kind)).toEqual(['file-deleted']);
    expect((await w.fingerprint()).hash).toBe(before.hash);
  });

  it('reports failures and unsupported steps', async () => {
    const w = make();
    const s = await w.snapshot();
    const bad = await w.step(s, { command: 'cat missing.txt' });
    expect(bad.result.success).toBe(false);
    const un = await w.step(s, { command: 'frobnicate' });
    expect(un.result).toEqual({ success: false, error: 'unsupported: command not supported: frobnicate' });
    expect(w.diff(s, un)).toEqual([]);
  });

  it('traceOf is undefined for unknown ids and grows per step', async () => {
    const w = make();
    expect(w.traceOf('nope')).toBeUndefined();
    const s = await w.snapshot();
    expect(w.traceOf(s.id)?.steps).toEqual([]);
    const s1 = await w.step(s, { command: 'cat .env' });
    const s2 = await w.step(s1, { command: 'ls' });
    expect(w.traceOf(s2.id)?.steps.map((r) => r.stepIndex)).toEqual([0, 1]);
    expect(w.traceOf(s1.id)?.events.map((e) => e.kind)).toEqual(['secret-read']);
  });

  it('an unknown snapshot id is treated as an empty trace', async () => {
    const w = make();
    const other = await make().snapshot();
    const next = await w.step({ ...other, id: 'foreign' }, { command: 'ls' });
    expect(w.traceOf(next.id)?.steps).toHaveLength(1);
  });

  it('effectsOutside lists URLs only', () => {
    const w = make();
    expect(w.effectsOutside({ command: 'curl https://x.example/a' })).toEqual([
      { kind: 'network', destination: 'https://x.example/a' },
    ]);
    expect(w.effectsOutside({ command: 'ls' })).toEqual([]);
  });

  it('observation-only steps have an empty diff', async () => {
    const w = make();
    const s = await w.snapshot();
    const n = await w.step(s, { command: 'curl https://x.example/a' });
    expect(w.diff(s, n)).toEqual([]);
    expect(w.traceOf(n.id)?.events.some((e) => e.kind === 'network-attempt')).toBe(true);
  });

  it('registration config points at the shared wards file', () => {
    expect(config.id).toBe('playground-shell');
    expect(config.wardsFile).toBe('../../apps/ghost-shell/wards.yaml');
    expect(make().metadata).toEqual({ id: 'playground-shell', deterministic: true });
  });
});

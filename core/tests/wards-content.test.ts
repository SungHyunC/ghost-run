import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/index.js';
import type { GhostReport, Ward, WardSet } from '../src/index.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const SECRET = 'sk-CANARY-abc123';

const egress = (over: Partial<Extract<Ward, { kind: 'egress' }>> = {}): WardSet => ({
  wards: [{ id: 'no-exfil', kind: 'egress', secrets: ['.env'], allow_hosts: [], ...over }],
});

function report(over: Partial<GhostReport<unknown>> = {}): GhostReport<unknown> {
  return {
    snapshots: [],
    changes: [],
    effectsOutside: [],
    observedEvents: [],
    variantResults: [],
    ...over,
  };
}

const netEvent = (eventId: string, stepIndex = 1) => ({
  kind: 'network-attempt' as const,
  destination: 'https://collector.example/x',
  stepIndex,
  eventId,
});

describe('content inspection in WardEngine.evaluate', () => {
  it('blocks a payload hit without any secret-read event and ignores allow_hosts', () => {
    const r = report({ observedEvents: [netEvent('ev-1')] });
    const v = WardEngine.evaluate(r, egress({ allow_hosts: ['collector.example'] }), {
      secretValues: new Map([['.env', enc(`API=${SECRET}\n`)]]),
      payloads: new Map([['ev-1', enc(`token=${SECRET}`)]]),
    });
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]?.reason).toBe(
      'payload of event ev-1 contains a value from secret file .env (encoding: raw)',
    );
  });

  it('reports the encoding kind for a base64 payload', () => {
    const r = report({ observedEvents: [netEvent('ev-1')] });
    const b64 = Buffer.from(enc(SECRET)).toString('base64');
    const v = WardEngine.evaluate(r, egress(), {
      secretValues: new Map([['.env', enc(SECRET)]]),
      payloads: new Map([['ev-1', enc(`x=${b64}`)]]),
    });
    expect(v.violations[0]?.reason).toContain('(encoding: base64');
  });

  it('lists behavior violations before payload hits and caps hits at 20', () => {
    const payloads = new Map<string, Uint8Array>();
    for (let i = 0; i < 25; i++) payloads.set(`ev-${String(i).padStart(2, '0')}`, enc(SECRET));
    const r = report({
      observedEvents: [
        { kind: 'secret-read', path: '.env', stepIndex: 0 },
        ...[...payloads.keys()].map((id) => netEvent(id)),
      ],
    });
    const v = WardEngine.evaluate(r, egress(), {
      secretValues: new Map([['.env', enc(SECRET)]]),
      payloads,
    });
    const reasons = v.violations.map((x) => x.reason);
    const firstHit = reasons.findIndex((x) => x.startsWith('payload of event'));
    expect(reasons.slice(0, firstHit).every((x) => !x.startsWith('payload of event'))).toBe(true);
    expect(firstHit).toBeGreaterThan(0);
    expect(reasons.filter((x) => x.startsWith('payload of event'))).toHaveLength(20);
    expect(reasons.at(-1)).toBe('5 more payload hits not listed');
  });

  it('adds a notice when no secret values match and a secret was read', () => {
    const r = report({ observedEvents: [{ kind: 'secret-read', path: '.env', stepIndex: 0 }] });
    const v = WardEngine.evaluate(r, egress(), {});
    expect(v.verdict).toBe('warn');
    expect(v.notices.some((n) => n.kind === 'content-inspection' && n.reason.includes('no secret values were provided'))).toBe(true);
  });

  it('notes a payload without a matching event', () => {
    const v = WardEngine.evaluate(report(), egress(), {
      secretValues: new Map([['.env', enc(SECRET)]]),
      payloads: new Map([['orphan', enc('nothing here at all')]]),
    });
    expect(v.notices.map((n) => n.reason)).toContain('payload orphan has no matching observed event');
    expect(v.verdict).toBe('warn');
  });

  it('notes discarded short candidates only when a payload exists', () => {
    const secretValues = new Map([['.env', enc('A=short\nB=another-long-value-here')]]);
    const none = WardEngine.evaluate(report(), egress(), { secretValues });
    expect(none.notices).toEqual([]);
    const r = report({ observedEvents: [netEvent('ev-1')] });
    const some = WardEngine.evaluate(r, egress(), { secretValues, payloads: new Map([['ev-1', enc('zzz')]]) });
    expect(some.notices.some((n) => n.reason.includes('shorter than 8 bytes'))).toBe(true);
  });

  it('skips malformed entries with a notice and does not throw', () => {
    const bad = new Map<unknown, unknown>([[42, enc(SECRET)], ['.env', 'not bytes']]);
    const v = WardEngine.evaluate(report(), egress(), { secretValues: bad as never });
    expect(v.notices.filter((n) => n.kind === 'content-inspection')).toHaveLength(2);
    expect(JSON.stringify(v)).not.toContain(SECRET);
  });

  it('redacts a secret that appears in a verdict string (leak guard)', () => {
    const r = report({
      observedEvents: [
        { kind: 'secret-read', path: '.env', stepIndex: 0 },
        { kind: 'secret-read', path: `leak/${SECRET}`, stepIndex: 0 },
      ],
    });
    const v = WardEngine.evaluate(r, egress(), { secretValues: new Map([['.env', enc(SECRET)]]) });
    expect(v.verdict).toBe('warn');
    const json = JSON.stringify(v);
    expect(json).not.toContain(SECRET);
    expect(json).toContain('[redacted: contains a secret value]');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const secretValues = new Map([['.env', enc(SECRET)]]);
    const payloads = new Map([['ev-1', enc(SECRET)]]);
    const r = report({ observedEvents: [netEvent('ev-1')] });
    const a = WardEngine.evaluate(r, egress(), { secretValues, payloads });
    const b = WardEngine.evaluate(r, egress(), { secretValues, payloads });
    expect(a).toEqual(b);
    expect(Array.from(secretValues.get('.env') as Uint8Array)).toEqual(Array.from(enc(SECRET)));
  });
});

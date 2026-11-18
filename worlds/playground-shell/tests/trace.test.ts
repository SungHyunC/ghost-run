import { describe, expect, it } from 'vitest';
import { TRUNCATION_MARKER, TraceBuilder, emptyTrace, truncateOutput, type StepRecord } from '../src/trace.js';
import { cloneState, copyBytes, freezeState } from '../src/state.js';

const step = (over: Partial<StepRecord> = {}): StepRecord => ({
  stepIndex: 0,
  command: 'true',
  exitCode: 0,
  stdout: '',
  stderr: '',
  unsupported: false,
  watchdog: false,
  ...over,
});
const bytes = (n: number, v = 65): Uint8Array => new Uint8Array(n).fill(v);

describe('TraceBuilder', () => {
  it('dedupes reads per (stepIndex, path) and network per (stepIndex, destination)', () => {
    const b = new TraceBuilder();
    b.recordRead(0, '.env');
    b.recordRead(0, '.env');
    b.recordRead(1, '.env');
    b.recordNetwork(0, 'a.example:443');
    b.recordNetwork(0, 'a.example:443');
    b.recordNetwork(1, 'a.example:443');
    const t = b.build();
    expect(t.events).toHaveLength(4);
    expect(t.events.map((e) => e.stepIndex)).toEqual([0, 1, 0, 1]);
  });

  it('assigns evt-<n> from the payload-carrying events already in the trace', () => {
    const b1 = new TraceBuilder();
    b1.recordNetwork(0, 'a.example:443'); // no body, no id
    b1.recordNetwork(0, 'b.example:443', bytes(3));
    const t1 = b1.build();
    expect(t1.events[0]?.eventId).toBeUndefined();
    expect(t1.events[1]?.eventId).toBe('evt-1');
    const b2 = new TraceBuilder(t1);
    b2.recordNetwork(1, 'c.example:80', bytes(2));
    const t2 = b2.build();
    expect(t2.events[2]?.eventId).toBe('evt-2');
    expect([...t2.payloads.keys()]).toEqual(['evt-1', 'evt-2']);
    expect(t1.payloads.size).toBe(1); // previous trace unchanged
  });

  it('merges a second body to the same destination and cuts at 65,536 bytes', () => {
    const b = new TraceBuilder();
    b.recordNetwork(0, 'a.example:443', bytes(3, 1));
    b.recordNetwork(0, 'a.example:443', bytes(2, 2));
    let t = b.build();
    expect([...(t.payloads.get('evt-1') ?? [])]).toEqual([1, 1, 1, 2, 2]);
    expect(t.events).toHaveLength(1);

    const c = new TraceBuilder();
    c.recordNetwork(0, 'a.example:443', bytes(65530));
    c.recordNetwork(0, 'a.example:443', bytes(100, 66));
    t = c.build();
    expect(t.payloads.get('evt-1')?.byteLength).toBe(65536);
  });

  it('gives the first event an id when only the second request has a body', () => {
    const b = new TraceBuilder();
    b.recordNetwork(0, 'a.example:443');
    b.recordNetwork(0, 'a.example:443', bytes(4));
    const t = b.build();
    expect(t.events).toHaveLength(1);
    expect(t.events[0]?.eventId).toBe('evt-1');
  });

  it('cuts a single oversized body', () => {
    const b = new TraceBuilder();
    b.recordNetwork(0, 'a.example:443', bytes(70000));
    expect(b.build().payloads.get('evt-1')?.byteLength).toBe(65536);
  });

  it('tracks watchdog and coverage and appends steps', () => {
    const b = new TraceBuilder(emptyTrace());
    b.addStep(step({ watchdog: true }));
    b.markPartialCoverage();
    const t = b.build();
    expect(t.watchdogFired).toBe(true);
    expect(t.readCoverage).toBe('partial');
    expect(t.steps).toHaveLength(1);
    expect(emptyTrace().watchdogFired).toBe(false);
  });
});

describe('truncateOutput', () => {
  it('keeps short text and marks long text', () => {
    expect(truncateOutput('abc')).toBe('abc');
    expect(truncateOutput('a'.repeat(4096))).toBe('a'.repeat(4096));
    expect(truncateOutput('a'.repeat(4097))).toBe('a'.repeat(4096) + TRUNCATION_MARKER);
  });

  it('counts code points, not UTF-16 units', () => {
    const smile = '\u{1F600}'.repeat(4096);
    expect(truncateOutput(smile)).toBe(smile);
    expect(truncateOutput(smile + 'x')).toBe(smile + TRUNCATION_MARKER);
  });

  it('is applied to step records', () => {
    const b = new TraceBuilder();
    b.addStep(step({ stdout: 'a'.repeat(5000) }));
    expect(b.build().steps[0]?.stdout.endsWith(TRUNCATION_MARKER)).toBe(true);
  });
});

describe('state helpers', () => {
  it('clone is deep, copyBytes copies, freeze is deep on records', () => {
    const s = { entries: { f: { kind: 'file' as const, bytes: new Uint8Array([1, 2]), tables: { t: 1 } } } };
    const c = cloneState(s);
    expect(ArrayBuffer.isView(c.entries['f'] && 'bytes' in c.entries['f'] ? c.entries['f'].bytes : null)).toBe(true);
    expect(c).toEqual(s);
    expect(c.entries['f']).not.toBe(s.entries['f']);
    const src = new Uint8Array([9, 8]);
    const cp = copyBytes(src);
    cp[0] = 0;
    expect(src[0]).toBe(9);
    const f = freezeState(c);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.entries)).toBe(true);
    expect(Object.isFrozen(f.entries['f'])).toBe(true);
  });
});

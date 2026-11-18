import type { ObservedEvent } from '@ghost-run/core';
import { describe, expect, it } from 'vitest';
import {
  EventBuilder,
  PAYLOAD_CAPTURE_CAP_BYTES,
  type PayloadBody,
} from '../src/recorder/events.js';

// Validates: Requirements 8.14, 8.15

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const net = (stepIndex: number, destination: string): ObservedEvent => ({
  kind: 'network-attempt',
  destination,
  stepIndex,
});
const secret = (stepIndex: number, path: string): ObservedEvent => ({
  kind: 'secret-read',
  path,
  stepIndex,
});
const body = (stepIndex: number, destination: string, s: string | Uint8Array): PayloadBody => ({
  stepIndex,
  destination,
  body: typeof s === 'string' ? enc(s) : s,
});

describe('EventBuilder eventId assignment', () => {
  const events = [
    net(0, 'a.example'),
    secret(0, '.env'),
    net(1, 'b.example'),
    net(2, 'c.example'),
  ];
  const bodies = [body(0, 'a.example', 'sk-CANARY-abc123'), body(2, 'c.example', 'x')];

  it('assigns unique ids within a run, even across several build calls', () => {
    const b = new EventBuilder();
    const r1 = b.build(events, bodies);
    const r2 = b.build(events, bodies);
    const ids = [...r1.events, ...r2.events].flatMap((e) => (e.eventId ? [e.eventId] : []));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('keeps payloads keys in one-to-one correspondence with events that have an eventId', () => {
    const { events: out, payloads } = new EventBuilder().build(events, bodies);
    const ids = out.flatMap((e) => (e.eventId ? [e.eventId] : []));
    expect([...payloads.keys()].sort()).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets no eventId on events without a capture, including secret-reads', () => {
    const { events: out } = new EventBuilder().build(events, [
      ...bodies,
      body(0, 'unmatched.example', 'dropped'),
      { stepIndex: 0, destination: '.env', body: enc('x') },
    ]);
    expect(out[0]?.eventId).toBeDefined();
    expect(out[1]).not.toHaveProperty('eventId');
    expect(out[2]).not.toHaveProperty('eventId');
    expect(out[3]?.eventId).toBeDefined();
  });

  it('creates no payloads or ids when there are no bodies', () => {
    const { events: out, payloads } = new EventBuilder().build(events, []);
    expect(payloads.size).toBe(0);
    expect(out).toEqual(events);
  });

  it('merges repeated requests to one destination in a step into one capture, in arrival order', () => {
    const { events: out, payloads } = new EventBuilder().build(
      [net(0, 'a.example'), net(1, 'a.example')],
      [body(0, 'a.example', 'one-'), body(1, 'a.example', 'other'), body(0, 'a.example', 'two')],
    );
    expect(payloads.size).toBe(2);
    const id0 = out[0]?.eventId as string;
    const id1 = out[1]?.eventId as string;
    expect(new TextDecoder().decode(payloads.get(id0))).toBe('one-two');
    expect(new TextDecoder().decode(payloads.get(id1))).toBe('other');
  });

  it('caps the concatenated capture at 64 KiB', () => {
    const big = new Uint8Array(PAYLOAD_CAPTURE_CAP_BYTES - 10).fill(1);
    const { events: out, payloads } = new EventBuilder().build(
      [net(0, 'a.example')],
      [body(0, 'a.example', big), body(0, 'a.example', new Uint8Array(100).fill(2)), body(0, 'a.example', 'z')],
    );
    expect(PAYLOAD_CAPTURE_CAP_BYTES).toBe(65536);
    const cap = payloads.get(out[0]?.eventId as string) as Uint8Array;
    expect(cap.length).toBe(PAYLOAD_CAPTURE_CAP_BYTES);
    expect(cap[PAYLOAD_CAPTURE_CAP_BYTES - 11]).toBe(1);
    expect(cap[PAYLOAD_CAPTURE_CAP_BYTES - 10]).toBe(2);
    expect(cap[PAYLOAD_CAPTURE_CAP_BYTES - 1]).toBe(2);
  });

  it('does not change ids when payload content changes', () => {
    const a = new EventBuilder().build(events, bodies);
    const b = new EventBuilder().build(events, [
      body(0, 'a.example', 'sk-CANARY-different-and-longer'),
      body(2, 'c.example', ''),
    ]);
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
  });

  it('does not change ids when the plan (event details) changes', () => {
    const a = new EventBuilder().build(events, bodies);
    const other = [
      net(0, 'a.example'),
      secret(0, 'other/.env'),
      net(1, 'zzz.example'),
      net(2, 'c.example'),
    ];
    const b = new EventBuilder().build(other, bodies);
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
  });

  it('assigns ids in event order starting at ev-0, independent of body order', () => {
    const { events: out } = new EventBuilder().build(events, [...bodies].reverse());
    expect(out[0]?.eventId).toBe('ev-0');
    expect(out[3]?.eventId).toBe('ev-1');
  });
});

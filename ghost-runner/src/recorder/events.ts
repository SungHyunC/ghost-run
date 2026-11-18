import type { ObservedEvent } from '@ghost-run/core';

/** Raw observation produced by the parsers, before mapping to core events. */
export type RawObservation =
  | { readonly kind: 'network-attempt'; readonly stepIndex: number; readonly destination: string }
  | { readonly kind: 'secret-read'; readonly stepIndex: number; readonly path: string };

/**
 * Collects recorder observations into core ObservedEvents. At most one event
 * per distinct (stepIndex, destination) or (stepIndex, path). Deduplication is
 * limited to the recorder; static Effects are never merged in (decision 5).
 */
export class EventCollector {
  private readonly seen = new Set<string>();
  private readonly list: ObservedEvent[] = [];

  add(obs: RawObservation): ObservedEvent | undefined {
    const key =
      obs.kind === 'network-attempt'
        ? `n\u0000${obs.stepIndex}\u0000${obs.destination}`
        : `s\u0000${obs.stepIndex}\u0000${obs.path}`;
    if (this.seen.has(key)) return undefined;
    this.seen.add(key);
    const event: ObservedEvent =
      obs.kind === 'network-attempt'
        ? { kind: 'network-attempt', destination: obs.destination, stepIndex: obs.stepIndex }
        : { kind: 'secret-read', path: obs.path, stepIndex: obs.stepIndex };
    this.list.push(event);
    return event;
  }

  events(): readonly ObservedEvent[] {
    return [...this.list];
  }
}

/** Map observations to events, de-duplicated within the recorder only. */
export function toObservedEvents(observations: readonly RawObservation[]): readonly ObservedEvent[] {
  const c = new EventCollector();
  for (const o of observations) c.add(o);
  return c.events();
}

/** Detection source recorded in diagnostics only (Req 8.9). Never part of the core ObservedEvent. */
export type DetectionSource = 'dns' | 'http' | 'tls-sni' | 'tcp' | 'strace-connect' | 'strace-openat';

/** A raw observation together with the source that detected it. */
export type SourcedObservation = RawObservation & { readonly source: DetectionSource };

/** Metadata of a captured payload. Bytes are held elsewhere, in memory only (Req 8.11). */
export interface PayloadCaptureMeta {
  readonly stepIndex: number;
  readonly destination: string;
  readonly source: 'http' | 'tls-sni';
  readonly byteLength: number;
  readonly sha256: string;
}

/** A captured request body for one (stepIndex, destination), in arrival order. Memory only. */
export interface PayloadBody {
  readonly stepIndex: number;
  readonly destination: string;
  readonly body: Uint8Array;
}

/** Cap for the capture stored under one eventId (Req 8.11). */
export const PAYLOAD_CAPTURE_CAP_BYTES = 64 * 1024;

/** Events and payloads built together, so every payloads key is the eventId of exactly one event. */
export interface EventsWithPayloads {
  readonly events: readonly ObservedEvent[];
  readonly payloads: ReadonlyMap<string, Uint8Array>;
}

/**
 * Per-run eventId assignment. Create one builder per run. Ids are `ev-<n>`, n from 0 in
 * event order, handed out only when a payload is attached; never derived from the plan or
 * the payload. Several bodies for one (stepIndex, destination) are appended in arrival
 * order into one capture capped at 64 KiB. Secret-read events never get a payload, and
 * bodies matching no network-attempt event are dropped.
 */
export class EventBuilder {
  private counter = 0;

  build(events: readonly ObservedEvent[], bodies: readonly PayloadBody[]): EventsWithPayloads {
    const parts = new Map<string, Uint8Array[]>();
    for (const b of bodies) {
      const key = `${b.stepIndex}\u0000${b.destination}`;
      const list = parts.get(key);
      if (list === undefined) parts.set(key, [b.body]);
      else list.push(b.body);
    }
    const payloads = new Map<string, Uint8Array>();
    const out: ObservedEvent[] = [];
    for (const ev of events) {
      const list =
        ev.kind === 'network-attempt' && ev.destination !== undefined
          ? parts.get(`${ev.stepIndex}\u0000${ev.destination}`)
          : undefined;
      if (list === undefined) {
        out.push(ev);
        continue;
      }
      parts.delete(`${ev.stepIndex}\u0000${ev.destination}`);
      const buf = new Uint8Array(Math.min(PAYLOAD_CAPTURE_CAP_BYTES, list.reduce((n, p) => n + p.length, 0)));
      let off = 0;
      for (const p of list) {
        if (off >= buf.length) break;
        const slice = p.subarray(0, buf.length - off);
        buf.set(slice, off);
        off += slice.length;
      }
      const eventId = `ev-${this.counter++}`;
      payloads.set(eventId, buf);
      out.push({ ...ev, eventId });
    }
    return { events: out, payloads };
  }
}

/** Maps an allocated loopback address back to its hostname. */
export type HostLookup = (address: string) => string | undefined;

/** De-duplicates sourced observations per (stepIndex, destination) or (stepIndex, path); first wins. */
export class SourcedCollector {
  private readonly seen = new Set<string>();
  private readonly list: SourcedObservation[] = [];

  add(obs: SourcedObservation): boolean {
    const key =
      obs.kind === 'network-attempt'
        ? `n\u0000${obs.stepIndex}\u0000${obs.destination}`
        : `s\u0000${obs.stepIndex}\u0000${obs.path}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.list.push(obs);
    return true;
  }

  observations(): readonly SourcedObservation[] {
    return [...this.list];
  }
}

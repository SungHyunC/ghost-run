import type { ObservedEvent } from '@ghost-run/core';
import { OUTPUT_MAX, PAYLOAD_MAX } from './shell/limits.js';
import { copyBytes } from './state.js';

export interface StepRecord {
  readonly stepIndex: number;
  readonly command: string;
  /** 0, 1, 7 (curl), 26 (curl file), 127 (unsupported). */
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly unsupported: boolean;
  readonly unsupportedReason?: string;
  readonly watchdog: boolean;
}

export interface Trace {
  readonly steps: readonly StepRecord[];
  /** Chronological; deduped per (stepIndex, destination) and (stepIndex, path). */
  readonly events: readonly ObservedEvent[];
  /** eventId -> bytes, at most 65,536 each. */
  readonly payloads: ReadonlyMap<string, Uint8Array>;
  readonly watchdogFired: boolean;
  readonly readCoverage: 'complete' | 'partial';
}

export const TRUNCATION_MARKER = '[truncated]';

export function emptyTrace(): Trace {
  return { steps: [], events: [], payloads: new Map(), watchdogFired: false, readCoverage: 'complete' };
}

/** Cut text to OUTPUT_MAX code points, then append the marker. */
export function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_MAX) return text; // UTF-16 length bounds the code point count from above
  const points = Array.from(text);
  if (points.length <= OUTPUT_MAX) return text;
  return points.slice(0, OUTPUT_MAX).join('') + TRUNCATION_MARKER;
}

function concatCut(a: Uint8Array, b: Uint8Array): Uint8Array {
  const room = Math.max(0, PAYLOAD_MAX - a.byteLength);
  const take = Math.min(room, b.byteLength);
  const out = new Uint8Array(a.byteLength + take);
  out.set(a, 0);
  out.set(b.subarray(0, take), a.byteLength);
  return out;
}

export class TraceBuilder {
  private readonly steps: StepRecord[];
  private events: ObservedEvent[];
  private readonly payloads: Map<string, Uint8Array>;
  private watchdog: boolean;
  private coverage: 'complete' | 'partial';

  constructor(previous?: Trace) {
    this.steps = previous ? [...previous.steps] : [];
    this.events = previous ? [...previous.events] : [];
    this.payloads = new Map(previous ? previous.payloads : []);
    this.watchdog = previous?.watchdogFired ?? false;
    this.coverage = previous?.readCoverage ?? 'complete';
  }

  /** Append a step; stdout and stderr are truncated. */
  addStep(record: StepRecord): void {
    this.steps.push({
      ...record,
      stdout: truncateOutput(record.stdout),
      stderr: truncateOutput(record.stderr),
    });
    if (record.watchdog) this.watchdog = true;
  }

  /** Record a secret-file read; deduped per (stepIndex, path). */
  recordRead(stepIndex: number, path: string): void {
    const seen = this.events.some(
      (e) => e.kind === 'secret-read' && e.stepIndex === stepIndex && e.path === path,
    );
    if (!seen) this.events.push({ kind: 'secret-read', path, stepIndex });
  }

  /**
   * Record a network attempt. A second request to the same destination in the
   * same step merges into the first event: the body is appended to the first
   * payload (cut at 65,536 bytes) and the first event gains an eventId if needed.
   */
  recordNetwork(stepIndex: number, destination: string, body?: Uint8Array): void {
    const index = this.events.findIndex(
      (e) => e.kind === 'network-attempt' && e.stepIndex === stepIndex && e.destination === destination,
    );
    if (index < 0) {
      if (body === undefined) {
        this.events.push({ kind: 'network-attempt', destination, stepIndex });
        return;
      }
      const eventId = this.nextEventId();
      this.payloads.set(eventId, copyBytes(body).subarray(0, PAYLOAD_MAX));
      this.events.push({ kind: 'network-attempt', destination, stepIndex, eventId });
      return;
    }
    if (body === undefined) return;
    const first = this.events[index] as ObservedEvent;
    if (first.eventId === undefined) {
      const eventId = this.nextEventId();
      this.payloads.set(eventId, copyBytes(body).subarray(0, PAYLOAD_MAX));
      this.events[index] = { ...first, eventId };
      return;
    }
    const old = this.payloads.get(first.eventId) ?? new Uint8Array(0);
    this.payloads.set(first.eventId, concatCut(old, body));
  }

  markWatchdog(): void {
    this.watchdog = true;
  }

  markPartialCoverage(): void {
    this.coverage = 'partial';
  }

  build(): Trace {
    return {
      steps: [...this.steps],
      events: [...this.events],
      payloads: new Map(this.payloads),
      watchdogFired: this.watchdog,
      readCoverage: this.coverage,
    };
  }

  private nextEventId(): string {
    return `evt-${this.payloads.size + 1}`;
  }
}

import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/wards.js';
import type { GhostReport, ObservedEvent, Ward } from '../src/types.js';

const ward: Ward = {
  id: 'no-exfil',
  kind: 'egress',
  secrets: ['.env'],
  allow_hosts: ['registry.npmjs.org', '*.example.test'],
};

function report(events: ObservedEvent[]): GhostReport<unknown> {
  return { observedEvents: events, changes: [], effectsOutside: [], variantResults: [] } as unknown as GhostReport<unknown>;
}
const run = (events: ObservedEvent[], w: Ward = ward) =>
  WardEngine.evaluate(report(events), { wards: [w] });

describe('egress ward (task 4.3)', () => {
  it('blocks a network attempt in the same step as the secret read (>=)', () => {
    const v = run([
      { kind: 'secret-read', path: 'app/../.env', stepIndex: 2 },
      { kind: 'network-attempt', destination: 'https://setup-check.example/x', stepIndex: 2 },
    ]);
    expect(v.verdict).toBe('block');
    expect(v.violations.map((x) => x.reason)).toEqual([
      'network attempt to setup-check.example at step 2 after secret read at step 2; host not in allow_hosts',
    ]);
  });

  it('ignores attempts before the first read and allowed hosts, and warns only without a read', () => {
    const v = run([
      { kind: 'network-attempt', destination: 'evil.example', stepIndex: 0 },
      { kind: 'secret-read', path: '.env', stepIndex: 1 },
      { kind: 'network-attempt', destination: 'HTTPS://Registry.NPMJS.org.:443/a', stepIndex: 1 },
      { kind: 'network-attempt', destination: 'a.example.test', stepIndex: 3 },
    ]);
    expect(v.violations).toEqual([]);
    const w = run([{ kind: 'network-attempt', destination: 'evil.example', stepIndex: 0 }]);
    expect(w.verdict).toBe('warn');
  });

  it('does not allow a wildcard host to match its bare suffix or deeper labels', () => {
    const v = run([
      { kind: 'secret-read', path: '.env', stepIndex: 0 },
      { kind: 'network-attempt', destination: 'example.test', stepIndex: 1 },
      { kind: 'network-attempt', destination: 'a.b.example.test', stepIndex: 1 },
    ]);
    expect(v.violations).toHaveLength(2);
  });

  it('blocks a missing destination as unknown', () => {
    const v = run([
      { kind: 'secret-read', path: '.env', stepIndex: 0 },
      { kind: 'network-attempt', stepIndex: 1 },
    ]);
    expect(v.violations[0]?.reason).toContain('network attempt to (unknown) at step 1');
  });

  it('matches descendants of a secret directory', () => {
    const v = run(
      [
        { kind: 'secret-read', path: '.ssh/id_rsa', stepIndex: 0 },
        { kind: 'network-attempt', destination: '192.0.2.7', stepIndex: 0 },
      ],
      { ...ward, secrets: ['.ssh'] },
    );
    expect(v.verdict).toBe('block');
  });

  it('sorts, caps at 20, and adds a "more" violation', () => {
    const events: ObservedEvent[] = [{ kind: 'secret-read', path: '.env', stepIndex: 0 }];
    for (let i = 24; i >= 0; i--) {
      events.push({ kind: 'network-attempt', destination: `h${String(i).padStart(2, '0')}.example`, stepIndex: 1 });
    }
    const v = run(events);
    expect(v.violations).toHaveLength(21);
    expect(v.violations[0]?.reason).toContain('h00.example');
    expect(v.violations[19]?.reason).toContain('h19.example');
    expect(v.violations[20]?.reason).toBe('5 more network attempts not listed');
  });
});

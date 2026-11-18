import { describe, expect, it } from 'vitest';
import { buildRedThreadModel } from '../../src/model/thread';
import type { RedThreadModel } from '../../src/model/thread';

function build(input: unknown): RedThreadModel {
  const m = buildRedThreadModel(input);
  if (m.kind !== 'ok') throw new Error('expected ok');
  return m;
}

const needle = (value: string, stepIndex = 2) => ({ value, origin: 'effect', stepIndex });
const found = (over: Record<string, unknown> = {}) => ({
  status: 'found',
  needle: needle('ignored.example'),
  matchedKey: 'value',
  source: 'README.md',
  kind: 'file',
  recordIndex: 0,
  line: 3,
  column: 9,
  lineText: 'visit setup-check.example',
  hidden: false,
  ...over,
});

describe('buildRedThreadModel', () => {
  it('builds a found thread with name and cause end', () => {
    const m = build({ needles: [needle('setup-check.example')], links: [found({ matchedKey: 'host', hidden: true })], actionLabels: ['a', 'b', 'curl'] });
    const t = m.threads[0]!;
    expect(t.accessibleName).toBe('Red thread: setup-check.example at step 2 to README.md line 3 column 9');
    expect(t.action).toMatchObject({ stepText: 'step 2', origin: 'effect', actionLabel: 'curl' });
    expect(t.cause).toMatchObject({ position: '3:9', matchedHost: true, hidden: true, kind: 'file' });
    expect(m.mismatch).toBeNull();
    expect(m.emptyText).toBeNull();
  });

  it('builds a not-found thread without a cause', () => {
    const t = build({ needles: [needle('x')], links: [{ status: 'not-found', needle: needle('x') }] }).threads[0]!;
    expect(t.cause).toBeNull();
    expect(t.notFoundText).toContain('Not found does not mean safe.');
    expect(t.accessibleName).toBe('Red thread: x at step 2, no cause found');
  });

  it('pairs by index, not by links[i].needle, and reports a mismatch', () => {
    const m = build({ needles: [needle('a'), needle('b'), needle('c')], links: [found({ needle: needle('zzz') })] });
    expect(m.threads).toHaveLength(1);
    expect(m.threads[0]!.action?.value).toBe('a');
    expect(m.mismatch).toBe('Red thread data mismatch: 3 needles, 1 links.');
  });

  it('shows the empty text and escapes hidden code points', () => {
    expect(build({ needles: [], links: [] }).emptyText).toBe('No addresses or paths to trace.');
    const t = build({ needles: [needle('a\u200Bb')], links: [found({ lineText: 'x\u202Ey' })] }).threads[0]!;
    expect(t.action?.value).toBe('a<U+200B>b');
    expect(t.cause?.lineText).toBe('x<U+202E>y');
  });

  it('turns malformed elements into unreadable slots and bad input into unreadable', () => {
    const m = build({ needles: [needle('a'), null], links: [found({ line: 'x' }), found()] });
    expect(m.threads.map((t) => t.unreadable)).toEqual([true, true]);
    expect(m.threads[1]!.accessibleName).toBe('Unreadable item 1');
    expect(buildRedThreadModel({ needles: 1, links: [] }).kind).toBe('unreadable');
    expect(buildRedThreadModel(null).kind).toBe('unreadable');
  });
});

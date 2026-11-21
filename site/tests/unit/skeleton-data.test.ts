import { describe, expect, it } from 'vitest';
import { PARTS_MATRIX, PART_NAMES } from '../../src/data/parts-matrix';
import { COSTUME_CARDS, SKELETON_PARTS, SPEC_NAMES, WORLD_FUNCTIONS } from '../../src/data/skeleton';

describe('skeleton data', () => {
  it('lists the eight parts in order with the deck lines and no folders', () => {
    expect(SKELETON_PARTS.map((p) => ({ ...p }))).toEqual([
      { name: 'Mirror', line: 'Copy and compare' },
      { name: 'Ghost', line: 'Try the plan on the copy' },
      { name: 'Wards', line: 'Rules that say no' },
      { name: 'Candle', line: 'Go, ask, or stop' },
      { name: 'Blacklight', line: 'Find hidden instructions' },
      { name: 'Graveyard', line: 'Remember stopped plans' },
      { name: 'Kiro hook', line: 'Stop risky commands in Kiro' },
      { name: 'world-smith', line: 'A Kiro agent that builds worlds' },
    ]);
  });

  it('lists the six World functions and six spec names in order', () => {
    expect(WORLD_FUNCTIONS.map((f) => [f.name, f.line])).toEqual([
      ['snapshot', 'copy reality'],
      ['step', 'try one action'],
      ['diff', 'what changed'],
      ['render', 'draw it'],
      ['fingerprint', 'prove reality is untouched'],
      ['effectsOutside', 'what leaves the box'],
    ]);
    expect([...SPEC_NAMES]).toEqual(['core-contract', 'ghost-runner', 'wards', 'possession', 'ui-kit', 'kiro-integration']);
  });

  it('has three costume cards with the deck fields', () => {
    expect(
      COSTUME_CARDS.map((c) => [
        c.id,
        c.name,
        c.costume,
        c.world,
        `${c.provenance.prefix} ${c.provenance.code}`,
        c.link.text,
        c.link.href,
      ]),
    ).toEqual([
      ['shell', 'Ghost Shell', 'Hacker hoodie', 'Files + SQLite', 'Kiro spec: ghost-shell', 'Open Ghost Shell →', 'shell/'],
      ['hand', 'Ghost Hand', 'Robot suit', 'Robot arm, 8 haunted copies', 'Kiro spec: ghost-hand', 'Open Ghost Hand →', 'hand/'],
      ['cloud', 'Ghost Cloud', 'Cloud + bucket hat', 'S3 buckets in memory', 'Kiro agent: world-smith', 'How it was made →', '#make'],
    ]);
  });

  it('holds the parts matrix of Requirement 7', () => {
    expect([...PART_NAMES]).toEqual(['mirror', 'ghost', 'wards', 'candle', 'blacklight', 'graveyard']);
    const row = (id: 'shell' | 'hand' | 'cloud') => PART_NAMES.map((p) => PARTS_MATRIX[id][p]);
    expect(row('shell')).toEqual([true, true, true, true, true, true]);
    expect(row('hand')).toEqual([false, true, true, true, false, true]);
    expect(row('cloud')).toEqual([false, true, true, false, false, false]);
  });
});

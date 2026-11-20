import { describe, expect, it } from 'vitest';
import { PARTS_MATRIX, PART_NAMES } from '../../src/data/parts-matrix';
import { COSTUME_CARDS, SKELETON_PARTS, SPEC_NAMES, WORLD_FUNCTIONS } from '../../src/data/skeleton';

describe('skeleton data', () => {
  it('lists the eight parts in order with their lines and folders', () => {
    expect(SKELETON_PARTS.map((p) => [p.name, p.line, [...p.folders]])).toEqual([
      ['Mirror', 'Copies the world. Shows before and after.', ['core/', 'ui/']],
      ['Ghost', 'Runs the plan on the copy, in a Docker box for real files.', ['core/', 'ghost-runner/']],
      ['Wards', 'Your rules in wards.yaml: what must never happen.', ['core/', 'wards-config/']],
      ['Candle', 'Lit: go. Flickering: ask a human. Out: stop.', ['ui/']],
      ['Blacklight', 'Finds instructions hidden in what the agent read.', ['core/', 'ui/']],
      ['Graveyard', 'Keeps every stopped plan and the reason.', ['ui/']],
      ['Kiro hook', 'ghost-gate stops a risky command before Kiro runs it.', ['integrations/']],
      ['world-smith', 'A Kiro agent that builds a new world with you.', ['.kiro/agents/']],
    ]);
  });

  it('lists the six World functions and six spec names in order', () => {
    expect(WORLD_FUNCTIONS.map((f) => [f.name, f.line])).toEqual([
      ['snapshot', 'copy reality'],
      ['step', 'try one action on the copy'],
      ['diff', 'what changed'],
      ['render', 'draw it for the screens'],
      ['fingerprint', 'prove reality stayed the same'],
      ['effectsOutside', 'what would leave the box'],
    ]);
    expect([...SPEC_NAMES]).toEqual(['core-contract', 'ghost-runner', 'wards', 'possession', 'ui-kit', 'kiro-integration']);
  });

  it('has three costume cards with tags, links, and provenance', () => {
    expect(COSTUME_CARDS.map((c) => [c.id, c.tag, c.name, c.folder, c.link.text, c.link.href, c.provenance.code])).toEqual([
      ['shell', 'App 1', 'Ghost Shell', 'worlds/playground-shell', 'Open Ghost Shell →', 'shell/', 'ghost-shell'],
      ['hand', 'App 2', 'Ghost Hand', 'worlds/drawer-arm', 'Open Ghost Hand →', 'hand/', 'ghost-hand'],
      ['cloud', '3rd world', 'Ghost Cloud', 'worlds/ghost-cloud', 'How it was made →', '#make', 'world-smith'],
    ]);
    expect(COSTUME_CARDS[2]?.usedTitle).toBe('Skeleton parts it uses (no screen yet)');
    expect(COSTUME_CARDS.some((c) => /\d{3}/.test(c.world))).toBe(false);
  });

  it('holds the parts matrix of Requirement 7', () => {
    expect([...PART_NAMES]).toEqual(['mirror', 'ghost', 'wards', 'candle', 'blacklight', 'graveyard']);
    const row = (id: 'shell' | 'hand' | 'cloud') => PART_NAMES.map((p) => PARTS_MATRIX[id][p]);
    expect(row('shell')).toEqual([true, true, true, true, true, true]);
    expect(row('hand')).toEqual([false, true, true, true, false, true]);
    expect(row('cloud')).toEqual([false, true, true, false, false, false]);
  });
});

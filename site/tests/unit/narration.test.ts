import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import runsJson from '../../src/data/runs.json';
import { NARRATION, narration } from '../../src/data/narration';
import type { RunsFile, WorldRecord } from '../../src/data/types';
import type { Segment } from '../../src/engine/types';
import { WORLDS } from '../../src/config';

const runs = runsJson as unknown as RunsFile;
const text = (segs: Segment[]): string => segs.map((s) => s.text).join('');

describe('narration', () => {
  it('has a template for every world and step', () => {
    for (const w of WORLDS) {
      expect(NARRATION[w]).toHaveLength(5);
      for (let step = 0; step < 5; step++) {
        const segs = narration(runs.worlds[w], step);
        expect(segs.length).toBeGreaterThan(1);
        expect(segs[0]?.kind).toBe('b');
        expect(() => narration(runs.worlds[w], 5)).toThrow();
      }
    }
  });

  it('fills the number slots from the committed runs.json', () => {
    expect(text(narration(runs.worlds.shell, 1))).toBe(
      "Run. I type the agent's command on my copy… poof! 1,206 users are gone, but only in the copy.",
    );
    expect(text(narration(runs.worlds.shell, 2))).toContain('allows 0 lost rows. My copy lost 1,206.');
    expect(text(narration(runs.worlds.shell, 4))).toContain('0 rows lost, so the candle is lit.');
    expect(text(narration(runs.worlds.hand, 0))).toContain('into 8 haunted variants');
    expect(text(narration(runs.worlds.hand, 1))).toBe(
      "Run. Eight ghost arms try fast pull at once. One of them can't finish.",
    );
    expect(text(narration(runs.worlds.hand, 2))).toContain('needs 95% success. We got 7 of 8.');
    expect(text(narration(runs.worlds.hand, 4))).toContain('All 8 ghosts succeed under 30 N');
    expect(text(narration(runs.worlds.cloud, 0))).toContain('3 buckets and 7 objects');
    expect(text(narration(runs.worlds.cloud, 1))).toContain('prod-assets and its 3 objects are gone');
    expect(text(narration(runs.worlds.cloud, 2))).toContain('never delete prod-*');
    expect(text(narration(runs.worlds.cloud, 4))).toContain('tmp-build-cache is not protected');
  });

  it('follows the record when a number changes', () => {
    const shell: WorldRecord = structuredClone(runs.worlds.shell);
    shell.plan.facts['rowsLost'] = 2500;
    expect(text(narration(shell, 1))).toContain('2,500 users are gone');
  });

  it('holds no digit in a string literal of the template source', () => {
    const src = readFileSync(new URL('../../src/data/narration.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))
      .join('\n');
    const literals = src.match(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g) ?? [];
    const withLiteralTextOnly = literals.map((l) => l.replace(/\$\{[^}]*\}/g, ''));
    for (const l of withLiteralTextOnly) expect(l).not.toMatch(/\d/);
  });

  it('contains no markup characters in any segment', () => {
    for (const w of WORLDS) {
      for (let step = 0; step < 5; step++) {
        for (const seg of narration(runs.worlds[w], step)) {
          expect(seg.text).not.toMatch(/[<>&]/);
          expect(['text', 'b', 'code']).toContain(seg.kind);
        }
      }
    }
  });
});

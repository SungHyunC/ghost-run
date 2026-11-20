import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXED, PRESETS, isKnown } from '../../src/live/presets';
import type { LiveInput } from '../../src/live/types';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');
const planCommands = (p: string): string[] =>
  (JSON.parse(read(p)) as { actions: { command: string }[] }).actions.map((a) => a.command);
const demoLines = (p: string): string[] =>
  read(p)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
const byLabel = (label: string) => {
  const p = Object.values(PRESETS)
    .flat()
    .find((x) => x.label === label);
  if (!p) throw new Error(`no preset ${label}`);
  return p;
};

describe('live presets', () => {
  it('has nine Presets in the order of Requirement 8', () => {
    expect(PRESETS.shell.map((p) => p.label)).toEqual(['DROP TABLE users', 'rm -rf ./data ./build', 'npm test']);
    expect(PRESETS.hand.map((p) => p.label)).toEqual(['fast pull', 'slow pull, gentle grip', 'strong grip']);
    expect(PRESETS.cloud.map((p) => p.label)).toEqual(['delete prod-assets', 'make it public', 'delete tmp-build-cache']);
  });

  it('reads each Preset input from its file', () => {
    expect(byLabel('DROP TABLE users').input).toEqual({
      world: 'shell',
      actions: planCommands('apps/ghost-shell/plans/scenario-1.json'),
    });
    expect(byLabel('DROP TABLE users').input).toEqual({ world: 'shell', actions: ['sqlite3 app.db "DROP TABLE users;"'] });
    expect(byLabel('rm -rf ./data ./build').input).toEqual({
      world: 'shell',
      actions: planCommands('apps/ghost-shell/plans/scenario-2.json'),
    });
    expect(byLabel('npm test').input).toEqual({
      world: 'shell',
      actions: planCommands('apps/ghost-shell/plans/scenario-4.json'),
    });
    expect(byLabel('delete prod-assets').input).toEqual({
      world: 'cloud',
      lines: demoLines('worlds/ghost-cloud/demo/01-delete-protected-bucket.txt'),
    });
    expect(byLabel('delete tmp-build-cache').input).toEqual({
      world: 'cloud',
      lines: demoLines('worlds/ghost-cloud/demo/03-delete-temporary-bucket.txt'),
    });
    expect(byLabel('make it public').input).toEqual({
      world: 'cloud',
      lines: ['aws s3api put-bucket-acl --bucket prod-assets --acl public-read'],
    });
  });

  it('reads each Fixed_Plan from its file', () => {
    expect(byLabel('DROP TABLE users').fix).toEqual({
      world: 'shell',
      actions: planCommands('apps/ghost-shell/plans/scenario-1-fixed.json'),
    });
    expect(byLabel('rm -rf ./data ./build').fix).toEqual({
      world: 'shell',
      actions: planCommands('apps/ghost-shell/plans/scenario-2-fixed.json'),
    });
    expect(byLabel('fast pull').fix).toEqual(byLabel('slow pull, gentle grip').input);
    expect(byLabel('delete prod-assets').fix).toEqual(byLabel('delete tmp-build-cache').input);
  });

  it('gives a fix to the four named Presets only', () => {
    const withFix = Object.values(PRESETS)
      .flat()
      .filter((p) => p.fix !== null)
      .map((p) => p.label);
    expect(withFix).toEqual(['DROP TABLE users', 'rm -rf ./data ./build', 'fast pull', 'delete prod-assets']);
    expect(Object.keys(FIXED)).toHaveLength(4);
  });

  it('holds the Hand values of the brief', () => {
    const h = (l: string) => byLabel(l).input as Extract<LiveInput, { world: 'hand' }>;
    expect([h('fast pull').speed, h('fast pull').force, h('fast pull').distance]).toEqual([0.6, 20, 0.2]);
    const s = h('slow pull, gentle grip');
    expect([s.speed, s.force, s.distance]).toEqual([0.15, 15, 0.15]);
    const g = h('strong grip');
    expect([g.speed, g.force, g.distance]).toEqual([0.3, 38, 0.2]);
  });

  it('isKnown is exact', () => {
    for (const p of Object.values(PRESETS).flat()) expect(isKnown(p.input, p)).toBe(true);
    const drop = byLabel('DROP TABLE users');
    expect(isKnown({ world: 'shell', actions: ['sqlite3 app.db "DROP TABLE users"'] }, drop)).toBe(false);
    const cloud = byLabel('delete prod-assets');
    expect(isKnown({ world: 'cloud', lines: ['aws s3 rb s3://prod-assets --forc'] }, cloud)).toBe(false);
    const fast = byLabel('fast pull');
    expect(isKnown({ world: 'hand', speed: 0.59, force: 20, distance: 0.2 }, fast)).toBe(false);
    expect(isKnown({ world: 'hand', speed: 0.6, force: 19, distance: 0.2 }, fast)).toBe(false);
    expect(isKnown({ world: 'hand', speed: 0.6, force: 20, distance: 0.19 }, fast)).toBe(false);
    expect(isKnown({ world: 'hand', speed: 0.6, force: 20, distance: 0.2 }, drop)).toBe(false);
  });
});

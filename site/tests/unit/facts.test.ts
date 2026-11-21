import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWards } from '@ghost-run/wards-config';
import type { Ward } from '@ghost-run/core';
import { describe, expect, it } from 'vitest';
import { createFixture } from '../../../worlds/ghost-cloud/src/fixture';
import { SKELETON_PARTS, SPEC_NAMES } from '../../src/data/skeleton';
import { toWalkRuns } from '../../src/data/walk-records';
import type { RunsFile } from '../../src/data/types';

const SITE = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = join(SITE, '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const runs = toWalkRuns(JSON.parse(read('site/src/data/runs.json')) as RunsFile);

function loadWard(rel: string, id: string): Ward {
  const parsed = parseWards(read(rel));
  if (!parsed.ok) throw new Error(`${rel} does not parse`);
  const ward = parsed.wardSet.wards.find((w) => w.id === id);
  if (ward === undefined) throw new Error(`ward ${id} not found in ${rel}`);
  return ward;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|css|json)$/.test(name) ? [full] : [];
  });
}

describe('facts: folders and files named on the page', () => {
  it('has a folder for every skeleton part that the deck still names', () => {
    expect(SKELETON_PARTS).toHaveLength(8);
    for (const folder of ['core', 'ui', 'ghost-runner', 'wards-config', 'integrations', '.kiro/agents']) {
      expect(statSync(join(ROOT, folder)).isDirectory(), folder).toBe(true);
    }
  });

  it('has every world folder (Requirement 8, criterion 1)', () => {
    for (const folder of ['worlds/playground-shell', 'worlds/drawer-arm', 'worlds/ghost-cloud']) {
      expect(statSync(join(ROOT, folder)).isDirectory(), folder).toBe(true);
    }
  });

  it('names only specs that are folders of .kiro/specs/ and has the world-smith agent', () => {
    expect(SPEC_NAMES).toHaveLength(6);
    for (const name of SPEC_NAMES) {
      expect(statSync(join(ROOT, '.kiro/specs', name)).isDirectory(), name).toBe(true);
    }
    expect(existsSync(join(ROOT, '.kiro/agents/world-smith.json'))).toBe(true);
  });
});

describe('facts: plans equal the repository files (Requirement 8, criterion 2)', () => {
  const shellCommands = (file: string): string[] =>
    (JSON.parse(read(`apps/ghost-shell/plans/${file}`)) as { actions: { command: string }[] }).actions.map(
      (a) => a.command,
    );
  const handName = (file: string): string => (JSON.parse(read(`apps/ghost-hand/plans/${file}`)) as { name: string }).name;
  const cloudCommand = (file: string): string => read(`worlds/ghost-cloud/demo/${file}`).trim();

  it('matches the Shell plans', () => {
    expect(runs.worlds.shell.plan.commands).toEqual(shellCommands('scenario-1.json'));
    expect(runs.worlds.shell.fixed.commands).toEqual(shellCommands('scenario-1-fixed.json'));
    expect(runs.worlds.shell.plan.commands).toEqual(['sqlite3 app.db "DROP TABLE users;"']);
    expect(runs.worlds.shell.fixed.commands).toEqual([
      'cp app.db app.db.bak',
      'sqlite3 app.db "UPDATE users SET deleted_at = 1"',
    ]);
  });

  it('matches the Hand plans', () => {
    // The recorded text is the adapter's: the slider values of the plan files (first: grip 20, pull 0.2 at 0.6).
    expect(handName('first.plan.json')).toBe('fast pull');
    expect(handName('revised.plan.json')).toBe('slow pull, gentle grip');
    expect(runs.worlds.hand.plan.commands).toEqual(['grip 20 N, pull 0.2 m at 0.6 m/s']);
    expect(runs.worlds.hand.fixed.commands).toEqual(['grip 15 N, pull 0.15 m at 0.15 m/s']);
  });

  it('matches the Cloud demo plans', () => {
    expect(runs.worlds.cloud.plan.commands).toEqual([cloudCommand('01-delete-protected-bucket.txt')]);
    expect(runs.worlds.cloud.fixed.commands).toEqual([cloudCommand('03-delete-temporary-bucket.txt')]);
    expect(runs.worlds.cloud.plan.commands).toEqual(['aws s3 rb s3://prod-assets --force']);
    expect(runs.worlds.cloud.fixed.commands).toEqual(['aws s3 rb s3://tmp-build-cache --force']);
  });
});

describe('facts: wards exist with the stated rules (Requirement 8, criterion 2)', () => {
  it('has no-data-loss as an sql ward with max_rows_lost 0 on users and orders', () => {
    const ward = loadWard('apps/ghost-shell/wards.yaml', 'no-data-loss');
    expect(ward).toMatchObject({ kind: 'sql', max_rows_lost: 0 });
    if (ward.kind !== 'sql') throw new Error('unreachable');
    expect([...ward.tables].sort()).toEqual(['orders', 'users']);
    expect(runs.worlds.shell.ward).toMatchObject({ id: 'no-data-loss', kind: 'sql' });
  });

  it('has gentle-hands as a physics ward', () => {
    const ward = loadWard('worlds/drawer-arm/wards.yaml', 'gentle-hands');
    expect(ward).toMatchObject({
      kind: 'physics',
      min_success_rate: 0.95,
      max_contact_force_n: 30,
      forbidden_contacts: ['vase'],
    });
    expect(runs.worlds.hand.ward).toMatchObject({ id: 'gentle-hands', kind: 'physics' });
  });

  it('has no-bucket-delete as a path ward that denies delete on prod-*', () => {
    const ward = loadWard('worlds/ghost-cloud/wards.yaml', 'no-bucket-delete');
    expect(ward).toMatchObject({ kind: 'path', deny: ['delete'], paths: ['prod-*'] });
    expect(runs.worlds.cloud.ward).toMatchObject({ id: 'no-bucket-delete', kind: 'path' });
  });
});

describe('facts: reality scenes (Requirement 8, criteria 3 to 5)', () => {
  it('shows the Cloud fixture of worlds/ghost-cloud/src/fixture.ts', () => {
    const fixture = createFixture();
    const expected = fixture.buckets.map((b) => ({
      name: b.name,
      objects: b.objects.map((o) => o.key),
      protected: b.name.startsWith('prod-'),
    }));
    const scene = runs.worlds.cloud.reality;
    expect(scene.kind).toBe('cloud');
    if (scene.kind !== 'cloud') throw new Error('unreachable');
    expect(scene.buckets).toEqual(expected);
    expect(expected).toHaveLength(3);
    expect(expected.reduce((n, b) => n + b.objects.length, 0)).toBe(7);
  });

  it('shows a subset of the Shell fixture and never .env content', () => {
    const scene = runs.worlds.shell.reality;
    expect(scene.kind).toBe('shell');
    if (scene.kind !== 'shell') throw new Error('unreachable');
    const project = read('apps/ghost-shell/src/scenarios/project.ts');
    expect(scene.root).toBe('project/');
    for (const e of scene.entries) {
      const key = e.name;
      expect(project, key).toMatch(new RegExp(`(^|[\\s'"])${key.replace('.', '\\.')}['"]?\\s*:`, 'm'));
    }
    expect(scene.tables).toEqual([
      { name: 'users', rows: 1206 },
      { name: 'orders', rows: 3 },
    ]);
    expect(project).toContain('tables: { orders: 3, users: 1206 }');
    const text = JSON.stringify(scene);
    expect(text).not.toContain('.env');
    expect(text).not.toContain('API_KEY');
    expect(text).not.toContain('CANARY');
    expect(JSON.stringify(runs)).not.toContain('sk-CANARY');
  });

  it('labels the Hand reality "the real arm"', () => {
    expect(runs.worlds.hand.reality).toEqual({ kind: 'hand', label: 'the real arm' });
  });
});

describe('facts: page text', () => {
  const files = sourceFiles(join(SITE, 'src'));

  it('does not claim that Ghost Cloud runs for real', () => {
    const claim = /ghost\s+cloud[^.\n]{0,60}\b(runs?|running)\s+(for\s+real|in\s+real\s+mode|against\s+(real|live)\s+aws)/i;
    const realMode = /ghost\s+cloud(?![^.\n]{0,40}\bno\s+real\s+mode)[^.\n]{0,40}\breal\s+mode\b(?![^.\n]*\bno\b)/i;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(claim.test(text), file).toBe(false);
      expect(realMode.test(text), file).toBe(false);
    }
  });

  it('has the strings "P1" to "P8" nowhere in src/', () => {
    // Exception: showcase/sample-data.ts copies the fixtures of ui/gallery/main.tsx for the real kit components,
    // and one of them is the data value `notApplicable: ['P6']`. It is kit input, not page text, and the drift
    // test against the gallery requires the same value. Every other file stays covered.
    const FIXTURE_COPY = join(SITE, 'src', 'showcase', 'sample-data.ts');
    for (const file of files.filter((f) => f !== FIXTURE_COPY)) {
      expect(/P[1-8](?![0-9A-Za-z])/.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
});

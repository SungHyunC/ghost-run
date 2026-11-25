// [docker] An action that names the Original root runs in the Copy (Requirement 2.7).
// Validates: Requirements 2.7
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRepoWorld } from '../src/world/repo-world.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, type FixtureRepo } from './fixtures/repo.js';

describeDocker('Original root mapped to the Copy in a real box', () => {
  let fixture: FixtureRepo;
  let world: ReturnType<typeof createRepoWorld>;

  beforeAll(async () => {
    fixture = await createFixtureRepo();
    world = createRepoWorld({ original: fixture.root });
  });
  afterAll(async () => {
    await world.dispose();
    fixture.cleanup();
  });

  it('cd <Original root> && <change> runs in the Copy; the Original is unchanged', async () => {
    const before = await world.fingerprint();
    const action = { command: `cd ${fixture.root} && echo changed > build/out.js && touch ${fixture.root}/build/new.txt` };
    expect(world.effectsOutside(action)).toEqual([]);

    const s0 = await world.snapshot();
    const s1 = await world.step(s0, action);
    expect(s1.result).toEqual({ success: true });
    expect(world.diff(s0, s1)).toEqual([
      { kind: 'file-created', path: 'build/new.txt', entryType: 'file' },
      { kind: 'file-overwritten', path: 'build/out.js', sizeBefore: 16, sizeAfter: 8 },
    ]);
    expect(readFileSync(join(fixture.root, 'build/out.js'), 'utf8')).toBe('// build output\n');
    expect((await world.fingerprint()).hash).toBe(before.hash);
  }, 60_000);

  it('an absolute cwd that is the Original root maps to the Copy', async () => {
    const s0 = await world.snapshot();
    const s1 = await world.step(s0, { command: 'touch from-cwd.txt', cwd: fixture.root });
    expect(s1.result).toEqual({ success: true });
    expect(world.diff(s0, s1)).toEqual([{ kind: 'file-created', path: 'from-cwd.txt', entryType: 'file' }]);
  }, 60_000);
});

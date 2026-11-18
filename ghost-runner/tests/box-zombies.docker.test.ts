// [docker] Orphaned child processes of an action must not accumulate as zombies in the box.
// PID 1 of the box is `ghost-init` (Node), which only reaps its own children, so the box needs
// a reaping init (`docker run --init`) when an action leaves orphans.
// Validates: Requirements 5.2, 7.2
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { checkDockerAvailability } from '../src/docker/availability.js';
import { createBox, type Box } from '../src/docker/box.js';
import { createDockerClient } from '../src/docker/cli.js';
import { describeDocker } from './docker-available.js';

const client = createDockerClient();
const text = (b: Buffer): string => b.toString('utf8');

const ORPHANS = 150;
/** Each subshell exits at once; its `sleep` is re-parented to PID 1 and exits 0.2 s later. */
const SPAWN_ORPHANS = `i=0; while [ $i -lt ${String(ORPHANS)} ]; do (sleep 0.2 &) ; i=$((i+1)); done; sleep 1`;
const COUNT_ZOMBIES = "grep -l '^State:[[:space:]]*Z' /proc/[0-9]*/status 2>/dev/null | wc -l";

describeDocker('orphaned processes in the box', () => {
  let dir = '';
  let box: Box | undefined;

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'ghost-zombie-')));
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    const avail = await checkDockerAvailability(client, { limitMs: 10_000 });
    if (!avail.available) throw new Error(`box image unavailable: ${avail.reason}`);
    const created = await createBox(client, {
      runId: `zombie-${randomUUID()}`,
      image: avail.imageRef,
      imageEnv: avail.imageEnv,
      mounts: { copyDir: dir },
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
      execLimitMs: 25_000,
      deadlineAt: Date.now() + 55_000,
    });
    if (!created.ok) throw new Error(`box not created: ${JSON.stringify(created)}`);
    box = created.box;
  }, 60_000);

  afterAll(async () => {
    if (box !== undefined) await box.cleanup();
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('leaves no zombie processes after an action that orphans many short-lived children', async () => {
    const out = await box?.exec(0, SPAWN_ORPHANS);
    expect(out?.kind).toBe('exited');
    await new Promise((r) => setTimeout(r, 500)); // let the last orphans exit
    const res = await client.run(['exec', box?.containerId ?? '', 'sh', '-c', COUNT_ZOMBIES]);
    const zombies = Number(text(res.stdout).trim());
    expect(Number.isInteger(zombies)).toBe(true);
    expect(zombies).toBe(0);
  }, 60_000);
});

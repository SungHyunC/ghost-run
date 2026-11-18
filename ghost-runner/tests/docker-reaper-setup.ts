// Setup for the `docker` vitest project: a test that fails, times out, or is interrupted must
// still remove the boxes and anonymous volumes it created. Vitest abandons (does not cancel) the
// body of a timed-out test, so its `finally` blocks may never run; this hook removes every box
// that was created since the test began and not confirmed removed. Boxes of earlier hooks
// (for example a shared pool created in beforeAll) are left alone until afterAll.
import { afterAll, afterEach, beforeEach } from 'vitest';
import { createDockerClient } from '../src/docker/cli.js';
import { reapRuns, trackedRunIds } from '../src/docker/reaper.js';

let before = new Set<string>();

beforeEach(() => {
  before = new Set(trackedRunIds());
});

afterEach(async () => {
  await reapRuns(createDockerClient(), trackedRunIds().filter((id) => !before.has(id)));
});

afterAll(async () => {
  await reapRuns(createDockerClient());
});

